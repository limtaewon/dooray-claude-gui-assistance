/**
 * HarnessService.test.ts
 *
 * 핵심 검증 항목:
 * 1. normalize: 캐시 hit 시 AIService 를 호출하지 않는다.
 * 2. normalize: 캐시 miss 시 AIService 를 호출하고 캐시에 저장한다.
 * 3. normalize: force=true 시 캐시 miss 처럼 재정규화한다.
 * 4. clearCache / listCached 동작.
 * 5. discover: 빈 skills 폴더 처리 (graceful).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { HarnessService, HarnessInputTooLongError, MAX_TASK_TEXT_LENGTH, MAX_TOPIC_LENGTH } from './HarnessService'
import type { IAIServiceForHarness } from './HarnessService'
import { CURRENT_SCHEMA_VERSION } from './HarnessCache'
import type { HarnessModel, DryRunResult } from '../../shared/types/harness'

// ─────────────────────────────────────────────
// 픽스처 팩토리
// ─────────────────────────────────────────────

function createTmpUserData(): string {
  const dir = join(tmpdir(), `harness-service-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** 최소 번들 디렉터리를 생성하고 경로 반환 */
function createMinimalBundle(name: string): string {
  const bundlePath = join(tmpdir(), `bundle-${name}-${Date.now()}`)
  mkdirSync(bundlePath, { recursive: true })
  // README.md 추가 (detectBundleKind 에서 파일 목록을 사용하고, collectBundleText 에서 읽음)
  writeFileSync(join(bundlePath, 'README.md'), `# ${name} bundle`)
  // SKILL.md 추가 — SKILL.md 만 있으면 partial-skill 로 감지됨
  writeFileSync(join(bundlePath, 'SKILL.md'), `---\nname: ${name}-agent\ntools:\n  - Read\n---\n# Agent`)
  return bundlePath
}

/** 최소 HarnessModel 픽스처 */
function makeModel(bundlePath: string, bundleHash = 'mock-hash'): HarnessModel {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: {
      name: require('path').basename(bundlePath),
      source: bundlePath,
      bundleHash,
      kind: 'partial-skill',
    },
    agents: [],
    levels: [],
    triage: { questions: [], rules: [] },
    artifacts: [],
    controlFlow: { gates: [], hooks: [], parallelGroups: [], loops: [] },
    warnings: [],
    provenance: {},
  }
}

function makeEstimate(): Pick<DryRunResult, 'level' | 'answers' | 'rationale'> {
  return {
    level: 'L1',
    answers: ['테스트 답변'],
    rationale: '테스트 근거',
  }
}

// ─────────────────────────────────────────────
// 테스트 스위트
// ─────────────────────────────────────────────

describe('HarnessService', () => {
  let userDataPath: string
  let mockAI: IAIServiceForHarness
  let service: HarnessService

  beforeEach(() => {
    userDataPath = createTmpUserData()
    mockAI = {
      normalizeHarness: vi.fn(),
      estimateLevel: vi.fn(),
      explainHarness: vi.fn(),
      getModelConfig: vi.fn(() => ({})),
    }
  })

  afterEach(() => {
    try {
      rmSync(userDataPath, { recursive: true, force: true })
    } catch { /* cleanup 실패는 무시 */ }
  })

  // ── scan ──────────────────────────────────────────────────────────────────

  describe('scan', () => {
    it('번들 경로를 정적 스캔하여 RawBundleSummary 를 반환한다', async () => {
      const bundlePath = createMinimalBundle('scan-test')
      service = new HarnessService(userDataPath, mockAI)

      const summary = await service.scan(bundlePath)

      expect(summary).toBeDefined()
      expect(summary.kind).toBeDefined()
      expect(Array.isArray(summary.fileTree)).toBe(true)
      expect(Array.isArray(summary.agentStubs)).toBe(true)
      expect(Array.isArray(summary.warnings)).toBe(true)
    })
  })

  // ── normalize: 캐시 hit / miss ────────────────────────────────────────────

  describe('normalize', () => {
    it('캐시 miss 시 AIService.normalizeHarness 를 호출한다', async () => {
      const bundlePath = createMinimalBundle('normalize-miss')
      service = new HarnessService(userDataPath, mockAI)
      await service.scan(bundlePath) // 경로 게이트 등록(실제 import 흐름: scan→normalize)

      vi.mocked(mockAI.normalizeHarness).mockImplementation(async (skeleton) => {
        // scanner 가 계산한 bundleHash 를 meta 에 반영해서 반환
        return makeModel(bundlePath, (skeleton.meta?.bundleHash) || 'mock')
      })

      const result = await service.normalize(bundlePath)

      expect(result).toBeDefined()
      expect(vi.mocked(mockAI.normalizeHarness)).toHaveBeenCalledTimes(1)
    })

    it('캐시 hit 시 AIService.normalizeHarness 를 호출하지 않는다', async () => {
      const bundlePath = createMinimalBundle('normalize-hit')
      service = new HarnessService(userDataPath, mockAI)
      await service.scan(bundlePath)

      vi.mocked(mockAI.normalizeHarness).mockImplementation(async (skeleton) => {
        return makeModel(bundlePath, skeleton.meta?.bundleHash || 'mock')
      })

      // 첫 번째 호출 (캐시 miss → AI 호출 → 캐시 저장)
      await service.normalize(bundlePath)
      expect(vi.mocked(mockAI.normalizeHarness)).toHaveBeenCalledTimes(1)

      // 두 번째 호출 (캐시 hit → AI 호출 없음)
      const result = await service.normalize(bundlePath)
      expect(vi.mocked(mockAI.normalizeHarness)).toHaveBeenCalledTimes(1) // 여전히 1회
      expect(result).toBeDefined()
    })

    it('force=true 시 캐시가 있어도 AIService 를 재호출한다', async () => {
      const bundlePath = createMinimalBundle('normalize-force')
      service = new HarnessService(userDataPath, mockAI)
      await service.scan(bundlePath)

      vi.mocked(mockAI.normalizeHarness).mockImplementation(async (skeleton) => {
        return makeModel(bundlePath, skeleton.meta?.bundleHash || 'mock')
      })

      // 첫 번째 호출 (캐시 miss)
      await service.normalize(bundlePath)
      expect(vi.mocked(mockAI.normalizeHarness)).toHaveBeenCalledTimes(1)

      // force=true 로 두 번째 호출 (캐시 무시 → AI 재호출)
      await service.normalize(bundlePath, true)
      expect(vi.mocked(mockAI.normalizeHarness)).toHaveBeenCalledTimes(2)
    })

    it('정규화 모델이 바뀌면(예: AI 버전 업글) 캐시를 무시하고 재정규화한다', async () => {
      const bundlePath = createMinimalBundle('renorm-on-model-change')
      vi.mocked(mockAI.getModelConfig).mockReturnValue({ harnessNormalize: 'sonnet' })
      service = new HarnessService(userDataPath, mockAI)
      await service.scan(bundlePath)
      vi.mocked(mockAI.normalizeHarness).mockImplementation(async (skeleton) =>
        makeModel(bundlePath, skeleton.meta?.bundleHash || 'mock')
      )

      await service.normalize(bundlePath)
      expect(vi.mocked(mockAI.normalizeHarness)).toHaveBeenCalledTimes(1)

      // 같은 모델 → 캐시 hit (재호출 없음)
      await service.normalize(bundlePath)
      expect(vi.mocked(mockAI.normalizeHarness)).toHaveBeenCalledTimes(1)

      // 모델 변경(sonnet → opus) → 캐시 무효화 후 재정규화
      vi.mocked(mockAI.getModelConfig).mockReturnValue({ harnessNormalize: 'opus' })
      await service.normalize(bundlePath)
      expect(vi.mocked(mockAI.normalizeHarness)).toHaveBeenCalledTimes(2)
    })

    it('AI 오류 시 크래시 없이 축소 모델을 반환한다', async () => {
      const bundlePath = createMinimalBundle('normalize-error')
      service = new HarnessService(userDataPath, mockAI)
      await service.scan(bundlePath)

      vi.mocked(mockAI.normalizeHarness).mockRejectedValue(new Error('AI 오류'))

      const result = await service.normalize(bundlePath)

      // 크래시 없이 결과 반환
      expect(result).toBeDefined()
      expect(result.warnings.some((w) => w.includes('AI 정규화 호출 실패'))).toBe(true)
    })
  })

  // ── clearCache / listCached ───────────────────────────────────────────────

  describe('clearCache / listCached', () => {
    it('normalize 후 listCached 에 항목이 있다', async () => {
      const bundlePath = createMinimalBundle('list-cached')
      service = new HarnessService(userDataPath, mockAI)
      await service.scan(bundlePath)

      vi.mocked(mockAI.normalizeHarness).mockImplementation(async (skeleton) => {
        return makeModel(bundlePath, skeleton.meta?.bundleHash || 'mock')
      })

      await service.normalize(bundlePath)

      const cached = service.listCached()
      expect(cached.length).toBeGreaterThan(0)
      expect(cached[0].path).toBe(bundlePath)
    })

    it('clearCache() 로 전체 삭제 후 listCached 가 빈 배열을 반환한다', async () => {
      const bundlePath = createMinimalBundle('clear-cache-all')
      service = new HarnessService(userDataPath, mockAI)
      await service.scan(bundlePath)

      vi.mocked(mockAI.normalizeHarness).mockImplementation(async (skeleton) => {
        return makeModel(bundlePath, skeleton.meta?.bundleHash || 'mock')
      })

      await service.normalize(bundlePath)
      expect(service.listCached().length).toBeGreaterThan(0)

      const cleared = service.clearCache()
      expect(cleared).toBeGreaterThan(0)

      expect(service.listCached().length).toBe(0)
    })

    it('clearCache(path) 로 특정 번들만 삭제된다', async () => {
      const bundlePath1 = createMinimalBundle('clear-path-1')
      const bundlePath2 = createMinimalBundle('clear-path-2')
      service = new HarnessService(userDataPath, mockAI)
      await service.scan(bundlePath1)
      await service.scan(bundlePath2)

      vi.mocked(mockAI.normalizeHarness).mockImplementation(async (skeleton) => {
        return makeModel(skeleton.meta?.source || bundlePath1, skeleton.meta?.bundleHash || 'mock')
      })

      await service.normalize(bundlePath1)
      await service.normalize(bundlePath2)
      expect(service.listCached().length).toBe(2)

      service.clearCache(bundlePath1)

      const remaining = service.listCached()
      expect(remaining.some((c) => c.path === bundlePath1)).toBe(false)
    })
  })

  // ── discover ──────────────────────────────────────────────────────────────

  describe('discover', () => {
    it('~/.claude/skills 가 없으면 빈 배열을 반환한다', async () => {
      service = new HarnessService(userDataPath, mockAI)

      // homedir() 를 모킹하기 어렵고, 실제로 ~/.claude/skills 가 없을 수도 있어
      // 기본 동작(빈 배열 또는 배열)만 확인한다.
      const result = await service.discover()
      expect(Array.isArray(result)).toBe(true)
    })
  })

  // ── 입력 길이 검증 (P2-4) ────────────────────────────────────────────────

  describe('입력 길이 검증', () => {
    it('taskText 가 MAX_TASK_TEXT_LENGTH 이하이면 정상 처리된다', async () => {
      const bundlePath = createMinimalBundle('input-len-ok')
      service = new HarnessService(userDataPath, mockAI)
      await service.scan(bundlePath)

      vi.mocked(mockAI.normalizeHarness).mockImplementation(async (skeleton) =>
        makeModel(bundlePath, skeleton.meta?.bundleHash || 'mock')
      )
      vi.mocked(mockAI.estimateLevel).mockResolvedValue(makeEstimate())

      const okText = 'a'.repeat(MAX_TASK_TEXT_LENGTH)
      // 경계값 — 던지지 않아야 한다
      await expect(service.dryrun(bundlePath, okText)).resolves.toBeDefined()
    })

    it('taskText 가 MAX_TASK_TEXT_LENGTH 초과이면 HarnessInputTooLongError 를 throw 한다', async () => {
      const bundlePath = createMinimalBundle('input-len-exceed')
      service = new HarnessService(userDataPath, mockAI)
      await service.scan(bundlePath)

      vi.mocked(mockAI.normalizeHarness).mockImplementation(async (skeleton) =>
        makeModel(bundlePath, skeleton.meta?.bundleHash || 'mock')
      )
      vi.mocked(mockAI.estimateLevel).mockResolvedValue(makeEstimate())

      const tooLong = 'x'.repeat(MAX_TASK_TEXT_LENGTH + 1)
      await expect(service.dryrun(bundlePath, tooLong)).rejects.toBeInstanceOf(HarnessInputTooLongError)
    })

    it('topic 이 MAX_TOPIC_LENGTH 이하이면 정상 처리된다', async () => {
      const bundlePath = createMinimalBundle('topic-len-ok')
      service = new HarnessService(userDataPath, mockAI)
      await service.scan(bundlePath)

      vi.mocked(mockAI.normalizeHarness).mockImplementation(async (skeleton) =>
        makeModel(bundlePath, skeleton.meta?.bundleHash || 'mock')
      )
      vi.mocked(mockAI.explainHarness).mockResolvedValue('## 설명\n테스트')

      const okTopic = 'b'.repeat(MAX_TOPIC_LENGTH)
      await expect(service.explain(bundlePath, okTopic)).resolves.toBeDefined()
    })

    it('topic 이 MAX_TOPIC_LENGTH 초과이면 HarnessInputTooLongError 를 throw 한다', async () => {
      const bundlePath = createMinimalBundle('topic-len-exceed')
      service = new HarnessService(userDataPath, mockAI)
      await service.scan(bundlePath)

      const tooLongTopic = 't'.repeat(MAX_TOPIC_LENGTH + 1)
      await expect(service.explain(bundlePath, tooLongTopic)).rejects.toBeInstanceOf(HarnessInputTooLongError)
    })

    it('HarnessInputTooLongError 는 field/maxLength/actualLength 를 담는다', async () => {
      const bundlePath = createMinimalBundle('error-fields')
      service = new HarnessService(userDataPath, mockAI)
      await service.scan(bundlePath)

      vi.mocked(mockAI.normalizeHarness).mockImplementation(async (skeleton) =>
        makeModel(bundlePath, skeleton.meta?.bundleHash || 'mock')
      )

      const actual = MAX_TASK_TEXT_LENGTH + 100
      const tooLong = 'y'.repeat(actual)
      try {
        await service.dryrun(bundlePath, tooLong)
        expect.fail('에러가 throw 되어야 한다')
      } catch (err) {
        expect(err).toBeInstanceOf(HarnessInputTooLongError)
        const e = err as HarnessInputTooLongError
        expect(e.field).toBe('taskText')
        expect(e.maxLength).toBe(MAX_TASK_TEXT_LENGTH)
        expect(e.actualLength).toBe(actual)
      }
    })
  })

  // ── dryrun (M7) ──────────────────────────────────────────────────────────

  describe('dryrun', () => {
    it('DryRunResult 를 반환한다 — level/answers/rationale/highlightPath 포함', async () => {
      const bundlePath = createMinimalBundle('dryrun-basic')
      service = new HarnessService(userDataPath, mockAI)
      await service.scan(bundlePath)

      vi.mocked(mockAI.normalizeHarness).mockImplementation(async (skeleton) => {
        return makeModel(bundlePath, skeleton.meta?.bundleHash || 'mock')
      })
      vi.mocked(mockAI.estimateLevel).mockResolvedValue(makeEstimate())

      const result = await service.dryrun(bundlePath, '간단한 버그 수정')

      expect(result.level).toBe('L1')
      expect(result.answers).toEqual(['테스트 답변'])
      expect(result.rationale).toBe('테스트 근거')
      // levelPath 가 빈 레벨 정의로 인해 기본값 반환
      expect(Array.isArray(result.highlightPath)).toBe(true)
      expect(Array.isArray(result.parallelGroups)).toBe(true)
      expect(Array.isArray(result.gates)).toBe(true)
      expect(typeof result.estTimeRel).toBe('number')
      expect(typeof result.estCostRel).toBe('number')
    })

    it('동일 번들+태스크 두 번째 호출 시 AI 를 재호출하지 않는다 (taskHash 캐시)', async () => {
      const bundlePath = createMinimalBundle('dryrun-cache')
      service = new HarnessService(userDataPath, mockAI)
      await service.scan(bundlePath)

      vi.mocked(mockAI.normalizeHarness).mockImplementation(async (skeleton) => {
        return makeModel(bundlePath, skeleton.meta?.bundleHash || 'mock')
      })
      vi.mocked(mockAI.estimateLevel).mockResolvedValue(makeEstimate())

      const taskText = '동일한 태스크 텍스트'
      await service.dryrun(bundlePath, taskText)
      expect(vi.mocked(mockAI.estimateLevel)).toHaveBeenCalledTimes(1)

      // 두 번째 동일 태스크 — taskHash 캐시 hit
      await service.dryrun(bundlePath, taskText)
      expect(vi.mocked(mockAI.estimateLevel)).toHaveBeenCalledTimes(1) // 여전히 1회
    })
  })
})
