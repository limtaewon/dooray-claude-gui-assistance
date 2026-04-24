import { useEffect, useRef, useState, useCallback } from 'react'
import { Send, Square, Sparkles, User, Wrench, RotateCcw, FolderOpen } from 'lucide-react'
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
}

/**
 * Claude Code 대화형 트랜스크립트 패널.
 * xterm 대신 YOU/AI/TOOL 포맷 UI 로 렌더.
 * multi-turn 은 backend 에서 돌려주는 session_id 를 재전송해 이어가기.
 */
function ClaudeChatPane({ isActive, cwd, chatId }: ClaudeChatPaneProps): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [sessionId, setSessionId] = useState<string | undefined>()
  const [resultMeta, setResultMeta] = useState<{ durationMs: number; costUsd: number } | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

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
      } else if (ev.type === 'result') {
        setSessionId(ev.sessionId || undefined)
        setResultMeta({ durationMs: ev.durationMs, costUsd: ev.costUsd })
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

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setBusy(true)
    setResultMeta(null)
    setMessages((prev) => [...prev, {
      id: `u-${Date.now()}`,
      role: 'user',
      text
    }])
    try {
      await window.api.claude.chatSend({ chatId, prompt: text, sessionId, cwd })
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        text: `⚠ ${err instanceof Error ? err.message : String(err)}`,
        isError: true
      }])
      setBusy(false)
    }
  }, [input, busy, chatId, sessionId, cwd])

  const cancel = useCallback(() => {
    window.api.claude.chatCancel(chatId)
  }, [chatId])

  const reset = useCallback(() => {
    if (busy) cancel()
    setMessages([])
    setSessionId(undefined)
    setResultMeta(null)
  }, [busy, cancel])

  return (
    <div
      className={`absolute inset-0 flex flex-col bg-bg-primary ${isActive ? '' : 'invisible pointer-events-none'}`}
    >
      {/* Breadcrumb */}
      {cwd && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-bg-border text-[11px] text-text-tertiary flex-shrink-0">
          <FolderOpen size={12} />
          <span className="font-mono truncate">{cwd}</span>
          {sessionId && <span className="text-text-tertiary/70">· 세션 {sessionId.slice(0, 8)}</span>}
          <div className="flex-1" />
          <button onClick={reset} disabled={messages.length === 0}
            className="flex items-center gap-1 hover:text-text-secondary disabled:opacity-40">
            <RotateCcw size={11} /> 새 대화
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
          <div className="max-w-4xl mx-auto px-5 py-4 space-y-3">
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

      {/* Input */}
      <div className="border-t border-bg-border bg-bg-surface px-4 py-3 flex-shrink-0">
        <div className="max-w-4xl mx-auto flex items-end gap-2">
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
            placeholder="메시지를 입력하세요 · Enter 전송 · Shift+Enter 줄바꿈"
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
              disabled={!input.trim()}
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

/** 단일 메시지 로우 — YOU / AI / TOOL 라벨 + 톤 구분 */
function MessageRow({ msg }: { msg: ChatMessage }): JSX.Element {
  if (msg.role === 'user') {
    return (
      <div className="flex gap-2.5">
        <Label tone="blue" icon={<User size={11} />}>YOU</Label>
        <div className="text-[13px] text-text-primary whitespace-pre-wrap break-words leading-relaxed flex-1 pt-0.5">{msg.text}</div>
      </div>
    )
  }
  if (msg.role === 'tool') {
    const inputStr = typeof msg.toolInput === 'string' ? msg.toolInput : JSON.stringify(msg.toolInput || {})
    const inputPreview = inputStr.length > 140 ? inputStr.slice(0, 140) + '…' : inputStr
    return (
      <div className="flex gap-2.5">
        <Label tone="violet" icon={<Wrench size={11} />}>TOOL</Label>
        <div className="flex-1 min-w-0 pt-0.5 space-y-1">
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
    )
  }
  // assistant
  return (
    <div className="flex gap-2.5">
      <Label tone="orange" icon={<Sparkles size={11} />}>AI</Label>
      <div className={`text-[13px] whitespace-pre-wrap break-words leading-relaxed flex-1 pt-0.5 ${msg.isError ? 'text-red-400' : 'text-text-primary'}`}>
        {msg.text || <span className="text-text-tertiary">…</span>}
      </div>
    </div>
  )
}

function Label({ tone, icon, children }: { tone: 'blue' | 'orange' | 'violet'; icon: React.ReactNode; children: React.ReactNode }): JSX.Element {
  const toneStyle = tone === 'blue'
    ? { color: '#60A5FA', background: 'rgba(37,99,235,0.14)' }
    : tone === 'orange'
      ? { color: '#FB923C', background: 'rgba(234,88,12,0.14)' }
      : { color: '#A78BFA', background: 'rgba(167,139,250,0.14)' }
  return (
    <span
      className="inline-flex items-center gap-1 h-5 px-1.5 rounded-[4px] text-[10px] font-bold flex-none mt-0.5"
      style={toneStyle}
    >
      {icon}
      {children}
    </span>
  )
}

export default ClaudeChatPane
