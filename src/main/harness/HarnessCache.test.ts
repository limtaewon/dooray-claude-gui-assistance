import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { HarnessCache, CURRENT_SCHEMA_VERSION } from './HarnessCache'
import type { HarnessModel, DryRunResult } from '../../shared/types/harness'

/**
 * 테스트용 임시 userData 디렉터리를 생성한다.
 * electron app.getPath('userData') 주입 패턴으로 fs 부작용 격리.
 */
function createTmpUserData(): string {
  const dir = join(tmpdir(), `harness-cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** 최소 HarnessModel 픽스처 */
function makeModel(overrides: Partial<HarnessModel> = {}): HarnessModel {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: {
      name: 'test-bundle',
      source: '/path/to/bundle',
      bundleHash: 'bundle-hash-abc',
      kind: 'bundle'
    },
    agents: [],
    levels: [],
    triage: { questions: [], rules: [] },
    artifacts: [],
    controlFlow: { gates: [], hooks: [], parallelGroups: [], loops: [] },
    warnings: [],
    provenance: {},
    ...overrides
  }
}

/** 최소 DryRunResult 픽스처 */
function makeDryRun(overrides: Partial<DryRunResult> = {}): DryRunResult {
  return {
    level: 'L1',
    answers: ['답변1'],
    rationale: '근거 산문',
    highlightPath: ['developer', 'qa'],
    parallelGroups: [],
    gates: ['qa'],
    estTimeRel: 2.0,
    estCostRel: 1.5,
    ...overrides
  }
}

let tmpDir: string
let cache: HarnessCache

beforeEach(() => {
  tmpDir = createTmpUserData()
  cache = new HarnessCache(tmpDir)
})

afterEach(() => {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Bundle 캐시 — hit / miss
// ─────────────────────────────────────────────────────────────────────────────

describe('HarnessCache — Bundle (HarnessModel)', () => {
  it('miss: 없는 해시는 null 반환', () => {
    expect(cache.getBundle('nonexistent')).toBeNull()
  })

  it('set → get: 저장 후 동일 모델 반환', () => {
    const model = makeModel()
    cache.setBundle('hash1', model)
    const got = cache.getBundle('hash1')
    expect(got).not.toBeNull()
    expect(got!.meta.name).toBe('test-bundle')
    expect(got!.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('hit: 연속 get 은 동일 결과', () => {
    const model = makeModel()
    cache.setBundle('hash1', model)
    expect(cache.getBundle('hash1')?.meta.name).toBe('test-bundle')
    expect(cache.getBundle('hash1')?.meta.name).toBe('test-bundle')
  })

  it('다른 해시는 독립 저장', () => {
    cache.setBundle('hash-a', makeModel({ meta: { ...makeModel().meta, name: 'bundle-a' } }))
    cache.setBundle('hash-b', makeModel({ meta: { ...makeModel().meta, name: 'bundle-b' } }))
    expect(cache.getBundle('hash-a')?.meta.name).toBe('bundle-a')
    expect(cache.getBundle('hash-b')?.meta.name).toBe('bundle-b')
  })

  it('meta 포함 시 setBundle 이 index 갱신 — listCached 에서 반환', () => {
    const model = makeModel()
    cache.setBundle('hash1', model, { path: '/some/path', name: 'my-bundle' })
    const list = cache.listCached()
    expect(list.length).toBe(1)
    expect(list[0].name).toBe('my-bundle')
    expect(list[0].path).toBe('/some/path')
    expect(list[0].schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Bundle 캐시 — schemaVersion 불일치 무효화
// ─────────────────────────────────────────────────────────────────────────────

describe('HarnessCache — schemaVersion 불일치 무효화', () => {
  it('schemaVersion 불일치 → null 반환 (자동 무효화)', () => {
    // 구버전 스키마로 저장
    const oldModel = makeModel({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 })
    cache.setBundle('hash-old', oldModel)
    // 현재 버전으로 읽으면 null
    expect(cache.getBundle('hash-old')).toBeNull()
  })

  it('schemaVersion 불일치 후 캐시 파일이 삭제된다', () => {
    const oldModel = makeModel({ schemaVersion: 0 })
    cache.setBundle('hash-old', oldModel)
    cache.getBundle('hash-old') // 무효화 트리거
    // 동일 해시로 다시 getBundle 해도 null
    expect(cache.getBundle('hash-old')).toBeNull()
  })

  it('정상 버전 캐시는 무효화되지 않는다', () => {
    const model = makeModel()
    cache.setBundle('hash-ok', model)
    expect(cache.getBundle('hash-ok')).not.toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Bundle 캐시 — 손상 JSON 무효화
// ─────────────────────────────────────────────────────────────────────────────

describe('HarnessCache — 손상 JSON 무효화', () => {
  it('손상 JSON 파일 → null 반환 (예외 없음)', () => {
    // 정상 저장 후 파일 내용을 손상시킨다
    const model = makeModel()
    cache.setBundle('hash-corrupt', model)

    // 파일 경로를 직접 찾아 손상
    const { writeFileSync } = require('fs') as typeof import('fs')
    const bundleDir = join(tmpDir, 'harness-cache', 'bundles')
    writeFileSync(join(bundleDir, 'hash-corrupt.json'), '{ invalid json <<<', 'utf-8')

    expect(cache.getBundle('hash-corrupt')).toBeNull()
  })

  it('손상 JSON 이후 동일 해시로 정상 모델 재저장 가능', () => {
    const { writeFileSync } = require('fs') as typeof import('fs')
    const bundleDir = join(tmpDir, 'harness-cache', 'bundles')

    // 손상 파일 생성
    const model = makeModel()
    cache.setBundle('hash-rewrite', model)
    writeFileSync(join(bundleDir, 'hash-rewrite.json'), '<<< broken >>>', 'utf-8')
    expect(cache.getBundle('hash-rewrite')).toBeNull() // 무효화

    // 재저장
    cache.setBundle('hash-rewrite', makeModel({ meta: { ...model.meta, name: 'fixed-bundle' } }))
    expect(cache.getBundle('hash-rewrite')?.meta.name).toBe('fixed-bundle')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Task 캐시 (DryRunResult)
// ─────────────────────────────────────────────────────────────────────────────

describe('HarnessCache — Task (DryRunResult)', () => {
  it('miss: 없는 해시는 null', () => {
    expect(cache.getTask('nonexistent')).toBeNull()
  })

  it('set → get: 저장 후 동일 결과 반환', () => {
    const result = makeDryRun()
    cache.setTask('task-hash-1', result)
    const got = cache.getTask('task-hash-1')
    expect(got).not.toBeNull()
    expect(got!.level).toBe('L1')
    expect(got!.answers).toEqual(['답변1'])
  })

  it('손상 JSON → null 반환', () => {
    const result = makeDryRun()
    cache.setTask('task-corrupt', result)

    const { writeFileSync } = require('fs') as typeof import('fs')
    const tasksDir = join(tmpDir, 'harness-cache', 'tasks')
    writeFileSync(join(tasksDir, 'task-corrupt.json'), '{ broken', 'utf-8')

    expect(cache.getTask('task-corrupt')).toBeNull()
  })

  it('서로 다른 hash 는 독립 저장', () => {
    cache.setTask('t1', makeDryRun({ level: 'L0' }))
    cache.setTask('t2', makeDryRun({ level: 'L3' }))
    expect(cache.getTask('t1')?.level).toBe('L0')
    expect(cache.getTask('t2')?.level).toBe('L3')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// listCached
// ─────────────────────────────────────────────────────────────────────────────

describe('HarnessCache.listCached', () => {
  it('캐시 없으면 빈 배열', () => {
    expect(cache.listCached()).toEqual([])
  })

  it('여러 번들 저장 시 목록 반환', () => {
    cache.setBundle('h1', makeModel(), { path: '/p1', name: 'b1' })
    cache.setBundle('h2', makeModel(), { path: '/p2', name: 'b2' })
    const list = cache.listCached()
    expect(list.length).toBe(2)
    expect(list.map((e) => e.name)).toContain('b1')
    expect(list.map((e) => e.name)).toContain('b2')
  })

  it('index.json 이 손상되면 빈 배열 반환 (예외 없음)', () => {
    const { writeFileSync } = require('fs') as typeof import('fs')
    writeFileSync(join(tmpDir, 'harness-cache', 'index.json'), '<<< broken >>>', 'utf-8')
    expect(() => cache.listCached()).not.toThrow()
    expect(cache.listCached()).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// clear
// ─────────────────────────────────────────────────────────────────────────────

describe('HarnessCache.clear', () => {
  it('전체 clear — bundle/task 파일 삭제 후 miss', () => {
    cache.setBundle('h1', makeModel())
    cache.setTask('t1', makeDryRun())
    cache.clear()
    expect(cache.getBundle('h1')).toBeNull()
    expect(cache.getTask('t1')).toBeNull()
  })

  it('전체 clear — 삭제 수 반환', () => {
    cache.setBundle('h1', makeModel())
    cache.setBundle('h2', makeModel())
    const cleared = cache.clear()
    expect(cleared).toBeGreaterThanOrEqual(2)
  })

  it('path 지정 clear — 해당 path 만 삭제', () => {
    cache.setBundle('h-target', makeModel(), { path: '/target', name: 'target' })
    cache.setBundle('h-other', makeModel(), { path: '/other', name: 'other' })
    const cleared = cache.clear('/target')
    expect(cleared).toBe(1)
    expect(cache.getBundle('h-target')).toBeNull()
    // h-other 는 여전히 있음
    expect(cache.getBundle('h-other')).not.toBeNull()
  })

  it('존재하지 않는 path clear 는 0 반환', () => {
    expect(cache.clear('/nonexistent/path')).toBe(0)
  })

  it('clear 후 listCached 는 빈 배열', () => {
    cache.setBundle('h1', makeModel(), { path: '/p', name: 'n' })
    cache.clear()
    expect(cache.listCached()).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 디렉터리 자동 생성
// ─────────────────────────────────────────────────────────────────────────────

describe('HarnessCache — 디렉터리 자동 생성', () => {
  it('존재하지 않는 userDataPath 도 자동 생성', () => {
    const deepPath = join(tmpdir(), 'deeply', 'nested', `test-${Date.now()}`)
    expect(() => new HarnessCache(deepPath)).not.toThrow()
    rmSync(join(deepPath, '..', '..'), { recursive: true, force: true })
  })
})
