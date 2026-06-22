import { useState, useEffect, useCallback } from 'react'
import { Workflow, Plus, History, Clock, Download, Stethoscope, GitCompare, Search, Package, ArrowLeft, RefreshCw, Cpu } from 'lucide-react'
import { useAIProgress, formatElapsed } from '@/hooks/useAIProgress'
import type { LucideIcon } from 'lucide-react'
import type { HarnessModel, CachedHarnessEntry, DiscoveredHarness } from '@shared/types/harness'
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
import { DoctorPanel } from './views/DoctorPanel'
import { CompareView } from './views/CompareView'
import { downloadHtmlReport } from './export/exportHtml'

interface HarnessStudioViewProps {
  active?: boolean
}

/** Harness Studio 탭 식별자 (M8: doctor, compare 추가) */
type StudioTab = 'flow' | 'dryrun' | 'skills' | 'gates' | 'artifacts' | 'score' | 'doctor' | 'compare'

const STUDIO_TABS: SegTabItem<StudioTab>[] = [
  { key: 'flow',      label: 'Flow Canvas' },
  { key: 'dryrun',    label: 'Dry-run' },
  { key: 'skills',    label: 'Skills/Blocks' },
  { key: 'gates',     label: 'Gates' },
  { key: 'artifacts', label: 'Artifacts' },
  { key: 'score',     label: 'Score' },
  { key: 'doctor',    label: 'Doctor' },
  { key: 'compare',   label: 'Compare' }
]

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
  // 개인화: 오버레이 반영 여부 — ConfirmStep 에서 선택한 값을 보존한다.
  // 용어 번역(termTranslation)은 현재 미구현 — 상태만 보유, 후속 P3 에서 활성화 예정.
  const [overlayEnabled, setOverlayEnabled] = useState(false)
  const [cachedList, setCachedList] = useState<CachedHarnessEntry[] | null>(null)
  const [cachedLoading, setCachedLoading] = useState(false)
  const [cachedError, setCachedError] = useState<string | null>(null)
  // 자동 발견: 첫 진입 시 ~/.claude/skills 를 버튼 없이 자동 스캔한 결과.
  const [discovered, setDiscovered] = useState<DiscoveredHarness[] | null>(null)
  // 정규화(AI) 진행 중인 경로 — 발견/캐시 항목을 열 때 로딩 오버레이 표시용.
  const [opening, setOpening] = useState<string | null>(null)
  // 강제 재정규화 진행/에러 — 진행 중에는 탭 전체를 막는 풀스크린 뷰로 표시.
  const [renormalizing, setRenormalizing] = useState(false)
  const [renormError, setRenormError] = useState<string | null>(null)
  const { progress: renormProgress, start: startRenormProgress, done: doneRenormProgress } = useAIProgress()

  // 랜딩 진입 시 최근 캐시 + 자동 발견을 함께 로드한다(발견은 버튼 없이 자동).
  const loadLanding = useCallback(async () => {
    setCachedLoading(true)
    setCachedError(null)
    try {
      const api = window.api?.harness
      // api 미주입(테스트/초기화 전) 시 빈 상태로 안전 강등 — 동기 TypeError 방지.
      if (!api) {
        setCachedList([])
        setDiscovered([])
        return
      }
      // 캐시와 발견을 병렬 로드. 발견 실패는 치명적이지 않으므로 빈 배열로 강등.
      const [cachedRes, discoveredRes] = await Promise.allSettled([
        api.listCached(),
        api.discover()
      ])
      if (cachedRes.status === 'fulfilled') {
        setCachedList(cachedRes.value)
      } else {
        setCachedError(cachedRes.reason instanceof Error ? cachedRes.reason.message : String(cachedRes.reason))
        setCachedList([])
      }
      setDiscovered(discoveredRes.status === 'fulfilled' ? discoveredRes.value : [])
    } catch (e) {
      setCachedError(e instanceof Error ? e.message : String(e))
      setCachedList([])
      setDiscovered([])
    } finally {
      setCachedLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!model && !wizardOpen) {
      void loadLanding()
    }
  }, [model, wizardOpen, loadLanding])

  // 경로를 정규화해 모델을 연다(캐시 hit 이면 즉시, miss 면 AI 정규화).
  const openPath = useCallback(async (path: string) => {
    setOpening(path)
    setCachedError(null)
    try {
      const normalized = await window.api.harness.normalize({ path })
      setModel(normalized)
    } catch (e) {
      setCachedError(e instanceof Error ? e.message : String(e))
    } finally {
      setOpening(null)
    }
  }, [])

  const handleWizardComplete = useCallback((
    result: HarnessModel,
    personalization: ConfirmStepPersonalization
  ) => {
    setModel(result)
    setOverlayEnabled(personalization.applyOverlay)
    // termTranslation 은 현재 미구현 — 상태만 보유, 후속 P3 에서 활성화 예정.
    setWizardOpen(false)
  }, [])

  // 강제 재정규화 — AI 모델 변경(예: fable)·번들 외 사정으로 새 정규화가 필요할 때.
  // force=true 로 캐시를 무시하고 현재 모델로 재실행한다.
  const handleRenormalize = useCallback(async () => {
    if (!model) return
    setRenormalizing(true)
    setRenormError(null)
    const requestId = startRenormProgress()
    try {
      const fresh = await window.api.harness.normalize({ path: model.meta.source, force: true, requestId })
      setModel(fresh)
    } catch (e) {
      setRenormError(e instanceof Error ? e.message : String(e))
    } finally {
      doneRenormProgress()
      setRenormalizing(false)
    }
  }, [model, startRenormProgress, doneRenormProgress])

  const handleReset = useCallback(() => {
    setModel(null)
    setActiveTab('flow')
    setDryRunHighlight(undefined)
    setOverlayEnabled(false)
    void loadLanding()
  }, [loadLanding])

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

  // ── 재정규화 중 — 탭 전체를 막는 풀스크린 진행 화면 (Import 정규화 화면과 동일 UX) ──
  if (renormalizing) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 bg-[color:var(--bg-primary)]">
        <Cpu size={32} className="text-[color:var(--c-blue-solid)] animate-pulse" />
        <div className="text-center">
          <p className="text-sm font-semibold text-[color:var(--text-primary)]">AI 재정규화 진행 중</p>
          <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
            {renormProgress.message || '번들 구조를 다시 분석하고 있습니다… (대용량 번들은 수 분 소요)'}
          </p>
        </div>
        {renormProgress.elapsedMs > 0 && (
          <p className="text-xs text-[color:var(--text-tertiary)]">{formatElapsed(renormProgress.elapsedMs)} 경과</p>
        )}
        <div className="w-64 h-1.5 rounded-full bg-[color:var(--bg-border)] overflow-hidden">
          <div className="h-full bg-[color:var(--c-blue-solid)] animate-[progress-indeterminate_1.5s_ease-in-out_infinite] rounded-full" />
        </div>
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
              하네스 가져오기
            </Button>
          </div>
        </div>

        {/* 최근 목록 + 자동 발견 (둘 다 자동 로드) */}
        <div className="flex-1 overflow-y-auto p-4">
          {opening && (
            <LoadingView label={`하네스 정규화 중... (${opening.split('/').pop() ?? ''})`} />
          )}
          {!opening && cachedLoading && <LoadingView label="하네스 탐색 중..." />}
          {!opening && cachedError && (
            <ErrorView title="로드 실패" body={cachedError} onRetry={loadLanding} />
          )}
          {!opening && !cachedLoading && cachedList !== null && discovered !== null && (
            cachedList.length === 0 && discovered.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <EmptyView
                  icon={Workflow}
                  title="하네스를 찾지 못했습니다"
                  body={
                    <span className="text-center">
                      ~/.claude/skills 에서 bmad 번들을 찾지 못했습니다.<br />
                      폴더를 직접 가져오면 에이전트 구조·레벨 체인·게이트·<br />
                      산출물을 한눈에 시각화합니다.
                    </span>
                  }
                  action={
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<Plus size={12} />}
                      onClick={() => setWizardOpen(true)}
                    >
                      하네스 가져오기
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {cachedList.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <SectionLabel icon={History} text="최근 하네스" />
                    {cachedList.map((entry) => (
                      <CachedEntryCard
                        key={entry.path}
                        entry={entry}
                        onOpen={() => void openPath(entry.path)}
                      />
                    ))}
                  </div>
                )}
                {discovered.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <SectionLabel icon={Search} text="발견된 하네스 (~/.claude/skills)" />
                    {discovered.map((h) => (
                      <DiscoveredEntryCard
                        key={h.path}
                        entry={h}
                        onOpen={() => void openPath(h.path)}
                      />
                    ))}
                  </div>
                )}
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
        <Button
          variant="ghost"
          size="xs"
          leftIcon={<ArrowLeft size={13} />}
          onClick={handleReset}
          title="목록으로 돌아가기"
        >
          뒤로
        </Button>
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
            leftIcon={<Stethoscope size={11} />}
            onClick={() => setActiveTab('doctor')}
            title="Doctor 점검"
          >
            Doctor
          </Button>
          <Button
            variant="ghost"
            size="xs"
            leftIcon={<GitCompare size={11} />}
            onClick={() => setActiveTab('compare')}
            title="다른 하네스와 비교"
          >
            Compare
          </Button>
          <Button
            variant="ghost"
            size="xs"
            leftIcon={<Download size={11} />}
            onClick={() => downloadHtmlReport(model)}
            title="HTML 리포트 다운로드"
          >
            Export
          </Button>
          <Button
            variant="ghost"
            size="xs"
            leftIcon={<RefreshCw size={11} />}
            onClick={() => void handleRenormalize()}
            title="현재 AI 모델로 다시 정규화 (모델 변경·번들 갱신 반영)"
          >
            재정규화
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
      {renormError && (
        <div className="px-4 py-1.5 text-xs text-[color:var(--c-red-fg)] bg-[color:var(--c-red-bg)] border-b border-[color:var(--bg-border)] flex-shrink-0">
          재정규화 실패: {renormError}
        </div>
      )}

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
          overlayEnabled={overlayEnabled}
          onHighlight={setDryRunHighlight}
          onGoToFlow={() => setActiveTab('flow')}
          cachedList={cachedList ?? []}
        />
      </div>
    </div>
  )
}

/**
 * 활성 탭에 해당하는 뷰 본체를 렌더한다.
 *
 * - flow: @xyflow/react 그래프(자체 높이 채움) — 스크롤 컨테이너로 감싸지 않는다.
 * - skills/gates/artifacts/score/doctor: 정적 패널(자체 스크롤).
 * - compare: 캐시 목록을 받아 diff 표 표시.
 * - dryrun: 레벨 추정 패널.
 */
function TabContent({
  tab,
  model,
  highlightPath,
  overlayEnabled,
  onHighlight,
  onGoToFlow,
  cachedList
}: {
  tab: StudioTab
  model: HarnessModel
  highlightPath?: string[]
  overlayEnabled?: boolean
  onHighlight?: (path: string[]) => void
  onGoToFlow?: () => void
  cachedList: CachedHarnessEntry[]
}): JSX.Element {
  switch (tab) {
    case 'flow':
      return (
        <div className="w-full h-full">
          <FlowCanvas model={model} highlightPath={highlightPath} overlayEnabled={overlayEnabled} />
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
    case 'doctor':
      return <div className="w-full h-full overflow-y-auto"><DoctorPanel model={model} /></div>
    case 'compare':
      return <div className="w-full h-full overflow-y-auto"><CompareView model={model} cachedList={cachedList} /></div>
    default:
      return (
        <div className="w-full h-full flex items-center justify-center">
          <TabPlaceholder tab={tab} model={model} />
        </div>
      )
  }
}

/** 캐시된 하네스 항목 카드 */
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

/** 랜딩 섹션 라벨 (최근/발견 구분) */
function SectionLabel({ icon: Icon, text }: { icon: LucideIcon; text: string }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <Icon size={13} className="text-[color:var(--text-secondary)]" />
      <span className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
        {text}
      </span>
    </div>
  )
}

/**
 * 자동 발견된 하네스 항목 카드.
 * 클릭 시 해당 경로를 정규화해 연다(첫 정규화는 AI 호출로 시간이 걸릴 수 있음).
 */
function DiscoveredEntryCard({
  entry,
  onOpen
}: {
  entry: DiscoveredHarness
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
      <Package size={16} className="flex-none text-[color:var(--text-secondary)]" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[color:var(--text-primary)] truncate">{entry.name}</p>
        <p className="text-xs text-[color:var(--text-tertiary)] truncate">{entry.path}</p>
      </div>
      <span className="ds-chip neutral flex-none">{entry.kind}</span>
      <Button variant="secondary" size="xs">열기</Button>
    </div>
  )
}

/** 미구현 탭 placeholder */
function TabPlaceholder({ tab: _tab, model }: { tab: StudioTab; model: HarnessModel }): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 text-center px-6">
      <Workflow size={24} className="text-[color:var(--text-tertiary)]" />
      <div>
        <p className="text-sm font-semibold text-[color:var(--text-secondary)]">
          준비 중입니다
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
