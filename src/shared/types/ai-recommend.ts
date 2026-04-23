/**
 * AI 활용 사례 공유 프로젝트의 task를 개인 Claude Code setup(스킬/MCP)와 비교해
 * 3가지 카테고리로 분류한 결과.
 */
export interface AIRecommendItem {
  taskId: string
  title: string
  /** Dooray task URL (https://nhnent.dooray.com/task/{projectId}/{taskId}) */
  url: string
  /** AI가 판단한 이유 (즉시 도입/참고/이미 보유별로 다름) */
  reason: string
  /** "covered" 카테고리일 때 어떤 스킬/MCP가 이미 충족하는지 */
  coveredBy?: string
}

export interface AIRecommendResult {
  /** 분석 요약 문구 (한줄) */
  summary: string
  /** 총 분석한 task 수 */
  analyzedCount: number
  /** 사용자 setup 기준 gap을 직접적으로 채우는 사례 */
  immediate: AIRecommendItem[]
  /** 흥미롭지만 지금 당장은 필요 없음 */
  reference: AIRecommendItem[]
  /** 이미 보유 스킬/MCP가 커버 */
  covered: AIRecommendItem[]
  /** 분석 완료 시각 (ms) */
  analyzedAt: number
  /** AI 호출 비용 */
  costUsd?: number
}
