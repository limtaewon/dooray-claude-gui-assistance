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
  Info,
  FolderOpen,
  X,
  CheckCircle2,
  AlertTriangle
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
  parseDoorayTaskUrl,
  hasMeaningfulResult,
  formatProjectPath
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
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [pickingDir, setPickingDir] = useState(false)
  // 두레이 URL 해석 결과 — 불러온 태스크 제목 / 조회 실패 경고
  const [resolvedTask, setResolvedTask] = useState<string | null>(null)
  const [resolveWarn, setResolveWarn] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { progress, start: startProgress, done: doneProgress, isActive } = useAIProgress()

  const canSubmit = taskText.trim().length > 0 && !isActive && !pickingDir

  /** 프로젝트 폴더 선택 다이얼로그를 열어 선택 경로를 state 에 저장한다. */
  const handlePickDir = useCallback(async () => {
    setPickingDir(true)
    try {
      const picked = await window.api.harness.pickProjectDir()
      if (picked) setProjectPath(picked)
    } finally {
      setPickingDir(false)
    }
  }, [])

  /** 선택된 프로젝트 경로를 지운다. */
  const handleClearProjectPath = useCallback(() => {
    setProjectPath(null)
  }, [])

  const handleSubmit = useCallback(async () => {
    const trimmed = taskText.trim()
    if (!trimmed) return

    setPanelState('loading')
    setErrorMsg(null)
    setResult(null)

    const requestId = startProgress()

    try {
      // 두레이 태스크 URL 이면 본문을 먼저 가져와 추정 입력으로 쓴다(AI 는 URL 을 못 가져옴).
      let estimateText = trimmed
      const dooray = parseDoorayTaskUrl(trimmed)
      if (dooray) {
        try {
          const detail = await window.api.dooray.tasks.detail(dooray.projectId, dooray.taskId)
          const body = detail.body?.content
            ? detail.body.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            : ''
          const subject = detail.subject ?? ''
          if (subject || body) {
            estimateText = `${subject}\n\n${body}`.trim()
            setResolvedTask(subject || '(제목 없음)')
          }
        } catch {
          // 조회 실패 — URL 텍스트 그대로 진행하되 사용자에게 고지
          setResolvedTask(null)
          setResolveWarn('두레이 태스크를 불러오지 못해 URL 텍스트만으로 추정합니다. (두레이 연동/권한 확인)')
        }
      } else {
        setResolvedTask(null)
        setResolveWarn(null)
      }

      const res = await window.api.harness.dryrun({
        path: model.meta.source,
        taskText: estimateText,
        requestId,
        ...(projectPath ? { projectPath } : {})
      })
      doneProgress()
      setResult(res)
      setPanelState('result')
    } catch (e) {
      doneProgress()
      setErrorMsg(e instanceof Error ? e.message : String(e))
      setPanelState('error')
    }
  }, [taskText, model.meta.source, startProgress, doneProgress, projectPath])

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
        projectPath={projectPath}
        pickingDir={pickingDir}
        onPickDir={() => void handlePickDir()}
        onClearProjectPath={handleClearProjectPath}
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
                {progress.message || (projectPath ? '프로젝트 분석 + 레벨 추정 중...' : 'AI(Haiku) 가 레벨을 추정하는 중...')}
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
      projectPath={projectPath}
      onReset={handleReset}
      onGoToFlow={handleGoToFlow}
      hasFlowCallback={Boolean(onHighlight && onGoToFlow)}
      resolvedTask={resolvedTask}
      resolveWarn={resolveWarn}
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
  /** 선택된 프로젝트 루트 경로. null 이면 미선택 상태. */
  projectPath: string | null
  /** 폴더 선택 다이얼로그 호출 중 여부 */
  pickingDir: boolean
  /** 프로젝트 폴더 선택 버튼 핸들러 */
  onPickDir: () => void
  /** 선택된 프로젝트 경로 지우기 핸들러 */
  onClearProjectPath: () => void
}

function InputForm({
  taskText,
  setTaskText,
  canSubmit,
  onSubmit,
  onKeyDown,
  textareaRef,
  bundleName,
  projectPath,
  pickingDir,
  onPickDir,
  onClearProjectPath
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

        {/* 프로젝트 폴더 선택 영역 */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
            프로젝트 폴더 (선택)
          </label>

          {projectPath ? (
            /* 경로 선택됨 */
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[color:var(--bg-border)] bg-[color:var(--bg-surface)]">
              <CheckCircle2 size={13} className="flex-none text-[color:var(--c-emerald-fg)]" />
              <span
                className="flex-1 text-xs text-[color:var(--text-primary)] font-mono truncate"
                title={projectPath}
              >
                {formatProjectPath(projectPath)}
              </span>
              <button
                type="button"
                onClick={onClearProjectPath}
                className="flex-none p-0.5 rounded text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)] transition-colors"
                title="선택 취소"
                aria-label="프로젝트 폴더 선택 취소"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            /* 미선택 상태 */
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<FolderOpen size={13} />}
                onClick={onPickDir}
                disabled={pickingDir}
              >
                {pickingDir ? '선택 중...' : '프로젝트 폴더 선택'}
              </Button>
              <p className="text-xs text-[color:var(--text-tertiary)] leading-relaxed">
                선택 안 하면 태스크 텍스트만으로 추정합니다(근사)
              </p>
            </div>
          )}
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
  /** 추정에 사용된 프로젝트 경로. null 이면 태스크 텍스트만으로 추정한 결과. */
  projectPath: string | null
  onReset: () => void
  onGoToFlow: () => void
  hasFlowCallback: boolean
  /** 두레이 URL 에서 불러온 태스크 제목. null 이면 미해당. */
  resolvedTask: string | null
  /** 두레이 조회 실패 경고. */
  resolveWarn: string | null
}

function ResultView({ result, taskText, projectPath, onReset, onGoToFlow, hasFlowCallback, resolvedTask, resolveWarn }: ResultViewProps): JSX.Element {
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

        {/* 두레이 태스크 해석 결과 */}
        {resolvedTask && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[color:var(--c-blue-bg)] border border-[color:var(--bg-border)]">
            <CheckCircle2 size={13} className="flex-none text-[color:var(--c-blue-fg)]" />
            <span className="text-xs text-[color:var(--c-blue-fg)] font-medium flex-none">두레이 태스크 불러옴</span>
            <span className="text-xs text-[color:var(--text-secondary)] truncate" title={resolvedTask}>
              {resolvedTask}
            </span>
          </div>
        )}
        {resolveWarn && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[color:var(--c-yellow-bg)] border border-[color:var(--bg-border)]">
            <AlertTriangle size={13} className="flex-none text-[color:var(--c-yellow-fg)] mt-0.5" />
            <span className="text-xs text-[color:var(--text-secondary)]">{resolveWarn}</span>
          </div>
        )}

        {/* 추정 맥락 배지 */}
        {projectPath ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[color:var(--c-emerald-bg)] border border-[color:var(--bg-border)]">
            <CheckCircle2 size={13} className="flex-none text-[color:var(--c-emerald-fg)]" />
            <span className="text-xs text-[color:var(--c-emerald-fg)] font-medium">
              프로젝트 맥락 기반 추정
            </span>
            <span
              className="text-xs text-[color:var(--text-secondary)] font-mono truncate"
              title={projectPath}
            >
              ({formatProjectPath(projectPath)})
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[color:var(--bg-surface)] border border-[color:var(--bg-border)]">
            <AlertCircle size={13} className="flex-none text-[color:var(--c-yellow-fg)]" />
            <p className="text-xs text-[color:var(--text-secondary)]">
              태스크 텍스트만으로 추정한 근사치 — 실제 실행 시 코드베이스 기준으로 재판정될 수 있습니다
            </p>
          </div>
        )}

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
            <span className="flex-none w-5 h-5 rounded-full bg-[color:var(--bg-primary)] border border-[color:var(--bg-border)] text-xs font-semibold text-[color:var(--text-secondary)] flex items-center justify-center">
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
                    <span className="text-xs text-[color:var(--text-tertiary)]">∥</span>
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
      <p className="text-xs text-[color:var(--text-tertiary)] mt-0.5">
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
        <span className="text-xs font-medium">{label}</span>
      </div>
      <span className="text-sm font-semibold text-[color:var(--text-primary)]">{value}</span>
    </div>
  )
}
