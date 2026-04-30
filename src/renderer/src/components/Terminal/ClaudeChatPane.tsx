import { useEffect, useRef, useState, useCallback } from 'react'
import { Send, Square, Sparkles, Wrench, RotateCcw, FolderOpen, History, Server, X, Check, AlertCircle, Paperclip, Image as ImageIcon, Cpu, TerminalSquare } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { ClaudeChatEvent } from '../../../../shared/types/claude-chat'

type ChatRole = 'user' | 'assistant' | 'tool'
interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  toolName?: string
  toolInput?: unknown
  isError?: boolean
}

interface ClaudeChatPaneProps {
  isActive: boolean
  cwd?: string
  chatId: string
  /** 외부(세션 사이드바)에서 세션을 지정해 들어왔을 때 — 로드해서 이어감 */
  initialSessionId?: string
  /** 헤더의 "이전 대화" 버튼 숨김 (외부 사이드바에 같은 기능 있을 때) */
  hideHistoryButton?: boolean
}

/**
 * Claude Code 대화형 트랜스크립트 패널.
 * xterm 대신 YOU/AI/TOOL 포맷 UI 로 렌더.
 * multi-turn 은 backend 에서 돌려주는 session_id 를 재전송해 이어가기.
 */
function ClaudeChatPane({ isActive, cwd, chatId, initialSessionId, hideHistoryButton }: ClaudeChatPaneProps): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [sessionId, setSessionId] = useState<string | undefined>()
  const [resultMeta, setResultMeta] = useState<{ durationMs: number; costUsd: number } | null>(null)
  /** 마지막 turn 기준 context 사용량 (input + cache_read + cache_creation = 다음 turn 의 prefix) */
  const [ctxTokens, setCtxTokens] = useState<number>(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [mcpOpen, setMcpOpen] = useState(false)
  /** 입력 영역에 첨부된 파일들 — drag/drop 또는 clipboard paste 로 추가됨.
   * 파일이 디스크에 이미 존재하면 path 만, 클립보드 이미지면 saveAttachment 로 디스크에 저장 후 path 받음. */
  const [attachments, setAttachments] = useState<Array<{ id: string; name: string; path: string; isImage: boolean }>>([])
  const [dragOver, setDragOver] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 컴포넌트 언마운트 시 backend long-running process 정리
  useEffect(() => {
    return () => {
      try { window.api.claude.chatCancel(chatId) } catch { /* ok */ }
    }
  }, [chatId])

  // 이벤트 수신
  useEffect(() => {
    const unsub = window.api.claude.onChatEvent((ev: ClaudeChatEvent) => {
      if (ev.chatId !== chatId) return
      if (ev.type === 'assistant_text') {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === ev.msgId)
          if (idx >= 0) {
            const next = prev.slice()
            next[idx] = { ...next[idx], text: next[idx].text + ev.delta }
            return next
          }
          return [...prev, { id: ev.msgId, role: 'assistant', text: ev.delta }]
        })
      } else if (ev.type === 'tool_use') {
        setMessages((prev) => [...prev, {
          id: ev.toolId,
          role: 'tool',
          toolName: ev.name,
          toolInput: ev.input,
          text: ''
        }])
      } else if (ev.type === 'tool_result') {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === ev.toolId)
          if (idx < 0) return prev
          const next = prev.slice()
          next[idx] = { ...next[idx], text: ev.content, isError: ev.isError }
          return next
        })
      } else if (ev.type === 'usage') {
        const ctx = (ev.inputTokens || 0) + (ev.cacheReadTokens || 0) + (ev.cacheCreationTokens || 0)
        if (ctx > 0) setCtxTokens(ctx)
      } else if (ev.type === 'result') {
        setSessionId(ev.sessionId || undefined)
        setResultMeta({ durationMs: ev.durationMs, costUsd: ev.costUsd })
        const ctx = (ev.inputTokens || 0) + (ev.cacheReadTokens || 0) + (ev.cacheCreationTokens || 0)
        if (ctx > 0) setCtxTokens(ctx)
        setBusy(false)
      } else if (ev.type === 'error') {
        setMessages((prev) => [...prev, {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: `⚠ ${ev.message}`,
          isError: true
        }])
        setBusy(false)
      }
    })
    return unsub
  }, [chatId])

  // 자동 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  /** 파일을 첨부 목록에 추가. File 객체가 디스크 path 를 가지면 그대로, 아니면 disk 에 저장 후 path 획득. */
  const addAttachment = useCallback(async (file: File): Promise<void> => {
    try {
      // Electron 의 drag-drop 으로 들어온 File 은 path 속성을 갖는다 (실제 파일 시스템 경로).
      const fileWithPath = file as File & { path?: string }
      let path = typeof fileWithPath.path === 'string' && fileWithPath.path ? fileWithPath.path : ''
      if (!path) {
        // 클립보드 paste 한 이미지 등 — 디스크에 직접 저장
        const buf = await file.arrayBuffer()
        path = await window.api.claude.saveAttachment(file.name || `clipboard-${Date.now()}.png`, buf)
      }
      const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const isImage = (file.type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(path)
      setAttachments((prev) => [...prev, { id, name: file.name || path.split('/').pop() || path, path, isImage }])
    } catch (err) {
      console.warn('[ClaudeChatPane] 첨부 추가 실패:', err)
    }
  }, [])

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const send = useCallback(async () => {
    const text = input.trim()
    if ((!text && attachments.length === 0) || busy) return
    // 첨부 경로를 prompt 끝에 명시. Claude 가 Read tool 로 자유롭게 읽을 수 있도록.
    let promptToSend = text
    if (attachments.length > 0) {
      const lines = attachments.map((a) => `- ${a.path}`).join('\n')
      promptToSend = (text ? text + '\n\n' : '') + `첨부 파일:\n${lines}`
    }
    const userDisplayText = (text || '(첨부만)') + (attachments.length > 0
      ? '\n\n📎 ' + attachments.map((a) => a.name).join(', ')
      : '')
    setInput('')
    setAttachments([])
    setBusy(true)
    setResultMeta(null)
    setMessages((prev) => [...prev, {
      id: `u-${Date.now()}`,
      role: 'user',
      text: userDisplayText
    }])
    try {
      await window.api.claude.chatSend({ chatId, prompt: promptToSend, sessionId, cwd })
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        text: `⚠ ${err instanceof Error ? err.message : String(err)}`,
        isError: true
      }])
      setBusy(false)
    }
  }, [input, attachments, busy, chatId, sessionId, cwd])

  const cancel = useCallback(() => {
    window.api.claude.chatCancel(chatId)
  }, [chatId])

  const reset = useCallback(() => {
    if (busy) cancel()
    setMessages([])
    setSessionId(undefined)
    setResultMeta(null)
    setCtxTokens(0)
  }, [busy, cancel])


  // initialSessionId 받아 들어오면 첫 마운트 때 메시지 로드 + sessionId 설정
  useEffect(() => {
    if (!initialSessionId || !cwd) return
    let cancelled = false
    void window.api.claude.sessionLoad(initialSessionId, cwd).then((list) => {
      if (cancelled) return
      const loaded: ChatMessage[] = (list || []).map((m) => ({
        id: m.id,
        role: m.role === 'user' ? 'user' : 'assistant',
        text: m.text
      }))
      setMessages(loaded)
      setSessionId(initialSessionId)
    }).catch(() => { /* ok */ })
    return () => { cancelled = true }
    // chatId 가 바뀌면 다시 로드 — chatId 가 sessionId 와 1:1 매핑되는 부모 케이스 대비
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSessionId, cwd, chatId])

  /** 디스크에 저장된 이전 세션 불러오기 — 메시지 + sessionId 모두 셋업.
   * 그 다음 사용자가 보내는 메시지는 send() 가 sessionId 를 --resume 으로 전달해 자연 이어짐. */
  const loadHistory = useCallback(async (sid: string, sessionCwd: string) => {
    if (busy) cancel()
    try {
      const list = await window.api.claude.sessionLoad(sid, sessionCwd)
      const loaded: ChatMessage[] = list.map((m) => ({
        id: m.id,
        role: m.role === 'user' ? 'user' : 'assistant',
        text: m.text
      }))
      setMessages(loaded)
      setSessionId(sid)
      setResultMeta(null)
      setHistoryOpen(false)
    } catch (err) {
      console.warn('[ClaudeChatPane] 세션 로드 실패:', err)
    }
  }, [busy, cancel])

  return (
    <div
      className={`absolute inset-0 flex flex-col bg-bg-primary ${isActive ? '' : 'invisible pointer-events-none'}`}
    >
      {/* Breadcrumb */}
      {cwd && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-bg-border text-[12px] text-text-secondary flex-shrink-0">
          <FolderOpen size={13} className="text-text-tertiary" />
          <span className="font-mono truncate text-text-tertiary">{cwd}</span>
          {sessionId && <span className="text-text-tertiary/70">· 세션 {sessionId.slice(0, 8)}</span>}
          <div className="flex-1" />
          {!hideHistoryButton && (
            <SessionHistoryButton
              cwd={cwd}
              currentSessionId={sessionId}
              open={historyOpen}
              onToggle={() => setHistoryOpen((o) => !o)}
              onClose={() => setHistoryOpen(false)}
              onSelect={(sid, sessionCwd) => void loadHistory(sid, sessionCwd)}
            />
          )}
          <McpStatusButton
            open={mcpOpen}
            onToggle={() => setMcpOpen((o) => !o)}
            onClose={() => setMcpOpen(false)}
          />
          {ctxTokens > 0 && <CtxBadge tokens={ctxTokens} />}
          <button
            onClick={() => {
              // 인앱 터미널 화면으로 이동 + 새 셸 탭에서 cwd · claude --resume <sid> 자동 입력
              const initialCommand = sessionId ? `claude --resume ${sessionId}` : 'claude'
              window.dispatchEvent(new CustomEvent('create-terminal', { detail: { cwd, initialCommand } }))
              window.dispatchEvent(new CustomEvent('goto-terminal'))
            }}
            className="ds-toolbar-btn"
            title={sessionId ? `인앱 터미널에서 이어가기 (claude --resume ${sessionId.slice(0, 8)})` : '인앱 터미널에서 claude 실행'}
          >
            <TerminalSquare size={14} /> 터미널
          </button>
          <button
            onClick={reset}
            disabled={messages.length === 0}
            className="ds-toolbar-btn disabled:opacity-40"
            title="현재 대화를 비우고 새로 시작"
          >
            <RotateCcw size={14} /> 새 대화
          </button>
        </div>
      )}

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-text-tertiary">
            <Sparkles size={36} className="text-clover-orange/60" />
            <div className="text-center">
              <div className="text-sm font-medium text-text-primary">Claude Code</div>
              <div className="text-[11px] mt-1">아래 입력창에 질문이나 지시를 입력하세요</div>
            </div>
          </div>
        ) : (
          <div className="w-full px-5 py-4 space-y-3">
            {messages.map((m) => <MessageRow key={m.id} msg={m} />)}
            {busy && (
              <div className="flex items-center gap-2 text-[11px] text-text-tertiary pl-12">
                <span className="w-1.5 h-1.5 rounded-full bg-clover-orange animate-pulse" />
                Claude 가 생각 중...
              </div>
            )}
            {resultMeta && !busy && (
              <div className="text-[10px] text-text-tertiary pl-12">
                · {(resultMeta.durationMs / 1000).toFixed(1)}초 · ${resultMeta.costUsd.toFixed(4)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input — 드래그앤드롭 + 클립보드 paste 지원 */}
      <div
        className={`border-t bg-bg-surface px-4 py-3 flex-shrink-0 transition-colors ${
          dragOver ? 'border-clover-orange bg-clover-orange/5' : 'border-bg-border'
        }`}
        onDragEnter={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragOver(true) }}
        onDragLeave={(e) => {
          // 자식으로 들어가는 dragleave 무시
          if (e.currentTarget === e.target) setDragOver(false)
        }}
        onDrop={async (e) => {
          e.preventDefault()
          setDragOver(false)
          const files = Array.from(e.dataTransfer.files || [])
          for (const f of files) await addAttachment(f)
        }}
      >
        {/* 첨부 chips */}
        {attachments.length > 0 && (
          <div className="w-full mb-2 flex items-center gap-1.5 flex-wrap">
            {attachments.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 pl-1.5 pr-1 py-1 rounded-md text-[11px]"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--bg-border)' }}
                title={a.path}
              >
                {a.isImage ? <ImageIcon size={11} className="text-clover-orange" /> : <Paperclip size={11} className="text-clover-blue" />}
                <span className="text-text-secondary max-w-[180px] truncate">{a.name}</span>
                <button onClick={() => removeAttachment(a.id)}
                  className="ml-0.5 text-text-tertiary hover:text-red-400">
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="w-full flex items-center gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
            onPaste={async (e) => {
              // 클립보드 이미지(스크린샷)를 첨부로 추가
              const items = Array.from(e.clipboardData?.items || [])
              const imageItems = items.filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
              if (imageItems.length === 0) return
              e.preventDefault()
              for (const it of imageItems) {
                const f = it.getAsFile()
                if (f) await addAttachment(f)
              }
            }}
            placeholder={dragOver ? '여기에 놓아 첨부' : '메시지를 입력하세요 · Enter 전송 · Shift+Enter 줄바꿈 · 파일 드래그/스크린샷 paste 가능'}
            rows={2}
            className="ds-input flex-1"
            style={{ resize: 'none', height: 'auto', padding: '8px 10px' }}
            disabled={busy}
          />
          {busy ? (
            <button onClick={cancel}
              className="ds-btn danger" title="중단"
              style={{ height: 40 }}>
              <Square size={14} /> 중단
            </button>
          ) : (
            <button onClick={send}
              disabled={!input.trim() && attachments.length === 0}
              className="ds-btn ai"
              style={{ height: 40 }}>
              <Send size={14} /> 전송
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** 마크다운 렌더링 컴포넌트 — 코드 블록, 표, 리스트 등 정상 표시 */
const markdownComponents = {
  // 코드 블록을 시각적으로 명확하게
  code: ({ inline, className, children, ...props }: { inline?: boolean; className?: string; children?: React.ReactNode }) => {
    if (inline) {
      return (
        <code
          className="px-1 py-0.5 rounded font-mono text-[12px]"
          style={{ background: 'rgba(0,0,0,0.25)', color: '#FB923C' }}
          {...props}
        >
          {children}
        </code>
      )
    }
    return (
      <code className={`block font-mono text-[12px] ${className || ''}`} {...props}>
        {children}
      </code>
    )
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="rounded-md p-2.5 my-1.5 overflow-x-auto" style={{ background: 'rgba(0,0,0,0.35)' }}>
      {children}
    </pre>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-1.5">
      <table className="text-[12px] border-collapse" style={{ minWidth: '100%' }}>
        {children}
      </table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="text-left font-semibold px-2 py-1" style={{ background: 'rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-2 py-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      {children}
    </td>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-clover-blue hover:underline">
      {children}
    </a>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc pl-5 my-1 space-y-0.5">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal pl-5 my-1 space-y-0.5">{children}</ol>,
  h1: ({ children }: { children?: React.ReactNode }) => <h1 className="text-base font-bold mt-2 mb-1">{children}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 className="text-sm font-bold mt-2 mb-1">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="text-[13px] font-semibold mt-1.5 mb-1">{children}</h3>,
  p: ({ children }: { children?: React.ReactNode }) => <p className="my-0.5">{children}</p>,
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 pl-3 my-1.5 italic" style={{ borderColor: 'rgba(251,146,60,0.5)', color: 'var(--text-secondary)' }}>
      {children}
    </blockquote>
  )
}

/**
 * 단일 메시지 로우 — 채팅 말풍선 형태.
 *  - user(YOU): 오른쪽 정렬, 파란 말풍선
 *  - assistant(AI): 왼쪽 정렬, 어두운 말풍선 + 마크다운 렌더
 *  - tool(TOOL): 왼쪽 정렬, 컴팩트 (도구 호출 흐름)
 */
function MessageRow({ msg }: { msg: ChatMessage }): JSX.Element {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] px-3.5 py-2 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap break-words"
          style={{
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            color: '#fff',
            borderTopRightRadius: 4
          }}
        >
          {msg.text}
        </div>
      </div>
    )
  }

  if (msg.role === 'tool') {
    const inputStr = typeof msg.toolInput === 'string' ? msg.toolInput : JSON.stringify(msg.toolInput || {})
    const inputPreview = inputStr.length > 140 ? inputStr.slice(0, 140) + '…' : inputStr
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] flex gap-2 items-start">
          <span
            className="inline-flex items-center gap-1 h-5 px-1.5 rounded-[4px] text-[10px] font-bold flex-none mt-1"
            style={{ color: '#A78BFA', background: 'rgba(167,139,250,0.14)' }}
          >
            <Wrench size={11} />
            TOOL
          </span>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="text-[12px] text-text-secondary font-mono">
              <span className="text-violet-400 font-semibold">{msg.toolName || 'tool'}</span>
              {inputPreview && <span className="text-text-tertiary"> {inputPreview}</span>}
            </div>
            {msg.text && (
              <pre className={`text-[11px] font-mono whitespace-pre-wrap break-words rounded-md px-2.5 py-2 ${
                msg.isError
                  ? 'bg-red-500/10 text-red-400 border border-red-500/25'
                  : 'bg-bg-surface text-text-secondary border border-bg-border'
              }`} style={{ maxHeight: 240, overflow: 'auto' }}>
                {msg.text}
              </pre>
            )}
          </div>
        </div>
      </div>
    )
  }

  // assistant — 왼쪽 정렬, 어두운 말풍선, 마크다운 렌더
  return (
    <div className="flex justify-start gap-2.5 items-start">
      <span
        className="inline-flex items-center justify-center w-7 h-7 rounded-full flex-none"
        style={{ background: 'linear-gradient(135deg, rgba(251,146,60,0.2), rgba(59,130,246,0.2))', border: '1px solid rgba(251,146,60,0.4)' }}
      >
        <Sparkles size={13} style={{ color: '#FB923C' }} />
      </span>
      <div
        className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-[13px] leading-relaxed break-words ${msg.isError ? 'text-red-400' : 'text-text-primary'}`}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--bg-border)',
          borderTopLeftRadius: 4
        }}
      >
        {msg.text ? (
          msg.isError ? (
            <span className="whitespace-pre-wrap">{msg.text}</span>
          ) : (
            <div className="markdown-body">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={markdownComponents as never}
              >
                {msg.text}
              </ReactMarkdown>
            </div>
          )
        ) : (
          <span className="text-text-tertiary">…</span>
        )}
      </div>
    </div>
  )
}

/** 이전 채팅 세션 목록 popover */
function SessionHistoryButton({
  cwd,
  currentSessionId,
  open,
  onToggle,
  onClose,
  onSelect
}: {
  cwd: string
  currentSessionId?: string
  open: boolean
  onToggle: () => void
  onClose: () => void
  onSelect: (sessionId: string, cwd: string) => void
}): JSX.Element {
  const [sessions, setSessions] = useState<
    Array<{ sessionId: string; cwd: string; title: string; lastActivityAt: string; messageCount: number }>
  >([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    void window.api.claude.sessionList(cwd)
      .then((list) => setSessions(list || []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false))
  }, [open, cwd])

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="ds-toolbar-btn"
        title="이전 대화 목록"
      >
        <History size={14} /> 이전 대화
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={onClose} />
          <div
            className="absolute z-40 mt-1.5 w-[360px] max-h-[420px] overflow-y-auto rounded-lg shadow-2xl"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)', right: 0, top: '100%' }}
          >
            <div className="px-3 py-2 flex items-center justify-between sticky top-0"
              style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--bg-border)' }}>
              <span className="text-xs font-semibold text-text-primary">이전 대화 ({sessions.length})</span>
              <button onClick={onClose} className="text-text-tertiary hover:text-text-primary">
                <X size={12} />
              </button>
            </div>
            {loading ? (
              <div className="px-3 py-4 text-[11px] text-text-tertiary text-center">로딩...</div>
            ) : sessions.length === 0 ? (
              <div className="px-3 py-4 text-[11px] text-text-tertiary text-center">저장된 세션 없음</div>
            ) : (
              <div className="py-1">
                {sessions.map((s) => {
                  const isCurrent = s.sessionId === currentSessionId
                  return (
                    <button
                      key={s.sessionId}
                      onClick={() => onSelect(s.sessionId, s.cwd)}
                      className={`w-full text-left px-3 py-2 hover:bg-bg-surface-hover transition-colors flex flex-col gap-0.5 ${
                        isCurrent ? 'bg-clover-blue/10 border-l-2 border-clover-blue' : ''
                      }`}
                    >
                      <span className="text-[12px] text-text-primary line-clamp-2 font-medium">
                        {s.title}
                      </span>
                      <div className="flex items-center gap-2 text-[10px] text-text-tertiary">
                        <span>{formatRelative(s.lastActivityAt)}</span>
                        <span>·</span>
                        <span>{s.messageCount}개 메시지</span>
                        {isCurrent && <span className="text-clover-blue">· 현재</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** /mcp 상태 popover — claude code 가 ~/.claude/settings.json 에서 로드한 MCP 서버 목록 표시 */
function McpStatusButton({
  open,
  onToggle,
  onClose
}: {
  open: boolean
  onToggle: () => void
  onClose: () => void
}): JSX.Element {
  const [servers, setServers] = useState<Array<{ name: string; status: string; isHealthy?: boolean }>>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    void window.api.mcp.list()
      .then((cfg) => {
        // mcp.list 는 settings.json 의 mcpServers 정의 (Record<name, config>) 반환.
        // 진짜 connected 상태는 claude code 자체가 알지만 IPC 노출이 없으므로,
        // 여기서는 "등록됨 = enabled" 로 표기.
        const list = Object.entries(cfg || {}).map(([name, c]) => {
          const cfgRec = c as Record<string, unknown>
          const disabled = cfgRec.disabled === true
          return {
            name,
            status: disabled ? 'disabled' : '등록됨',
            isHealthy: !disabled
          }
        })
        list.sort((a, b) => a.name.localeCompare(b.name))
        setServers(list)
      })
      .catch(() => setServers([]))
      .finally(() => setLoading(false))
  }, [open])

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="ds-toolbar-btn"
        title="MCP 연결 상태"
      >
        <Server size={14} /> /mcp
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={onClose} />
          <div
            className="absolute z-40 mt-1.5 w-[300px] max-h-[400px] overflow-y-auto rounded-lg shadow-2xl"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)', right: 0, top: '100%' }}
          >
            <div className="px-3 py-2 flex items-center justify-between sticky top-0"
              style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--bg-border)' }}>
              <span className="text-xs font-semibold text-text-primary">MCP 서버 ({servers.length})</span>
              <button onClick={onClose} className="text-text-tertiary hover:text-text-primary">
                <X size={12} />
              </button>
            </div>
            {loading ? (
              <div className="px-3 py-4 text-[11px] text-text-tertiary text-center">로딩...</div>
            ) : servers.length === 0 ? (
              <div className="px-3 py-4 text-[11px] text-text-tertiary text-center">등록된 MCP 없음</div>
            ) : (
              <div className="py-1">
                {servers.map((s) => (
                  <div key={s.name} className="px-3 py-1.5 flex items-center gap-2 text-[11px]">
                    {s.isHealthy ? (
                      <Check size={11} className="text-emerald-400 flex-none" />
                    ) : (
                      <AlertCircle size={11} className="text-amber-400 flex-none" />
                    )}
                    <span className="font-mono text-text-primary flex-1 truncate">{s.name}</span>
                    <span className={s.isHealthy ? 'text-emerald-400' : 'text-text-tertiary'}>
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * 현재 context 토큰 사용량 표시. Sonnet/Opus 4.x 의 200k window 기준으로 비율 표시.
 *  - 80% 이상: 빨강 (compact 권장)
 *  - 60% 이상: 주황
 *  - 그 외: 회색
 */
function CtxBadge({ tokens }: { tokens: number }): JSX.Element {
  const WINDOW = 200_000
  const pct = Math.min(100, Math.round((tokens / WINDOW) * 100))
  const tone = pct >= 80 ? '#F87171' : pct >= 60 ? '#FB923C' : 'var(--text-tertiary)'
  const label = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : `${tokens}`
  return (
    <span
      title={`Context ${tokens.toLocaleString()} / ${WINDOW.toLocaleString()} (${pct}%) · 80% 넘으면 /compact 권장`}
      className="inline-flex items-center gap-1 px-1.5 py-1 rounded-md font-medium"
      style={{ color: tone, background: 'rgba(255,255,255,0.04)' }}
    >
      <Cpu size={14} />
      {label} · {pct}%
    </span>
  )
}

function formatRelative(iso?: string): string {
  if (!iso) return ''
  try {
    const ms = Date.now() - new Date(iso).getTime()
    if (ms < 60_000) return '방금'
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}분 전`
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}시간 전`
    if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}일 전`
    return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export default ClaudeChatPane
