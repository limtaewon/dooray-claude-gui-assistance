import { describe, it, expect } from 'vitest'
import {
  matchedSectionIds,
  matchesSettingsSearch,
  normalizeQuery,
  scoreSearchEntry,
  searchSettings,
  type SettingsSearchTarget
} from './settingsSearch'

const TARGETS: SettingsSearchTarget[] = [
  { sectionId: 'app', title: '테마', description: '밝게/어둡게 전환', keywords: ['theme', 'dark'] },
  { sectionId: 'app', title: '글꼴', description: '앱 전체 글꼴과 크기', keywords: ['font'] },
  { sectionId: 'models', title: 'AI 모델', description: '기능별 모델 선택', keywords: ['model'] },
  { sectionId: 'keys', title: '단축키', description: '키 조합 변경', keywords: ['shortcut', 'keymap'] }
]

describe('normalizeQuery', () => {
  it('앞뒤 공백을 털고 소문자로 만든다', () => {
    expect(normalizeQuery('  Dark  ')).toBe('dark')
  })
})

describe('scoreSearchEntry — 필드 계층', () => {
  const entry = { title: '테마', description: '밝게/어둡게 전환', keywords: ['theme'] }

  it('제목 > 설명 > 키워드 순으로 점수가 높다', () => {
    const byTitle = scoreSearchEntry(entry, '테마')
    const byDescription = scoreSearchEntry(entry, '어둡게')
    const byKeyword = scoreSearchEntry(entry, 'theme')
    expect(byTitle).toBeGreaterThan(byDescription)
    expect(byDescription).toBeGreaterThan(byKeyword)
  })

  it('정확 일치 > 접두 일치 > 부분 일치', () => {
    const target = { title: 'terminal' }
    expect(scoreSearchEntry(target, 'terminal')).toBeGreaterThan(scoreSearchEntry(target, 'term'))
    expect(scoreSearchEntry(target, 'term')).toBeGreaterThan(scoreSearchEntry(target, 'rmina'))
  })

  it('안 걸리면 0', () => {
    expect(scoreSearchEntry(entry, '없는말')).toBe(0)
  })

  it('빈 질의는 0', () => {
    expect(scoreSearchEntry(entry, '')).toBe(0)
  })
})

describe('matchesSettingsSearch — 행 게이팅', () => {
  const entry = { title: '테마', keywords: ['theme'] }

  it('질의가 비면 항상 통과한다 — 검색 안 할 때 모든 행이 보여야 한다', () => {
    expect(matchesSettingsSearch('', entry)).toBe(true)
    expect(matchesSettingsSearch('   ', entry)).toBe(true)
  })

  it('대소문자를 가리지 않는다', () => {
    expect(matchesSettingsSearch('THEME', entry)).toBe(true)
  })

  it('안 걸리면 false', () => {
    expect(matchesSettingsSearch('단축키', entry)).toBe(false)
  })

  it('말도 안 되게 긴 질의는 매칭하지 않는다 (붙여넣기 사고 방어)', () => {
    expect(matchesSettingsSearch('a'.repeat(500), { title: 'a'.repeat(500) })).toBe(false)
  })
})

describe('searchSettings', () => {
  it('점수 높은 순으로 준다', () => {
    const hits = searchSettings(TARGETS, '모델')
    expect(hits[0].sectionId).toBe('models')
  })

  it('같은 점수면 카탈로그 순서를 지킨다 — 결과가 매번 흔들리면 안 된다', () => {
    const targets: SettingsSearchTarget[] = [
      { sectionId: 'a', title: '공통 항목' },
      { sectionId: 'b', title: '공통 항목' }
    ]
    expect(searchSettings(targets, '공통').map((h) => h.sectionId)).toEqual(['a', 'b'])
  })

  it('여러 섹션에 걸치면 전부 준다', () => {
    const hits = searchSettings(TARGETS, 'e')
    expect(new Set(hits.map((h) => h.sectionId)).size).toBeGreaterThan(1)
  })

  it('빈 질의는 빈 결과 — 검색 안 할 때는 결과 목록을 띄우지 않는다', () => {
    expect(searchSettings(TARGETS, '')).toEqual([])
  })

  it('같은 섹션의 같은 제목은 한 번만 나온다', () => {
    const targets: SettingsSearchTarget[] = [
      { sectionId: 'a', title: '테마', keywords: ['theme'] },
      { sectionId: 'a', title: '테마', description: '다른 설명' }
    ]
    expect(searchSettings(targets, '테마')).toHaveLength(1)
  })
})

describe('matchedSectionIds', () => {
  it('걸린 섹션 집합을 준다 — 좌측 네비를 좁히는 데 쓴다', () => {
    expect(matchedSectionIds(TARGETS, 'font')).toEqual(new Set(['app']))
  })

  it('빈 질의면 빈 집합', () => {
    expect(matchedSectionIds(TARGETS, '')).toEqual(new Set())
  })
})
