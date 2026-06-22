/**
 * Compare 뷰 (PRD §12-8).
 *
 * 현재 열린 HarnessModel 과 캐시에서 선택한 다른 모델을 비교한다.
 * 에이전트/레벨/게이트/점수 차이를 표로 표시한다.
 *
 * 상태 전이:
 * - 비교 모델 미선택: 캐시 목록에서 선택 유도
 * - 선택 후 normalize 중: 로딩
 * - normalize 완료: diff 표 표시
 * - 에러: ErrorView
 */

import { useState, useCallback } from 'react'
import {
  GitCompare,
  Plus,
  Minus,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus as MinusLine
} from 'lucide-react'
import type { HarnessModel, CachedHarnessEntry } from '@shared/types/harness'
import Button from '@/components/common/ds/Button'
import Card from '@/components/common/ds/Card'
import Chip from '@/components/common/ds/Chip'
import { LoadingView, ErrorView } from '@/components/common/ds/StateViews'
import { ViewExplainer } from '../shared/ViewExplainer'
import { diffModels } from './compareUtils'
import { buildCompareSummaryLines } from './overviewUtils'
import type { AgentDiff, LevelChainDiff, GateDiff, ScoreAxisDiff, DiffStatus } from './compareUtils'

export interface CompareViewProps {
  /** 현재 열린 모델 (left/기준) */
  model: HarnessModel
  /** 캐시 목록 (right 선택용) */
  cachedList: CachedHarnessEntry[]
}

// ─────────────────────────────────────────────
// diff 상태 표시 헬퍼
// ─────────────────────────────────────────────

type ChipTone = 'emerald' | 'yellow' | 'red' | 'neutral' | 'blue' | 'orange' | 'violet'

function diffStatusTone(status: DiffStatus): ChipTone {
  switch (status) {
    case 'added':     return 'emerald'
    case 'removed':   return 'red'
    case 'changed':   return 'yellow'
    case 'unchanged': return 'neutral'
  }
}

function diffStatusLabel(status: DiffStatus): string {
  switch (status) {
    case 'added':     return '추가'
    case 'removed':   return '제거'
    case 'changed':   return '변경'
    case 'unchanged': return '동일'
  }
}

function DiffStatusIcon({ status }: { status: DiffStatus }): JSX.Element {
  switch (status) {
    case 'added':     return <Plus size={10} className="text-[color:var(--c-emerald-fg)]" />
    case 'removed':   return <Minus size={10} className="text-[color:var(--c-red-fg)]" />
    case 'changed':   return <RefreshCw size={10} className="text-[color:var(--c-yellow-fg)]" />
    case 'unchanged': return <ArrowRight size={10} className="text-[color:var(--text-tertiary)]" />
  }
}

// ─────────────────────────────────────────────
// 에이전트 diff 섹션
// ─────────────────────────────────────────────

function AgentsDiffSection({ agents }: { agents: AgentDiff[] }): JSX.Element | null {
  const [expanded, setExpanded] = useState(true)
  const changed = agents.filter((a) => a.status !== 'unchanged')

  if (agents.length === 0) return null

  return (
    <section>
      <button
        className="flex items-center gap-2 mb-3 w-full text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 flex-1">
          <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
            에이전트
          </h2>
          {changed.length > 0 && <Chip tone="yellow" square>{changed.length}개 변경</Chip>}
          <Chip tone="neutral" square>{agents.length}개</Chip>
        </div>
        {expanded ? <ChevronDown size={13} className="text-[color:var(--text-tertiary)]" /> : <ChevronRight size={13} className="text-[color:var(--text-tertiary)]" />}
      </button>

      {expanded && (
        <Card>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[color:var(--bg-border)]">
                <th className="text-left py-1.5 pr-4 text-[color:var(--text-secondary)] font-medium">에이전트</th>
                <th className="text-left py-1.5 pr-4 text-[color:var(--text-secondary)] font-medium">상태</th>
                <th className="text-left py-1.5 pr-4 text-[color:var(--text-secondary)] font-medium">기준 모델</th>
                <th className="text-left py-1.5 text-[color:var(--text-secondary)] font-medium">비교 모델</th>
                <th className="text-left py-1.5 text-[color:var(--text-secondary)] font-medium">변경 필드</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-[color:var(--bg-border)] last:border-0"
                  style={a.status === 'unchanged' ? { opacity: 0.5 } : undefined}
                >
                  <td className="py-2 pr-4 font-mono text-[color:var(--text-primary)] font-medium">
                    {a.displayName}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-1">
                      <DiffStatusIcon status={a.status} />
                      <Chip tone={diffStatusTone(a.status)} square>
                        {diffStatusLabel(a.status)}
                      </Chip>
                    </div>
                  </td>
                  <td className="py-2 pr-4">
                    {a.left ? (
                      <Chip tone="neutral" square>{a.left.model}</Chip>
                    ) : (
                      <span className="text-[color:var(--text-tertiary)]">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {a.right ? (
                      <Chip
                        tone={a.status === 'changed' && a.left?.model !== a.right.model ? 'yellow' : 'neutral'}
                        square
                      >
                        {a.right.model}
                      </Chip>
                    ) : (
                      <span className="text-[color:var(--text-tertiary)]">—</span>
                    )}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {a.changedFields.map((f) => (
                        <span key={f} className="ds-chip sq yellow text-xs">{f}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────
// 레벨 체인 diff 섹션
// ─────────────────────────────────────────────

function LevelsDiffSection({ levels }: { levels: LevelChainDiff[] }): JSX.Element | null {
  const [expanded, setExpanded] = useState(true)
  const changed = levels.filter((l) => l.status !== 'unchanged')

  if (levels.length === 0) return null

  return (
    <section>
      <button
        className="flex items-center gap-2 mb-3 w-full text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 flex-1">
          <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
            레벨 체인
          </h2>
          {changed.length > 0 && <Chip tone="yellow" square>{changed.length}개 변경</Chip>}
        </div>
        {expanded ? <ChevronDown size={13} className="text-[color:var(--text-tertiary)]" /> : <ChevronRight size={13} className="text-[color:var(--text-tertiary)]" />}
      </button>

      {expanded && (
        <div className="flex flex-col gap-2">
          {levels.map((l) => (
            <Card
              key={l.levelId}
              className="flex flex-col gap-2"
              style={l.status === 'unchanged' ? { opacity: 0.5 } : undefined}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[color:var(--text-primary)] font-mono">
                  {l.levelId}
                </span>
                <span className="text-xs text-[color:var(--text-secondary)]">{l.levelName}</span>
                <div className="flex items-center gap-1 ml-auto">
                  <DiffStatusIcon status={l.status} />
                  <Chip tone={diffStatusTone(l.status)} square>{diffStatusLabel(l.status)}</Chip>
                </div>
              </div>

              {l.status !== 'unchanged' && (
                <div className="flex flex-col gap-1.5 text-xs">
                  {l.leftChain.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[color:var(--text-tertiary)] w-8 text-right flex-none">기준:</span>
                      {l.leftChain.map((id) => (
                        <span
                          key={id}
                          className={`ds-chip sq ${l.removedAgents.includes(id) ? 'red' : 'neutral'}`}
                        >
                          {id}
                        </span>
                      ))}
                    </div>
                  )}
                  {l.rightChain.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[color:var(--text-tertiary)] w-8 text-right flex-none">비교:</span>
                      {l.rightChain.map((id) => (
                        <span
                          key={id}
                          className={`ds-chip sq ${l.addedAgents.includes(id) ? 'emerald' : 'neutral'}`}
                        >
                          {id}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────
// 게이트 diff 섹션
// ─────────────────────────────────────────────

function GatesDiffSection({ gates }: { gates: GateDiff[] }): JSX.Element | null {
  const [expanded, setExpanded] = useState(true)
  const changed = gates.filter((g) => g.status !== 'unchanged')

  if (gates.length === 0) return null

  return (
    <section>
      <button
        className="flex items-center gap-2 mb-3 w-full text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 flex-1">
          <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
            게이트
          </h2>
          {changed.length > 0 && <Chip tone="yellow" square>{changed.length}개 변경</Chip>}
          <Chip tone="neutral" square>{gates.length}개</Chip>
        </div>
        {expanded ? <ChevronDown size={13} className="text-[color:var(--text-tertiary)]" /> : <ChevronRight size={13} className="text-[color:var(--text-tertiary)]" />}
      </button>

      {expanded && (
        <Card>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[color:var(--bg-border)]">
                <th className="text-left py-1.5 pr-4 text-[color:var(--text-secondary)] font-medium">Phase</th>
                <th className="text-left py-1.5 pr-4 text-[color:var(--text-secondary)] font-medium">상태</th>
                <th className="text-left py-1.5 pr-4 text-[color:var(--text-secondary)] font-medium">기준 blocking</th>
                <th className="text-left py-1.5 text-[color:var(--text-secondary)] font-medium">비교 blocking</th>
              </tr>
            </thead>
            <tbody>
              {gates.map((g) => (
                <tr
                  key={g.phase}
                  className="border-b border-[color:var(--bg-border)] last:border-0"
                  style={g.status === 'unchanged' ? { opacity: 0.5 } : undefined}
                >
                  <td className="py-2 pr-4 font-mono text-[color:var(--text-primary)]">{g.phase}</td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-1">
                      <DiffStatusIcon status={g.status} />
                      <Chip tone={diffStatusTone(g.status)} square>{diffStatusLabel(g.status)}</Chip>
                    </div>
                  </td>
                  <td className="py-2 pr-4">
                    {g.left !== undefined ? (
                      <Chip tone={g.left.blocking ? 'red' : 'neutral'} square>
                        {g.left.blocking ? 'blocking' : 'warn'}
                      </Chip>
                    ) : (
                      <span className="text-[color:var(--text-tertiary)]">—</span>
                    )}
                  </td>
                  <td className="py-2">
                    {g.right !== undefined ? (
                      <Chip tone={g.right.blocking ? 'red' : 'neutral'} square>
                        {g.right.blocking ? 'blocking' : 'warn'}
                      </Chip>
                    ) : (
                      <span className="text-[color:var(--text-tertiary)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────
// 점수 diff 섹션
// ─────────────────────────────────────────────

function DeltaIcon({ delta }: { delta: number }): JSX.Element {
  if (delta > 0) return <TrendingUp size={10} className="text-[color:var(--c-emerald-fg)]" />
  if (delta < 0) return <TrendingDown size={10} className="text-[color:var(--c-red-fg)]" />
  return <MinusLine size={10} className="text-[color:var(--text-tertiary)]" />
}

function ScoreDiffSection({
  scores,
  totalDelta
}: {
  scores: ScoreAxisDiff[]
  totalDelta?: number
}): JSX.Element | null {
  const [expanded, setExpanded] = useState(true)

  if (scores.length === 0) return null

  return (
    <section>
      <button
        className="flex items-center gap-2 mb-3 w-full text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 flex-1">
          <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
            점수
          </h2>
          {totalDelta !== undefined && (
            <div className="flex items-center gap-1">
              <DeltaIcon delta={totalDelta} />
              <Chip tone={totalDelta > 0 ? 'emerald' : totalDelta < 0 ? 'red' : 'neutral'} square>
                총점 {totalDelta > 0 ? '+' : ''}{totalDelta}
              </Chip>
            </div>
          )}
        </div>
        {expanded ? <ChevronDown size={13} className="text-[color:var(--text-tertiary)]" /> : <ChevronRight size={13} className="text-[color:var(--text-tertiary)]" />}
      </button>

      {expanded && (
        <Card>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[color:var(--bg-border)]">
                <th className="text-left py-1.5 pr-4 text-[color:var(--text-secondary)] font-medium">축</th>
                <th className="text-left py-1.5 pr-4 text-[color:var(--text-secondary)] font-medium">기준</th>
                <th className="text-left py-1.5 pr-4 text-[color:var(--text-secondary)] font-medium">비교</th>
                <th className="text-left py-1.5 text-[color:var(--text-secondary)] font-medium">변화</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((axis) => (
                <tr key={axis.key} className="border-b border-[color:var(--bg-border)] last:border-0">
                  <td className="py-2 pr-4 font-medium text-[color:var(--text-primary)]">{axis.label}</td>
                  <td className="py-2 pr-4 text-[color:var(--text-secondary)]">
                    {axis.leftValue !== undefined && axis.leftMax !== undefined
                      ? `${axis.leftValue}/${axis.leftMax}`
                      : '—'}
                  </td>
                  <td className="py-2 pr-4 text-[color:var(--text-secondary)]">
                    {axis.rightValue !== undefined && axis.rightMax !== undefined
                      ? `${axis.rightValue}/${axis.rightMax}`
                      : '—'}
                  </td>
                  <td className="py-2">
                    {axis.delta !== undefined ? (
                      <div className="flex items-center gap-1">
                        <DeltaIcon delta={axis.delta} />
                        <span
                          className={
                            axis.delta > 0
                              ? 'text-[color:var(--c-emerald-fg)]'
                              : axis.delta < 0
                                ? 'text-[color:var(--c-red-fg)]'
                                : 'text-[color:var(--text-tertiary)]'
                          }
                        >
                          {axis.delta > 0 ? '+' : ''}{axis.delta}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-[color:var(--text-tertiary)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────
// 비교 모델 선택 UI
// ─────────────────────────────────────────────

function SelectTargetView({
  currentModel,
  cachedList,
  onSelect
}: {
  currentModel: HarnessModel
  cachedList: CachedHarnessEntry[]
  onSelect: (entry: CachedHarnessEntry) => void
}): JSX.Element {
  // 현재 모델과 동일한 경로는 선택 불가
  const candidates = cachedList.filter((e) => e.path !== currentModel.meta.source)

  if (candidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 gap-3">
        <GitCompare size={24} className="text-[color:var(--text-tertiary)]" />
        <p className="text-sm font-semibold text-[color:var(--text-secondary)]">비교할 하네스 없음</p>
        <p className="text-xs text-[color:var(--text-tertiary)] text-center max-w-xs">
          캐시에 다른 하네스가 없습니다. 하네스를 더 가져오면 여기서 비교할 수 있습니다.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <GitCompare size={14} className="text-[color:var(--clauday-blue)]" />
        <p className="text-sm font-semibold text-[color:var(--text-primary)]">비교할 하네스 선택</p>
      </div>
      <p className="text-xs text-[color:var(--text-secondary)]">
        현재 열린 <strong>{currentModel.meta.name}</strong> 과 비교할 하네스를 선택하세요.
      </p>
      <div className="flex flex-col gap-2">
        {candidates.map((entry) => (
          <div
            key={entry.path}
            className="flex items-center gap-3 p-3 rounded-lg border border-[color:var(--bg-border)] bg-[color:var(--bg-surface)] hover:bg-[color:var(--bg-surface-hover)] cursor-pointer transition-colors"
            onClick={() => onSelect(entry)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(entry) }}
            aria-label={`${entry.name} 와 비교`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[color:var(--text-primary)] truncate">{entry.name}</p>
              <p className="text-xs text-[color:var(--text-tertiary)] truncate">{entry.path}</p>
            </div>
            <Button variant="secondary" size="xs">비교</Button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Compare 뷰 본체
// ─────────────────────────────────────────────

/**
 * Compare 뷰 본체.
 *
 * 비교 모델 선택 → normalize → diff 표 표시.
 * diff 로직은 compareUtils.ts 의 순수함수 사용.
 */
export function CompareView({ model, cachedList }: CompareViewProps): JSX.Element {
  const [rightModel, setRightModel] = useState<HarnessModel | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // ViewExplainer 는 비교 모델 선택 전에도 항상 표시

  const handleSelect = useCallback(async (entry: CachedHarnessEntry) => {
    setLoading(true)
    setError(null)
    try {
      const normalized = await window.api.harness.normalize({ path: entry.path })
      setRightModel(normalized)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const handleReset = useCallback(() => {
    setRightModel(null)
    setError(null)
  }, [])

  const explainerNode = (
    <ViewExplainer
      title="비교"
      howto={
        <span>
          두 하네스의 구조 차이(diff)를 보여줍니다 — 추가/제거된 에이전트, 모델·레벨체인·게이트·점수 변화.
          "내 방법론 두 개가 어떻게 다른가"를 파악하는 용도입니다.
          변경 항목만 굵게 강조되고, 동일한 항목은 흐리게 표시됩니다.
        </span>
      }
      topic="이 두 하네스의 핵심 차이를 평어로 요약"
      sourcePath={model.meta.source}
      icon={GitCompare}
    />
  )

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        {explainerNode}
        <div className="flex items-center justify-center flex-1 p-8">
          <LoadingView label="비교 모델 로드 중..." />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col h-full">
        {explainerNode}
        <div className="flex items-center justify-center flex-1 p-8">
          <ErrorView title="비교 모델 로드 실패" body={error} onRetry={handleReset} />
        </div>
      </div>
    )
  }

  if (!rightModel) {
    return (
      <div className="flex flex-col h-full">
        {explainerNode}
        <SelectTargetView
          currentModel={model}
          cachedList={cachedList}
          onSelect={(entry) => void handleSelect(entry)}
        />
      </div>
    )
  }

  const diff = diffModels(model, rightModel)
  const hasChanges =
    diff.summary.agentsAdded > 0 ||
    diff.summary.agentsRemoved > 0 ||
    diff.summary.agentsChanged > 0 ||
    diff.summary.levelsChanged > 0 ||
    diff.summary.gatesAdded > 0 ||
    diff.summary.gatesRemoved > 0 ||
    diff.summary.gatesChanged > 0

  const summaryLines = buildCompareSummaryLines(
    diff.leftName,
    diff.rightName,
    diff.summary,
    diff.scoreTotalDelta
  )

  return (
    <div className="flex flex-col">
      {explainerNode}
    <div className="flex flex-col gap-5 p-4">
      {/* 평어 요약 */}
      {summaryLines.length > 0 && (
        <section className="flex flex-col gap-1.5 p-3 rounded-lg border border-[color:var(--bg-border)] bg-[color:var(--bg-surface)]">
          <p className="text-xs font-semibold text-[color:var(--text-secondary)] mb-1">한 줄 요약</p>
          {summaryLines.map((line, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-[color:var(--text-primary)]">
              <span className="flex-none mt-1 w-1.5 h-1.5 rounded-full bg-[color:var(--clauday-blue)]" />
              <span>{line.text}</span>
            </div>
          ))}
        </section>
      )}

      {/* 헤더 — 비교 대상 표시 */}
      <section>
        <div className="flex items-center gap-2 p-3 rounded-lg border border-[color:var(--bg-border)] bg-[color:var(--bg-surface)] flex-wrap">
          <GitCompare size={14} className="text-[color:var(--clauday-blue)] flex-none" />
          <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
            <span className="text-sm font-semibold text-[color:var(--text-primary)] truncate">{diff.leftName}</span>
            <ArrowRight size={12} className="text-[color:var(--text-tertiary)] flex-none" />
            <span className="text-sm font-semibold text-[color:var(--text-primary)] truncate">{diff.rightName}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {hasChanges ? (
              <>
                {diff.summary.agentsAdded + diff.summary.agentsRemoved + diff.summary.agentsChanged > 0 && (
                  <Chip tone="yellow" square>
                    에이전트 {diff.summary.agentsAdded + diff.summary.agentsRemoved + diff.summary.agentsChanged}개 변경
                  </Chip>
                )}
                {diff.summary.levelsChanged > 0 && (
                  <Chip tone="yellow" square>레벨 {diff.summary.levelsChanged}개 변경</Chip>
                )}
                {diff.summary.gatesAdded + diff.summary.gatesRemoved + diff.summary.gatesChanged > 0 && (
                  <Chip tone="yellow" square>
                    게이트 {diff.summary.gatesAdded + diff.summary.gatesRemoved + diff.summary.gatesChanged}개 변경
                  </Chip>
                )}
              </>
            ) : (
              <Chip tone="emerald" square>변경 없음</Chip>
            )}
          </div>
          <Button variant="ghost" size="xs" onClick={handleReset}>
            다시 선택
          </Button>
        </div>
      </section>

      {/* 변경 없음 안내 */}
      {!hasChanges && diff.scores.length === 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[color:var(--c-emerald-bg)] text-xs text-[color:var(--c-emerald-fg)]">
          <AlertTriangle size={11} className="flex-none" />
          두 하네스 사이에 감지된 차이가 없습니다.
        </div>
      )}

      {/* 에이전트 diff */}
      <AgentsDiffSection agents={diff.agents} />

      {/* 레벨 체인 diff */}
      <LevelsDiffSection levels={diff.levels} />

      {/* 게이트 diff */}
      <GatesDiffSection gates={diff.gates} />

      {/* 점수 diff */}
      <ScoreDiffSection scores={diff.scores} totalDelta={diff.scoreTotalDelta} />
    </div>
    </div>
  )
}

export default CompareView
