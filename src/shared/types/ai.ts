export interface AIMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: AIToolCall[]
  timestamp?: number
}

export interface AIToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  result?: string
}

/** AI 분석에 실제로 들어간 원본 데이터 카운트 — 사용자가 "뭘 보고 만든 결과인지" 확인용.
 *  delegateAll=true(위임 모드) 면 main 이 사전 fetch 한 것은 캘린더뿐이고 task 류는 AI 가 MCP 로 직접 수집.
 */
export interface AISourceMeta {
  taskCount: number
  ccTaskCount: number
  dueTodayCount: number
  eventCount: number
  /** "5/20~5/27" 같은 일정 범위 라벨 */
  eventRange?: string
  /** 분석 기준 시각 — ISO */
  collectedAt: string
  /** 위임 모드 여부 — UI 에서 "+ AI 가 MCP 로 추가 수집" 안내 표시 */
  delegated?: boolean
  /** 에이전틱 브리핑에서 LLM 이 호출한 도구 목록 — "확인한 출처" UI 노출용 */
  probes?: Array<{ name: string; summary?: string }>
}

export interface AIBriefing {
  greeting: string
  urgent: Array<{ taskId: string; subject: string; reason: string }>
  focus: Array<{ taskId: string; subject: string; reason: string }>
  mentioned: Array<{ taskId: string; subject: string; reason: string }>
  stale: Array<{ taskId: string; subject: string; daysSinceCreated: number }>
  todayEvents: Array<{ subject: string; time: string }>
  recommendations: string[]
  sourceMeta?: AISourceMeta
}

export interface AIReportRequest {
  type: 'daily' | 'weekly'
}

export interface AIReport {
  title: string
  content: string
  generatedAt: string
  sourceMeta?: AISourceMeta
}

export interface AIWikiRequest {
  taskSubject: string
  taskBody?: string
  projectCode?: string
}

export interface AIMeetingNoteRequest {
  eventSubject: string
  eventDescription?: string
  startAt: string
  attendees?: string[]
}

export interface AIProgressEvent {
  requestId: string
  stage: 'collecting' | 'thinking' | 'streaming' | 'parsing' | 'done' | 'error'
  message: string
  elapsedMs: number
  /** 스트리밍 청크 (stage='streaming'일 때) */
  chunk?: string
}

export type AIModelName = 'haiku' | 'sonnet' | 'opus'

/** 기능별 모델 선택 설정 */
export interface AIModelConfig {
  briefing?: AIModelName
  report?: AIModelName
  wikiProofread?: AIModelName
  wikiImprove?: AIModelName
  wikiDraft?: AIModelName
  wikiSummarize?: AIModelName
  wikiStructure?: AIModelName
  summarizeTask?: AIModelName
  generateSkill?: AIModelName
  sessionSummary?: AIModelName
  calendarAnalysis?: AIModelName
  messengerCompose?: AIModelName
  aiRecommend?: AIModelName
  /**
   * Harness Studio — 번들 AI 정규화 모델.
   * RawBundle → HarnessModel 변환 시 사용 (HarnessNormalizer).
   * 기본값: 'sonnet' — 번들 산문/스크립트 분석에 Sonnet 이 균형이 좋음.
   * Windows stdin combine 경로(큰 system prompt) 영향이 크므로 변경 시 양쪽 플랫폼 테스트 필수.
   */
  harnessNormalize?: AIModelName
  /**
   * Harness Studio — Dry-run 레벨 추정 모델.
   * 태스크 평문 → 레벨(L0~L3) 추정 시 사용 (DryRunEstimator).
   * 기본값: 'haiku' — 짧은 추정 태스크라 Haiku 가 비용·속도 면에서 적합.
   */
  harnessEstimate?: AIModelName
  /**
   * Harness Studio — 온디맨드 설명/용어번역 모델.
   * 특정 토픽(에이전트/게이트/레벨/용어)에 대한 한국어 마크다운 설명 반환 시 사용 (HARNESS_EXPLAIN).
   * 기본값: 'sonnet' — 설명 품질과 비용의 균형상 Sonnet 이 적합.
   */
  harnessExplain?: AIModelName
  /**
   * Harness Studio — AI 편집 제안 모델 (HARNESS_AI_EDIT).
   * 자연어 명령 → 파일 변경안 JSON 출력 시 사용 (AIService.proposeEdit).
   * 기본값: 'sonnet' — 편집은 정밀 텍스트 변환이므로 Sonnet 이 균형상 적합.
   * 설계 변경 수준의 명령은 사용자가 Opus 로 직접 승격 가능.
   * Windows stdin combine 경로(큰 system prompt) 영향이 있으므로 변경 시 양쪽 플랫폼 테스트 필수.
   */
  harnessEdit?: AIModelName
}
