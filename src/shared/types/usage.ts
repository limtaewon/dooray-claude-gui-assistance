export interface UsageRecord {
  timestamp: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  costUsd: number
}

export interface UsageQueryParams {
  period: 'day' | 'week' | 'month'
  groupBy: 'date' | 'model'
}

export interface UsageSummary {
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheCreateTokens: number
  totalCostUsd: number
  totalSessions: number
  records: UsageRecord[]
  byDate: Record<string, UsageRecord[]>
  byModel: Record<string, UsageRecord[]>
  byHour: Record<number, UsageRecord[]>
}
