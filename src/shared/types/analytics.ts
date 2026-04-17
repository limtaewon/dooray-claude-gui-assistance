/**
 * 앱 사용 분석용 이벤트 타입.
 * 프라이버시: 태스크 제목/본문 같은 실제 내용은 기록하지 않음.
 * 이름은 안전한 집계 키만.
 */
export interface AnalyticsEvent {
  type: AnalyticsEventType
  at: string // ISO timestamp
  /** ms 단위 측정값 (AI 호출 등) */
  durationMs?: number
  /** 성공 여부 */
  success?: boolean
  /** 이벤트별 안전한 메타데이터 (민감정보 제외) */
  meta?: Record<string, string | number | boolean | null>
}

export type AnalyticsEventType =
  // 뷰 전환
  | 'view.open'
  | 'view.dwell' // 체류 시간 (이전 뷰 떠날 때 기록)
  // AI 기능
  | 'ai.briefing.start'
  | 'ai.briefing.success'
  | 'ai.briefing.error'
  | 'ai.briefing.feedback'
  | 'ai.report.start'
  | 'ai.report.success'
  | 'ai.report.error'
  | 'ai.wiki.proofread'
  | 'ai.wiki.improve'
  | 'ai.wiki.summarize'
  | 'ai.wiki.structure'
  | 'ai.wiki.draft'
  | 'ai.task.summarize'
  | 'ai.meeting.note'
  | 'ai.session.summarize'
  | 'ai.calendar.analysis'
  | 'ai.skill.generate'
  // 스킬
  | 'skill.create'
  | 'skill.update'
  | 'skill.delete'
  | 'skill.toggle'
  | 'skill.template.apply'
  | 'skill.import'
  | 'skill.export'
  // 태스크 상호작용
  | 'task.select'
  | 'task.filter'
  | 'task.search'
  // 위키
  | 'wiki.open'
  | 'wiki.update'
  // 캘린더
  | 'calendar.event.click'
  // 터미널
  | 'terminal.create'
  | 'terminal.close'
  // 브랜치 작업
  | 'git.worktree.create'
  | 'git.worktree.remove'
  | 'git.diff.view'
  // 설정
  | 'settings.model.change'
  | 'settings.startup.change'
  // 에러
  | 'error'

/** 집계 요약 (대시보드용) */
export interface AnalyticsSummary {
  /** 총 이벤트 수 */
  totalEvents: number
  /** 추적 시작일 */
  since: string
  /** 기간 (일) */
  periodDays: number
  /** 뷰별 체류 시간 (초) */
  viewDwell: Record<string, number>
  /** 뷰별 오픈 횟수 */
  viewOpens: Record<string, number>
  /** AI 기능 실행 횟수 */
  aiUsage: Record<string, { count: number; avgDurationMs: number; successRate: number }>
  /** 브리핑 피드백 */
  briefingFeedback: { up: number; down: number }
  /** 가장 많이 쓴 기능 top 5 */
  topFeatures: Array<{ feature: string; count: number }>
  /** 미사용 기능 (개선 제안용) */
  unusedFeatures: string[]
  /** 에러 발생 수 */
  errors: number
  /** 스킬 통계 */
  skills: { totalCreated: number; totalToggled: number; templateApplied: number; aiGenerated: number }
}
