/**
 * Overview 패널 — 하네스 번들을 처음 보는 팀원이 빠르게 이해할 수 있도록
 * 결정론 요약(AI 호출 없음)과 AI 심화 설명 버튼을 제공한다.
 *
 * 구성:
 * 1. 헤더: 이름 + tagline + kind/version/author
 * 2. 한눈에 카드 묶음: 에이전트/레벨/게이트/산출물/점수
 * 3. "태스크를 주면 이렇게 흐릅니다" — 평어 레벨 흐름 서술
 * 4. Triage 한 줄 설명
 * 5. Warnings
 * 6. AI 심화 설명 버튼
 */

import { useState, useCallback } from 'react'
import {
  Users,
  GitBranch,
  ShieldCheck,
  Package,
  BarChart2,
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Workflow,
  Info
} from 'lucide-react'
import type { HarnessModel } from '@shared/types/harness'
import Card from '@/components/common/ds/Card'
import Chip from '@/components/common/ds/Chip'
import Button from '@/components/common/ds/Button'
import { buildLevelFlowParagraph, buildTriageSummary } from './overviewUtils'

export interface OverviewPanelProps {
  model: HarnessModel
  sourcePath: string
  onNavigate?: (tab: string) => void
}

// ─────────────────────────────────────────────
// 한눈에 카드
// ─────────────────────────────────────────────

interface QuickStatCardProps {
  label: string
  count: number
  icon: React.ReactNode
  onNavigate?: () => void
  navigateLabel?: string
}

function QuickStatCard({ label, count, icon, onNavigate, navigateLabel }: QuickStatCardProps): JSX.Element {
  return (
    <Card className="flex flex-col gap-1.5 p-3">
      <div className="flex items-center gap-1.5 text-[color:var(--text-secondary)]">
        <span className="flex-none">{icon}</span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <span className="text-2xl font-bold text-[color:var(--text-primary)] leading-none">
        {count}
      </span>
      {onNavigate && (
        <button
          className="text-xs text-[color:var(--clauday-blue)] hover:underline text-left flex items-center gap-0.5 mt-0.5"
          onClick={onNavigate}
        >
          {navigateLabel ?? '자세히 보기'}
          <ArrowRight size={9} />
        </button>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────
// AI 심화 설명 섹션
// ─────────────────────────────────────────────

function AiExplainSection({ sourcePath }: { sourcePath: string }): JSX.Element {
  const [loading, setLoading] = useState(false)
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const hasApi = Boolean(
    (window as unknown as { api?: { harness?: { explain?: unknown } } }).api?.harness?.explain
  )

  const handleExplain = useCallback(async () => {
    if (markdown) {
      setExpanded((v) => !v)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const api = (
        window as unknown as {
          api?: {
            harness?: {
              explain?: (arg: { path: string; topic: string }) => Promise<{ markdown: string }>
            }
          }
        }
      ).api
      const result = await api?.harness?.explain?.({
        path: sourcePath,
        topic:
          '이 하네스 번들이 무엇이고, 태스크를 주면 어떤 단계로 흘러가는지 처음 보는 팀원에게 쉽게 설명'
      })
      if (result?.markdown) {
        setMarkdown(result.markdown)
        setExpanded(true)
      } else {
        setError('AI 설명을 받지 못했습니다.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [markdown, sourcePath])

  if (!hasApi) return <></>

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={14} className="text-[color:var(--clauday-blue)]" />
        <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
          AI 심화 설명
        </h2>
      </div>

      {!markdown && !error && (
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Sparkles size={12} />}
          onClick={() => void handleExplain()}
          disabled={loading}
          className="w-fit"
        >
          {loading ? 'AI 설명 생성 중...' : '이 하네스 AI로 설명 듣기'}
        </Button>
      )}

      {error && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-[color:var(--c-red-fg)]">{error}</span>
          <Button variant="ghost" size="xs" onClick={() => void handleExplain()}>재시도</Button>
        </div>
      )}

      {markdown && (
        <div className="flex flex-col gap-1">
          <button
            className="flex items-center gap-1 text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)] transition-colors w-fit"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <span className="text-xs">{expanded ? '접기' : '펼치기'}</span>
          </button>
          {expanded && (
            <div className="text-xs text-[color:var(--text-secondary)] leading-relaxed whitespace-pre-wrap bg-[color:var(--bg-primary)] rounded-md p-3 border border-[color:var(--bg-border)] max-h-80 overflow-y-auto">
              {markdown}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────
// OverviewPanel 본체
// ─────────────────────────────────────────────

/**
 * 하네스 개요 패널.
 *
 * AI 호출 없이 즉시 렌더되는 결정론 요약 + AI 심화 설명 버튼.
 */
export function OverviewPanel({ model, sourcePath, onNavigate }: OverviewPanelProps): JSX.Element {
  const { lines: flowLines, hasLevels } = buildLevelFlowParagraph(model)
  const triageSummary = buildTriageSummary(model.triage)

  const totalScore = model.score?.total
  const gateCount = model.controlFlow.gates.length

  return (
    <div className="flex flex-col gap-5 p-4">

      {/* 섹션 1 — 헤더 */}
      <section className="flex flex-col gap-2 p-4 rounded-lg border border-[color:var(--bg-border)] bg-[color:var(--bg-surface)]">
        <div className="flex items-start gap-2.5 flex-wrap">
          <Workflow size={20} className="text-[color:var(--clauday-blue)] flex-none mt-0.5" />
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-[color:var(--text-primary)] break-words">
              {model.meta.name}
            </h1>
            {model.meta.tagline && (
              <p className="text-sm text-[color:var(--text-secondary)] mt-0.5 leading-relaxed">
                {model.meta.tagline}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 flex-none">
            <span className="ds-chip neutral sq">{model.meta.kind}</span>
            {model.meta.version && (
              <span className="ds-chip neutral sq">v{model.meta.version}</span>
            )}
          </div>
        </div>
        {model.meta.author && (
          <p className="text-xs text-[color:var(--text-tertiary)]">
            저자: {model.meta.author}
          </p>
        )}
      </section>

      {/* 섹션 2 — 한눈에 카드 묶음 */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Info size={14} className="text-[color:var(--c-blue-fg)]" />
          <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
            한눈에
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <QuickStatCard
            label="에이전트"
            count={model.agents.length}
            icon={<Users size={12} />}
            onNavigate={onNavigate ? () => onNavigate('skills') : undefined}
            navigateLabel="스킬·블록 보기"
          />
          <QuickStatCard
            label="레벨"
            count={model.levels.length}
            icon={<GitBranch size={12} />}
            onNavigate={onNavigate ? () => onNavigate('flow') : undefined}
            navigateLabel="흐름 보기"
          />
          <QuickStatCard
            label="게이트"
            count={gateCount}
            icon={<ShieldCheck size={12} />}
            onNavigate={onNavigate ? () => onNavigate('gates') : undefined}
            navigateLabel="게이트 보기"
          />
          <QuickStatCard
            label="산출물"
            count={model.artifacts.length}
            icon={<Package size={12} />}
            onNavigate={onNavigate ? () => onNavigate('artifacts') : undefined}
            navigateLabel="산출물 보기"
          />
          {totalScore !== undefined && (
            <QuickStatCard
              label="종합 점수"
              count={totalScore}
              icon={<BarChart2 size={12} />}
              onNavigate={onNavigate ? () => onNavigate('score') : undefined}
              navigateLabel="점수 보기"
            />
          )}
        </div>
      </section>

      {/* 섹션 3 — 태스크를 주면 이렇게 흐릅니다 */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <ArrowRight size={14} className="text-[color:var(--c-emerald-fg)]" />
          <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
            태스크를 주면 이렇게 흐릅니다
          </h2>
        </div>

        {/* Triage 한 줄 */}
        <p className="text-sm text-[color:var(--text-secondary)] mb-3 leading-relaxed">
          먼저 트리아지가 태스크 복잡도를 판정합니다. {triageSummary}
        </p>

        {hasLevels ? (
          <div className="flex flex-col gap-2">
            {flowLines.map((line, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-lg border border-[color:var(--bg-border)] bg-[color:var(--bg-surface)]"
              >
                <span className="flex-none w-6 h-6 rounded-full bg-[color:var(--bg-primary)] border border-[color:var(--bg-border)] text-xs font-semibold text-[color:var(--text-secondary)] flex items-center justify-center">
                  {i + 1}
                </span>
                <p className="text-sm text-[color:var(--text-primary)] leading-relaxed flex-1 min-w-0">
                  {line}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-[color:var(--bg-border)] bg-[color:var(--c-yellow-bg)]">
            <AlertTriangle size={13} className="text-[color:var(--c-yellow-fg)] flex-none" />
            <p className="text-sm text-[color:var(--c-yellow-fg)]">
              레벨 정보가 추출되지 않았습니다. 하네스를 재정규화하거나 번들 구조를 확인하세요.
            </p>
          </div>
        )}

        {onNavigate && (
          <button
            className="mt-2 text-xs text-[color:var(--clauday-blue)] hover:underline flex items-center gap-0.5"
            onClick={() => onNavigate('flow')}
          >
            흐름 캔버스에서 그래프로 보기 <ArrowRight size={9} />
          </button>
        )}
      </section>

      {/* 섹션 4 — 추출 못한 것 (Warnings) */}
      {model.warnings.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-[color:var(--c-yellow-fg)]" />
            <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
              이 하네스에서 추출 못한 것
            </h2>
            <Chip tone="yellow" square>{model.warnings.length}개</Chip>
          </div>
          <div className="flex flex-col gap-1.5">
            {model.warnings.map((w, i) => (
              <div
                key={i}
                className="flex items-start gap-2 px-3 py-2 rounded-md bg-[color:var(--c-yellow-bg)] text-xs text-[color:var(--c-yellow-fg)]"
              >
                <AlertTriangle size={11} className="flex-none mt-0.5" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 섹션 5 — AI 심화 설명 */}
      <AiExplainSection sourcePath={sourcePath} />

    </div>
  )
}

export default OverviewPanel
