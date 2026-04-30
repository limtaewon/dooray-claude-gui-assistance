import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, X, Terminal, Trash2, Pencil } from 'lucide-react'
import TerminalPane from './TerminalPane'
import type { TerminalSession } from '../../../../shared/types/terminal'

interface SessionWithOutput {
  session: TerminalSession
  savedOutput?: string  // 복원된 출력
  cwd?: string
}

function TerminalView(): JSX.Element {
  const [entries, setEntries] = useState<SessionWithOutput[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const restored = useRef(false)

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
          setEntries((prev) => [...prev, {
            session: { ...session, name: s.meta.name || '~' },
            savedOutput: s.output
          }])
          setActiveId((prev) => prev || session.id)
        } catch {}
      }
    })
  }, [])

  const createSession = useCallback(async (opts?: { cwd?: string; initialCommand?: string }) => {
    const cwd = opts?.cwd
    const createOpts: { cwd?: string; command?: string; args?: string[] } = {}
    if (cwd) createOpts.cwd = cwd
    const session = await window.api.terminal.create(createOpts)
    const base = cwd ? (cwd.split('/').pop() || '~') : '~'
    setEntries((prev) => [...prev, { session: { ...session, name: base } }])
    setActiveId(session.id)
    // 셸이 프롬프트 띄울 때까지 잠깐 기다린 뒤 자동 명령 입력 (Claude 채팅의 "터미널" 버튼 등)
    if (opts?.initialCommand) {
      const cmd = opts.initialCommand.endsWith('\n') ? opts.initialCommand : opts.initialCommand + '\n'
      setTimeout(() => {
        try { window.api.terminal.input(session.id, cmd) } catch { /* ok */ }
      }, 350)
    }
  }, [])

  const closeSession = useCallback(
    async (id: string) => {
      await window.api.terminal.kill(id)
      setEntries((prev) => {
        const next = prev.filter((e) => e.session.id !== id)
        if (activeId === id && next.length > 0) {
          setActiveId(next[next.length - 1].session.id)
        } else if (next.length === 0) {
          setActiveId(null)
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
      if (e.metaKey && e.key === 't') { e.preventDefault(); createSession() }
      if (e.metaKey && e.key === 'w') { e.preventDefault(); if (activeId) closeSession(activeId) }
      // Cmd+1~9로 탭 전환
      if (e.metaKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const idx = parseInt(e.key) - 1
        if (idx < entries.length) setActiveId(entries[idx].session.id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeId, createSession, closeSession, entries])

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      <div className="ds-tabbar">
        {entries.map(({ session }) => (
          <TabLabel
            key={session.id}
            session={session}
            isActive={activeId === session.id}
            onSelect={() => setActiveId(session.id)}
            onClose={() => closeSession(session.id)}
            onRename={(newName) => {
              setEntries((prev) => prev.map((e) =>
                e.session.id === session.id ? { ...e, session: { ...e.session, name: newName } } : e
              ))
              void window.api.terminal.rename(session.id, newName)
            }}
          />
        ))}
        <button onClick={() => createSession()}
          className="w-7 h-7 rounded flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover flex-shrink-0"
          title="새 터미널 (⌘T)">
          <Plus size={14} />
        </button>
        <span className="text-[9px] text-text-tertiary ml-1 flex-shrink-0">⌘T 새탭 · ⌘W 닫기</span>
        {entries.length >= 3 && (
          <button onClick={closeAll}
            className="ml-auto flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title={`${entries.length}개 터미널 모두 닫기`}>
            <Trash2 size={10} /> 모두 닫기 ({entries.length})
          </button>
        )}
      </div>

      <div className="flex-1 relative">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Terminal size={48} className="text-text-tertiary" />
            <div className="text-center">
              <p className="text-sm text-text-primary font-medium mb-1">터미널</p>
              <p className="text-xs text-text-secondary mb-4">셸 세션을 시작하세요</p>
            </div>
            <button onClick={() => createSession()}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-clover-blue text-white text-sm hover:bg-clover-blue/80 transition-colors">
              <Terminal size={14} /> 새 터미널
            </button>
            <p className="text-[10px] text-text-tertiary">⌘T로 언제든 새 탭을 열 수 있습니다</p>
          </div>
        ) : (
          entries.map(({ session, savedOutput }) => (
            <TerminalPane
              key={session.id}
              sessionId={session.id}
              isActive={session.id === activeId}
              initialOutput={savedOutput}
            />
          ))
        )}
      </div>
    </div>
  )
}

/** 터미널 탭 라벨 — 더블클릭으로 인라인 이름 변경
 *  · 클릭: 탭 활성화
 *  · 더블클릭 (또는 우측 ✏️ 버튼): 인라인 텍스트 편집
 *  · Enter: 저장 / Esc: 취소 / Blur: 저장
 */
function TabLabel({
  session,
  isActive,
  onSelect,
  onClose,
  onRename
}: {
  session: TerminalSession
  isActive: boolean
  onSelect: () => void
  onClose: () => void
  onRename: (newName: string) => void
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
    <div onClick={onSelect}
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
      className={`ds-tab group ${isActive ? 'active' : ''}`}>
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
          className="font-mono text-[11px] bg-transparent border border-clover-blue/40 rounded px-1 outline-none focus:border-clover-blue"
          style={{ minWidth: 80, maxWidth: 200 }}
        />
      ) : (
        <>
          <span className="font-mono truncate max-w-[140px]" title="더블클릭하여 이름 변경">{session.name}</span>
          <button onClick={(e) => { e.stopPropagation(); setEditing(true) }}
            className="text-text-tertiary hover:text-text-primary ml-0.5"
            title="이름 변경">
            <Pencil size={10} />
          </button>
        </>
      )}
      <button onClick={(e) => { e.stopPropagation(); onClose() }}
        className="text-text-tertiary hover:text-red-300 ml-0.5"
        title="탭 닫기">
        <X size={11} />
      </button>
    </div>
  )
}

export default TerminalView
