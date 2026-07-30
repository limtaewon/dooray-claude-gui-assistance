import { describe, it, expect } from 'vitest'
import { sanitizeForRestore } from './sanitizeForRestore'

describe('sanitizeForRestore', () => {
  it('alt-screen exit 이후 출력만 남긴다', () => {
    const raw = '\x1b[?1049hsome TUI redraw\x1b[?1049lAfter exit'
    expect(sanitizeForRestore(raw)).toBe('After exit')
  })

  it('마지막 exit 기준 — 여러 번 들어갔다 나와도 마지막 이후만', () => {
    const raw = '\x1b[?1049lfirst\x1b[?1049hredraw\x1b[?1049lsecond'
    expect(sanitizeForRestore(raw)).toBe('second')
  })

  it('미완성 ESC 시퀀스로 끝나면 잘라낸다', () => {
    expect(sanitizeForRestore('text\x1b[')).toBe('text')
  })

  it('완결된 CSI 시퀀스는 보존', () => {
    const raw = 'text\x1b[31mred'
    expect(sanitizeForRestore(raw)).toBe(raw)
  })

  it('alt-screen 마커 없고 완결된 출력이면 그대로', () => {
    expect(sanitizeForRestore('plain output')).toBe('plain output')
  })
})
