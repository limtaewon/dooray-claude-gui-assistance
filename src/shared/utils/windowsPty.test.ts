import { describe, it, expect } from 'vitest'
import { windowsPtyOptions } from './windowsPty'

describe('windowsPtyOptions — ADR-v2-windows-fix-03 §4', () => {
  it("('win32', '10.0.22621') → conpty 21376+ 게이트 통과", () => {
    expect(windowsPtyOptions('win32', '10.0.22621')).toEqual({ backend: 'conpty', buildNumber: 22621 })
  })

  it("('win32', '10.0.19044') → 게이트 미통과, undefined (현행 동작 보존)", () => {
    expect(windowsPtyOptions('win32', '10.0.19044')).toBeUndefined()
  })

  it('osRelease 가 없으면 undefined', () => {
    expect(windowsPtyOptions('win32', undefined)).toBeUndefined()
  })

  it('파싱 불가 문자열이면 undefined', () => {
    expect(windowsPtyOptions('win32', 'not-a-version')).toBeUndefined()
  })

  it("('darwin', '23.0.0') → 플랫폼이 win32 가 아니면 osRelease 와 무관하게 undefined", () => {
    expect(windowsPtyOptions('darwin', '23.0.0')).toBeUndefined()
  })

  it('경계값 21376 은 정확히 지정된다', () => {
    expect(windowsPtyOptions('win32', '10.0.21376')).toEqual({ backend: 'conpty', buildNumber: 21376 })
  })

  it('21375 는 게이트 미통과로 undefined', () => {
    expect(windowsPtyOptions('win32', '10.0.21375')).toBeUndefined()
  })
})
