import { describe, it, expect } from 'vitest'
import { tabNameFromCwd, tabNameFromTitle } from './tabAutoName'

describe('tabNameFromTitle', () => {
  it('실행 중인 명령을 그대로 라벨로 쓴다', () => {
    expect(tabNameFromTitle('npm')).toBe('npm')
    expect(tabNameFromTitle('vi')).toBe('vi')
  })

  it('user@host 접두를 걷어낸다', () => {
    expect(tabNameFromTitle('nhn@macbook: ~/Desktop/2NEON')).toBe('2NEON')
  })

  it('순수 경로는 마지막 세그먼트만 남긴다', () => {
    expect(tabNameFromTitle('~/Desktop/dooray-claude-gui-assistance')).toBe('dooray-claude-gui-assistance')
    expect(tabNameFromTitle('/Users/nhn/work/ios')).toBe('ios')
    expect(tabNameFromTitle('C:\\Users\\nhn\\proj')).toBe('proj')
  })

  it('끝에 붙는 셸 이름 꼬리표를 뗀다', () => {
    expect(tabNameFromTitle('claude — zsh')).toBe('claude')
  })

  it('셸 이름만 오면 null — 기존 이름을 유지시킨다', () => {
    expect(tabNameFromTitle('zsh')).toBeNull()
    expect(tabNameFromTitle('bash')).toBeNull()
    expect(tabNameFromTitle('  ')).toBeNull()
    expect(tabNameFromTitle('')).toBeNull()
  })

  it('한글 제목도 그대로 쓴다', () => {
    expect(tabNameFromTitle('MyBatis XML 파서 중복 키 에러')).toBe('MyBatis XML 파서 중복 키 에러')
  })

  it('너무 길면 잘라서 탭바를 밀지 않는다', () => {
    const long = 'a'.repeat(60)
    const out = tabNameFromTitle(long)
    expect(out).toHaveLength(28)
    expect(out?.endsWith('…')).toBe(true)
  })
})

describe('tabNameFromCwd', () => {
  it('마지막 세그먼트를 쓴다', () => {
    expect(tabNameFromCwd('/Users/nhn/work/ios')).toBe('ios')
    expect(tabNameFromCwd('/Users/nhn/work/ios/')).toBe('ios')
  })

  it('cwd 가 없으면 ~', () => {
    expect(tabNameFromCwd()).toBe('~')
  })
})
