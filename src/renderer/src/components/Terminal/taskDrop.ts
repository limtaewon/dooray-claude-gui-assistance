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
  /** 태스크 제목 — claude 에 인지시킬 첫 지시 */
  subject: string
  taskNumber?: number
  /** 셸 부팅 대기 없이 이미 프롬프트가 떠 있는 pane 이라고 가정한다 */
  delays?: { boot: number; ready: number; submit: number }
}

export const DEFAULT_DROP_DELAYS = { boot: 400, ready: 3000, submit: 200 }

/** 셸에 안전하게 넘길 수 있게 작은따옴표로 감싼다 (내부 `'` 는 `'\''` 로 탈출). */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** 여러 줄 지시를 한 줄로 접는다 — TUI 입력창은 개행을 제출로 해석한다. */
export function foldPrompt(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ').trim()
}

/**
 * 태스크 드롭 → 터미널에 보낼 입력 시퀀스를 만든다.
 * 세션이 연결돼 있으면 `--resume` 으로 이어가고 프롬프트를 다시 넣지 않는다(문맥이 이미 있다).
 */
export function buildTaskDropSteps(input: TaskDropCommandInput): TaskDropStep[] {
  const { target, subject, taskNumber } = input
  const delays = input.delays ?? DEFAULT_DROP_DELAYS
  const steps: TaskDropStep[] = [
    { data: `cd ${shellQuote(target.cwd)}\r`, delayMs: delays.boot, label: `${target.repoName} 로 이동` }
  ]

  if (target.claudeSessionId) {
    steps.push({
      data: `claude --resume ${target.claudeSessionId}\r`,
      delayMs: delays.ready,
      label: '이전 세션 이어가기'
    })
    return steps
  }

  steps.push({ data: 'claude\r', delayMs: delays.ready, label: 'claude 시작' })
  const label = taskNumber !== undefined ? `#${taskNumber} ${subject}` : subject
  const prompt = foldPrompt(`다음 두레이 업무를 진행합니다: ${label}`)
  steps.push({ data: prompt, delayMs: delays.submit, label: '업무 내용 전달' })
  steps.push({ data: '\r', delayMs: 0, label: '전송' })
  return steps
}
