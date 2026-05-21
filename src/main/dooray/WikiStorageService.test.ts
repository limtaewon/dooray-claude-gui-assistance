import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WikiStorageService } from './WikiStorageService'

function makeWiki() {
  return {
    getDetail: vi.fn(),
    getTopLevelPages: vi.fn(),
    listSinglePage: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    get: vi.fn(),
    deletePage: vi.fn(),
    renameTitle: vi.fn()
  }
}

function makeStore() {
  const data: Record<string, string> = {}
  return {
    get: (k: string) => data[k],
    set: (k: string, v: string) => { data[k] = v },
    delete: (k: string) => { delete data[k] },
    _data: data
  }
}

let wiki: ReturnType<typeof makeWiki>
let store: ReturnType<typeof makeStore>
let svc: WikiStorageService

beforeEach(() => {
  wiki = makeWiki()
  store = makeStore()
  svc = new WikiStorageService(wiki as never, store)
})

describe('WikiStorageService.resolveWikiId', () => {
  it('URL 에 wikiId + pageId 둘 다 있으면 둘 다 추출', async () => {
    wiki.getDetail.mockResolvedValue({ name: '내 위키' })
    const r = await svc.resolveWikiId('https://x/wiki/123456/789012')
    expect(r.wikiId).toBe('123456')
    expect(r.parentPageId).toBe('789012')
    expect(r.wikiName).toBe('내 위키')
  })

  it('URL 에 wikiId 만 있으면 parentPageId 미설정', async () => {
    wiki.getDetail.mockResolvedValue({ name: 'A' })
    const r = await svc.resolveWikiId('https://x/wiki/123456')
    expect(r.wikiId).toBe('123456')
    expect(r.parentPageId).toBeUndefined()
  })

  it('숫자 ID 단독도 허용', async () => {
    wiki.getDetail.mockResolvedValue({ subject: 'B' })
    const r = await svc.resolveWikiId('789012')
    expect(r.wikiId).toBe('789012')
    expect(r.wikiName).toBe('B')
  })

  it('빈 입력 throw', async () => {
    await expect(svc.resolveWikiId('  ')).rejects.toThrow(/입력/)
  })

  it('인식 불가 형식 throw', async () => {
    await expect(svc.resolveWikiId('invalid-text')).rejects.toThrow(/인식할 수 없는/)
  })

  it('getDetail 실패 throw', async () => {
    wiki.getDetail.mockRejectedValue(new Error('forbidden'))
    await expect(svc.resolveWikiId('https://x/wiki/123456')).rejects.toThrow(/접근하지 못/)
  })
})

describe('WikiStorageService.list', () => {
  it('컨테이너 없으면 빈 배열', async () => {
    wiki.getTopLevelPages.mockResolvedValue([])
    expect(await svc.list('w1', 'skills')).toEqual([])
  })

  it('컨테이너가 위키 root 아래에 존재하면 자식 페이지 매핑', async () => {
    wiki.getTopLevelPages.mockResolvedValue([{ id: 'root', subject: 'home' }])
    wiki.listSinglePage
      .mockResolvedValueOnce([{ id: 'container', subject: 'Clauday Skills' }]) // find
      .mockResolvedValueOnce([
        { id: 'p1', subject: '스킬1', body: '내용1', updatedAt: '2026-01-01' },
        { id: 'p2', subject: '[DELETED] 스킬2', body: '', updatedAt: '2026-01-02' }
      ])
    const items = await svc.list('w1', 'skills')
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('스킬1')
  })

  it('listSinglePage 자식 조회 실패 시 store key 삭제 + 빈 배열', async () => {
    wiki.getTopLevelPages.mockResolvedValue([{ id: 'root', subject: 'home' }])
    wiki.listSinglePage
      .mockResolvedValueOnce([{ id: 'container', subject: 'Clauday Skills' }])
      .mockRejectedValueOnce(new Error('not found'))
    expect(await svc.list('w1', 'skills')).toEqual([])
    expect(store._data['wikiStorageContainer:skills:w1']).toBeUndefined()
  })

  it('store 캐시 사용 (컨테이너 ID)', async () => {
    store.set('wikiStorageContainer:skills:w1', 'cached-container')
    wiki.listSinglePage.mockResolvedValueOnce([])
    await svc.list('w1', 'skills')
    // getTopLevelPages 호출 안 함
    expect(wiki.getTopLevelPages).not.toHaveBeenCalled()
  })

  it('parentPageIdHint 가 있으면 root 자동 탐색 skip', async () => {
    wiki.listSinglePage
      .mockResolvedValueOnce([{ id: 'container', subject: 'Clauday MCPs' }])
      .mockResolvedValueOnce([])
    await svc.list('w1', 'mcps', 'hint-root')
    expect(wiki.getTopLevelPages).not.toHaveBeenCalled()
  })
})

describe('WikiStorageService.get', () => {
  it('subject/body → name/content 매핑', async () => {
    wiki.get.mockResolvedValue({ subject: '제목', body: '본문' })
    expect(await svc.get('w1', 'p1')).toEqual({ name: '제목', content: '본문' })
  })
})

describe('WikiStorageService.upload', () => {
  it('컨테이너 없으면 root 아래에 자동 생성', async () => {
    wiki.getTopLevelPages.mockResolvedValue([{ id: 'root', subject: 'home' }])
    wiki.listSinglePage
      .mockResolvedValueOnce([])                            // find container
      .mockResolvedValueOnce([])                            // 자식 중 동명 페이지 검색
    wiki.create
      .mockResolvedValueOnce({ id: 'new-container' })     // 컨테이너 생성
      .mockResolvedValueOnce({ id: 'new-page' })          // 페이지 생성
    const r = await svc.upload({ wikiId: 'w1', kind: 'skills', name: '스킬X', content: 'C' })
    expect(r.updated).toBe(false)
    expect(r.pageId).toBe('new-page')
    expect(wiki.create).toHaveBeenCalledTimes(2)
  })

  it('컨테이너 존재 + 동명 페이지 있으면 update', async () => {
    store.set('wikiStorageContainer:skills:w1', 'container-id')
    wiki.listSinglePage.mockResolvedValueOnce([{ id: 'existing', subject: '스킬X', body: '' }])
    const r = await svc.upload({ wikiId: 'w1', kind: 'skills', name: '스킬X', content: 'NEW' })
    expect(r.updated).toBe(true)
    expect(r.pageId).toBe('existing')
    expect(wiki.update).toHaveBeenCalled()
  })

  it('root 탐색 실패 시 명확한 안내 throw', async () => {
    wiki.getTopLevelPages.mockResolvedValue([])
    wiki.listSinglePage.mockResolvedValueOnce([])
    await expect(svc.upload({ wikiId: 'w1', kind: 'skills', name: 'X', content: '' })).rejects.toThrow(/루트 페이지/)
  })
})

describe('WikiStorageService.softDelete (hard-delete only, v1.5+)', () => {
  it('hard delete 성공 시 종료', async () => {
    wiki.deletePage.mockResolvedValue(undefined)
    await svc.softDelete('w1', 'p1')
    expect(wiki.renameTitle).not.toHaveBeenCalled()
  })

  it('403 권한 오류는 사용자 친화적 메시지로 변환', async () => {
    wiki.deletePage.mockRejectedValue(new Error('Dooray API 오류 (403): forbidden'))
    await expect(svc.softDelete('w1', 'p1')).rejects.toThrow(/본인이 작성/)
  })

  it('405 등 미지원도 더 이상 soft delete 폴백 안 함 — 그대로 에러', async () => {
    wiki.deletePage.mockRejectedValue(new Error('Dooray API 오류 (405): method not allowed'))
    await expect(svc.softDelete('w1', 'p1')).rejects.toThrow(/DELETE 를 지원하지 않/)
    expect(wiki.renameTitle).not.toHaveBeenCalled()
  })
})
