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

export interface AIBriefing {
  greeting: string
  urgent: Array<{ taskId: string; subject: string; reason: string }>
  focus: Array<{ taskId: string; subject: string; reason: string }>
  mentioned: Array<{ taskId: string; subject: string; reason: string }>
  stale: Array<{ taskId: string; subject: string; daysSinceCreated: number }>
  todayEvents: Array<{ subject: string; time: string }>
  recommendations: string[]
}

export interface AIReportRequest {
  type: 'daily' | 'weekly'
}

export interface AIReport {
  title: string
  content: string
  generatedAt: string
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
  meetingNote?: AIModelName
  sessionSummary?: AIModelName
  calendarAnalysis?: AIModelName
  messengerCompose?: AIModelName
}
