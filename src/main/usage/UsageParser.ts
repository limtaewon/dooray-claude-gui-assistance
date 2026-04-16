import { readdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { UsageQueryParams, UsageSummary, UsageRecord } from '../../shared/types/usage'

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  // Claude 4 family
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-opus-4-6': { input: 15.0, output: 75.0 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 },
  // Claude 3.x family (legacy)
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4.0 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-opus-20240229': { input: 15.0, output: 75.0 }
}

function getDefaultCost(): { input: number; output: number } {
  return { input: 3.0, output: 15.0 }
}

export class UsageParser {
  private projectsDir: string

  constructor() {
    this.projectsDir = join(homedir(), '.claude', 'projects')
  }

  async query(params: UsageQueryParams): Promise<UsageSummary> {
    const records = await this.parseAllJsonl()

    const now = new Date()
    let cutoff: Date
    switch (params.period) {
      case 'day':
        cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        break
      case 'week':
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case 'month':
        cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
    }

    const filtered = records.filter((r) => new Date(r.timestamp) >= cutoff)

    const byDate: Record<string, UsageRecord[]> = {}
    const byModel: Record<string, UsageRecord[]> = {}

    const byHour: Record<number, UsageRecord[]> = {}
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalCacheReadTokens = 0
    let totalCacheCreateTokens = 0
    let totalCostUsd = 0
    const sessionSet = new Set<string>()

    for (const r of filtered) {
      totalInputTokens += r.inputTokens
      totalOutputTokens += r.outputTokens
      totalCacheReadTokens += r.cacheReadInputTokens
      totalCacheCreateTokens += r.cacheCreationInputTokens
      totalCostUsd += r.costUsd

      const dateKey = r.timestamp.split('T')[0]
      if (!byDate[dateKey]) byDate[dateKey] = []
      byDate[dateKey].push(r)

      if (!byModel[r.model]) byModel[r.model] = []
      byModel[r.model].push(r)

      // 시간대별
      try {
        const hour = new Date(r.timestamp).getHours()
        if (!byHour[hour]) byHour[hour] = []
        byHour[hour].push(r)
      } catch {}

      // 세션 (같은 날+시간대 = 1세션으로 근사)
      sessionSet.add(dateKey + '-' + r.model)
    }

    return {
      totalInputTokens, totalOutputTokens, totalCacheReadTokens, totalCacheCreateTokens,
      totalCostUsd, totalSessions: sessionSet.size,
      records: filtered, byDate, byModel, byHour
    }
  }

  private async parseAllJsonl(): Promise<UsageRecord[]> {
    if (!existsSync(this.projectsDir)) return []

    const records: UsageRecord[] = []
    const hashDirs = await readdir(this.projectsDir)

    for (const hashDir of hashDirs) {
      const dirPath = join(this.projectsDir, hashDir)
      try {
        const files = await readdir(dirPath)
        const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'))
        for (const file of jsonlFiles) {
          const content = await readFile(join(dirPath, file), 'utf-8')
          const lines = content.split('\n').filter((l) => l.trim())
          for (const line of lines) {
            try {
              const entry = JSON.parse(line)
              const usage = entry.message?.usage
              if (usage) {
                const model = entry.message?.model || 'unknown'
                const costs = MODEL_COSTS[model] || getDefaultCost()
                const inputTokens = usage.input_tokens || 0
                const outputTokens = usage.output_tokens || 0
                const cacheReadInputTokens = usage.cache_read_input_tokens || 0
                const cacheCreationInputTokens = usage.cache_creation_input_tokens || 0
                // Anthropic 요금: input_tokens는 캐시 미스분, cache_read는 90%할인, cache_creation은 25%추가
                const costUsd = (
                  inputTokens * costs.input +
                  cacheReadInputTokens * costs.input * 0.1 +
                  cacheCreationInputTokens * costs.input * 1.25 +
                  outputTokens * costs.output
                ) / 1_000_000

                records.push({
                  timestamp: entry.timestamp || new Date().toISOString(),
                  model,
                  inputTokens,
                  outputTokens,
                  cacheReadInputTokens,
                  cacheCreationInputTokens,
                  costUsd
                })
              }
            } catch {
              // skip malformed lines
            }
          }
        }
      } catch {
        // skip unreadable dirs
      }
    }

    return records.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }
}
