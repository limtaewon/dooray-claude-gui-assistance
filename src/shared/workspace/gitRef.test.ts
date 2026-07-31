import { describe, it, expect } from 'vitest'
import { isSafeGitRef } from './gitRef'

describe('isSafeGitRef — 허용', () => {
  const allowed = [
    'main',
    'feature/D-TF-2619',
    'release/1.0.0',
    'feature/task-abc123',
    'bugfix/fix_issue',
    'a',
    'feature/multi/level/branch',
    'v1.2.3',
    'user.name/branch',
    'feature/ABC-123-some-title'
  ]

  it.each(allowed)('%s 는 허용된다', (ref) => {
    expect(isSafeGitRef(ref)).toBe(true)
  })
})

describe('isSafeGitRef — 거부', () => {
  const rejected: Array<[string, string]> = [
    ['빈 문자열', ''],
    ['- 로 시작(커맨드 인젝션)', '-x'],
    ['.. 포함', 'a..b'],
    ['세미콜론', 'a;rm'],
    ['파이프', 'a|b'],
    ['앰퍼샌드', 'a&b'],
    ['달러', 'a$b'],
    ['백틱', 'a`b'],
    ['개행', 'a\nb'],
    ['캐리지리턴', 'a\rb'],
    ['공백', 'a b'],
    ['틸드', 'a~b'],
    ['캐럿', 'a^b'],
    ['콜론', 'a:b'],
    ['물음표', 'a?b'],
    ['별표', 'a*b'],
    ['대괄호', 'a[b'],
    ['백슬래시', 'a\\b'],
    ['연속 슬래시', 'a//b'],
    ['슬래시로 시작', '/a'],
    ['슬래시로 끝', 'a/'],
    ['점으로 끝', 'a.'],
    ['.lock 로 끝', 'a.lock'],
    ['@{ 포함', 'a@{b'],
    ['@ 하나만', '@']
  ]

  it.each(rejected)('%s: %s 는 거부된다', (_label, ref) => {
    expect(isSafeGitRef(ref)).toBe(false)
  })
})
