import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Radar, Plus, RefreshCw, Trash2, Edit3, Power, CheckCheck, Loader2, Bell, BellOff
} from 'lucide-react'
import type { Watcher, CollectedMessage } from '../../../../shared/types/watcher'
import { LoadingView, EmptyView } from '../common/StateViews'
import WatcherEditModal from './WatcherEditModal'
import MessageTimeline from './MessageTimeline'

function MonitoringView(): JSX.Element {
  const [watchers, setWatchers] = useState<Watcher[]>([])
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<CollectedMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [editing, setEditing] = useState<Watcher | null | 'new'>(null)

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

  // 새 메시지 실시간 수신
  useEffect(() => {
    return window.api.watcher.onNewMessages(({ watcherId }) => {
      window.api.watcher.unreadCounts().then(setUnread)
      if (watcherId === selectedId) loadMessages(watcherId)
    })
  }, [selectedId, loadMessages])

  const selected = useMemo(() => watchers.find((w) => w.id === selectedId) || null, [watchers, selectedId])

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      await window.api.watcher.refresh(selectedId || undefined)
      if (selectedId) await loadMessages(selectedId)
      setUnread(await window.api.watcher.unreadCounts())
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
              <p className="text-[10px] text-text-tertiary leading-tight">2분마다 자동 수집 · 3일 보관</p>
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
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {loading ? <LoadingView message="불러오는 중..." />
            : watchers.length === 0 ? (
              <EmptyView icon={Radar} title="와처가 없습니다"
                description="특정 채널의 특정 키워드만 모아보려면 '새 와처'를 만드세요"
                actionLabel="새 와처 만들기" onAction={() => setEditing('new')} />
            )
            : watchers.map((w) => {
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
      </div>

      {/* 타임라인 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selected ? (
          <EmptyView icon={Radar} title="와처를 선택하세요" description="왼쪽에서 와처를 선택하거나 새로 만드세요" />
        ) : (
          <>
            <div className="px-5 py-3 border-b border-bg-border flex items-center gap-3 flex-shrink-0">
              <Power size={13} className={selected.enabled ? 'text-emerald-400' : 'text-text-tertiary'} />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-text-primary truncate">{selected.name}</h3>
                <p className="text-[10px] text-text-tertiary truncate">
                  {selected.filter.description} · {selected.channelNames.join(', ')}
                </p>
              </div>
              <button onClick={handleRefresh} disabled={refreshing}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover disabled:opacity-50">
                <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
                {refreshing ? '수집 중...' : '지금 수집'}
              </button>
              {(unread[selected.id] || 0) > 0 && (
                <button onClick={handleMarkAllRead}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover">
                  <CheckCheck size={11} /> 모두 읽음
                </button>
              )}
            </div>

            <MessageTimeline messages={messages} onRefresh={handleRefresh} refreshing={refreshing} />
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
