import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Radar, Plus, RefreshCw, Trash2, Edit3, Power, CheckCheck, Bell, BellOff, Pause, Play, Search, Download, X
} from 'lucide-react'
import type { Watcher, CollectedMessage } from '../../../../shared/types/watcher'
import { LoadingView, EmptyView } from '../common/StateViews'
import WatcherEditModal from './WatcherEditModal'
import MessageTimeline from './MessageTimeline'
import SocketModeBadge from './SocketModeBadge'
import { Button } from '../common/ds'

function MonitoringView({ active = true }: { active?: boolean } = {}): JSX.Element {
  const [watchers, setWatchers] = useState<Watcher[]>([])
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<CollectedMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [editing, setEditing] = useState<Watcher | null | 'new'>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // 필터바 상태 (클라이언트 사이드 임시 필터 — 와처 자체 규칙은 건드리지 않음)
  // 와처는 RETENTION_MS=3일치 데이터만 보유하므로 날짜 범위 필터는 제공하지 않는다.
  const [extraKeywords, setExtraKeywords] = useState<string[]>([])
  const [kwDraft, setKwDraft] = useState('')

  const totalUnread = useMemo(() => Object.values(unread).reduce((a, b) => a + b, 0), [unread])
  const filteredWatchers = useMemo(() => {
    if (!searchQuery.trim()) return watchers
    const q = searchQuery.toLowerCase()
    return watchers.filter((w) =>
      w.name.toLowerCase().includes(q) ||
      w.channelNames.some((n) => n.toLowerCase().includes(q)) ||
      (w.filter.description || '').toLowerCase().includes(q)
    )
  }, [watchers, searchQuery])

  const loadWatchers = useCallback(async () => {
    setLoading(true)
    try {
      const [list, counts] = await Promise.all([
        window.api.watcher.list(),
        window.api.watcher.unreadCounts()
      ])
      setWatchers(list)
      setUnread(counts)
      if (!selectedId && list.length > 0) setSelectedId(list[0].id)
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  const loadMessages = useCallback(async (id: string) => {
    const msgs = await window.api.watcher.messages(id)
    setMessages(msgs)
  }, [])

  useEffect(() => { loadWatchers() }, [loadWatchers])

  useEffect(() => {
    if (!selectedId) return
    loadMessages(selectedId)
  }, [selectedId, loadMessages])

  // 모니터링 탭은 App에서 visibility만 토글되어 unmount되지 않는다.
  // 탭 진입 시(false→true) 백그라운드 폴링이 누락한 메시지를 즉시 catch-up.
  const wasActiveRef = useRef(active)
  useEffect(() => {
    if (active && !wasActiveRef.current) {
      void (async () => {
        try {
          await window.api.watcher.refresh(selectedId || undefined)
        } catch { /* ok */ }
        await loadWatchers()
        if (selectedId) await loadMessages(selectedId)
      })()
    }
    wasActiveRef.current = active
  }, [active, selectedId, loadWatchers, loadMessages])

  // 새 메시지 실시간 수신
  useEffect(() => {
    return window.api.watcher.onNewMessages(({ watcherId }) => {
      window.api.watcher.unreadCounts().then(setUnread)
      if (watcherId === selectedId) loadMessages(watcherId)
    })
  }, [selectedId, loadMessages])

  const selected = useMemo(() => watchers.find((w) => w.id === selectedId) || null, [watchers, selectedId])

  // 선택 와처의 저장된 키워드 + 사용자가 임시로 추가한 키워드
  const savedKeywords = useMemo(() => {
    if (!selected) return []
    const any = selected.filter.anyOf || []
    const all = selected.filter.allOf || []
    return Array.from(new Set([...any, ...all]))
  }, [selected])

  const activeKeywords = useMemo(
    () => Array.from(new Set([...savedKeywords, ...extraKeywords])),
    [savedKeywords, extraKeywords]
  )

  // 와처 변경 시 필터 상태 초기화
  useEffect(() => {
    setExtraKeywords([])
    setKwDraft('')
  }, [selectedId])

  // 필터 적용된 메시지.
  // 추가 키워드끼리는 AND — 결과를 점점 좁히는 일관된 모델.
  // (저장 키워드 vs 추가 키워드도 암묵적 AND: 메시지는 이미 와처 규칙으로 필터된 상태)
  const filteredMessages = useMemo(() => {
    if (extraKeywords.length === 0) return messages
    const lowers = extraKeywords.map((k) => k.toLowerCase())
    return messages.filter((m) => {
      const text = m.text.toLowerCase()
      return lowers.every((k) => text.includes(k))
    })
  }, [messages, extraKeywords])

  const addKeyword = (): void => {
    const k = kwDraft.trim()
    if (!k) return
    if (activeKeywords.includes(k)) { setKwDraft(''); return }
    setExtraKeywords((xs) => [...xs, k])
    setKwDraft('')
  }
  const removeKeyword = (k: string): void => {
    // saved 키워드는 못 지움 (필터 규칙에 저장된 것) — UI로만 제거는 제공 안 함
    setExtraKeywords((xs) => xs.filter((x) => x !== k))
  }

  const handleRefresh = async (): Promise<void> => {
    console.log(`[Monitoring] 새로고침 클릭 watcherId=${selectedId || '(전체)'}`)
    const t0 = performance.now()
    setRefreshing(true)
    try {
      await window.api.watcher.refresh(selectedId || undefined)
      if (selectedId) await loadMessages(selectedId)
      setUnread(await window.api.watcher.unreadCounts())
      console.log(`[Monitoring] 새로고침 완료 (${(performance.now() - t0).toFixed(0)}ms)`)
    } finally {
      setRefreshing(false)
    }
  }

  const handleToggle = async (w: Watcher): Promise<void> => {
    await window.api.watcher.update(w.id, { enabled: !w.enabled })
    loadWatchers()
  }

  const handleDelete = async (w: Watcher): Promise<void> => {
    if (!window.confirm(`"${w.name}" 와처를 삭제할까요? 수집된 메시지도 모두 제거됩니다.`)) return
    await window.api.watcher.delete(w.id)
    if (selectedId === w.id) setSelectedId(null)
    loadWatchers()
  }

  const handleMarkAllRead = async (): Promise<void> => {
    if (!selectedId) return
    await window.api.watcher.markAllRead(selectedId)
    await loadMessages(selectedId)
    setUnread(await window.api.watcher.unreadCounts())
  }

  const handleEditSaved = (): void => {
    setEditing(null)
    loadWatchers()
  }

  const handleExportCsv = (): void => {
    if (!selected || filteredMessages.length === 0) return
    const esc = (s: string): string => `"${(s || '').replace(/"/g, '""')}"`
    const header = ['시각', '채널', '작성자', '본문', '매치 키워드'].join(',')
    const rows = filteredMessages.map((m) => [
      new Date(m.createdAt).toLocaleString('ko-KR'),
      m.channelName,
      m.authorName,
      m.text.replace(/\n/g, ' '),
      m.matchedTerms.join(' ')
    ].map(esc).join(','))
    const csv = '\uFEFF' + [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selected.name}-${new Date().toISOString().substring(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const newCount = useMemo(() => filteredMessages.filter((m) => !m.read).length, [filteredMessages])
  const lastScanText = useMemo(() => {
    if (!selected?.lastCheckedAt) return '아직 스캔 전'
    const diff = Date.now() - new Date(selected.lastCheckedAt).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return '방금 전'
    if (m < 60) return `${m}분 전`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}시간 전`
    return new Date(selected.lastCheckedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }, [selected])

  return (
    <div className="h-full flex bg-bg-primary">
      {/* 와처 목록 */}
      <div className="w-72 flex-shrink-0 border-r border-bg-border flex flex-col">
        <div className="px-4 pt-4 pb-3 border-b border-bg-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-clover-orange/10 border border-clover-orange/30">
              <Radar size={14} className="text-clover-orange" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-text-primary leading-tight">모니터링</h2>
              <p className="text-[10px] text-text-tertiary leading-tight">실시간 수신 · 3일 보관</p>
            </div>
            <button onClick={handleRefresh} disabled={refreshing}
              className="p-1.5 rounded-lg hover:bg-bg-surface text-text-tertiary hover:text-text-secondary disabled:opacity-40"
              title="새로고침">
              <RefreshCw size={13} className={refreshing ? 'animate-spin text-clover-blue' : ''} />
            </button>
          </div>
          <button onClick={() => setEditing('new')}
            className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-clover-orange to-clover-blue hover:opacity-90 transition-opacity">
            <Plus size={12} />
            새 와처
          </button>
          {/* Socket Mode (실시간 push) — 도메인 입력 + 상태 표시 */}
          <div className="mt-2">
            <SocketModeBadge />
          </div>
          <div className="mt-2 relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="와처 검색..."
              className="ds-input sm"
              style={{ paddingLeft: 26 }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {loading ? <LoadingView message="불러오는 중..." />
            : watchers.length === 0 ? (
              <EmptyView icon={Radar} title="와처가 없습니다"
                description="특정 채널의 특정 키워드만 모아보려면 '새 와처'를 만드세요"
                actionLabel="새 와처 만들기" onAction={() => setEditing('new')} />
            )
            : filteredWatchers.length === 0 ? (
              <div className="px-4 py-6 text-center text-[11px] text-text-tertiary">검색 결과 없음</div>
            )
            : filteredWatchers.map((w) => {
                const active = w.id === selectedId
                const count = unread[w.id] || 0
                return (
                  <div key={w.id}
                    className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors border-l-2 ${
                      active ? 'bg-clover-orange/10 border-clover-orange' : 'hover:bg-bg-surface border-transparent'
                    }`}
                    onClick={() => setSelectedId(w.id)}>
                    <button onClick={(e) => { e.stopPropagation(); handleToggle(w) }}
                      className={`p-0.5 rounded transition-colors ${w.enabled ? 'text-emerald-400 hover:text-emerald-300' : 'text-text-tertiary hover:text-text-secondary'}`}
                      title={w.enabled ? '활성' : '비활성'}>
                      {w.enabled ? <Bell size={12} /> : <BellOff size={12} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-medium truncate ${active ? 'text-clover-orange' : 'text-text-primary'}`}>
                        {w.name}
                      </div>
                      <div className="text-[9px] text-text-tertiary truncate">
                        {w.channelNames.length}개 채널 · {w.filter.description || '규칙 없음'}
                      </div>
                    </div>
                    {count > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-clover-orange text-white font-bold">
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); setEditing(w) }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-bg-surface-hover text-text-tertiary hover:text-text-primary"
                      title="수정">
                      <Edit3 size={11} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(w) }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-text-tertiary hover:text-red-400"
                      title="삭제">
                      <Trash2 size={11} />
                    </button>
                  </div>
                )
              })
          }
        </div>

        {watchers.length > 0 && (
          <div className="px-4 py-2 border-t border-bg-border text-[10px] text-text-tertiary flex-shrink-0">
            총 와처 {watchers.length} · 신규 {totalUnread}
          </div>
        )}
      </div>

      {/* 타임라인 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selected ? (
          <EmptyView icon={Radar} title="와처를 선택하세요" description="왼쪽에서 와처를 선택하거나 새로 만드세요" />
        ) : (
          <>
            <div className="px-5 py-2.5 border-b border-bg-border flex items-center gap-2 flex-shrink-0">
              <Power size={14} className={selected.enabled ? 'text-emerald-400' : 'text-text-tertiary'} />
              <div className="flex-1 min-w-0">
                <h3 className="text-[13px] font-semibold text-text-primary truncate leading-tight">{selected.name}</h3>
                <p className="text-[10px] text-text-tertiary truncate">
                  {selected.filter.description || '규칙 없음'} · 채널 {selected.channelNames.length}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleToggle(selected)}
                leftIcon={selected.enabled ? <Pause size={12} /> : <Play size={12} />}>
                {selected.enabled ? '일시정지' : '활성화'}
              </Button>
              {(unread[selected.id] || 0) > 0 && (
                <Button variant="ghost" size="sm" onClick={handleMarkAllRead}
                  leftIcon={<CheckCheck size={12} />}>
                  모두 읽음
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={refreshing}
                leftIcon={<RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />}>
                {refreshing ? '수집 중...' : '지금 수집'}
              </Button>
            </div>

            {/* Filter bar — 키워드만 (날짜 범위는 보관 기한이 3일이라 제공 안 함) */}
            <div className="px-5 py-2 border-b border-bg-border flex items-center gap-2 flex-wrap flex-shrink-0">
              <div className="flex items-center gap-1 flex-wrap px-1.5 py-1 rounded-md bg-bg-surface border border-bg-border" style={{ minWidth: 260, flex: 1 }}>
                <Search size={12} className="text-text-tertiary flex-none mx-1" />
                {activeKeywords.map((k) => {
                  const saved = savedKeywords.includes(k)
                  return (
                    <span key={k} className="inline-flex items-center gap-1 h-5 px-1.5 rounded-[4px] font-mono text-[10.5px] font-semibold"
                      style={{ background: 'rgba(234,88,12,0.14)', color: '#FB923C' }}>
                      {k}
                      {!saved && (
                        <button onClick={() => removeKeyword(k)} className="opacity-70 hover:opacity-100" aria-label="키워드 제거">
                          <X size={10} />
                        </button>
                      )}
                    </span>
                  )
                })}
                <input
                  value={kwDraft}
                  onChange={(e) => setKwDraft(e.target.value)}
                  onKeyDown={(e) => {
                    // 한글 IME 조합 중에는 Enter가 조합 확정으로 취급되어
                    // 두 번 트리거된다. composition 중이면 무시.
                    // (e.g. "배포" 입력 후 Enter → "배포" + "포" 두 번 add 되던 버그)
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return
                    if (e.key === 'Enter') { e.preventDefault(); addKeyword() }
                  }}
                  placeholder="결과 좁히기 (AND)… 키워드 입력 후 Enter"
                  title="여기에 추가한 키워드는 이미 수집된 결과를 더 좁힙니다 (AND 필터)"
                  className="bg-transparent border-0 outline-none text-[11.5px] text-text-primary placeholder-text-tertiary"
                  style={{ minWidth: 80, height: 20, flex: 1 }}
                />
              </div>
            </div>

            {/* Stats row */}
            <div className="px-5 py-1.5 border-b border-bg-border flex items-center gap-2 flex-shrink-0 text-[10px] text-text-tertiary">
              <span>매치된 메시지 <span className="text-text-secondary font-semibold">{filteredMessages.length}</span>{messages.length !== filteredMessages.length && <span className="text-text-tertiary"> / {messages.length}</span>}</span>
              {newCount > 0 && <span>· 신규 <span className="text-clover-orange font-semibold">{newCount}</span></span>}
              <span>· 마지막 스캔: {lastScanText}</span>
              <div className="flex-1" />
              <button
                onClick={handleExportCsv}
                disabled={filteredMessages.length === 0}
                className="flex items-center gap-1 text-text-tertiary hover:text-text-secondary disabled:opacity-40 disabled:hover:text-text-tertiary"
              >
                <Download size={11} />
                CSV 내보내기
              </button>
            </div>

            <MessageTimeline messages={filteredMessages} onRefresh={handleRefresh} refreshing={refreshing} />
          </>
        )}
      </div>

      {editing !== null && (
        <WatcherEditModal
          watcher={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={handleEditSaved}
        />
      )}
    </div>
  )
}

export default MonitoringView
