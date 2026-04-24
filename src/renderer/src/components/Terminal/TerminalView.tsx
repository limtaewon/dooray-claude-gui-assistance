import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X, Terminal, Trash2, FolderOpen, ChevronDown, Sparkles } from 'lucide-react'
import TerminalPane from './TerminalPane'
import ClaudeChatPane from './ClaudeChatPane'
import type { TerminalSession } from '../../../../shared/types/terminal'

type ShellMode = 'default' | 'claude'

interface SessionWithOutput {
  session: TerminalSession
  savedOutput?: string  // 복원된 출력
  chatMode?: boolean    // true: ClaudeChatPane 사용, false: 기본 xterm
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

  const createSession = useCallback(async (opts?: { cwd?: string; mode?: ShellMode }) => {
    const cwd = opts?.cwd
    const mode = opts?.mode || 'default'
    // Claude Code 는 트랜스크립트 UI — terminal 세션 없이 가상 id 로만 관리
    if (mode === 'claude') {
      const virtualId = `claude-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const base = cwd ? (cwd.split('/').pop() || '~') : '~'
      setEntries((prev) => [...prev, {
        session: { id: virtualId, name: `claude ${base}`, pid: 0, cwd: cwd || '', createdAt: Date.now() },
        chatMode: true,
        cwd
      }])
      setActiveId(virtualId)
      return
    }
    const createOpts: { cwd?: string; command?: string; args?: string[] } = {}
    if (cwd) createOpts.cwd = cwd
    const session = await window.api.terminal.create(createOpts)
    const base = cwd ? (cwd.split('/').pop() || '~') : '~'
    setEntries((prev) => [...prev, { session: { ...session, name: base } }])
    setActiveId(session.id)
  }, [])

  const createSessionAtFolder = useCallback(async (mode: ShellMode = 'default') => {
    const folder = await window.api.dialog.selectFolder()
    if (!folder) return
    await createSession({ cwd: folder, mode })
  }, [createSession])

  const closeSession = useCallback(
    async (id: string) => {
      const entry = entries.find((e) => e.session.id === id)
      if (entry?.chatMode) {
        try { await window.api.claude.chatCancel(id) } catch {}
      } else {
        await window.api.terminal.kill(id)
      }
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
    [activeId, entries]
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

  // 외부에서 터미널 생성 요청 수신 (BranchWorkspace 등)
  useEffect(() => {
    const handler = (e: Event): void => {
      const { cwd, mode } = (e as CustomEvent).detail || {}
      createSession({ cwd, mode })
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
          <div key={session.id} onClick={() => setActiveId(session.id)}
            className={`ds-tab group ${activeId === session.id ? 'active' : ''}`}>
            <Terminal size={11} />
            <span className="font-mono truncate max-w-[140px]">{session.name}</span>
            <button onClick={(e) => { e.stopPropagation(); closeSession(session.id) }}
              className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-300 ml-1">
              <X size={11} />
            </button>
          </div>
        ))}
        <NewTerminalButton
          onDefault={() => createSession()}
          onClaude={() => createSession({ mode: 'claude' })}
          onFolder={() => createSessionAtFolder('default')}
          onFolderClaude={() => createSessionAtFolder('claude')}
        />
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
              <p className="text-xs text-text-secondary mb-4">일반 셸 또는 Claude Code를 시작하세요</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => createSession()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-clover-blue text-white text-sm hover:bg-clover-blue/80">
                <Terminal size={14} /> 일반 터미널
              </button>
              <button onClick={() => createSession({ mode: 'claude' })}
                className="ds-btn ai">
                <Sparkles size={14} /> Claude Code
              </button>
              <button onClick={() => createSessionAtFolder('default')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-surface border border-bg-border text-text-primary text-sm hover:bg-bg-surface-hover">
                <FolderOpen size={14} /> 폴더 선택
              </button>
            </div>
            <p className="text-[10px] text-text-tertiary">⌘T로 언제든 새 탭을 열 수 있습니다</p>
          </div>
        ) : (
          entries.map(({ session, savedOutput, chatMode, cwd }) => (
            chatMode ? (
              <ClaudeChatPane
                key={session.id}
                chatId={session.id}
                isActive={session.id === activeId}
                cwd={cwd}
              />
            ) : (
              <TerminalPane
                key={session.id}
                sessionId={session.id}
                isActive={session.id === activeId}
                initialOutput={savedOutput}
              />
            )
          ))
        )}
      </div>
    </div>
  )
}

/** 새 터미널 생성 버튼 + 드롭다운 (일반/Claude/폴더 선택)
 * 드롭다운은 portal로 document.body에 렌더 — 부모 탭바의 overflow-x-auto 클리핑 회피 */
function NewTerminalButton({ onDefault, onClaude, onFolder, onFolderClaude }: {
  onDefault: () => void
  onClaude: () => void
  onFolder: () => void
  onFolderClaude: () => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const chevronRef = useRef<HTMLButtonElement>(null)

  const toggle = (): void => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = chevronRef.current?.getBoundingClientRect()
    if (rect) {
      // 드롭다운 폭 224px(w-56). 화면 우측 경계 초과 시 버튼 오른쪽 정렬
      const width = 224
      const preferredLeft = rect.left
      const maxLeft = window.innerWidth - width - 8
      setPos({ left: Math.min(preferredLeft, Math.max(8, maxLeft)), top: rect.bottom + 4 })
    }
    setOpen(true)
  }

  return (
    <div className="flex items-center flex-shrink-0">
      <button onClick={onDefault}
        className="w-7 h-7 rounded-l flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover"
        title="새 일반 터미널 (⌘T)">
        <Plus size={14} />
      </button>
      <button ref={chevronRef} onClick={toggle}
        className="w-5 h-7 rounded-r flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover border-l border-bg-border/50"
        title="터미널 옵션">
        <ChevronDown size={11} />
      </button>
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div className="fixed w-56 bg-bg-surface border border-bg-border rounded-lg shadow-2xl z-[9999] py-1"
            style={{ left: pos.left, top: pos.top }}>
            <button onClick={() => { setOpen(false); onDefault() }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-text-primary hover:bg-bg-surface-hover text-left">
              <Terminal size={12} className="text-text-tertiary" />
              <span className="flex-1">일반 터미널</span>
              <span className="text-[9px] text-text-tertiary">⌘T</span>
            </button>
            <button onClick={() => { setOpen(false); onClaude() }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-text-primary hover:bg-bg-surface-hover text-left">
              <Sparkles size={12} className="text-clover-orange" />
              <span>Claude Code</span>
            </button>
            <div className="h-px bg-bg-border my-1" />
            <button onClick={() => { setOpen(false); onFolder() }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-text-primary hover:bg-bg-surface-hover text-left">
              <FolderOpen size={12} className="text-text-tertiary" />
              <span>폴더 선택 후 일반 터미널</span>
            </button>
            <button onClick={() => { setOpen(false); onFolderClaude() }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-text-primary hover:bg-bg-surface-hover text-left">
              <FolderOpen size={12} className="text-clover-orange" />
              <span>폴더 선택 후 Claude Code</span>
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

export default TerminalView
