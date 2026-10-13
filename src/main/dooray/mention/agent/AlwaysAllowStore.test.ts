import { describe, it, expect, vi } from 'vitest'
import { AlwaysAllowStore } from './AlwaysAllowStore'
import type { KeyValueStorage } from '../MentionCatchUp'

function memStorage(initial: Record<string, unknown> = {}): KeyValueStorage & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>(Object.entries(initial))
  return { data, get: (k, d) => (data.has(k) ? data.get(k) : d), set: (k, v) => { data.set(k, v) } }
}

describe('AlwaysAllowStore', () => {
  it('add 한 서명은 has', () => {
    const s = new AlwaysAllowStore(memStorage())
    expect(s.has('c1', 'Bash:git push')).toBe(false)
    s.add('c1', 'Bash:git push')
    expect(s.has('c1', 'Bash:git push')).toBe(true)
  })

  it('채널별로 분리', () => {
    const s = new AlwaysAllowStore(memStorage())
    s.add('c1', 'sig')
    expect(s.has('c2', 'sig')).toBe(false)
    s.add('c2', 'other')
    expect(s.has('c1', 'other')).toBe(false)
    expect(s.has('c1', 'sig')).toBe(true)
  })

  it('서명은 정확히 일치해야 한다 (부분 일치 아님)', () => {
    const s = new AlwaysAllowStore(memStorage())
    s.add('c1', 'Bash:git push origin main')
    expect(s.has('c1', 'Bash:git push')).toBe(false)
    expect(s.has('c1', 'Bash:git push origin main2')).toBe(false)
  })

  it('같은 서명을 다시 add 해도 저장은 한 번만', () => {
    const storage = memStorage()
    const set = vi.spyOn(storage, 'set')
    const s = new AlwaysAllowStore(storage)
    s.add('c1', 'a')
    s.add('c1', 'a')
    expect(set).toHaveBeenCalledTimes(1)
    expect((storage.get('alwaysAllow') as Record<string, string[]>).c1).toEqual(['a'])
  })

  it('새 인스턴스가 저장된 기억을 이어받는다 (재시작 후 유지)', () => {
    const storage = memStorage()
    new AlwaysAllowStore(storage).add('c1', 'persisted')
    expect(new AlwaysAllowStore(storage).has('c1', 'persisted')).toBe(true)
  })

  it('채널당 200개 상한 — 가장 오래된 것부터 버린다', () => {
    const storage = memStorage()
    const s = new AlwaysAllowStore(storage)
    for (let i = 0; i < 205; i++) s.add('c1', `sig${i}`)
    expect((storage.get('alwaysAllow') as Record<string, string[]>).c1).toHaveLength(200)
    expect(s.has('c1', 'sig0')).toBe(false)
    expect(s.has('c1', 'sig4')).toBe(false)
    expect(s.has('c1', 'sig5')).toBe(true)
    expect(s.has('c1', 'sig204')).toBe(true)
  })

  it('상한은 채널별 — 한 채널이 가득 차도 다른 채널은 영향 없음', () => {
    const s = new AlwaysAllowStore(memStorage())
    for (let i = 0; i < 205; i++) s.add('c1', `sig${i}`)
    s.add('c2', 'mine')
    expect(s.has('c2', 'mine')).toBe(true)
  })

  it('다른 채널을 추가해도 기존 채널의 기억은 유지', () => {
    const s = new AlwaysAllowStore(memStorage())
    s.add('c1', 'a')
    s.add('c2', 'b')
    expect(s.has('c1', 'a')).toBe(true)
  })

  it('저장값이 객체가 아니면 (손상) 빈 상태로 취급하고 add 가 복구한다', () => {
    const storage = memStorage({ alwaysAllow: 'garbage' })
    const s = new AlwaysAllowStore(storage)
    expect(s.has('c1', 'a')).toBe(false)
    s.add('c1', 'a')
    expect(s.has('c1', 'a')).toBe(true)
  })

  it('null 저장값도 안전', () => {
    const s = new AlwaysAllowStore(memStorage({ alwaysAllow: null }))
    expect(s.has('c1', 'a')).toBe(false)
    expect(() => s.add('c1', 'a')).not.toThrow()
  })
})
