import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Sparkles, History, PanelLeftClose, PanelLeftOpen, Edit3, Check, X, FolderOpen, RotateCcw, Star } from 'lucide-react'
import ClaudeChatPane from '../Terminal/ClaudeChatPane'

interface SessionMeta {
  sessionId: string
  cwd: string
  title: string
  customTitle?: string
  starred?: boolean
  lastActivityAt: string
  messageCount: number
}

const COLLAPSED_KEY = 'claude.sessions.sidebar.collapsed'

/**
 * Claude Code 채팅 + 세션 탐색기 통합 화면.
 *  - 좌측: 접었다 펴는 세션 사이드바 (새 채팅 + 이전 세션 리스트, rename 가능)
 *  - 우측: 활성 ClaudeChatPane (sessionId/cwd prop 으로 세션 결정)
 */
export default function ClaudeCodeSessionsView({ active = true }: { active?: boolean } = {}): JSX.Element {
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(COLLAPSED_KEY) === '1'
  )
  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [loading, setLoading] = useState(true)

  /** 현재 활성 채팅의 sessionId/cwd. null = 새 채팅(세션 없음) */
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [activeCwd, setActiveCwd] = useState<string>('')
  /** 새 채팅 시작 시 chatId 갱신해 ChatPane 리셋 */
  const [chatKey, setChatKey] = useState<string>(() => `c-${Date.now()}`)

  /** 세션 rename 진행 상태 */
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const loadSessions = useCallback(async (): Promise<SessionMeta[]> => {
    setLoading(true)
    try {
      const list = (await window.api.claude.sessionList()) || []
      setSessions(list)
      return list
    } catch {
      setSessions([])
      return []
    } finally { setLoading(false) }
  }, [])

  // 첫 로드 + 탭 진입 시 자동 갱신
  const wasActiveRef = useRef(active)
  useEffect(() => {
    void loadSessions()
  }, [loadSessions])
  useEffect(() => {
    if (active && !wasActiveRef.current) void loadSessions()
    wasActiveRef.current = active
  }, [active, loadSessions])

  const startNewChat = useCallback(async () => {
    // 새 채팅 시 작업 폴더(cwd)를 사용자가 명시적으로 선택. CLI에서 cd 후 claude 실행한 것과 동등.
    const picked = await window.api.dialog.selectFolder().catch(() => null)
    if (!picked) return  // 취소
    setActiveSessionId(null)
    setActiveCwd(picked)
    setChatKey(`c-${Date.now()}`)
  }, [])

  const openSession = useCallback((s: SessionMeta) => {
    setActiveSessionId(s.sessionId)
    setActiveCwd(s.cwd)
    setChatKey(s.sessionId) // 같은 세션 클릭은 ChatPane 유지, 다른 세션이면 새로
  }, [])

  const startRename = (s: SessionMeta): void => {
    setRenamingId(s.sessionId)
    setRenameDraft(s.customTitle || '')
  }
  const cancelRename = (): void => {
    setRenamingId(null)
    setRenameDraft('')
  }
  const commitRename = async (): Promise<void> => {
    if (!renamingId) return
    try {
      await window.api.claude.sessionRename(renamingId, renameDraft.trim())
      await loadSessions()
    } finally {
      cancelRename()
    }
  }

  const toggleStar = async (s: SessionMeta): Promise<void> => {
    try {
      await window.api.claude.sessionStar(s.sessionId, !s.starred)
      // optimistic 갱신
      setSessions((prev) => prev.map((x) =>
        x.sessionId === s.sessionId ? { ...x, starred: !s.starred } : x
      ))
    } catch (err) {
      console.warn('[ClaudeCodeSessionsView] 즐겨찾기 토글 실패:', err)
    }
  }

  const starredSessions = sessions.filter((s) => s.starred)
  const unstarredSessions = sessions.filter((s) => !s.starred)

  return (
    <div className="h-full flex bg-bg-primary relative">
      {/* 좌측 세션 사이드바 — 접혀있을 때도 좁은 컬럼으로 자리 차지 (absolute 안 씀) */}
      {collapsed ? (
        <aside className="w-12 flex-shrink-0 border-r border-bg-border flex flex-col items-center pt-3 gap-2">
          <button onClick={() => setCollapsed(false)}
            title="사이드바 열기"
            className="p-2 rounded-lg bg-bg-surface border border-bg-border hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary">
            <PanelLeftOpen size={18} />
          </button>
          <button onClick={startNewChat}
            title="새 채팅"
            className="p-2 rounded-lg text-white hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #fb923c 0%, #3b82f6 100%)' }}>
            <Plus size={16} />
          </button>
        </aside>
      ) : (
        <aside className="w-72 flex-shrink-0 border-r border-bg-border flex flex-col">
          <div className="px-3 py-2.5 border-b border-bg-border flex items-center gap-2">
            <Sparkles size={14} className="text-clover-orange" />
            <h2 className="text-xs font-bold text-text-primary flex-1">Claude Code</h2>
            <button onClick={() => setCollapsed(true)}
              className="p-1.5 rounded hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary"
              title="사이드바 닫기">
              <PanelLeftClose size={16} />
            </button>
          </div>
          <button onClick={startNewChat}
            className="mx-3 mt-3 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #fb923c 0%, #3b82f6 100%)' }}>
            <Plus size={13} />
            새 채팅
          </button>
          <div className="px-3 mt-3 mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
            <History size={10} />
            이전 세션 {sessions.length > 0 && `(${sessions.length})`}
            <div className="flex-1" />
            <button onClick={loadSessions} title="새로고침"
              className="hover:text-text-secondary">
              <RotateCcw size={10} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {loading ? (
              <div className="px-3 py-4 text-[11px] text-text-tertiary text-center">로딩...</div>
            ) : sessions.length === 0 ? (
              <div className="px-3 py-4 text-[11px] text-text-tertiary text-center">저장된 세션 없음</div>
            ) : (
              <>
                {starredSessions.length > 0 && (
                  <>
                    <div className="px-3 pt-1 pb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-clover-orange">
                      <Star size={10} className="fill-current" />
                      즐겨찾기 ({starredSessions.length})
                    </div>
                    {starredSessions.map((s) => (
                      <SessionRow
                        key={s.sessionId}
                        session={s}
                        isActive={s.sessionId === activeSessionId}
                        isRenaming={s.sessionId === renamingId}
                        renameDraft={renameDraft}
                        setRenameDraft={setRenameDraft}
                        onOpen={() => openSession(s)}
                        onStartRename={() => startRename(s)}
                        onCommitRename={() => void commitRename()}
                        onCancelRename={cancelRename}
                        onToggleStar={() => void toggleStar(s)}
                      />
                    ))}
                    <div className="my-1 mx-3 border-t border-bg-border" />
                  </>
                )}
                {unstarredSessions.length > 0 && (
                  <>
                    {starredSessions.length > 0 && (
                      <div className="px-3 pt-1 pb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                        <History size={10} />
                        전체 ({unstarredSessions.length})
                      </div>
                    )}
                    {unstarredSessions.map((s) => (
                      <SessionRow
                        key={s.sessionId}
                        session={s}
                        isActive={s.sessionId === activeSessionId}
                        isRenaming={s.sessionId === renamingId}
                        renameDraft={renameDraft}
                        setRenameDraft={setRenameDraft}
                        onOpen={() => openSession(s)}
                        onStartRename={() => startRename(s)}
                        onCommitRename={() => void commitRename()}
                        onCancelRename={cancelRename}
                        onToggleStar={() => void toggleStar(s)}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </aside>
      )}

      {/* 우측 채팅 영역 */}
      <div className="flex-1 relative">
        {!activeCwd ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-text-tertiary">
            <Sparkles size={36} className="text-clover-orange/60" />
            <div className="text-center">
              <div className="text-sm font-medium text-text-primary">Claude Code</div>
              <div className="text-[11px] mt-1">왼쪽에서 이전 세션을 고르거나 "새 채팅"을 시작하세요</div>
            </div>
            <button onClick={startNewChat}
              className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #fb923c 0%, #3b82f6 100%)' }}>
              <Plus size={13} /> 새 채팅
            </button>
          </div>
        ) : (
          <ClaudeChatPane
            key={chatKey}
            isActive
            chatId={chatKey}
            cwd={activeCwd}
            initialSessionId={activeSessionId || undefined}
            hideHistoryButton
          />
        )}
      </div>
    </div>
  )
}

/** 세션 사이드바의 단일 row — rename 인풋, ★, ✏️ 모두 처리 */
function SessionRow({
  session,
  isActive,
  isRenaming,
  renameDraft,
  setRenameDraft,
  onOpen,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onToggleStar
}: {
  session: SessionMeta
  isActive: boolean
  isRenaming: boolean
  renameDraft: string
  setRenameDraft: (s: string) => void
  onOpen: () => void
  onStartRename: () => void
  onCommitRename: () => void
  onCancelRename: () => void
  onToggleStar: () => void
}): JSX.Element {
  const displayTitle = session.customTitle || session.title || '(제목 없음)'

  if (isRenaming) {
    return (
      <div className={`px-3 py-2 border-l-2 ${isActive ? 'bg-clover-orange/10 border-clover-orange' : 'border-transparent'}`}>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <input
            autoFocus
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === 'Enter') { e.preventDefault(); onCommitRename() }
              else if (e.key === 'Escape') { e.preventDefault(); onCancelRename() }
            }}
            placeholder={session.title || '세션 이름'}
            className="flex-1 px-2 py-0.5 rounded text-[11px] bg-bg-primary border border-bg-border text-text-primary focus:outline-none focus:border-clover-orange"
          />
          <button onClick={onCommitRename}
            className="p-1 rounded hover:bg-emerald-500/15 text-emerald-400">
            <Check size={11} />
          </button>
          <button onClick={onCancelRename}
            className="p-1 rounded hover:bg-red-500/15 text-text-tertiary">
            <X size={11} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={onOpen}
      className={`group cursor-pointer px-3 py-2 transition-colors border-l-2 ${
        isActive
          ? 'bg-clover-orange/10 border-clover-orange'
          : 'border-transparent hover:bg-bg-surface-hover'
      }`}
    >
      <div className="flex items-start gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleStar() }}
          title={session.starred ? '즐겨찾기 해제' : '즐겨찾기 추가'}
          className={`p-1 rounded hover:bg-bg-surface flex-none transition-colors ${
            session.starred ? 'text-clover-orange' : 'text-text-tertiary hover:text-clover-orange'
          }`}
        >
          <Star size={13} className={session.starred ? 'fill-current' : ''} />
        </button>
        <div className={`flex-1 text-[12px] line-clamp-2 leading-tight ${isActive ? 'text-clover-orange font-medium' : 'text-text-primary'}`}>
          {displayTitle}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onStartRename() }}
          title="이름 변경"
          className="p-1 rounded hover:bg-bg-surface text-text-tertiary hover:text-text-primary flex-none">
          <Edit3 size={12} />
        </button>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-text-tertiary mt-0.5 pl-6">
        <span>{formatRelative(session.lastActivityAt)}</span>
        <span>·</span>
        <span>{session.messageCount}개</span>
      </div>
    </div>
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
