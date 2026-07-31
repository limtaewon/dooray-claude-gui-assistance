import { describe, it, expect } from 'vitest'
import { parseOsc7 } from './parseOsc7'

describe('parseOsc7', () => {
  it('POSIX 경로를 디코딩한다', () => {
    expect(parseOsc7('file://host/Users/dev/project')).toBe('/Users/dev/project')
  })

  it('host 가 비어있어도(file:///…) 동작한다', () => {
    expect(parseOsc7('file:///Users/dev/project')).toBe('/Users/dev/project')
  })

  it('percent-encoding 을 디코딩한다(공백/한글 폴더명 등)', () => {
    expect(parseOsc7('file://host/Users/dev/My%20Project')).toBe('/Users/dev/My Project')
    expect(parseOsc7('file://host/Users/dev/%ED%95%9C%EA%B8%80')).toBe('/Users/dev/한글')
  })

  it('Windows 드라이브 경로에서 선행 슬래시를 벗긴다', () => {
    expect(parseOsc7('file://host/C:/Users/dev')).toBe('C:/Users/dev')
  })

  it('file:// 가 아닌 payload 는 null', () => {
    expect(parseOsc7('not-a-uri')).toBeNull()
    expect(parseOsc7('http://example.com/x')).toBeNull()
  })

  it('디코딩 불가능한 percent-encoding 은 null', () => {
    expect(parseOsc7('file://host/%')).toBeNull()
  })

  it('빈 경로는 null', () => {
    expect(parseOsc7('file://host')).toBeNull()
  })
})
