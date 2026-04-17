import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react'
import { Search, FolderOpen, MessageSquare, Clock, Hash, Loader2, ChevronRight, Copy, Check, Sparkles, RefreshCw } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Session {
  id: string
  project: string
  firstMsg: string
  timestamp: string
  lines: number
}

interface Message {
  role: string
  content: string
  timestamp: string
}

function SessionExplorer(): JSX.Element {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [renderCount, setRenderCount] = useState(50)
  const [summary, setSummary] = useState<string | null>(null)
  const [summarizing, setSummarizing] = useState(false)
  const [copied, setCopied] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setSessions(await window.api.claudeSessions.list()) }
    catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const handler = (): void => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) setRenderCount((p) => p + 50)
    }
    el.addEventListener('scroll', handler)
    return () => el.removeEventListener('scroll', handler)
  }, [])

  const selectSession = async (s: Session): Promise<void> => {
    setSelectedSession(s)
    setSummary(null)
    setLoadingDetail(true)
    try { setMessages(await window.api.claudeSessions.detail(s.id)) }
    catch { setMessages([]) }
    finally { setLoadingDetail(false) }
  }

  const summarizeSession = async (): Promise<void> => {
    if (!messages.length) return
    setSummarizing(true)
    try {
      const preview = messages.slice(0, 10).map((m) => `[${m.role}] ${m.content.substring(0, 200)}`).join('\n')
      const result = await window.api.ai.ask({
        prompt: `다음 Claude Code 세션의 대화를 한국어 3~5줄로 요약해줘. 무슨 작업을 했는지, 결과가 어땠는지 핵심만.\n\n${preview}`,
        feature: 'sessionSummary'
      })
      setSummary(result)
    } catch { setSummary('요약 실패') }
    finally { setSummarizing(false) }
  }

  // 프로젝트 목록 추출 (메모화)
  const projects = useMemo(() => [...new Set(sessions.map((s) => s.project))].sort(), [sessions])

  // 필터 (메모화, 소문자 변환을 루프 밖으로)
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return sessions.filter((s) => {
      if (projectFilter && s.project !== projectFilter) return false
      if (!q) return true
      return s.firstMsg.toLowerCase().includes(q) || s.project.toLowerCase().includes(q) || s.id.includes(q)
    })
  }, [sessions, projectFilter, search])

  const visible = useMemo(() => filtered.slice(0, renderCount), [filtered, renderCount])

  const formatTime = (ts: string): string => {
    if (!ts) return ''
    try {
      const d = new Date(ts)
      const now = new Date()
      const diff = now.getTime() - d.getTime()
      if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}분 전`
      if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}시간 전`
      if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 86400000)}일 전`
      return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    } catch { return '' }
  }

  return (
    <div className="h-full flex">
      {/* 좌측: 세션 목록 */}
      <div className="w-[380px] flex-shrink-0 border-r border-bg-border flex flex-col">
        {/* 헤더 */}
        <div className="px-4 py-3 border-b border-bg-border flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <MessageSquare size={15} className="text-clover-blue" />
              <h2 className="text-sm font-semibold text-text-primary">세션 탐색기</h2>
              <span className="text-[9px] text-text-tertiary">{filtered.length}/{sessions.length}</span>
            </div>
            <button onClick={load} className="p-1 rounded hover:bg-bg-surface-hover text-text-tertiary">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          {/* 검색 */}
          <div className="relative mb-2">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setRenderCount(50) }}
              placeholder="세션 검색 (내용, 프로젝트, ID)..."
              className="w-full pl-7 pr-2 py-1.5 bg-bg-surface border border-bg-border rounded-lg text-xs text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue" />
          </div>
          {/* 프로젝트 필터 */}
          <select value={projectFilter} onChange={(e) => { setProjectFilter(e.target.value); setRenderCount(50) }}
            className="w-full px-2 py-1 bg-bg-surface border border-bg-border rounded text-[10px] text-text-secondary focus:outline-none focus:border-clover-blue">
            <option value="">전체 프로젝트</option>
            {projects.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* 리스트 */}
        <div className="flex-1 overflow-y-auto" ref={listRef}>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-text-secondary text-sm gap-2">
              <Loader2 size={14} className="animate-spin" /> 세션 로딩 중...
            </div>
          ) : visible.length === 0 ? (
            <div className="text-text-tertiary text-xs text-center py-8">
              {search ? '검색 결과 없음' : '세션 없음'}
            </div>
          ) : (
            <>
              {visible.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  isSelected={selectedSession?.id === s.id}
                  onSelect={selectSession}
                  formattedTime={formatTime(s.timestamp)}
                />
              ))}
              {renderCount < filtered.length && (
                <div className="py-2 text-center text-[9px] text-text-tertiary">{visible.length}/{filtered.length} · 스크롤하면 더 표시</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 우측: 세션 상세 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedSession ? (
          <>
            <div className="px-4 py-3 border-b border-bg-border flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-primary font-medium line-clamp-1">{selectedSession.firstMsg}</p>
                  <div className="flex items-center gap-3 mt-1 text-[9px] text-text-tertiary">
                    <span><FolderOpen size={9} className="inline" /> {selectedSession.project}</span>
                    <span><Clock size={9} className="inline" /> {selectedSession.timestamp?.substring(0, 16)}</span>
                    <span className="font-mono">{selectedSession.id.substring(0, 8)}...</span>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={summarizeSession} disabled={summarizing || !messages.length}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-clover-orange/20 to-clover-blue/20 border border-clover-orange/30 text-[10px] font-medium text-text-primary disabled:opacity-40">
                    {summarizing ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} className="text-clover-orange" />}
                    AI 요약
                  </button>
                  <button onClick={async () => {
                    await navigator.clipboard.writeText(`claude -r ${selectedSession.id}`)
                    setCopied(true); setTimeout(() => setCopied(false), 2000)
                  }} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-bg-surface border border-bg-border text-[10px] text-text-secondary hover:text-text-primary">
                    {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                    resume 복사
                  </button>
                </div>
              </div>
              {summary && (
                <div className="mt-2 p-2.5 rounded-lg bg-gradient-to-r from-clover-orange/5 to-clover-blue/5 border border-clover-orange/20">
                  <div className="flex items-center gap-1 mb-1">
                    <Sparkles size={10} className="text-clover-orange" />
                    <span className="text-[9px] font-semibold text-clover-orange">AI 요약</span>
                  </div>
                  <p className="text-xs text-text-primary leading-relaxed">{summary}</p>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingDetail ? (
                <div className="flex items-center justify-center py-12 text-text-secondary text-sm gap-2">
                  <Loader2 size={14} className="animate-spin" /> 대화 로딩...
                </div>
              ) : messages.length === 0 ? (
                <div className="text-text-tertiary text-xs text-center py-8">메시지 없음</div>
              ) : messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    m.role === 'user' ? 'bg-clover-blue text-white rounded-br-sm' : 'bg-bg-surface border border-bg-border text-text-primary rounded-bl-sm'
                  }`}>
                    <div className="whitespace-pre-wrap break-words">{m.content.substring(0, 500)}{m.content.length > 500 ? '...' : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-text-secondary gap-2">
            <MessageSquare size={32} className="text-text-tertiary" />
            <p className="text-sm">좌측에서 세션을 선택하세요</p>
            <p className="text-[10px] text-text-tertiary">검색으로 원하는 세션을 빠르게 찾을 수 있습니다</p>
          </div>
        )}
      </div>
    </div>
  )
}

interface SessionRowProps {
  session: Session
  isSelected: boolean
  onSelect: (s: Session) => void
  formattedTime: string
}

const SessionRow = memo(function SessionRow({ session, isSelected, onSelect, formattedTime }: SessionRowProps) {
  return (
    <div
      onClick={() => onSelect(session)}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 60px' }}
      className={`px-4 py-2.5 border-b border-bg-border/50 cursor-pointer transition-colors ${
        isSelected ? 'bg-clover-blue/5' : 'hover:bg-bg-surface-hover'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-text-primary line-clamp-2 flex-1">{session.firstMsg}</p>
        <span className="text-[9px] text-text-tertiary flex-shrink-0">{formattedTime}</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[9px] text-text-tertiary flex items-center gap-0.5">
          <FolderOpen size={8} /> {session.project}
        </span>
        <span className="text-[9px] text-text-tertiary flex items-center gap-0.5">
          <Hash size={8} /> {session.lines}줄
        </span>
      </div>
    </div>
  )
})

export default SessionExplorer
