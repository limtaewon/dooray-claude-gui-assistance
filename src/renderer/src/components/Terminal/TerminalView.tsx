import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
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
import { TabPointerSensor, TAB_DRAG_ACTIVATION_DISTANCE_PX } from './tabDragSensor'
import { moveTab, pickNextActiveTab, pushMru } from './tabOrder'
import type { TerminalExitPayload, TerminalSession } from '../../../../shared/types/terminal'

interface SessionWithOutput {
  session: TerminalSession
  savedOutput?: string  // 복원된 출력
  cwd?: string
  /** v2.0 B-1: PTY 종료 정보 — onExit 로 수신되면 채워지고 이후 덮어쓰지 않는다(렌더러측 at-most-once). */
  exitInfo?: TerminalExitPayload | null
}

function TerminalView(): JSX.Element {
  const [entries, setEntries] = useState<SessionWithOutput[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const restored = useRef(false)
  /** 탭 닫기 시 다음 활성 탭 선택에 쓰는 최근 사용 스택 (세션 수명 동안만 유지, 영속화 안 함 — ADR-04). */
  const mruRef = useRef<string[]>([])
  /** 드래그 중 삽입 인디케이터 위치 계산용 — 탭 자체는 움직이지 않는다 (ADR-04). */
  const [dragState, setDragState] = useState<{ activeId: string; overId: string | null } | null>(null)

  const activateTab = useCallback((id: string) => {
    setActiveId(id)
    mruRef.current = pushMru(mruRef.current, id)
  }, [])

  // 앱 시작 시 저장된 세션 복원 (최대 5개까지만 — 누적 방지)
  useEffect(() => {
    if (restored.current) return
    restored.current = true

    window.api.terminal.restoreSaved().then(async (saved) => {
      if (!saved || saved.length === 0) return
      const limited = saved.slice(-5) // 최근 5개만 복원
      for (const s of limited) {
        try {
          const session = await window.api.terminal.create({ cwd: s.meta.cwd || undefined })
          const restoredName = s.meta.name || '~'
          // Why: 새로 만든 세션은 main 측에서 기본 이름을 갖는다. 사용자가 지정했던 이름을
          // 다시 push 해서 다음 종료 시 exportSessions 가 제대로 된 이름을 저장하게 함.
          if (restoredName) {
            void window.api.terminal.rename(session.id, restoredName)
          }
          setEntries((prev) => [...prev, {
            session: { ...session, name: restoredName },
            savedOutput: s.output
          }])
          setActiveId((prev) => {
            if (prev) return prev
            mruRef.current = pushMru(mruRef.current, session.id)
            return session.id
          })
        } catch {}
      }
    })
  }, [])

  // v2.0 B-1: PTY 종료 통지 구독 — 자기 entries 에 있는 id 만 반영, 이미 exitInfo 있으면 덮지 않는다.
  useEffect(() => {
    const off = window.api.terminal.onExit((payload) => {
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.session.id === payload.id)
        if (idx === -1 || prev[idx].exitInfo) return prev
        const next = prev.slice()
        next[idx] = { ...next[idx], exitInfo: payload }
        return next
      })
    })
    return off
  }, [])

  const createSession = useCallback(async (opts?: { cwd?: string; initialCommand?: string }) => {
    const cwd = opts?.cwd
    const createOpts: { cwd?: string; command?: string; args?: string[] } = {}
    if (cwd) createOpts.cwd = cwd
    const session = await window.api.terminal.create(createOpts)
    const base = cwd ? (cwd.split('/').pop() || '~') : '~'
    setEntries((prev) => [...prev, { session: { ...session, name: base } }])
    activateTab(session.id)
    // 셸이 프롬프트 띄울 때까지 잠깐 기다린 뒤 자동 명령 입력 (Claude 채팅의 "터미널" 버튼 등)
    if (opts?.initialCommand) {
      const cmd = opts.initialCommand.endsWith('\n') ? opts.initialCommand : opts.initialCommand + '\n'
      setTimeout(() => {
        try { window.api.terminal.input(session.id, cmd) } catch { /* ok */ }
      }, 350)
    }
  }, [activateTab])

  const closeSession = useCallback(
    async (id: string) => {
      await window.api.terminal.kill(id)
      mruRef.current = mruRef.current.filter((x) => x !== id)
      setEntries((prev) => {
        const order = prev.map((e) => e.session.id)
        const next = prev.filter((e) => e.session.id !== id)
        if (activeId === id) {
          setActiveId(pickNextActiveTab(order, id, mruRef.current))
        }
        return next
      })
    },
    [activeId]
  )

  const closeAll = useCallback(async () => {
    if (entries.length === 0) return
    if (!window.confirm(`${entries.length}개 터미널을 모두 닫을까요?`)) return
    for (const e of entries) {
      try { await window.api.terminal.kill(e.session.id) } catch {}
    }
    mruRef.current = []
    setEntries([])
    setActiveId(null)
  }, [entries])

  // 외부에서 터미널 생성 요청 수신 (BranchWorkspace, Claude 채팅 등)
  useEffect(() => {
    const handler = (e: Event): void => {
      const { cwd, initialCommand } = (e as CustomEvent).detail || {}
      createSession({ cwd, initialCommand })
    }
    window.addEventListener('create-terminal', handler)
    return () => window.removeEventListener('create-terminal', handler)
  }, [createSession])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      // Mac Cmd / Windows·Linux Ctrl 양쪽 수용
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 't') { e.preventDefault(); createSession() }
      if (mod && e.key === 'w') { e.preventDefault(); if (activeId) closeSession(activeId) }
      // Cmd/Ctrl + 1~9 로 탭 전환 (현재 탭 순서 기준)
      if (mod && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const idx = parseInt(e.key) - 1
        if (idx < entries.length) activateTab(entries[idx].session.id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeId, createSession, closeSession, entries, activateTab])

  // v2.0 B-8: 탭 드래그 reorder — 12px 이동 전에는 활성화되지 않는 커스텀 센서 (더블클릭 rename 보호, ADR-04)
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
    const activeTabId = String(e.active.id)
    const overTabId = e.over ? String(e.over.id) : null
    if (!overTabId || activeTabId === overTabId) return
    setEntries((prev) => {
      const ids = prev.map((en) => en.session.id)
      const nextIds = moveTab(ids, activeTabId, overTabId)
      if (nextIds === ids) return prev
      const map = new Map(prev.map((en) => [en.session.id, en]))
      const reordered = nextIds.map((id) => map.get(id)).filter((e): e is SessionWithOutput => Boolean(e))
      window.api.terminal.reorder(nextIds)
      return reordered
    })
  }, [])

  const handleDragCancel = useCallback(() => setDragState(null), [])

  // missed-end fallback — Electron 에서 pointerup/blur/visibilitychange 를 dnd-kit 이 놓쳐도
  // 인디케이터가 남지 않게 강제로 드래그 상태를 정리한다 (ADR-04).
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

  const tabIds = entries.map((e) => e.session.id)
  const insertionIndex = dragState?.overId
    ? computeInsertionIndex(tabIds, dragState.activeId, dragState.overId)
    : -1

  const announcements: Announcements = {
    onDragStart: ({ active }) => `탭 "${tabName(entries, active.id)}" 이동을 시작합니다.`,
    onDragOver: ({ active, over }) =>
      over
        ? `탭 "${tabName(entries, active.id)}" 을(를) "${tabName(entries, over.id)}" 위치로 이동 중입니다.`
        : `탭 "${tabName(entries, active.id)}" 이(가) 이동 가능한 위치를 벗어났습니다.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `탭 "${tabName(entries, active.id)}" 이(가) "${tabName(entries, over.id)}" 위치로 이동했습니다.`
        : '탭 이동이 취소되었습니다.',
    onDragCancel: ({ active }) => `탭 "${tabName(entries, active.id)}" 이동이 취소되었습니다.`
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
            {entries.map(({ session, exitInfo }, idx) => (
              <Fragment key={session.id}>
                {insertionIndex === idx && <TabDropIndicator />}
                <SortableTabLabel
                  session={session}
                  isActive={activeId === session.id}
                  isExited={Boolean(exitInfo)}
                  onSelect={() => activateTab(session.id)}
                  onClose={() => closeSession(session.id)}
                  onRename={(newName) => {
                    setEntries((prev) => prev.map((e) =>
                      e.session.id === session.id ? { ...e, session: { ...e.session, name: newName } } : e
                    ))
                    void window.api.terminal.rename(session.id, newName)
                  }}
                />
              </Fragment>
            ))}
          </SortableContext>
          {insertionIndex === entries.length && <TabDropIndicator />}
          <button onClick={() => createSession()}
            className="w-7 h-7 rounded flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover flex-shrink-0"
            title="새 터미널 (⌘T)">
            <Plus size={14} />
          </button>
          <span className="text-[calc(9px_*_var(--app-font-scale,1))] text-text-tertiary ml-1 flex-shrink-0">⌘T 새탭 · ⌘W 닫기 · 탭 드래그로 순서 변경</span>
          {entries.length >= 3 && (
            <button onClick={closeAll}
              className="ml-auto flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title={`${entries.length}개 터미널 모두 닫기`}>
              <Trash2 size={10} /> 모두 닫기 ({entries.length})
            </button>
          )}
        </div>
      </DndContext>

      <div className="flex-1 relative">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Terminal size={48} className="text-text-tertiary" />
            <div className="text-center">
              <p className="text-sm text-text-primary font-medium mb-1">터미널</p>
              <p className="text-xs text-text-secondary mb-4">셸 세션을 시작하세요</p>
            </div>
            <button onClick={() => createSession()}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-clauday-blue text-white text-sm hover:bg-clauday-blue/80 transition-colors">
              <Terminal size={14} /> 새 터미널
            </button>
            <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">⌘T로 언제든 새 탭을 열 수 있습니다</p>
          </div>
        ) : (
          entries.map(({ session, savedOutput, exitInfo }) => (
            <TerminalPane
              key={session.id}
              sessionId={session.id}
              isActive={session.id === activeId}
              initialOutput={savedOutput}
              exitInfo={exitInfo}
              onRequestClose={() => closeSession(session.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function tabName(entries: SessionWithOutput[], id: string | number): string {
  return entries.find((e) => e.session.id === String(id))?.session.name || String(id)
}

/** 드래그 중 activeId 를 overId 위치에 놓았을 때의 삽입 인덱스 — 탭 배열 자체는 바꾸지 않고 미리보기만 계산한다. */
function computeInsertionIndex(ids: string[], activeId: string, overId: string): number {
  const activeIndex = ids.indexOf(activeId)
  const overIndex = ids.indexOf(overId)
  if (activeIndex === -1 || overIndex === -1) return -1
  return activeIndex < overIndex ? overIndex + 1 : overIndex
}

/** 삽입 위치를 나타내는 2px 세로 인디케이터 — 탭바 높이 전체를 채운다 (ADR-04). */
function TabDropIndicator(): JSX.Element {
  return <div aria-hidden className="self-stretch w-0.5 rounded-full bg-clauday-blue flex-shrink-0" />
}

/** useSortable 배선을 TabLabel 에 연결하는 얇은 래퍼 — transform/transition 은 적용하지 않는다 (ADR-04). */
function SortableTabLabel(props: {
  session: TerminalSession
  isActive: boolean
  isExited: boolean
  onSelect: () => void
  onClose: () => void
  onRename: (newName: string) => void
}): JSX.Element {
  const { setNodeRef, attributes, listeners, isDragging } = useSortable({ id: props.session.id })
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
 */
function TabLabel({
  session,
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
  session: TerminalSession
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
  const [draft, setDraft] = useState(session.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!editing) setDraft(session.name) }, [session.name, editing])
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const commit = (): void => {
    const v = draft.trim()
    if (v && v !== session.name) onRename(v)
    setEditing(false)
  }
  const cancel = (): void => {
    setDraft(session.name)
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
          <span className="font-mono truncate max-w-[140px]" title="더블클릭하여 이름 변경">{session.name}</span>
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
