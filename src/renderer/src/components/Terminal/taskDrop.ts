import type { TaskDropTarget } from '@shared/types/workspace'

/** 드롭 시퀀스의 한 단계 — `data` 를 PTY 에 쓰고 `delayMs` 만큼 기다린다. */
export interface TaskDropStep {
  data: string
  delayMs: number
  /** 진행 상태 표시용 라벨 */
  label: string
}

export interface TaskDropCommandInput {
  target: TaskDropTarget
  /** 렌더링이 끝난 첫 지시. null 이면 claude 만 띄우고 지시는 사용자가 직접 한다 */
  prompt: string | null
  /** 지금 터미널이 있는 폴더 — target 과 같으면 `cd` 를 넣지 않는다 */
  currentCwd?: string
  /** `--dangerously-skip-permissions` 로 실행 */
  skipPermissions?: boolean
  /** 셸 부팅 대기 없이 이미 프롬프트가 떠 있는 pane 이라고 가정한다 */
  delays?: { boot: number; ready: number; submit: number }
}

export const DEFAULT_DROP_DELAYS = { boot: 400, ready: 3000, submit: 200 }

/** 셸에 안전하게 넘길 수 있게 작은따옴표로 감싼다 (내부 `'` 는 `'\''` 로 탈출). */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** 두 경로가 같은 폴더를 가리키는지 — 뒤 슬래시 차이만 무시한다. */
function samePath(a: string | undefined, b: string): boolean {
  if (!a) return false
  const norm = (p: string): string => p.replace(/[/\\]+$/, '')
  return norm(a) === norm(b)
}

/**
 * 태스크 드롭 → 터미널에 보낼 입력 시퀀스를 만든다.
 *
 * **이미 그 폴더에 있으면 `cd` 를 넣지 않는다.** 1 업무 N 저장소가 현실이라 사용자가 터미널을
 * 원하는 폴더로 옮겨두고 놓는 흐름이 기본이다 — 거기서 또 `cd` 하면 그 선택을 덮어쓴다.
 * 세션이 연결돼 있으면 `--resume` 으로 이어가고 프롬프트를 다시 넣지 않는다(문맥이 이미 있다).
 */
export function buildTaskDropSteps(input: TaskDropCommandInput): TaskDropStep[] {
  const { target, prompt, currentCwd, skipPermissions } = input
  const delays = input.delays ?? DEFAULT_DROP_DELAYS
  const steps: TaskDropStep[] = []

  if (!samePath(currentCwd, target.cwd)) {
    steps.push({
      data: `cd ${shellQuote(target.cwd)}\r`,
      delayMs: delays.boot,
      label: `${target.repoName} 로 이동`
    })
  }

  const flags = skipPermissions ? ' --dangerously-skip-permissions' : ''

  if (target.claudeSessionId) {
    steps.push({
      data: `claude${flags} --resume ${target.claudeSessionId}\r`,
      delayMs: delays.ready,
      label: '이전 세션 이어가기'
    })
    return steps
  }

  steps.push({ data: `claude${flags}\r`, delayMs: delays.ready, label: 'claude 시작' })
  if (prompt) {
    steps.push({ data: prompt, delayMs: delays.submit, label: '업무 내용 전달' })
    steps.push({ data: '\r', delayMs: 0, label: '전송' })
  }
  return steps
}
