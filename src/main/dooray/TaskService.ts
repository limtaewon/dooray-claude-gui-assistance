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
  private static CACHE_TTL = 3 * 60 * 1000 // 3분
  private static PROJECT_LIST_TTL = 10 * 60 * 1000 // 10분

  constructor(private client: DoorayClient) {}

  private async getMyMemberId(): Promise<string> {
    if (!this.myMemberId) {
      const res = await this.client.request<DoorayItemResponse<Member>>(
        '/common/v1/members/me'
      )
      this.myMemberId = res.result.id
    }
    return this.myMemberId
  }

  async listMyProjects(): Promise<DoorayProject[]> {
    if (this.projectListCache && Date.now() - this.projectListCache.timestamp < TaskService.PROJECT_LIST_TTL) {
      return this.projectListCache.data
    }
    // 비공개 프로젝트 + 내가 멤버인 공개 프로젝트 병렬 조회
    const [privateRes, publicRes] = await Promise.all([
      this.client.request<DoorayListResponse<DoorayProject>>(
        '/project/v1/projects?member=me&size=100'
      ),
      this.client.request<DoorayListResponse<DoorayProject>>(
        '/project/v1/projects?type=public&scope=private&size=100'
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
      return cached.tasks
    }

    const size = 100
    const MAX_PAGES = 5
    const project = this.projectCache.get(projectId)

    // 태그 정보 로드 + 첫 페이지 동시 호출 (병렬)
    const [tagInfo, firstRes] = await Promise.all([
      this.loadTagInfo(projectId),
      this.client.request<DoorayListResponse<DoorayTask>>(
        `/project/v1/projects/${projectId}/posts?toMemberIds=${memberId}&size=${size}&page=0&order=-createdAt`
      ).catch(() => ({ header: { resultCode: 0, isSuccessful: false }, result: [], totalCount: 0 }))
    ])

    const firstPageTasks = firstRes.result || []
    const totalCount = firstRes.totalCount || firstPageTasks.length

    // 나머지 페이지를 병렬로 호출
    const totalPages = Math.min(MAX_PAGES, Math.ceil(totalCount / size))
    const remainingPages: number[] = []
    for (let p = 1; p < totalPages; p++) remainingPages.push(p)

    const remainingResults = await Promise.all(
      remainingPages.map((page) =>
        this.client.request<DoorayListResponse<DoorayTask>>(
          `/project/v1/projects/${projectId}/posts?toMemberIds=${memberId}&size=${size}&page=${page}&order=-createdAt`
        ).catch(() => ({ header: { resultCode: 0, isSuccessful: false }, result: [], totalCount: 0 }))
      )
    )

    // 모든 페이지 합치기
    const allTasks: DoorayTask[] = []
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
      allTasks.push(task)
    }

    for (const task of firstPageTasks) enrichTask(task)
    for (const res of remainingResults) {
      for (const task of res.result || []) enrichTask(task)
    }

    // 캐시 저장
    this.taskCache.set(projectId, { tasks: allTasks, timestamp: Date.now() })
    return allTasks
  }

  async listMyTasks(projectIds?: string[]): Promise<DoorayTask[]> {
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

    // 병렬 조회 (최대 20개 프로젝트)
    const results = await Promise.allSettled(
      ids.slice(0, 20).map((projectId) =>
        this.fetchTasksForProject(projectId, memberId)
      )
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

    const results = await Promise.allSettled(
      ids.slice(0, 20).map(async (projectId) => {
        try {
          const res = await this.client.request<DoorayListResponse<DoorayTask>>(
            `/project/v1/projects/${projectId}/posts?ccMemberIds=${memberId}&postWorkflowClasses=registered,working&size=50&page=0&order=-createdAt`
          )
          const project = this.projectCache.get(projectId)
          return (res.result || []).map((t) => { t.projectId = projectId; t.projectCode = project?.code; return t })
        } catch { return [] }
      })
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
    const results = await Promise.allSettled(
      projects.slice(0, 20).map(async (p) => {
        try {
          const res = await this.client.request<DoorayListResponse<DoorayTask>>(
            `/project/v1/projects/${p.id}/posts?toMemberIds=${memberId}&dueAt=today&postWorkflowClasses=registered,working&size=50`
          )
          return (res.result || []).map((t) => { t.projectId = p.id; t.projectCode = p.code; return t })
        } catch { return [] }
      })
    )
    for (const r of results) { if (r.status === 'fulfilled') allTasks.push(...r.value) }
    return allTasks
  }

  // 이번주 마감 태스크
  async listDueThisWeekTasks(): Promise<DoorayTask[]> {
    const memberId = await this.getMyMemberId()
    const projects = await this.listMyProjects()
    const allTasks: DoorayTask[] = []
    const results = await Promise.allSettled(
      projects.slice(0, 20).map(async (p) => {
        try {
          const res = await this.client.request<DoorayListResponse<DoorayTask>>(
            `/project/v1/projects/${p.id}/posts?toMemberIds=${memberId}&dueAt=thisweek&postWorkflowClasses=registered,working&size=50`
          )
          return (res.result || []).map((t) => { t.projectId = p.id; t.projectCode = p.code; return t })
        } catch { return [] }
      })
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
}
