import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/types/ipc'
import { DoorayClient } from './DoorayClient'
import type { DoorayTask, DoorayTaskDetail, DoorayTaskComment, DoorayTaskUpdateParams, DoorayProject } from '../../shared/types/dooray'

interface DoorayListResponse<T> {
  header: { resultCode: number; isSuccessful: boolean }
  result: T[]
  totalCount: number
}

interface DoorayItemResponse<T> {
  header: { resultCode: number; isSuccessful: boolean }
  result: T
}

interface Member {
  id: string
  name: string
}

interface TagInfo { id: string; name: string; color?: string }

export class TaskService {
  private projectCache: Map<string, DoorayProject> = new Map()
  private projectListCache: { data: DoorayProject[]; timestamp: number } | null = null
  private tagCache: Map<string, Map<string, { name: string; color: string }>> = new Map()
  private taskCache: Map<string, { tasks: DoorayTask[]; timestamp: number }> = new Map()
  private memberNameCache: Map<string, string> = new Map()
  private myMemberId: string | null = null
  private mainWindow: BrowserWindow | null = null
  private static CACHE_TTL = 3 * 60 * 1000 // 3분
  private static PROJECT_LIST_TTL = 10 * 60 * 1000 // 10분

  /** 동시 API 호출 개수 제한 (두레이 Rate Limiter 보호) */
  private static MAX_CONCURRENT = 4
  /** in-flight listMyTasks promise dedupe (같은 key로 동시 요청 시 한 번만 실행) */
  private inFlightListMyTasks: Map<string, Promise<DoorayTask[]>> = new Map()

  constructor(private client: DoorayClient) {}

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  /** 점진 로딩: 프로젝트별 태스크 일부가 도착했을 때 UI에 전달 */
  private emitPartial(projectId: string, tasks: DoorayTask[], done: boolean): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.webContents.send(IPC_CHANNELS.DOORAY_TASKS_PARTIAL, { projectId, tasks, done })
  }

  private async getMyMemberId(): Promise<string> {
    if (!this.myMemberId) {
      const res = await this.client.request<DoorayItemResponse<Member>>(
        '/common/v1/members/me'
      )
      this.myMemberId = res.result.id
    }
    return this.myMemberId
  }

  /** 수동 추가 프로젝트 ID 목록 (외부에서 주입) */
  private customProjectIds: string[] = []
  setCustomProjectIds(ids: string[]): void {
    this.customProjectIds = Array.from(new Set(ids))
    this.projectListCache = null // 목록 캐시 무효화
  }

  async listMyProjects(): Promise<DoorayProject[]> {
    if (this.projectListCache && Date.now() - this.projectListCache.timestamp < TaskService.PROJECT_LIST_TTL) {
      return this.projectListCache.data
    }
    const t0 = Date.now()
    // 비공개 프로젝트 + 내가 멤버인 공개 프로젝트 병렬 조회
    const [privateRes, publicRes] = await Promise.all([
      this.client.request<DoorayListResponse<DoorayProject>>(
        '/project/v1/projects?member=me&size=100'
      ),
      this.client.request<DoorayListResponse<DoorayProject>>(
        '/project/v1/projects?type=public&size=100'
      ).catch(() => ({ header: { resultCode: 0, isSuccessful: false }, result: [] as DoorayProject[], totalCount: 0 }))
    ])

    const seen = new Set<string>()
    const projects: DoorayProject[] = []
    for (const p of [...(privateRes.result || []), ...(publicRes.result || [])]) {
      if (!seen.has(p.id)) {
        seen.add(p.id)
        projects.push(p)
        this.projectCache.set(p.id, p)
      }
    }

    // 수동 추가 프로젝트 — 자동 조회에 안 잡히는 것만 개별 API로 받아서 isCustom 플래그 부여
    const missingCustom = this.customProjectIds.filter((id) => !seen.has(id))
    if (missingCustom.length > 0) {
      const customProjects = await Promise.all(
        missingCustom.map((id) =>
          this.getProjectInfo(id)
            .then((p) => ({ ...p, isCustom: true }))
            .catch(() => null)
        )
      )
      for (const p of customProjects) {
        if (p && !seen.has(p.id)) {
          seen.add(p.id)
          projects.push(p)
          this.projectCache.set(p.id, p)
        }
      }
    }
    // 이미 자동 조회된 프로젝트도 수동 추가 목록에 있으면 isCustom 마크
    for (const p of projects) {
      if (this.customProjectIds.includes(p.id)) p.isCustom = true
    }

    console.log(`[Projects] list: ${Date.now() - t0}ms`)
    this.projectListCache = { data: projects, timestamp: Date.now() }
    return projects
  }

  async getProjectInfo(projectId: string): Promise<DoorayProject> {
    const cached = this.projectCache.get(projectId)
    if (cached) return cached
    const res = await this.client.request<DoorayItemResponse<DoorayProject>>(
      `/project/v1/projects/${projectId}`
    )
    const project = res.result
    this.projectCache.set(project.id, project)
    return project
  }

  // 단일 프로젝트의 내 담당 태스크 전체 로드 (페이지네이션)
  // 프로젝트 태그 이름 캐시 로드
  private async loadTagInfo(projectId: string): Promise<Map<string, { name: string; color: string }>> {
    if (this.tagCache.has(projectId)) return this.tagCache.get(projectId)!
    try {
      const res = await this.client.request<DoorayListResponse<TagInfo>>(
        `/project/v1/projects/${projectId}/tags?size=100`
      )
      const map = new Map<string, { name: string; color: string }>()
      for (const tag of res.result || []) {
        map.set(tag.id, { name: tag.name, color: tag.color || 'ffffff' })
      }
      this.tagCache.set(projectId, map)
      return map
    } catch {
      return new Map()
    }
  }

  private async fetchTasksForProject(projectId: string, memberId: string, skipCache = false): Promise<DoorayTask[]> {
    // 캐시 확인
    const cached = this.taskCache.get(projectId)
    if (!skipCache && cached && Date.now() - cached.timestamp < TaskService.CACHE_TTL) {
      // 캐시 히트도 partial emit (UI가 일관되게 이벤트 기반으로 동작)
      this.emitPartial(projectId, cached.tasks, true)
      return cached.tasks
    }

    const size = 100
    // 페이지를 2로 줄여 전체 호출 수 대폭 감소 (200개 이내는 대부분 1-2페이지로 충분)
    const MAX_PAGES = 2
    const project = this.projectCache.get(projectId)
    const tStart = Date.now()

    // 태그 정보 로드 + 첫 페이지 동시 호출 (병렬)
    const [tagInfo, firstRes] = await Promise.all([
      this.loadTagInfo(projectId),
      this.client.request<DoorayListResponse<DoorayTask>>(
        `/project/v1/projects/${projectId}/posts?toMemberIds=${memberId}&size=${size}&page=0&order=-createdAt`
      ).catch(() => ({ header: { resultCode: 0, isSuccessful: false }, result: [], totalCount: 0 }))
    ])
    const tFirst = Date.now()
    console.log(`[Tasks] ${projectId.slice(-4)} firstPage+tags: ${tFirst - tStart}ms`)

    const firstPageTasks = firstRes.result || []
    const totalCount = firstRes.totalCount || firstPageTasks.length

    const enrichTask = (task: DoorayTask): void => {
      task.projectId = projectId
      task.projectCode = project?.code
      if (task.tags) {
        for (const tag of task.tags) {
          const info = tagInfo.get(tag.id)
          if (info) {
            if (!tag.name) tag.name = info.name
            ;(tag as Record<string, unknown>).color = info.color
          }
        }
      }
    }

    // 첫 페이지 enrich 후 바로 UI로 partial emit (체감 속도 개선)
    for (const task of firstPageTasks) enrichTask(task)
    const totalPages = Math.min(MAX_PAGES, Math.ceil(totalCount / size))
    const hasMore = totalPages > 1
    this.emitPartial(projectId, firstPageTasks, !hasMore)

    // 나머지 페이지를 병렬로 호출
    const remainingPages: number[] = []
    for (let p = 1; p < totalPages; p++) remainingPages.push(p)

    const remainingResults = await Promise.all(
      remainingPages.map((page) =>
        this.client.request<DoorayListResponse<DoorayTask>>(
          `/project/v1/projects/${projectId}/posts?toMemberIds=${memberId}&size=${size}&page=${page}&order=-createdAt`
        ).catch(() => ({ header: { resultCode: 0, isSuccessful: false }, result: [], totalCount: 0 }))
      )
    )
    const tAll = Date.now()
    console.log(`[Tasks] ${projectId.slice(-4)} remaining ${remainingPages.length}pages parallel: ${tAll - tFirst}ms (total ${tAll - tStart}ms, ${totalCount}개)`)

    // 모든 페이지 합치기 (첫 페이지 + 나머지)
    const allTasks: DoorayTask[] = [...firstPageTasks]
    for (const res of remainingResults) {
      for (const task of res.result || []) {
        enrichTask(task)
        allTasks.push(task)
      }
    }

    // 전체 완료 후 최종 partial emit (done=true)
    if (hasMore) this.emitPartial(projectId, allTasks, true)

    // 캐시 저장
    this.taskCache.set(projectId, { tasks: allTasks, timestamp: Date.now() })
    return allTasks
  }

  async listMyTasks(projectIds?: string[]): Promise<DoorayTask[]> {
    // in-flight dedupe: 대시보드/다른 탭이 동시에 호출해도 실제 요청은 한 번만
    const key = projectIds?.join(',') || '__ALL__'
    const existing = this.inFlightListMyTasks.get(key)
    if (existing) return existing

    const promise = this.runListMyTasks(projectIds).finally(() => {
      this.inFlightListMyTasks.delete(key)
    })
    this.inFlightListMyTasks.set(key, promise)
    return promise
  }

  private async runListMyTasks(projectIds?: string[]): Promise<DoorayTask[]> {
    const memberId = await this.getMyMemberId()

    let ids: string[]
    if (projectIds && projectIds.length > 0) {
      ids = projectIds
    } else {
      const projects = await this.listMyProjects()
      ids = projects.map((p) => p.id)
    }

    const allTasks: DoorayTask[] = []
    const seen = new Set<string>()

    // 동시 요청을 MAX_CONCURRENT 로 제한해서 두레이 Rate Limiter 보호
    const results = await mapWithConcurrency(
      ids.slice(0, 20),
      TaskService.MAX_CONCURRENT,
      (projectId) => this.fetchTasksForProject(projectId, memberId)
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const task of result.value) {
          if (!seen.has(task.id)) {
            seen.add(task.id)
            allTasks.push(task)
          }
        }
      }
    }

    // 정렬: 진행중 → 등록 → 완료 → 닫힘, 각 그룹 내 최신순
    const ORDER: Record<string, number> = { working: 0, registered: 1, done: 2, closed: 3 }
    return allTasks.sort((a, b) => {
      const oa = ORDER[a.workflowClass] ?? 1
      const ob = ORDER[b.workflowClass] ?? 1
      if (oa !== ob) return oa - ob
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    })
  }

  // 내가 CC(참조/멘션)된 태스크 조회
  async listMyCcTasks(projectIds?: string[]): Promise<DoorayTask[]> {
    const memberId = await this.getMyMemberId()
    let ids: string[]
    if (projectIds && projectIds.length > 0) {
      ids = projectIds
    } else {
      const projects = await this.listMyProjects()
      ids = projects.map((p) => p.id)
    }

    const allTasks: DoorayTask[] = []
    const seen = new Set<string>()

    const results = await mapWithConcurrency(
      ids.slice(0, 20),
      TaskService.MAX_CONCURRENT,
      async (projectId) => {
        try {
          const res = await this.client.request<DoorayListResponse<DoorayTask>>(
            `/project/v1/projects/${projectId}/posts?ccMemberIds=${memberId}&postWorkflowClasses=registered,working&size=50&page=0&order=-createdAt`
          )
          const project = this.projectCache.get(projectId)
          return (res.result || []).map((t) => { t.projectId = projectId; t.projectCode = project?.code; return t })
        } catch { return [] }
      }
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const task of result.value) {
          if (!seen.has(task.id)) { seen.add(task.id); allTasks.push(task) }
        }
      }
    }

    return allTasks.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
  }

  // 오늘 마감 태스크 (전체 프로젝트)
  async listDueTodayTasks(): Promise<DoorayTask[]> {
    const memberId = await this.getMyMemberId()
    const projects = await this.listMyProjects()
    const allTasks: DoorayTask[] = []
    const results = await mapWithConcurrency(
      projects.slice(0, 20),
      TaskService.MAX_CONCURRENT,
      async (p) => {
        try {
          const res = await this.client.request<DoorayListResponse<DoorayTask>>(
            `/project/v1/projects/${p.id}/posts?toMemberIds=${memberId}&dueAt=today&postWorkflowClasses=registered,working&size=50`
          )
          return (res.result || []).map((t) => { t.projectId = p.id; t.projectCode = p.code; return t })
        } catch { return [] }
      }
    )
    for (const r of results) { if (r.status === 'fulfilled') allTasks.push(...r.value) }
    return allTasks
  }

  // 이번주 마감 태스크
  async listDueThisWeekTasks(): Promise<DoorayTask[]> {
    const memberId = await this.getMyMemberId()
    const projects = await this.listMyProjects()
    const allTasks: DoorayTask[] = []
    const results = await mapWithConcurrency(
      projects.slice(0, 20),
      TaskService.MAX_CONCURRENT,
      async (p) => {
        try {
          const res = await this.client.request<DoorayListResponse<DoorayTask>>(
            `/project/v1/projects/${p.id}/posts?toMemberIds=${memberId}&dueAt=thisweek&postWorkflowClasses=registered,working&size=50`
          )
          return (res.result || []).map((t) => { t.projectId = p.id; t.projectCode = p.code; return t })
        } catch { return [] }
      }
    )
    for (const r of results) { if (r.status === 'fulfilled') allTasks.push(...r.value) }
    return allTasks
  }

  async getTaskDetail(projectId: string, taskId: string): Promise<DoorayTaskDetail> {
    const res = await this.client.request<DoorayItemResponse<DoorayTaskDetail>>(
      `/project/v1/projects/${projectId}/posts/${taskId}`
    )
    const detail = res.result
    detail.projectId = projectId
    detail.projectCode = this.projectCache.get(projectId)?.code
    return detail
  }

  private async getMemberName(memberId: string): Promise<string> {
    if (this.memberNameCache.has(memberId)) return this.memberNameCache.get(memberId)!
    try {
      const res = await this.client.request<{ result: { name: string } }>(
        `/common/v1/members/${memberId}`
      )
      this.memberNameCache.set(memberId, res.result.name)
      return res.result.name
    } catch {
      return ''
    }
  }

  async getTaskComments(projectId: string, taskId: string): Promise<DoorayTaskComment[]> {
    try {
      const res = await this.client.request<DoorayListResponse<Record<string, unknown>>>(
        `/project/v1/projects/${projectId}/posts/${taskId}/logs?page=0&size=100&order=createdAt`
      )
      const raw = res.result || []

      // 멤버 ID 수집 후 일괄 이름 조회
      const memberIds = new Set<string>()
      for (const c of raw) {
        const creator = c.creator as Record<string, unknown> | undefined
        const member = creator?.member as Record<string, unknown> | undefined
        const orgMemberId = String(member?.organizationMemberId || member?.id || '')
        if (orgMemberId) memberIds.add(orgMemberId)
      }
      await Promise.allSettled(Array.from(memberIds).map((id) => this.getMemberName(id)))

      // 정규화 + 필터
      const comments: DoorayTaskComment[] = []
      for (const c of raw) {
        const creator = c.creator as Record<string, unknown> | undefined
        const creatorType = String(creator?.type || '')

        // member 타입만 (system, bot, github webhook 등 제외)
        if (creatorType !== 'member') continue
        // subtype이 github 등이면 제외
        const subtype = String(c.subtype || '')
        if (subtype.includes('github') || subtype.includes('webhook')) continue

        const member = creator?.member as Record<string, unknown> | undefined
        const orgMemberId = String(member?.organizationMemberId || member?.id || '')
        const memberName = this.memberNameCache.get(orgMemberId) || ''

        // 이름에 bot/github가 포함되면 제외
        if (memberName.toLowerCase().includes('github') || memberName.toLowerCase().includes('bot')) continue

        comments.push({
          id: String(c.id || ''),
          body: c.body as DoorayTaskComment['body'],
          createdAt: String(c.createdAt || ''),
          creator: {
            type: creatorType,
            member: { id: orgMemberId, name: memberName }
          }
        })
      }

      return comments
    } catch {
      return []
    }
  }

  async updateTaskStatus(params: DoorayTaskUpdateParams): Promise<void> {
    await this.client.request(
      `/project/v1/projects/${params.projectId}/posts/${params.postId}/set-workflow`,
      {
        method: 'PUT',
        body: JSON.stringify({ workflowId: params.status })
      }
    )
  }

  /** 프로젝트 태스크 템플릿 목록 조회.
   * Dooray 정식 엔드포인트는 /project/v1/projects/{id}/templates.
   * 일부 조직/버전에서 다를 수 있어 fallback 유지. */
  async listProjectTemplates(projectId: string): Promise<Array<{ id: string; name: string }>> {
    const endpoints = [
      `/project/v1/projects/${projectId}/templates?size=100`,
      `/project/v1/projects/${projectId}/post-templates?size=100`,
      `/project/v1/projects/${projectId}/posts/templates?size=100`
    ]
    let lastError: unknown = null
    for (const path of endpoints) {
      try {
        const res = await this.client.request<DoorayListResponse<{ id: string; name?: string; subject?: string; title?: string }>>(path)
        const list = (res.result || []).map((t) => ({ id: t.id, name: t.name || t.subject || t.title || '(이름 없음)' }))
        console.log(`[TaskService] templates OK via ${path}: ${list.length}개`)
        return list
      } catch (err) {
        lastError = err
        console.warn(`[TaskService] templates ${path} 실패:`, err instanceof Error ? err.message : err)
      }
    }
    console.error('[TaskService] 모든 템플릿 엔드포인트 실패. 마지막 오류:', lastError)
    throw lastError instanceof Error ? lastError : new Error('프로젝트 템플릿을 불러올 수 없습니다')
  }

  /** 프로젝트 태스크 템플릿 상세 (제목/본문) */
  async getProjectTemplate(projectId: string, templateId: string): Promise<{ id: string; name: string; subject: string; body: string } | null> {
    const endpoints = [
      `/project/v1/projects/${projectId}/templates/${templateId}`,
      `/project/v1/projects/${projectId}/post-templates/${templateId}`,
      `/project/v1/projects/${projectId}/posts/templates/${templateId}`
    ]
    for (const path of endpoints) {
      try {
        const res = await this.client.request<DoorayItemResponse<{
          id: string
          name?: string
          subject?: string
          title?: string
          body?: { mimeType?: string; content?: string } | string
        }>>(path)
        const t = res.result
        const body = typeof t.body === 'string' ? t.body : (t.body?.content || '')
        return { id: t.id, name: t.name || t.subject || t.title || '', subject: t.subject || t.title || '', body }
      } catch { /* try next */ }
    }
    return null
  }

  /** 태스크(커뮤니티 게시글) 생성 */
  async createTask(params: {
    projectId: string
    subject: string
    body: string
    assigneeIds?: string[] // 기본: 자기 자신
  }): Promise<{ id: string }> {
    const myId = await this.getMyMemberId()
    const to = (params.assigneeIds && params.assigneeIds.length > 0
      ? params.assigneeIds
      : [myId]
    ).map((id) => ({ type: 'member' as const, member: { organizationMemberId: id } }))

    const res = await this.client.request<DoorayItemResponse<{ id: string }>>(
      `/project/v1/projects/${params.projectId}/posts`,
      {
        method: 'POST',
        body: JSON.stringify({
          subject: params.subject,
          body: { mimeType: 'text/x-markdown', content: params.body },
          dueDateFlag: false,
          users: { to, cc: [] }
        })
      }
    )
    return { id: res.result.id }
  }

  /** 태스크 댓글 생성 (커뮤니티 댓글) */
  async createTaskComment(params: {
    projectId: string
    postId: string
    content: string
  }): Promise<{ id: string }> {
    const res = await this.client.request<DoorayItemResponse<{ id: string }>>(
      `/project/v1/projects/${params.projectId}/posts/${params.postId}/logs`,
      {
        method: 'POST',
        body: JSON.stringify({
          body: { mimeType: 'text/x-markdown', content: params.content }
        })
      }
    )
    return { id: res.result.id }
  }

  /** 태스크에 파일 업로드 (이미지 등) */
  async uploadFileToTask(params: {
    projectId: string
    postId: string
    filename: string
    mime: string
    data: ArrayBuffer
  }): Promise<{ id: string }> {
    return this.client.uploadFile(params)
  }

  /** 태스크 본문(제목+body)만 업데이트 — 이미지 업로드 후 링크 치환에 사용 */
  async updateTaskBody(params: {
    projectId: string
    postId: string
    subject: string
    body: string
  }): Promise<void> {
    await this.client.request(
      `/project/v1/projects/${params.projectId}/posts/${params.postId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          subject: params.subject,
          body: { mimeType: 'text/x-markdown', content: params.body }
        })
      }
    )
  }

  /** 댓글 본문 수정 */
  async updateTaskComment(params: {
    projectId: string
    postId: string
    logId: string
    content: string
  }): Promise<void> {
    await this.client.request(
      `/project/v1/projects/${params.projectId}/posts/${params.postId}/logs/${params.logId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          body: { mimeType: 'text/x-markdown', content: params.content }
        })
      }
    )
  }

  /**
   * 커뮤니티용 공개 프로젝트 태스크 리스트 조회.
   * 내 담당만 필터하지 않고 전체 조회.
   */
  async listCommunityPosts(projectId: string, page = 0, size = 50): Promise<{
    posts: DoorayTask[]
    totalCount: number
  }> {
    const project = this.projectCache.get(projectId)
    const res = await this.client.request<DoorayListResponse<DoorayTask>>(
      `/project/v1/projects/${projectId}/posts?size=${size}&page=${page}&order=-createdAt`
    ).catch(() => ({ header: { resultCode: 0, isSuccessful: false }, result: [] as DoorayTask[], totalCount: 0 }))

    const posts = (res.result || []).map((t) => {
      t.projectId = projectId
      t.projectCode = project?.code
      return t
    })
    return { posts, totalCount: res.totalCount || posts.length }
  }
}

/** 동시 실행 수를 제한하는 Promise.allSettled.
 * Rate limiter 보호용 — 전체 결과는 순서 보존. */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let nextIdx = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = nextIdx++
      if (i >= items.length) return
      try {
        const value = await fn(items[i], i)
        results[i] = { status: 'fulfilled', value }
      } catch (err) {
        results[i] = { status: 'rejected', reason: err }
      }
    }
  })
  await Promise.all(workers)
  return results
}
