import { describe, it, expect, vi, beforeEach } from 'vitest'

// MentionTerminalSpawner 는 내부에서 sleep 을 호출하므로 fake timers + 즉시 진행
vi.useFakeTimers()

import { MentionTerminalSpawner } from './MentionTerminalSpawner'

function makeTerminalManager(sessionIds: string[] = []) {
  const sessions = sessionIds.map((id) => ({ id, name: id }))
  return {
    create: vi.fn(({ cwd }: { cwd: string }) => {
      const id = `t-${Math.random().toString(36).slice(2)}`
      sessions.push({ id, name: id })
      return { id, name: id, cwd }
    }),
    setName: vi.fn(),
    listSessions: vi.fn(() => sessions),
    input: vi.fn(),
    _sessions: sessions
  }
}

function makeStore() {
  const data: Record<string, { tabId: string; busy?: boolean; busySince?: number; claudeSessionId?: string }> = {}
  return {
    get: vi.fn((cid: string) => data[cid] || null),
    set: vi.fn((cid: string, tabId: string) => { data[cid] = { ...(data[cid] || {}), tabId } }),
    clear: vi.fn((cid: string) => { delete data[cid] }),
    touch: vi.fn(),
    markBusy: vi.fn((cid: string) => {
      const cur = data[cid] || { tabId: '' }
      data[cid] = { ...cur, busy: true, busySince: Date.now() }
    }),
    markIdle: vi.fn((cid: string) => {
      if (data[cid]) data[cid].busy = false
    }),
    _data: data
  }
}

let tm: ReturnType<typeof makeTerminalManager>
let store: ReturnType<typeof makeStore>
let s: MentionTerminalSpawner

beforeEach(() => {
  tm = makeTerminalManager()
  store = makeStore()
  s = new MentionTerminalSpawner(tm as never, store as never)
})

describe('checkBusy', () => {
  it('store 에 없으면 busy=false', () => {
    expect(s.checkBusy('c1')).toEqual({ busy: false, sinceMs: 0 })
  })

  it('busy=true 이고 탭이 살아있고 timeout 미경과면 busy=true', () => {
    tm._sessions.push({ id: 'tab-1', name: 'x' })
    store._data['c1'] = { tabId: 'tab-1', busy: true, busySince: Date.now() - 1000 }
    const r = s.checkBusy('c1')
    expect(r.busy).toBe(true)
    expect(r.sinceMs).toBeGreaterThan(500)
  })

  it('busy=true 인데 탭이 죽었으면 idle 처리', () => {
    store._data['c1'] = { tabId: 'gone', busy: true, busySince: Date.now() }
    expect(s.checkBusy('c1').busy).toBe(false)
    expect(store.markIdle).toHaveBeenCalledWith('c1')
  })

  it('busy timeout 경과면 idle 처리', () => {
    tm._sessions.push({ id: 'tab-1', name: 'x' })
    store._data['c1'] = { tabId: 'tab-1', busy: true, busySince: Date.now() - 60 * 60 * 1000 }
    expect(s.checkBusy('c1').busy).toBe(false)
    expect(store.markIdle).toHaveBeenCalled()
  })
})

describe('dispatch — 신규 (MISS)', () => {
  it('탭 새로 만들고 claude 명령 + prompt 입력', async () => {
    const p = s.dispatch({
      channelId: 'c1',
      channelName: '채널A',
      channelDir: '/ws/c1',
      promptRelPath: 'tasks/log1.md',
      userRequest: '도와줘'
    })
    await vi.runAllTimersAsync()
    const res = await p
    expect(res.reused).toBe(false)
    expect(tm.create).toHaveBeenCalledWith({ cwd: '/ws/c1' })
    expect(tm.setName).toHaveBeenCalled()
    expect(store.set).toHaveBeenCalledWith('c1', res.tabId, '채널A')
    expect(store.markBusy).toHaveBeenCalledWith('c1')
    // input 호출에 claude 명령 + prompt 라인 + \r 포함
    const allInputs = tm.input.mock.calls.map((c) => c[1] as string)
    // 항상 권한 확인을 건너뛴다 — 위험 동작만 PreToolUse hook(DangerGate)이 두레이 승인을 받는다
    expect(allInputs.some((x) => x.startsWith('claude ') && x.includes('--dangerously-skip-permissions'))).toBe(true)
    expect(allInputs.some((x) => x.includes('acceptEdits'))).toBe(false)
    expect(allInputs.some((x) => x.includes('tasks/log1.md'))).toBe(true)
  })

  it('영속 설정 모드와 무관하게 setApprovalMode 같은 분기가 없다 (항상 skip-permissions)', () => {
    expect((s as unknown as Record<string, unknown>).setApprovalMode).toBeUndefined()
  })

  it('이전 탭이 죽어 있어도 저장된 claude 세션을 --resume 으로 이어받는다 (채널 1:1 세션)', async () => {
    // 예전엔 dead 탭 정보를 지운 뒤 prev 를 읽어 --resume 에 도달하지 못했다
    store._data['c1'] = { tabId: 'dead', busy: false, claudeSessionId: 'sess-1' }
    const p = s.dispatch({
      channelId: 'c1', channelName: 'A', channelDir: '/ws/c1',
      promptRelPath: 'tasks/x.md', userRequest: 'go'
    })
    await vi.runAllTimersAsync()
    await p
    const inputs = tm.input.mock.calls.map((c) => c[1] as string)
    expect(inputs.some((x) => x.startsWith('claude --resume sess-1 --dangerously-skip-permissions'))).toBe(true)
  })

  it('userRequest 빈 문자열이면 안내 문구 prompt 사용', async () => {
    const p = s.dispatch({
      channelId: 'c1', channelName: 'A', channelDir: '/ws/c1',
      promptRelPath: 'tasks/x.md', userRequest: '   '
    })
    await vi.runAllTimersAsync()
    await p
    const inputs = tm.input.mock.calls.map((c) => c[1] as string)
    expect(inputs.some((x) => x.includes('무엇을 도와드릴지'))).toBe(true)
  })

  it('userRequest 의 줄바꿈은 공백으로 치환', async () => {
    const p = s.dispatch({
      channelId: 'c1', channelName: 'A', channelDir: '/ws/c1',
      promptRelPath: 'tasks/x.md', userRequest: '한\n줄\r\n두\n줄'
    })
    await vi.runAllTimersAsync()
    await p
    const inputs = tm.input.mock.calls.map((c) => c[1] as string)
    const promptLine = inputs.find((x) => x.includes('한'))!
    expect(promptLine).not.toMatch(/\n/)
  })
})

describe('dispatch — 재사용 (HIT)', () => {
  it('탭이 살아있으면 reuse=true + activate + input', async () => {
    tm._sessions.push({ id: 'tab-1', name: 'x' })
    store._data['c1'] = { tabId: 'tab-1' }
    const p = s.dispatch({
      channelId: 'c1', channelName: 'A', channelDir: '/ws/c1',
      promptRelPath: 'tasks/y.md', userRequest: 'ping'
    })
    await vi.runAllTimersAsync()
    const res = await p
    expect(res.reused).toBe(true)
    expect(res.tabId).toBe('tab-1')
    expect(tm.create).not.toHaveBeenCalled()
    expect(store.touch).toHaveBeenCalledWith('c1')
    expect(store.markBusy).toHaveBeenCalledWith('c1')
  })

  it('탭이 죽어있으면 store clear 후 신규 spawn', async () => {
    store._data['c1'] = { tabId: 'gone' }
    const p = s.dispatch({
      channelId: 'c1', channelName: 'A', channelDir: '/ws/c1',
      promptRelPath: 'tasks/z.md', userRequest: 'go'
    })
    await vi.runAllTimersAsync()
    const res = await p
    expect(res.reused).toBe(false)
    expect(store.clear).toHaveBeenCalledWith('c1')
  })
})

describe('setMainWindow', () => {
  it('mainWindow 가 destroyed 이면 IPC 전송 skip', async () => {
    const win = { isDestroyed: () => true, isMinimized: vi.fn(), restore: vi.fn(), show: vi.fn(), webContents: { send: vi.fn() } }
    s.setMainWindow(win as never)
    const p = s.dispatch({
      channelId: 'c1', channelName: 'A', channelDir: '/ws/c1',
      promptRelPath: 'tasks/x.md', userRequest: 'go'
    })
    await vi.runAllTimersAsync()
    await p
    expect(win.webContents.send).not.toHaveBeenCalled()
  })

  it('mainWindow 가 살아있으면 신규 spawn 시 OPENED 이벤트 전송', async () => {
    const win = {
      isDestroyed: () => false, isMinimized: () => false,
      restore: vi.fn(), show: vi.fn(),
      webContents: { send: vi.fn() }
    }
    s.setMainWindow(win as never)
    const p = s.dispatch({
      channelId: 'c1', channelName: 'A', channelDir: '/ws/c1',
      promptRelPath: 'tasks/x.md', userRequest: 'go'
    })
    await vi.runAllTimersAsync()
    await p
    expect(win.webContents.send).toHaveBeenCalled()
  })

  it('재사용 시 FOCUS 이벤트 + window.show 호출', async () => {
    tm._sessions.push({ id: 'tab-1', name: 'x' })
    store._data['c1'] = { tabId: 'tab-1' }
    const win = {
      isDestroyed: () => false,
      isMinimized: () => true,
      restore: vi.fn(),
      show: vi.fn(),
      webContents: { send: vi.fn() }
    }
    s.setMainWindow(win as never)
    const p = s.dispatch({
      channelId: 'c1', channelName: 'A', channelDir: '/ws/c1',
      promptRelPath: 'tasks/x.md', userRequest: 'go'
    })
    await vi.runAllTimersAsync()
    await p
    expect(win.restore).toHaveBeenCalled()
    expect(win.show).toHaveBeenCalled()
    expect(win.webContents.send).toHaveBeenCalled()
  })
})

describe('tryReserve / release', () => {
  const req = { channelId: 'c1', channelName: 'A', channelDir: '/ws/c1', promptRelPath: 'tasks/x.md', userRequest: 'go' }

  it('첫 호출은 ok, 같은 채널 연속 호출은 sinceMs 와 함께 거부', () => {
    expect(s.tryReserve('c1')).toEqual({ ok: true })
    vi.advanceTimersByTime(4000)
    const second = s.tryReserve('c1')
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.sinceMs).toBeGreaterThanOrEqual(4000)
  })

  it('다른 채널은 막지 않는다', () => {
    expect(s.tryReserve('c1').ok).toBe(true)
    expect(s.tryReserve('c2').ok).toBe(true)
  })

  it('선점 중에는 checkBusy 도 busy', () => {
    s.tryReserve('c1')
    expect(s.checkBusy('c1').busy).toBe(true)
  })

  it('release 후에는 다시 선점 가능', () => {
    s.tryReserve('c1')
    s.release('c1')
    expect(s.tryReserve('c1')).toEqual({ ok: true })
  })

  it('세션 저장소가 busy 인 채널(탭 생존)은 선점 거부', () => {
    tm._sessions.push({ id: 'tab-1', name: 'x' })
    store._data['c1'] = { tabId: 'tab-1', busy: true, busySince: Date.now() - 1000 }
    expect(s.tryReserve('c1').ok).toBe(false)
  })

  it('dispatch 가 성공하면 선점이 풀리고 세션 busy 로 넘어간다', async () => {
    s.tryReserve('c1')
    const p = s.dispatch(req)
    await vi.runAllTimersAsync()
    await p
    // 선점은 풀렸지만 세션이 busy 라 여전히 거부 — 선점 → busy 인계
    expect(store.markBusy).toHaveBeenCalledWith('c1')
    const r = s.tryReserve('c1')
    expect(r.ok).toBe(false)
    s.release('c1') // 선점이 없었다면 no-op
  })

  it('dispatch 가 예외로 끝나도 선점이 풀린다', async () => {
    tm.create.mockImplementation(() => { throw new Error('pty 실패') })
    s.tryReserve('c1')
    const p = s.dispatch(req).catch((e: Error) => e)
    await vi.runAllTimersAsync()
    const err = await p
    expect((err as Error).message).toBe('pty 실패')
    expect(s.tryReserve('c1')).toEqual({ ok: true })
  })

  it('재사용 경로(HIT)에서도 dispatch 후 선점이 풀린다', async () => {
    tm._sessions.push({ id: 'tab-1', name: 'x' })
    store._data['c1'] = { tabId: 'tab-1', busy: false }
    s.tryReserve('c1')
    const p = s.dispatch(req)
    await vi.runAllTimersAsync()
    const res = await p
    expect(res.reused).toBe(true)
    // 선점 맵이 비었는지: 세션 busy 를 끄면 바로 선점 가능해야 한다
    store._data['c1'].busy = false
    expect(s.tryReserve('c1')).toEqual({ ok: true })
  })
})
