/**
 * DryRunEstimator.test.ts — Dry-run 실행기 단위 테스트
 *
 * 검증 항목:
 * 1. 캐시 hit → AI 재호출 없이 즉시 반환.
 * 2. 캐시 miss → AIService.estimateLevel 호출 → levelPath 결합 → 캐시 저장.
 * 3. levelPath 결정론 적용 — level 별 highlightPath / estTimeRel / estCostRel.
 * 4. AIService 와 HarnessCache 는 주입형으로 모킹.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'os'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { DryRunEstimator } from './DryRunEstimator'
import type { IAIServiceForEstimator } from './DryRunEstimator'
import { HarnessCache } from './HarnessCache'
import { computeTaskHash } from './taskHash'
import type { HarnessModel, HarnessLevelId, DryRunResult } from '../../shared/types/harness'

// ─────────────────────────────────────────────────────────────────────────────
// 픽스처 팩토리
// ─────────────────────────────────────────────────────────────────────────────

function createTmpDir(): string {
  const dir = join(tmpdir(), `dry-run-est-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * 최소 HarnessModel 픽스처.
 * levels 를 커스터마이즈해 levelPath 결과를 제어할 수 있다.
 */
function makeModel(overrides: Partial<HarnessModel> = {}): HarnessModel {
  return {
    schemaVersion: 1,
    meta: {
      name: 'test-bundle',
      source: '/tmp/test-bundle',
      bundleHash: 'test-bundle-hash-abc',
      kind: 'bundle',
    },
    agents: [],
    levels: [
      {
        id: 'L0' as HarnessLevelId,
        name: 'Hotfix',
        agentChain: ['developer'],
        requiredArtifacts: [],
      },
      {
        id: 'L1' as HarnessLevelId,
        name: 'Standard',
        agentChain: ['pm', 'developer', 'qa'],
        requiredArtifacts: ['story'],
      },
      {
        id: 'L2' as HarnessLevelId,
        name: 'Complex',
        agentChain: ['pm', 'architect', 'developer', 'qa'],
        parallelInChain: [['developer', 'qa']],
        requiredArtifacts: ['story', 'adr'],
      },
      {
        id: 'L3' as HarnessLevelId,
        name: 'Epic',
        agentChain: ['pm', 'architect', 'sm', 'developer', 'qa', 'security'],
        parallelInChain: [['qa', 'security']],
        requiredArtifacts: ['story', 'adr', 'epic'],
      },
    ],
    triage: { questions: [], rules: [] },
    artifacts: [],
    controlFlow: {
      gates: [],
      hooks: [],
      parallelGroups: [],
      loops: [],
    },
    warnings: [],
    provenance: {},
    ...overrides,
  }
}

/**
 * AI 추정 결과 픽스처.
 */
function makeEstimate(
  level: HarnessLevelId = 'L1'
): Pick<DryRunResult, 'level' | 'answers' | 'rationale'> {
  return {
    level,
    answers: [`레벨 ${level} 판정됨`],
    rationale: `테스트 근거 — ${level}`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 테스트 스위트
// ─────────────────────────────────────────────────────────────────────────────

describe('DryRunEstimator', () => {
  let tmpUserData: string
  let cache: HarnessCache
  let mockAI: IAIServiceForEstimator
  let estimator: DryRunEstimator

  beforeEach(() => {
    tmpUserData = createTmpDir()
    cache = new HarnessCache(tmpUserData)
    mockAI = {
      estimateLevel: vi.fn(),
    }
    estimator = new DryRunEstimator(mockAI, cache)
  })

  afterEach(() => {
    try {
      rmSync(tmpUserData, { recursive: true, force: true })
    } catch { /* cleanup 실패 무시 */ }
  })

  // ── 캐시 miss → AI 호출 + levelPath 결합 ────────────────────────────────

  describe('캐시 miss — AI 호출 + levelPath 결합', () => {
    it('estimateLevel 을 호출하고 DryRunResult 를 반환한다', async () => {
      vi.mocked(mockAI.estimateLevel).mockResolvedValue(makeEstimate('L1'))
      const model = makeModel()

      const result = await estimator.estimate(model, '간단한 기능 추가')

      expect(vi.mocked(mockAI.estimateLevel)).toHaveBeenCalledTimes(1)
      expect(result.level).toBe('L1')
      expect(result.answers).toEqual(['레벨 L1 판정됨'])
      expect(result.rationale).toBe('테스트 근거 — L1')
    })

    it('L1 레벨 — highlightPath 는 agentChain 과 일치한다', async () => {
      vi.mocked(mockAI.estimateLevel).mockResolvedValue(makeEstimate('L1'))
      const model = makeModel()

      const result = await estimator.estimate(model, 'L1 태스크')

      expect(result.highlightPath).toEqual(['pm', 'developer', 'qa'])
      expect(result.estTimeRel).toBe(2.0)
    })

    it('L3 레벨 — highlightPath 에 security 포함, parallelGroups 추출', async () => {
      vi.mocked(mockAI.estimateLevel).mockResolvedValue(makeEstimate('L3'))
      const model = makeModel()

      const result = await estimator.estimate(model, 'L3 대규모 기능')

      expect(result.highlightPath).toContain('security')
      expect(result.parallelGroups).toEqual([['qa', 'security']])
      expect(result.estTimeRel).toBe(6.0)
    })

    it('L0 레벨 — developer 만 경로에 포함, 최소 비용', async () => {
      vi.mocked(mockAI.estimateLevel).mockResolvedValue(makeEstimate('L0'))
      const model = makeModel()

      const result = await estimator.estimate(model, '단순 hotfix')

      expect(result.highlightPath).toEqual(['developer'])
      expect(result.estTimeRel).toBe(1.0)
    })

    it('결과를 taskHash 캐시에 저장한다', async () => {
      vi.mocked(mockAI.estimateLevel).mockResolvedValue(makeEstimate('L1'))
      const model = makeModel()
      const taskText = '캐시 저장 테스트'

      await estimator.estimate(model, taskText)

      const taskHash = computeTaskHash(model.meta.bundleHash, taskText)
      const cached = cache.getTask(taskHash)
      expect(cached).not.toBeNull()
      expect(cached?.level).toBe('L1')
    })
  })

  // ── 캐시 hit → AI 재호출 없음 ────────────────────────────────────────────

  describe('캐시 hit — AI 재호출 없음', () => {
    it('동일 bundleHash + 동일 taskText → 캐시에서 즉시 반환, estimateLevel 재호출 없음', async () => {
      vi.mocked(mockAI.estimateLevel).mockResolvedValue(makeEstimate('L2'))
      const model = makeModel()
      const taskText = '동일한 태스크'

      // 첫 번째 호출 (캐시 miss)
      await estimator.estimate(model, taskText)
      expect(vi.mocked(mockAI.estimateLevel)).toHaveBeenCalledTimes(1)

      // 두 번째 호출 (캐시 hit)
      const result = await estimator.estimate(model, taskText)
      expect(vi.mocked(mockAI.estimateLevel)).toHaveBeenCalledTimes(1) // 재호출 없음
      expect(result.level).toBe('L2')
    })

    it('앞뒤 공백이 다른 동일 내용 태스크도 캐시 hit 된다', async () => {
      vi.mocked(mockAI.estimateLevel).mockResolvedValue(makeEstimate('L1'))
      const model = makeModel()

      await estimator.estimate(model, '태스크 내용')
      expect(vi.mocked(mockAI.estimateLevel)).toHaveBeenCalledTimes(1)

      // 공백 차이 — normalizeTaskText 가 동일 해시를 생성해야 함
      await estimator.estimate(model, '  태스크 내용  ')
      expect(vi.mocked(mockAI.estimateLevel)).toHaveBeenCalledTimes(1) // 캐시 hit
    })

    it('다른 bundleHash 인 모델 → 캐시 miss (AI 재호출)', async () => {
      vi.mocked(mockAI.estimateLevel).mockResolvedValue(makeEstimate('L1'))
      const model1 = makeModel()
      const model2 = makeModel({
        meta: {
          ...makeModel().meta,
          bundleHash: 'different-hash-xyz',
        },
      })
      const taskText = '동일한 태스크'

      await estimator.estimate(model1, taskText)
      expect(vi.mocked(mockAI.estimateLevel)).toHaveBeenCalledTimes(1)

      await estimator.estimate(model2, taskText)
      expect(vi.mocked(mockAI.estimateLevel)).toHaveBeenCalledTimes(2) // 다른 번들이므로 재호출
    })
  })

  // ── securityOverride 결정론 적용 ─────────────────────────────────────────

  describe('securityOverride 결정론 — neon 스타일', () => {
    it('L3 + securityOverride 조건 — security 에이전트가 highlightPath 에 추가된다', async () => {
      vi.mocked(mockAI.estimateLevel).mockResolvedValue(makeEstimate('L3'))

      const model = makeModel({
        // neon 스타일: L3 체인에 security 없고, securityOverride 로 추가
        levels: [
          {
            id: 'L0' as HarnessLevelId,
            name: 'Nano',
            agentChain: ['developer'],
            requiredArtifacts: [],
          },
          {
            id: 'L3' as HarnessLevelId,
            name: 'Project',
            agentChain: ['analyst', 'architect', 'developer', 'qa'],
            requiredArtifacts: ['story', 'adr', 'epic'],
          },
        ],
        triage: {
          questions: [{ id: 'Q3', text: '보안 요구사항?', meaning: '보안 여부' }],
          rules: [{ when: 'Q3=Yes', then: 'L3' }],
          securityOverride: 'L3 OR Q3=Yes 이면 security 에이전트 필수',
        },
        agents: [
          {
            id: 'neon-security',
            displayName: 'security',
            role: '보안 검토',
            model: 'opus' as const,
            modelSource: 'static' as const,
            tools: [],
            reads: [],
            writes: [],
            phaseClass: 'security',
          },
        ],
      })

      const result = await estimator.estimate(model, '보안 관련 대규모 기능')

      expect(result.level).toBe('L3')
      expect(result.highlightPath).toContain('neon-security')
    })
  })

  // ── DryRunResult 구조 완전성 ──────────────────────────────────────────────

  describe('DryRunResult 구조 완전성', () => {
    it('반환 결과에 required 필드가 모두 있다', async () => {
      vi.mocked(mockAI.estimateLevel).mockResolvedValue(makeEstimate('L1'))
      const model = makeModel()

      const result = await estimator.estimate(model, '구조 검증 태스크')

      // DryRunResult 필수 필드 전부 확인
      expect(typeof result.level).toBe('string')
      expect(Array.isArray(result.answers)).toBe(true)
      expect(typeof result.rationale).toBe('string')
      expect(Array.isArray(result.highlightPath)).toBe(true)
      expect(Array.isArray(result.parallelGroups)).toBe(true)
      expect(Array.isArray(result.gates)).toBe(true)
      expect(typeof result.estTimeRel).toBe('number')
      expect(typeof result.estCostRel).toBe('number')
    })

    it('level 은 L0~L3 중 하나여야 한다', async () => {
      vi.mocked(mockAI.estimateLevel).mockResolvedValue(makeEstimate('L2'))
      const model = makeModel()

      const result = await estimator.estimate(model, '레벨 검증')

      expect(['L0', 'L1', 'L2', 'L3']).toContain(result.level)
    })

    it('requestId 를 전달해도 결과에 영향 없다', async () => {
      vi.mocked(mockAI.estimateLevel).mockResolvedValue(makeEstimate('L0'))
      const model = makeModel()

      const result = await estimator.estimate(model, 'requestId 테스트', 'req-123')

      expect(result.level).toBe('L0')
      // estimateLevel 이 requestId + undefined projectContext 를 받았는지 확인
      expect(vi.mocked(mockAI.estimateLevel)).toHaveBeenCalledWith(
        'requestId 테스트',
        model.triage,
        'req-123',
        undefined
      )
    })
  })

  // ── projectContext / projectContextSig 통합 ──────────────────────────────
  describe('projectContext + projectContextSig', () => {
    it('projectContext 가 있으면 estimateLevel 에 전달된다', async () => {
      vi.mocked(mockAI.estimateLevel).mockResolvedValue(makeEstimate('L1'))
      const model = makeModel()
      const ctx = '프로젝트 경로: /my/project\npackage.json 감지됨 (my-app)'

      await estimator.estimate(model, 'ctx 전달 테스트', undefined, ctx)

      expect(vi.mocked(mockAI.estimateLevel)).toHaveBeenCalledWith(
        'ctx 전달 테스트',
        model.triage,
        undefined,
        ctx
      )
    })

    it('같은 bundleHash+taskText 라도 projectContextSig 가 다르면 캐시 miss 발생 (AI 재호출)', async () => {
      vi.mocked(mockAI.estimateLevel).mockResolvedValue(makeEstimate('L1'))
      const model = makeModel()
      const taskText = '동일 태스크'

      // 첫 번째 호출 — sig-A
      await estimator.estimate(model, taskText, undefined, 'ctx-A', 'sig-A')
      expect(vi.mocked(mockAI.estimateLevel)).toHaveBeenCalledTimes(1)

      // 두 번째 호출 — sig-B (다른 서명 → 캐시 miss → AI 재호출)
      await estimator.estimate(model, taskText, undefined, 'ctx-B', 'sig-B')
      expect(vi.mocked(mockAI.estimateLevel)).toHaveBeenCalledTimes(2)
    })

    it('같은 projectContextSig 이면 캐시 hit (AI 재호출 없음)', async () => {
      vi.mocked(mockAI.estimateLevel).mockResolvedValue(makeEstimate('L2'))
      const model = makeModel()
      const taskText = '캐시 서명 테스트'

      await estimator.estimate(model, taskText, undefined, 'ctx-X', 'sig-X')
      expect(vi.mocked(mockAI.estimateLevel)).toHaveBeenCalledTimes(1)

      // 같은 sig → 캐시 hit
      await estimator.estimate(model, taskText, undefined, 'ctx-X', 'sig-X')
      expect(vi.mocked(mockAI.estimateLevel)).toHaveBeenCalledTimes(1) // 재호출 없음
    })

    it('projectContext 없는 경우 기존 동작(캐시 hit) 그대로 — 회귀 없음', async () => {
      vi.mocked(mockAI.estimateLevel).mockResolvedValue(makeEstimate('L0'))
      const model = makeModel()
      const taskText = '기존 동작 회귀 테스트'

      await estimator.estimate(model, taskText)
      await estimator.estimate(model, taskText)

      expect(vi.mocked(mockAI.estimateLevel)).toHaveBeenCalledTimes(1)
    })
  })
})
