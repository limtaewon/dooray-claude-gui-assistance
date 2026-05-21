import { WikiService } from './WikiService'

/** 두레이 API 는 body 를 string 또는 { mimeType, content } 객체 양쪽으로 줌 — 둘 다 처리. */
function extractBodyText(body: unknown): string {
  if (!body) return ''
  if (typeof body === 'string') return body
  if (typeof body === 'object' && body !== null) {
    const o = body as { content?: unknown }
    if (typeof o.content === 'string') return o.content
  }
  return ''
}

export type WikiStorageKind = 'skills' | 'mcps'

interface WikiStorageItem {
  pageId: string
  name: string
  content: string
  updatedAt: number
}

export interface ContainerStore {
  get(key: string): string | undefined
  set(key: string, value: string): void
  delete(key: string): void
}

/**
 * 사용자가 두레이 위키 URL 을 등록하면, 해당 위키 root 하위 (level 2) 에 컨테이너를 만들고
 * 그 안에 스킬/MCP 정의 페이지를 둔다.
 *
 * 구조:
 *   <wiki root (level 1, 위키와 같은 이름)>
 *     └─ "Clauday Skills" / "Clauday MCPs"  ← 자동 생성, level 2
 *          └─ 각 스킬/MCP 페이지 (level 3)
 */
export class WikiStorageService {
  private static CONTAINER_TITLE: Record<WikiStorageKind, string> = {
    skills: 'Clauday Skills',
    mcps: 'Clauday MCPs'
  }

  constructor(private wiki: WikiService, private store: ContainerStore) {}

  private storeKey(wikiId: string, kind: WikiStorageKind): string {
    return `wikiStorageContainer:${kind}:${wikiId}`
  }

  /**
   * 두레이 위키 URL → wikiId + wikiName + (URL 에 page id 가 있으면) parentPageId.
   *
   * Why: Dooray 의 위키 root page id 자동 탐색이 부정확해서 (getDetail 응답에 home id 없음 +
   * wikiId-as-parent 도 404), 사용자가 붙여 넣은 URL 에 page id 가 같이 있으면 그걸 컨테이너의
   * 부모로 활용해서 첫 업로드부터 동작하게 한다. 사용자 입장에선 그냥 URL 만 붙여넣으면 됨.
   */
  async resolveWikiId(input: string): Promise<{ wikiId: string; wikiName: string; parentPageId?: string }> {
    const text = (input || '').trim()
    if (!text) throw new Error('URL 또는 wikiId 를 입력하세요')

    let wikiId = ''
    let parentPageId: string | undefined
    const pairMatch = text.match(/wiki\/(\d{6,})\/(\d{6,})/)
    if (pairMatch) {
      wikiId = pairMatch[1]
      parentPageId = pairMatch[2]
    } else {
      const urlMatch = text.match(/wiki\/(\d{6,})/)
      if (urlMatch) {
        wikiId = urlMatch[1]
      } else if (/^\d{6,}$/.test(text)) {
        wikiId = text
      } else {
        throw new Error('인식할 수 없는 형식 — 두레이 위키 URL 또는 wikiId 를 입력해 주세요')
      }
    }

    let wikiName = ''
    try {
      const detail = await this.wiki.getDetail(wikiId)
      const v = detail['name'] ?? detail['subject']
      if (typeof v === 'string') wikiName = v
    } catch (err) {
      throw new Error(`해당 위키에 접근하지 못했습니다: ${err instanceof Error ? err.message : String(err)}`)
    }

    return parentPageId ? { wikiId, wikiName, parentPageId } : { wikiId, wikiName }
  }

  /**
   * 위키 root (level 1) 페이지 ID 탐색.
   * `GET /wiki/v1/wikis/{wikiId}/pages` 를 query param 없이 호출하면 top-level("Home") 이 반환된다.
   * Dooray API quirk: parentPageId 없이 size/page 만 붙이면 400 이 떨어짐 — 그래서 query 를 통째로 비워야 함.
   */
  private async findRootPageId(wikiId: string): Promise<string | null> {
    try {
      const top = await this.wiki.getTopLevelPages(wikiId)
      if (top.length === 0) return null
      return top[0].id
    } catch {
      return null
    }
  }

  /** 컨테이너 ID 만 조회 — 없으면 null. parentPageIdHint 가 있으면 자동 탐색 대신 그걸 root 로 사용. */
  private async findContainerPageId(
    wikiId: string,
    kind: WikiStorageKind,
    parentPageIdHint?: string
  ): Promise<string | null> {
    const key = this.storeKey(wikiId, kind)
    const cached = this.store.get(key)
    if (cached) return cached

    const title = WikiStorageService.CONTAINER_TITLE[kind]
    const rootPageId = parentPageIdHint || (await this.findRootPageId(wikiId))
    if (!rootPageId) return null
    try {
      const siblings = await this.wiki.listSinglePage(wikiId, rootPageId, { subject: title })
      const existing = siblings.find((p) => p.subject === title && !(p.subject || '').startsWith('[DELETED]'))
      if (existing) {
        this.store.set(key, existing.id)
        return existing.id
      }
    } catch { /* ok */ }
    return null
  }

  /** 컨테이너가 없으면 root(또는 hint) 하위에 생성. */
  private async ensureContainerPageId(
    wikiId: string,
    kind: WikiStorageKind,
    parentPageIdHint?: string
  ): Promise<string> {
    const found = await this.findContainerPageId(wikiId, kind, parentPageIdHint)
    if (found) return found

    const title = WikiStorageService.CONTAINER_TITLE[kind]
    const body = kind === 'skills'
      ? '# Clauday Skills\n\nClauday 가 자동 관리하는 스킬 저장소입니다. 하위 페이지가 각 스킬 정의입니다.\n'
      : '# Clauday MCPs\n\nClauday 가 자동 관리하는 MCP 서버 정의 저장소입니다. 하위 페이지가 각 MCP 정의입니다.\n'

    const rootPageId = parentPageIdHint || (await this.findRootPageId(wikiId))
    if (!rootPageId) {
      throw new Error(
        '위키의 루트 페이지를 자동으로 찾지 못했습니다. 위키 추가 시 페이지 URL 형식 ' +
        '(https://nhnent.dooray.com/project/wiki/{wikiId}/{pageId}) 으로 다시 입력해 주세요.'
      )
    }
    const created = await this.wiki.create({ wikiId, parentPageId: rootPageId, subject: title, body })
    this.store.set(this.storeKey(wikiId, kind), created.id)
    return created.id
  }

  async list(wikiId: string, kind: WikiStorageKind, parentPageIdHint?: string): Promise<WikiStorageItem[]> {
    const containerPageId = await this.findContainerPageId(wikiId, kind, parentPageIdHint)
    if (!containerPageId) return []
    let children
    try {
      children = await this.wiki.listSinglePage(wikiId, containerPageId, { size: 100 })
    } catch {
      this.store.delete(this.storeKey(wikiId, kind))
      return []
    }
    const visible = children.filter((p) => !(p.subject || '').startsWith('[DELETED]'))

    // 두레이 위키 list 응답에 body 가 inline 으로 안 들어와 카드의 description / 모달 본문이 비는 문제.
    // 각 페이지의 body 를 wiki.get 으로 병렬 fetch 해서 채워준다. 위키 한 컨테이너의 페이지 수가 보통 < 50 이라
    // N+1 호출 부담이 크지 않음. 실패한 페이지는 빈 본문으로 두고 결과에서 제외하지는 않음.
    const bodies = await Promise.all(
      visible.map(async (p) => {
        const inline = extractBodyText(p.body)
        if (inline) return inline
        try {
          const full = await this.wiki.get(wikiId, p.id)
          return extractBodyText((full as { body?: unknown }).body)
        } catch {
          return ''
        }
      })
    )

    return visible.map((p, i) => ({
      pageId: p.id,
      name: p.subject || '',
      content: bodies[i],
      updatedAt: p.updatedAt ? new Date(p.updatedAt).getTime() : 0
    }))
  }

  async get(wikiId: string, pageId: string): Promise<{ name: string; content: string }> {
    const page = await this.wiki.get(wikiId, pageId)
    return { name: page.subject || '', content: extractBodyText((page as { body?: unknown }).body) }
  }

  async upload(params: { wikiId: string; kind: WikiStorageKind; name: string; content: string; parentPageIdHint?: string }): Promise<{ pageId: string; updated: boolean }> {
    const containerPageId = await this.ensureContainerPageId(params.wikiId, params.kind, params.parentPageIdHint)
    const children = await this.wiki.listSinglePage(params.wikiId, containerPageId, { subject: params.name })
    const existing = children.find((p) => p.subject === params.name)
    if (existing) {
      await this.wiki.update({
        projectId: params.wikiId,
        pageId: existing.id,
        title: params.name,
        body: params.content
      })
      return { pageId: existing.id, updated: true }
    }
    const created = await this.wiki.create({
      wikiId: params.wikiId,
      parentPageId: containerPageId,
      subject: params.name,
      body: params.content
    })
    return { pageId: created.id, updated: false }
  }

  /**
   * 위키 페이지 hard delete. Dooray 서버 사이드에서 작성자(또는 관리자)만 삭제 허용 — 권한 없으면 403.
   * **이전 버전의 soft-delete([DELETED] prefix) 폴백은 제거됨** (Clauday 정책: 모든 delete 는 hard delete).
   * DELETE 가 막혀있으면 에러를 그대로 노출해서 사용자가 두레이 권한/지원 여부를 직접 확인하도록 한다.
   * (메서드 이름은 backward-compat 으로 softDelete 유지 — 호출자가 많아 즉시 rename 안 함.)
   */
  async softDelete(wikiId: string, pageId: string): Promise<void> {
    try {
      await this.wiki.deletePage(wikiId, pageId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('(403)') || msg.includes('(401)')) {
        throw new Error('본인이 작성한 페이지만 삭제할 수 있습니다.')
      }
      if (msg.includes('(405)')) {
        throw new Error('이 위키는 두레이 측에서 DELETE 를 지원하지 않습니다. 두레이에서 직접 삭제해주세요.')
      }
      throw err
    }
  }
}
