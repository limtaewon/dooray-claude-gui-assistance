/**
 * Gates & 강제 패널 (PRD §7-4).
 *
 * - 4계층 제약 요약 (gate / hook / signal / loop)
 * - 게이트 규칙코드 + blocking 배지
 * - hook 종류 목록
 * - 상태기계 전이 (stateMachine) 시각화
 */

import {
  ShieldCheck,
  ShieldAlert,
  Zap,
  RotateCcw,
  ArrowRight,
  AlertTriangle,
  Lock,
  Unlock,
  Activity,
  FileCheck,
  ListChecks,
  CheckCircle2,
  Dot
} from 'lucide-react'
import type { HarnessModel } from '@shared/types/harness'
import Card from '@/components/common/ds/Card'
import Chip from '@/components/common/ds/Chip'
import { EmptyView } from '@/components/common/ds/StateViews'
import { ProvenanceBadge } from '../shared/ProvenanceBadge'
import { ViewExplainer } from '../shared/ViewExplainer'
import {
  buildConstraintLayers,
  partitionGates,
  groupRuleCodes,
  groupStateMachineByFrom,
  hookEventTone
} from './gatesUtils'
import { groupRuleDetails } from './gateRuleGroups'
import type { RuleCategory } from './gateRuleGroups'

/** 카테고리별 lucide 아이콘 컴포넌트 반환 */
function RuleGroupIcon({ category, size = 11 }: { category: RuleCategory; size?: number }): JSX.Element {
  switch (category) {
    case 'existence': return <FileCheck size={size} className="text-[color:var(--c-emerald-fg)] flex-none" />
    case 'section':   return <ListChecks size={size} className="text-[color:var(--c-blue-fg)] flex-none" />
    case 'content':   return <CheckCircle2 size={size} className="text-[color:var(--c-violet-fg)] flex-none" />
    case 'domain':    return <ShieldAlert size={size} className="text-[color:var(--c-orange-fg)] flex-none" />
    default:          return <Dot size={size} className="text-[color:var(--text-tertiary)] flex-none" />
  }
}

export interface GatesPanelProps {
  model: HarnessModel
  sourcePath?: string
}

/**
 * Gates & 강제 패널 본체.
 *
 * 섹션:
 * 0. ViewExplainer 해설 배너
 * 1. 4계층 제약 요약
 * 2. 게이트 상세 (phase별 규칙코드 + blocking)
 * 3. Hook 목록
 * 4. 상태기계 전이 테이블
 */
export function GatesPanel({ model, sourcePath }: GatesPanelProps): JSX.Element {
  const { controlFlow } = model
  const layers = buildConstraintLayers(controlFlow)
  const { blocking: blockingGates, nonBlocking: nonBlockingGates } = partitionGates(controlFlow.gates)
  const stateMachineGroups = groupStateMachineByFrom(controlFlow.stateMachine)

  const hasAnyData =
    controlFlow.gates.length > 0 ||
    controlFlow.hooks.length > 0 ||
    (controlFlow.stateMachine?.transitions?.length ?? 0) > 0

  if (!hasAnyData) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <EmptyView
          icon={ShieldCheck}
          title="제어흐름 정보 없음"
          body="번들에서 게이트·훅·상태기계를 감지하지 못했습니다."
        />
      </div>
    )
  }

  const path = sourcePath ?? model.meta.source

  return (
    <div className="flex flex-col">
      <ViewExplainer
        title="Gates / 강제"
        howto={
          <span>
            페이즈별로 무엇을 강제 차단하는지 보여줍니다.{' '}
            <strong>규칙코드</strong>는 실패 조건 식별자이고,{' '}
            <strong className="text-[color:var(--c-red-fg)]">차단(blocking)</strong>은 실제 진행을 막는 게이트이고,{' '}
            <strong>경고(non-blocking)</strong>는 진행은 가능하지만 주의가 필요한 게이트입니다.
            훅(Hooks)은 자동 실행되는 강제 트리거를 나타냅니다.
          </span>
        }
        topic="이 하네스의 게이트와 강제 메커니즘을 설명"
        sourcePath={path}
        icon={ShieldCheck}
      />
    <div className="flex flex-col gap-5 p-4">
      {/* 섹션 1 — 4계층 제약 요약 */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={14} className="text-[color:var(--c-emerald-fg)]" />
          <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
            4계층 제약
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {layers.map((layer) => (
            <Card key={layer.key} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[color:var(--text-primary)]">
                  {layer.label}
                </span>
                {layer.runtimeEnforced && (
                  <Chip tone="red" square>런타임 강제</Chip>
                )}
              </div>
              {layer.hasData ? (
                <span className="text-lg font-bold text-[color:var(--text-primary)]">
                  {layer.count}
                </span>
              ) : (
                <span className="text-xs text-[color:var(--text-tertiary)]">없음</span>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* 섹션 2 — 게이트 상세 */}
      {controlFlow.gates.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert size={14} className="text-[color:var(--c-red-fg)]" />
            <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
              게이트 규칙
            </h2>
            {blockingGates.length > 0 && (
              <Chip tone="red" square>{blockingGates.length}개 차단(blocking)</Chip>
            )}
            {nonBlockingGates.length > 0 && (
              <Chip tone="neutral" square>{nonBlockingGates.length}개 경고</Chip>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {controlFlow.gates.map((gate, i) => {
              const ruleGroups = groupRuleCodes(gate.ruleCodes)
              const gateProvKey = `controlFlow.gates.${i}.description`
              const descSource = model.provenance[gateProvKey] ?? 'ai'
              return (
                <Card key={`${gate.phase}-${i}`} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {gate.blocking ? (
                      <Lock size={12} className="text-[color:var(--c-red-fg)] flex-none" />
                    ) : (
                      <Unlock size={12} className="text-[color:var(--text-tertiary)] flex-none" />
                    )}
                    <span className="text-sm font-semibold text-[color:var(--text-primary)] font-mono">
                      {gate.phase}
                    </span>
                    {gate.blocking && <Chip tone="red" square>차단</Chip>}
                    {ruleGroups.map((g) =>
                      g.codes.map((code) => (
                        <Chip key={code} tone="violet" square>{code}</Chip>
                      ))
                    )}
                  </div>
                  {gate.description && (
                    <div className="flex items-start gap-1.5">
                      <p className="text-xs text-[color:var(--text-secondary)] flex-1">
                        {gate.description}
                      </p>
                      <ProvenanceBadge source={descSource} size="xs" />
                    </div>
                  )}
                  {/* 규칙 코드별 검사 내용 — 성격별 그룹핑 */}
                  {gate.ruleDetails && gate.ruleDetails.length > 0 && (() => {
                    const groups = groupRuleDetails(gate.ruleDetails)
                    return (
                      <div className="flex flex-col gap-2 mt-1 pt-2 border-t border-[color:var(--bg-border)]">
                        {groups.map((group) => (
                          <div key={group.category} className="flex flex-col gap-1">
                            {/* 그룹 소제목 */}
                            <div className="flex items-center gap-1">
                              <RuleGroupIcon category={group.category} />
                              <span className="text-[calc(10px_*_var(--app-font-scale,1))] font-medium text-[color:var(--text-secondary)] uppercase tracking-wide">
                                {group.label}
                              </span>
                            </div>
                            {/* 그룹 규칙 목록 */}
                            <div className="flex flex-col gap-1 pl-4">
                              {group.rules.map((d) => (
                                <div key={d.code} className="flex items-start gap-2">
                                  <Chip tone="violet" square>{d.code}</Chip>
                                  <span className="text-xs text-[color:var(--text-secondary)] leading-relaxed flex-1 min-w-0">
                                    {d.message}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {/* 섹션 3 — Hook 목록 */}
      {controlFlow.hooks.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className="text-[color:var(--c-orange-fg)]" />
            <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
              Hooks
            </h2>
            <Chip tone="orange" square>{controlFlow.hooks.length}개</Chip>
          </div>
          <div className="flex flex-col gap-2">
            {controlFlow.hooks.map((hook, i) => {
              const tone = hookEventTone(hook.event)
              const enforcesSource = model.provenance[`controlFlow.hooks.${i}.enforces`] ?? 'ai'
              return (
                <Card key={`${hook.file}-${i}`} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-[color:var(--text-primary)] flex-1">
                      {hook.file}
                    </span>
                    {hook.event && (
                      <Chip tone={tone} square>{hook.event}</Chip>
                    )}
                  </div>
                  {hook.enforces && (
                    <div className="flex items-start gap-1.5">
                      <p className="text-xs text-[color:var(--text-secondary)] flex-1">
                        {hook.enforces}
                      </p>
                      <ProvenanceBadge source={enforcesSource} size="xs" />
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {/* 섹션 4 — 병렬 그룹 / 루프 */}
      {(controlFlow.parallelGroups.length > 0 || controlFlow.loops.length > 0) && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <RotateCcw size={14} className="text-[color:var(--c-blue-fg)]" />
            <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
              병렬 그룹 / 피드백 루프
            </h2>
          </div>
          <div className="flex flex-col gap-2">
            {controlFlow.parallelGroups.map((pg, i) => (
              <div
                key={`pg-${i}`}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-[color:var(--c-blue-bg)] text-xs text-[color:var(--c-blue-fg)]"
              >
                <Activity size={11} className="flex-none" />
                {pg}
              </div>
            ))}
            {controlFlow.loops.map((loop, i) => (
              <div
                key={`loop-${i}`}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-[color:var(--c-orange-bg)] text-xs text-[color:var(--c-orange-fg)]"
              >
                <RotateCcw size={11} className="flex-none" />
                {loop}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 섹션 5 — 상태기계 전이 */}
      {stateMachineGroups.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <ArrowRight size={14} className="text-[color:var(--c-emerald-fg)]" />
            <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
              상태기계 전이
            </h2>
          </div>
          <Card>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[color:var(--bg-border)]">
                  <th className="text-left py-1.5 pr-4 text-[color:var(--text-secondary)] font-medium">From</th>
                  <th className="text-left py-1.5 pr-4 text-[color:var(--text-secondary)] font-medium">Signal</th>
                  <th className="text-left py-1.5 text-[color:var(--text-secondary)] font-medium">To</th>
                </tr>
              </thead>
              <tbody>
                {stateMachineGroups.map((group) =>
                  group.transitions.map((t, ti) => (
                    <tr
                      key={`${group.from}-${ti}`}
                      className="border-b border-[color:var(--bg-border)] last:border-0"
                    >
                      <td className="py-2 pr-4 font-mono text-[color:var(--text-primary)]">
                        {ti === 0 ? group.from : ''}
                      </td>
                      <td className="py-2 pr-4">
                        <Chip tone="blue" square>{t.on}</Chip>
                      </td>
                      <td className="py-2 font-mono text-[color:var(--text-primary)]">
                        {t.to}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      {/* degradation 경고 */}
      {model.warnings.length > 0 && (
        <section>
          <div className="flex flex-col gap-1">
            {model.warnings.map((w, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-[color:var(--c-yellow-bg)] text-xs text-[color:var(--c-yellow-fg)]"
              >
                <AlertTriangle size={11} className="flex-none" />
                {w}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
    </div>
  )
}

export default GatesPanel
