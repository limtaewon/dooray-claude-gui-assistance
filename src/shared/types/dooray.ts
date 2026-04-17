export interface DoorayProject {
  id: string
  code: string
  description?: string
  /** 사용자가 수동으로 추가한 프로젝트 (API로 자동 조회되지 않는 것) */
  isCustom?: boolean
}

export interface DoorayTask {
  id: string
  projectId: string
  projectCode?: string
  subject: string
  number?: number
  workflowClass: 'backlog' | 'registered' | 'working' | 'closed'
  workflow?: { name: string }
  workflowName?: string
  tags?: Array<{ id: string; name?: string; color?: string }>
  priority?: string
  milestone?: { name: string } | null
  dueDateAt?: string
  createdAt: string
  updatedAt: string
  closed?: boolean
}

export interface DoorayTaskDetail extends DoorayTask {
  body?: {
    mimeType: string
    content: string
  }
  users?: {
    to?: Array<{ member?: { id: string; name: string }; emailUser?: { emailAddress: string } }>
    cc?: Array<{ member?: { id: string; name: string }; emailUser?: { emailAddress: string } }>
  }
  priority?: string
  milestoneId?: string
  tagIds?: string[]
}

export interface DoorayTaskComment {
  id: string
  body?: { mimeType: string; content: string }
  createdAt?: string
  creator?: { type?: string; member?: { id: string; name: string } }
}

export interface DoorayTaskUpdateParams {
  postId: string
  projectId: string
  status: string
}

export interface DoorayWikiPage {
  id: string
  projectId?: string
  subject?: string
  title?: string  // alias for subject
  body?: string
  updatedAt?: string
  createdAt?: string
}

export interface DoorayWikiUpdateParams {
  pageId: string
  projectId: string
  title: string
  body: string
}

export interface DoorayCalendarEvent {
  id: string
  subject: string
  startedAt?: string
  endedAt?: string
  startAt?: string
  endAt?: string
  location?: string
  description?: string
  wholeDayFlag?: boolean
  calendar?: { id: string; name: string }
}

export interface DoorayCalendarQueryParams {
  from: string
  to: string
}
