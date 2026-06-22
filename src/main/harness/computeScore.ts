/**
 * computeScore — HarnessModel 의 구조 신호로 6축 "고삐 점수"를 결정론적으로 계산한다.
 *
 * 기존엔 AI 가 0~10 을 즉흥 추정해 매 실행마다 점수가 흔들렸다(루브릭 부재).
 * 6축은 본래 정량 신호로 매길 수 있으므로, 모델 구조에서 직접 계산해
 * **매번 동일·근거 명확(축별 note)** 하게 만든다. AI 호출/변동성 제거.
 *
 * 각 축 0~10, 총점 0~60. 축별 note 에 산출 근거를 남긴다(투명성).
 *
 * 루브릭(신호 → 점수):
 * - enforcement(강제력)     : hook 수 + 차단 게이트 수 (행동을 실제로 강제하는 장치)
 * - controlFlow(제어흐름)   : 정의된 레벨 수 + 병렬 그룹 + 에이전트 체인 충실도
 * - stateManagement(상태)   : 상태기계 존재 + SIGNAL enum + 에이전트 signals
 * - blockingGates(차단게이트): blocking=true 게이트 수/비율
 * - feedbackLoops(피드백루프): loops(RETURN 등) 수
 * - observability(관측가능성): hook 수 + 상태/리포트·두레이 산출물
 */

import type { HarnessModel, HarnessScore, HarnessScoreAxis } from '../../shared/types/harness'

/** 6축에 필요한 최소 모델 형태 (테스트 용이성 위해 Pick) */
export type ScorableModel = Pick<HarnessModel, 'agents' | 'levels' | 'artifacts' | 'controlFlow'>

const AXIS_MAX = 10

/** 0~10 정수로 클램프 */
function cap(n: number): number {
  return Math.max(0, Math.min(AXIS_MAX, Math.round(n)))
}

/**
 * 구조 신호로 6축 점수를 계산한다.
 * 동일 모델 → 동일 결과(결정론). AI 호출 없음.
 */
export function computeHarnessScore(model: ScorableModel): HarnessScore {
  const cf = model.controlFlow
  const gates = cf.gates ?? []
  const hooks = cf.hooks ?? []
  const loops = cf.loops ?? []
  const parallelGroups = cf.parallelGroups ?? []
  const levels = model.levels ?? []
  const agents = model.agents ?? []
  const artifacts = model.artifacts ?? []

  const blockingGates = gates.filter((g) => g.blocking).length
  const totalGates = gates.length
  const hasStateMachine = !!cf.stateMachine && (cf.stateMachine.transitions?.length ?? 0) > 0
  const signalEnumKeys = cf.signalEnum ? Object.keys(cf.signalEnum).length : 0
  const agentsWithSignals = agents.filter((a) => (a.signals?.length ?? 0) > 0).length
  const avgChainLen = levels.length > 0
    ? levels.reduce((s, l) => s + (l.agentChain?.length ?? 0), 0) / levels.length
    : 0
  const doorayArtifacts = artifacts.filter((a) => a.persist === 'dooray').length
  const stateLikeArtifacts = artifacts.filter((a) =>
    /state|status|report|log|회고|retro|점검/i.test(`${a.id} ${a.location ?? ''}`)
  ).length

  const axes: HarnessScoreAxis[] = [
    {
      key: 'enforcement',
      value: cap(hooks.length * 2 + blockingGates * 1.5),
      max: AXIS_MAX,
      note: `자동 hook ${hooks.length}개 + 차단 게이트 ${blockingGates}개로 행동을 강제`
    },
    {
      key: 'controlFlow',
      value: cap(levels.length * 1.5 + (parallelGroups.length > 0 ? 2 : 0) + Math.min(3, avgChainLen)),
      max: AXIS_MAX,
      note: `레벨 ${levels.length}개 · 병렬 그룹 ${parallelGroups.length}개 · 평균 체인 ${avgChainLen.toFixed(1)}단계`
    },
    {
      key: 'stateManagement',
      value: cap((hasStateMachine ? 5 : 0) + (signalEnumKeys > 0 ? 3 : 0) + Math.min(2, agentsWithSignals)),
      max: AXIS_MAX,
      note: `상태기계 ${hasStateMachine ? '있음' : '없음'} · SIGNAL enum ${signalEnumKeys}종 · signals 보유 에이전트 ${agentsWithSignals}명`
    },
    {
      key: 'blockingGates',
      value: cap(blockingGates * 2.5),
      max: AXIS_MAX,
      note: `차단(exit) 게이트 ${blockingGates}/${totalGates}개`
    },
    {
      key: 'feedbackLoops',
      value: cap(loops.length * 3),
      max: AXIS_MAX,
      note: `루프/피드백(RETURN 등) ${loops.length}개`
    },
    {
      key: 'observability',
      value: cap(hooks.length * 1.5 + doorayArtifacts * 1 + stateLikeArtifacts * 0.7),
      max: AXIS_MAX,
      note: `hook ${hooks.length}개 · 두레이 산출물 ${doorayArtifacts}개 · 상태/리포트 산출물 ${stateLikeArtifacts}개`
    }
  ]

  const total = axes.reduce((s, a) => s + a.value, 0)

  return {
    axes,
    total,
    rationale: `구조 신호 기반 자동 산출(결정론, AI 추정 아님). 총 ${total}/${axes.length * AXIS_MAX}. ` +
      `게이트 ${totalGates}개(차단 ${blockingGates}) · hook ${hooks.length}개 · 루프 ${loops.length}개 · 레벨 ${levels.length}개.`
  }
}
