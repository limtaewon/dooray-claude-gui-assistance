import { readdir, readFile, stat } from 'fs/promises'
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

interface FileCache {
  mtimeMs: number
  size: number
  records: UsageRecord[]
}

export class UsageParser {
  private projectsDir: string
  private fileCache = new Map<string, FileCache>()

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

  /** 단일 파일 파싱 (변경 시에만 실행, mtime/size 일치하면 캐시 반환) */
  private async parseFile(filePath: string): Promise<UsageRecord[]> {
    let stats: { mtimeMs: number; size: number }
    try { stats = await stat(filePath) } catch { return [] }

    const cached = this.fileCache.get(filePath)
    if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
      return cached.records
    }

    const records: UsageRecord[] = []
    try {
      const content = await readFile(filePath, 'utf-8')
      for (const line of content.split('\n')) {
        if (!line.trim()) continue
        try {
          const entry = JSON.parse(line)
          const usage = entry.message?.usage
          if (!usage) continue
          const model = entry.message?.model || 'unknown'
          const costs = MODEL_COSTS[model] || getDefaultCost()
          const inputTokens = usage.input_tokens || 0
          const outputTokens = usage.output_tokens || 0
          const cacheReadInputTokens = usage.cache_read_input_tokens || 0
          const cacheCreationInputTokens = usage.cache_creation_input_tokens || 0
          const costUsd = (
            inputTokens * costs.input +
            cacheReadInputTokens * costs.input * 0.1 +
            cacheCreationInputTokens * costs.input * 1.25 +
            outputTokens * costs.output
          ) / 1_000_000
          records.push({
            timestamp: entry.timestamp || new Date().toISOString(),
            model, inputTokens, outputTokens,
            cacheReadInputTokens, cacheCreationInputTokens, costUsd
          })
        } catch { /* skip */ }
      }
    } catch { /* skip */ }

    this.fileCache.set(filePath, { mtimeMs: stats.mtimeMs, size: stats.size, records })
    return records
  }

  private async parseAllJsonl(): Promise<UsageRecord[]> {
    if (!existsSync(this.projectsDir)) return []

    let hashDirs: string[]
    try { hashDirs = await readdir(this.projectsDir) } catch { return [] }

    // 모든 디렉토리/파일을 병렬로 수집
    const allFiles: string[] = []
    await Promise.all(hashDirs.map(async (hashDir) => {
      const dirPath = join(this.projectsDir, hashDir)
      try {
        const files = await readdir(dirPath)
        for (const f of files) {
          if (f.endsWith('.jsonl')) allFiles.push(join(dirPath, f))
        }
      } catch { /* skip */ }
    }))

    // 파일 파싱 병렬 (각 파일은 캐시에서 즉시 반환 or 파싱)
    const perFile = await Promise.all(allFiles.map((fp) => this.parseFile(fp)))

    // 존재하지 않는 파일 캐시 제거
    const existing = new Set(allFiles)
    for (const key of Array.from(this.fileCache.keys())) {
      if (!existing.has(key)) this.fileCache.delete(key)
    }

    const records: UsageRecord[] = []
    for (const arr of perFile) records.push(...arr)
    return records.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }
}
