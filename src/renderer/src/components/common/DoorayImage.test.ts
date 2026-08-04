import { describe, it, expect } from 'vitest'
import { causeLabel } from './DoorayImage'

/**
 * 전에는 에러 메시지 전체에서 '404' 를 찾아 분기했다. 그런데 main 의 후보 경로에 **늘 404 인**
 * `/common/v1/files/{id}` 가 들어 있어, 진짜 원인이 429 든 뭐든 항상 "두레이에서 보기" 로 떴다.
 * 이제 첫 후보의 상태 코드만 보고 고른다.
 */
describe('causeLabel', () => {
  it('없는 파일은 두레이에서 보라고 안내한다', () => {
    expect(causeLabel('404')).toBe('두레이에서 보기')
  })

  it('권한 문제는 두레이에서 봐도 안 되므로 다르게 말한다', () => {
    expect(causeLabel('403')).toBe('접근 권한 없음')
  })

  it('429 는 다시 열면 되는 일시적 실패다', () => {
    expect(causeLabel('429')).toBe('요청이 몰림 · 다시 열어보세요')
  })

  it('원인을 모르면 단정하지 않는다', () => {
    expect(causeLabel(undefined)).toBe('로드 실패')
    expect(causeLabel('500')).toBe('로드 실패')
  })
})

describe('cause 파싱', () => {
  const parse = (msg: string): string | undefined => /\[cause=(\d+)\]/.exec(msg)?.[1]

  it('main 이 만든 메시지에서 원인을 뽑는다', () => {
    const msg =
      '파일 로드 실패 [cause=429] [ctx={"projectId":"p1","postId":"t1"}]\n' +
      '시도: 4개\n  1. HTTP 429 (file-api/...)\n  2. HTTP 404 (/common/v1/files/1)'
    expect(parse(msg)).toBe('429')
  })

  it('메시지 뒤쪽의 404 에 휘둘리지 않는다 — 이게 원래 버그였다', () => {
    const msg = '파일 로드 실패 [cause=429] ...\n  2. HTTP 404 (/common/v1/files/1)'
    expect(parse(msg)).not.toBe('404')
  })

  it('원인을 못 실었으면 undefined', () => {
    expect(parse('파일 로드 실패 [cause=unknown] [ctx=없음]')).toBeUndefined()
  })
})
