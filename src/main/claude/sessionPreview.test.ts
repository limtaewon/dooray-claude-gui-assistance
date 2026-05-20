import { describe, it, expect } from 'vitest'
import { cleanFirstMessage } from './sessionPreview'

describe('cleanFirstMessage (#13)', () => {
  it('일반 텍스트는 그대로 (단, 100자 컷)', () => {
    expect(cleanFirstMessage('안녕하세요 리뷰 부탁드립니다.')).toBe('안녕하세요 리뷰 부탁드립니다.')
  })

  it('HTML/XML 태그는 공백으로 치환, 안 내용물은 보존', () => {
    const out = cleanFirstMessage('<command-name>/clear</command-name>')
    expect(out).toBe('/clear')
  })

  it('system-reminder 같은 메타 태그가 wrap 된 경우도 평탄화', () => {
    const out = cleanFirstMessage('<system-reminder>주의</system-reminder> 본문 시작')
    expect(out).toBe('주의 본문 시작')
  })

  it('줄 시작 마크다운 마커 (# - * > •) 제거', () => {
    expect(cleanFirstMessage('# 제목\n- 항목1\n- 항목2')).toBe('제목 항목1 항목2')
  })

  it('코드 펜스 블록은 통째로 제거', () => {
    const out = cleanFirstMessage('설명\n```ts\nconst x = 1\n```\n끝')
    expect(out).toBe('설명 끝')
  })

  it('인라인 백틱은 내용만 남김', () => {
    expect(cleanFirstMessage('`foo` 와 `bar` 비교')).toBe('foo 와 bar 비교')
  })

  it('줄바꿈과 연속 공백을 단일 공백으로', () => {
    expect(cleanFirstMessage('한 줄\n\n두 줄   세 줄')).toBe('한 줄 두 줄 세 줄')
  })

  it('100자 초과 시 컷', () => {
    const long = '가'.repeat(200)
    const out = cleanFirstMessage(long)
    expect(out.length).toBe(100)
  })

  it('빈 입력은 빈 문자열', () => {
    expect(cleanFirstMessage('')).toBe('')
  })

  it('태그만 있고 본문 없으면 빈 문자열', () => {
    expect(cleanFirstMessage('<tag></tag>')).toBe('')
  })
})
