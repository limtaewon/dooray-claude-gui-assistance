import { describe, it, expect, vi, beforeEach } from 'vitest'

const notificationShow = vi.fn()
const notificationOn = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: class {},
  Notification: class {
    constructor(public opts: unknown) {}
    on = notificationOn
    show = notificationShow
  }
}))

const { ClaudeDoneNotifier } = await import('./ClaudeDoneNotifier')

const SETTINGS = { enabled: true, onlyWhenUnfocused: true, idleSeconds: 10 }
/** BEL — claude 알림이 terminal bell 일 때 오는 즉시 신호 */
const BELL = ''

function makeNotifier(over?: {
  foreground?: string | null
  focused?: boolean
  settings?: Partial<typeof SETTINGS>
}) {
  const send = vi.fn()
  let now = 1_000_000
  const notifier = new ClaudeDoneNotifier({
    getForeground: () => over?.foreground ?? 'claude',
    getLabel: () => '2NEON',
    getSettings: () => ({ ...SETTINGS, ...over?.settings }),
    getWindow: () =>
      ({
        isDestroyed: () => false,
        isFocused: () => over?.focused ?? false,
        webContents: { send }
      }) as never,
    now: () => now,
    scheduler: { setInterval: (() => 1) as never, clearInterval: (() => {}) as never }
  })
  return {
    notifier,
    send,
    advance: (ms: number): void => {
      now += ms
    },
    tick: (): void => (notifier as unknown as { tick: () => void }).tick()
  }
}

beforeEach(() => {
  notificationShow.mockClear()
  notificationOn.mockClear()
})

describe('ClaudeDoneNotifier', () => {
  it('출력이 멎으면 알린다', () => {
    const { notifier, advance, tick } = makeNotifier()
    notifier.handleOutput('s1', '작업 중…')

    advance(10_000)
    tick()

    expect(notificationShow).toHaveBeenCalledTimes(1)
  })

  it('한 번만 알린다 — tick 마다 울리면 못 쓴다', () => {
    const { notifier, advance, tick } = makeNotifier()
    notifier.handleOutput('s1', 'x')

    advance(10_000)
    tick()
    advance(10_000)
    tick()

    expect(notificationShow).toHaveBeenCalledTimes(1)
  })

  it('다시 움직였다 멎으면 또 알린다', () => {
    const { notifier, advance, tick } = makeNotifier()
    notifier.handleOutput('s1', 'x')
    advance(10_000)
    tick()

    notifier.handleOutput('s1', '다음 작업')
    advance(10_000)
    tick()

    expect(notificationShow).toHaveBeenCalledTimes(2)
  })

  it('벨이 오면 기다리지 않고 바로 알린다', () => {
    const { notifier } = makeNotifier()
    notifier.handleOutput('s1', `done${BELL}`)
    expect(notificationShow).toHaveBeenCalledTimes(1)
  })

  it('claude 가 아니면 알리지 않는다 — 빌드 로그가 끝났다고 울리면 성가시다', () => {
    const { notifier, advance, tick } = makeNotifier({ foreground: 'npm' })
    notifier.handleOutput('s1', 'build 로그')
    advance(60_000)
    tick()
    expect(notificationShow).not.toHaveBeenCalled()
  })

  it('설정이 꺼져 있으면 알리지 않는다', () => {
    const { notifier, advance, tick } = makeNotifier({ settings: { enabled: false } })
    notifier.handleOutput('s1', 'x')
    advance(60_000)
    tick()
    expect(notificationShow).not.toHaveBeenCalled()
  })

  it('창을 보고 있으면 OS 알림은 띄우지 않되 렌더러에는 알린다 — 탭 표시는 남아야 한다', () => {
    const { notifier, send, advance, tick } = makeNotifier({ focused: true })
    notifier.handleOutput('s1', 'x')
    advance(10_000)
    tick()

    expect(notificationShow).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('terminal:claude-done', { sessionId: 's1' })
  })

  it('세션이 끝나면 상태를 잊는다', () => {
    const { notifier, advance, tick } = makeNotifier()
    notifier.handleOutput('s1', 'x')
    notifier.forget('s1')

    advance(60_000)
    tick()

    expect(notificationShow).not.toHaveBeenCalled()
  })
})
