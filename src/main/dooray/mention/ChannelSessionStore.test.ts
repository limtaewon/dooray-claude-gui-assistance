import { describe, it, expect, vi, beforeEach } from 'vitest'

// electron-store 모듈 모킹 — 메모리 백엔드로 대체
vi.mock('electron-store', () => {
  class MemStore<T extends Record<string, unknown>> {
    private data: T
    constructor(opts: { defaults: T }) {
      this.data = { ...opts.defaults }
    }
    get(key: string, fallback?: unknown): unknown {
      return (this.data as Record<string, unknown>)[key] ?? fallback
    }
    set(key: string, value: unknown): void {
      ;(this.data as Record<string, unknown>)[key] = value
    }
    delete(key: string): void {
      delete (this.data as Record<string, unknown>)[key]
    }
  }
  return { default: MemStore }
})

import { ChannelSessionStore } from './ChannelSessionStore'

let store: ChannelSessionStore

beforeEach(() => {
  store = new ChannelSessionStore()
})

describe('ChannelSessionStore — 기본 CRUD', () => {
  it('처음에는 null', () => {
    expect(store.get('c1')).toBeNull()
  })

  it('set 후 get', () => {
    store.set('c1', 'tab-1', '채널A', 'org-1')
    const s = store.get('c1')!
    expect(s.tabId).toBe('tab-1')
    expect(s.channelName).toBe('채널A')
    expect(s.organizationId).toBe('org-1')
    expect(typeof s.lastUsedAt).toBe('number')
  })

  it('clear 로 삭제', () => {
    store.set('c1', 'tab-1')
    store.clear('c1')
    expect(store.get('c1')).toBeNull()
  })

  it('clear: 존재하지 않는 채널은 no-op', () => {
    expect(() => store.clear('missing')).not.toThrow()
  })

  it('findByTabId 로 역방향 조회', () => {
    store.set('c1', 'tab-A')
    store.set('c2', 'tab-B')
    const r = store.findByTabId('tab-B')
    expect(r?.channelId).toBe('c2')
  })

  it('findByTabId 일치 없으면 null', () => {
    store.set('c1', 'tab-A')
    expect(store.findByTabId('nope')).toBeNull()
  })

  it('touch: lastUsedAt 갱신, 다른 필드는 보존', async () => {
    store.set('c1', 'tab-1', '채널A', 'org-1')
    const before = store.get('c1')!.lastUsedAt
    await new Promise((r) => setTimeout(r, 5))
    store.touch('c1')
    const after = store.get('c1')!
    expect(after.lastUsedAt).toBeGreaterThanOrEqual(before)
    expect(after.tabId).toBe('tab-1')
  })

  it('touch: 없는 채널이면 no-op', () => {
    expect(() => store.touch('missing')).not.toThrow()
    expect(store.get('missing')).toBeNull()
  })
})

describe('ChannelSessionStore — busy/idle/claudeSessionId', () => {
  it('markBusy → busy=true, busySince 설정', () => {
    store.set('c1', 'tab-1')
    store.markBusy('c1')
    const s = store.get('c1')!
    expect(s.busy).toBe(true)
    expect(typeof s.busySince).toBe('number')
  })

  it('markIdle 로 busy 해제', () => {
    store.set('c1', 'tab-1')
    store.markBusy('c1')
    store.markIdle('c1')
    expect(store.get('c1')!.busy).toBe(false)
  })

  it('markBusy/markIdle: 없는 채널 no-op', () => {
    expect(() => store.markBusy('x')).not.toThrow()
    expect(() => store.markIdle('x')).not.toThrow()
  })

  it('set 은 busy/claudeSessionId 를 보존', () => {
    store.set('c1', 'tab-1')
    store.markBusy('c1')
    store.setClaudeSessionId('c1', 'sess-1')
    store.set('c1', 'tab-2', '새이름')  // re-set 시 busy 유지
    const s = store.get('c1')!
    expect(s.tabId).toBe('tab-2')
    expect(s.busy).toBe(true)
    expect(s.claudeSessionId).toBe('sess-1')
  })

  it('setClaudeSessionId: 동일 값 재설정은 no-op', () => {
    store.set('c1', 'tab-1')
    store.setClaudeSessionId('c1', 's1')
    store.setClaudeSessionId('c1', 's1')
    expect(store.get('c1')!.claudeSessionId).toBe('s1')
  })

  it('setClaudeSessionId: 채널 없으면 no-op', () => {
    expect(() => store.setClaudeSessionId('missing', 's1')).not.toThrow()
  })
})
