import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { TaskImageService } from './TaskImageService'
import type { DoorayClient } from './DoorayClient'
import type { TaskService } from './TaskService'

const PNG = 'data:image/png;base64,aGVsbG8='

function clientWith(fetchBinary: DoorayClient['fetchBinary']): DoorayClient {
  return { fetchBinary } as unknown as DoorayClient
}

/** 본문 하나 + 댓글들로 이뤄진 가짜 업무. 이미지가 어디에 붙어 있든 같이 훑는지 보려고 나눈다. */
function tasksWith(body: string | undefined, ...comments: string[]): TaskService {
  return {
    getTaskDetail: async () => ({ body: { mimeType: 'text/x-markdown', content: body } }),
    getTaskComments: async () =>
      comments.map((content, i) => ({ id: `c${i}`, body: { mimeType: 'text/x-markdown', content } }))
  } as unknown as TaskService
}

/** 두레이 조회 자체가 실패하는 상황. */
function failingTasks(): TaskService {
  return {
    getTaskDetail: async () => { throw new Error('두레이 API 실패') },
    getTaskComments: async () => { throw new Error('두레이 API 실패') }
  } as unknown as TaskService
}

describe('TaskImageService', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'clauday-task-images-'))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('본문·댓글의 이미지를 내려받아 로컬 경로를 돌려준다', async () => {
    const fetchBinary = vi.fn().mockResolvedValue(PNG)
    const service = new TaskImageService(
      clientWith(fetchBinary),
      tasksWith('![본문.png](/files/111)', '![댓글.png](/files/222)'),
      dir
    )

    const files = await service.download('p1', 't1')

    expect(files.map((f) => f.fileId)).toEqual(['111', '222'])
    expect(await readFile(files[0].path, 'utf-8')).toBe('hello')
    // 업무 스코프 경로로 요청해야 한다 — 범용 경로로 가면 두레이가 404 를 준다.
    expect(fetchBinary).toHaveBeenCalledWith('/files/111', { projectId: 'p1', postId: 't1' })
  })

  it('이미지가 없으면 폴더도 만들지 않고 빈 배열', async () => {
    const fetchBinary = vi.fn()
    const service = new TaskImageService(clientWith(fetchBinary), tasksWith('그림 없는 본문'), dir)
    expect(await service.download('p1', 't1')).toEqual([])
    expect(fetchBinary).not.toHaveBeenCalled()
  })

  it('한 장이 실패해도 나머지는 살린다 — 그림 하나 때문에 업무 시작이 막히면 안 된다', async () => {
    const fetchBinary = vi.fn(async (path: string) => {
      if (path.includes('111')) throw new Error('HTTP 404')
      return PNG
    })
    const service = new TaskImageService(
      clientWith(fetchBinary),
      tasksWith('![a](/files/111) ![b](/files/222)'),
      dir
    )
    const files = await service.download('p1', 't1')
    expect(files.map((f) => f.fileId)).toEqual(['222'])
  })

  it('이미지가 아닌 첨부는 건너뛴다', async () => {
    const service = new TaskImageService(
      clientWith(vi.fn().mockResolvedValue('data:application/pdf;base64,aGVsbG8=')),
      tasksWith('![문서처럼보이는것](/files/111)'),
      dir
    )
    expect(await service.download('p1', 't1')).toEqual([])
  })

  it('두레이 조회가 실패하면 빈 배열 — 업무 시작 흐름을 막지 않는다', async () => {
    const service = new TaskImageService(clientWith(vi.fn()), failingTasks(), dir)
    expect(await service.download('p1', 't1')).toEqual([])
  })

  it('댓글을 못 읽어도 본문 그림은 살린다', async () => {
    const tasks = {
      getTaskDetail: async () => ({ body: { mimeType: 'text/x-markdown', content: '![본문](/files/111)' } }),
      getTaskComments: async () => { throw new Error('댓글 조회 실패') }
    } as unknown as TaskService
    const service = new TaskImageService(clientWith(vi.fn().mockResolvedValue(PNG)), tasks, dir)

    const files = await service.download('p1', 't1')

    expect(files.map((f) => f.fileId)).toEqual(['111'])
  })

  it('한 업무에서 내려받는 장수를 8장으로 제한한다', async () => {
    const many = Array.from({ length: 12 }, (_, i) => `![a${i}](/files/${100 + i})`).join(' ')
    const fetchBinary = vi.fn().mockResolvedValue(PNG)
    const service = new TaskImageService(clientWith(fetchBinary), tasksWith(many), dir)
    const files = await service.download('p1', 't1')
    expect(files).toHaveLength(8)
    expect(fetchBinary).toHaveBeenCalledTimes(8)
  })
})
