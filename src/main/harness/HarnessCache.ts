/**
 * Harness Studio — 파일 JSON 캐시 (ADR-004)
 *
 * 위치: <userData>/harness-cache/
 *   bundles/<bundleHash>.json  — HarnessModel (정규화 결과)
 *   tasks/<taskHash>.json      — DryRunResult
 *   index.json                 — { bundleHash → {path,name,cachedAt,schemaVersion} }
 *
 * 무효화 조건:
 * - schemaVersion 불일치 시 → 자동 무효화 (버전 비교)
 * - 손상 JSON 시 → 무효화 (try/catch)
 *
 * electron app.getPath('userData') 의존을 생성자 주입으로 격리해
 * 테스트 시 임시 디렉터리를 주입할 수 있다.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import type { HarnessModel, DryRunResult, CachedHarnessEntry } from '../../shared/types/harness'

/** HarnessModel 의 현재 스키마 버전 — 스키마 변경 시 올린다 */
export const CURRENT_SCHEMA_VERSION = 3

/** index.json 의 항목 타입 */
interface IndexEntry {
  path: string
  name: string
  cachedAt: string
  schemaVersion: number
}

/** index.json 전체 구조 */
type CacheIndex = Record<string, IndexEntry>

/**
 * Harness Studio 정규화 결과 & Dry-run 결과 캐시.
 *
 * 생성자에 userDataPath 를 주입받아 electron 런타임과 분리할 수 있다.
 * 테스트 시 임시 디렉터리를 주입해 fs 부작용 없이 검증 가능.
 *
 * 주의: main process 는 단일 스레드이므로 index.json 동시쓰기 락은 생략
 * (main 단일스레드 순차 처리, ADR-004 근거).
 */
export class HarnessCache {
  private readonly bundlesDir: string
  private readonly tasksDir: string
  private readonly indexPath: string

  constructor(userDataPath: string) {
    const cacheRoot = join(userDataPath, 'harness-cache')
    this.bundlesDir = join(cacheRoot, 'bundles')
    this.tasksDir = join(cacheRoot, 'tasks')
    this.indexPath = join(cacheRoot, 'index.json')
    this.ensureDirs()
  }

  // ─────────────────────────────────────────────
  // Bundle 캐시 (HarnessModel)
  // ─────────────────────────────────────────────

  /**
   * 번들 해시에 해당하는 HarnessModel 을 읽는다.
   *
   * schemaVersion 불일치 또는 손상 JSON 이면 null 을 반환한다(무효화).
   *
   * @param bundleHash - BundleScanner 가 계산한 번들 해시
   * @returns HarnessModel 또는 null (캐시 miss / 무효화)
   */
  getBundle(bundleHash: string): HarnessModel | null {
    const filePath = join(this.bundlesDir, `${bundleHash}.json`)
    if (!existsSync(filePath)) return null
    try {
      const raw = readFileSync(filePath, 'utf-8')
      const model = JSON.parse(raw) as HarnessModel
      if (model.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        // 스키마 버전 불일치 — 무효화
        this.removeBundle(bundleHash)
        return null
      }
      return model
    } catch {
      // 손상 JSON — 무효화
      this.removeBundle(bundleHash)
      return null
    }
  }

  /**
   * HarnessModel 을 번들 해시 키로 저장한다.
   * index.json 도 갱신해 최근 목록에 반영한다.
   *
   * @param bundleHash - 캐시 키
   * @param model - 저장할 HarnessModel
   * @param meta - index 에 기록할 번들 path/name (선택)
   */
  setBundle(bundleHash: string, model: HarnessModel, meta?: { path: string; name: string }): void {
    const filePath = join(this.bundlesDir, `${bundleHash}.json`)
    writeFileSync(filePath, JSON.stringify(model, null, 2), 'utf-8')
    if (meta) {
      this.updateIndex(bundleHash, {
        path: meta.path,
        name: meta.name,
        cachedAt: new Date().toISOString(),
        schemaVersion: model.schemaVersion
      })
    }
  }

  /**
   * 번들 캐시 파일을 삭제한다.
   * 파일이 없거나 삭제 실패 시 조용히 무시한다.
   */
  private removeBundle(bundleHash: string): void {
    try {
      const filePath = join(this.bundlesDir, `${bundleHash}.json`)
      if (existsSync(filePath)) unlinkSync(filePath)
    } catch { /* 조용히 무시 */ }
  }

  // ─────────────────────────────────────────────
  // Task 캐시 (DryRunResult)
  // ─────────────────────────────────────────────

  /**
   * 태스크 해시에 해당하는 DryRunResult 를 읽는다.
   * 손상 JSON 이면 null 반환(무효화).
   *
   * @param taskHash - computeTaskHash 로 계산한 태스크 해시
   * @returns DryRunResult 또는 null (캐시 miss)
   */
  getTask(taskHash: string): DryRunResult | null {
    const filePath = join(this.tasksDir, `${taskHash}.json`)
    if (!existsSync(filePath)) return null
    try {
      const raw = readFileSync(filePath, 'utf-8')
      return JSON.parse(raw) as DryRunResult
    } catch {
      this.removeTask(taskHash)
      return null
    }
  }

  /**
   * DryRunResult 를 태스크 해시 키로 저장한다.
   *
   * @param taskHash - 캐시 키
   * @param result - 저장할 DryRunResult
   */
  setTask(taskHash: string, result: DryRunResult): void {
    const filePath = join(this.tasksDir, `${taskHash}.json`)
    writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf-8')
  }

  /**
   * 태스크 캐시 파일을 삭제한다.
   */
  private removeTask(taskHash: string): void {
    try {
      const filePath = join(this.tasksDir, `${taskHash}.json`)
      if (existsSync(filePath)) unlinkSync(filePath)
    } catch { /* 조용히 무시 */ }
  }

  // ─────────────────────────────────────────────
  // Index (최근 정규화 목록)
  // ─────────────────────────────────────────────

  /**
   * index.json 에서 최근 정규화된 번들 목록을 반환한다.
   * 오류 시 빈 배열 반환 (목록 화면에 영향 최소화).
   *
   * @returns CachedHarnessEntry 배열 (cachedAt 최신 순)
   */
  listCached(): CachedHarnessEntry[] {
    try {
      const index = this.readIndex()
      return Object.values(index)
        .sort((a, b) => b.cachedAt.localeCompare(a.cachedAt))
        .map((entry) => ({
          path: entry.path,
          name: entry.name,
          cachedAt: entry.cachedAt,
          schemaVersion: entry.schemaVersion
        }))
    } catch {
      return []
    }
  }

  // ─────────────────────────────────────────────
  // Cache Clear
  // ─────────────────────────────────────────────

  /**
   * 캐시를 지운다.
   *
   * - path 를 지정한 경우: 해당 번들 경로에 연결된 항목만 삭제.
   * - path 없으면: 전체 bundles/tasks 파일을 모두 삭제하고 index 초기화.
   *
   * @param bundlePath - 특정 번들 경로 (optional)
   * @returns 삭제된 항목 수
   */
  clear(bundlePath?: string): number {
    if (bundlePath) {
      return this.clearByPath(bundlePath)
    }
    return this.clearAll()
  }

  private clearByPath(bundlePath: string): number {
    const index = this.readIndex()
    let cleared = 0
    for (const [hash, entry] of Object.entries(index)) {
      if (entry.path === bundlePath) {
        this.removeBundle(hash)
        delete index[hash]
        cleared++
      }
    }
    this.writeIndex(index)
    return cleared
  }

  private clearAll(): number {
    let cleared = 0
    try {
      const bundleFiles = readdirSync(this.bundlesDir)
      for (const f of bundleFiles) {
        if (f.endsWith('.json')) {
          unlinkSync(join(this.bundlesDir, f))
          cleared++
        }
      }
    } catch { /* 조용히 무시 */ }
    try {
      const taskFiles = readdirSync(this.tasksDir)
      for (const f of taskFiles) {
        if (f.endsWith('.json')) {
          unlinkSync(join(this.tasksDir, f))
          cleared++
        }
      }
    } catch { /* 조용히 무시 */ }
    this.writeIndex({})
    return cleared
  }

  // ─────────────────────────────────────────────
  // 내부 유틸
  // ─────────────────────────────────────────────

  private ensureDirs(): void {
    for (const dir of [this.bundlesDir, this.tasksDir]) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
    }
  }

  private readIndex(): CacheIndex {
    try {
      if (!existsSync(this.indexPath)) return {}
      const raw = readFileSync(this.indexPath, 'utf-8')
      return JSON.parse(raw) as CacheIndex
    } catch {
      return {}
    }
  }

  private writeIndex(index: CacheIndex): void {
    writeFileSync(this.indexPath, JSON.stringify(index, null, 2), 'utf-8')
  }

  private updateIndex(bundleHash: string, entry: IndexEntry): void {
    const index = this.readIndex()
    index[bundleHash] = entry
    this.writeIndex(index)
  }
}
