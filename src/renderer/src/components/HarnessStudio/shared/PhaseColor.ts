/**
 * phaseClass → Clauday DS 시맨틱 토큰 매핑.
 *
 * 반환값은 CSS 변수명 문자열(예: 'var(--c-blue-bg)')이다.
 * 다크/라이트 전환은 CSS 변수가 처리하므로 이 함수는 테마 무관하다.
 *
 * phaseClass: 'analyst'|'pm'|'architect'|'sm'|'dev'|'qa'|'security'|'release'|'orchestrator'|'other'
 */

export type PhaseClass =
  | 'analyst'
  | 'pm'
  | 'architect'
  | 'sm'
  | 'dev'
  | 'qa'
  | 'security'
  | 'release'
  | 'orchestrator'
  | 'other'

export interface PhaseTokens {
  /** 노드 배경 — 불투명 surface 에 페이즈 색을 살짝 섞은 값(어두운 캔버스에서도 또렷) */
  bg: string
  /** 노드 전경(텍스트) — 가독성 위해 기본 텍스트색 사용 */
  fg: string
  /** 노드 테두리 CSS 변수 표현 */
  border: string
  /** 페이즈 강조색(좌측 액센트 바·점·아이콘) — solid 토큰 */
  accent: string
}

/**
 * solid 색 토큰명으로 PhaseTokens 를 합성한다.
 * - bg: 불투명 surface-raised 에 solid 를 14% 섞어 가독성 유지하면서 페이즈 구분.
 * - border: solid 32% + 기본 border.
 * - accent: solid 원색(좌측 바/점).
 * - fg: text-primary(이름 가독성). 페이즈 색은 accent 로만 표현.
 */
function fromSolid(colorVar: string): PhaseTokens {
  return {
    bg: `color-mix(in oklab, ${colorVar} 14%, var(--bg-surface-raised))`,
    fg: 'var(--text-primary)',
    border: `color-mix(in oklab, ${colorVar} 32%, var(--bg-border))`,
    accent: colorVar
  }
}

/**
 * phaseClass → DS 시맨틱 토큰 맵. export 하여 테스트에서 직접 검증 가능.
 *
 * 색 배정(6 hue + neutral 로 10 페이즈를 커버하므로 일부 공유):
 * analyst=violet · pm=orange · architect=blue · sm=yellow · dev=emerald ·
 * qa=blue(architect 와 공유) · security=red · release=emerald · orchestrator=violet · other=neutral.
 * 공유 페이즈는 이름 라벨로 구분되며, 좌측 accent 바로 색 차이를 노출한다.
 */
export const PHASE_TOKEN_MAP: Record<PhaseClass, PhaseTokens> = {
  analyst:      fromSolid('var(--c-violet-solid)'),
  pm:           fromSolid('var(--c-orange-solid)'),
  architect:    fromSolid('var(--c-blue-solid)'),
  sm:           fromSolid('var(--c-yellow-solid)'),
  dev:          fromSolid('var(--c-emerald-solid)'),
  qa:           fromSolid('var(--c-blue-solid)'),
  security:     fromSolid('var(--c-red-solid)'),
  release:      fromSolid('var(--c-emerald-solid)'),
  orchestrator: fromSolid('var(--c-violet-solid)'),
  other:        fromSolid('var(--c-neutral-solid)')
}

/** 폴백 토큰 — 알 수 없는 phaseClass 에 사용. */
const FALLBACK_TOKENS: PhaseTokens = fromSolid('var(--c-neutral-solid)')

/**
 * phaseClass 문자열을 받아 DS 시맨틱 토큰을 반환한다.
 * 알 수 없는 값(null/undefined/unknown string)은 'other' 로 처리한다.
 *
 * @param phaseClass - 에이전트 역할 분류 문자열
 * @returns DS 시맨틱 토큰 (bg/fg/border CSS 변수 표현)
 */
export function phaseTokens(phaseClass: string | undefined | null): PhaseTokens {
  if (!phaseClass) return FALLBACK_TOKENS
  const key = phaseClass as PhaseClass
  return PHASE_TOKEN_MAP[key] ?? FALLBACK_TOKENS
}

/**
 * phaseClass 가 알려진 값인지 판별한다.
 *
 * @param phaseClass - 확인할 문자열
 */
export function isKnownPhaseClass(phaseClass: string): phaseClass is PhaseClass {
  return Object.prototype.hasOwnProperty.call(PHASE_TOKEN_MAP, phaseClass)
}
