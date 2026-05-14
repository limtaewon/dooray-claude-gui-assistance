import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SharedSkillsService } from './SharedSkillsService'

function makeWiki() {
  return {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    renameTitle: vi.fn(),
    deletePage: vi.fn()
  }
}

function makeSkillsManager() {
  return { save: vi.fn() }
}

const CONFIG = { wikiId: 'wiki-1', parentPageId: 'parent-1' }

let wiki: ReturnType<typeof makeWiki>
let skills: ReturnType<typeof makeSkillsManager>
let svc: SharedSkillsService

beforeEach(() => {
  wiki = makeWiki()
  skills = makeSkillsManager()
  svc = new SharedSkillsService(wiki as never, skills as never, CONFIG)
})

describe('SharedSkillsService.list', () => {
  it('정상 페이지만 (DELETED 제외) + filename sanitize', async () => {
    wiki.list.mockResolvedValue([
      { id: 'p1', subject: 'Skill A!', createdAt: '2026-01-01', updatedAt: '2026-01-02', creator: { member: { organizationMemberId: 'u1', name: '홍길동' } } },
      { id: 'p2', subject: '[DELETED] gone', creator: { member: { organizationMemberId: 'u1' } } }
    ])
    const r = await svc.list()
    expect(r).toHaveLength(1)
    expect(r[0].name).toBe('Skill A!')
    expect(r[0].filename).toBe('Skill-A-')
    expect(r[0].authorName).toBe('홍길동')
    expect(r[0].isMine).toBe(false)
  })

  it('inline name 없으면 memberNameResolver 사용', async () => {
    wiki.list.mockResolvedValue([
      { id: 'p1', subject: 'X', creator: { member: { organizationMemberId: 'u1' } } }
    ])
    svc.setMemberNameResolver(async () => '실명')
    const r = await svc.list()
    expect(r[0].authorName).toBe('실명')
  })

  it('memberId 도 이름도 없으면 "알 수 없음"', async () => {
    wiki.list.mockResolvedValue([
      { id: 'p1', subject: 'X', creator: { member: {} } }
    ])
    const r = await svc.list()
    expect(r[0].authorName).toBe('알 수 없음')
  })

  it('myMemberId 와 creator 일치 시 isMine=true', async () => {
    wiki.list.mockResolvedValue([
      { id: 'p1', subject: 'X', creator: { member: { organizationMemberId: 'me', name: '나' } } }
    ])
    svc.setMyMemberIdResolver(async () => 'me')
    const r = await svc.list()
    expect(r[0].isMine).toBe(true)
  })

  it('myMemberIdResolver 실패해도 graceful', async () => {
    wiki.list.mockResolvedValue([{ id: 'p1', subject: 'X', creator: { member: { organizationMemberId: 'u1', name: 'A' } } }])
    svc.setMyMemberIdResolver(async () => { throw new Error('fail') })
    const r = await svc.list()
    expect(r[0].isMine).toBe(false)
  })

  it('subject 가 빈 문자열이면 fallback filename', async () => {
    wiki.list.mockResolvedValue([{ id: 'p9', subject: '', title: '', creator: {} }])
    const r = await svc.list()
    expect(r[0].name).toBe('untitled')
    expect(r[0].filename).toBeTruthy()
  })
})

describe('SharedSkillsService.get', () => {
  it('body 가 string 인 경우', async () => {
    wiki.get.mockResolvedValue({ id: 'p1', subject: 'S', body: 'CONTENT', creator: { member: { organizationMemberId: 'u1', name: 'A' } } })
    const r = await svc.get('p1')
    expect(r.content).toBe('CONTENT')
  })

  it('body 가 {content} 객체인 경우', async () => {
    wiki.get.mockResolvedValue({ id: 'p1', subject: 'S', body: { mimeType: 'text/x-markdown', content: 'OBJ-CONTENT' }, creator: {} })
    const r = await svc.get('p1')
    expect(r.content).toBe('OBJ-CONTENT')
  })

  it('body 가 없으면 빈 문자열', async () => {
    wiki.get.mockResolvedValue({ id: 'p1', subject: 'S', creator: {} })
    expect((await svc.get('p1')).content).toBe('')
  })

  it('inline name 없으면 resolver 호출', async () => {
    wiki.get.mockResolvedValue({ id: 'p1', subject: 'S', creator: { member: { organizationMemberId: 'u1' } } })
    svc.setMemberNameResolver(async () => '리졸브')
    expect((await svc.get('p1')).authorName).toBe('리졸브')
  })

  it('resolver 실패 시 "알 수 없음"', async () => {
    wiki.get.mockResolvedValue({ id: 'p1', subject: 'S', creator: { member: { organizationMemberId: 'u1' } } })
    svc.setMemberNameResolver(async () => { throw new Error('fail') })
    expect((await svc.get('p1')).authorName).toBe('알 수 없음')
  })
})

describe('SharedSkillsService.upload', () => {
  it('wiki.create 로 새 페이지 생성', async () => {
    wiki.create.mockResolvedValue({ id: 'new-page' })
    const r = await svc.upload({ filename: 'f', name: 'N', content: 'C' })
    expect(r.postId).toBe('new-page')
    expect(wiki.create).toHaveBeenCalledWith({
      wikiId: 'wiki-1', parentPageId: 'parent-1', subject: 'N', body: 'C'
    })
  })

  it('name 없으면 filename 사용', async () => {
    wiki.create.mockResolvedValue({ id: 'p' })
    await svc.upload({ filename: 'my-skill', content: 'x' } as never)
    expect(wiki.create.mock.calls[0][0].subject).toBe('my-skill')
  })
})

describe('SharedSkillsService.download', () => {
  it('get → skillsManager.save', async () => {
    wiki.get.mockResolvedValue({ id: 'p1', subject: 'X', body: 'C', creator: {} })
    const r = await svc.download('p1')
    expect(r.filename).toBeTruthy()
    expect(skills.save).toHaveBeenCalled()
  })
})

describe('SharedSkillsService.delete', () => {
  it('[DELETED] prefix 로 soft-delete', async () => {
    wiki.get.mockResolvedValue({ id: 'p1', subject: '원래 제목', creator: {} })
    await svc.delete('p1')
    expect(wiki.renameTitle).toHaveBeenCalledWith('wiki-1', 'p1', '[DELETED] 원래 제목')
  })

  it('이미 [DELETED] 면 no-op', async () => {
    wiki.get.mockResolvedValue({ id: 'p1', subject: '[DELETED] gone', creator: {} })
    await svc.delete('p1')
    expect(wiki.renameTitle).not.toHaveBeenCalled()
  })
})
