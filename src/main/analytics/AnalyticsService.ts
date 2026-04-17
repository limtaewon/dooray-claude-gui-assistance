import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, appendFileSync, readFileSync, statSync, writeFileSync } from 'fs'
import type { AnalyticsEvent, AnalyticsEventType, AnalyticsSummary } from '../../shared/types/analytics'

/**
 * 로컬 전용 사용 분석 서비스.
 * JSONL append-only로 기록하고, query 시 읽어서 집계.
 *
 * 프라이버시:
 * - 태스크/일정 제목·본문 같은 실제 내용은 저장 X
 * - 이벤트 이름, 타임스탬프, 익명 메타만
 * - 파일 크기 1MB 넘으면 자동 rotate (analytics.old.jsonl)
 */
export class AnalyticsService {
  private filePath: string
  private meta: { since: string } = { since: new Date().toISOString() }
  private metaPath: string
  private static MAX_SIZE = 1 * 1024 * 1024 // 1MB

  constructor() {
    const dir = join(app.getPath('userData'), 'analytics')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.filePath = join(dir, 'events.jsonl')
    this.metaPath = join(dir, 'meta.json')
    this.loadMeta()
  }

  private loadMeta(): void {
    if (existsSync(this.metaPath)) {
      try { this.meta = JSON.parse(readFileSync(this.metaPath, 'utf-8')) } catch {}
    } else {
      writeFileSync(this.metaPath, JSON.stringify(this.meta), 'utf-8')
    }
  }

  private rotateIfNeeded(): void {
    try {
      if (!existsSync(this.filePath)) return
      const size = statSync(this.filePath).size
      if (size < AnalyticsService.MAX_SIZE) return
      // rotate: 현재 파일을 .old로, 새 파일 시작
      const oldPath = this.filePath.replace('.jsonl', '.old.jsonl')
      // old가 이미 있으면 덮어씀 (2대만 유지)
      writeFileSync(oldPath, readFileSync(this.filePath))
      writeFileSync(this.filePath, '')
    } catch { /* ignore */ }
  }

  /** 이벤트 기록 (fire-and-forget, 실패해도 앱 동작 방해 X) */
  track(type: AnalyticsEventType, params?: Omit<AnalyticsEvent, 'type' | 'at'>): void {
    try {
      this.rotateIfNeeded()
      const event: AnalyticsEvent = {
        type,
        at: new Date().toISOString(),
        ...(params || {})
      }
      appendFileSync(this.filePath, JSON.stringify(event) + '\n', 'utf-8')
    } catch { /* ignore */ }
  }

  /** 전체 이벤트 읽기 (현재 파일만, .old는 기간 조회 시에만) */
  private readEvents(includeOld = false): AnalyticsEvent[] {
    const events: AnalyticsEvent[] = []
    const parse = (path: string): void => {
      if (!existsSync(path)) return
      try {
        const content = readFileSync(path, 'utf-8')
        for (const line of content.split('\n')) {
          if (!line.trim()) continue
          try { events.push(JSON.parse(line)) } catch {}
        }
      } catch {}
    }
    if (includeOld) parse(this.filePath.replace('.jsonl', '.old.jsonl'))
    parse(this.filePath)
    return events
  }

  /** 기간 필터 */
  private filterByDays(events: AnalyticsEvent[], days: number): AnalyticsEvent[] {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    return events.filter((e) => new Date(e.at).getTime() >= cutoff)
  }

  /**
   * 집계 요약.
   * @param days 기간 (일). 기본 30일
   */
  summary(days = 30): AnalyticsSummary {
    const all = this.readEvents(true)
    const events = this.filterByDays(all, days)

    const viewDwell: Record<string, number> = {}
    const viewOpens: Record<string, number> = {}
    const aiRaw: Record<string, { count: number; totalMs: number; successes: number }> = {}
    const featureCount: Record<string, number> = {}
    let briefingUp = 0, briefingDown = 0
    let errors = 0
    let skillsCreated = 0, skillsToggled = 0, templateApplied = 0, aiGenerated = 0

    for (const e of events) {
      // 뷰
      if (e.type === 'view.open') {
        const v = String(e.meta?.view || 'unknown')
        viewOpens[v] = (viewOpens[v] || 0) + 1
        featureCount[`view.${v}`] = (featureCount[`view.${v}`] || 0) + 1
      }
      if (e.type === 'view.dwell') {
        const v = String(e.meta?.view || 'unknown')
        viewDwell[v] = (viewDwell[v] || 0) + Math.round((e.durationMs || 0) / 1000)
      }

      // AI
      if (e.type.startsWith('ai.') && !e.type.endsWith('.feedback')) {
        const key = e.type.replace(/^ai\./, '').replace(/\.(start|success|error)$/, '')
        if (!aiRaw[key]) aiRaw[key] = { count: 0, totalMs: 0, successes: 0 }
        if (e.type.endsWith('.start') || (!e.type.endsWith('.success') && !e.type.endsWith('.error'))) {
          aiRaw[key].count++
          featureCount[`ai.${key}`] = (featureCount[`ai.${key}`] || 0) + 1
        }
        if (e.type.endsWith('.success')) {
          aiRaw[key].successes++
          aiRaw[key].totalMs += e.durationMs || 0
        }
      }

      // 브리핑 피드백
      if (e.type === 'ai.briefing.feedback') {
        if (e.meta?.feedback === 'up') briefingUp++
        else if (e.meta?.feedback === 'down') briefingDown++
      }

      // 스킬
      if (e.type === 'skill.create') {
        skillsCreated++
        if (e.meta?.source === 'template') templateApplied++
        if (e.meta?.source === 'ai') aiGenerated++
      }
      if (e.type === 'skill.toggle') skillsToggled++

      // 에러
      if (e.type === 'error') errors++
    }

    // AI 평균·성공률 계산
    const aiUsage: Record<string, { count: number; avgDurationMs: number; successRate: number }> = {}
    for (const [key, v] of Object.entries(aiRaw)) {
      aiUsage[key] = {
        count: v.count,
        avgDurationMs: v.successes > 0 ? Math.round(v.totalMs / v.successes) : 0,
        successRate: v.count > 0 ? Math.round((v.successes / v.count) * 100) : 0
      }
    }

    // Top features
    const topFeatures = Object.entries(featureCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([feature, count]) => ({ feature, count }))

    // 미사용 기능 (집계에 나타나지 않은 주요 기능)
    const KNOWN_FEATURES = [
      'view.dooray', 'view.terminal', 'view.git', 'view.mcp', 'view.sessions', 'view.usage',
      'ai.briefing', 'ai.report', 'ai.wiki.proofread', 'ai.wiki.improve',
      'ai.task.summarize', 'ai.meeting.note', 'ai.calendar.analysis'
    ]
    const unusedFeatures = KNOWN_FEATURES.filter((f) => !featureCount[f])

    return {
      totalEvents: events.length,
      since: this.meta.since,
      periodDays: days,
      viewDwell,
      viewOpens,
      aiUsage,
      briefingFeedback: { up: briefingUp, down: briefingDown },
      topFeatures,
      unusedFeatures,
      errors,
      skills: {
        totalCreated: skillsCreated,
        totalToggled: skillsToggled,
        templateApplied,
        aiGenerated
      }
    }
  }

  /** 전체 이벤트 내보내기 (사용자가 검토/공유할 때) */
  exportAll(): AnalyticsEvent[] {
    return this.readEvents(true)
  }

  /** 전체 초기화 (프라이버시) */
  clear(): void {
    try {
      writeFileSync(this.filePath, '')
      const oldPath = this.filePath.replace('.jsonl', '.old.jsonl')
      if (existsSync(oldPath)) writeFileSync(oldPath, '')
      this.meta = { since: new Date().toISOString() }
      writeFileSync(this.metaPath, JSON.stringify(this.meta), 'utf-8')
    } catch { /* ignore */ }
  }
}
