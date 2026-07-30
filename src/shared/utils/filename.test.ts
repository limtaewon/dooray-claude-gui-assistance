import { describe, it, expect } from 'vitest'
import { sanitizeSkillFilename } from './filename'

describe('sanitizeSkillFilename — 금지문자', () => {
  it.each(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])('%s 는 개별적으로 치환된다', (ch) => {
    const result = sanitizeSkillFilename(`a${ch}b`)
    expect(result).not.toContain(ch)
    expect(result).toBe('a_b')
  })

  it('제어문자는 제거된다', () => {
    expect(sanitizeSkillFilename('a\x01b\x1fc')).toBe('abc')
  })
})

describe('sanitizeSkillFilename — traversal 무력화', () => {
  it('../../etc/passwd 는 경로 이탈 불가능한 형태가 된다', () => {
    const result = sanitizeSkillFilename('../../etc/passwd')
    expect(result).not.toContain('..')
    expect(result).not.toContain('/')
    expect(result).not.toContain('\\')
  })

  it("'..' 는 fallback 또는 안전한 값", () => {
    const result = sanitizeSkillFilename('..')
    expect(result).not.toContain('..')
    expect(result.length).toBeGreaterThan(0)
  })

  it("'.' 은 후행 점 제거로 빈 값 → fallback", () => {
    expect(sanitizeSkillFilename('.')).toBe('skill')
  })

  it("'...' 는 fallback 또는 안전한 값", () => {
    const result = sanitizeSkillFilename('...')
    expect(result).not.toContain('..')
  })
})

describe('sanitizeSkillFilename — Windows 예약어', () => {
  it.each(['CON', 'con', 'AUX', 'NUL', 'PRN', 'COM1', 'LPT9'])('%s 은 회피된다', (name) => {
    const result = sanitizeSkillFilename(name)
    expect(result.toUpperCase()).not.toBe(name.toUpperCase())
  })

  it('CON.md 는 확장자 붙은 형태도 회피된다', () => {
    const result = sanitizeSkillFilename('CON.md')
    expect(result).not.toMatch(/^CON\.md$/i)
    expect(result.toLowerCase().endsWith('.md')).toBe(true)
  })

  it.each(['CONSOLE', 'COM10', 'COMPANY'])('%s 는 예약어가 아니므로 변형되지 않는다', (name) => {
    expect(sanitizeSkillFilename(name)).toBe(name)
  })
})

describe('sanitizeSkillFilename — 후행 점/공백', () => {
  it("'skill.' → 'skill'", () => {
    expect(sanitizeSkillFilename('skill.')).toBe('skill')
  })

  it("'skill ' → 'skill'", () => {
    expect(sanitizeSkillFilename('skill ')).toBe('skill')
  })

  it("'skill. ' → 'skill'", () => {
    expect(sanitizeSkillFilename('skill. ')).toBe('skill')
  })
})

describe('sanitizeSkillFilename — 빈 값/fallback', () => {
  it('빈 문자열 → fallback', () => {
    expect(sanitizeSkillFilename('')).toBe('skill')
  })

  it('공백만 → fallback', () => {
    expect(sanitizeSkillFilename('   ')).toBe('skill')
  })

  it('opts.fallback 커스텀 적용', () => {
    expect(sanitizeSkillFilename('', { fallback: 'untitled' })).toBe('untitled')
  })

  it('null/undefined 이 IPC 경계를 넘어 들어와도(타입 우회) 크래시 없이 fallback', () => {
    expect(sanitizeSkillFilename(null as unknown as string)).toBe('skill')
    expect(sanitizeSkillFilename(undefined as unknown as string)).toBe('skill')
  })
})

describe('sanitizeSkillFilename — 한글/이모지 보존', () => {
  it('한글 파일명은 지워지지 않는다', () => {
    expect(sanitizeSkillFilename('두레이-스킬')).toBe('두레이-스킬')
  })

  it('이모지는 금지문자가 아니므로 보존된다', () => {
    expect(sanitizeSkillFilename('skill-🚀')).toBe('skill-🚀')
  })
})

describe('sanitizeSkillFilename — 길이 상한', () => {
  it('상한 초과 시 확장자를 보존하며 자른다', () => {
    const name = 'a'.repeat(250) + '.txt'
    const result = sanitizeSkillFilename(name, { maxLength: 200 })
    expect(result.length).toBe(200)
    expect(result.endsWith('.txt')).toBe(true)
  })

  it('확장자 없는 긴 이름은 그냥 자른다', () => {
    const name = 'a'.repeat(250)
    const result = sanitizeSkillFilename(name, { maxLength: 200 })
    expect(result.length).toBe(200)
  })

  it('상한 이내면 그대로', () => {
    const name = 'short-name.md'
    expect(sanitizeSkillFilename(name, { maxLength: 200 })).toBe(name)
  })
})

describe('sanitizeSkillFilename — 멱등성', () => {
  const cases = [
    'CON.md',
    '../../etc/passwd',
    'skill. ',
    '   ',
    '두레이-스킬<>:"/\\|?*',
    'a'.repeat(250) + '.txt',
    'COM1',
    '..',
    '...',
    'skill-🚀'
  ]

  it.each(cases)('sanitize(sanitize(%s)) === sanitize(%s)', (input) => {
    const once = sanitizeSkillFilename(input)
    const twice = sanitizeSkillFilename(once)
    expect(twice).toBe(once)
  })
})
