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
}
