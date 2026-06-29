import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Send, Square, Sparkles, Wrench, RotateCcw, FolderOpen, History, Server, X, Check, AlertCircle, Paperclip, Image as ImageIcon, Cpu, TerminalSquare, ChevronDown, Zap } from 'lucide-react'
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
  /** 사용자가 위로 스크롤해서 최신 출력 follow 를 일시 중단했는지. true 면 자동 스크롤 안 함. */
  const stickToBottomRef = useRef(true)

  // Slash command palette — 입력이 "/..." 으로 시작하면 보유 스킬 목록을 띄워 선택해 본문 삽입.
  const [skillList, setSkillList] = useState<Array<{ name: string; filename: string; content: string }>>([])
  const [paletteIndex, setPaletteIndex] = useState(0)
  useEffect(() => {
    window.api.skills.list().then((list) => setSkillList(list || [])).catch(() => setSkillList([]))
  }, [])
  const slashQuery = useMemo<string | null>(() => {
    // 입력이 "/" 한 글자로 시작하고 첫 줄에 공백이 없을 때만 활성. (멀티라인 메시지 중간엔 비활성)
    const firstLine = input.split('\n')[0]
    const m = firstLine.match(/^\/([^\s]*)$/)
    return m && firstLine === input ? m[1] : null
  }, [input])
  const paletteSkills = useMemo(() => {
    if (slashQuery === null) return []
    const q = slashQuery.toLowerCase()
    return q
      ? skillList.filter((s) => s.name.toLowerCase().includes(q) || s.filename.toLowerCase().includes(q))
      : skillList
  }, [slashQuery, skillList])
  const paletteOpen = slashQuery !== null && paletteSkills.length > 0
  useEffect(() => { setPaletteIndex(0) }, [slashQuery])

  const insertSkill = useCallback((skill: { name: string; filename: string }): void => {
    // Claude Code 가 스킬을 인지하도록 슬래시 커맨드 텍스트만 삽입. md 본문은 넣지 않음.
    // 사용자가 그 뒤에 이어서 자연어를 추가로 적을 수 있게 trailing space 1개.
    const cmd = `/${skill.name} `
    setInput(cmd)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (el) {
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
      }
    })
  }, [])

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

  // 자동 스크롤 — 사용자가 바닥 근처에 있을 때만 follow.
  // Why: 스트리밍 중 위쪽 내용을 읽고 있을 때 강제로 끌려가는 문제 방지.
  useEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  // 스크롤 위치 추적: 바닥에서 64px 이내면 follow 유지, 벗어나면 해제.
  const handleTranscriptScroll = useCallback((e: React.UIEvent<HTMLDivElement>): void => {
    const el = e.currentTarget
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    stickToBottomRef.current = distanceFromBottom < 64
  }, [])

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
      // #11 드롭존 확장 — input 만 받던 drag/drop 을 Pane 전체로. 메시지 영역 위로 끌어와도 첨부됨.
      onDragEnter={(e) => {
        if (!e.dataTransfer?.types?.includes('Files')) return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer?.types?.includes('Files')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        // Pane 의 바깥 경계로 나갈 때만 해제 (자식 transition 무시)
        if (e.currentTarget === e.target) setDragOver(false)
      }}
      onDrop={async (e) => {
        const files = Array.from(e.dataTransfer?.files || [])
        if (files.length === 0) return
        e.preventDefault()
        setDragOver(false)
        for (const f of files) await addAttachment(f)
      }}
    >
      {/* 드롭 오버레이 — Pane 전체에 시각 피드백 */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-clauday-orange/5 backdrop-blur-[1px] border-2 border-dashed border-clauday-orange/60">
          <div className="px-4 py-2 rounded-full bg-clauday-orange/15 border border-clauday-orange/50 text-[calc(12px_*_var(--app-font-scale,1))] font-semibold text-clauday-orange">
            놓으면 첨부됩니다
          </div>
        </div>
      )}
      {/* Breadcrumb */}
      {cwd && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-bg-border text-[calc(12px_*_var(--app-font-scale,1))] text-text-secondary flex-shrink-0">
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
          {/* #8 터미널 진입 — bypass / 일반 두 옵션 드롭다운 (예전엔 Shift+Alt 모디파이어). */}
          <TerminalDropdown sessionId={sessionId} cwd={cwd} />
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
      <div ref={scrollRef} onScroll={handleTranscriptScroll} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-text-tertiary">
            <Sparkles size={36} className="text-clauday-orange/60" />
            <div className="text-center">
              <div className="text-sm font-medium text-text-primary">Claude Code</div>
              <div className="text-[calc(11px_*_var(--app-font-scale,1))] mt-1">아래 입력창에 질문이나 지시를 입력하세요</div>
            </div>
          </div>
        ) : (
          <div className="w-full px-5 py-4 space-y-3">
            {messages.map((m) => <MessageRow key={m.id} msg={m} />)}
            {busy && (
              <div className="flex items-center gap-2 text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary pl-12">
                <span className="w-1.5 h-1.5 rounded-full bg-clauday-orange animate-pulse" />
                Claude 가 생각 중...
              </div>
            )}
            {resultMeta && !busy && (
              <div className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary pl-12">
                · {(resultMeta.durationMs / 1000).toFixed(1)}초 · ${resultMeta.costUsd.toFixed(4)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input — 클립보드 paste 는 textarea 핸들러가 처리. 드롭은 Pane wrapper(#11) 가 전 영역으로 받음. */}
      <div className="border-t bg-bg-surface px-4 py-3 flex-shrink-0 border-bg-border">
        {/* 첨부 chips */}
        {attachments.length > 0 && (
          <div className="w-full mb-2 flex items-center gap-1.5 flex-wrap">
            {attachments.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 pl-1.5 pr-1 py-1 rounded-md text-[calc(11px_*_var(--app-font-scale,1))]"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--bg-border)' }}
                title={a.path}
              >
                {a.isImage ? <ImageIcon size={11} className="text-clauday-orange" /> : <Paperclip size={11} className="text-clauday-blue" />}
                <span className="text-text-secondary max-w-[180px] truncate">{a.name}</span>
                <button onClick={() => removeAttachment(a.id)}
                  className="ml-0.5 text-text-tertiary hover:text-red-400">
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="w-full flex items-center gap-2 relative">
          {/* Slash 명령 팔레트 — 보유 스킬을 / 로 검색해 본문에 삽입 */}
          {paletteOpen && (
            <div
              className="absolute left-0 right-12 bottom-full mb-1 z-30 rounded-lg border border-bg-border shadow-2xl overflow-hidden"
              style={{ background: 'var(--bg-surface-raised)', maxHeight: 280 }}
            >
              <div className="px-3 py-1.5 text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary border-b border-bg-border bg-bg-subtle flex items-center justify-between">
                <span>스킬 — ↑↓ 이동, Enter 삽입, Esc 취소</span>
                <span>{paletteSkills.length}개</span>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
                {paletteSkills.map((s, i) => {
                  const isHi = i === paletteIndex
                  return (
                  <div
                    key={s.filename}
                    ref={(el) => { if (isHi && el) el.scrollIntoView({ block: 'nearest' }) }}
                    onMouseEnter={() => setPaletteIndex(i)}
                    // Why: mousedown 이 textarea blur 를 일으켜 화살표 키 입력이 안 잡힐 수 있음.
                    // mousedown 의 기본 동작(focus 이동)을 막아 textarea 포커스 유지.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertSkill(s)}
                    className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer border-l-2 transition-colors ${
                      isHi
                        ? 'bg-clauday-orange/15 border-l-clauday-orange'
                        : 'border-l-transparent hover:bg-bg-surface-hover'
                    }`}
                  >
                    <Sparkles size={11} className={`flex-none ${isHi ? 'text-clauday-orange' : 'text-clauday-blue'}`} />
                    <span className={`text-[calc(12px_*_var(--app-font-scale,1))] truncate ${isHi ? 'text-text-primary font-semibold' : 'text-text-primary'}`}>{s.name}</span>
                    <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary font-mono truncate flex-1 text-right">{s.filename}</span>
                  </div>
                  )
                })}
              </div>
            </div>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Palette 가 열려있을 때 — 방향키/Esc 는 IME 합성 여부와 무관 (한글 조합과
              // 화살표는 충돌 안 함). Enter 만 IME 합성 중이면 IME 한테 양보.
              if (paletteOpen) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setPaletteIndex((i) => Math.min(i + 1, paletteSkills.length - 1))
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setPaletteIndex((i) => Math.max(i - 1, 0))
                  return
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setInput('')
                  return
                }
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  insertSkill(paletteSkills[paletteIndex])
                  return
                }
              }
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

/** 절대 path / URL 같이 OS 핸들러로 열 만한 대상인지 판정 (#6 채팅 메시지 클릭 열기) */
function isOpenableTarget(s: string): boolean {
  if (!s) return false
  if (/^https?:\/\//i.test(s)) return true
  if (/^file:\/\//i.test(s)) return true
  if (s.startsWith('~/') || s.startsWith('/')) return true
  if (/^[A-Za-z]:[\\/]/.test(s)) return true
  return false
}

function openTarget(target: string): void {
  const resolved = target.replace(/^file:\/\//, '')
  window.api.shell.openPath(resolved).catch((err) => console.warn('[chat-link] open 실패', err))
}

function nodeToText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeToText).join('')
  return ''
}

/**
 * plain text 안의 path/URL 을 자동 link 로 분해.
 * inline code 가 path 의 일부만 캡처해서 클릭 시 잘못된 부모 폴더로 이동하던 문제 해결.
 * - 절대 path / ~/ / 윈도우 드라이브 / http(s) URL 매칭
 * - path 는 Cmd+클릭, URL 은 일반 클릭
 */
// URL or PATH 매칭. 우선순위:
//   m[1] = http(s) URL
//   m[2] = single-quoted path (공백 OK — 'Application Support' 등 macOS 경로)
//   m[3] = double-quoted path
//   m[4] = 따옴표 없는 path (공백 분리)
const PATH_OR_URL_RE = /(https?:\/\/[^\s"'`<>()[\]{}]+)|'((?:~|\/|\b[A-Za-z]:[\\/])[^'\r\n]+?)'|"((?:~|\/|\b[A-Za-z]:[\\/])[^"\r\n]+?)"|((?:~|\/|\b[A-Za-z]:[\\/])[^\s"'`<>(){}[\],]+)/g

function linkifyString(s: string, baseKey: string): React.ReactNode[] {
  if (!s) return [s]
  const out: React.ReactNode[] = []
  let last = 0
  PATH_OR_URL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PATH_OR_URL_RE.exec(s)) !== null) {
    if (m.index > last) out.push(s.slice(last, m.index))
    const target = m[1] ?? m[2] ?? m[3] ?? m[4]
    if (target) out.push(<LinkChip key={`${baseKey}-${m.index}`} target={target} />)
    last = m.index + m[0].length
  }
  if (last < s.length) out.push(s.slice(last))
  return out.length > 0 ? out : [s]
}

/**
 * 채팅 메시지 안의 path/URL 링크 — Warp 식 hover popover.
 *   - hover 시 위쪽에 작은 popover: "Open file [⌘ + Click]" / "Show in Finder" (파일)
 *     또는 "Open in browser" (URL)
 *   - 파일은 ⌘+클릭으로만 활성화 (실수 클릭 방지). URL 은 일반 클릭.
 */
function LinkChip({ target }: { target: string }): JSX.Element {
  const [hover, setHover] = useState(false)
  const isHttp = /^https?:\/\//i.test(target)
  const handleOpen = (): void => { openTarget(target) }
  const handleReveal = (): void => {
    window.api.shell.showInFolder(target).catch((err) => console.warn('[show-in-folder] 실패', err))
  }
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: 'relative', display: 'inline' }}
    >
      <a
        onClick={(e) => {
          if (!isHttp && !e.metaKey && !e.ctrlKey) return
          e.preventDefault()
          handleOpen()
        }}
        className="text-clauday-blue underline decoration-clauday-blue/40 hover:decoration-clauday-blue cursor-pointer"
      >
        {target}
      </a>
      {hover && (
        <span
          // popover — anchor 의 위쪽에 띄움. inline 컨테이너 안이라 absolute + transform 으로 anchor 가운데로 시프트
          className="pointer-events-auto"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 4,
            background: 'var(--bg-surface-raised)',
            border: '1px solid var(--bg-border)',
            borderRadius: 6,
            boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
            padding: '4px 6px',
            zIndex: 50,
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4
          }}
        >
          {isHttp ? (
            <button
              onClick={(e) => { e.preventDefault(); handleOpen() }}
              className="px-2 py-0.5 rounded text-[calc(11px_*_var(--app-font-scale,1))] text-text-primary hover:bg-bg-surface-hover"
            >
              Open in browser
            </button>
          ) : (
            <>
              <button
                onClick={(e) => { e.preventDefault(); handleOpen() }}
                className="px-2 py-0.5 rounded text-[calc(11px_*_var(--app-font-scale,1))] text-text-primary hover:bg-bg-surface-hover"
              >
                Open file
                <span className="ml-1 text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">⌘+클릭</span>
              </button>
              <span className="text-text-tertiary text-[calc(10px_*_var(--app-font-scale,1))]">|</span>
              <button
                onClick={(e) => { e.preventDefault(); handleReveal() }}
                className="px-2 py-0.5 rounded text-[calc(11px_*_var(--app-font-scale,1))] text-text-primary hover:bg-bg-surface-hover"
              >
                Show in Finder
              </button>
            </>
          )}
        </span>
      )}
    </span>
  )
}

/** ReactNode 의 자식 중 string 들을 linkifyString 으로 부분 치환. 다른 React element 는 그대로 유지. */
function linkifyChildren(children: React.ReactNode, baseKey: string): React.ReactNode {
  if (typeof children === 'string') return linkifyString(children, baseKey)
  if (Array.isArray(children)) {
    const flat: React.ReactNode[] = []
    children.forEach((c, i) => {
      if (typeof c === 'string') flat.push(...linkifyString(c, `${baseKey}-${i}`))
      else flat.push(c)
    })
    return flat
  }
  return children
}

/** 마크다운 렌더링 컴포넌트 — 코드 블록, 표, 리스트 등 정상 표시 */
const markdownComponents = {
  // 코드 블록을 시각적으로 명확하게. 인라인 코드의 내용이 절대경로/URL 이면 Cmd+클릭으로 열림.
  code: ({ inline, className, children, ...props }: { inline?: boolean; className?: string; children?: React.ReactNode }) => {
    if (inline) {
      const text = nodeToText(children).trim()
      const openable = isOpenableTarget(text)
      return (
        <code
          className={`px-1 py-0.5 rounded font-mono text-[calc(12px_*_var(--app-font-scale,1))] ${openable ? 'cursor-pointer hover:underline' : ''}`}
          style={{ background: 'rgba(0,0,0,0.2)', color: openable ? 'var(--c-blue-fg, #93C5FD)' : 'var(--c-orange-fg)' }}
          onClick={openable ? (e) => {
            if (!e.metaKey && !e.ctrlKey) return
            e.preventDefault()
            openTarget(text)
          } : undefined}
          title={openable ? `⌘+클릭으로 열기 — ${text}` : undefined}
          {...props}
        >
          {children}
        </code>
      )
    }
    return (
      <code className={`block font-mono text-[calc(12px_*_var(--app-font-scale,1))] ${className || ''}`} {...props}>
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
      <table className="text-[calc(12px_*_var(--app-font-scale,1))] border-collapse" style={{ minWidth: '100%' }}>
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
      {linkifyChildren(children, 'td')}
    </td>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
    if (href && isOpenableTarget(href)) {
      const isFile = !/^https?:\/\//i.test(href)
      return (
        <a
          onClick={(e) => {
            // 파일 path 는 Cmd+클릭으로만 (실수 클릭 방지), URL 은 일반 클릭
            if (isFile && !e.metaKey && !e.ctrlKey) return
            e.preventDefault()
            openTarget(href)
          }}
          title={isFile ? `⌘+클릭으로 열기 — ${href}` : `클릭으로 열기 — ${href}`}
          className={`text-clauday-blue hover:underline ${isFile ? 'cursor-pointer' : ''}`}
        >
          {children}
        </a>
      )
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-clauday-blue hover:underline">
        {children}
      </a>
    )
  },
  // 텍스트가 담기는 영역 — plain text 안의 path/URL 자동 link 화 (#6 채팅 메시지 클릭 열기)
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc pl-5 my-1 space-y-0.5">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal pl-5 my-1 space-y-0.5">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li>{linkifyChildren(children, 'li')}</li>,
  h1: ({ children }: { children?: React.ReactNode }) => <h1 className="text-base font-bold mt-2 mb-1">{linkifyChildren(children, 'h1')}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 className="text-sm font-bold mt-2 mb-1">{linkifyChildren(children, 'h2')}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="text-[calc(13px_*_var(--app-font-scale,1))] font-semibold mt-1.5 mb-1">{linkifyChildren(children, 'h3')}</h3>,
  p: ({ children }: { children?: React.ReactNode }) => <p className="my-0.5">{linkifyChildren(children, 'p')}</p>,
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 pl-3 my-1.5 italic" style={{ borderColor: 'color-mix(in oklab, var(--c-orange-fg) 50%, transparent)', color: 'var(--text-secondary)' }}>
      {linkifyChildren(children, 'blockquote')}
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
          className="max-w-[85%] px-3.5 py-2 rounded-2xl text-[calc(13px_*_var(--app-font-scale,1))] leading-relaxed whitespace-pre-wrap break-words"
          style={{
            background: 'var(--c-blue-solid)',
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
            className="inline-flex items-center gap-1 h-5 px-1.5 rounded-[4px] text-[calc(10px_*_var(--app-font-scale,1))] font-bold flex-none mt-1"
            style={{ color: 'var(--c-violet-fg)', background: 'var(--c-violet-bg)' }}
          >
            <Wrench size={11} />
            TOOL
          </span>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="text-[calc(12px_*_var(--app-font-scale,1))] text-text-secondary font-mono">
              <span className="text-violet-400 font-semibold">{msg.toolName || 'tool'}</span>
              {inputPreview && <span className="text-text-tertiary"> {inputPreview}</span>}
            </div>
            {msg.text && (
              <pre className={`text-[calc(11px_*_var(--app-font-scale,1))] font-mono whitespace-pre-wrap break-words rounded-md px-2.5 py-2 ${
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
        <Sparkles size={13} style={{ color: 'var(--c-orange-solid)' }} />
      </span>
      <div
        className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-[calc(13px_*_var(--app-font-scale,1))] leading-relaxed break-words ${msg.isError ? 'text-red-400' : 'text-text-primary'}`}
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
              <div className="px-3 py-4 text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary text-center">로딩...</div>
            ) : sessions.length === 0 ? (
              <div className="px-3 py-4 text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary text-center">저장된 세션 없음</div>
            ) : (
              <div className="py-1">
                {sessions.map((s) => {
                  const isCurrent = s.sessionId === currentSessionId
                  return (
                    <button
                      key={s.sessionId}
                      onClick={() => onSelect(s.sessionId, s.cwd)}
                      className={`w-full text-left px-3 py-2 hover:bg-bg-surface-hover transition-colors flex flex-col gap-0.5 ${
                        isCurrent ? 'bg-clauday-blue/10 border-l-2 border-clauday-blue' : ''
                      }`}
                    >
                      <span className="text-[calc(12px_*_var(--app-font-scale,1))] text-text-primary line-clamp-2 font-medium">
                        {s.title}
                      </span>
                      <div className="flex items-center gap-2 text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">
                        <span>{formatRelative(s.lastActivityAt)}</span>
                        <span>·</span>
                        <span>{s.messageCount}개 메시지</span>
                        {isCurrent && <span className="text-clauday-blue">· 현재</span>}
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
          const cfgRec = c as unknown as Record<string, unknown>
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
              <div className="px-3 py-4 text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary text-center">로딩...</div>
            ) : servers.length === 0 ? (
              <div className="px-3 py-4 text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary text-center">등록된 MCP 없음</div>
            ) : (
              <div className="py-1">
                {servers.map((s) => (
                  <div key={s.name} className="px-3 py-1.5 flex items-center gap-2 text-[calc(11px_*_var(--app-font-scale,1))]">
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
 * #8 터미널 진입 드롭다운 — 일반 / bypass 두 옵션.
 * 사용자가 모디파이어 키(Shift/Alt)로 분기하던 걸 명시적 메뉴로 변경.
 */
function TerminalDropdown({ sessionId, cwd }: { sessionId: string | undefined; cwd: string }): JSX.Element {
  const [open, setOpen] = useState(false)
  const spawn = (bypass: boolean): void => {
    const flags = bypass ? ' --dangerously-skip-permissions' : ''
    const initialCommand = sessionId ? `claude --resume ${sessionId}${flags}` : `claude${flags}`
    window.dispatchEvent(new CustomEvent('create-terminal', { detail: { cwd, initialCommand } }))
    window.dispatchEvent(new CustomEvent('goto-terminal'))
    setOpen(false)
  }
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="ds-toolbar-btn flex items-center gap-1"
        title={sessionId
          ? `인앱 터미널에서 이어가기 (claude --resume ${sessionId.slice(0, 8)})`
          : '인앱 터미널에서 claude 실행'}
      >
        <TerminalSquare size={14} />
        터미널
        <ChevronDown size={11} className="opacity-70" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          {/* ds-menu-item 이 한 줄 가정이라 description 2줄이 다음 항목과 겹쳐 보이는 이슈 → 자체 padding 적용 */}
          <div
            className="absolute rounded-lg shadow-2xl overflow-hidden py-1"
            style={{
              top: 'calc(100% + 4px)',
              right: 0,
              minWidth: 260,
              zIndex: 40,
              background: 'var(--bg-surface-raised)',
              border: '1px solid var(--bg-border)'
            }}
          >
            <button
              onClick={() => spawn(false)}
              className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-bg-surface-hover transition-colors"
            >
              <TerminalSquare size={13} className="text-clauday-blue mt-0.5 flex-shrink-0" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[calc(12px_*_var(--app-font-scale,1))] text-text-primary font-medium leading-tight">터미널에서 열기</span>
                <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary leading-tight">권한 확인 살림 (기본)</span>
              </div>
            </button>
            <button
              onClick={() => spawn(true)}
              className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-bg-surface-hover transition-colors"
            >
              <Zap size={13} className="text-clauday-orange mt-0.5 flex-shrink-0" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[calc(12px_*_var(--app-font-scale,1))] text-text-primary font-medium leading-tight">bypass 로 열기</span>
                <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary leading-tight">--dangerously-skip-permissions · 권한 확인 건너뜀</span>
              </div>
            </button>
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
  const tone = pct >= 80 ? 'var(--c-red-fg)' : pct >= 60 ? 'var(--c-orange-solid)' : 'var(--text-tertiary)'
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
