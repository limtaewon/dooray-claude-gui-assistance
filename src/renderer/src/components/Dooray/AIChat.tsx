import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, RotateCcw, Sparkles, Loader2, MessageSquare, Plus, Trash2 } from 'lucide-react'
import SkillQuickToggle from './SkillQuickToggle'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface ChatSession {
  id: string
  messageCount: number
  updatedAt: string
  preview: string
}

function AIChat(): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [available, setAvailable] = useState(true)
  const [sessionId, setSessionId] = useState<string>(() => `chat-${Date.now()}`)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [showSessions, setShowSessions] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { window.api.ai.available().then(setAvailable) }, [])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // 세션 목록 로드
  const loadSessions = useCallback(async () => {
    const list = await window.api.chatStore.list()
    setSessions(list)
  }, [])
  useEffect(() => { loadSessions() }, [loadSessions])

  // 메시지 변경 시 자동 저장
  useEffect(() => {
    if (messages.length > 0) {
      window.api.chatStore.save(sessionId, messages)
      loadSessions()
    }
  }, [messages, sessionId])

  const handleSend = async (): Promise<void> => {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    const userMsg: ChatMessage = { role: 'user', content: msg, timestamp: Date.now() }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    try {
      const response = await window.api.ai.chat({ message: msg, includeContext: true })
      setMessages((prev) => [...prev, { role: 'assistant', content: response.content, timestamp: Date.now() }])
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`, timestamp: Date.now() }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const newSession = async (): Promise<void> => {
    await window.api.ai.resetChat()
    setSessionId(`chat-${Date.now()}`)
    setMessages([])
    setShowSessions(false)
  }

  const loadSession = async (id: string): Promise<void> => {
    const msgs = await window.api.chatStore.load(id) as ChatMessage[]
    setMessages(msgs)
    setSessionId(id)
    setShowSessions(false)
  }

  const deleteSession = async (id: string): Promise<void> => {
    await window.api.chatStore.delete(id)
    if (sessionId === id) { setMessages([]); setSessionId(`chat-${Date.now()}`) }
    loadSessions()
  }

  if (!available) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-secondary text-sm p-8">
        <Sparkles size={32} className="text-clover-orange/40 mb-3" />
        <p className="font-medium text-text-primary mb-1">Claude Code CLI가 필요합니다</p>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* 사이드: 세션 목록 */}
      {showSessions && (
        <div className="w-56 flex-shrink-0 bg-bg-surface border-r border-bg-border flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-bg-border">
            <span className="text-[11px] font-semibold text-text-secondary uppercase">대화 기록</span>
            <button onClick={newSession} className="p-1 rounded hover:bg-bg-surface-hover text-text-tertiary" title="새 대화">
              <Plus size={12} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sessions.length === 0 ? (
              <div className="text-[10px] text-text-tertiary text-center py-4">기록 없음</div>
            ) : sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => loadSession(s.id)}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors group ${
                  sessionId === s.id ? 'bg-clover-blue/10' : 'hover:bg-bg-surface-hover'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-text-tertiary font-mono">
                    {new Date(s.updatedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-xs text-text-secondary truncate">{s.preview || '(빈 대화)'}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSession(s.id) }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-text-tertiary hover:text-red-400"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 메인 채팅 */}
      <div className="flex-1 flex flex-col">
        {/* 메시지 영역 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-clover-orange/20 to-clover-blue/20 flex items-center justify-center mb-3">
                <Sparkles size={24} className="text-clover-orange" />
              </div>
              <p className="text-sm font-medium text-text-primary mb-2">Clauday AI</p>
              <p className="text-xs text-text-secondary max-w-[280px] leading-relaxed mb-4">두레이 업무를 자연어로 관리하세요.</p>
              <div className="space-y-1.5">
                {['오늘 마감인 태스크 알려줘', 'NEON 프로젝트 진행중인 것들 정리해줘', '이번 주 업무 보고서 써줘'].map((ex) => (
                  <button key={ex} onClick={() => { setInput(ex); inputRef.current?.focus() }}
                    className="block w-full text-left text-[11px] text-text-secondary hover:text-clover-blue px-3 py-1.5 rounded-lg hover:bg-bg-surface transition-colors">
                    "{ex}"
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                msg.role === 'user' ? 'bg-clover-blue text-white rounded-br-sm' : 'bg-bg-surface border border-bg-border text-text-primary rounded-bl-sm'
              }`}>
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-1 mb-1.5">
                    <Sparkles size={10} className="text-clover-orange" />
                    <span className="text-[9px] font-semibold text-clover-orange">Clauday AI</span>
                  </div>
                )}
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-bg-surface border border-bg-border rounded-xl rounded-bl-sm px-3.5 py-2.5">
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Loader2 size={12} className="animate-spin text-clover-orange" /> Claude Code 분석 중...
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 입력 영역 */}
        <div className="border-t border-bg-border p-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSessions(!showSessions)}
              className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-bg-surface-hover transition-colors flex-shrink-0"
              title="대화 기록">
              <MessageSquare size={14} />
            </button>
            <button onClick={newSession}
              className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-bg-surface-hover transition-colors flex-shrink-0"
              title="새 대화">
              <RotateCcw size={14} />
            </button>
            <SkillQuickToggle target="chat" />
            <input ref={inputRef} type="text" value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
              placeholder="두레이 업무에 대해 물어보세요..."
              className="flex-1 px-3 py-2 bg-bg-surface border border-bg-border rounded-lg text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue transition-colors" />
            <button onClick={handleSend} disabled={!input.trim() || loading}
              className="p-2 rounded-lg bg-clover-blue text-white hover:bg-clover-blue/80 transition-colors disabled:opacity-30 flex-shrink-0">
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AIChat
