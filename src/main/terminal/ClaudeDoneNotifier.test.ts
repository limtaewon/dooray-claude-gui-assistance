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

const SETTINGS = { enabled: true, onlyWhenUnfocused: true, idleSeconds: 10, idleFallback: true }
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

const ESC = '\u001b'
const title = (t: string): string => `${ESC}]0;${t}${BELL}`
/** 타이틀 신호를 쓰는 세션 — working 으로 들어갔다 나온다. */
const WORKING_TITLE = '\u2807 claude working'
const IDLE_TITLE = '\u2733 claude'

describe('ClaudeDoneNotifier — 타이틀 전이(1순위)', () => {
  it('working → idle 이면 즉시 알린다', () => {
    const { notifier } = makeNotifier()
    notifier.handleOutput('s1', title(WORKING_TITLE))
    expect(notificationShow).not.toHaveBeenCalled()

    notifier.handleOutput('s1', title(IDLE_TITLE))
    expect(notificationShow).toHaveBeenCalledTimes(1)
  })

  it('타이틀을 주는 세션에는 무출력 폴백을 쓰지 않는다 — 도구가 오래 돌 때의 오탐이 여기서 난다', () => {
    const { notifier, advance, tick } = makeNotifier()
    notifier.handleOutput('s1', title(WORKING_TITLE))

    advance(60_000)
    tick()

    expect(notificationShow).not.toHaveBeenCalled()
  })

  it('타이틀과 벨이 같이 와도 한 번만 알린다', () => {
    vi.useFakeTimers()
    const { notifier } = makeNotifier()
    notifier.handleOutput('s1', title(WORKING_TITLE))
    notifier.handleOutput('s1', `${title(IDLE_TITLE)}${BELL}`)
    vi.advanceTimersByTime(500)

    expect(notificationShow).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('알림 본문에 마지막 출력 줄을 담는다', () => {
    const { notifier } = makeNotifier()
    notifier.handleOutput('s1', title(WORKING_TITLE))
    notifier.handleOutput('s1', '작업을 마쳤습니다. 테스트 3개 추가.\n')
    notifier.handleOutput('s1', title(IDLE_TITLE))

    const opts = (notificationShow.mock.instances[0] as { opts: { body: string } }).opts
    expect(opts.body).toContain('테스트 3개 추가')
  })
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

  it('벨은 짧은 유예 뒤에 알린다 — 타이틀 전이가 곧 오면 그쪽이 이기게', () => {
    vi.useFakeTimers()
    const { notifier } = makeNotifier()
    notifier.handleOutput('s1', `done${BELL}`)
    expect(notificationShow).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(notificationShow).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
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
    expect(send).toHaveBeenCalledWith('terminal:claude-done', { sessionId: 's1', source: 'idle' })
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
