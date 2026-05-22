export type FeedbackCategory = 'bug' | 'feature' | 'improvement'

/**
 * Renderer 가 IPC 로 보내는 페이로드. appVersion / platform / userEmail 은 main 이 자동 보강.
 * (renderer 는 nodeIntegration off 라 process.platform 직접 못 씀)
 */
export interface FeedbackPayload {
  category: FeedbackCategory
  subject: string          // 한 줄 제목
  userNote: string         // 사용자 본문
  diagnostic?: string      // bug 카테고리만. ErrorReportService.collect() 의 body
}

/**
 * Main 측 송신 시점에 보강된 내부 페이로드.
 */
export interface EnrichedFeedbackPayload extends FeedbackPayload {
  appVersion: string
  platform: NodeJS.Platform
  userEmail?: string       // 두레이 토큰의 본인 이메일 (있으면)
}

export interface FeedbackSubmitResult {
  ok: boolean
  error?: string
  /** 미설정 / 빈 환경변수 등 클라이언트 측 사유 */
  reason?: 'hook-url-missing' | 'network-error' | 'http-error'
}
