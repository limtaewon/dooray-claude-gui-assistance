/**
 * 에이전트 CLI 가 터미널 타이틀(OSC 0/2)로 흘리는 상태를 읽는다.
 *
 * Portions ported from Orca (https://github.com/stablyai/orca) — `src/shared/agent-title-core.ts`,
 * `src/shared/agent-title-status.ts`. Copyright (c) 2026 Lovecast Inc. — MIT License.
 * 변경: Clauday 가 쓰는 claude·gemini 판정만 남기고 droid/hermes/pi/agy 등 타 에이전트 분기 제거.
 *
 * 왜 타이틀인가: 출력이 멎는 것으로 완료를 유추하면 **도구가 오래 도는 중의 정적**도 완료로
 * 읽힌다. 타이틀 전이는 에이전트가 직접 알려주는 신호라 그런 오탐이 없다.
 */

export type AgentStatus = 'working' | 'idle'

/** claude 가 idle 일 때 타이틀 앞에 붙이는 글자 */
const CLAUDE_IDLE = '\u2733' // ✳
/** gemini */
const GEMINI_WORKING = '\u2726' // ✦
const GEMINI_SILENT_WORKING = '\u23f2' // ⏲
const GEMINI_IDLE = '\u25c7' // ◇
const GEMINI_PERMISSION = '\u270b' // ✋

/** 진행 스피너로 흔히 쓰이는 브라유 문자 */
const BRAILLE_SPINNER_RE = /[\u2800-\u28ff]/

const WORKING_KEYWORDS = ['working', 'thinking', 'running'] as const
const IDLE_KEYWORDS = ['ready', 'idle', 'done'] as const

// `\b` 는 하이픈·경로 안에서도 걸린다 — `reworking`, `~/codex/ready` 가 오탐이 되지 않게 막는다.
const WORKING_RE = new RegExp(`(?<![\\w./\\\\-])(${WORKING_KEYWORDS.join('|')})(?![\\w-])`, 'i')
const IDLE_RE = new RegExp(`(?<![\\w./\\\\-])(${IDLE_KEYWORDS.join('|')})(?![\\w-])`, 'i')

/** `claude agents` 처럼 명령줄이 그대로 타이틀이 된 경우 — 상태가 아니다. */
const CLAUDE_MANAGEMENT_TITLE_RE = /^\s*(?:.*[\\/])?claude(?:\.(?:exe|cmd|bat|ps1))?\s+agents\s*$/i

const AGENT_NAME_RE = /(?<![\w-])(claude|codex|gemini|aider|cursor)(?![\w-])/i

/**
 * 타이틀에서 에이전트 상태를 읽는다. 에이전트 타이틀이 아니면 null.
 *
 * null 은 "모른다" 이지 "끝났다" 가 아니다 — 셸로 돌아간 것과 구분해야 해서 호출부가 나눠 쓴다.
 */
export function detectAgentStatusFromTitle(title: string): AgentStatus | null {
  const trimmed = title?.trim() ?? ''
  if (!trimmed || CLAUDE_MANAGEMENT_TITLE_RE.test(trimmed)) return null

  // gemini 의 기호가 가장 명확하다 — 다른 판정보다 먼저 본다.
  if (trimmed.includes(GEMINI_PERMISSION)) return 'idle'
  if (trimmed.includes(GEMINI_WORKING) || trimmed.includes(GEMINI_SILENT_WORKING)) return 'working'
  if (trimmed.includes(GEMINI_IDLE)) return 'idle'

  if (trimmed.startsWith(CLAUDE_IDLE)) return 'idle'
  if (BRAILLE_SPINNER_RE.test(trimmed)) return 'working'

  // 키워드는 에이전트 이름이 함께 있을 때만 믿는다 — `npm run build` 같은 평범한 타이틀 배제.
  if (!AGENT_NAME_RE.test(trimmed)) return null
  if (WORKING_RE.test(trimmed)) return 'working'
  if (IDLE_RE.test(trimmed)) return 'idle'
  return null
}

export interface AgentStatusTracker {
  /** 새 타이틀 반영. 상태가 working → 그 외로 바뀌는 순간에만 `onIdle` 이 불린다. */
  handleTitle: (title: string) => void
  /** 지금까지 에이전트 타이틀을 한 번이라도 본 적 있는지 — 폴백 판정을 켤지 정하는 근거 */
  hasEvidence: () => boolean
  status: () => AgentStatus | null
}

/**
 * 타이틀 전이 추적기.
 *
 * **working 이었던 적이 있어야 idle 을 완료로 친다.** 처음부터 idle 인 타이틀(그냥 띄워둔 claude)은
 * 알릴 일이 아니다.
 */
export function createAgentStatusTracker(callbacks: {
  onIdle: (title: string) => void
  onWorking?: () => void
}): AgentStatusTracker {
  let last: AgentStatus | null = null
  let sawEvidence = false

  return {
    handleTitle(title: string): void {
      const next = detectAgentStatusFromTitle(title)
      if (next !== null) sawEvidence = true

      if (last === 'working' && next !== null && next !== 'working') callbacks.onIdle(title)
      if (last !== 'working' && next === 'working') callbacks.onWorking?.()

      // 셸 타이틀로 되돌아간 것(null)은 에이전트 종료 — 상태만 지우고 완료로 치지 않는다.
      if (next === null) last = null
      else last = next
    },
    hasEvidence: () => sawEvidence,
    status: () => last
  }
}
