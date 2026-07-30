import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X, Terminal, Trash2, Pencil } from 'lucide-react'
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
  neighborLeaf
} from './splitTree'
import type { SplitPath } from './splitTree'
import { resolveShortcut } from './terminalShortcuts'
import type { PasteToken } from './pasteTargetState'
import { TabPointerSensor, TAB_DRAG_ACTIVATION_DISTANCE_PX } from './tabDragSensor'
import { moveTab, pickNextActiveTab, pushMru } from './tabOrder'
import type {
  TerminalExitPayload,
  TerminalSession,
  SplitDirection,
  SplitNode
} from '../../../../shared/types/terminal'

/** leaf(pane) 1개의 런타임 바인딩 — 트리에는 안 들어가는 휘발값(v2.0 B-4, ADR-v2-terminal-p2-02 §3). */
interface PaneRuntime {
  sessionId: string
  cwd?: string
  /** v2.0 B-1: PTY 종료 정보 — onExit 로 채워지면 이후 덮어쓰지 않는다(at-most-once). */
  exitInfo?: TerminalExitPayload | null
  /** v2.0 B-5 복원 재바인딩에서 증가하는 카운터. B-4 에서는 항상 0(paste 타겟 검증용, ADR-02 §9). */
  generation: number
  /** 복원된 출력(레거시 경로) — B-5(R5-3)에서 SerializeAddon 기반으로 대체된다. */
  savedOutput?: string
}

/** 탭 1개 — split 트리 + 포커스 leaf + leaf 별 런타임(ADR-v2-terminal-p2-02 §3). */
interface TabEntry {
  tabId: string
  name: string
  tree: SplitNode
  focusedLeafId: string
  panes: Record<string, PaneRuntime>
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
  const restored = useRef(false)
  /** 탭 닫기 시 다음 활성 탭 선택에 쓰는 최근 사용 스택 (세션 수명 동안만 유지, 영속화 안 함). */
  const mruRef = useRef<string[]>([])
  /** 드래그 중 삽입 인디케이터 위치 계산용 — 탭 자체는 움직이지 않는다. */
  const [dragState, setDragState] = useState<{ activeId: string; overId: string | null } | null>(null)

  // v2.0 B-4 R4-7: 저장 게이트 자리 확보(ADR-v2-terminal-p2-03, 함정 #10) — B-5 가 복원 시작 시
  // 'restoring' 으로 바꾸고 완료되면 'ready' 로 되돌린다. 이번 라운드는 항상 'ready' 로 고정되고,
  // notifyLayoutChanged() 는 게이트만 확인하는 no-op 이다 — B-5 가 여기에 1초 debounce 저장을 연결한다.
  const [restorePhase] = useState<'idle' | 'restoring' | 'ready'>('ready')
  const shouldPersistLayout = restorePhase === 'ready'
  const notifyLayoutChanged = useCallback(() => {
    if (!shouldPersistLayout) return
    // TODO(B-5): 구조 변경 1초 debounce 저장 트리거를 여기에 연결한다.
  }, [shouldPersistLayout])

  // v2.0 B-4: xterm 은 트리 밖에 산다 — leafId 당 host div 하나(never remount), handle 은 forwardRef.
  const paneHostsRef = useRef<Map<string, HTMLDivElement>>(new Map())
  const paneHandlesRef = useRef<Map<string, TerminalPaneHandle>>(new Map())
  const paneRefCallbacksRef = useRef<Map<string, (handle: TerminalPaneHandle | null) => void>>(new Map())
  const tabsRef = useRef<TabEntry[]>(tabs)
  useEffect(() => { tabsRef.current = tabs }, [tabs])
  const activeTabIdRef = useRef<string | null>(activeTabId)
  useEffect(() => { activeTabIdRef.current = activeTabId }, [activeTabId])

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

  const setFocusedLeaf = useCallback((tabId: string, leafId: string) => {
    setTabs((prev) => prev.map((t) => (
      t.tabId === tabId && t.focusedLeafId !== leafId ? { ...t, focusedLeafId: leafId } : t
    )))
    if (activeTabIdRef.current !== tabId) activateTab(tabId)
  }, [activateTab])

  // 앱 시작 시 저장된 세션 복원 (최대 5개까지만 — 누적 방지). v2.0 B-5 가 스냅샷 기반으로 대체할 예정 —
  // 이번 라운드는 레거시 restoreSaved() 경로를 유지하되 tab/leaf 모델로만 감싼다.
  useEffect(() => {
    if (restored.current) return
    restored.current = true

    window.api.terminal.restoreSaved().then(async (saved) => {
      if (!saved || saved.length === 0) return
      const limited = saved.slice(-5)
      for (const s of limited) {
        try {
          const session = await window.api.terminal.create({ cwd: s.meta.cwd || undefined })
          const restoredName = s.meta.name || '~'
          if (restoredName) void window.api.terminal.rename(session.id, restoredName)
          const leafId = crypto.randomUUID()
          const tabId = crypto.randomUUID()
          setTabs((prev) => [...prev, {
            tabId,
            name: restoredName,
            tree: { type: 'leaf', leafId },
            focusedLeafId: leafId,
            panes: { [leafId]: { sessionId: session.id, cwd: s.meta.cwd, generation: 0, savedOutput: s.output } }
          }])
          setActiveTabId((prev) => {
            if (prev) return prev
            mruRef.current = pushMru(mruRef.current, tabId)
            return tabId
          })
        } catch { /* ok */ }
      }
    })
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

  const createTab = useCallback(async (opts?: { cwd?: string; initialCommand?: string }) => {
    const cwd = opts?.cwd
    const createOpts: { cwd?: string; command?: string; args?: string[] } = {}
    if (cwd) createOpts.cwd = cwd
    const session = await window.api.terminal.create(createOpts)
    const base = cwd ? (cwd.split('/').pop() || '~') : '~'
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
  }, [activateTab, notifyLayoutChanged])

  /** v2.0 B-4: split 은 항상 새 PTY — 현재 focused pane 의 cwd 를 상속한다(ADR-02 §7). */
  const splitFocusedPane = useCallback(async (direction: SplitDirection) => {
    const tabId = activeTabIdRef.current
    if (!tabId) return
    const tab = tabsRef.current.find((t) => t.tabId === tabId)
    if (!tab) return
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

  const renameTab = useCallback((tabId: string, name: string) => {
    setTabs((prev) => prev.map((t) => (t.tabId === tabId ? { ...t, name } : t)))
    const tab = tabsRef.current.find((t) => t.tabId === tabId)
    if (tab) {
      for (const pane of Object.values(tab.panes)) void window.api.terminal.rename(pane.sessionId, name)
    }
    notifyLayoutChanged()
  }, [notifyLayoutChanged])

  // 외부에서 터미널 생성 요청 수신 (BranchWorkspace, Claude 채팅 등)
  useEffect(() => {
    const handler = (e: Event): void => {
      const { cwd, initialCommand } = (e as CustomEvent).detail || {}
      void createTab({ cwd, initialCommand })
    }
    window.addEventListener('create-terminal', handler)
    return () => window.removeEventListener('create-terminal', handler)
  }, [createTab])

  // v2.0 B-4: ⌘D/⌘⇧D/⌥⌘화살표/⌘W/⌘T/⌘1~9 — 테이블 기반 판정(terminalShortcuts.ts) + `active` 가드.
  // Workstream D-1 이 레지스트리로 흡수하기 쉽도록 테이블은 별도 모듈에 둔다(ADR-02 §8).
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (!active) return
      const isMac = navigator.platform.toUpperCase().includes('MAC')
      const shortcut = resolveShortcut(e, isMac)
      if (shortcut) {
        switch (shortcut) {
          case 'newTab': e.preventDefault(); void createTab(); return
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
    <div className="flex flex-col h-full bg-bg-primary">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{ announcements }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={endDrag}
        onDragCancel={handleDragCancel}
      >
        <div className="ds-tabbar">
          <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
            {tabs.map((tab, idx) => (
              <Fragment key={tab.tabId}>
                {insertionIndex === idx && <TabDropIndicator />}
                <SortableTabLabel
                  tabId={tab.tabId}
                  name={tab.name}
                  paneCount={collectLeafIds(tab.tree).length}
                  isActive={activeTabId === tab.tabId}
                  isExited={allPanesExited(tab)}
                  onSelect={() => activateTab(tab.tabId)}
                  onClose={() => closeTabEntry(tab.tabId)}
                  onRename={(newName) => renameTab(tab.tabId, newName)}
                />
              </Fragment>
            ))}
          </SortableContext>
          {insertionIndex === tabs.length && <TabDropIndicator />}
          <button onClick={() => createTab()}
            className="w-7 h-7 rounded flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover flex-shrink-0"
            title="새 터미널 (⌘T)">
            <Plus size={14} />
          </button>
          <span className="text-[calc(9px_*_var(--app-font-scale,1))] text-text-tertiary ml-1 flex-shrink-0">⌘T 새탭 · ⌘D 오른쪽 분할 · ⌘⇧D 아래 분할 · ⌘W 닫기</span>
          {tabs.length >= 3 && (
            <button onClick={closeAll}
              className="ml-auto flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title={`${tabs.length}개 터미널 모두 닫기`}>
              <Trash2 size={10} /> 모두 닫기 ({tabs.length})
            </button>
          )}
        </div>
      </DndContext>

      <div className="flex-1 relative">
        {/* v2.0 B-4: xterm 은 트리 밖에서 산다 — 모든 탭의 leaf 를 leafId 키로 한 번씩만 portal 로
            붙인다. 트리 모양이 바뀌어도 이 목록은 collectLeafIds 순서로만 바뀌므로 TerminalPane 이
            리마운트되지 않는다(ADR-v2-terminal-p2-02 §4, 함정 #8). */}
        {tabs.flatMap((tab) => collectLeafIds(tab.tree).map((leafId) => {
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
              showFocusRing
              onFocusRequest={() => setFocusedLeaf(tab.tabId, leafId)}
              initialOutput={pane.savedOutput}
              exitInfo={pane.exitInfo}
              onRequestClose={() => closeLeafInTab(tab.tabId, leafId)}
              tabId={tab.tabId}
              leafId={leafId}
              paneGeneration={pane.generation}
              getCurrentPasteTarget={getCurrentPasteTarget}
              suspendAutoResize={isDividerDragging}
            />,
            getOrCreateHost(leafId)
          )
        }))}

        {tabs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Terminal size={48} className="text-text-tertiary" />
            <div className="text-center">
              <p className="text-sm text-text-primary font-medium mb-1">터미널</p>
              <p className="text-xs text-text-secondary mb-4">셸 세션을 시작하세요</p>
            </div>
            <button onClick={() => createTab()}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-clauday-blue text-white text-sm hover:bg-clauday-blue/80 transition-colors">
              <Terminal size={14} /> 새 터미널
            </button>
            <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">⌘T로 언제든 새 탭을 열 수 있습니다</p>
          </div>
        ) : (
          tabs.map((tab) => (
            <div
              key={tab.tabId}
              className={`absolute inset-0 ${tab.tabId === activeTabId ? 'z-10' : 'z-0 pointer-events-none invisible'}`}
            >
              <SplitLayout
                tree={tab.tree}
                getHost={getOrCreateHost}
                getHandle={getHandle}
                onRatioCommit={(path, ratio) => commitRatio(tab.tabId, path, ratio)}
                onDragActiveChange={setIsDividerDragging}
              />
            </div>
          ))
        )}
      </div>
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
  return <div aria-hidden className="self-stretch w-0.5 rounded-full bg-clauday-blue flex-shrink-0" />
}

/** useSortable 배선을 TabLabel 에 연결하는 얇은 래퍼 — transform/transition 은 적용하지 않는다. */
function SortableTabLabel(props: {
  tabId: string
  name: string
  paneCount: number
  isActive: boolean
  isExited: boolean
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
  paneCount,
  isActive,
  isExited,
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
  paneCount: number
  isActive: boolean
  isExited: boolean
  onSelect: () => void
  onClose: () => void
  onRename: (newName: string) => void
  dragRef?: (node: HTMLElement | null) => void
  dragAttributes?: DraggableAttributes
  dragListeners?: DraggableSyntheticListeners
  isDragging?: boolean
}): JSX.Element {
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
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
      className={`ds-tab group ${isActive ? 'active' : ''} ${isExited || isDragging ? 'opacity-50' : ''}`}
      title={isExited ? '종료됨' : undefined}
    >
      <Terminal size={11} />
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
          className="font-mono text-[calc(11px_*_var(--app-font-scale,1))] bg-transparent border border-clauday-blue/40 rounded px-1 outline-none focus:border-clauday-blue"
          style={{ minWidth: 80, maxWidth: 200 }}
        />
      ) : (
        <>
          <span className="font-mono truncate max-w-[140px]" title="더블클릭하여 이름 변경">{name}</span>
          {paneCount >= 2 && (
            <span
              className="text-[calc(9.5px_*_var(--app-font-scale,1))] font-semibold text-clauday-blue bg-clauday-blue/10 border border-clauday-blue/30 px-1.5 rounded-full flex-shrink-0"
              title={`분할된 pane ${paneCount}개`}
            >
              ⫿{paneCount}
            </span>
          )}
          {isExited && (
            <span className="text-[calc(9px_*_var(--app-font-scale,1))] text-text-tertiary flex-shrink-0">종료됨</span>
          )}
          <button onClick={(e) => { e.stopPropagation(); setEditing(true) }}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-text-tertiary hover:text-text-primary ml-0.5"
            title="이름 변경">
            <Pencil size={10} />
          </button>
        </>
      )}
      <button onClick={(e) => { e.stopPropagation(); onClose() }}
        onPointerDown={(e) => e.stopPropagation()}
        className="text-text-tertiary hover:text-red-300 ml-0.5"
        title="탭 닫기">
        <X size={11} />
      </button>
    </div>
  )
}

export default TerminalView
