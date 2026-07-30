import { describe, it, expect } from 'vitest'
import { utf8ByteLength, trimSerializedToBytes } from './textBytes'

describe('utf8ByteLength', () => {
  it('ASCII', () => {
    expect(utf8ByteLength('hello')).toBe(5)
  })

  it('한글 — 음절당 3바이트', () => {
    expect(utf8ByteLength('안녕')).toBe(6)
  })

  it('이모지(서로게이트 페어) — 4바이트', () => {
    expect(utf8ByteLength('😀')).toBe(4)
  })

  it('빈 문자열 — 0', () => {
    expect(utf8ByteLength('')).toBe(0)
  })
})

describe('trimSerializedToBytes', () => {
  it('이미 작은 입력은 그대로 반환', () => {
    expect(trimSerializedToBytes('hello world', 100)).toBe('hello world')
  })

  it('maxBytes <= 0 이면 빈 문자열', () => {
    expect(trimSerializedToBytes('hello', 0)).toBe('')
  })

  it('정확 경계 — 자른 지점이 이미 줄 시작이면 개행 되감기 없이 그대로', () => {
    const text = 'AAAAAAAAAA\nBBBBBBBBBB' // 10 + 1(개행) + 10 = 21 bytes(전부 ASCII)
    expect(trimSerializedToBytes(text, 10)).toBe('BBBBBBBBBB')
  })

  it('줄 중간에서 잘리면 다음 개행까지 되감아 ANSI/문자를 반토막 내지 않는다', () => {
    const text = 'XXXXXhello\nBBBBBBBBBB' // 21 bytes
    // maxBytes=15 → byte 경계상 'ello\nBBBBBBBBBB'(15자) 가 선택되지만, 중간 개행 이전 조각을 버린다.
    expect(trimSerializedToBytes(text, 15)).toBe('BBBBBBBBBB')
  })

  it('멀티바이트(한글) 반복 입력에서도 4 probe 이내로 정확한 바이트 경계에 수렴', () => {
    const text = '가'.repeat(1000) // 3000 bytes
    const result = trimSerializedToBytes(text, 1500)
    expect(utf8ByteLength(result)).toBe(1500)
    expect(result).toBe('가'.repeat(500))
  })

  it('결과는 항상 maxBytes 이하', () => {
    const text = 'ab'.repeat(50) + '한글'.repeat(50) + '😀'.repeat(10)
    const result = trimSerializedToBytes(text, 137)
    expect(utf8ByteLength(result)).toBeLessThanOrEqual(137)
  })
})
