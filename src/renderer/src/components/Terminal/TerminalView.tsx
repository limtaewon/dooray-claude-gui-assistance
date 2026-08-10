import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X, Terminal, Trash2, Pencil, FileDiff, FileText, PanelRight, Loader2, Columns2, Rows2 } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import type {
  Announcements,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DraggableAttributes,
  DraggableSyntheticListeners
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import TerminalPane from './TerminalPane'
import type { TerminalPaneHandle } from './TerminalPane'
import SplitLayout from './SplitLayout'
import { createPaneHost } from './reattachPaneHost'
import {
  splitLeaf,
  closeLeaf,
  collectLeafIds,
  setRatioAtPath,
  neighborLeaf,
  isValidTree
} from './splitTree'
import type { SplitPath } from './splitTree'
import { resolveShortcutWithOverrides } from './terminalShortcuts'
import type { PasteToken } from './pasteTargetState'
import { TabPointerSensor, TAB_DRAG_ACTIVATION_DISTANCE_PX } from './tabDragSensor'
import { moveTab, pickNextActiveTab, pushMru } from './tabOrder'
import { resetGlobalWebglFailure, type TerminalRendererSetting } from './webglPolicy'
import { useKeybindingOverrides } from '../../hooks/useKeybindings'
import { useToast } from '../common/ds'
import OpenInEditorButton from '../common/OpenInEditorButton'
import { matchesBinding } from '@shared/keybindings/binding'
import TaskDrawer, { TASK_DRAG_MIME, type TaskDragPayload } from './TaskDrawer'
import SideDrawer, { type DrawerTab } from './SideDrawer'
import SourceControlPanel from '../Git/scm/SourceControlPanel'
import BranchDiffPanel from '../Git/scm/BranchDiffPanel'
import GitHistoryPanel from '../Git/scm/GitHistoryPanel'
import BranchesPanel from '../Git/scm/BranchesPanel'
import DiffView, { diffTabId, type DiffRequest } from '../Git/scm/DiffView'
import FileView from './FileView'
import type { FileTabRequest } from '@shared/types/textFile'
import DrawerRepoEmptyState from '../Git/scm/DrawerRepoEmptyState'
import { useTerminalRepo } from '../Git/scm/useRepoRoot'
import { useScmRepoSelection } from '../Git/scm/useScmRepoSelection'
import RepoPicker from '../Git/scm/RepoPicker'
import { resolveStoredDrawerWidth, DRAWER_DEFAULT_WIDTH } from './drawerWidth'
import { buildTaskDropSteps } from './taskDrop'
import {
  DEFAULT_TASK_DROP_PROMPT,
  renderTaskDropPrompt,
  templateNeedsBody,
  templateNeedsImages
} from '@shared/workspace/taskDropPrompt'
import { workspaceKey } from '@shared/workspace/workspaceKey'
import { resolveProjectConfig } from '@shared/workspace/projectConfig'
import {
  planFromCandidate,
  resolveTaskDropPlan,
  samePath,
  sessionForCwd,
  sessionForRepo,
  type TaskDropCandidate,
  type TaskDropPlan
} from '@shared/workspace/taskDropPlan'
import { buildBranchName } from '@shared/workspace/branchName'
import { isPaneBusy } from '@shared/terminal/foreground'
import RepoChoiceModal from '../Workspace/RepoChoiceModal'
import type {
  RepoRegistryEntry,
  TaskSessionLink,
  WorkspaceSettings as WorkspaceSettingsShape
} from '@shared/types/workspace'

/** 드롭으로 시작할 업무 — 첫 지시 템플릿 치환에 필요한 값까지 함께 받는다. */
interface TaskDropRequest {
  projectId: string
  taskId: string
  subject: string
  number?: number
  projectCode?: string
}
import TerminalEmptyState from './TerminalEmptyState'
import { tabNameFromCwd, tabNameFromTitle } from './tabAutoName'
import type { DoorayTask } from '@shared/types/dooray'
import type {
  TerminalExitPayload,
  TerminalSession,
  SplitDirection,
  SplitNode,
  TerminalPaneSnapshot,
  TerminalWorkspaceSnapshotV2
} from '../../../../shared/types/terminal'

/** v2.0 B-5: 복원 상한 (ADR-v2-terminal-p2-03 §11) — store 부팅 지연 방지. 초과분은 오래된 탭부터 버린다. */
const MAX_RESTORED_TABS = 20
const MAX_RESTORED_LEAVES = 40
/** v2.0 B-5: 구조 변경 저장 debounce (ADR-03 §3-1). */
const SAVE_DEBOUNCE_MS = 1000
/** v2.0 B-5: autosave 주기 (ADR-03 §3-2). */
const AUTOSAVE_INTERVAL_MS = 30000
/** v2.0 B-6: 렌더러 설정 저장 키 — 기존 settings.get/set 재사용, 신규 IPC 0개 (ADR-04 §4). */
const RENDERER_SETTING_KEY = 'terminalRenderer'

/** leaf(pane) 1개의 런타임 바인딩 — 트리에는 안 들어가는 휘발값(v2.0 B-4, ADR-v2-terminal-p2-02 §3). */
/** 새로 만든 탭 — 상태 반영을 기다리지 않고 바로 그 pane 에 입력을 보낼 수 있게 돌려준다. */
interface CreatedTab {
  tabId: string
  leafId: string
  pane: PaneRuntime
}

interface PaneRuntime {
  sessionId: string
  cwd?: string
  /** v2.0 B-1: PTY 종료 정보 — onExit 로 채워지면 이후 덮어쓰지 않는다(at-most-once). */
  exitInfo?: TerminalExitPayload | null
  /** v2.0 B-5 복원 재바인딩에서 증가하는 카운터. B-4 에서는 항상 0(paste 타겟 검증용, ADR-02 §9). */
  generation: number
  /** v2.0 B-5: 마운트 시 이 pane 이 복원해야 할 스냅샷 — 마운트 후엔 소비되고 갱신되지 않는다
   *  (마운트 이후의 진실은 handle.serialize() 다). 레거시 `savedOutput` 문자열 경로를 대체했다. */
  restoreSnapshot?: TerminalPaneSnapshot
}

/**
 * 탭 1개 — split 트리 + 포커스 leaf + leaf 별 런타임(ADR-v2-terminal-p2-02 §3).
 *
 * `kind` 는 판별자다. 값이 없으면 터미널 탭 — 기존 스냅샷을 그대로 읽기 위해 optional 로 둔다.
 * diff/file 탭은 PTY 를 갖지 않으므로 `panes` 가 비어 있고 `tree` 는 자리표시자 leaf 하나뿐이다.
 * pane 을 순회하는 코드는 `tab.panes[leafId]` 가 없으면 건너뛰므로 그대로 안전하다.
 */
interface TabEntry {
  tabId: string
  name: string
  kind?: 'terminal' | 'diff' | 'file'
  /** 사용자가 직접 이름을 바꿨으면 셸 제목으로 덮어쓰지 않는다 (Warp 와 동일) */
  nameIsCustom?: boolean
  tree: SplitNode
  focusedLeafId: string
  panes: Record<string, PaneRuntime>
  /** kind === 'diff' 일 때만 — 무엇을 비교할지 */
  diff?: DiffRequest
  /** kind === 'file' 일 때만 — 어떤 파일을 열지 */
  file?: FileTabRequest
}

/** PTY 가 없는 탭 — 분할·리사이즈·스냅샷 대상이 아니다. */
function isViewerTab(tab: TabEntry): boolean {
  return tab.kind === 'diff' || tab.kind === 'file'
}

function allPanesExited(tab: TabEntry): boolean {
  const panes = Object.values(tab.panes)
  return panes.length > 0 && panes.every((p) => Boolean(p.exitInfo))
}

interface TerminalViewProps {
  /** v2.0 B-4: 터미널 뷰가 현재 활성 뷰일 때만 단축키가 발화한다(ADR-02 §8) — 다른 뷰에서 ⌘W/⌘T 로 PTY 가 죽지 않는다. */
  active?: boolean
}

function TerminalView({ active = true }: TerminalViewProps): JSX.Element {
  const [tabs, setTabs] = useState<TabEntry[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [isDividerDragging, setIsDividerDragging] = useState(false)
  /** v2.0 — 우측 작업 패널(업무 / 변경사항 / 히스토리 / 브랜치). 탭·폭도 함께 영속화한다. */
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('tasks')
  const [drawerWidth, setDrawerWidth] = useState(DRAWER_DEFAULT_WIDTH)
  const [dropHint, setDropHint] = useState<string | null>(null)
  /** claude 가 내 차례를 넘긴 세션 — 그 탭을 보면 지워진다. */
  const [doneSessions, setDoneSessions] = useState<Set<string>>(new Set())
  /** 저장소가 여럿 매핑됐고 지금 자리가 그중 어디도 아닐 때 — 어디서 시작할지 묻는다. */
  const [repoChoice, setRepoChoice] = useState<{
    task: TaskDropRequest
    pane: PaneRuntime
    candidates: TaskDropCandidate[]
    currentCwd?: string
    settings: WorkspaceSettingsShape | null
    links: TaskSessionLink[]
  } | null>(null)
  /** 드롭 진행 표시 — 무엇을 하는 중인지와 어느 폴더인지 같이 보여준다. */
  const [dropBusy, setDropBusy] = useState<{ label: string; where?: string } | null>(null)
  // v2.0 D — 단축키 오버라이드. keydown 클로저가 최신 값을 보도록 ref 로 동기화한다.
  const keybindingOverrides = useKeybindingOverrides()
  const overridesRef = useRef(keybindingOverrides)
  useEffect(() => { overridesRef.current = keybindingOverrides }, [keybindingOverrides])
  const restored = useRef(false)
  /** 탭 닫기 시 다음 활성 탭 선택에 쓰는 최근 사용 스택 (세션 수명 동안만 유지, 영속화 안 함). */
  const mruRef = useRef<string[]>([])
  /** 드래그 중 삽입 인디케이터 위치 계산용 — 탭 자체는 움직이지 않는다. */
  const [dragState, setDragState] = useState<{ activeId: string; overId: string | null } | null>(null)

  // v2.0 B-5: 저장 게이트(ADR-v2-terminal-p2-03, 함정 #10) — 복원이 끝나기 전엔 어떤 저장 트리거도
  // 발화하지 않는다. 미완성 트리가 자기 스냅샷을 덮어쓰는 사고를 막는다.
  const [restorePhase, setRestorePhase] = useState<'idle' | 'restoring' | 'ready'>('idle')
  const shouldPersistLayout = restorePhase === 'ready'
  // 인터벌/beforeunload 클로저는 한 번만 만들어지므로 최신 게이트 값을 ref 로 동기화한다
  // (onFocusRequestRef 와 동일 패턴).
  const shouldPersistLayoutRef = useRef(shouldPersistLayout)
  useEffect(() => { shouldPersistLayoutRef.current = shouldPersistLayout }, [shouldPersistLayout])

  // v2.0 B-4: xterm 은 트리 밖에 산다 — leafId 당 host div 하나(never remount), handle 은 forwardRef.
  const paneHostsRef = useRef<Map<string, HTMLDivElement>>(new Map())
  const paneHandlesRef = useRef<Map<string, TerminalPaneHandle>>(new Map())
  const paneRefCallbacksRef = useRef<Map<string, (handle: TerminalPaneHandle | null) => void>>(new Map())
  const tabsRef = useRef<TabEntry[]>(tabs)
  useEffect(() => { tabsRef.current = tabs }, [tabs])
  const activeTabIdRef = useRef<string | null>(activeTabId)
  useEffect(() => { activeTabIdRef.current = activeTabId }, [activeTabId])
  /** diff 탭을 보는 동안에도 소스 제어가 같은 저장소를 계속 가리키도록 마지막 터미널 탭을 기억한다. */
  const lastTerminalTabIdRef = useRef<string | null>(null)
  useEffect(() => {
    const active = tabsRef.current.find((t) => t.tabId === activeTabId)
    if (active && !isViewerTab(active)) lastTerminalTabIdRef.current = activeTabId
  }, [activeTabId, tabs])
  // v2.0 B-5: pane.serialize() 가 null 을 반환할 때(addon 미준비 등) 재사용할 마지막 성공 스냅샷.
  const lastPaneSnapshotRef = useRef<Map<string, TerminalPaneSnapshot>>(new Map())

  /** v2.0 B-5: 현재 상태를 스냅샷으로 조립한다 — 모든 트리거(debounce/autosave/beforeunload/
   *  onRequestState)가 공유하는 단일 진입점. null 인 pane 은 마지막 성공값을 재사용한다(없으면 빈 값). */
  const collectSnapshot = useCallback((): TerminalWorkspaceSnapshotV2 => {
    // diff 탭은 저장하지 않는다 — 파일 상태에서 파생되는 뷰라 복원해도 의미가 없고,
    // PTY 가 없어 스냅샷 스키마(panes 필수)와도 맞지 않는다.
    const tabsSnapshot = tabsRef.current.filter((t) => !isViewerTab(t)).map((tab) => {
      const panes: Record<string, TerminalPaneSnapshot> = {}
      for (const leafId of collectLeafIds(tab.tree)) {
        const pane = tab.panes[leafId]
        if (!pane) continue
        const fresh = paneHandlesRef.current.get(leafId)?.serialize() ?? null
        const snapshot: TerminalPaneSnapshot = fresh
          ? { cwd: pane.cwd, cols: fresh.cols, rows: fresh.rows, serialized: fresh.serialized }
          : (lastPaneSnapshotRef.current.get(leafId) ?? { cwd: pane.cwd, cols: 0, rows: 0, serialized: '' })
        if (fresh) lastPaneSnapshotRef.current.set(leafId, snapshot)
        panes[leafId] = snapshot
      }
      return { tabId: tab.tabId, name: tab.name, tree: tab.tree, focusedLeafId: tab.focusedLeafId, panes }
    })
    // 활성 탭이 diff 였다면 저장 목록에 없으므로 복원 시 무시된다 — null 로 명시한다.
    const activeId = tabsSnapshot.some((t) => t.tabId === activeTabIdRef.current)
      ? activeTabIdRef.current
      : null
    return { version: 2, savedAt: Date.now(), activeTabId: activeId, tabs: tabsSnapshot }
  }, [])

  const persistSnapshot = useCallback(async (): Promise<void> => {
    try {
      await window.api.terminal.saveState(collectSnapshot())
    } catch (e) {
      console.warn('[terminal] 스냅샷 저장 실패', e)
    }
  }, [collectSnapshot])

  // v2.0 B-5: 구조 변경 1초 debounce 저장 (ADR-03 §3-1) — shouldPersistLayout 이 false 면 즉시 반환.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notifyLayoutChanged = useCallback(() => {
    if (!shouldPersistLayoutRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void persistSnapshot()
    }, SAVE_DEBOUNCE_MS)
  }, [persistSnapshot])

  // 언마운트 시 예약된 저장을 취소한다 — 남겨두면 사라진 뷰의 스냅샷이 뒤늦게 덮어쓴다.
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
  }, [])

  // v2.0 B-5: 30초 autosave (ADR-03 §3-2) — main 의 옛 setInterval 을 이관받았다.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!shouldPersistLayoutRef.current) return
      void persistSnapshot()
    }, AUTOSAVE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [persistSnapshot])

  // v2.0 B-5: beforeunload — fire-and-forget(응답을 기다리지 않는다, ADR-03 §3-3).
  useEffect(() => {
    const handler = (): void => {
      if (!shouldPersistLayoutRef.current) return
      void window.api.terminal.saveState(collectSnapshot())
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [collectSnapshot])

  // v2.0 B-5: before-quit 핸드셰이크 응답 — main 이 TERMINAL_REQUEST_STATE 를 push 하면 즉시 flush.
  useEffect(() => {
    const off = window.api.terminal.onRequestState(() => {
      if (!shouldPersistLayoutRef.current) return
      void persistSnapshot()
    })
    return off
  }, [persistSnapshot])

  // v2.0 B-6: 사용자 설정 렌더러(webgl|dom) — 기존 settings.get/set 재사용, 신규 IPC 0개(ADR-04 §4).
  const [rendererSetting, setRendererSetting] = useState<TerminalRendererSetting>('webgl')
  const [rendererFellBack, setRendererFellBack] = useState(false)
  const toast = useToast()
  useEffect(() => {
    window.api.settings.get(RENDERER_SETTING_KEY).then((v) => {
      if (v === 'dom' || v === 'webgl') setRendererSetting(v)
    })
  }, [])
  const handleRendererChange = useCallback((next: TerminalRendererSetting) => {
    setRendererSetting(next)
    void window.api.settings.set(RENDERER_SETTING_KEY, next)
    if (next === 'webgl') {
      // 명시적 사용자 의사만이 실패 래치를 푸는 유일한 탈출구다(ADR-04 §3).
      resetGlobalWebglFailure()
      setRendererFellBack(false)
    }
  }, [])
  const handleWebglUnavailable = useCallback(() => {
    setRendererFellBack((already) => {
      // 탭바 상시 표시를 없앴으므로(설정으로 일원화) 폴백 사실은 1회 토스트로만 알린다.
      if (!already) {
        toast.warn(
          'WebGL 을 쓸 수 없어 DOM 렌더러로 전환했습니다',
          '설정 → 외관 & 동작 → 터미널 렌더러 에서 바꿀 수 있습니다'
        )
      }
      return true
    })
  }, [toast])

  const getOrCreateHost = useCallback((leafId: string): HTMLDivElement => {
    let host = paneHostsRef.current.get(leafId)
    if (!host) {
      host = createPaneHost()
      paneHostsRef.current.set(leafId, host)
    }
    return host
  }, [])

  const getHandle = useCallback((leafId: string): TerminalPaneHandle | null => paneHandlesRef.current.get(leafId) ?? null, [])

  const getRefCallback = useCallback((leafId: string): ((handle: TerminalPaneHandle | null) => void) => {
    let cb = paneRefCallbacksRef.current.get(leafId)
    if (!cb) {
      cb = (handle) => {
        if (handle) paneHandlesRef.current.set(leafId, handle)
        else paneHandlesRef.current.delete(leafId)
      }
      paneRefCallbacksRef.current.set(leafId, cb)
    }
    return cb
  }, [])

  /** leafId 가 완전히 사라질 때 Map 들을 정리한다 — host div 는 참조가 끊기면 GC 된다. */
  const cleanupHost = useCallback((leafId: string) => {
    paneHostsRef.current.delete(leafId)
    paneHandlesRef.current.delete(leafId)
    paneRefCallbacksRef.current.delete(leafId)
    lastPaneSnapshotRef.current.delete(leafId)
  }, [])

  // v2.0 B-4: paste 타겟 4중 검증(ADR-02 §9)의 "지금 유효한 타겟" — 호스트(TerminalView)가 진실을 쥔다.
  const getCurrentPasteTarget = useCallback((): PasteToken | null => {
    const tab = tabsRef.current.find((t) => t.tabId === activeTabIdRef.current)
    if (!tab) return null
    const pane = tab.panes[tab.focusedLeafId]
    if (!pane) return null
    return { tabId: tab.tabId, leafId: tab.focusedLeafId, sessionId: pane.sessionId, generation: pane.generation }
  }, [])

  const activateTab = useCallback((tabId: string) => {
    setActiveTabId(tabId)
    mruRef.current = pushMru(mruRef.current, tabId)
    notifyLayoutChanged()
  }, [notifyLayoutChanged])

  // ===== v2.0 C-3.5: 업무 카드 드래그&드롭 =====

  const readTaskPayload = (e: React.DragEvent): TaskDragPayload | null => {
    const raw = e.dataTransfer.getData(TASK_DRAG_MIME)
    if (!raw) return null
    try {
      return JSON.parse(raw) as TaskDragPayload
    } catch {
      return null
    }
  }

  const onTaskDragOver = useCallback((e: React.DragEvent): void => {
    // getData 는 drop 에서만 읽을 수 있으므로 type 존재 여부로만 판정한다
    if (!e.dataTransfer.types.includes(TASK_DRAG_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDropHint('여기에 놓으면 이 업무로 claude 를 시작합니다')
  }, [])

  const onTaskDragLeave = useCallback((e: React.DragEvent): void => {
    // 자식으로 이동하는 중이면 무시 — 깜빡임 방지
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setDropHint(null)
  }, [])

  /**
   * 계획에 업무용 워크트리를 반영한다 — 업무마다 폴더가 갈려야 여러 브랜치를 동시에 진행할 수 있다.
   *
   * 브랜치 이름은 프로젝트 규칙(`branchTemplate`)을 따르고, 그 브랜치가 이미 어딘가에 체크아웃돼
   * 있으면 그 폴더를 그대로 쓴다. 만들지 못하면 저장소 폴더 그대로 진행한다 — 드롭을 죽이지 않는다.
   */
  const withWorktree = useCallback(async (
    plan: Extract<TaskDropPlan, { kind: 'start' }>,
    task: TaskDropRequest,
    settings: WorkspaceSettingsShape | null,
    links: TaskSessionLink[],
    currentCwd?: string
  ): Promise<Extract<TaskDropPlan, { kind: 'start' }>> => {
    const repo = plan.repo
    if (!repo || !settings) return plan

    const branch = buildBranchName({
      template: resolveProjectConfig(settings, task.projectId).branchTemplate,
      projectCode: task.projectCode,
      taskNumber: task.number,
      taskId: task.taskId,
      subject: task.subject,
      prefix: repo.branchPrefix
    })

    setDropBusy({ label: '워크트리 준비 중…', where: `${repo.name} · ${branch}` })
    const ensure = window.api.workspace.taskWorktree
    if (!ensure) {
      // 앱을 다시 켜기 전(구버전 preload)에는 이 채널이 없다 — 죽지 말고 저장소 폴더로 진행한다.
      console.warn('[TaskDrop] workspace.taskWorktree 없음 — 저장소 폴더에서 시작합니다')
      setDropBusy(null)
      return plan
    }
    const info = await ensure({ repoPath: repo.path, branch, baseBranch: repo.baseBranch }).catch(
      (err: unknown) => {
        toast.error(
          '워크트리를 만들지 못했습니다',
          err instanceof Error ? err.message : `${repo.name} 폴더에서 그대로 시작합니다`
        )
        return null
      }
    )
    setDropBusy(null)
    if (!info) return plan

    if (info.isMainRepo) {
      // git 은 같은 브랜치를 두 곳에 체크아웃하지 못한다 — 조용히 저장소에서 시작하면
      // "왜 워크트리가 안 생겼지" 로 남는다.
      toast.info(
        '워크트리 대신 저장소에서 시작합니다',
        `${repo.name} 이 이미 ${branch} 를 체크아웃 중입니다`
      )
    }

    return {
      ...plan,
      cwd: info.path,
      repoName: info.isMainRepo ? repo.name : `${repo.name} · ${branch}`,
      // 폴더가 바뀌었어도 **그 저장소에서** 하던 세션이면 이어간다(워크트리 포함).
      sessionId: sessionForCwd(links, info.path) ?? sessionForRepo(links, repo.path)?.sessionId,
      needsCd: !samePath(currentCwd, info.path)
    }
  }, [toast])

  /** 계획이 정해진 뒤의 실행 — cd(필요할 때만) → claude → 첫 지시. */
  const executeDropPlan = useCallback(async (
    task: TaskDropRequest,
    pane: PaneRuntime,
    plan: Extract<TaskDropPlan, { kind: 'start' }>,
    settings: WorkspaceSettingsShape | null
  ): Promise<void> => {
    const resume = settings?.taskDropResume !== false
    const sessionId = resume ? plan.sessionId : undefined

    // 프로젝트마다 지시 문구가 다를 수 있다 — 없으면 전역 기본으로 떨어진다.
    const template = settings
      ? resolveProjectConfig(settings, task.projectId).promptTemplate
      : DEFAULT_TASK_DROP_PROMPT

    let body: string | undefined
    if (!sessionId && templateNeedsBody(template)) {
      body = await window.api.dooray.tasks
        .detail(task.projectId, task.taskId)
        .then((d) => d?.body?.content)
        .catch(() => undefined)
    }
    // 첨부 이미지는 내려받는 데 시간이 걸린다 — 템플릿이 실제로 쓸 때만 받는다.
    let imagePaths: string[] | undefined
    let omittedImages = 0
    if (!sessionId && templateNeedsImages(template)) {
      setDropBusy({ label: '첨부 이미지 받는 중', where: plan.cwd })
      const picked = await window.api.dooray.tasks
        .images(task.projectId, task.taskId)
        .catch(() => null)
      imagePaths = picked?.files.map((f) => f.path)
      omittedImages = picked?.omitted ?? 0
    }
    const prompt = sessionId
      ? null
      : renderTaskDropPrompt(template, {
        title: task.subject,
        number: task.number,
        projectCode: task.projectCode,
        url: `https://nhnent.dooray.com/project/posts/${task.taskId}`,
        body,
        imagePaths,
        omittedImages
      })

    const since = Date.now()
    for (const step of buildTaskDropSteps({
      target: { cwd: plan.cwd ?? '', repoName: plan.repoName ?? '', claudeSessionId: sessionId },
      prompt,
      // needsCd 가 false 면 이미 그 폴더다 — currentCwd 를 같게 넘겨 cd 를 생략시킨다.
      currentCwd: plan.needsCd ? undefined : plan.cwd,
      skipPermissions: settings?.taskDropSkipPermissions === true
    })) {
      setDropBusy({ label: step.label, where: plan.cwd })
      window.api.terminal.input(pane.sessionId, step.data)
      if (step.delayMs > 0) await new Promise((r) => setTimeout(r, step.delayMs))
    }
    setDropBusy(null)
    // 어디서 시작했는지 남긴다 — 엉뚱한 워크트리로 갔다면 이걸로 바로 안다.
    toast.info(
      sessionId ? '이전 세션을 이어갑니다' : '업무를 시작했습니다',
      plan.cwd ?? '지금 터미널이 있는 폴더'
    )

    // 새 세션이면 방금 만들어진 것을 (업무, 폴더) 쌍에 연결한다 (resume 은 이미 연결돼 있음).
    // 폴더를 모르면 연결 키를 만들 수 없어 건너뛴다 — 실행 자체는 이미 끝났다.
    const linkCwd = plan.cwd
    if (!sessionId && linkCwd) {
      // 세션이 언제 생기는지는 claude 가 정한다 — main 이 짧은 간격으로 지켜보다 연결한다.
      // 뷰를 떠나거나 탭을 옮겨도 이어지도록 렌더러가 아니라 main 에서 돈다.
      void window.api.workspace.taskDrop
        .watch({
          projectId: task.projectId,
          taskId: task.taskId,
          cwd: linkCwd,
          since,
          label: plan.repoName,
          repoPath: plan.repo?.path
        })
        .catch(() => undefined)
    }
  }, [toast])

  /**
   * 업무 하나를 지정한 pane 에서 시작한다.
   *
   * 지금 있는 자리가 이미 그 프로젝트의 저장소면 거기서 바로 한다 — 터미널을 그 폴더로 옮겨둔
   * 것 자체가 선택이라 다른 데로 `cd` 하면 그 선택을 덮는다. 매핑되지 않은 자리에 놓았을 때만
   * 어디로 갈지 정하는데, 후보가 하나면 그냥 가고 여럿이면 묻는다.
   */
  /**
   * 이 계획을 어느 pane 에서 실행할지 — **claude 나 vim 이 돌고 있는 pane 에는 타이핑하지 않는다.**
   *
   * 실행 중인 TUI 에 명령을 보내면 그 프로그램의 입력으로 먹혀서, 진행 중인 대화가 오염되고
   * 명령은 엉뚱한 폴더에서 실행된다(실제로 6460 워크트리에서 6787 이 시작된 사고). 새 탭을 연다.
   */
  const paneForPlan = useCallback(async (
    pane: PaneRuntime,
    plan: Extract<TaskDropPlan, { kind: 'start' }>
  ): Promise<{ pane: PaneRuntime; plan: Extract<TaskDropPlan, { kind: 'start' }> }> => {
    const foreground = await (
      window.api.terminal.foreground?.(pane.sessionId) ?? Promise.resolve(null)
    ).catch(() => null)
    if (!isPaneBusy(foreground)) return { pane, plan }

    const created = await createTabRef.current?.(plan.cwd ? { cwd: plan.cwd } : undefined)
    if (!created) {
      toast.error('실행 중인 터미널이라 시작할 수 없습니다', `${foreground} 를 먼저 끝내주세요`)
      throw new Error(`pane 이 사용 중입니다 (${foreground})`)
    }
    toast.info(`${foreground} 실행 중이라 새 탭에서 시작합니다`)
    // 갓 만든 PTY 는 프롬프트가 뜨기 전이라 첫 입력이 씹힌다.
    await new Promise((r) => setTimeout(r, 400))
    // 새 탭은 목적지에서 바로 열었으므로 다시 `cd` 하지 않는다.
    return { pane: created.pane, plan: { ...plan, needsCd: false } }
  }, [toast])

  /** 실제 해석·실행. 실패는 위의 `runTaskInPane` 이 사용자에게 알린다. */
  const runTaskInPaneUnsafe = useCallback(async (
    task: TaskDropRequest,
    pane: PaneRuntime
  ): Promise<void> => {
    if (pane.exitInfo) {
      toast.error('종료된 터미널에서는 실행할 수 없습니다')
      return
    }

    // pane.cwd 는 PTY 생성 시점 값이라 `cd` 이후를 못 따라간다 — 실측값을 우선 쓴다.
    const liveCwd =
      (await window.api.terminal.sessionCwd?.(pane.sessionId).catch(() => null)) ?? pane.cwd ?? undefined

    const [settings, repos, linkMap] = await Promise.all([
      window.api.workspace.settings.get().catch(() => null),
      window.api.workspace.repos.list().catch(() => [] as RepoRegistryEntry[]),
      window.api.workspace.taskDrop.linked().catch(() => ({}) as Record<string, TaskSessionLink[]>)
    ])

    // 워크트리 안이면 경로가 등록된 저장소와 다르다 — 본 저장소로 환산해 비교한다.
    const currentRepoRoot = liveCwd
      ? await (window.api.git.mainRepoRoot?.(liveCwd) ?? Promise.resolve(null)).catch(() => null)
      : null

    const repoIds = settings ? resolveProjectConfig(settings, task.projectId).repoIds : []
    const mappedRepos = repoIds
      .map((id) => repos.find((r) => r.id === id))
      .filter((r): r is RepoRegistryEntry => Boolean(r))
    const links = linkMap[workspaceKey(task.projectId, task.taskId)] ?? []

    const plan = resolveTaskDropPlan({
      currentCwd: liveCwd,
      currentRepoRoot: currentRepoRoot ?? undefined,
      mappedRepos,
      links
    })

    if (plan.kind === 'choose') {
      // 사용자가 고르면 그 뒤를 이어서 실행한다.
      setRepoChoice({ task, pane, candidates: plan.candidates, currentCwd: liveCwd, settings, links })
      return
    }

    const target = await paneForPlan(pane, await withWorktree(plan, task, settings, links, liveCwd))
    await executeDropPlan(task, target.pane, target.plan, settings)
  }, [toast, executeDropPlan, withWorktree, paneForPlan])

  const runTaskInPane = useCallback(async (
    task: TaskDropRequest,
    pane: PaneRuntime
  ): Promise<void> => {
    try {
      await runTaskInPaneUnsafe(task, pane)
    } catch (err) {
      // 여기서 삼키면 '드롭했는데 아무 일도 안 일어난다' 가 된다 — 무엇이 막았는지는 말해줘야 한다.
      setDropBusy(null)
      console.error('[TaskDrop] 실패:', err)
      toast.error('업무를 시작하지 못했습니다', err instanceof Error ? err.message : String(err))
    }
  }, [runTaskInPaneUnsafe, toast])

  // createTab 은 아래에서 선언되므로 ref 로 우회한다 (선언 순서 의존 제거)
  const createTabRef = useRef<
    ((opts?: { cwd?: string; initialCommand?: string }) => Promise<CreatedTab>) | null
  >(null)

  /**
   * 업무를 시작할 pane 이 없을 때 하나 만든다.
   *
   * 갓 만든 PTY 는 셸 프롬프트가 뜨기 전이라 첫 입력이 씹힌다 — 부팅만큼 기다렸다 돌려준다.
   */
  const createPaneForTask = useCallback(async (): Promise<PaneRuntime | null> => {
    const created = await createTabRef.current?.().catch(() => null)
    if (!created) return null
    await new Promise((r) => setTimeout(r, 400))
    return created.pane
  }, [])

  /** 상세 오버레이의 "터미널에서 시작" — 활성 탭의 포커스 pane 을 쓴다. 탭이 없으면 하나 만든다. */
  const runTaskInFocusedPane = useCallback(async (task: DoorayTask): Promise<void> => {
    const tab = tabsRef.current.find((t) => t.tabId === activeTabIdRef.current && !isViewerTab(t))
    const pane = tab?.panes[tab.focusedLeafId] ?? (await createPaneForTask())
    if (!pane) return
    await runTaskInPane(
      {
        projectId: task.projectId,
        taskId: task.id,
        subject: task.subject,
        number: task.number,
        projectCode: task.projectCode
      },
      pane
    )
  }, [runTaskInPane, createPaneForTask])

  const onTaskDrop = useCallback(async (e: React.DragEvent): Promise<void> => {
    const payload = readTaskPayload(e)
    setDropHint(null)
    if (!payload) return
    e.preventDefault()

    // 터미널 탭이 하나도 없으면(또는 diff 탭만 열려 있으면) 만들어서 거기서 시작한다 — 드롭을 삼키지 않는다.
    const tab = tabsRef.current.find((t) => t.tabId === activeTabIdRef.current && !isViewerTab(t))
    const pane = tab?.panes[tab.focusedLeafId] ?? (await createPaneForTask())
    if (!pane) {
      toast.error('업무를 시작할 터미널이 없습니다')
      return
    }
    await runTaskInPane(
      {
        projectId: payload.projectId,
        taskId: payload.taskId,
        subject: payload.subject,
        number: payload.number,
        projectCode: payload.projectCode
      },
      pane
    )
  }, [runTaskInPane, toast, createPaneForTask])

  // v2.0: claude 가 멈추면 탭에 표시하고, 알림을 누르면 그 탭으로 데려간다.
  useEffect(() => {
    const offDone = window.api.terminal.onClaudeDone?.(({ sessionId }) => {
      setDoneSessions((prev) => {
        if (prev.has(sessionId)) return prev
        const next = new Set(prev)
        next.add(sessionId)
        return next
      })
    })
    const offFocus = window.api.terminal.onFocusSession?.(({ sessionId }) => {
      const tab = tabsRef.current.find((t) =>
        Object.values(t.panes).some((pane) => pane.sessionId === sessionId)
      )
      if (tab) activateTab(tab.tabId)
    })
    return () => {
      offDone?.()
      offFocus?.()
    }
  }, [activateTab])

  // 그 탭을 보고 있으면 표시를 지운다 — 이미 확인했다는 뜻이다.
  useEffect(() => {
    const tab = tabs.find((t) => t.tabId === activeTabId)
    if (!tab) return
    const ids = Object.values(tab.panes).map((pane) => pane.sessionId)
    setDoneSessions((prev) => {
      if (!ids.some((id) => prev.has(id))) return prev
      const next = new Set(prev)
      for (const id of ids) next.delete(id)
      return next
    })
  }, [activeTabId, tabs])

  const setFocusedLeaf = useCallback((tabId: string, leafId: string) => {
    setTabs((prev) => prev.map((t) => (
      t.tabId === tabId && t.focusedLeafId !== leafId ? { ...t, focusedLeafId: leafId } : t
    )))
    if (activeTabIdRef.current !== tabId) activateTab(tabId)
  }, [activateTab])

  // v2.0 B-5: 앱 시작 시 저장된 워크스페이스 스냅샷 복원 (ADR-v2-terminal-p2-03 §7/§11).
  // main 이 legacy terminalSessions 마이그레이션까지 끝낸 뒤 반환하므로 여기선 v2 스키마만 다룬다.
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    setRestorePhase('restoring')

    void (async () => {
      let snap: TerminalWorkspaceSnapshotV2 | null = null
      try {
        snap = await window.api.terminal.restoreState()
      } catch (e) {
        console.warn('[terminal] 스냅샷 복원 요청 실패', e)
      }
      if (!snap || snap.tabs.length === 0) {
        setRestorePhase('ready')
        return
      }
      const snapshot = snap

      let tabSnaps = snapshot.tabs
      if (tabSnaps.length > MAX_RESTORED_TABS) {
        console.warn(`[terminal] 저장된 탭 ${tabSnaps.length}개 중 최근 ${MAX_RESTORED_TABS}개만 복원합니다`)
        tabSnaps = tabSnaps.slice(-MAX_RESTORED_TABS)
      }

      let leafBudget = MAX_RESTORED_LEAVES
      const nextTabs: TabEntry[] = []
      for (const tabSnap of tabSnaps) {
        let tree: SplitNode = isValidTree(tabSnap.tree)
          ? tabSnap.tree
          : { type: 'leaf', leafId: crypto.randomUUID() }
        if (tree !== tabSnap.tree) {
          console.warn(`[terminal] 탭 "${tabSnap.name}" 의 split 트리가 손상돼 단일 leaf 로 복원합니다`)
        }

        const leafIds = collectLeafIds(tree)
        if (leafIds.length > leafBudget) {
          console.warn(`[terminal] leaf 상한(${MAX_RESTORED_LEAVES}) 초과로 탭 "${tabSnap.name}" 복원을 건너뜁니다`)
          continue
        }

        const panes: Record<string, PaneRuntime> = {}
        let tabFailed = false
        for (const leafId of leafIds) {
          const paneSnap = tabSnap.panes[leafId]
          try {
            const session = await window.api.terminal.create({ cwd: paneSnap?.cwd })
            panes[leafId] = { sessionId: session.id, cwd: paneSnap?.cwd, generation: 0, restoreSnapshot: paneSnap }
          } catch (e) {
            console.warn('[terminal] 복원 중 세션 생성 실패 — leaf 제외', e)
            const pruned = closeLeaf(tree, leafId)
            if (pruned === null) { tabFailed = true; break }
            tree = pruned
          }
        }
        if (tabFailed || Object.keys(panes).length === 0) continue

        leafBudget -= Object.keys(panes).length
        const focusedLeafId = panes[tabSnap.focusedLeafId] ? tabSnap.focusedLeafId : Object.keys(panes)[0]
        nextTabs.push({ tabId: tabSnap.tabId, name: tabSnap.name, tree, focusedLeafId, panes })
      }

      setTabs(nextTabs)
      const restoredActiveId = snapshot.activeTabId && nextTabs.some((t) => t.tabId === snapshot.activeTabId)
        ? snapshot.activeTabId
        : (nextTabs[0]?.tabId ?? null)
      setActiveTabId(restoredActiveId)
      mruRef.current = restoredActiveId ? [restoredActiveId] : []
      setRestorePhase('ready')
    })()
  }, [])

  // v2.0 B-1: PTY 종료 통지 구독 — sessionId 로 (tabId, leafId) 역매핑, 이미 exitInfo 있으면 덮지 않는다.
  useEffect(() => {
    const off = window.api.terminal.onExit((payload) => {
      setTabs((prev) => prev.map((tab) => {
        const entry = Object.entries(tab.panes).find(([, p]) => p.sessionId === payload.id)
        if (!entry) return tab
        const [leafId, pane] = entry
        if (pane.exitInfo) return tab
        return { ...tab, panes: { ...tab.panes, [leafId]: { ...pane, exitInfo: payload } } }
      }))
    })
    return off
  }, [])

  const createTab = useCallback(async (
    opts?: { cwd?: string; initialCommand?: string }
  ): Promise<CreatedTab> => {
    const cwd = opts?.cwd
    const createOpts: { cwd?: string; command?: string; args?: string[] } = {}
    if (cwd) createOpts.cwd = cwd
    const session = await window.api.terminal.create(createOpts)
    const base = tabNameFromCwd(cwd)
    const leafId = crypto.randomUUID()
    const tabId = crypto.randomUUID()
    setTabs((prev) => [...prev, {
      tabId,
      name: base,
      tree: { type: 'leaf', leafId },
      focusedLeafId: leafId,
      panes: { [leafId]: { sessionId: session.id, cwd, generation: 0 } }
    }])
    activateTab(tabId)
    // 셸이 프롬프트 띄울 때까지 잠깐 기다린 뒤 자동 명령 입력 (Claude 채팅의 "터미널" 버튼 등)
    if (opts?.initialCommand) {
      const cmd = opts.initialCommand.endsWith('\n') ? opts.initialCommand : opts.initialCommand + '\n'
      setTimeout(() => {
        try { window.api.terminal.input(session.id, cmd) } catch { /* ok */ }
      }, 350)
    }
    notifyLayoutChanged()
    return { tabId, leafId, pane: { sessionId: session.id, cwd, generation: 0 } }
  }, [activateTab, notifyLayoutChanged])

  // 드롭 경로에서 쓰려면 createTab 이 여기보다 뒤에 선언돼 있어야 해서 ref 로 우회한다.
  useEffect(() => {
    createTabRef.current = createTab
  }, [createTab])

  /**
   * 파일 diff 를 탭으로 연다. 같은 파일·같은 비교 대상이면 새로 만들지 않고 그 탭을 활성화한다 —
   * 목록을 훑으며 여러 파일을 볼 때 탭이 무한정 쌓이지 않게.
   */
  const openDiffTab = useCallback((request: DiffRequest) => {
    const tabId = diffTabId(request)
    const existing = tabsRef.current.find((t) => t.tabId === tabId)
    if (existing) {
      activateTab(tabId)
      return
    }
    const leafId = crypto.randomUUID()
    setTabs((prev) => [...prev, {
      tabId,
      kind: 'diff',
      name: request.path.split('/').pop() || request.path,
      // diff 탭에는 PTY 가 없다 — 자리표시자 leaf 하나만 두고 panes 는 비운다.
      tree: { type: 'leaf', leafId },
      focusedLeafId: leafId,
      panes: {},
      diff: request
    }])
    activateTab(tabId)
    notifyLayoutChanged()
  }, [activateTab, notifyLayoutChanged])

  /**
   * v2.0 C-3: 이미 만들어진 PTY 세션을 탭으로 받아들인다 — 워크스페이스 시작으로 main 이 spawn 한
   * run 터미널을 여기서 연다. 같은 세션이 이미 탭으로 있으면 그 탭을 활성화만 한다.
   */
  const adoptSession = useCallback((sessionId: string, name: string, cwd?: string) => {
    const existing = tabsRef.current.find((t) => Object.values(t.panes).some((p) => p.sessionId === sessionId))
    if (existing) {
      activateTab(existing.tabId)
      return
    }
    const leafId = crypto.randomUUID()
    const tabId = crypto.randomUUID()
    setTabs((prev) => [...prev, {
      tabId,
      name,
      tree: { type: 'leaf', leafId },
      focusedLeafId: leafId,
      panes: { [leafId]: { sessionId, cwd, generation: 0 } }
    }])
    activateTab(tabId)
    notifyLayoutChanged()
  }, [activateTab, notifyLayoutChanged])

  useEffect(() => {
    const handler = (e: Event): void => {
      const d = (e as CustomEvent<{ sessionId?: string; name?: string; cwd?: string }>).detail
      if (d?.sessionId) adoptSession(d.sessionId, d.name || '워크스페이스', d.cwd)
    }
    window.addEventListener('adopt-terminal', handler)
    return () => window.removeEventListener('adopt-terminal', handler)
  }, [adoptSession])

  // 작업 패널 열림/탭/폭 영속화 — 기본은 열림 + 업무 탭(이 화면의 출발점이라서)
  useEffect(() => {
    void window.api.settings
      .get('terminalTaskDrawerOpen')
      .then((v) => { if (v === false) setDrawerOpen(false) })
      .catch(() => undefined)
    void window.api.settings
      .get('terminalDrawerTab')
      .then((v) => {
        if (
          v === 'tasks' ||
          v === 'changes' ||
          v === 'branchDiff' ||
          v === 'history' ||
          v === 'branches'
        ) {
          setDrawerTab(v)
        }
      })
      .catch(() => undefined)
    void window.api.settings
      .get('terminalDrawerWidth')
      .then((v) => setDrawerWidth(resolveStoredDrawerWidth(v)))
      .catch(() => undefined)
  }, [])
  const toggleDrawer = useCallback(() => {
    setDrawerOpen((v) => {
      const next = !v
      void window.api.settings.set('terminalTaskDrawerOpen', next)
      return next
    })
  }, [])
  /** OSC7 로 받은 cwd 를 pane 에 반영한다 — 스냅샷 저장과 소스 제어 판정이 같은 값을 본다. */
  const updatePaneCwd = useCallback((tabId: string, leafId: string, cwd: string) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.tabId !== tabId) return t
        const pane = t.panes[leafId]
        if (!pane || pane.cwd === cwd) return t
        return { ...t, panes: { ...t.panes, [leafId]: { ...pane, cwd } } }
      })
    )
  }, [])

  const changeDrawerTab = useCallback((tab: DrawerTab) => {
    setDrawerTab(tab)
    void window.api.settings.set('terminalDrawerTab', tab)
  }, [])

  /**
   * 소스 제어 패널은 지금 보고 있는 터미널의 저장소를 따라간다 — 별도 선택 UI 를 두지 않는다.
   * diff 탭이 활성일 때는 그 diff 를 연 터미널을 계속 따라가야 하므로 마지막 터미널 탭으로 떨어진다.
   */
  const focusedPane = (() => {
    const active = tabs.find((t) => t.tabId === activeTabId)
    const tab = active && !isViewerTab(active)
      ? active
      : tabs.find((t) => t.tabId === lastTerminalTabIdRef.current && !isViewerTab(t)) ??
        tabs.find((t) => !isViewerTab(t))
    return tab ? tab.panes[tab.focusedLeafId] : undefined
  })()
  const {
    repoRoot,
    cwd: focusedCwd,
    resolving: repoResolving,
    refresh: refreshRepoRoot
  } = useTerminalRepo({ sessionId: focusedPane?.sessionId, cwd: focusedPane?.cwd })
  // 자동 추종이 기본, 목록에서 고르면 고정 — Windows 의 cd 추적 불가/터미널 미개방 등을 덮는다.
  const { repo: scmRepo, pinned, recents, pin } = useScmRepoSelection(repoRoot)

  /** 패널이 git 을 다시 읽게 하는 신호. 스테이징/커밋 등 쓰기 직후 탭 간에 공유한다. */
  const notifyRepoChanged = useCallback(() => {
    window.dispatchEvent(new CustomEvent('git-repo-maybe-changed'))
  }, [])

  // 터미널에서 직접 `cd` / git 을 쓰는 경우가 많다 — 이 경계들에서 cwd·상태를 다시 읽는다.
  // (셸 통합 없이 명령 종료를 알 방법이 없어, 폴링 대신 사용자 시선이 옮겨오는 순간만 잡는다)
  useEffect(() => {
    if (!drawerOpen) return
    const resync = (): void => {
      refreshRepoRoot()
      notifyRepoChanged()
    }
    window.addEventListener('focus', resync)
    return () => window.removeEventListener('focus', resync)
  }, [drawerOpen, refreshRepoRoot, notifyRepoChanged])

  // 패널을 열거나 git 탭으로 옮길 때도 cwd 를 다시 잰다 — 그 사이 `cd` 했을 수 있다.
  useEffect(() => {
    if (drawerOpen && drawerTab !== 'tasks') refreshRepoRoot()
  }, [drawerOpen, drawerTab, activeTabId, refreshRepoRoot])

  /** 지금 분할할 수 있는 탭인지 — diff/file 탭에는 PTY 가 없다. */
  const activeTerminalTab = tabs.find((t) => t.tabId === activeTabId && !isViewerTab(t)) ?? null

  /**
   * 터미널에서 ⌘클릭한 파일을 앱 안 탭으로 연다. 같은 파일이면 새로 만들지 않고 그 탭을 살린다.
   */
  const openFileTab = useCallback((request: FileTabRequest) => {
    const tabId = `file ${request.path}`
    if (tabsRef.current.some((t) => t.tabId === tabId)) {
      activateTab(tabId)
      return
    }
    const leafId = crypto.randomUUID()
    setTabs((prev) => [...prev, {
      tabId,
      kind: 'file',
      name: request.path.split('/').pop() || request.path,
      // 파일 탭에는 PTY 가 없다 — 자리표시자 leaf 하나만 두고 panes 는 비운다(diff 탭과 동일).
      tree: { type: 'leaf', leafId },
      focusedLeafId: leafId,
      panes: {},
      file: request
    }])
    activateTab(tabId)
    notifyLayoutChanged()
  }, [activateTab, notifyLayoutChanged])

  /**
   * 터미널 링크 클릭의 종착지. 앱이 그릴 수 있는 텍스트면 탭으로, 아니면 OS 기본 앱으로 넘긴다.
   * `preferExternal`(⌥⌘클릭)이면 판정 없이 바로 OS 로 — 탈출구를 항상 남긴다.
   */
  const handleTerminalPathOpen = useCallback(async (
    absolutePath: string,
    opts: { preferExternal: boolean; line?: number | null }
  ): Promise<void> => {
    if (!opts.preferExternal) {
      const probe = await window.api.file.readText(absolutePath).catch(() => null)
      if (probe?.ok) {
        openFileTab({ path: absolutePath, line: opts.line ?? null })
        return
      }
    }
    // 폴더·이진·너무 큰 파일, 그리고 ⌥⌘ — 앱이 그릴 수 없는 것은 OS 가 더 잘한다.
    await window.api.shell.openPath(absolutePath)
  }, [openFileTab])

  /** v2.0 B-4: split 은 항상 새 PTY — 현재 focused pane 의 cwd 를 상속한다(ADR-02 §7). */
  const splitFocusedPane = useCallback(async (direction: SplitDirection) => {
    const tabId = activeTabIdRef.current
    if (!tabId) return
    const tab = tabsRef.current.find((t) => t.tabId === tabId)
    if (!tab || isViewerTab(tab)) return
    const cwd = tab.panes[tab.focusedLeafId]?.cwd
    let session: TerminalSession
    try {
      session = await window.api.terminal.create(cwd ? { cwd } : {})
    } catch { return }
    const newLeafId = crypto.randomUUID()
    setTabs((prev) => prev.map((t) => (
      t.tabId === tabId
        ? {
          ...t,
          tree: splitLeaf(t.tree, t.focusedLeafId, direction, newLeafId),
          focusedLeafId: newLeafId,
          panes: { ...t.panes, [newLeafId]: { sessionId: session.id, cwd, generation: 0 } }
        }
        : t
    )))
    notifyLayoutChanged()
  }, [notifyLayoutChanged])

  const moveFocus = useCallback((direction: 'left' | 'right' | 'up' | 'down') => {
    const tabId = activeTabIdRef.current
    if (!tabId) return
    setTabs((prev) => prev.map((t) => {
      if (t.tabId !== tabId) return t
      const next = neighborLeaf(t.tree, t.focusedLeafId, direction)
      return next ? { ...t, focusedLeafId: next } : t
    }))
  }, [])

  /** 드롭 시 1회 커밋 — ratio 를 반영한 뒤 영향받는 leaf 전부에 fit() 을 1회 sweep 한다(함정 #9). */
  const commitRatio = useCallback((tabId: string, path: SplitPath, ratio: number | undefined) => {
    setTabs((prev) => prev.map((t) => {
      if (t.tabId !== tabId) return t
      const nextTree = setRatioAtPath(t.tree, path, ratio)
      requestAnimationFrame(() => {
        for (const leafId of collectLeafIds(nextTree)) paneHandlesRef.current.get(leafId)?.fit()
      })
      return { ...t, tree: nextTree }
    }))
    notifyLayoutChanged()
  }, [notifyLayoutChanged])

  /** 탭 전체를 닫는다 — panes 의 세션을 전부 kill. alreadyKilledLeaf 는 closeLeafInTab 에서 이미 처리한 leaf. */
  const closeTabEntry = useCallback(async (tabId: string, alreadyKilledLeaf?: string) => {
    const tab = tabsRef.current.find((t) => t.tabId === tabId)
    if (tab) {
      for (const [leafId, pane] of Object.entries(tab.panes)) {
        if (leafId === alreadyKilledLeaf) continue
        try { await window.api.terminal.kill(pane.sessionId) } catch { /* ok */ }
        cleanupHost(leafId)
      }
      if (alreadyKilledLeaf) cleanupHost(alreadyKilledLeaf)
    }
    mruRef.current = mruRef.current.filter((x) => x !== tabId)
    setTabs((prev) => {
      const order = prev.map((t) => t.tabId)
      const next = prev.filter((t) => t.tabId !== tabId)
      if (activeTabId === tabId) {
        setActiveTabId(pickNextActiveTab(order, tabId, mruRef.current))
      }
      return next
    })
    notifyLayoutChanged()
  }, [activeTabId, cleanupHost, notifyLayoutChanged])

  /** pane 하나를 닫는다 — 마지막 pane 이면 탭 자체를 닫는다(ADR-02 §2 "형제 승격"). */
  const closeLeafInTab = useCallback(async (tabId: string, leafId: string) => {
    const tab = tabsRef.current.find((t) => t.tabId === tabId)
    if (!tab) return
    const pane = tab.panes[leafId]
    if (pane) {
      try { await window.api.terminal.kill(pane.sessionId) } catch { /* ok */ }
    }
    const nextTree = closeLeaf(tab.tree, leafId)
    if (nextTree === null) {
      await closeTabEntry(tabId, leafId)
      return
    }
    cleanupHost(leafId)
    setTabs((prev) => prev.map((t) => {
      if (t.tabId !== tabId) return t
      const nextPanes = { ...t.panes }
      delete nextPanes[leafId]
      const nextFocusedLeafId = t.focusedLeafId === leafId ? collectLeafIds(nextTree)[0] : t.focusedLeafId
      return { ...t, tree: nextTree, focusedLeafId: nextFocusedLeafId, panes: nextPanes }
    }))
    notifyLayoutChanged()
  }, [closeTabEntry, cleanupHost, notifyLayoutChanged])

  const closeAll = useCallback(async () => {
    if (tabs.length === 0) return
    if (!window.confirm(`${tabs.length}개 탭을 모두 닫을까요?`)) return
    for (const tab of tabs) {
      for (const [leafId, pane] of Object.entries(tab.panes)) {
        try { await window.api.terminal.kill(pane.sessionId) } catch { /* ok */ }
        cleanupHost(leafId)
      }
    }
    mruRef.current = []
    setTabs([])
    setActiveTabId(null)
    notifyLayoutChanged()
  }, [tabs, cleanupHost, notifyLayoutChanged])

  /** 셸이 보낸 창 제목으로 탭 이름 자동 갱신 — 사용자가 직접 바꾼 탭은 건드리지 않는다(Warp 식). */
  const applyAutoName = useCallback((tabId: string, title: string) => {
    const next = tabNameFromTitle(title)
    if (!next) return
    setTabs((prev) => prev.map((t) => (
      t.tabId === tabId && !t.nameIsCustom && t.name !== next ? { ...t, name: next } : t
    )))
  }, [])

  const renameTab = useCallback((tabId: string, name: string) => {
    // 직접 이름을 정한 순간부터 셸 제목 자동 갱신을 멈춘다
    setTabs((prev) => prev.map((t) => (t.tabId === tabId ? { ...t, name, nameIsCustom: true } : t)))
    const tab = tabsRef.current.find((t) => t.tabId === tabId)
    if (tab) {
      for (const pane of Object.values(tab.panes)) void window.api.terminal.rename(pane.sessionId, name)
    }
    notifyLayoutChanged()
  }, [notifyLayoutChanged])

  // 외부에서 터미널 생성 요청 수신 (Claude 채팅, 워크스페이스 등)
  useEffect(() => {
    const handler = (e: Event): void => {
      const { cwd, initialCommand } = (e as CustomEvent).detail || {}
      void createTab({ cwd, initialCommand })
    }
    window.addEventListener('create-terminal', handler)
    return () => window.removeEventListener('create-terminal', handler)
  }, [createTab])

  // 커맨드 팔레트 등이 특정 드로어 탭을 바로 열 때 (구 '브랜치 작업' 뷰 진입점 대체)
  useEffect(() => {
    const handler = (e: Event): void => {
      const tab = (e as CustomEvent<{ tab?: DrawerTab }>).detail?.tab
      if (!tab) return
      if (!drawerOpen) toggleDrawer()
      changeDrawerTab(tab)
    }
    window.addEventListener('open-terminal-drawer', handler)
    return () => window.removeEventListener('open-terminal-drawer', handler)
  }, [drawerOpen, toggleDrawer, changeDrawerTab])

  // v2.0 B-4: ⌘D/⌘⇧D/⌥⌘화살표/⌘W/⌘T/⌘1~9 — 테이블 기반 판정(terminalShortcuts.ts) + `active` 가드.
  // Workstream D-1 이 레지스트리로 흡수하기 쉽도록 테이블은 별도 모듈에 둔다(ADR-02 §8).
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (!active) return
      const isMac = navigator.platform.toUpperCase().includes('MAC')
      // v2.0 D — 설정에서 리바인딩한 조합이 있으면 그것을 우선한다
      const shortcut = resolveShortcutWithOverrides(e, isMac, (ev, actionId) => {
        const custom = overridesRef.current[actionId]
        if (!custom) return false
        return custom.some((b) => matchesBinding(ev, b, isMac ? 'darwin' : 'other'))
      })
      if (shortcut) {
        switch (shortcut) {
          case 'newTab': e.preventDefault(); void createTab(); return
          case 'toggleTaskDrawer': e.preventDefault(); toggleDrawer(); return
          case 'closePane': {
            e.preventDefault()
            const tabId = activeTabIdRef.current
            const tab = tabId ? tabsRef.current.find((t) => t.tabId === tabId) : undefined
            if (tab) void closeLeafInTab(tab.tabId, tab.focusedLeafId)
            return
          }
          case 'splitRight': e.preventDefault(); void splitFocusedPane('row'); return
          case 'splitDown': e.preventDefault(); void splitFocusedPane('column'); return
          case 'focusLeft': e.preventDefault(); moveFocus('left'); return
          case 'focusRight': e.preventDefault(); moveFocus('right'); return
          case 'focusUp': e.preventDefault(); moveFocus('up'); return
          case 'focusDown': e.preventDefault(); moveFocus('down'); return
        }
      }
      // ⌘1~9 탭 전환 — 테이블에 없는 digit 바인딩만 별도 처리(기존 p1 동작 보존).
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const idx = parseInt(e.key, 10) - 1
        const tab = tabsRef.current[idx]
        if (tab) activateTab(tab.tabId)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, createTab, closeLeafInTab, splitFocusedPane, moveFocus, activateTab])

  // v2.0 B-8: 탭 드래그 reorder — 12px 이동 전에는 활성화되지 않는 커스텀 센서 (더블클릭 rename 보호)
  const sensors = useSensors(
    useSensor(TabPointerSensor, { activationConstraint: { distance: TAB_DRAG_ACTIVATION_DISTANCE_PX } })
  )

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setDragState({ activeId: String(e.active.id), overId: null })
  }, [])

  const handleDragOver = useCallback((e: DragOverEvent) => {
    setDragState((prev) => (prev ? { ...prev, overId: e.over ? String(e.over.id) : null } : prev))
  }, [])

  const endDrag = useCallback((e: DragEndEvent) => {
    setDragState(null)
    const activeTab = String(e.active.id)
    const overTab = e.over ? String(e.over.id) : null
    if (!overTab || activeTab === overTab) return
    setTabs((prev) => {
      const ids = prev.map((t) => t.tabId)
      const nextIds = moveTab(ids, activeTab, overTab)
      if (nextIds === ids) return prev
      const map = new Map(prev.map((t) => [t.tabId, t]))
      return nextIds.map((id) => map.get(id)).filter((t): t is TabEntry => Boolean(t))
      // v2.0 B-4: 탭 순서 저장(window.api.terminal.reorder)은 세션 단위 API 라 split 이후엔
      // 의미가 없다 — 영속화는 B-5 스냅샷(tree 순서 포함)으로 이관되며 이번 라운드는 세션 내
      // state 로만 유지한다(shouldPersistLayout 게이트 참조).
    })
    notifyLayoutChanged()
  }, [notifyLayoutChanged])

  const handleDragCancel = useCallback(() => setDragState(null), [])

  // missed-end fallback — Electron 에서 pointerup/blur/visibilitychange 를 dnd-kit 이 놓쳐도
  // 인디케이터가 남지 않게 강제로 드래그 상태를 정리한다.
  useEffect(() => {
    const clear = (): void => setDragState(null)
    window.addEventListener('pointerup', clear)
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', clear)
    return () => {
      window.removeEventListener('pointerup', clear)
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', clear)
    }
  }, [])

  const tabIds = tabs.map((t) => t.tabId)
  const insertionIndex = dragState?.overId
    ? computeInsertionIndex(tabIds, dragState.activeId, dragState.overId)
    : -1

  const announcements: Announcements = {
    onDragStart: ({ active }) => `탭 "${tabName(tabs, active.id)}" 이동을 시작합니다.`,
    onDragOver: ({ active, over }) =>
      over
        ? `탭 "${tabName(tabs, active.id)}" 을(를) "${tabName(tabs, over.id)}" 위치로 이동 중입니다.`
        : `탭 "${tabName(tabs, active.id)}" 이(가) 이동 가능한 위치를 벗어났습니다.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `탭 "${tabName(tabs, active.id)}" 이(가) "${tabName(tabs, over.id)}" 위치로 이동했습니다.`
        : '탭 이동이 취소되었습니다.',
    onDragCancel: ({ active }) => `탭 "${tabName(tabs, active.id)}" 이동이 취소되었습니다.`
  }

  return (
    <div className="flex h-full w-full min-h-0 overflow-hidden">
    <div className="flex flex-col h-full min-w-0 flex-1 bg-bg-primary">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{ announcements }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={endDrag}
        onDragCancel={handleDragCancel}
      >
        <div className="ds-tabbar split">
          <div className="ds-tabbar-scroll">
            <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
              {tabs.map((tab, idx) => (
                <Fragment key={tab.tabId}>
                  {insertionIndex === idx && <TabDropIndicator />}
                  <SortableTabLabel
                    tabId={tab.tabId}
                    name={tab.name}
                    kind={tab.kind ?? 'terminal'}
                    paneCount={isViewerTab(tab) ? 0 : collectLeafIds(tab.tree).length}
                    isActive={activeTabId === tab.tabId}
                    isExited={allPanesExited(tab)}
                    isDone={Object.values(tab.panes).some((pane) => doneSessions.has(pane.sessionId))}
                    onSelect={() => activateTab(tab.tabId)}
                    onClose={() => closeTabEntry(tab.tabId)}
                    onRename={(newName) => renameTab(tab.tabId, newName)}
                  />
                </Fragment>
              ))}
            </SortableContext>
            {insertionIndex === tabs.length && <TabDropIndicator />}
            <button onClick={() => createTab()}
              data-tour="terminal-new-tab"
              className="w-7 h-7 rounded flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover flex-shrink-0"
              title="새 터미널 (⌘T)">
              <Plus size={14} />
            </button>
          </div>
          <div className="flex items-center gap-2 flex-none pl-2">
            {/* 분할은 자주 쓰는데 단축키를 모르면 길이 없다 — 탭바에 버튼으로 둔다.
                아이콘 둘만 두면 무슨 버튼인지 안 읽혀서(실제 제보) 묶음 라벨을 앞에 붙인다.
                방향은 아이콘이 맡는다 — 라벨을 셋으로 늘리면 좁은 창에서 탭 영역을 다 먹는다. */}
            <div
              role="group"
              aria-label="pane 분할"
              data-tour="terminal-split"
              className="flex items-center h-7 rounded-[7px] border border-bg-border text-text-secondary overflow-hidden"
            >
              <span className={`pl-2.5 pr-2 text-[calc(11.5px_*_var(--app-font-scale,1))] font-medium select-none ${activeTerminalTab ? '' : 'opacity-40'}`}>
                분할
              </span>
              <button
                onClick={() => void splitFocusedPane('row')}
                disabled={!activeTerminalTab}
                className="w-7 h-7 flex items-center justify-center border-l border-bg-border hover:text-text-primary hover:bg-bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent"
                title="오른쪽으로 분할 (⌘D)"
                aria-label="오른쪽으로 분할"
              >
                <Columns2 size={13} />
              </button>
              <button
                onClick={() => void splitFocusedPane('column')}
                disabled={!activeTerminalTab}
                className="w-7 h-7 flex items-center justify-center border-l border-bg-border hover:text-text-primary hover:bg-bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent"
                title="아래로 분할 (⌘⇧D)"
                aria-label="아래로 분할"
              >
                <Rows2 size={13} />
              </button>
            </div>
            {/* 지금 터미널이 있는 폴더(대개 업무 워크트리)를 IDE 에서 바로 연다.
                감지된 에디터 이름까지 라벨에 드러낸다 — "↗" 아이콘만으로는 새 창/공유/열기가 구분 안 된다. */}
            {focusedCwd && (
              <span data-tour="terminal-open-editor" className="flex-none">
                <OpenInEditorButton
                  path={focusedCwd}
                  className="flex items-center gap-1.5 h-7 px-2.5 rounded-[7px] border border-bg-border text-[calc(11.5px_*_var(--app-font-scale,1))] font-medium text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors whitespace-nowrap"
                />
              </span>
            )}
            <button onClick={toggleDrawer}
              data-tour="terminal-drawer-toggle"
              aria-pressed={drawerOpen}
              className={`flex items-center gap-1.5 h-7 px-2.5 rounded-[7px] text-[calc(11.5px_*_var(--app-font-scale,1))] font-medium border transition-colors ${
                drawerOpen
                  ? 'text-text-primary bg-bg-active border-bg-border-strong'
                  : 'text-text-secondary border-bg-border hover:text-text-primary hover:bg-bg-surface-hover'
              }`}
              title="작업 패널 (⌘⇧T)">
              <PanelRight size={13} /> 작업 패널
            </button>
            {tabs.length >= 3 && (
              <button onClick={closeAll}
                // 파괴적 동작은 hover 전에 이미 붉어야 한다 — 색이 hover 에서야 나타나면 실수 클릭을 못 막는다.
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[calc(11px_*_var(--app-font-scale,1))] text-c-red-fg hover:bg-c-red-bg transition-colors"
                title={`${tabs.length}개 터미널 모두 닫기`}>
                <Trash2 size={10} /> 모두 닫기 ({tabs.length})
              </button>
            )}
          </div>
        </div>
      </DndContext>

      {/*
        드롭 핸들러는 여기(포털의 React 조상)에 붙인다. xterm 은 `createPortal` 로 렌더되는데
        React 이벤트는 DOM 트리가 아니라 **React 트리**를 따라 전파된다 — 탭 div 는 포털의
        조상이 아니라 형제라서, 터미널 위에서 발생한 드래그 이벤트가 거기까지 오지 않는다.
        (이것 때문에 업무를 터미널에 놓아도 아무 반응이 없었다)
      */}
      <div
        className="flex-1 relative"
        onDragOver={onTaskDragOver}
        onDragLeave={onTaskDragLeave}
        onDrop={(e) => void onTaskDrop(e)}
      >
        {/* v2.0 B-4: xterm 은 트리 밖에서 산다 — 모든 탭의 leaf 를 leafId 키로 한 번씩만 portal 로
            붙인다. 트리 모양이 바뀌어도 이 목록은 collectLeafIds 순서로만 바뀌므로 TerminalPane 이
            리마운트되지 않는다(ADR-v2-terminal-p2-02 §4, 함정 #8). */}
        {tabs.flatMap((tab) => {
          const leafIds = collectLeafIds(tab.tree)
          // 분할하지 않은 탭은 "어느 pane 이 활성인지" 가 자명하므로 포커스 링/dim 을 그리지 않는다.
          const isSplit = leafIds.length > 1
          return leafIds.map((leafId) => {
          const pane = tab.panes[leafId]
          if (!pane) return null
          const visible = tab.tabId === activeTabId
          const focused = visible && tab.focusedLeafId === leafId
          return createPortal(
            <TerminalPane
              key={leafId}
              ref={getRefCallback(leafId)}
              sessionId={pane.sessionId}
              isVisible={visible}
              isFocused={focused}
              showFocusRing={isSplit}
              onFocusRequest={() => setFocusedLeaf(tab.tabId, leafId)}
              restore={pane.restoreSnapshot}
              exitInfo={pane.exitInfo}
              onRequestClose={() => closeLeafInTab(tab.tabId, leafId)}
              tabId={tab.tabId}
              leafId={leafId}
              paneGeneration={pane.generation}
              getCurrentPasteTarget={getCurrentPasteTarget}
              suspendAutoResize={isDividerDragging}
              rendererSetting={rendererSetting}
              onWebglUnavailable={handleWebglUnavailable}
              onTitleChange={focused ? (title) => applyAutoName(tab.tabId, title) : undefined}
              onCwdChange={(cwd) => updatePaneCwd(tab.tabId, leafId, cwd)}
              onOpenPath={handleTerminalPathOpen}
            />,
            getOrCreateHost(leafId)
          )
          })
        })}

        {tabs.length === 0 ? (
          <TerminalEmptyState
            onCreateTab={() => void createTab()}
            onOpenTaskDrawer={() => { if (!drawerOpen) toggleDrawer() }}
            drawerOpen={drawerOpen}
          />
        ) : (
          tabs.map((tab) => (
            <div
              key={tab.tabId}
              className={`absolute inset-0 ${tab.tabId === activeTabId ? 'z-10' : 'z-0 pointer-events-none invisible'}`}
            >
              {tab.kind === 'diff' && tab.diff ? (
                <DiffView request={tab.diff} />
              ) : tab.kind === 'file' && tab.file ? (
                <FileView request={tab.file} />
              ) : (
                <SplitLayout
                  tree={tab.tree}
                  getHost={getOrCreateHost}
                  getHandle={getHandle}
                  onRatioCommit={(path, ratio) => commitRatio(tab.tabId, path, ratio)}
                  onDragActiveChange={setIsDividerDragging}
                />
              )}
            </div>
          ))
        )}
        {/* 탭이 있든 없든 같은 자리에 뜬다 — 빈 화면에서도 놓을 수 있다는 걸 보여야 한다. */}
        {dropHint && (
          <div className="absolute inset-2 z-20 pointer-events-none rounded-lg border-2 border-dashed border-bg-border-strong bg-black/10 flex items-center justify-center">
            <span className="px-3 py-1.5 rounded-md bg-bg-surface border border-bg-border text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-primary shadow">
              {dropHint}
            </span>
          </div>
        )}
        {dropBusy && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3.5 py-2 rounded-lg bg-bg-surface-raised border border-bg-border-strong shadow-xl">
            <Loader2 size={13} className="animate-spin text-brand-terminal flex-none" />
            <span className="flex flex-col">
              <span className="text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-primary">
                {dropBusy.label}
              </span>
              {dropBusy.where && (
                <span className="font-mono text-[calc(9.5px_*_var(--app-font-scale,1))] text-text-tertiary">
                  {dropBusy.where}
                </span>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
    {drawerOpen && (
      <SideDrawer
        tab={drawerTab}
        onTabChange={changeDrawerTab}
        onClose={toggleDrawer}
        width={drawerWidth}
        onWidthChange={setDrawerWidth}
        onWidthCommit={(w) => void window.api.settings.set('terminalDrawerWidth', w)}
        subheader={
          drawerTab === 'tasks' ? undefined : (
            <RepoPicker
              repo={scmRepo}
              pinned={pinned}
              recents={recents}
              onPin={pin}
              autoCwd={focusedCwd}
            />
          )
        }
      >
        {drawerTab === 'tasks' ? (
          <TaskDrawer onRunInTerminal={runTaskInFocusedPane} />
        ) : !scmRepo ? (
          <DrawerRepoEmptyState tab={drawerTab} cwd={focusedCwd ?? undefined} resolving={repoResolving} />
        ) : drawerTab === 'changes' ? (
          <SourceControlPanel repoPath={scmRepo} onOpenDiff={openDiffTab} onRepoChanged={notifyRepoChanged} />
        ) : drawerTab === 'branchDiff' ? (
          <BranchDiffPanel repoPath={scmRepo} onOpenDiff={openDiffTab} />
        ) : drawerTab === 'history' ? (
          <GitHistoryPanel repoPath={scmRepo} onOpenDiff={openDiffTab} />
        ) : (
          <BranchesPanel
            repoPath={scmRepo}
            onOpenInTerminal={(cwd) => void createTab({ cwd })}
            onRepoChanged={notifyRepoChanged}
          />
        )}
      </SideDrawer>
    )}
    {repoChoice && (
      <RepoChoiceModal
        taskSubject={repoChoice.task.subject}
        candidates={repoChoice.candidates}
        onCancel={() => setRepoChoice(null)}
        onChoose={(candidate) => {
          const choice = repoChoice
          setRepoChoice(null)
          void (async () => {
            const plan = planFromCandidate(candidate, choice.currentCwd)
            const target = await paneForPlan(
              choice.pane,
              await withWorktree(plan, choice.task, choice.settings, choice.links, choice.currentCwd)
            )
            await executeDropPlan(choice.task, target.pane, target.plan, choice.settings)
          })()
        }}
      />
    )}
    </div>
  )
}

function tabName(tabs: TabEntry[], id: string | number): string {
  return tabs.find((t) => t.tabId === String(id))?.name || String(id)
}

/** 드래그 중 activeId 를 overId 위치에 놓았을 때의 삽입 인덱스 — 탭 배열 자체는 바꾸지 않고 미리보기만 계산한다. */
function computeInsertionIndex(ids: string[], activeId: string, overId: string): number {
  const activeIndex = ids.indexOf(activeId)
  const overIndex = ids.indexOf(overId)
  if (activeIndex === -1 || overIndex === -1) return -1
  return activeIndex < overIndex ? overIndex + 1 : overIndex
}

/** 삽입 위치를 나타내는 2px 세로 인디케이터 — 탭바 높이 전체를 채운다. */
function TabDropIndicator(): JSX.Element {
  return <div aria-hidden className="self-stretch w-0.5 rounded-full bg-text-secondary flex-shrink-0" />
}

/** useSortable 배선을 TabLabel 에 연결하는 얇은 래퍼 — transform/transition 은 적용하지 않는다. */
function SortableTabLabel(props: {
  tabId: string
  name: string
  kind: 'terminal' | 'diff' | 'file'
  paneCount: number
  isActive: boolean
  isExited: boolean
  isDone: boolean
  onSelect: () => void
  onClose: () => void
  onRename: (newName: string) => void
}): JSX.Element {
  const { setNodeRef, attributes, listeners, isDragging } = useSortable({ id: props.tabId })
  return (
    <TabLabel
      {...props}
      dragRef={setNodeRef}
      dragAttributes={attributes}
      dragListeners={listeners}
      isDragging={isDragging}
    />
  )
}

/** 터미널 탭 라벨 — 더블클릭으로 인라인 이름 변경, 드래그로 순서 변경
 *  · 클릭: 탭 활성화
 *  · 더블클릭 (또는 우측 ✏️ 버튼): 인라인 텍스트 편집
 *  · Enter: 저장 / Esc: 취소 / Blur: 저장
 *  · 12px 이상 드래그: 순서 변경 (SortableTabLabel 이 배선)
 *  · v2.0 B-4: 2개 이상 pane 이면 `⫿N` 배지가 뜬다(목업 .panecnt)
 */
function TabLabel({
  name,
  kind,
  paneCount,
  isActive,
  isExited,
  isDone,
  onSelect,
  onClose,
  onRename,
  dragRef,
  dragAttributes,
  dragListeners,
  isDragging
}: {
  tabId: string
  name: string
  kind: 'terminal' | 'diff' | 'file'
  paneCount: number
  isActive: boolean
  isExited: boolean
  /** claude 가 내 차례를 넘긴 탭 — 점으로 표시한다 */
  isDone: boolean
  onSelect: () => void
  onClose: () => void
  onRename: (newName: string) => void
  dragRef?: (node: HTMLElement | null) => void
  dragAttributes?: DraggableAttributes
  dragListeners?: DraggableSyntheticListeners
  isDragging?: boolean
}): JSX.Element {
  // diff/file 탭은 파일명이 곧 이름이라 사용자가 바꿀 대상이 아니다.
  const isViewer = kind !== 'terminal'
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!editing) setDraft(name) }, [name, editing])
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const commit = (): void => {
    const v = draft.trim()
    if (v && v !== name) onRename(v)
    setEditing(false)
  }
  const cancel = (): void => {
    setDraft(name)
    setEditing(false)
  }

  return (
    <div
      ref={dragRef}
      {...dragAttributes}
      {...dragListeners}
      onClick={onSelect}
      onDoubleClick={(e) => { if (isViewer) return; e.stopPropagation(); setEditing(true) }}
      className={`ds-tab group ${isActive ? 'active' : ''} ${isExited || isDragging ? 'opacity-50' : ''}`}
      title={isExited ? '종료됨' : kind === 'diff' ? '파일 비교' : kind === 'file' ? '파일' : undefined}
    >
      {kind === 'diff' ? <FileDiff size={11} className="text-text-tertiary" />
        : kind === 'file' ? <FileText size={11} className="text-text-tertiary" />
        : <Terminal size={11} />}
      {isDone && !isActive && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-brand-terminal flex-none"
          title="claude 가 멈췄습니다 — 확인이 필요합니다"
        />
      )}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            else if (e.key === 'Escape') { e.preventDefault(); cancel() }
            else if (e.nativeEvent.isComposing) return
            e.stopPropagation()
          }}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="font-mono text-[calc(11px_*_var(--app-font-scale,1))] bg-transparent border border-bg-border-light rounded px-1 outline-none focus:border-bg-border-strong"
          style={{ minWidth: 80, maxWidth: 200 }}
        />
      ) : (
        <>
          <span className="font-mono truncate max-w-[140px]" title="더블클릭하여 이름 변경">{name}</span>
          {paneCount >= 2 && (
            <span
              className="text-[calc(9.5px_*_var(--app-font-scale,1))] font-semibold text-text-secondary bg-bg-hover border border-bg-border-light px-1.5 rounded-full flex-shrink-0"
              title={`분할된 pane ${paneCount}개`}
            >
              ⫿{paneCount}
            </span>
          )}
          {isExited && (
            <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary flex-shrink-0">종료됨</span>
          )}
          {!isViewer && (
            <button onClick={(e) => { e.stopPropagation(); setEditing(true) }}
              onPointerDown={(e) => e.stopPropagation()}
              className="text-text-tertiary hover:text-text-primary ml-0.5"
              title="이름 변경">
              <Pencil size={10} />
            </button>
          )}
        </>
      )}
      <button onClick={(e) => { e.stopPropagation(); onClose() }}
        onPointerDown={(e) => e.stopPropagation()}
        className="text-text-tertiary hover:text-c-red-fg ml-0.5"
        title="탭 닫기">
        <X size={11} />
      </button>
    </div>
  )
}

export default TerminalView
