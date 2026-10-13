import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ProgressReporter, phaseOfTool } from './ProgressReporter'

describe('phaseOfTool', () => {
  it.each([
    ['Read', '코드 확인 중'],
    ['Grep', '코드 확인 중'],
    ['Glob', '코드 확인 중'],
    ['LS', '코드 확인 중'],
    ['Edit', '파일 수정 중'],
    ['MultiEdit', '파일 수정 중'],
    ['Write', '파일 수정 중'],
    ['NotebookEdit', '파일 수정 중'],
    ['Bash', '명령 실행 중'],
    ['WebFetch', '웹 검색 중'],
    ['WebSearch', '웹 검색 중'],
    ['Task', '하위 작업 진행 중'],
    ['Agent', '하위 작업 진행 중'],
    ['Skill', '스킬 적용 중'],
    ['TodoWrite', '작업 중'],
    ['SomethingNew', '작업 중'],
    ['mcp__dooray-mcp__get_task', '두레이 조회 중'],
    ['mcp__dooray-mcp__list_projects', '두레이 조회 중'],
    ['mcp__dooray-mcp__create_task', '두레이 작성 중'],
    ['mcp__dooray-mcp__send_message_to_channel', '두레이 작성 중'],
    ['mcp__mysql-nfi__describe_table', 'DB 조회 중'],
    ['mcp__mysql-nfi__execute_update', 'DB 변경 중'],
    ['mcp__clickhouse__run_query', 'DB 조회 중'],
    ['mcp__grafana__query_prometheus', '모니터링 조회 중'],
    ['mcp__drop__drop_list_projects', 'Drop 작업 중'],
    ['mcp__drop__drop_publish', 'Drop 작업 중'],
    ['mcp__other__fetch_x', '외부 도구 조회 중'],
    ['mcp__other__create_x', '외부 도구로 작성 중']
  ])('%s → %s', (tool, phase) => {
    expect(phaseOfTool(tool)).toBe(phase)
  })

  it('도구 세부(파일명·명령)는 단계 문구에 나오지 않는다', () => {
    expect(phaseOfTool('Bash')).not.toMatch(/[/\\.]/)
  })
})

const T0 = 1_000_000

function setup() {
  const updateMessage = vi.fn().mockResolvedValue(undefined)
  const reporter = new ProgressReporter({ updateMessage } as never)
  return { reporter, updateMessage }
}
const target = (over: Record<string, unknown> = {}) => ({ replyChannelId: 'reply-1', progressLogId: 'prog-1', startedAt: T0, ...over })
const tick = async (ms: number): Promise<void> => { await vi.advanceTimersByTimeAsync(ms) }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ProgressReporter — 갱신', () => {
  it('첫 도구 이벤트는 바로 PUT: "[Clauday] ⏳ 작업 중 · m:ss · 단계"', async () => {
    const { reporter, updateMessage } = setup()
    reporter.start('c1', target())
    await tick(7000)
    reporter.onTool('c1', 'Read')
    await tick(0)
    expect(updateMessage).toHaveBeenCalledTimes(1)
    expect(updateMessage).toHaveBeenCalledWith('reply-1', 'prog-1', '[Clauday] ⏳ 작업 중 · 0:07 · 코드 확인 중')
    await reporter.stop('c1')
  })

  it('progressLogId 가 없으면 추적하지 않는다 (이벤트·heartbeat 모두 무시)', async () => {
    const { reporter, updateMessage } = setup()
    reporter.start('c1', target({ progressLogId: null }))
    reporter.onTool('c1', 'Bash')
    await tick(5 * 60_000)
    expect(updateMessage).not.toHaveBeenCalled()
    await expect(reporter.stop('c1')).resolves.toBeUndefined()
  })

  it('start 안 한 채널의 이벤트는 무시', async () => {
    const { reporter, updateMessage } = setup()
    reporter.onTool('nope', 'Bash')
    reporter.setPhase('nope', '승인 대기')
    await tick(10_000)
    expect(updateMessage).not.toHaveBeenCalled()
  })

  it('5초 스로틀 — 직전 갱신 후 5초가 지나야 다음 단계를 보낸다', async () => {
    const { reporter, updateMessage } = setup()
    reporter.start('c1', target())
    reporter.onTool('c1', 'Read')
    await tick(0)
    expect(updateMessage).toHaveBeenCalledTimes(1)

    await tick(1000)
    reporter.onTool('c1', 'Bash')
    await tick(3999)
    expect(updateMessage).toHaveBeenCalledTimes(1)
    await tick(1)
    expect(updateMessage).toHaveBeenCalledTimes(2)
    expect(updateMessage.mock.calls[1][2]).toBe('[Clauday] ⏳ 작업 중 · 0:05 · 명령 실행 중')
    await reporter.stop('c1')
  })

  it('스로틀 창 안의 여러 단계 변화는 마지막 것 하나로 합친다', async () => {
    const { reporter, updateMessage } = setup()
    reporter.start('c1', target())
    reporter.onTool('c1', 'Read')
    await tick(0)
    reporter.onTool('c1', 'Bash')
    reporter.onTool('c1', 'Edit')
    reporter.onTool('c1', 'WebFetch')
    await tick(5000)
    expect(updateMessage).toHaveBeenCalledTimes(2)
    expect(updateMessage.mock.calls[1][2]).toContain('웹 검색 중')
    await reporter.stop('c1')
  })

  it('같은 단계가 반복되면 무시', async () => {
    const { reporter, updateMessage } = setup()
    reporter.start('c1', target())
    reporter.onTool('c1', 'Read')
    await tick(0)
    reporter.onTool('c1', 'Grep') // 같은 "코드 확인 중"
    reporter.onTool('c1', 'Glob')
    await tick(30_000)
    expect(updateMessage).toHaveBeenCalledTimes(1)
    await reporter.stop('c1')
  })

  it('setPhase 로 단계 문구를 직접 바꿀 수 있다 (승인 대기)', async () => {
    const { reporter, updateMessage } = setup()
    reporter.start('c1', target())
    reporter.setPhase('c1', '두레이 승인 대기 중')
    await tick(0)
    expect(updateMessage.mock.calls[0][2]).toBe('[Clauday] ⏳ 작업 중 · 0:00 · 두레이 승인 대기 중')
    await reporter.stop('c1')
  })

  it('채널마다 독립적으로 추적', async () => {
    const { reporter, updateMessage } = setup()
    reporter.start('c1', target())
    reporter.start('c2', target({ replyChannelId: 'reply-2', progressLogId: 'prog-2' }))
    reporter.onTool('c2', 'Bash')
    await tick(0)
    expect(updateMessage).toHaveBeenCalledTimes(1)
    expect(updateMessage).toHaveBeenCalledWith('reply-2', 'prog-2', expect.stringContaining('명령 실행 중'))
    await reporter.stop('c1')
    await reporter.stop('c2')
  })
})

describe('ProgressReporter — heartbeat', () => {
  it('단계 변화가 없어도 60초마다 경과 시간을 갱신', async () => {
    const { reporter, updateMessage } = setup()
    reporter.start('c1', target())
    await tick(59_999)
    expect(updateMessage).not.toHaveBeenCalled()
    await tick(1)
    expect(updateMessage).toHaveBeenCalledTimes(1)
    expect(updateMessage.mock.calls[0][2]).toBe('[Clauday] ⏳ 작업 중 · 1:00 · 작업 중')
    await tick(60_000)
    expect(updateMessage).toHaveBeenCalledTimes(2)
    expect(updateMessage.mock.calls[1][2]).toBe('[Clauday] ⏳ 작업 중 · 2:00 · 작업 중')
    await reporter.stop('c1')
  })

  it('stop 하면 heartbeat 도 멈춘다', async () => {
    const { reporter, updateMessage } = setup()
    reporter.start('c1', target())
    await reporter.stop('c1')
    await tick(5 * 60_000)
    expect(updateMessage).not.toHaveBeenCalled()
  })
})

describe('ProgressReporter — stop', () => {
  it('예약된 갱신을 취소한다', async () => {
    const { reporter, updateMessage } = setup()
    reporter.start('c1', target())
    reporter.onTool('c1', 'Read')
    await tick(0)
    reporter.onTool('c1', 'Bash') // 5초 뒤로 예약됨
    await reporter.stop('c1')
    await tick(10_000)
    expect(updateMessage).toHaveBeenCalledTimes(1)
  })

  it('보내는 중인 갱신이 끝날 때까지 기다린다 (완료 표기가 덮이지 않게)', async () => {
    const { reporter, updateMessage } = setup()
    let release!: () => void
    updateMessage.mockImplementation(() => new Promise<void>((r) => { release = r }))
    reporter.start('c1', target())
    reporter.onTool('c1', 'Read')
    await tick(0)
    expect(updateMessage).toHaveBeenCalledTimes(1)

    let stopped = false
    const stopping = reporter.stop('c1').then(() => { stopped = true })
    await tick(0)
    expect(stopped).toBe(false)
    release()
    await stopping
    expect(stopped).toBe(true)
  })

  it('보내는 중인 갱신이 실패해도 stop 은 정상 종료', async () => {
    const { reporter, updateMessage } = setup()
    let fail!: (e: Error) => void
    updateMessage.mockImplementation(() => new Promise<void>((_, rej) => { fail = rej }))
    reporter.start('c1', target())
    reporter.onTool('c1', 'Read')
    await tick(0)
    const stopping = reporter.stop('c1')
    fail(new Error('500'))
    await expect(stopping).resolves.toBeUndefined()
  })

  it('추적 중이 아닌 채널을 stop 해도 안전', async () => {
    const { reporter } = setup()
    await expect(reporter.stop('none')).resolves.toBeUndefined()
  })

  it('stop 이후의 이벤트는 무시', async () => {
    const { reporter, updateMessage } = setup()
    reporter.start('c1', target())
    await reporter.stop('c1')
    reporter.onTool('c1', 'Bash')
    await tick(10_000)
    expect(updateMessage).not.toHaveBeenCalled()
  })

  it('start 를 다시 부르면 이전 추적을 정리하고 새로 시작', async () => {
    const { reporter, updateMessage } = setup()
    reporter.start('c1', target({ progressLogId: 'old' }))
    reporter.onTool('c1', 'Bash') // 예약만 하고 아직 안 보냄
    reporter.start('c1', target({ progressLogId: 'new', startedAt: T0 }))
    await tick(0)
    expect(updateMessage).not.toHaveBeenCalled() // 새 추적은 아직 단계 변화 없음
    reporter.onTool('c1', 'Read')
    await tick(0)
    expect(updateMessage).toHaveBeenCalledTimes(1)
    expect(updateMessage.mock.calls[0][1]).toBe('new')
    await reporter.stop('c1')
  })
})

describe('ProgressReporter — 실패 처리', () => {
  it('updateMessage 실패는 throw 하지 않고 warn 후 다음 갱신 계속', async () => {
    const { reporter, updateMessage } = setup()
    updateMessage.mockRejectedValueOnce(new Error('500')).mockResolvedValue(undefined)
    reporter.start('c1', target())
    reporter.onTool('c1', 'Read')
    await tick(0)
    expect(console.warn).toHaveBeenCalled()
    reporter.onTool('c1', 'Bash')
    await tick(5000)
    expect(updateMessage).toHaveBeenCalledTimes(2)
    await reporter.stop('c1')
  })

  it('스로틀 창 안에서 A→B→A 로 돌아와도 경과 시간이 달라지면 한 번 더 보낸다', async () => {
    const { reporter, updateMessage } = setup()
    reporter.start('c1', target())
    reporter.setPhase('c1', 'A')
    await tick(0)
    reporter.setPhase('c1', 'B')
    reporter.setPhase('c1', 'A')
    await tick(5000) // 5초 뒤 문구는 "0:05 · A" — 경과가 달라 전송됨
    expect(updateMessage).toHaveBeenCalledTimes(2)
    await reporter.stop('c1')
  })
})
