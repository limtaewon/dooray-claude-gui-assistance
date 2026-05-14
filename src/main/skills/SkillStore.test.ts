import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let tmpUserData: string

vi.mock('electron', () => ({
  app: { getPath: (_k: string) => tmpUserData }
}))

import { SkillStore } from './SkillStore'

// 마이그레이션 미실행 — 빈 baseDir 보장 (실제 ~/Library/Application Support/clover 복제 회피)
;(SkillStore.prototype as unknown as { migrateFromLegacyPaths: () => void }).migrateFromLegacyPaths = () => {}

function makeStore(): SkillStore {
  return new (SkillStore as new () => SkillStore)()
}

// 호환 alias
async function loadStore(): Promise<{ SkillStore: typeof SkillStore }> {
  return { SkillStore }
}

beforeEach(() => {
  tmpUserData = mkdtempSync(join(tmpdir(), 'skillstore-'))
})
afterEach(() => {
  rmSync(tmpUserData, { recursive: true, force: true })
})

function writeMdSkill(target: string, id: string, body: { name: string; enabled?: string; autoApply?: string; description?: string; content?: string }): void {
  const dir = join(tmpUserData, target, 'skills')
  mkdirSync(dir, { recursive: true })
  const fm = [
    '---',
    `name: ${body.name}`,
    `description: ${body.description || ''}`,
    `enabled: ${body.enabled || 'true'}`,
    `autoApply: ${body.autoApply || 'true'}`,
    '---',
    body.content || ''
  ].join('\n')
  writeFileSync(join(dir, `${id}.md`), fm, 'utf8')
}

describe('SkillStore.list / get', () => {
  it('빈 디렉토리', async () => {
    const { SkillStore } = await loadStore()
    expect(makeStore().list()).toEqual([])
  })

  it('여러 target 의 스킬 모두 수집', async () => {
    writeMdSkill('briefing', 'b1', { name: '브리핑 스킬' })
    writeMdSkill('report', 'r1', { name: '보고서 스킬' })
    const { SkillStore } = await loadStore()
    const list = makeStore().list()
    expect(list).toHaveLength(2)
    expect(list.map((s) => s.name).sort()).toEqual(['보고서 스킬', '브리핑 스킬'])
  })

  it('updatedAt 내림차순 정렬 (있으면)', async () => {
    writeMdSkill('briefing', 'old', { name: 'old' })
    // 두 번째 파일에 updatedAt 명시
    const dir = join(tmpUserData, 'briefing', 'skills')
    writeFileSync(join(dir, 'new.md'),
      '---\nname: new\ndescription: \nenabled: true\nautoApply: true\nupdatedAt: 2030-01-01T00:00:00Z\n---\n', 'utf8')
    const { SkillStore } = await loadStore()
    const list = makeStore().list()
    expect(list[0].name).toBe('new')
  })

  it('JSON 형식 스킬도 호환 읽기', async () => {
    const dir = join(tmpUserData, 'task', 'skills')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'j1.json'), JSON.stringify({
      id: 'j1', name: 'J', description: '', target: 'task',
      enabled: true, autoApply: true, content: 'json-content',
      createdAt: '2026-01-01', updatedAt: '2026-01-02'
    }), 'utf8')
    const { SkillStore } = await loadStore()
    const list = makeStore().list()
    expect(list[0].content).toBe('json-content')
  })

  it('get(id) — 모든 target 검색', async () => {
    writeMdSkill('briefing', 'mine', { name: '내것' })
    const { SkillStore } = await loadStore()
    const s = makeStore().get('mine')!
    expect(s.name).toBe('내것')
  })

  it('get(id) — 없으면 null', async () => {
    const { SkillStore } = await loadStore()
    expect(makeStore().get('absent')).toBeNull()
  })
})

describe('SkillStore.save / delete', () => {
  it('save 후 list 에 등장', async () => {
    const { SkillStore } = await loadStore()
    const store = makeStore()
    store.save({
      id: 'new-1', name: 'X', description: 'desc', target: 'briefing' as never,
      enabled: true, autoApply: true, content: 'C', createdAt: '', updatedAt: '2026-05-13'
    })
    expect(existsSync(join(tmpUserData, 'briefing', 'skills', 'new-1.md'))).toBe(true)
    const list = store.list()
    expect(list.map((s) => s.id)).toContain('new-1')
  })

  it('save 시 다른 target 의 동명 파일 정리', async () => {
    writeMdSkill('briefing', 'dup', { name: 'old' })
    const { SkillStore } = await loadStore()
    const store = makeStore()
    store.save({
      id: 'dup', name: '새', description: '', target: 'report' as never,
      enabled: true, autoApply: true, content: 'new', createdAt: '', updatedAt: ''
    })
    expect(existsSync(join(tmpUserData, 'briefing', 'skills', 'dup.md'))).toBe(false)
    expect(existsSync(join(tmpUserData, 'report', 'skills', 'dup.md'))).toBe(true)
  })

  it('delete — 모든 target 에서 제거', async () => {
    writeMdSkill('briefing', 'rm', { name: 'rm' })
    writeMdSkill('report', 'rm', { name: 'rm' })
    const { SkillStore } = await loadStore()
    const store = makeStore()
    store.delete('rm')
    expect(existsSync(join(tmpUserData, 'briefing', 'skills', 'rm.md'))).toBe(false)
    expect(existsSync(join(tmpUserData, 'report', 'skills', 'rm.md'))).toBe(false)
  })

  it('id 의 비안전 문자 sanitize', async () => {
    const { SkillStore } = await loadStore()
    const store = makeStore()
    store.save({
      id: 'a/b c', name: 'X', description: '', target: 'briefing' as never,
      enabled: true, autoApply: true, content: 'C', createdAt: '', updatedAt: ''
    })
    expect(existsSync(join(tmpUserData, 'briefing', 'skills', 'a_b_c.md'))).toBe(true)
  })
})

describe('SkillStore.forTarget', () => {
  it('해당 target + "all" target 의 enabled+autoApply 만', async () => {
    writeMdSkill('briefing', 'b1', { name: 'B-on' })
    writeMdSkill('briefing', 'b2', { name: 'B-off', enabled: 'false' })
    writeMdSkill('briefing', 'b3', { name: 'B-noauto', autoApply: 'false' })
    writeMdSkill('all', 'a1', { name: 'A-on' })
    const { SkillStore } = await loadStore()
    const r = makeStore().forTarget('briefing')
    expect(r.map((s) => s.name).sort()).toEqual(['A-on', 'B-on'])
  })
})

describe('SkillStore — parseFrontmatter', () => {
  it('frontmatter 가 없는 markdown 도 안전 처리', async () => {
    const dir = join(tmpUserData, 'task', 'skills')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'plain.md'), '## 그냥 마크다운\n본문', 'utf8')
    const { SkillStore } = await loadStore()
    const list = makeStore().list()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('plain')
  })
})

describe('SkillStore — 캐시 무효화', () => {
  it('save 후 재조회 시 새 스킬 보임', async () => {
    const { SkillStore } = await loadStore()
    const store = makeStore()
    expect(store.list()).toEqual([])
    store.save({ id: 's1', name: 'S1', description: '', target: 'briefing' as never, enabled: true, autoApply: true, content: '', createdAt: '', updatedAt: '' })
    expect(store.list().map((s) => s.id)).toContain('s1')
  })
})

describe('SkillStore.read 별칭 동작', () => {
  it('frontmatter content 파싱', async () => {
    const dir = join(tmpUserData, 'briefing', 'skills')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'c1.md'),
      '---\nname: T\ndescription: \nenabled: true\nautoApply: true\n---\n## 본문\n내용',
      'utf8'
    )
    const { SkillStore } = await loadStore()
    const list = makeStore().list()
    expect(list[0].content).toContain('## 본문')
    expect(readFileSync(join(dir, 'c1.md'), 'utf8')).toContain('## 본문')
  })
})
