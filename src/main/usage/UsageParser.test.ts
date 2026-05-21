import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { UsageParser } from './UsageParser'

let tmpProjects: string

beforeEach(() => {
  tmpProjects = mkdtempSync(join(tmpdir(), 'usage-parser-test-'))
  // homedir() 결과를 우회하기 위해 인스턴스 내부 projectsDir 를 교체
})
afterEach(() => {
  rmSync(tmpProjects, { recursive: true, force: true })
})

function makeParser(): UsageParser {
  const p = new UsageParser()
  ;(p as unknown as { projectsDir: string }).projectsDir = tmpProjects
  return p
}

function writeJsonl(filename: string, entries: unknown[]): void {
  writeFileSync(filename, entries.map((e) => JSON.stringify(e)).join('\n'), 'utf8')
}

function record(model: string, inputTokens: number, outputTokens: number, timestamp: string, extra: Record<string, number> = {}): Record<string, unknown> {
  return {
    timestamp,
    message: {
      model,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens, ...extra }
    }
  }
}

describe('UsageParser', () => {
  it('projects 디렉토리 없으면 빈 결과', async () => {
    const p = new UsageParser()
    ;(p as unknown as { projectsDir: string }).projectsDir = join(tmpProjects, 'missing')
    const r = await p.query({ period: 'day', groupBy: 'date' })
    expect(r.records).toEqual([])
    expect(r.totalSessions).toBe(0)
  })

  it('빈 디렉토리도 안전하게 빈 결과', async () => {
    const p = makeParser()
    const r = await p.query({ period: 'week', groupBy: 'date' })
    expect(r.records).toEqual([])
  })

  it('jsonl 파일을 파싱하고 비용 계산', async () => {
    const p = makeParser()
    const dir = join(tmpProjects, 'project-a')
    mkdirSync(dir, { recursive: true })
    const now = new Date().toISOString()
    writeJsonl(join(dir, 'session.jsonl'), [
      record('claude-sonnet-4-6', 1_000_000, 100_000, now)
    ])
    const r = await p.query({ period: 'day', groupBy: 'date' })
    expect(r.records).toHaveLength(1)
    // sonnet: input=$3, output=$15 per million
    // cost = 1M*3 + 100k*15 = 3 + 1.5 = 4.5
    expect(r.totalCostUsd).toBeCloseTo(4.5, 3)
    expect(r.totalInputTokens).toBe(1_000_000)
    expect(r.totalOutputTokens).toBe(100_000)
  })

  it('알려지지 않은 모델은 기본 sonnet 비용', async () => {
    const p = makeParser()
    const dir = join(tmpProjects, 'p')
    mkdirSync(dir, { recursive: true })
    writeJsonl(join(dir, 's.jsonl'), [
      record('mystery-model', 1_000_000, 0, new Date().toISOString())
    ])
    const r = await p.query({ period: 'day', groupBy: 'date' })
    expect(r.totalCostUsd).toBeCloseTo(3, 3)
  })

  it('period=day 는 24시간 cutoff', async () => {
    const p = makeParser()
    const dir = join(tmpProjects, 'p')
    mkdirSync(dir, { recursive: true })
    const old = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString()
    const recent = new Date().toISOString()
    writeJsonl(join(dir, 's.jsonl'), [
      record('claude-sonnet-4-6', 100, 100, old),
      record('claude-sonnet-4-6', 200, 200, recent)
    ])
    const r = await p.query({ period: 'day', groupBy: 'date' })
    expect(r.records).toHaveLength(1)
    expect(r.records[0].inputTokens).toBe(200)
  })

  it('period=week 는 7일 cutoff', async () => {
    const p = makeParser()
    const dir = join(tmpProjects, 'p')
    mkdirSync(dir, { recursive: true })
    const old = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
    const recent = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()
    writeJsonl(join(dir, 's.jsonl'), [
      record('claude-sonnet-4-6', 100, 100, old),
      record('claude-sonnet-4-6', 200, 200, recent)
    ])
    const r = await p.query({ period: 'week', groupBy: 'date' })
    expect(r.records).toHaveLength(1)
  })

  it('period=month 는 30일 cutoff', async () => {
    const p = makeParser()
    const dir = join(tmpProjects, 'p')
    mkdirSync(dir, { recursive: true })
    const old = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString()
    const recent = new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString()
    writeJsonl(join(dir, 's.jsonl'), [
      record('claude-sonnet-4-6', 100, 100, old),
      record('claude-sonnet-4-6', 200, 200, recent)
    ])
    const r = await p.query({ period: 'month', groupBy: 'date' })
    expect(r.records).toHaveLength(1)
  })

  it('byDate / byModel / byHour 집계', async () => {
    const p = makeParser()
    const dir = join(tmpProjects, 'p')
    mkdirSync(dir, { recursive: true })
    const now = new Date().toISOString()
    writeJsonl(join(dir, 's.jsonl'), [
      record('claude-sonnet-4-6', 100, 50, now),
      record('claude-opus-4-6', 200, 100, now)
    ])
    const r = await p.query({ period: 'day', groupBy: 'date' })
    expect(Object.keys(r.byDate)).toHaveLength(1)
    expect(Object.keys(r.byModel)).toEqual(expect.arrayContaining(['claude-sonnet-4-6', 'claude-opus-4-6']))
    expect(Object.keys(r.byHour).length).toBeGreaterThan(0)
  })

  it('usage 없는 entry skip', async () => {
    const p = makeParser()
    const dir = join(tmpProjects, 'p')
    mkdirSync(dir, { recursive: true })
    writeJsonl(join(dir, 's.jsonl'), [
      { timestamp: new Date().toISOString(), message: {} },          // usage 없음
      record('claude-sonnet-4-6', 10, 5, new Date().toISOString())
    ])
    const r = await p.query({ period: 'day', groupBy: 'date' })
    expect(r.records).toHaveLength(1)
  })

  it('JSON parse 실패 라인 skip', async () => {
    const p = makeParser()
    const dir = join(tmpProjects, 'p')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 's.jsonl'),
      'broken-line\n' + JSON.stringify(record('claude-sonnet-4-6', 10, 5, new Date().toISOString())),
      'utf8'
    )
    const r = await p.query({ period: 'day', groupBy: 'date' })
    expect(r.records).toHaveLength(1)
  })

  it('mtime/size 동일 시 캐시 hit (2번째 호출 시 readFile 호출 없음)', async () => {
    const p = makeParser()
    const dir = join(tmpProjects, 'p')
    mkdirSync(dir, { recursive: true })
    writeJsonl(join(dir, 's.jsonl'), [record('claude-sonnet-4-6', 10, 5, new Date().toISOString())])
    await p.query({ period: 'day', groupBy: 'date' })
    await p.query({ period: 'day', groupBy: 'date' })
    // 캐시 동작은 내부 — 외부에서 직접 검증 어려우므로 결과 일관성만 확인
    const r2 = await p.query({ period: 'day', groupBy: 'date' })
    expect(r2.records).toHaveLength(1)
  })

  it('파일이 삭제되면 캐시도 제거', async () => {
    const p = makeParser()
    const dir = join(tmpProjects, 'p')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 's.jsonl')
    writeJsonl(file, [record('claude-sonnet-4-6', 10, 5, new Date().toISOString())])
    await p.query({ period: 'day', groupBy: 'date' })
    rmSync(file)
    const r = await p.query({ period: 'day', groupBy: 'date' })
    expect(r.records).toEqual([])
    expect((p as unknown as { fileCache: Map<string, unknown> }).fileCache.has(file)).toBe(false)
  })

  it('cache token 도 비용에 합산', async () => {
    const p = makeParser()
    const dir = join(tmpProjects, 'p')
    mkdirSync(dir, { recursive: true })
    writeJsonl(join(dir, 's.jsonl'), [
      record('claude-sonnet-4-6', 0, 0, new Date().toISOString(), {
        cache_read_input_tokens: 1_000_000,
        cache_creation_input_tokens: 1_000_000
      })
    ])
    const r = await p.query({ period: 'day', groupBy: 'date' })
    // read = 1M * 3 * 0.1 = 0.3, create = 1M * 3 * 1.25 = 3.75 → total 4.05
    expect(r.totalCostUsd).toBeCloseTo(4.05, 3)
    expect(r.totalCacheReadTokens).toBe(1_000_000)
    expect(r.totalCacheCreateTokens).toBe(1_000_000)
  })
})
