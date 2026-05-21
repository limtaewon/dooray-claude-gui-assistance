import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let tmpUserData: string

vi.mock('electron', () => ({
  app: { getPath: (_k: string) => tmpUserData }
}))

import { AnalyticsService } from './AnalyticsService'

beforeEach(() => {
  tmpUserData = mkdtempSync(join(tmpdir(), 'analytics-'))
})
afterEach(() => {
  rmSync(tmpUserData, { recursive: true, force: true })
})

describe('AnalyticsService — track / summary', () => {
  it('생성자에서 디렉토리 자동 생성 + meta 파일 작성', () => {
    new AnalyticsService()
    expect(existsSync(join(tmpUserData, 'analytics', 'meta.json'))).toBe(true)
  })

  it('track 후 events.jsonl 에 append', () => {
    const a = new AnalyticsService()
    a.track('view.open', { meta: { view: 'dooray' } } as never)
    const raw = readFileSync(join(tmpUserData, 'analytics', 'events.jsonl'), 'utf8')
    expect(raw).toContain('"type":"view.open"')
    expect(raw).toContain('"view":"dooray"')
  })

  it('summary — view.open / view.dwell 집계', () => {
    const a = new AnalyticsService()
    a.track('view.open', { meta: { view: 'dooray' } } as never)
    a.track('view.open', { meta: { view: 'dooray' } } as never)
    a.track('view.open', { meta: { view: 'terminal' } } as never)
    a.track('view.dwell', { meta: { view: 'dooray' }, durationMs: 30000 } as never)
    const s = a.summary(30)
    expect(s.viewOpens.dooray).toBe(2)
    expect(s.viewOpens.terminal).toBe(1)
    expect(s.viewDwell.dooray).toBe(30)
  })

  it('summary — AI 이벤트 count/avg/successRate', () => {
    const a = new AnalyticsService()
    a.track('ai.briefing.start' as never, {})
    a.track('ai.briefing.success' as never, { durationMs: 1000 } as never)
    a.track('ai.briefing.start' as never, {})
    a.track('ai.briefing.error' as never, {})
    const s = a.summary(30)
    expect(s.aiUsage.briefing.count).toBe(2)
    expect(s.aiUsage.briefing.avgDurationMs).toBe(1000)
    expect(s.aiUsage.briefing.successRate).toBe(50)
  })

  it('summary — 브리핑 피드백 up/down', () => {
    const a = new AnalyticsService()
    a.track('ai.briefing.feedback' as never, { meta: { feedback: 'up' } } as never)
    a.track('ai.briefing.feedback' as never, { meta: { feedback: 'up' } } as never)
    a.track('ai.briefing.feedback' as never, { meta: { feedback: 'down' } } as never)
    const s = a.summary(30)
    expect(s.briefingFeedback).toEqual({ up: 2, down: 1 })
  })

  it('summary — 스킬 카운트', () => {
    const a = new AnalyticsService()
    a.track('skill.create' as never, { meta: { source: 'manual' } } as never)
    a.track('skill.create' as never, { meta: { source: 'template' } } as never)
    a.track('skill.create' as never, { meta: { source: 'ai' } } as never)
    a.track('skill.toggle' as never, {})
    const s = a.summary(30)
    expect(s.skills.totalCreated).toBe(3)
    expect(s.skills.templateApplied).toBe(1)
    expect(s.skills.aiGenerated).toBe(1)
    expect(s.skills.totalToggled).toBe(1)
  })

  it('summary — 기간 필터 (days=1)', () => {
    const a = new AnalyticsService()
    // 오래된 이벤트는 파일에 직접 기록
    const old = JSON.stringify({ type: 'view.open', at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(), meta: { view: 'old' } })
    const recent = JSON.stringify({ type: 'view.open', at: new Date().toISOString(), meta: { view: 'recent' } })
    require('fs').writeFileSync(join(tmpUserData, 'analytics', 'events.jsonl'), old + '\n' + recent, 'utf8')
    const s = a.summary(1)
    expect(s.viewOpens.recent).toBe(1)
    expect(s.viewOpens.old).toBeUndefined()
  })

  it('summary — topFeatures 정렬', () => {
    const a = new AnalyticsService()
    a.track('view.open', { meta: { view: 'a' } } as never)
    a.track('view.open', { meta: { view: 'a' } } as never)
    a.track('view.open', { meta: { view: 'b' } } as never)
    const s = a.summary(30)
    expect(s.topFeatures[0].feature).toBe('view.a')
    expect(s.topFeatures[0].count).toBe(2)
  })

  it('summary — unusedFeatures (집계에 없는 KNOWN 기능)', () => {
    const a = new AnalyticsService()
    const s = a.summary(30)
    expect(s.unusedFeatures).toContain('view.dooray')
    expect(s.unusedFeatures.length).toBeGreaterThan(0)
  })

  it('summary — error 카운트', () => {
    const a = new AnalyticsService()
    a.track('error' as never, {})
    a.track('error' as never, {})
    expect(a.summary(30).errors).toBe(2)
  })

  it('exportAll', () => {
    const a = new AnalyticsService()
    a.track('view.open', { meta: { view: 'x' } } as never)
    const all = a.exportAll()
    expect(all).toHaveLength(1)
    expect(all[0].type).toBe('view.open')
  })

  it('clear — 모든 파일 비움', () => {
    const a = new AnalyticsService()
    a.track('view.open', { meta: { view: 'x' } } as never)
    a.clear()
    expect(readFileSync(join(tmpUserData, 'analytics', 'events.jsonl'), 'utf8')).toBe('')
  })

  it('JSON parse 실패 라인 skip', () => {
    const a = new AnalyticsService()
    require('fs').writeFileSync(join(tmpUserData, 'analytics', 'events.jsonl'),
      'broken\n' + JSON.stringify({ type: 'view.open', at: new Date().toISOString(), meta: { view: 'ok' } }),
      'utf8')
    const s = a.summary(30)
    expect(s.viewOpens.ok).toBe(1)
  })
})

describe('AnalyticsService — rotate', () => {
  it('파일 1MB 초과 시 .old 로 회전', () => {
    const a = new AnalyticsService()
    // 1MB 직접 작성 후 다음 track 에서 rotate
    require('fs').writeFileSync(join(tmpUserData, 'analytics', 'events.jsonl'), 'x'.repeat(1.1 * 1024 * 1024), 'utf8')
    a.track('view.open', { meta: { view: 'x' } } as never)
    expect(existsSync(join(tmpUserData, 'analytics', 'events.old.jsonl'))).toBe(true)
  })
})
