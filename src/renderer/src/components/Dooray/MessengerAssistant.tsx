import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  MessageCircle, RefreshCw, Search, Send, Sparkles, Users, Hash, Lock, CheckCircle2, AlertCircle, Loader2
} from 'lucide-react'
import type { DoorayChannel } from '../../../../shared/types/messenger'
import { LoadingView, ErrorView, EmptyView } from '../common/StateViews'
import SkillQuickToggle from './SkillQuickToggle'
import AIProgressIndicator from '../common/AIProgressIndicator'
import { useAIProgress } from '../../hooks/useAIProgress'

const CHANNEL_TYPE_ICON: Record<string, typeof Hash> = {
  private: Lock,
  public: Hash
}

function MessengerAssistant(): JSX.Element {
  const [channels, setChannels] = useState<DoorayChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [instruction, setInstruction] = useState('')
  const [composed, setComposed] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const { progress, start, done, isActive: composing } = useAIProgress()

  const load = useCallback(async (force = false) => {
    setLoading(true); setError(null)
    try {
      const list = await window.api.messenger.listChannels(force)
      setChannels(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : '채널 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    if (!search) return channels
    const q = search.toLowerCase()
    return channels.filter((c) => (c.displayName || c.title || '').toLowerCase().includes(q))
  }, [channels, search])

  const selected = useMemo(() => channels.find((c) => c.id === selectedId) || null, [channels, selectedId])

  const handleCompose = async (): Promise<void> => {
    if (!instruction.trim()) return
    setStatus(null)
    const reqId = start()
    try {
      const text = await window.api.messenger.composeWithAI(instruction, selected?.displayName, reqId)
      setComposed(text.trim())
    } catch (err) {
      setStatus({ type: 'err', text: err instanceof Error ? err.message : 'AI 작성 실패' })
    } finally {
      done()
    }
  }

  const handleSend = async (): Promise<void> => {
    if (!selectedId || !composed.trim()) return
    setSending(true); setStatus(null)
    try {
      await window.api.messenger.send(selectedId, composed, selected?.organizationId)
      setStatus({ type: 'ok', text: `${selected?.displayName}에 전송됨` })
      setComposed('')
      setInstruction('')
    } catch (err) {
      setStatus({ type: 'err', text: err instanceof Error ? err.message : '전송 실패' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="h-full flex bg-bg-primary">
      {/* 채널 목록 */}
      <div className="w-72 flex-shrink-0 border-r border-bg-border flex flex-col">
        <div className="px-4 pt-4 pb-3 border-b border-bg-border flex-shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-clover-blue/10 border border-clover-blue/30">
              <MessageCircle size={14} className="text-clover-blue" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-text-primary leading-tight">메신저</h2>
              <p className="text-[10px] text-text-tertiary leading-tight">AI 메시지 작성 · 채널 발송</p>
            </div>
            <button onClick={() => load(true)} disabled={loading}
              className="p-1.5 rounded-lg hover:bg-bg-surface text-text-tertiary hover:text-text-secondary disabled:opacity-40">
              <RefreshCw size={13} className={loading ? 'animate-spin text-clover-blue' : ''} />
            </button>
          </div>
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="채널 검색..."
              className="w-full pl-7 pr-3 py-1.5 rounded-lg text-xs bg-bg-surface border border-bg-border text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {loading ? <LoadingView message="채널 불러오는 중..." />
            : error ? <ErrorView message={error} onRetry={() => load(true)} />
            : filtered.length === 0 ? <EmptyView icon={Users} title="채널 없음" description={search ? '검색 결과가 없습니다' : '두레이 메신저 채널이 없습니다'} />
            : filtered.map((c) => {
                const Icon = CHANNEL_TYPE_ICON[c.type || 'public'] || Hash
                const active = c.id === selectedId
                return (
                  <button key={c.id} onClick={() => setSelectedId(c.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                      active ? 'bg-clover-blue/10 border-l-2 border-clover-blue' : 'hover:bg-bg-surface border-l-2 border-transparent'
                    }`}>
                    <Icon size={12} className={active ? 'text-clover-blue' : 'text-text-tertiary'} />
                    <span className={`flex-1 min-w-0 truncate text-xs ${active ? 'text-clover-blue font-medium' : 'text-text-primary'}`}>
                      {c.displayName || c.title}
                    </span>
                    {!!c.unreadCount && c.unreadCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-clover-orange/20 text-clover-orange font-bold">
                        {c.unreadCount}
                      </span>
                    )}
                  </button>
                )
              })
          }
        </div>
      </div>

      {/* 작성 영역 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 전역 스킬 바 — 모든 채널에 공통 적용됨을 명시 */}
        <div className="px-5 py-2 border-b border-bg-border bg-bg-surface/40 flex items-center gap-2 flex-shrink-0">
          <Sparkles size={11} className="text-clover-orange" />
          <span className="text-[10px] text-text-tertiary">AI 메시지 작성 스킬</span>
          <span className="text-[10px] text-text-tertiary/70">(모든 채널 공통 적용)</span>
          <div className="ml-auto">
            <SkillQuickToggle target="messenger" />
          </div>
        </div>

        {!selected ? (
          <EmptyView icon={MessageCircle} title="채널을 선택하세요" description="왼쪽에서 메시지를 보낼 채널을 선택하세요" />
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b border-bg-border flex items-center gap-2 flex-shrink-0">
              <Hash size={14} className="text-clover-blue" />
              <h3 className="text-sm font-semibold text-text-primary">{selected.displayName}</h3>
              <span className="text-[10px] text-text-tertiary">· {selected.type || 'channel'}</span>
            </div>

            <div className="flex-1 flex flex-col px-5 py-4 gap-3 overflow-hidden">
              {/* Step 1: Instruction */}
              <div className="flex flex-col flex-shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded-full bg-clover-blue/15 text-clover-blue text-[10px] font-bold flex items-center justify-center">1</div>
                  <label className="text-xs font-semibold text-text-primary">무엇을 전달할까요?</label>
                  <div className="ml-auto">
                    <button onClick={handleCompose} disabled={composing || !instruction.trim()}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-clover-orange to-clover-blue disabled:opacity-40 hover:opacity-90 transition-opacity">
                      {composing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      {composing ? 'AI 작성 중...' : 'AI로 정리하기'}
                    </button>
                  </div>
                </div>
                <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)}
                  placeholder="예) 오늘 배포 지연 사과, 원인 DB 마이그레이션 지연, 내일 오전 재시도 예정"
                  className="w-full h-28 px-3 py-2.5 rounded-xl bg-bg-surface border border-bg-border text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue resize-none"
                />
              </div>

              {/* Step 2: Composed message — flex-1로 남은 공간 전부 차지 */}
              <div className="flex flex-col flex-1 min-h-0">
                <div className="flex items-center gap-2 mb-2 flex-shrink-0">
                  <div className="w-5 h-5 rounded-full bg-clover-blue/15 text-clover-blue text-[10px] font-bold flex items-center justify-center">2</div>
                  <label className="text-xs font-semibold text-text-primary">발송할 메시지</label>
                  <span className="text-[10px] text-text-tertiary">
                    {composing ? '(AI 작업 중 — 필요시 웹 조사)' : '(검토 후 수정 가능)'}
                  </span>
                </div>
                {composing ? (
                  <div className="flex-1 min-h-0 overflow-y-auto rounded-xl bg-bg-surface border border-bg-border p-3">
                    <AIProgressIndicator
                      progress={progress}
                      showStreamPreview
                      expectedTime="요청에 웹 조사가 포함되면 1~3분 걸릴 수 있어요."
                    />
                  </div>
                ) : (
                  <textarea value={composed} onChange={(e) => setComposed(e.target.value)}
                    placeholder="AI가 정리한 메시지가 여기에 표시됩니다. 직접 작성도 가능합니다."
                    className="w-full flex-1 min-h-0 px-3 py-2.5 rounded-xl bg-bg-surface border border-bg-border text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue resize-none font-mono leading-relaxed"
                  />
                )}
              </div>

              {status && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs flex-shrink-0 ${
                  status.type === 'ok' ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/30'
                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}>
                  {status.type === 'ok' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                  {status.text}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-bg-border bg-bg-surface/50 flex items-center justify-between flex-shrink-0">
              <span className="text-[10px] text-text-tertiary">
                {composed.length > 0 ? `${composed.length}자` : '메시지를 입력하세요'}
              </span>
              <button onClick={handleSend} disabled={sending || !composed.trim() || !selectedId}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-clover-blue hover:bg-clover-blue/90 disabled:opacity-40 transition-opacity">
                {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                {sending ? '전송 중...' : '전송'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MessengerAssistant
