import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Clock, MapPin, AlertCircle, CalendarDays, Sparkles, Loader2, Settings, Check, FolderOpen } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { DoorayCalendarEvent } from '../../../../shared/types/dooray'
import SkillQuickToggle from './SkillQuickToggle'

// API 캘린더 목록 + 이벤트에서 추출한 캘린더 합산
function CalendarFilter({ events, filterIds, onFilter }: {
  events: DoorayCalendarEvent[]; filterIds: string[]; onFilter: (ids: string[]) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [apiCalendars, setApiCalendars] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    window.api.dooray.calendar.list().then((cals) =>
      setApiCalendars(cals.map((c) => ({ id: c.id, name: c.name })))
    )
  }, [])

  // API 목록 + 이벤트에서 추출한 캘린더 합산 (중복 제거)
  const eventCalMap = new Map(events.filter((e) => e.calendar?.id).map((e) => [e.calendar!.id, e.calendar!.name]))
  const allMap = new Map<string, string>()
  for (const c of apiCalendars) allMap.set(c.id, c.name)
  for (const [id, name] of eventCalMap) allMap.set(id, name)

  // 이벤트 수 카운트
  const countMap = new Map<string, number>()
  for (const e of events) {
    const cid = e.calendar?.id
    if (cid) countMap.set(cid, (countMap.get(cid) || 0) + 1)
  }

  // 정렬: 이벤트 있는 것 먼저, 그 안에서 이름순
  const calendars = Array.from(allMap.entries())
    .map(([id, name]) => ({ id, name, count: countMap.get(id) || 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  const toggle = (id: string): void => {
    onFilter(filterIds.includes(id) ? filterIds.filter((p) => p !== id) : [...filterIds, id])
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className={`p-1.5 rounded-lg hover:bg-bg-surface-hover transition-colors ${filterIds.length > 0 ? 'text-clover-blue' : 'text-text-tertiary'}`}
        title="표시할 캘린더 선택">
        <Settings size={13} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-64 bg-[#151c2c] border border-[#2d3a52] rounded-xl shadow-2xl z-40 overflow-hidden">
            <div className="px-3 py-2 border-b border-[#2d3a52] bg-[#1a2238]">
              <span className="text-[11px] font-semibold text-gray-100">표시할 캘린더 선택</span>
              <span className="text-[9px] text-gray-500 ml-2">{filterIds.length > 0 ? `${filterIds.length}개` : '전체'}</span>
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {calendars.map((c) => (
                <button key={c.id} onClick={() => toggle(c.id)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#1e2840] text-left">
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${filterIds.includes(c.id) ? 'bg-blue-500 border-blue-500' : 'border-gray-600'}`}>
                    {filterIds.includes(c.id) && <Check size={9} className="text-white" />}
                  </div>
                  <span className={`text-[11px] truncate flex-1 ${filterIds.includes(c.id) ? 'text-gray-100' : 'text-gray-400'}`}>{c.name}</span>
                  {c.count > 0 && <span className="text-[9px] text-gray-500 flex-shrink-0">{c.count}</span>}
                </button>
              ))}
            </div>
            <div className="px-3 py-1.5 border-t border-[#2d3a52] text-[9px] text-gray-500">선택 없으면 전체 표시</div>
          </div>
        </>
      )}
    </div>
  )
}

function getStart(e: DoorayCalendarEvent): string { return e.startedAt || e.startAt || '' }
function getEnd(e: DoorayCalendarEvent): string { return e.endedAt || e.endAt || '' }

// "2026-04-21+09:00" → "2026-04-21T00:00:00+09:00" (종일 이벤트 날짜 보정)
function fixDate(s: string): Date {
  if (!s) return new Date(NaN)
  const fixed = s.replace(/^(\d{4}-\d{2}-\d{2})([+-]\d{2}:\d{2})$/, '$1T00:00:00$2')
  return new Date(fixed)
}

// 로컬 날짜 키 (YYYY-MM-DD)
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function safeTime(iso: string): string {
  if (!iso) return ''
  try { const d = fixDate(iso); return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}
function safeDate(iso: string): string {
  if (!iso) return ''
  try { const d = fixDate(iso); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }) } catch { return '' }
}

function CalendarAssistant(): JSX.Element {
  const [events, setEvents] = useState<DoorayCalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterIds, setFilterIds] = useState<string[]>([])
  const [filterLoaded, setFilterLoaded] = useState(false)

  // 저장된 필터 로드
  useEffect(() => {
    window.api.settings.get('pinnedCalendars').then((saved) => {
      setFilterIds((saved as string[]) || [])
      setFilterLoaded(true)
    })
  }, [])

  // 필터 변경 시 저장
  useEffect(() => {
    if (filterLoaded) {
      window.api.settings.set('pinnedCalendars', filterIds)
    }
  }, [filterIds, filterLoaded])
  // AI
  const [aiResult, setAiResult] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  const loadEvents = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const endOfWeek = new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000)
      const list = await window.api.dooray.calendar.events({ from: startOfDay.toISOString(), to: endOfWeek.toISOString() })
      setEvents(list || [])
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setEvents([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadEvents() }, [loadEvents])

  // AI 일정 분석
  const runAiAnalysis = async (): Promise<void> => {
    if (events.length === 0) return
    setAiLoading(true); setAiResult(null)
    try {
      const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
      // 날짜별로 그룹핑해서 AI에게 전달
      const lines: string[] = []
      const sortedDates = Object.entries(groupedByDate).sort(([a], [b]) => a.localeCompare(b))
      for (const [dk, dayEvts] of sortedDates) {
        const dateLabel = safeDate(dk + 'T00:00:00+09:00')
        const isTodayDate = dk === todayKey
        lines.push(`\n### ${dateLabel}${isTodayDate ? ' (오늘)' : ''}`)
        for (const e of dayEvts) {
          const s = getStart(e), en = getEnd(e)
          const evStart = fixDate(s), evEnd = fixDate(en)
          const isLong = !isNaN(evEnd.getTime()) && (evEnd.getTime() - evStart.getTime() > 2 * 24 * 60 * 60 * 1000)
          const timeStr = isLong ? `${safeDate(s)} ~ ${safeDate(en)}` : e.wholeDayFlag ? '종일' : `${safeTime(s)}-${safeTime(en)}`
          lines.push(`- ${timeStr} | ${e.subject || '?'} ${e.location ? `@ ${e.location}` : ''}`)
        }
      }
      const eventText = lines.join('\n')

      const result = await window.api.ai.chat({
        message: `오늘: ${today}\n\n이번 주 일정 (날짜별 정리):\n${eventText}\n\n위 일정을 분석해줘. 각 이벤트의 날짜를 정확히 확인해서:\n1. 오늘(${today})의 시간별 빈 시간대 (업무시간 09:00-18:00 기준)\n2. 이번 주 가장 바쁜 날 vs 여유있는 날\n3. 연속 회의 경고 (30분 이하 간격인 것만)\n4. 준비가 필요한 일정 (발표, 리뷰 등)\n5. 업무 집중 가능 시간대 추천 (날짜별)`,
        includeContext: false
      })
      setAiResult(result.content)
    } catch (err) { setAiResult(`오류: ${err instanceof Error ? err.message : ''}`) }
    finally { setAiLoading(false) }
  }

  // 캘린더 필터 적용
  const displayEvents = filterIds.length > 0
    ? events.filter((e) => e.calendar?.id && filterIds.includes(e.calendar.id))
    : events

  // 오늘 기준
  const now = new Date()
  const todayKey = localDateKey(now)

  // 날짜 그룹
  // 장기 이벤트(2일+): 오늘에 한 번만 표시 (기간 표기)
  // 단일/종일: 시작일에 표시
  const groupedByDate: Record<string, DoorayCalendarEvent[]> = {}
  for (const event of displayEvents) {
    const startStr = getStart(event)
    if (!startStr) continue
    try {
      const evStart = fixDate(startStr)
      const evEnd = fixDate(getEnd(event))
      if (isNaN(evStart.getTime())) continue

      const duration = !isNaN(evEnd.getTime()) ? evEnd.getTime() - evStart.getTime() : 0
      const isLong = duration > 2 * 24 * 60 * 60 * 1000

      let dateKey: string
      if (isLong) {
        // 장기: 오늘에 배치
        dateKey = todayKey
      } else {
        dateKey = localDateKey(evStart)
      }

      if (!groupedByDate[dateKey]) groupedByDate[dateKey] = []
      if (!groupedByDate[dateKey].some((e) => e.id === event.id)) {
        groupedByDate[dateKey].push(event)
      }
    } catch {}
  }

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-bg-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <CalendarDays size={18} className="text-clover-blue" />
          <h2 className="text-lg font-semibold text-text-primary">이번 주 일정</h2>
          <span className="text-[10px] text-text-tertiary">{displayEvents.length}개{filterIds.length > 0 ? ` / ${events.length}` : ''}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={runAiAnalysis} disabled={aiLoading || events.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-clover-orange/20 to-clover-blue/20 border border-clover-orange/30 text-xs font-medium text-text-primary hover:from-clover-orange/30 hover:to-clover-blue/30 disabled:opacity-40">
            {aiLoading ? <Loader2 size={12} className="animate-spin text-clover-orange" /> : <Sparkles size={12} className="text-clover-orange" />}
            {aiLoading ? '분석 중...' : 'AI 일정 분석'}
          </button>
          <SkillQuickToggle target="calendar" />
          <CalendarFilter events={events} filterIds={filterIds} onFilter={setFilterIds} />
          <button onClick={loadEvents} className="p-1.5 rounded-lg hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* AI 분석 결과 */}
      {aiResult && (
        <div className="mx-6 mt-3 p-4 rounded-xl bg-gradient-to-r from-clover-orange/5 to-clover-blue/5 border border-clover-orange/20 flex-shrink-0 max-h-[50vh] overflow-y-auto">
          <div className="flex items-center gap-1.5 mb-2 sticky top-0 bg-bg-primary/80 backdrop-blur-sm py-1">
            <Sparkles size={13} className="text-clover-orange" />
            <span className="text-xs font-semibold text-clover-orange">AI 일정 분석</span>
            <button onClick={() => setAiResult(null)} className="ml-auto text-[9px] text-text-tertiary hover:text-text-secondary">닫기</button>
          </div>
          <div className="markdown-body text-xs leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{aiResult}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* 일정 목록 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="text-text-secondary text-sm text-center py-8">일정 불러오는 중...</div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <AlertCircle size={20} className="text-red-400" />
            <p className="text-xs text-red-400 text-center max-w-sm">{error}</p>
            <button onClick={loadEvents} className="text-xs text-clover-blue hover:underline mt-1">다시 시도</button>
          </div>
        ) : Object.keys(groupedByDate).length === 0 ? (
          <div className="text-text-secondary text-sm text-center py-8">이번 주 일정이 없습니다.</div>
        ) : (
          <div className="space-y-5">
            {Object.entries(groupedByDate).sort(([a], [b]) => a.localeCompare(b)).map(([dateKey, dayEvents]) => {
              const todayLocal = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
              const isToday = dateKey === todayLocal
              return (
                <div key={dateKey}>
                  <h3 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${isToday ? 'text-clover-blue' : 'text-text-secondary'}`}>
                    {safeDate(dateKey + 'T00:00:00+09:00')} {isToday && '(오늘)'} <span className="text-text-tertiary font-normal">{dayEvents.length}개</span>
                  </h3>
                  <div className="space-y-1.5">
                    {dayEvents.map((event, i) => {
                      const isAllDay = event.wholeDayFlag || (!safeTime(getStart(event)) && !safeTime(getEnd(event)))
                      const evStart = fixDate(getStart(event)), evEnd = fixDate(getEnd(event))
                      const isLong = !isNaN(evEnd.getTime()) && (evEnd.getTime() - evStart.getTime() > 2 * 24 * 60 * 60 * 1000)
                      const periodStr = isLong ? `${safeDate(getStart(event))} ~ ${safeDate(getEnd(event))}` : ''
                      return (
                        <div key={`${event.id || i}-${dateKey}`} className="flex items-start gap-3 p-2.5 bg-bg-surface border border-bg-border rounded-lg hover:border-bg-border-light transition-colors">
                          <div className={`w-1 min-h-[32px] rounded-full flex-shrink-0 ${isLong ? 'bg-emerald-400' : isAllDay ? 'bg-clover-orange' : 'bg-clover-blue'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-text-primary">{event.subject || '(제목 없음)'}</p>
                            <div className="flex items-center gap-3 mt-0.5">
                              <div className="flex items-center gap-1 text-[10px] text-text-secondary">
                                <Clock size={9} />
                                {isLong ? periodStr : isAllDay ? '종일' : `${safeTime(getStart(event))} - ${safeTime(getEnd(event))}`}
                              </div>
                              {event.location && (
                                <div className="flex items-center gap-1 text-[10px] text-text-secondary">
                                  <MapPin size={9} /> {event.location}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default CalendarAssistant
