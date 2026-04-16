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

export interface AIChatRequest {
  message: string
  includeContext?: boolean
}

export interface AIChatResponse {
  content: string
  toolCalls?: AIToolCall[]
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
