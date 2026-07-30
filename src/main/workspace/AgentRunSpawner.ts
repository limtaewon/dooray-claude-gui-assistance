import type { TerminalManager } from '../terminal/TerminalManager'

/**
 * 출처: `src/main/dooray/mention/MentionTerminalSpawner.ts` 의 `dispatch()` (v1.4~) 시퀀스를
 * 복제해 두레이 채널 결합을 제거한 버전 — ADR-v2-workspace-p1-04. 타이밍 상수(boot/ready/submit)를
 * 바꾸려면 양쪽을 같이 본다. 멘션 파이프라인 자체는 이 클래스로 재배선하지 않는다(비목표).
 */

export interface SpawnDelays {
  bootMs: number
  readyMs: number
  submitMs: number
}

/** `MentionTerminalSpawner` 의 1500/3000/200 과 동일 값 — 드리프트 감지는 값 고정 테스트로. */
export const DEFAULT_SPAWN_DELAYS: SpawnDelays = { bootMs: 1500, readyMs: 3000, submitMs: 200 }

export interface AgentSpawnRequest {
  /** 워크트리 경로 */
  cwd: string
  tabName: string
  /** 빈 문자열이면 자동 타이핑 없이 `claude` 만 실행 */
  prompt: string
  /** 프롬프트 원본 파일(워크트리 밖). 2000자 초과 시 한 줄 타이핑 꼬리에 안내로 붙는다 */
  promptPath?: string
  autoApprove: boolean
  resumeSessionId?: string
}

/** 자동 타이핑 한 줄의 길이 상한. 초과분은 잘라내고 원본 파일 경로 안내를 붙인다. */
const PROMPT_MAX_LEN = 2000

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 개행을 공백으로 접어 한 줄로 만든다. claude TUI 는 텍스트 안에 개행이 섞이면 그 지점에서
 * submit 되어 나머지가 프롬프트로 흩어진다 (멘션의 `buildOneLiner` 와 동일한 방어).
 * 길이가 `PROMPT_MAX_LEN` 을 넘으면 잘라내고 원본 파일 경로 안내를 꼬리에 붙인다.
 */
export function buildOneLine(prompt: string, promptPath?: string): string {
  const collapsed = prompt.replace(/[\r\n]+/g, ' ').trim()
  if (collapsed.length <= PROMPT_MAX_LEN) return collapsed
  const suffix = promptPath ? ` (전체 프롬프트: ${promptPath})` : ''
  return collapsed.slice(0, PROMPT_MAX_LEN) + suffix
}

/**
 * 워크트리에서 claude code 를 자동 기동하는 TUI 시퀀스.
 * `create → 대기 → 'claude [--resume sid] [--dangerously-skip-permissions]\r' → (prompt 있으면) 대기 → 프롬프트 → 대기 → '\r'`
 * 렌더러 탭 목록으로 push 하지 않는다 — 워크스페이스 run 의 터미널은 `run.terminalSessionId` 로 직접 attach.
 */
export class AgentRunSpawner {
  constructor(
    private terminals: Pick<TerminalManager, 'create' | 'input' | 'setName'>,
    private delays: SpawnDelays = DEFAULT_SPAWN_DELAYS,
    private sleep: (ms: number) => Promise<void> = defaultSleep
  ) {}

  async spawn(req: AgentSpawnRequest): Promise<{ terminalSessionId: string }> {
    const meta = this.terminals.create({ cwd: req.cwd })
    this.terminals.setName(meta.id, req.tabName.slice(0, 60))

    await this.sleep(this.delays.bootMs)
    const parts = ['claude']
    if (req.resumeSessionId) parts.push('--resume', req.resumeSessionId)
    if (req.autoApprove) parts.push('--dangerously-skip-permissions')
    this.terminals.input(meta.id, `${parts.join(' ')}\r`)

    if (!req.prompt) return { terminalSessionId: meta.id }

    await this.sleep(this.delays.readyMs)
    this.terminals.input(meta.id, buildOneLine(req.prompt, req.promptPath))
    await this.sleep(this.delays.submitMs)
    this.terminals.input(meta.id, '\r')

    return { terminalSessionId: meta.id }
  }
}
