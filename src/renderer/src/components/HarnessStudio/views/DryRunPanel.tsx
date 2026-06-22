/**
 * DryRunPanel — 태스크 입력 → 레벨 추정 → 경로 하이라이트 패널 (PRD §7-2).
 *
 * 흐름:
 * 1. 태스크 평문 또는 두레이 URL 입력
 * 2. window.api.harness.dryrun 호출 (useAIProgress 로 진행률 표시)
 * 3. 결과: 추정 레벨, 자연어 근거(Q코드 미노출), 실행 타임라인,
 *    거치는 게이트, 예상 시간/상대비용(상대값 명시)
 * 4. "Flow 에서 경로 보기" → onHighlight + onGoToFlow 콜백
 *
 * 상태 전이: idle → loading → result | error
 */

import { useState, useCallback, useRef } from 'react'
import {
  Play,
  ArrowRight,
  Users,
  GitBranch,
  Clock,
  Zap,
  ShieldCheck,
  AlertCircle,
  RotateCcw,
  Eye,
  Link,
  Info
} from 'lucide-react'
import type { DryRunResult, HarnessModel } from '@shared/types/harness'
import Button from '@/components/common/ds/Button'
import Chip from '@/components/common/ds/Chip'
import { LoadingView, ErrorView } from '@/components/common/ds/StateViews'
import { useAIProgress } from '@/hooks/useAIProgress'
import {
  buildTimeline,
  formatRelativeTime,
  formatRelativeCost,
  formatGates,
  levelTone,
  LEVEL_LABEL,
  isDoorayTaskUrl,
  hasMeaningfulResult
} from './dryRunUtils'
import type { TimelineStep } from './dryRunUtils'

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

export interface DryRunPanelProps {
  /** 정규화된 HarnessModel — 번들 경로 및 레벨 정보 참조 */
  model: HarnessModel
  /**
   * 경로 하이라이트 요청 콜백 — "Flow 에서 경로 보기" 버튼 클릭 시 호출.
   * FlowCanvas 의 highlightPath 상태를 갱신하는 데 사용된다.
   */
  onHighlight?: (path: string[]) => void
  /**
   * Flow 탭으로 전환 요청 콜백 — onHighlight 와 함께 호출된다.
   */
  onGoToFlow?: () => void
}

// ─────────────────────────────────────────────
// 내부 상태 타입
// ─────────────────────────────────────────────

type PanelState = 'idle' | 'loading' | 'result' | 'error'

// ─────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────

/**
 * Dry-run 패널 본체.
 *
 * idle → 입력 폼
 * loading → 진행률 표시
 * result → 결과 카드
 * error → 에러 + 재시도
 */
export function DryRunPanel({ model, onHighlight, onGoToFlow }: DryRunPanelProps): JSX.Element {
  const [taskText, setTaskText] = useState('')
  const [panelState, setPanelState] = useState<PanelState>('idle')
  const [result, setResult] = useState<DryRunResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { progress, start: startProgress, done: doneProgress, isActive } = useAIProgress()

  const canSubmit = taskText.trim().length > 0 && !isActive

  const handleSubmit = useCallback(async () => {
    const trimmed = taskText.trim()
    if (!trimmed) return

    setPanelState('loading')
    setErrorMsg(null)
    setResult(null)

    const requestId = startProgress()

    try {
      const res = await window.api.harness.dryrun({
        path: model.meta.source,
        taskText: trimmed,
        requestId
      })
      doneProgress()
      setResult(res)
      setPanelState('result')
    } catch (e) {
      doneProgress()
      setErrorMsg(e instanceof Error ? e.message : String(e))
      setPanelState('error')
    }
  }, [taskText, model.meta.source, startProgress, doneProgress])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Cmd/Ctrl + Enter 로 실행
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (canSubmit) void handleSubmit()
      }
    },
    [canSubmit, handleSubmit]
  )

  const handleReset = useCallback(() => {
    setPanelState('idle')
    setResult(null)
    setErrorMsg(null)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }, [])

  const handleGoToFlow = useCallback(() => {
    if (!result) return
    onHighlight?.(result.highlightPath)
    onGoToFlow?.()
  }, [result, onHighlight, onGoToFlow])

  // ── idle: 입력 폼 ──
  if (panelState === 'idle') {
    return (
      <InputForm
        taskText={taskText}
        setTaskText={setTaskText}
        canSubmit={canSubmit}
        onSubmit={() => void handleSubmit()}
        onKeyDown={handleKeyDown}
        textareaRef={textareaRef}
        bundleName={model.meta.name}
      />
    )
  }

  // ── loading: 진행률 ──
  if (panelState === 'loading') {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6">
        <LoadingView
          label={
            <div className="flex flex-col items-center gap-2 mt-2">
              <span className="text-sm text-[color:var(--text-secondary)]">
                {progress.message || 'AI(Haiku) 가 레벨을 추정하는 중...'}
              </span>
              {progress.elapsedMs > 0 && (
                <span className="text-xs text-[color:var(--text-tertiary)]">
                  {Math.round(progress.elapsedMs / 1000)}초 경과
                </span>
              )}
              <div className="mt-1 text-xs text-[color:var(--text-tertiary)] max-w-xs text-center line-clamp-2">
                {taskText.length > 80 ? `${taskText.slice(0, 80)}…` : taskText}
              </div>
            </div>
          }
        />
      </div>
    )
  }

  // ── error ──
  if (panelState === 'error') {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6">
        <ErrorView
          title="레벨 추정 실패"
          body={errorMsg ?? undefined}
          onRetry={handleReset}
        />
      </div>
    )
  }

  // ── result ──
  return (
    <ResultView
      result={result!}
      taskText={taskText}
      onReset={handleReset}
      onGoToFlow={handleGoToFlow}
      hasFlowCallback={Boolean(onHighlight && onGoToFlow)}
    />
  )
}

// ─────────────────────────────────────────────
// InputForm
// ─────────────────────────────────────────────

interface InputFormProps {
  taskText: string
  setTaskText: (v: string) => void
  canSubmit: boolean
  onSubmit: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  textareaRef: React.RefObject<HTMLTextAreaElement>
  bundleName: string
}

function InputForm({
  taskText,
  setTaskText,
  canSubmit,
  onSubmit,
  onKeyDown,
  textareaRef,
  bundleName
}: InputFormProps): JSX.Element {
  const isDooray = isDoorayTaskUrl(taskText)

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex-1 flex flex-col gap-4 p-5 max-w-2xl mx-auto w-full">
        {/* 헤더 설명 */}
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[color:var(--bg-surface)] border border-[color:var(--bg-border)]">
          <Info size={14} className="flex-none mt-0.5 text-[color:var(--clauday-blue)]" />
          <div>
            <p className="text-xs font-medium text-[color:var(--text-primary)]">
              Dry-run — {bundleName}
            </p>
            <p className="text-xs text-[color:var(--text-secondary)] mt-0.5 leading-relaxed">
              태스크를 입력하면 AI(Haiku)가 레벨(L0~L3)을 추정하고,
              예상 에이전트 경로·게이트·소요 시간을 미리 볼 수 있습니다.
            </p>
          </div>
        </div>

        {/* 입력 영역 */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
            태스크 설명
          </label>
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                '태스크 내용을 자유롭게 입력하세요.\n예) "결제 API에 PG 연동 추가 — 보안 검토 필요"\n\n두레이 태스크 URL 도 가능합니다.'
              }
              rows={6}
              className="w-full resize-none rounded-lg border border-[color:var(--bg-border)] bg-[color:var(--bg-primary)] text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-tertiary)] px-3 py-2.5 focus:outline-none focus:border-[color:var(--clauday-blue)] transition-colors"
            />
            {isDooray && (
              <div className="absolute bottom-2.5 right-2.5">
                <Chip tone="blue" square>
                  <Link size={10} className="mr-1" />
                  두레이 URL
                </Chip>
              </div>
            )}
          </div>
          <p className="text-xs text-[color:var(--text-tertiary)]">
            Cmd/Ctrl+Enter 로 실행
          </p>
        </div>

        {/* 실행 버튼 */}
        <div className="flex items-center justify-end">
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Play size={12} />}
            onClick={onSubmit}
            disabled={!canSubmit}
          >
            레벨 추정 실행
          </Button>
        </div>

        {/* 안내 */}
        <div className="flex flex-col gap-1.5 text-xs text-[color:var(--text-tertiary)] border-t border-[color:var(--bg-border)] pt-3 mt-1">
          <p className="font-medium text-[color:var(--text-secondary)]">추정 결과에 포함되는 정보</p>
          <ul className="flex flex-col gap-0.5 list-none pl-0">
            {[
              '실행 레벨 (L0 ~ L3)',
              '자연어 근거 (Q 코드 미노출)',
              '에이전트 실행 타임라인',
              '거쳐야 하는 게이트',
              '예상 소요 시간 / 비용 (L0 대비 상대값)'
            ].map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-[color:var(--text-tertiary)] flex-none" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// ResultView
// ─────────────────────────────────────────────

interface ResultViewProps {
  result: DryRunResult
  taskText: string
  onReset: () => void
  onGoToFlow: () => void
  hasFlowCallback: boolean
}

function ResultView({ result, taskText, onReset, onGoToFlow, hasFlowCallback }: ResultViewProps): JSX.Element {
  const timeline = buildTimeline(result.highlightPath, result.parallelGroups)
  const meaningful = hasMeaningfulResult(result)

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex flex-col gap-4 p-5 max-w-2xl mx-auto w-full">
        {/* 상단: 입력 태스크 요약 + 재실행 */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-[color:var(--bg-surface)] border border-[color:var(--bg-border)]">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[color:var(--text-tertiary)]">입력한 태스크</p>
            <p className="text-sm text-[color:var(--text-primary)] mt-0.5 line-clamp-2 break-words">
              {taskText}
            </p>
          </div>
          <Button
            variant="ghost"
            size="xs"
            leftIcon={<RotateCcw size={11} />}
            onClick={onReset}
          >
            재입력
          </Button>
        </div>

        {/* 추정 레벨 */}
        <LevelCard result={result} />

        {/* 근거 */}
        <RationaleCard result={result} />

        {/* 타임라인 */}
        {timeline.length > 0 && (
          <TimelineCard timeline={timeline} result={result} />
        )}

        {/* 게이트 */}
        {result.gates.length > 0 && (
          <GatesCard gates={result.gates} />
        )}

        {/* 예상 시간/비용 */}
        <MetricsCard result={result} />

        {/* Flow 에서 경로 보기 */}
        {meaningful && hasFlowCallback && (
          <div className="flex items-center justify-end pt-1 border-t border-[color:var(--bg-border)]">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Eye size={12} />}
              onClick={onGoToFlow}
            >
              Flow 에서 경로 보기
            </Button>
          </div>
        )}

        {!meaningful && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-[color:var(--bg-surface)] border border-[color:var(--bg-border)]">
            <AlertCircle size={13} className="text-[color:var(--c-yellow-fg)] flex-none" />
            <p className="text-xs text-[color:var(--text-secondary)]">
              하이라이트 경로를 계산하지 못했습니다. 번들에 레벨 체인이 부족하거나 triage 정보가 없을 수 있습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 결과 세부 카드
// ─────────────────────────────────────────────

function LevelCard({ result }: { result: DryRunResult }): JSX.Element {
  const tone = levelTone(result.level)
  const label = LEVEL_LABEL[result.level]

  return (
    <div className="flex flex-col gap-2 p-4 rounded-lg border border-[color:var(--bg-border)] bg-[color:var(--bg-surface)]">
      <div className="flex items-center gap-2">
        <GitBranch size={14} className="text-[color:var(--text-secondary)] flex-none" />
        <span className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
          추정 레벨
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <Chip tone={tone}>
          {result.level}
        </Chip>
        <span className="text-sm font-semibold text-[color:var(--text-primary)]">
          {label}
        </span>
      </div>
    </div>
  )
}

function RationaleCard({ result }: { result: DryRunResult }): JSX.Element {
  return (
    <div className="flex flex-col gap-2 p-4 rounded-lg border border-[color:var(--bg-border)] bg-[color:var(--bg-surface)]">
      <div className="flex items-center gap-2">
        <Info size={14} className="text-[color:var(--text-secondary)] flex-none" />
        <span className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
          추정 근거
        </span>
      </div>

      {/* 자연어 근거 (Q코드 미노출) */}
      {result.answers.length > 0 && (
        <ul className="flex flex-col gap-1">
          {result.answers.map((answer, idx) => (
            <li key={idx} className="flex items-start gap-2 text-xs text-[color:var(--text-primary)]">
              <span className="mt-0.5 w-1 h-1 rounded-full bg-[color:var(--clauday-blue)] flex-none" />
              {answer}
            </li>
          ))}
        </ul>
      )}

      {result.rationale && (
        <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed border-t border-[color:var(--bg-border)] pt-2 mt-1">
          {result.rationale}
        </p>
      )}
    </div>
  )
}

function TimelineCard({
  timeline,
  result
}: {
  timeline: TimelineStep[]
  result: DryRunResult
}): JSX.Element {
  return (
    <div className="flex flex-col gap-2 p-4 rounded-lg border border-[color:var(--bg-border)] bg-[color:var(--bg-surface)]">
      <div className="flex items-center gap-2">
        <Users size={14} className="text-[color:var(--text-secondary)] flex-none" />
        <span className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
          실행 타임라인
        </span>
        <Chip tone="neutral" square className="ml-auto">
          {result.highlightPath.length}개 에이전트
        </Chip>
      </div>

      <div className="flex flex-col gap-1.5 mt-1">
        {timeline.map((step, idx) => (
          <div key={step.step} className="flex items-center gap-2">
            {/* 단계 번호 */}
            <span className="flex-none w-5 h-5 rounded-full bg-[color:var(--bg-primary)] border border-[color:var(--bg-border)] text-[10px] font-semibold text-[color:var(--text-secondary)] flex items-center justify-center">
              {step.step}
            </span>

            {/* 에이전트 */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {step.agents.map((agentId, aIdx) => (
                <div key={agentId} className="flex items-center gap-1">
                  <Chip
                    tone={step.parallel ? 'violet' as const : 'neutral'}
                    square
                  >
                    {agentId}
                  </Chip>
                  {step.parallel && aIdx < step.agents.length - 1 && (
                    <span className="text-[10px] text-[color:var(--text-tertiary)]">∥</span>
                  )}
                </div>
              ))}
              {step.parallel && (
                <Chip tone="neutral" square>병렬</Chip>
              )}
            </div>

            {/* 연결선 (마지막 제외) */}
            {idx < timeline.length - 1 && (
              <ArrowRight size={12} className="text-[color:var(--text-tertiary)] flex-none" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function GatesCard({ gates }: { gates: string[] }): JSX.Element {
  return (
    <div className="flex flex-col gap-2 p-4 rounded-lg border border-[color:var(--bg-border)] bg-[color:var(--bg-surface)]">
      <div className="flex items-center gap-2">
        <ShieldCheck size={14} className="text-[color:var(--text-secondary)] flex-none" />
        <span className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
          거쳐야 하는 게이트
        </span>
      </div>
      <p className="text-sm text-[color:var(--text-primary)] font-mono">
        {formatGates(gates)}
      </p>
    </div>
  )
}

function MetricsCard({ result }: { result: DryRunResult }): JSX.Element {
  return (
    <div className="flex flex-col gap-2 p-4 rounded-lg border border-[color:var(--bg-border)] bg-[color:var(--bg-surface)]">
      <div className="flex items-center gap-2">
        <Zap size={14} className="text-[color:var(--text-secondary)] flex-none" />
        <span className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
          예상 소요 (L0 대비 상대값)
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-1">
        <MetricItem
          icon={<Clock size={12} />}
          label="예상 시간"
          value={formatRelativeTime(result.estTimeRel)}
        />
        <MetricItem
          icon={<Zap size={12} />}
          label="예상 비용"
          value={formatRelativeCost(result.estCostRel)}
        />
      </div>
      <p className="text-[10px] text-[color:var(--text-tertiary)] mt-0.5">
        L0 기준값 = 1.0×. 절대 수치가 아닌 상대값으로, 참고용입니다.
      </p>
    </div>
  )
}

function MetricItem({
  icon,
  label,
  value
}: {
  icon: React.ReactNode
  label: string
  value: string
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1 p-2 rounded-md bg-[color:var(--bg-primary)] border border-[color:var(--bg-border)]">
      <div className="flex items-center gap-1.5 text-[color:var(--text-tertiary)]">
        {icon}
        <span className="text-[10px] font-medium">{label}</span>
      </div>
      <span className="text-sm font-semibold text-[color:var(--text-primary)]">{value}</span>
    </div>
  )
}
