import { useState, useEffect, useCallback } from 'react'
import { Workflow, Plus, History, Clock, RotateCcw } from 'lucide-react'
import type { HarnessModel, CachedHarnessEntry } from '@shared/types/harness'
import Button from '@/components/common/ds/Button'
import Chip from '@/components/common/ds/Chip'
import SegTabs from '@/components/common/ds/SegTabs'
import type { SegTabItem } from '@/components/common/ds/SegTabs'
import { EmptyView, LoadingView, ErrorView } from '@/components/common/ds/StateViews'
import { ImportWizard } from './import/ImportWizard'
import type { ConfirmStepPersonalization } from './import/ConfirmStep'
import { FlowCanvas } from './flow/FlowCanvas'
import { SkillsBlocksPanel } from './views/SkillsBlocksPanel'
import { GatesPanel } from './views/GatesPanel'
import { ArtifactsPanel } from './views/ArtifactsPanel'
import { ScorePanel } from './views/ScorePanel'
import { DryRunPanel } from './views/DryRunPanel'

interface HarnessStudioViewProps {
  active?: boolean
}

/** Harness Studio 6뷰 탭 식별자 */
type StudioTab = 'flow' | 'dryrun' | 'skills' | 'gates' | 'artifacts' | 'score'

const STUDIO_TABS: SegTabItem<StudioTab>[] = [
  { key: 'flow',      label: 'Flow Canvas' },
  { key: 'dryrun',    label: 'Dry-run' },
  { key: 'skills',    label: 'Skills/Blocks' },
  { key: 'gates',     label: 'Gates' },
  { key: 'artifacts', label: 'Artifacts' },
  { key: 'score',     label: 'Score' }
]

/** M5/M6 에서 각 탭 컴포넌트가 채울 곳 */
const TAB_PLACEHOLDER_LABELS: Record<StudioTab, string> = {
  flow:      'Flow Canvas (M5 — @xyflow/react 그래프)',
  dryrun:    'Dry-run 미리보기 (후속)',
  skills:    'Skills & Blocks 해부 (M6)',
  gates:     'Gates & 강제 (M6)',
  artifacts: '산출물 트리 (M6)',
  score:     '6축 레이더 점수 (M6)'
}

/**
 * Harness Studio 진입점 뷰.
 *
 * 상태 세 가지:
 * 1. model 없음 + wizard 닫힘: 최근 목록(listCached) + Import 버튼
 * 2. wizard 열림: ImportWizard 4-step
 * 3. model 있음: 6뷰 SegTabs 셸 (Flow/DryRun/Skills/Gates/Artifacts/Score)
 *    — M5/M6 에서 각 탭 본체를 채운다. 현재는 빈 placeholder.
 */
export default function HarnessStudioView({ active: _active = true }: HarnessStudioViewProps): JSX.Element {
  const [model, setModel] = useState<HarnessModel | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<StudioTab>('flow')
  // Dry-run 결과 경로 — Flow 탭의 highlightPath 로 전달된다(M7).
  const [dryRunHighlight, setDryRunHighlight] = useState<string[] | undefined>(undefined)
  const [cachedList, setCachedList] = useState<CachedHarnessEntry[] | null>(null)
  const [cachedLoading, setCachedLoading] = useState(false)
  const [cachedError, setCachedError] = useState<string | null>(null)

  // 최근 목록 로드
  const loadCached = useCallback(async () => {
    setCachedLoading(true)
    setCachedError(null)
    try {
      const list = await window.api.harness.listCached()
      setCachedList(list)
    } catch (e) {
      setCachedError(e instanceof Error ? e.message : String(e))
    } finally {
      setCachedLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!model && !wizardOpen) {
      void loadCached()
    }
  }, [model, wizardOpen, loadCached])

  // 캐시에서 바로 재오픈 (normalize 캐시 hit → 0초)
  const handleCachedOpen = useCallback(async (entry: CachedHarnessEntry) => {
    try {
      const normalized = await window.api.harness.normalize({ path: entry.path })
      setModel(normalized)
    } catch (e) {
      setCachedError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const handleWizardComplete = useCallback((
    result: HarnessModel,
    _personalization: ConfirmStepPersonalization
  ) => {
    setModel(result)
    setWizardOpen(false)
  }, [])

  const handleReset = useCallback(() => {
    setModel(null)
    setActiveTab('flow')
    setDryRunHighlight(undefined)
    void loadCached()
  }, [loadCached])

  // ── 위저드 열림 ──
  if (wizardOpen) {
    return (
      <div className="flex flex-col h-full bg-[color:var(--bg-primary)]">
        <ImportWizard
          onComplete={handleWizardComplete}
          onClose={() => setWizardOpen(false)}
        />
      </div>
    )
  }

  // ── 모델 없음 — 랜딩 ──
  if (!model) {
    return (
      <div className="flex flex-col h-full bg-[color:var(--bg-primary)]">
        {/* 헤더 */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[color:var(--bg-border)] bg-[color:var(--bg-surface)] flex-shrink-0">
          <Workflow size={16} className="text-[color:var(--clauday-blue)]" />
          <h1 className="text-sm font-semibold text-[color:var(--text-primary)]">Harness Studio</h1>
          <span className="ds-chip neutral ml-1">v1.7</span>
          <div className="ml-auto">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus size={12} />}
              onClick={() => setWizardOpen(true)}
            >
              하니스 가져오기
            </Button>
          </div>
        </div>

        {/* 최근 목록 또는 빈 상태 */}
        <div className="flex-1 overflow-y-auto p-4">
          {cachedLoading && <LoadingView label="최근 목록 로드 중..." />}
          {cachedError && (
            <ErrorView
              title="목록 로드 실패"
              body={cachedError}
              onRetry={loadCached}
            />
          )}
          {!cachedLoading && !cachedError && cachedList !== null && (
            cachedList.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <EmptyView
                  icon={Workflow}
                  title="가져온 하니스가 없습니다"
                  body={
                    <span className="text-center">
                      bmad 번들 폴더를 가져오면<br />
                      에이전트 구조·레벨 체인·게이트·산출물을<br />
                      한눈에 시각화합니다.
                    </span>
                  }
                  action={
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<Plus size={12} />}
                      onClick={() => setWizardOpen(true)}
                    >
                      하니스 가져오기
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <History size={13} className="text-[color:var(--text-secondary)]" />
                  <span className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
                    최근 하니스
                  </span>
                </div>
                {cachedList.map((entry) => (
                  <CachedEntryCard
                    key={entry.path}
                    entry={entry}
                    onOpen={() => void handleCachedOpen(entry)}
                  />
                ))}
              </div>
            )
          )}
        </div>
      </div>
    )
  }

  // ── 모델 있음 — 6뷰 셸 ──
  return (
    <div className="flex flex-col h-full bg-[color:var(--bg-primary)]">
      {/* 헤더 */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[color:var(--bg-border)] bg-[color:var(--bg-surface)] flex-shrink-0">
        <Workflow size={16} className="text-[color:var(--clauday-blue)]" />
        <h1 className="text-sm font-semibold text-[color:var(--text-primary)]">
          {model.meta.name}
        </h1>
        {model.meta.version && (
          <span className="ds-chip neutral">v{model.meta.version}</span>
        )}
        <Chip tone="blue" square>{model.agents.length}에이전트</Chip>
        {model.warnings.length > 0 && (
          <Chip tone="yellow" square>{model.warnings.length}개 경고</Chip>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="xs"
            leftIcon={<RotateCcw size={11} />}
            onClick={handleReset}
            title="다른 하니스 가져오기"
          >
            변경
          </Button>
          <Button
            variant="secondary"
            size="xs"
            leftIcon={<Plus size={11} />}
            onClick={() => setWizardOpen(true)}
          >
            새로 가져오기
          </Button>
        </div>
      </div>

      {/* 탭 바 */}
      <div className="flex items-center px-4 py-2 border-b border-[color:var(--bg-border)] bg-[color:var(--bg-surface)] flex-shrink-0">
        <SegTabs
          items={STUDIO_TABS}
          value={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {/* 탭 본체 */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <TabContent
          tab={activeTab}
          model={model}
          highlightPath={dryRunHighlight}
          onHighlight={setDryRunHighlight}
          onGoToFlow={() => setActiveTab('flow')}
        />
      </div>
    </div>
  )
}

/**
 * 활성 탭에 해당하는 뷰 본체를 렌더한다.
 *
 * - flow: @xyflow/react 그래프(자체 높이 채움) — 스크롤 컨테이너로 감싸지 않는다.
 * - skills/gates/artifacts/score: 정적 패널(자체 스크롤).
 * - dryrun: M7 미구현 — placeholder.
 */
function TabContent({
  tab,
  model,
  highlightPath,
  onHighlight,
  onGoToFlow
}: {
  tab: StudioTab
  model: HarnessModel
  highlightPath?: string[]
  onHighlight?: (path: string[]) => void
  onGoToFlow?: () => void
}): JSX.Element {
  switch (tab) {
    case 'flow':
      return (
        <div className="w-full h-full">
          <FlowCanvas model={model} highlightPath={highlightPath} />
        </div>
      )
    case 'dryrun':
      return (
        <div className="w-full h-full overflow-y-auto">
          <DryRunPanel model={model} onHighlight={onHighlight} onGoToFlow={onGoToFlow} />
        </div>
      )
    case 'skills':
      return <div className="w-full h-full overflow-y-auto"><SkillsBlocksPanel model={model} /></div>
    case 'gates':
      return <div className="w-full h-full overflow-y-auto"><GatesPanel model={model} /></div>
    case 'artifacts':
      return <div className="w-full h-full overflow-y-auto"><ArtifactsPanel model={model} /></div>
    case 'score':
      return <div className="w-full h-full overflow-y-auto"><ScorePanel model={model} /></div>
    default:
      return (
        <div className="w-full h-full flex items-center justify-center">
          <TabPlaceholder tab={tab} model={model} />
        </div>
      )
  }
}

/** 캐시된 하니스 항목 카드 */
function CachedEntryCard({
  entry,
  onOpen
}: {
  entry: CachedHarnessEntry
  onOpen: () => void
}): JSX.Element {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border border-[color:var(--bg-border)] bg-[color:var(--bg-surface)] hover:bg-[color:var(--bg-surface-hover)] cursor-pointer transition-colors"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen() }}
      aria-label={`${entry.name} 열기`}
    >
      <Workflow size={16} className="flex-none text-[color:var(--text-secondary)]" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[color:var(--text-primary)] truncate">{entry.name}</p>
        <p className="text-xs text-[color:var(--text-tertiary)] truncate">{entry.path}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-none">
        <Clock size={10} className="text-[color:var(--text-tertiary)]" />
        <span className="text-xs text-[color:var(--text-tertiary)]">
          {formatRelativeTime(entry.cachedAt)}
        </span>
      </div>
      <Button variant="secondary" size="xs">열기</Button>
    </div>
  )
}

/** M5/M6 에서 채울 탭 본체 placeholder */
function TabPlaceholder({ tab, model }: { tab: StudioTab; model: HarnessModel }): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 text-center px-6">
      <Workflow size={24} className="text-[color:var(--text-tertiary)]" />
      <div>
        <p className="text-sm font-semibold text-[color:var(--text-secondary)]">
          {TAB_PLACEHOLDER_LABELS[tab]}
        </p>
        <p className="text-xs text-[color:var(--text-tertiary)] mt-0.5">
          현재 모델: <span className="font-mono">{model.meta.name}</span> ·
          에이전트 {model.agents.length}개 ·
          레벨 {model.levels.length}개
        </p>
      </div>
      <Chip tone="neutral" square>후속 마일스톤</Chip>
    </div>
  )
}

/** cachedAt ISO 문자열을 상대 시간으로 변환하는 순수 함수 */
function formatRelativeTime(isoString: string): string {
  try {
    const parsed = new Date(isoString)
    if (isNaN(parsed.getTime())) return ''
    const diffMs = Date.now() - parsed.getTime()
    const diffMin = Math.floor(diffMs / 60_000)
    if (diffMin < 1) return '방금'
    if (diffMin < 60) return `${diffMin}분 전`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `${diffH}시간 전`
    const diffD = Math.floor(diffH / 24)
    return `${diffD}일 전`
  } catch {
    return ''
  }
}

export { formatRelativeTime }
