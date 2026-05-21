import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WikiService } from './WikiService'

function makeClient() {
  return {
    request: vi.fn()
  }
}

let client: ReturnType<typeof makeClient>
let svc: WikiService

beforeEach(() => {
  client = makeClient()
  svc = new WikiService(client as never)
})

describe('WikiService.getDetail', () => {
  it('성공 결과 반환', async () => {
    client.request.mockResolvedValue({ result: { id: 'w1', name: '내 위키' } })
    expect(await svc.getDetail('w1')).toEqual({ id: 'w1', name: '내 위키' })
  })

  it('result 없으면 빈 객체', async () => {
    client.request.mockResolvedValue({})
    expect(await svc.getDetail('w1')).toEqual({})
  })
})

describe('WikiService.listDomains', () => {
  it('빈 결과 + 캐시 안함', async () => {
    client.request.mockResolvedValue({ result: [], totalCount: 0 })
    expect(await svc.listDomains()).toEqual([])
    // 빈 결과는 캐시되지 않으므로 재호출 시 또 요청
    await svc.listDomains()
    expect(client.request.mock.calls.length).toBeGreaterThan(0)
  })

  it('여러 페이지 합치고 dedup', async () => {
    let call = 0
    client.request.mockImplementation((url: string) => {
      if (url.includes('scope=')) return Promise.resolve({ result: [], totalCount: 0 })
      call++
      if (call === 1) return Promise.resolve({ result: [{ id: 'w1', name: 'A', type: 't' }, { id: 'w2', name: 'B', type: 't' }], totalCount: 2 })
      return Promise.resolve({ result: [], totalCount: 2 })
    })
    const r = await svc.listDomains()
    expect(r.map((w) => w.id)).toEqual(['w1', 'w2'])
  })

  it('첫 페이지 결과 있으면 캐시 (재호출 안 함)', async () => {
    client.request.mockResolvedValue({ result: [{ id: 'w1', name: 'A', type: 't' }], totalCount: 1 })
    await svc.listDomains()
    const before = client.request.mock.calls.length
    await svc.listDomains()
    expect(client.request.mock.calls.length).toBe(before)
  })

  it('요청 실패 시 그 페이지만 skip', async () => {
    let i = 0
    client.request.mockImplementation(() => {
      i++
      if (i === 1) return Promise.reject(new Error('fail'))
      return Promise.resolve({ result: [{ id: 'w1', name: 'A', type: 't' }], totalCount: 1 })
    })
    const r = await svc.listDomains()
    expect(r).toEqual([{ id: 'w1', name: 'A', type: 't' }])
  })
})

describe('WikiService.list', () => {
  it('단일 페이지', async () => {
    client.request.mockResolvedValue({ result: [{ id: 'p1', subject: 'P1' }], totalCount: 1 })
    const r = await svc.list('w1')
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('p1')
  })

  it('parentPageId 가 있으면 쿼리에 포함', async () => {
    client.request.mockResolvedValue({ result: [], totalCount: 0 })
    await svc.list('w1', 'parent')
    expect(client.request).toHaveBeenCalledWith(expect.stringContaining('parentPageId=parent'))
  })

  it('TTL 캐시', async () => {
    client.request.mockResolvedValue({ result: [{ id: 'p1', subject: 'P1' }], totalCount: 1 })
    await svc.list('w1')
    const before = client.request.mock.calls.length
    await svc.list('w1')
    expect(client.request.mock.calls.length).toBe(before)
  })

  it('여러 페이지 병렬 요청', async () => {
    let calls = 0
    client.request.mockImplementation(() => {
      calls++
      return Promise.resolve({ result: [{ id: `p${calls}`, subject: `P${calls}` }], totalCount: 250 })
    })
    const r = await svc.list('w1')
    // totalCount 250 / size 100 = 3 페이지 (MAX_PAGES=5 안)
    expect(client.request.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(r.length).toBeGreaterThanOrEqual(3)
  })

  it('실패한 페이지는 빈 결과로 폴백', async () => {
    let i = 0
    client.request.mockImplementation(() => {
      i++
      if (i === 1) return Promise.resolve({ result: [{ id: 'p1', subject: 'A' }], totalCount: 200 })
      return Promise.reject(new Error('fail'))
    })
    const r = await svc.list('w1')
    expect(r.map((p) => p.id)).toEqual(['p1'])
  })
})

describe('WikiService.listSinglePage', () => {
  it('parentPageId/size/page 쿼리 포함', async () => {
    client.request.mockResolvedValue({ result: [] })
    await svc.listSinglePage('w1', 'parent', { size: 50 })
    const url = client.request.mock.calls[0][0] as string
    expect(url).toContain('parentPageId=parent')
    expect(url).toContain('size=50')
    expect(url).toContain('page=0')
  })

  it('subject 옵션 포함', async () => {
    client.request.mockResolvedValue({ result: [] })
    await svc.listSinglePage('w1', 'p', { subject: '컨테이너' })
    const url = client.request.mock.calls[0][0] as string
    expect(decodeURIComponent(url)).toContain('subject=컨테이너')
  })

  it('result 없으면 빈 배열', async () => {
    client.request.mockResolvedValue({})
    expect(await svc.listSinglePage('w1', 'p')).toEqual([])
  })
})

describe('WikiService.getTopLevelPages', () => {
  it('쿼리 없이 호출', async () => {
    client.request.mockResolvedValue({ result: [{ id: 'p1', subject: 'home' }] })
    const r = await svc.getTopLevelPages('w1')
    expect(client.request).toHaveBeenCalledWith('/wiki/v1/wikis/w1/pages')
    expect(r[0].id).toBe('p1')
  })
})

describe('WikiService.get', () => {
  it('result 반환', async () => {
    client.request.mockResolvedValue({ result: { id: 'p1', subject: 'X', body: 'B' } })
    const p = await svc.get('w1', 'p1')
    expect(p.id).toBe('p1')
  })
})

describe('WikiService.create', () => {
  it('POST 로 새 페이지 생성', async () => {
    client.request.mockResolvedValue({ result: { id: 'new-id' } })
    const r = await svc.create({ wikiId: 'w1', parentPageId: 'p0', subject: 'T', body: 'B' })
    expect(r.id).toBe('new-id')
    const [url, opts] = client.request.mock.calls[0]
    expect(url).toBe('/wiki/v1/wikis/w1/pages')
    expect((opts as { method: string }).method).toBe('POST')
    const body = JSON.parse((opts as { body: string }).body)
    expect(body.subject).toBe('T')
    expect(body.body.mimeType).toBe('text/x-markdown')
    expect(body.body.content).toBe('B')
    expect(body.parentPageId).toBe('p0')
  })

  it('생성 후 list 캐시 무효화', async () => {
    client.request
      .mockResolvedValueOnce({ result: [{ id: 'p1', subject: 'A' }], totalCount: 1 })  // first list
      .mockResolvedValueOnce({ result: { id: 'new' } })                                  // create
      .mockResolvedValueOnce({ result: [{ id: 'p1', subject: 'A' }], totalCount: 1 })  // list 재호출
    await svc.list('w1')
    await svc.create({ wikiId: 'w1', subject: 'X', body: '' })
    await svc.list('w1')
    expect(client.request.mock.calls.length).toBe(3)
  })
})

describe('WikiService.deletePage / renameTitle / update', () => {
  it('deletePage: DELETE 호출', async () => {
    client.request.mockResolvedValue({})
    await svc.deletePage('w1', 'p1')
    expect(client.request).toHaveBeenCalledWith('/wiki/v1/wikis/w1/pages/p1', { method: 'DELETE' })
  })

  it('renameTitle: PUT /title', async () => {
    client.request.mockResolvedValue({})
    await svc.renameTitle('w1', 'p1', '[DELETED] X')
    const [url, opts] = client.request.mock.calls[0]
    expect(url).toBe('/wiki/v1/wikis/w1/pages/p1/title')
    expect((opts as { method: string }).method).toBe('PUT')
    expect(JSON.parse((opts as { body: string }).body)).toEqual({ subject: '[DELETED] X' })
  })

  it('update: title + body 모두 있으면 두 번 호출', async () => {
    client.request.mockResolvedValue({})
    await svc.update({ projectId: 'w1', pageId: 'p1', title: 'T', body: 'B' })
    expect(client.request).toHaveBeenCalledTimes(2)
  })

  it('update: title 만 있으면 한 번', async () => {
    client.request.mockResolvedValue({})
    await svc.update({ projectId: 'w1', pageId: 'p1', title: 'T' } as unknown as import('../../shared/types/dooray').DoorayWikiUpdateParams)
    expect(client.request).toHaveBeenCalledTimes(1)
  })

  it('update: body 만 있어도 한 번', async () => {
    client.request.mockResolvedValue({})
    await svc.update({ projectId: 'w1', pageId: 'p1', body: 'B' } as unknown as import('../../shared/types/dooray').DoorayWikiUpdateParams)
    expect(client.request).toHaveBeenCalledTimes(1)
    expect((client.request.mock.calls[0][0] as string)).toContain('/content')
  })
})
