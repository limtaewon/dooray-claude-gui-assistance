import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, X, Terminal } from 'lucide-react'
import TerminalPane from './TerminalPane'
import type { TerminalSession } from '../../../../shared/types/terminal'

interface SessionWithOutput {
  session: TerminalSession
  savedOutput?: string  // 복원된 출력
}

function TerminalView(): JSX.Element {
  const [entries, setEntries] = useState<SessionWithOutput[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const restored = useRef(false)

  // 앱 시작 시 저장된 세션 복원
  useEffect(() => {
    if (restored.current) return
    restored.current = true

    window.api.terminal.restoreSaved().then(async (saved) => {
      if (!saved || saved.length === 0) return
      // 저장된 세션마다 새 pty 생성 + 출력 복원
      for (const s of saved) {
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

  const createSession = useCallback(async (cwd?: string) => {
    const session = await window.api.terminal.create(cwd ? { cwd } : {})
    const label = cwd ? (cwd.split('/').pop() || '~') : '~'
    setEntries((prev) => [...prev, { session: { ...session, name: label } }])
    setActiveId(session.id)
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

  // 외부에서 터미널 생성 요청 수신 (BranchWorkspace 등)
  useEffect(() => {
    const handler = (e: Event): void => {
      const { cwd } = (e as CustomEvent).detail || {}
      createSession(cwd)
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
  }, [activeId, createSession, closeSession])

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      <div className="flex items-center h-9 bg-bg-surface border-b border-bg-border px-2 gap-1 overflow-x-auto flex-shrink-0">
        {entries.map(({ session }) => (
          <div key={session.id} onClick={() => setActiveId(session.id)}
            className={`flex items-center gap-1.5 px-3 h-7 rounded text-xs cursor-pointer transition-colors group ${
              activeId === session.id ? 'bg-clover-blue text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
            }`}>
            <Terminal size={11} />
            <span className="font-mono truncate max-w-[140px]">{session.name}</span>
            <button onClick={(e) => { e.stopPropagation(); closeSession(session.id) }}
              className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-300 ml-1">
              <X size={11} />
            </button>
          </div>
        ))}
        <button onClick={() => createSession()}
          className="w-7 h-7 rounded flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover"
          title="새 터미널 (⌘T)">
          <Plus size={14} />
        </button>
        <span className="text-[9px] text-text-tertiary ml-1">⌘T 새탭 · ⌘W 닫기</span>
      </div>

      <div className="flex-1 relative">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Terminal size={48} className="text-text-tertiary" />
            <div className="text-center">
              <p className="text-sm text-text-primary font-medium mb-1">터미널</p>
              <p className="text-xs text-text-secondary mb-4">새 터미널 세션을 시작하세요</p>
            </div>
            <button onClick={() => createSession()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-clover-blue text-white text-sm hover:bg-clover-blue/80">
              <Terminal size={14} /> 새 터미널 열기
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

export default TerminalView
