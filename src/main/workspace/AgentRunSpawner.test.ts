import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentRunSpawner, DEFAULT_SPAWN_DELAYS, buildOneLine } from './AgentRunSpawner'

/** 호출 순서를 기록하는 fake TerminalManager + fake sleep. */
function makeHarness(): {
  terminals: { create: ReturnType<typeof vi.fn>; input: ReturnType<typeof vi.fn>; setName: ReturnType<typeof vi.fn> }
  sleep: ReturnType<typeof vi.fn>
  calls: string[]
} {
  const calls: string[] = []
  let seq = 0
  const terminals = {
    create: vi.fn(({ cwd }: { cwd: string }) => {
      calls.push(`create(${cwd})`)
      return { id: `t-${++seq}`, name: 't', cwd, pid: 1, createdAt: Date.now() }
    }),
    setName: vi.fn((id: string, name: string) => {
      calls.push(`setName(${id},${name})`)
    }),
    input: vi.fn((id: string, data: string) => {
      calls.push(`input(${id},${JSON.stringify(data)})`)
    })
  }
  const sleep = vi.fn(async (ms: number) => {
    calls.push(`sleep(${ms})`)
  })
  return { terminals, sleep, calls }
}

describe('DEFAULT_SPAWN_DELAYS', () => {
  it('멘션 스포너(MentionTerminalSpawner) 의 1500/3000/200 과 동일 — 드리프트 감지용 값 고정', () => {
    expect(DEFAULT_SPAWN_DELAYS).toEqual({ bootMs: 1500, readyMs: 3000, submitMs: 200 })
  })
})

describe('AgentRunSpawner.spawn — 기본 시퀀스 (AC6-①)', () => {
  it('create → setName → sleep(boot) → claude\\r → sleep(ready) → prompt → sleep(submit) → \\r 순서', async () => {
    const { terminals, sleep, calls } = makeHarness()
    const spawner = new AgentRunSpawner(terminals, DEFAULT_SPAWN_DELAYS, sleep)

    const result = await spawner.spawn({
      cwd: '/repo/.x-worktrees/feature-a',
      tabName: '#123 제목',
      prompt: '테스트 지시',
      autoApprove: false
    })

    expect(result.terminalSessionId).toBe('t-1')
    expect(calls).toEqual([
      'create(/repo/.x-worktrees/feature-a)',
      'setName(t-1,#123 제목)',
      'sleep(1500)',
      'input(t-1,"claude\\r")',
      'sleep(3000)',
      'input(t-1,"테스트 지시")',
      'sleep(200)',
      'input(t-1,"\\r")'
    ])
  })
})

describe('AgentRunSpawner.spawn — autoApprove (AC6-②)', () => {
  it('기본(false) 이면 --dangerously-skip-permissions 미포함', async () => {
    const { terminals, sleep } = makeHarness()
    const spawner = new AgentRunSpawner(terminals, DEFAULT_SPAWN_DELAYS, sleep)
    await spawner.spawn({ cwd: '/wt', tabName: 't', prompt: '', autoApprove: false })
    const claudeInput = terminals.input.mock.calls[0][1] as string
    expect(claudeInput).toBe('claude\r')
  })

  it('true 면 --dangerously-skip-permissions 포함', async () => {
    const { terminals, sleep } = makeHarness()
    const spawner = new AgentRunSpawner(terminals, DEFAULT_SPAWN_DELAYS, sleep)
    await spawner.spawn({ cwd: '/wt', tabName: 't', prompt: '', autoApprove: true })
    const claudeInput = terminals.input.mock.calls[0][1] as string
    expect(claudeInput).toBe('claude --dangerously-skip-permissions\r')
  })
})

describe('AgentRunSpawner.spawn — resumeSessionId (AC6-③)', () => {
  it('claude --resume <sid> 로 spawn', async () => {
    const { terminals, sleep } = makeHarness()
    const spawner = new AgentRunSpawner(terminals, DEFAULT_SPAWN_DELAYS, sleep)
    await spawner.spawn({ cwd: '/wt', tabName: 't', prompt: '', autoApprove: false, resumeSessionId: 'sess-1' })
    const claudeInput = terminals.input.mock.calls[0][1] as string
    expect(claudeInput).toBe('claude --resume sess-1\r')
  })

  it('resume + autoApprove 동시 지정 시 resume 뒤에 skip-permissions', async () => {
    const { terminals, sleep } = makeHarness()
    const spawner = new AgentRunSpawner(terminals, DEFAULT_SPAWN_DELAYS, sleep)
    await spawner.spawn({ cwd: '/wt', tabName: 't', prompt: '', autoApprove: true, resumeSessionId: 'sess-1' })
    const claudeInput = terminals.input.mock.calls[0][1] as string
    expect(claudeInput).toBe('claude --resume sess-1 --dangerously-skip-permissions\r')
  })
})

describe('AgentRunSpawner.spawn — 빈 프롬프트 (AC6-④)', () => {
  it('claude 실행 input 1회뿐 — ready 대기/프롬프트 타이핑 0회', async () => {
    const { terminals, sleep, calls } = makeHarness()
    const spawner = new AgentRunSpawner(terminals, DEFAULT_SPAWN_DELAYS, sleep)
    const result = await spawner.spawn({ cwd: '/wt', tabName: 't', prompt: '', autoApprove: false })

    expect(result.terminalSessionId).toBe('t-1')
    expect(terminals.input).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledTimes(1) // boot 대기만
    expect(calls).toEqual([
      'create(/wt)',
      'setName(t-1,t)',
      'sleep(1500)',
      'input(t-1,"claude\\r")'
    ])
  })
})

describe('buildOneLine', () => {
  it('개행을 공백으로 접는다', () => {
    expect(buildOneLine('한\n줄\r\n두\n줄')).not.toMatch(/[\r\n]/)
    expect(buildOneLine('한\n줄')).toBe('한 줄')
  })

  it('앞뒤 공백을 trim 한다', () => {
    expect(buildOneLine('  hello  ')).toBe('hello')
  })

  it('2000자 이하면 그대로', () => {
    const short = 'a'.repeat(100)
    expect(buildOneLine(short)).toBe(short)
  })

  it('2000자 초과 시 잘라내고 경로 안내 꼬리를 붙인다', () => {
    const long = 'a'.repeat(2500)
    const result = buildOneLine(long, '/workspace/run-1/prompt.md')
    expect(result.startsWith('a'.repeat(2000))).toBe(true)
    expect(result).toContain('(전체 프롬프트: /workspace/run-1/prompt.md)')
    expect(result.length).toBe(2000 + ' (전체 프롬프트: /workspace/run-1/prompt.md)'.length)
  })

  it('2000자 초과인데 promptPath 가 없으면 꼬리 없이 잘라내기만', () => {
    const long = 'b'.repeat(2100)
    const result = buildOneLine(long)
    expect(result).toBe('b'.repeat(2000))
  })
})

describe('AgentRunSpawner.spawn — tabName 은 60자로 잘려 setName 에 전달', () => {
  it('60자 초과 tabName 은 잘림', async () => {
    const { terminals, sleep } = makeHarness()
    const spawner = new AgentRunSpawner(terminals, DEFAULT_SPAWN_DELAYS, sleep)
    const longName = 'x'.repeat(80)
    await spawner.spawn({ cwd: '/wt', tabName: longName, prompt: '', autoApprove: false })
    expect(terminals.setName).toHaveBeenCalledWith('t-1', 'x'.repeat(60))
  })
})

describe('AgentRunSpawner — 기본 sleep 미주입 시에도 동작 (real timers)', () => {
  beforeEach(() => vi.useRealTimers())

  it('delays 를 0 으로 주입하면 실동작 완료', async () => {
    const { terminals } = makeHarness()
    const spawner = new AgentRunSpawner(terminals, { bootMs: 0, readyMs: 0, submitMs: 0 })
    const result = await spawner.spawn({ cwd: '/wt', tabName: 't', prompt: 'hi', autoApprove: false })
    expect(result.terminalSessionId).toBe('t-1')
    expect(terminals.input).toHaveBeenCalledTimes(3)
  })
})
