import type { WikiService } from '../dooray/WikiService'
import type { SkillsManager } from '../config/SkillsManager'
import type { SharedSkill, SharedSkillUploadRequest } from '../../shared/types/shared-skills'

/** Dooray API는 body를 `{ mimeType, content }` 객체로 내려주기도, 문자열로 내려주기도 함. 둘 다 처리 */
function extractBodyText(body: unknown): string {
  if (!body) return ''
  if (typeof body === 'string') return body
  if (typeof body === 'object' && body !== null) {
    const obj = body as { content?: unknown }
    if (typeof obj.content === 'string') return obj.content
  }
  return ''
}

/**
 * Dooray 위키 하위 페이지를 저장소로 쓰는 Claude Code 스킬 공유소.
 * 각 페이지 = 1 스킬.
 * - parentPageId 바로 아래 하위 페이지로만 관리.
 * - subject = 스킬 filename (e.g. "dooray-task-scribe")
 * - body = frontmatter + markdown (SKILL.md 원본 그대로)
 *
 * Dooray 위키 API는 페이지 DELETE 엔드포인트를 제공하지 않아서,
 * 삭제 요청은 제목에 아래 prefix를 붙여 소프트 삭제 → 목록에서 필터.
 */
const DELETED_PREFIX = '[DELETED] '
type DoorayCreator = { type?: string; member?: { organizationMemberId?: string; id?: string; name?: string } }

function readCreator(p: unknown): { id?: string; name?: string } {
  const creator = (p as { creator?: DoorayCreator })?.creator
  const m = creator?.member
  return {
    id: m?.organizationMemberId || m?.id,
    name: m?.name
  }
}

export class SharedSkillsService {
  /** 공유소로 쓸 위키 id */
  private readonly wikiId: string
  /** 스킬 하위 페이지들을 매달 parent 페이지 id */
  private readonly parentPageId: string

  constructor(
    private wikiService: WikiService,
    private skillsManager: SkillsManager,
    config: { wikiId: string; parentPageId: string }
  ) {
    this.wikiId = config.wikiId
    this.parentPageId = config.parentPageId
  }

  /** 현재 사용자의 memberId를 가져오는 getter (업로드 소유 확인용) */
  private getMyMemberId?: () => Promise<string | null>
  setMyMemberIdResolver(fn: () => Promise<string | null>): void {
    this.getMyMemberId = fn
  }

  /** memberId → 이름 resolver (Dooray 위키 목록은 이름을 내려주지 않음) */
  private getMemberName?: (memberId: string) => Promise<string>
  setMemberNameResolver(fn: (memberId: string) => Promise<string>): void {
    this.getMemberName = fn
  }

  /** 공유된 스킬 목록 (본문 미포함 — 가벼운 메타만, 소프트 삭제된 항목 제외) */
  async list(): Promise<SharedSkill[]> {
    const pagesAll = await this.wikiService.list(this.wikiId, this.parentPageId)
    const pages = pagesAll.filter((p) => !(p.subject || p.title || '').startsWith(DELETED_PREFIX))
    const myId = this.getMyMemberId ? await this.getMyMemberId().catch(() => null) : null

    // inline name이 이미 있으면 바로 사용; 없을 때만 member API로 resolve
    const missingIds = Array.from(new Set(
      pages
        .map(readCreator)
        .filter((c) => !c.name && c.id)
        .map((c) => c.id!)
    ))
    const nameMap = new Map<string, string>()
    if (this.getMemberName && missingIds.length > 0) {
      const resolver = this.getMemberName
      await Promise.all(missingIds.map(async (id) => {
        const name = await resolver(id).catch(() => '')
        if (name) nameMap.set(id, name)
      }))
    }

    return pages.map((p) => {
      const subject = p.subject || p.title || 'untitled'
      const filename = subject.replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 64) || `skill-${p.id}`
      const { id: creatorId, name: inlineName } = readCreator(p)
      const creatorName = inlineName || (creatorId ? nameMap.get(creatorId) : '') || '알 수 없음'
      return {
        postId: p.id,
        filename,
        name: subject,
        content: '',
        authorName: creatorName,
        authorId: creatorId,
        createdAt: p.createdAt || '',
        updatedAt: p.updatedAt || '',
        isMine: !!(myId && creatorId && myId === creatorId)
      } as SharedSkill
    })
  }

  /** 특정 공유 스킬의 본문 */
  async get(postId: string): Promise<SharedSkill> {
    const p = await this.wikiService.get(this.wikiId, postId)
    const subject = p.subject || p.title || 'untitled'
    const filename = subject.replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 64) || `skill-${postId}`
    const { id: creatorId, name: inlineName } = readCreator(p)
    const resolvedName = !inlineName && creatorId && this.getMemberName
      ? await this.getMemberName(creatorId).catch(() => '')
      : ''
    const creatorName = inlineName || resolvedName || '알 수 없음'
    const myId = this.getMyMemberId ? await this.getMyMemberId().catch(() => null) : null
    return {
      postId: p.id,
      filename,
      name: subject,
      content: extractBodyText(p.body),
      authorName: creatorName,
      authorId: creatorId,
      createdAt: p.createdAt || '',
      updatedAt: p.updatedAt || '',
      isMine: !!(myId && creatorId && myId === creatorId)
    }
  }

  /** 내 스킬을 공유소에 업로드 → 새 위키 하위 페이지 생성 */
  async upload(req: SharedSkillUploadRequest): Promise<{ postId: string }> {
    const subject = req.name || req.filename
    const { id } = await this.wikiService.create({
      wikiId: this.wikiId,
      parentPageId: this.parentPageId,
      subject,
      body: req.content
    })
    return { postId: id }
  }

  /** 공유 스킬을 내 Claude Code 설정에 저장 (~/.claude/skills/{filename}/SKILL.md) */
  async download(postId: string): Promise<{ filename: string }> {
    const shared = await this.get(postId)
    await this.skillsManager.save({ filename: shared.filename, content: shared.content })
    return { filename: shared.filename }
  }

  /**
   * 공유 스킬 삭제.
   * Dooray 위키 API는 DELETE를 지원하지 않아서 제목에 [DELETED] prefix를 붙여 소프트 삭제.
   * 목록 조회 시 해당 prefix 항목은 필터링됨.
   */
  async delete(postId: string): Promise<void> {
    const page = await this.wikiService.get(this.wikiId, postId)
    const currentSubject = page.subject || page.title || 'untitled'
    if (currentSubject.startsWith(DELETED_PREFIX)) return // 이미 삭제됨
    await this.wikiService.renameTitle(this.wikiId, postId, `${DELETED_PREFIX}${currentSubject}`)
  }
}
