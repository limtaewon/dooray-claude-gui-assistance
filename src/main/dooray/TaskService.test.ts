import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TaskService } from './TaskService'

function makeClient() {
  return {
    request: vi.fn(),
    uploadFile: vi.fn()
  }
}

const ME = { result: { id: 'me-1', name: '나' } }

let client: ReturnType<typeof makeClient>
let svc: TaskService

beforeEach(() => {
  client = makeClient()
  svc = new TaskService(client as never)
})

function mockEndpoints(map: Record<string, unknown>): void {
  client.request.mockImplementation((path: string) => {
    for (const key of Object.keys(map)) {
      if (path.startsWith(key)) return Promise.resolve(map[key])
    }
    return Promise.resolve({ result: [], totalCount: 0 })
  })
}

describe('TaskService.listMyProjects', () => {
  it('private + public 병합, dedup, 캐시', async () => {
    mockEndpoints({
      '/project/v1/projects?member=me': { result: [{ id: 'p1', code: 'PA' }, { id: 'p2', code: 'PB' }] },
      '/project/v1/projects?type=public': { result: [{ id: 'p2', code: 'PB-dup' }, { id: 'p3', code: 'PC' }] }
    })
    const list = await svc.listMyProjects()
    expect(list.map((p) => p.id).sort()).toEqual(['p1', 'p2', 'p3'])
    // 두 번째 호출은 캐시
    const before = client.request.mock.calls.length
    await svc.listMyProjects()
    expect(client.request.mock.calls.length).toBe(before)
  })

  it('public 조회 실패해도 private 결과는 반환', async () => {
    client.request.mockImplementation((path: string) => {
      if (path.includes('member=me')) return Promise.resolve({ result: [{ id: 'p1' }] })
      if (path.includes('type=public')) return Promise.reject(new Error('forbidden'))
      return Promise.resolve({ result: {} })
    })
    const list = await svc.listMyProjects()
    expect(list.map((p) => p.id)).toEqual(['p1'])
  })

  it('setCustomProjectIds 후 미존재 프로젝트는 개별 조회 + isCustom=true', async () => {
    let getIndividual = 0
    client.request.mockImplementation((path: string) => {
      if (path.includes('member=me')) return Promise.resolve({ result: [{ id: 'p1' }] })
      if (path.includes('type=public')) return Promise.resolve({ result: [] })
      if (path === '/project/v1/projects/p9') {
        getIndividual++
        return Promise.resolve({ result: { id: 'p9', code: 'P9' } })
      }
      return Promise.resolve({ result: [] })
    })
    svc.setCustomProjectIds(['p9'])
    const list = await svc.listMyProjects()
    expect(getIndividual).toBe(1)
    const p9 = list.find((p) => p.id === 'p9')!
    expect(p9.isCustom).toBe(true)
  })

  it('이미 자동 조회된 프로젝트도 setCustomProjectIds 에 있으면 isCustom 마크', async () => {
    mockEndpoints({
      '/project/v1/projects?member=me': { result: [{ id: 'p1', code: 'PA' }] },
      '/project/v1/projects?type=public': { result: [] }
    })
    svc.setCustomProjectIds(['p1'])
    const list = await svc.listMyProjects()
    expect(list[0].isCustom).toBe(true)
  })
})

describe('TaskService.getProjectInfo', () => {
  it('첫 호출 fetch + 두 번째 캐시', async () => {
    client.request.mockResolvedValue({ result: { id: 'p1', code: 'PA' } })
    await svc.getProjectInfo('p1')
    await svc.getProjectInfo('p1')
    expect(client.request).toHaveBeenCalledTimes(1)
  })
})

describe('TaskService.listMyCcTasks', () => {
  it('memberId 조회 후 ccMemberIds 쿼리 호출', async () => {
    client.request.mockImplementation((path: string) => {
      if (path.endsWith('/members/me')) return Promise.resolve(ME)
      if (path.includes('member=me')) return Promise.resolve({ result: [{ id: 'p1' }] })
      if (path.includes('type=public')) return Promise.resolve({ result: [] })
      if (path.includes('ccMemberIds=')) return Promise.resolve({ result: [{ id: 'task-cc', createdAt: '2026-05-13' }] })
      return Promise.resolve({ result: [] })
    })
    const r = await svc.listMyCcTasks()
    expect(r.map((t) => t.id)).toContain('task-cc')
  })

  it('개별 프로젝트 호출 실패 시 빈 배열로 폴백', async () => {
    client.request.mockImplementation((path: string) => {
      if (path.endsWith('/members/me')) return Promise.resolve(ME)
      if (path.includes('ccMemberIds=')) return Promise.reject(new Error('fail'))
      return Promise.resolve({ result: [] })
    })
    const r = await svc.listMyCcTasks(['p1'])
    expect(r).toEqual([])
  })
})

describe('TaskService — task 생성/수정/삭제', () => {
  beforeEach(() => {
    client.request.mockImplementation((path: string) => {
      if (path.endsWith('/members/me')) return Promise.resolve(ME)
      return Promise.resolve({ result: { id: 'new-1' } })
    })
  })

  it('createTask: 기본 assignee 는 자기 자신', async () => {
    const r = await svc.createTask({ projectId: 'p1', subject: 'X', body: 'B' })
    expect(r.id).toBe('new-1')
    const last = client.request.mock.calls.find((c) => (c[0] as string).includes('/posts') && !(c[0] as string).includes('logs'))!
    const body = JSON.parse((last[1] as { body: string }).body)
    expect(body.users.to[0].member.organizationMemberId).toBe('me-1')
  })

  it('createTask: tagIds 전달 시 tagIdList 포함', async () => {
    await svc.createTask({ projectId: 'p1', subject: 'X', body: 'B', tagIds: ['t1', 't2'] })
    const last = client.request.mock.calls.find((c) => (c[0] as string).endsWith('/posts'))!
    const body = JSON.parse((last[1] as { body: string }).body)
    expect(body.tagIdList).toEqual(['t1', 't2'])
  })

  it('createTaskComment: 마크다운 mimeType', async () => {
    await svc.createTaskComment({ projectId: 'p1', postId: 't1', content: '댓글' })
    const last = client.request.mock.calls[client.request.mock.calls.length - 1]
    const body = JSON.parse((last[1] as { body: string }).body)
    expect(body.body.mimeType).toBe('text/x-markdown')
    expect(body.body.content).toBe('댓글')
  })

  it('updateTaskStatus: PUT + set-workflow', async () => {
    await svc.updateTaskStatus({ projectId: 'p1', postId: 't1', status: 'wf-2' } as never)
    const last = client.request.mock.calls.find((c) => (c[0] as string).includes('set-workflow'))!
    expect((last[1] as { method: string }).method).toBe('PUT')
    const body = JSON.parse((last[1] as { body: string }).body)
    expect(body.workflowId).toBe('wf-2')
  })

  it('deleteTask: DELETE', async () => {
    await svc.deleteTask({ projectId: 'p1', postId: 't1' })
    const last = client.request.mock.calls[client.request.mock.calls.length - 1]
    expect((last[1] as { method: string }).method).toBe('DELETE')
  })

  it('deleteTaskComment: DELETE', async () => {
    await svc.deleteTaskComment({ projectId: 'p1', postId: 't1', logId: 'log1' })
    const last = client.request.mock.calls[client.request.mock.calls.length - 1]
    expect((last[1] as { method: string }).method).toBe('DELETE')
  })

  it('uploadFileToTask 는 client.uploadFile 위임', async () => {
    client.uploadFile.mockResolvedValue({ id: 'file-1' })
    const r = await svc.uploadFileToTask({ projectId: 'p1', postId: 't1', filename: 'a.png', mime: 'image/png', data: new ArrayBuffer(4) })
    expect(client.uploadFile).toHaveBeenCalled()
    expect(r.id).toBe('file-1')
  })
})

describe('TaskService.invalidateTaskCache', () => {
  it('전체 / 단일 분기', () => {
    expect(() => svc.invalidateTaskCache()).not.toThrow()
    expect(() => svc.invalidateTaskCache('p1')).not.toThrow()
  })
})

describe('TaskService.listProjectTemplates', () => {
  it('첫 엔드포인트 성공 시 그 결과 반환', async () => {
    client.request.mockResolvedValue({ result: [{ id: 't1', name: '주간 보고' }] })
    const r = await svc.listProjectTemplates('p1')
    expect(r).toEqual([{ id: 't1', name: '주간 보고' }])
  })

  it('첫 엔드포인트 실패 → fallback 시도', async () => {
    let attempt = 0
    client.request.mockImplementation(() => {
      attempt++
      if (attempt < 3) return Promise.reject(new Error('404'))
      return Promise.resolve({ result: [{ id: 't2', subject: '폴백' }] })
    })
    const r = await svc.listProjectTemplates('p1')
    expect(r[0].name).toBe('폴백')
  })

  it('모든 엔드포인트 실패 시 throw', async () => {
    client.request.mockRejectedValue(new Error('404'))
    await expect(svc.listProjectTemplates('p1')).rejects.toThrow()
  })
})

describe('TaskService.getProjectTemplate', () => {
  it('body 가 string 인 경우', async () => {
    client.request.mockResolvedValue({ result: { id: 't1', subject: '제목', body: 'BODY-STRING' } })
    const r = await svc.getProjectTemplate('p1', 't1')
    expect(r?.body).toBe('BODY-STRING')
  })

  it('body 가 {content} 객체인 경우', async () => {
    client.request.mockResolvedValue({ result: { id: 't1', subject: '제목', body: { content: 'OBJ-BODY' } } })
    const r = await svc.getProjectTemplate('p1', 't1')
    expect(r?.body).toBe('OBJ-BODY')
  })

  it('모두 실패하면 null', async () => {
    client.request.mockRejectedValue(new Error('404'))
    expect(await svc.getProjectTemplate('p1', 't1')).toBeNull()
  })
})

describe('TaskService.listProjectTags', () => {
  it('태그 매핑 반환', async () => {
    client.request.mockResolvedValue({ result: [{ id: 'tg1', name: 'urgent', color: 'ff0000' }] })
    const tags = await svc.listProjectTags('p1')
    expect(tags).toEqual([{ id: 'tg1', name: 'urgent', color: 'ff0000' }])
  })

  it('실패 시 빈 배열', async () => {
    client.request.mockRejectedValue(new Error('404'))
    expect(await svc.listProjectTags('p1')).toEqual([])
  })
})

describe('TaskService.getTaskComments', () => {
  it('member 댓글만 필터 (system/bot 제외)', async () => {
    client.request.mockImplementation((path: string) => {
      if (path.includes('/posts/t1/logs')) return Promise.resolve({ result: [
        { id: 'l1', creator: { type: 'member', member: { organizationMemberId: 'u1', name: '홍길동' } }, body: { content: 'A' }, createdAt: '2026-05-13' },
        { id: 'l2', creator: { type: 'system' }, body: { content: 'B' }, createdAt: '2026-05-13' },
        { id: 'l3', subtype: 'github-webhook', creator: { type: 'member', member: { organizationMemberId: 'u2', name: 'bot' } }, body: { content: 'C' }, createdAt: '2026-05-13' }
      ] })
      if (path.includes('/members/')) return Promise.resolve({ result: { name: '홍길동' } })
      return Promise.resolve({ result: [] })
    })
    const comments = await svc.getTaskComments('p1', 't1')
    expect(comments).toHaveLength(1)
    expect(comments[0].id).toBe('l1')
  })

  it('logs 호출 실패 시 빈 배열', async () => {
    client.request.mockRejectedValue(new Error('fail'))
    expect(await svc.getTaskComments('p1', 't1')).toEqual([])
  })
})

describe('TaskService.listCommunityPosts', () => {
  it('totalCount 와 함께 반환', async () => {
    client.request.mockResolvedValue({ result: [{ id: 'po1' }, { id: 'po2' }], totalCount: 50 })
    const r = await svc.listCommunityPosts('p1')
    expect(r.posts.map((p) => p.id)).toEqual(['po1', 'po2'])
    expect(r.totalCount).toBe(50)
  })

  it('실패 시 빈 결과', async () => {
    client.request.mockRejectedValue(new Error('fail'))
    const r = await svc.listCommunityPosts('p1')
    expect(r.posts).toEqual([])
    expect(r.totalCount).toBe(0)
  })
})

describe('TaskService.getMyMemberIdPublic', () => {
  it('me 응답에서 id 추출 후 캐시', async () => {
    client.request.mockResolvedValue(ME)
    expect(await svc.getMyMemberIdPublic()).toBe('me-1')
    expect(await svc.getMyMemberIdPublic()).toBe('me-1')
    expect(client.request).toHaveBeenCalledTimes(1)
  })
})
