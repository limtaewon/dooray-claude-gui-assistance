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
  private tagCache: Map<string, Map<string, { name: string; color: string }>> = new Map()
  private taskCache: Map<string, { tasks: DoorayTask[]; timestamp: number }> = new Map()
  private memberNameCache: Map<string, string> = new Map()
  private myMemberId: string | null = null
  private static CACHE_TTL = 3 * 60 * 1000 // 3분

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
    // 비공개 프로젝트 + 내가 멤버인 공개 프로젝트를 병렬 조회
    const [privateRes, publicRes] = await Promise.all([
      this.client.request<DoorayListResponse<DoorayProject>>(
        '/project/v1/projects?member=me&size=100'
      ),
      this.client.request<DoorayListResponse<DoorayProject>>(
        '/project/v1/projects?type=public&scope=private&size=100'
      ).catch(() => ({ result: [] as DoorayProject[] }))
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
    return projects
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

    const allTasks: DoorayTask[] = []
    let page = 0
    const size = 100

    const tagInfo = await this.loadTagInfo(projectId)

    while (true) {
      try {
        const res = await this.client.request<DoorayListResponse<DoorayTask>>(
          `/project/v1/projects/${projectId}/posts?toMemberIds=${memberId}&size=${size}&page=${page}&order=-createdAt`
        )
        const tasks = res.result || []
        const project = this.projectCache.get(projectId)

        for (const task of tasks) {
          task.projectId = projectId
          task.projectCode = project?.code
          // 태그 ID → 이름+색상 매핑
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

        if (tasks.length < size) break
        page++
        if (page >= 5) break
      } catch {
        break
      }
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
