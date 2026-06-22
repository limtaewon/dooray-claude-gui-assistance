/**
 * levelPath.test.ts — levelPath 순수 함수 단위 테스트
 *
 * 검증 항목:
 * 1. triage rules 결정론 — reined "Q4→L3", neon "L3 OR Q3=Yes" securityOverride 양쪽
 * 2. 병렬 그룹 추출 (parallelInChain)
 * 3. 예상 시간/비용 상대값 계산
 * 4. 레벨별 highlightPath 구성
 * 5. 레벨 정의 없음 → 빈 결과(degradation)
 * 6. securityOverride 없으면 security 에이전트 추가 안 함
 */

import { describe, it, expect } from 'vitest'
import { levelPath, isSecurityRequired } from '../levelPath'
import type { HarnessModel, HarnessLevelId } from '../../../shared/types/harness'

// ─────────────────────────────────────────────────────────────────────────────
// 픽스처 팩토리
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 최소 HarnessModel 픽스처.
 * levels / triage / agents / controlFlow 를 커스터마이즈 가능.
 */
function makeModel(overrides: Partial<HarnessModel> = {}): HarnessModel {
  return {
    schemaVersion: 1,
    meta: {
      name: 'test-bundle',
      source: '/tmp/test-bundle',
      bundleHash: 'test-hash-001',
      kind: 'bundle',
    },
    agents: [],
    levels: [],
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

// ─────────────────────────────────────────────────────────────────────────────
// 레벨 픽스처
// ─────────────────────────────────────────────────────────────────────────────

/** reined-bmad 스타일 레벨 정의 (L0~L3 전체) */
function reinedLevels() {
  return [
    {
      id: 'L0' as HarnessLevelId,
      name: 'Hotfix',
      agentChain: ['developer'],
      requiredArtifacts: [],
    },
    {
      id: 'L1' as HarnessLevelId,
      name: 'Standard Feature',
      agentChain: ['pm', 'developer', 'qa'],
      requiredArtifacts: ['story'],
    },
    {
      id: 'L2' as HarnessLevelId,
      name: 'Complex Feature',
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
  ]
}

/** neon-bmad 스타일 레벨 정의 (L0~L3 전체) */
function neonLevels() {
  return [
    {
      id: 'L0' as HarnessLevelId,
      name: 'Nano',
      agentChain: ['developer'],
      requiredArtifacts: [],
    },
    {
      id: 'L1' as HarnessLevelId,
      name: 'Standard',
      agentChain: ['analyst', 'developer', 'qa'],
      requiredArtifacts: ['story'],
    },
    {
      id: 'L2' as HarnessLevelId,
      name: 'Feature',
      agentChain: ['analyst', 'architect', 'developer', 'qa'],
      requiredArtifacts: ['story', 'adr'],
    },
    {
      id: 'L3' as HarnessLevelId,
      name: 'Project',
      agentChain: ['analyst', 'architect', 'developer', 'qa'],
      parallelInChain: [['developer', 'qa']],
      requiredArtifacts: ['story', 'adr', 'epic'],
    },
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// isSecurityRequired 단위 테스트
// ─────────────────────────────────────────────────────────────────────────────

describe('isSecurityRequired', () => {
  it('securityOverride 없으면 false', () => {
    expect(isSecurityRequired(undefined, 'L3')).toBe(false)
    expect(isSecurityRequired('', 'L3')).toBe(false)
  })

  it('"L3" 조건이면 L3 에서만 true', () => {
    expect(isSecurityRequired('L3 이상 필수', 'L3')).toBe(true)
    expect(isSecurityRequired('L3 이상 필수', 'L2')).toBe(false)
    expect(isSecurityRequired('L3 이상 필수', 'L1')).toBe(false)
    expect(isSecurityRequired('L3 이상 필수', 'L0')).toBe(false)
  })

  it('"L3 OR Q3=Yes" 패턴 — L3 이면 true', () => {
    expect(isSecurityRequired('L3 OR Q3=Yes 이면 security 에이전트 필수', 'L3')).toBe(true)
    expect(isSecurityRequired('L3 OR Q3=Yes 이면 security 에이전트 필수', 'L2')).toBe(false)
  })

  it('"L2 이상" 패턴 — L2, L3 에서 true', () => {
    expect(isSecurityRequired('L2 이상이면 security 필수', 'L2')).toBe(true)
    expect(isSecurityRequired('L2 이상이면 security 필수', 'L3')).toBe(true)
    expect(isSecurityRequired('L2 이상이면 security 필수', 'L1')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// levelPath 핵심 테스트
// ─────────────────────────────────────────────────────────────────────────────

describe('levelPath', () => {
  // ── 레벨 정의 없음 → degradation ──────────────────────────────────────────

  describe('레벨 정의 없음 (degradation)', () => {
    it('빈 levels 배열이면 빈 경로와 기본 가중치를 반환한다', () => {
      const model = makeModel({ levels: [] })
      const result = levelPath(model, 'L1')

      expect(result.highlightPath).toEqual([])
      expect(result.parallelGroups).toEqual([])
      expect(result.gates).toEqual([])
      expect(result.estTimeRel).toBe(2.0) // L1 기본값
      expect(result.estCostRel).toBe(1.8) // L1 기본값
    })

    it('해당 레벨이 없으면 빈 경로를 반환한다', () => {
      const model = makeModel({
        levels: [{ id: 'L0', name: 'Hotfix', agentChain: ['developer'], requiredArtifacts: [] }],
      })
      const result = levelPath(model, 'L3')

      expect(result.highlightPath).toEqual([])
    })

    it('agentChain 이 빈 배열이면 빈 경로를 반환한다', () => {
      const model = makeModel({
        levels: [{ id: 'L2', name: 'Empty', agentChain: [], requiredArtifacts: [] }],
      })
      const result = levelPath(model, 'L2')

      expect(result.highlightPath).toEqual([])
      expect(result.estTimeRel).toBe(3.5) // L2 기본값
    })
  })

  // ── reined-bmad 스타일 ────────────────────────────────────────────────────

  describe('reined-bmad 스타일 (Q4→L3, 체인 존재)', () => {
    it('L0: developer 만 경로에 포함된다', () => {
      const model = makeModel({ levels: reinedLevels() })
      const result = levelPath(model, 'L0')

      expect(result.highlightPath).toEqual(['developer'])
      expect(result.parallelGroups).toEqual([])
      expect(result.estTimeRel).toBe(1.0)
    })

    it('L1: pm → developer → qa 순 경로', () => {
      const model = makeModel({ levels: reinedLevels() })
      const result = levelPath(model, 'L1')

      expect(result.highlightPath).toEqual(['pm', 'developer', 'qa'])
      expect(result.parallelGroups).toEqual([])
      expect(result.estTimeRel).toBe(2.0)
    })

    it('L2: parallelInChain [developer, qa] 가 parallelGroups 에 포함된다', () => {
      const model = makeModel({ levels: reinedLevels() })
      const result = levelPath(model, 'L2')

      expect(result.highlightPath).toEqual(['pm', 'architect', 'developer', 'qa'])
      expect(result.parallelGroups).toEqual([['developer', 'qa']])
      expect(result.estTimeRel).toBe(3.5)
    })

    it('L3: 체인에 security 이미 포함, parallelInChain 추출', () => {
      const model = makeModel({ levels: reinedLevels() })
      const result = levelPath(model, 'L3')

      expect(result.highlightPath).toContain('security')
      expect(result.highlightPath).toContain('qa')
      expect(result.parallelGroups).toEqual([['qa', 'security']])
      expect(result.estTimeRel).toBe(6.0)
    })

    it('L3 에서 비용은 L0 체인 대비 에이전트 수에 비례한다', () => {
      const model = makeModel({ levels: reinedLevels() })
      const l3Result = levelPath(model, 'L3')
      const l0Result = levelPath(model, 'L0')

      // L0 체인 길이=1, L3 체인 길이=6 → costRel > l0.estCostRel
      expect(l3Result.estCostRel).toBeGreaterThan(l0Result.estCostRel)
    })
  })

  // ── neon-bmad 스타일 (securityOverride 적용) ──────────────────────────────

  describe('neon-bmad 스타일 (securityOverride = "L3 OR Q3=Yes")', () => {
    const neonModel = () => makeModel({
      levels: neonLevels(),
      triage: {
        questions: [
          { id: 'Q3', text: '보안 요구사항이 있는가?', meaning: '보안 관련 여부' },
        ],
        rules: [
          { when: 'Q3=Yes', then: 'L3' },
        ],
        securityOverride: 'L3 OR Q3=Yes 이면 security 에이전트 필수',
      },
      agents: [
        {
          id: 'neon-security',
          displayName: 'security',
          role: '보안 검토',
          model: 'opus',
          modelSource: 'static',
          tools: [],
          reads: [],
          writes: [],
          phaseClass: 'security',
        },
      ],
    })

    it('L3 에서 securityOverride 적용 — security 에이전트가 경로에 추가된다', () => {
      const model = neonModel()
      const result = levelPath(model, 'L3')

      expect(result.highlightPath).toContain('neon-security')
    })

    it('L1 에서 securityOverride 미적용 — security 에이전트 추가 없음', () => {
      const model = neonModel()
      const result = levelPath(model, 'L1')

      expect(result.highlightPath).not.toContain('neon-security')
    })

    it('securityOverride 없으면 security 에이전트 추가 안 함', () => {
      const model = makeModel({
        levels: neonLevels(),
        triage: {
          questions: [],
          rules: [],
          // securityOverride 없음
        },
        agents: [
          {
            id: 'neon-security',
            displayName: 'security',
            role: '보안',
            model: 'opus',
            modelSource: 'static',
            tools: [],
            reads: [],
            writes: [],
            phaseClass: 'security',
          },
        ],
      })
      const result = levelPath(model, 'L3')

      // L3 체인에 security 없고 securityOverride 도 없으니 추가 안 됨
      expect(result.highlightPath).not.toContain('neon-security')
    })

    it('security 에이전트가 이미 체인에 있으면 중복 추가하지 않는다', () => {
      const model = makeModel({
        levels: [
          {
            id: 'L3' as HarnessLevelId,
            name: 'Project',
            agentChain: ['analyst', 'neon-security'],
            requiredArtifacts: [],
          },
          {
            id: 'L0' as HarnessLevelId,
            name: 'Nano',
            agentChain: ['developer'],
            requiredArtifacts: [],
          },
        ],
        triage: {
          questions: [],
          rules: [],
          securityOverride: 'L3 이면 security 필수',
        },
        agents: [
          {
            id: 'neon-security',
            displayName: 'security',
            role: '보안',
            model: 'opus',
            modelSource: 'static',
            tools: [],
            reads: [],
            writes: [],
            phaseClass: 'security',
          },
        ],
      })
      const result = levelPath(model, 'L3')

      const count = result.highlightPath.filter((id) => id === 'neon-security').length
      expect(count).toBe(1) // 중복 없음
    })
  })

  // ── 게이트 매핑 ──────────────────────────────────────────────────────────

  describe('게이트 매핑', () => {
    it('에이전트 체인에 속하는 게이트 phase 가 결과에 포함된다', () => {
      const model = makeModel({
        levels: [
          {
            id: 'L1' as HarnessLevelId,
            name: 'Standard',
            agentChain: ['developer', 'qa'],
            requiredArtifacts: [],
          },
          { id: 'L0' as HarnessLevelId, name: 'Hotfix', agentChain: ['developer'], requiredArtifacts: [] },
        ],
        controlFlow: {
          gates: [
            { phase: 'developer', ruleCodes: ['R501'], blocking: true },
            { phase: 'qa', ruleCodes: ['R502'], blocking: true },
            { phase: 'release', ruleCodes: ['R601'], blocking: true }, // 체인에 없음
          ],
          hooks: [],
          parallelGroups: [],
          loops: [],
        },
      })
      const result = levelPath(model, 'L1')

      expect(result.gates).toContain('developer')
      expect(result.gates).toContain('qa')
      expect(result.gates).not.toContain('release') // 체인에 없으므로 제외
    })

    it('게이트 없으면 빈 배열 반환', () => {
      const model = makeModel({ levels: reinedLevels() }) // controlFlow.gates=[]
      const result = levelPath(model, 'L2')

      expect(result.gates).toEqual([])
    })
  })

  // ── 예상 시간/비용 ────────────────────────────────────────────────────────

  describe('예상 시간/비용 상대값', () => {
    it('L0 기준 1.0, L3 는 6.0 배', () => {
      const model = makeModel({ levels: reinedLevels() })

      expect(levelPath(model, 'L0').estTimeRel).toBe(1.0)
      expect(levelPath(model, 'L1').estTimeRel).toBe(2.0)
      expect(levelPath(model, 'L2').estTimeRel).toBe(3.5)
      expect(levelPath(model, 'L3').estTimeRel).toBe(6.0)
    })

    it('L0 체인이 없으면 LEVEL_COST_WEIGHT 기본값을 사용한다', () => {
      // L0 레벨 정의 없는 모델 (L2 만 정의)
      const model = makeModel({
        levels: [
          {
            id: 'L2' as HarnessLevelId,
            name: 'Complex',
            agentChain: ['analyst', 'developer', 'qa'],
            requiredArtifacts: [],
          },
        ],
      })
      const result = levelPath(model, 'L2')

      // L0 없으면 calcCostRel 이 LEVEL_COST_WEIGHT['L2'] = 3.0 반환
      expect(result.estCostRel).toBe(3.0)
    })
  })
})
