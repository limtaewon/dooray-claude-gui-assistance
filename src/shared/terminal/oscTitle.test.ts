import { describe, it, expect } from 'vitest'
import { scanOscTitles } from './oscTitle'

const ESC = ''
const BEL = ''
const osc = (code: string, title: string, terminator = BEL): string =>
  `${ESC}]${code};${title}${terminator}`

describe('scanOscTitles', () => {
  it('BEL 로 끝나는 타이틀을 읽는다', () => {
    expect(scanOscTitles(osc('0', '✳ claude')).titles).toEqual(['✳ claude'])
  })

  it('ESC 백슬래시(ST)로 끝나도 읽는다', () => {
    expect(scanOscTitles(osc('2', 'claude working', `${ESC}\\`)).titles).toEqual(['claude working'])
  })

  it('한 청크에 여러 개가 와도 모두 읽는다', () => {
    const { titles } = scanOscTitles(`${osc('0', 'a')}중간 출력${osc('2', 'b')}`)
    expect(titles).toEqual(['a', 'b'])
  })

  it('청크 경계에서 잘려도 이어 붙인다 — PTY 는 아무 데서나 잘린다', () => {
    const first = scanOscTitles(`${ESC}]0;✳ cla`)
    expect(first.titles).toEqual([])
    const second = scanOscTitles(`ude${BEL}`, first.carry)
    expect(second.titles).toEqual(['✳ claude'])
    expect(second.carry).toBe('')
  })

  it('ESC 만 걸쳐 잘린 경우도 이어 붙인다', () => {
    const first = scanOscTitles(`출력${ESC}`)
    expect(first.carry).toBe(ESC)
    expect(scanOscTitles(`]0;t${BEL}`, first.carry).titles).toEqual(['t'])
  })

  it('타이틀이 아닌 OSC(7=cwd, 8=링크)는 무시한다', () => {
    const { titles } = scanOscTitles(`${ESC}]7;file:///Users/me${BEL}${osc('0', '진짜')}`)
    expect(titles).toEqual(['진짜'])
  })

  it('평범한 출력만 있으면 아무것도 안 남는다', () => {
    expect(scanOscTitles('그냥 로그\n두 번째 줄')).toEqual({ titles: [], carry: '' })
  })

  it('종료 문자가 영원히 안 오면 버린다 — 미완성 조각을 무한정 들고 있지 않는다', () => {
    const long = scanOscTitles(`${ESC}]0;${'x'.repeat(5000)}`)
    expect(long.titles).toEqual([])
    expect(long.carry).toBe('')
  })

  it('빈 타이틀도 값으로 준다 — 셸이 타이틀을 지운 것', () => {
    expect(scanOscTitles(osc('0', '')).titles).toEqual([''])
  })
})
