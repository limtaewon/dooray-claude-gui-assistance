import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { RefreshCw, Clock, MapPin, AlertCircle, CalendarDays, Sparkles, Loader2, Settings, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { DoorayCalendarEvent } from '../../../../shared/types/dooray'
import SkillQuickToggle from './SkillQuickToggle'
import { LoadingView, ErrorView, EmptyView } from '../common/StateViews'
import AIToolsPopover from '../common/AIToolsPopover'
import { Button, SegTabs } from '../common/ds'
import CalendarMonthView from './CalendarMonthView'
import { COLOR_PALETTE, resolveCalendarHex, normalizeHex } from './calendarColors'
import type { UnifiedCalendar } from '../../../../shared/types/calendar'

type CalendarViewMode = 'month' | 'list'

// API 캘린더 목록 + 이벤트에서 추출한 캘린더 합산 (소스별 그룹)
type CalSource = 'caldav' | 'local' | 'holiday'
type CalEntry = { id: string; name: string; count: number; source: CalSource; color?: string }

function inferSource(id: string, fallback?: string): CalSource {
  if (id.startsWith('holiday-')) return 'holiday'
  if (id.startsWith('http')) return 'caldav'
  if (fallback === 'caldav' || fallback === 'local' || fallback === 'holiday') return fallback
  return 'local'
}

function ColorPickerPopover({ currentHex, anchor, overridden, onPick, onReset, onClose }: {
  currentHex: string
  /** 픽커를 띄울 기준 요소의 viewport 좌표 (getBoundingClientRect) */
  anchor: DOMRect
  overridden: boolean
  /** 실시간 미리보기 — 호출 즉시 캘린더 색이 바뀜. 팝오버는 닫지 않음. */
  onPick: (hex: string) => void
  onReset: () => void
  onClose: () => void
}): JSX.Element {
  const [hexInput, setHexInput] = useState<string>(currentHex.toUpperCase())
  const [invalid, setInvalid] = useState(false)

  // currentHex (외부 상태) 가 바뀌면 텍스트 입력도 동기화
  useEffect(() => { setHexInput(currentHex.toUpperCase()); setInvalid(false) }, [currentHex])

  const commitHexInput = (): void => {
    const norm = normalizeHex(hexInput)
    if (!norm) { setInvalid(true); return }
    setInvalid(false)
    onPick(norm)
  }

  // viewport 안에 들어오도록 좌표 계산 (오른쪽이 잘리면 anchor 왼쪽에 정렬)
  const WIDTH = 240
  const left = Math.min(Math.max(8, anchor.right - WIDTH), window.innerWidth - WIDTH - 8)
  const top = Math.min(anchor.bottom + 4, window.innerHeight - 280)

  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        style={{ position: 'fixed', top, left, width: WIDTH }}
        className="z-[61] bg-bg-surface border border-bg-border rounded-lg shadow-2xl p-3"
        onClick={(e) => e.stopPropagation()}>
        <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wide mb-1.5">인기 색상</div>
        <div className="grid grid-cols-6 gap-1.5">
          {COLOR_PALETTE.map((p) => {
            const selected = currentHex.toLowerCase() === p.toLowerCase()
            return (
              <button
                key={p}
                onClick={() => { onPick(p); onClose() }}
                className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${selected ? 'ring-2 ring-offset-1 ring-offset-bg-surface ring-text-primary' : ''}`}
                style={{ backgroundColor: p }}
                aria-label={`색상 ${p}`}
              />
            )
          })}
        </div>

        <div className="mt-3 pt-2 border-t border-bg-border">
          <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wide mb-1.5">사용자 지정</div>
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={normalizeHex(hexInput) || currentHex}
              onChange={(e) => { const v = e.target.value.toLowerCase(); setHexInput(v.toUpperCase()); setInvalid(false); onPick(v) }}
              className="w-9 h-9 rounded cursor-pointer bg-transparent border border-bg-border p-0 flex-shrink-0"
              aria-label="색상 선택기"
              title="드래그해서 색상 선택 — 창을 닫으면 적용됨"
            />
            <input
              type="text"
              value={hexInput}
              onChange={(e) => { setHexInput(e.target.value); setInvalid(false) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitHexInput(); onClose() } }}
              onBlur={commitHexInput}
              placeholder="#RRGGBB"
              spellCheck={false}
              className={`flex-1 min-w-0 text-[11px] px-2 py-1 rounded bg-bg-surface-hover border ${invalid ? 'border-rose-500' : 'border-bg-border'} text-text-primary outline-none focus:border-clover-blue font-mono`}
            />
          </div>
          {invalid && <div className="text-[9px] text-rose-400 mt-1">올바른 hex 값을 입력하세요 (예: #3b82f6)</div>}
          <div className="mt-1.5 text-[9px] text-text-tertiary">창을 닫으면 자동 적용됩니다</div>
        </div>

        {overridden && (
          <button
            onClick={onReset}
            className="mt-2 w-full text-[10px] text-text-tertiary hover:text-text-secondary border-t border-bg-border pt-1.5">
            기본 색상으로 되돌리기
          </button>
        )}
      </div>
    </>
  )
}

function CalendarFilter({ events, filterIds, onFilter, colorOverrides, onChangeColor }: {
  events: DoorayCalendarEvent[]
  filterIds: string[]
  onFilter: (ids: string[]) => void
  colorOverrides: Record<string, string>
  onChangeColor: (id: string, hex: string | null) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [apiCalendars, setApiCalendars] = useState<Array<{ id: string; name: string; source: CalSource; color?: string }>>([])
  const [picker, setPicker] = useState<{ id: string; anchor: DOMRect } | null>(null)

  useEffect(() => {
    window.api.calendar.listCalendars()
      .then((cals: UnifiedCalendar[]) => setApiCalendars(cals.map((c) => ({
        id: c.id,
        name: c.name,
        source: inferSource(c.id, c.source),
        color: c.color
      }))))
      .catch((err) => { console.error('[calendar] list failed:', err); setApiCalendars([]) })
  }, [])

  const calendars: CalEntry[] = useMemo(() => {
    const allMap = new Map<string, { name: string; source: CalSource; color?: string }>()
    for (const c of apiCalendars) allMap.set(c.id, { name: c.name, source: c.source, color: c.color })
    for (const e of events) {
      if (e.calendar?.id && !allMap.has(e.calendar.id)) {
        allMap.set(e.calendar.id, { name: e.calendar.name, source: inferSource(e.calendar.id) })
      }
    }
    const countMap = new Map<string, number>()
    for (const e of events) {
      const cid = e.calendar?.id
      if (cid) countMap.set(cid, (countMap.get(cid) || 0) + 1)
    }
    return Array.from(allMap.entries())
      .map(([id, v]) => ({ id, name: v.name, source: v.source, color: v.color, count: countMap.get(id) || 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [apiCalendars, events])

  // colorStyleFor / resolveCalendarHex 가 기대하는 UnifiedCalendar 형태
  const unified: UnifiedCalendar[] = useMemo(
    () => calendars.map((c) => ({ id: c.id, name: c.name, source: c.source as 'caldav' | 'local' | 'holiday', color: c.color, writable: false })),
    [calendars]
  )

  // 공휴일은 필터 UI 에서 제외 (항상 표시되므로 사용자가 끌 수 없음)
  const groups = useMemo(() => ({
    caldav: calendars.filter((c) => c.source === 'caldav'),
    local: calendars.filter((c) => c.source === 'local')
  }), [calendars])

  const toggle = (id: string): void => {
    onFilter(filterIds.includes(id) ? filterIds.filter((p) => p !== id) : [...filterIds, id])
  }

  const renderItem = (c: CalEntry): JSX.Element => {
    const checked = filterIds.includes(c.id)
    const hex = resolveCalendarHex(c.id, unified, colorOverrides)
    const overridden = !!colorOverrides[c.id]
    return (
      <div key={c.id} className="relative w-full flex items-center gap-2 px-3 py-1.5 hover:bg-bg-surface-hover">
        <button
          onClick={() => toggle(c.id)}
          aria-label={`${c.name} 표시 토글`}
          className="w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors"
          style={{ backgroundColor: checked ? hex : 'transparent', borderColor: hex }}>
          {checked && <Check size={9} className="text-white" />}
        </button>
        <button onClick={() => toggle(c.id)} className="text-left flex-1 min-w-0">
          <span className={`text-[11px] truncate ${checked ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>{c.name}</span>
        </button>
        {c.count > 0 && <span className="text-[9px] text-text-tertiary flex-shrink-0">{c.count}</span>}
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (picker?.id === c.id) { setPicker(null); return }
            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
            setPicker({ id: c.id, anchor: rect })
          }}
          title={overridden ? '캘린더 색상 변경 (사용자 지정됨)' : '캘린더 색상 변경'}
          className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-bg-border hover:ring-text-tertiary transition-shadow"
          style={{ backgroundColor: hex }}
        />
        {picker?.id === c.id && (
          <ColorPickerPopover
            currentHex={hex}
            anchor={picker.anchor}
            overridden={overridden}
            onPick={(h) => onChangeColor(c.id, h)}
            onReset={() => { onChangeColor(c.id, null); setPicker(null) }}
            onClose={() => setPicker(null)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className={`ds-btn icon sm ${filterIds.length > 0 ? 'text-clover-blue' : ''}`}
        title="표시할 캘린더 선택">
        <Settings size={15} />
        {filterIds.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-clover-blue text-[8px] text-white flex items-center justify-center font-bold">
            {filterIds.length}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 w-64 bg-bg-surface border border-bg-border rounded-xl shadow-2xl z-40 overflow-hidden">
            <div className="px-3 py-2 border-b border-bg-border bg-bg-surface-hover">
              <span className="text-[11px] font-semibold text-text-primary">표시할 캘린더 선택</span>
              <span className="text-[9px] text-text-tertiary ml-2">{filterIds.length > 0 ? `${filterIds.length}개` : '전체'}</span>
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {groups.local.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-[9px] font-semibold text-text-tertiary uppercase tracking-wide">Clauday</div>
                  {groups.local.map(renderItem)}
                </>
              )}
              {groups.caldav.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-[9px] font-semibold text-text-tertiary uppercase tracking-wide">두레이</div>
                  {groups.caldav.map(renderItem)}
                </>
              )}
              {/* 공휴일은 필터로 끌 수 없음 — 항상 표시되므로 필터 UI 에서 제외 */}
            </div>
            <div className="px-3 py-1.5 border-t border-bg-border text-[9px] text-text-tertiary">선택 없으면 전체 표시</div>
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
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>({})
  const [colorsLoaded, setColorsLoaded] = useState(false)
  const [viewMode, setViewMode] = useState<CalendarViewMode>('list')
  const [viewModeLoaded, setViewModeLoaded] = useState(false)
  const [caldavStatus, setCaldavStatus] = useState<{ connected: boolean; username: string | null } | null>(null)

  // 뷰 모드 로드
  useEffect(() => {
    window.api.settings.get('calendarViewMode').then((saved) => {
      if (saved === 'month' || saved === 'list') setViewMode(saved)
      setViewModeLoaded(true)
    })
  }, [])

  // CalDAV 연결 상태 + 데이터 변경 감지 (CTag polling 결과)
  useEffect(() => {
    const loadStatus = (): void => {
      window.api.caldav.status().then(setCaldavStatus).catch(() => setCaldavStatus({ connected: false, username: null }))
    }
    loadStatus()
    const onChange = (): void => {
      loadStatus()
      loadEvents()
    }
    const offUpdated = window.api.caldav.onUpdated(() => { loadEvents() })
    window.addEventListener('caldav-status-changed', onChange)
    window.addEventListener('focus', onChange)
    return () => {
      offUpdated()
      window.removeEventListener('caldav-status-changed', onChange)
      window.removeEventListener('focus', onChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (viewModeLoaded) window.api.settings.set('calendarViewMode', viewMode)
  }, [viewMode, viewModeLoaded])

  // 저장된 필터 로드 + 옛 캘린더 ID 청소 (v1.5 이전 두레이 native ID 잔여 제거)
  useEffect(() => {
    window.api.settings.get('pinnedCalendars').then(async (saved) => {
      const stored = (saved as string[]) || []
      if (stored.length > 0) {
        try {
          const cals = await window.api.dooray.calendar.list()
          const validIds = new Set(cals.map((c) => c.id))
          const cleaned = stored.filter((id) => validIds.has(id))
          setFilterIds(cleaned)
        } catch {
          setFilterIds(stored)
        }
      } else {
        setFilterIds([])
      }
      setFilterLoaded(true)
    })
  }, [])

  // 필터 변경 시 저장
  useEffect(() => {
    if (filterLoaded) {
      window.api.settings.set('pinnedCalendars', filterIds)
    }
  }, [filterIds, filterLoaded])

  // 캘린더별 사용자 지정 색상 로드/저장
  useEffect(() => {
    window.api.settings.get('calendarColors').then((saved) => {
      if (saved && typeof saved === 'object') setColorOverrides(saved as Record<string, string>)
      setColorsLoaded(true)
    }).catch(() => setColorsLoaded(true))
  }, [])
  useEffect(() => {
    if (colorsLoaded) window.api.settings.set('calendarColors', colorOverrides)
  }, [colorOverrides, colorsLoaded])

  const handleChangeColor = useCallback((id: string, hex: string | null): void => {
    setColorOverrides((prev) => {
      const next = { ...prev }
      if (hex === null) delete next[id]
      else next[id] = hex
      return next
    })
  }, [])
  // AI (캘린더 분석)
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

      const mcpServers = await AIToolsPopover.loadSelected('calendarAnalysis')
      const result = await window.api.ai.ask({
        prompt: `오늘: ${today}\n\n이번 주 일정 (날짜별 정리):\n${eventText}\n\n위 일정을 분석해줘. 각 이벤트의 날짜를 정확히 확인해서:\n1. 오늘(${today})의 시간별 빈 시간대 (업무시간 09:00-18:00 기준)\n2. 이번 주 가장 바쁜 날 vs 여유있는 날\n3. 연속 회의 경고 (30분 이하 간격인 것만)\n4. 준비가 필요한 일정 (발표, 리뷰 등)\n5. 업무 집중 가능 시간대 추천 (날짜별)`,
        feature: 'calendarAnalysis',
        mcpServers
      })
      setAiResult(result)
    } catch (err) { setAiResult(`오류: ${err instanceof Error ? err.message : ''}`) }
    finally { setAiLoading(false) }
  }

  // 캘린더 필터 적용 (메모화)
  const displayEvents = useMemo(() =>
    filterIds.length > 0
      ? events.filter((e) => e.calendar?.id && filterIds.includes(e.calendar.id))
      : events,
    [events, filterIds]
  )

  // 오늘 기준
  const todayKey = useMemo(() => localDateKey(new Date()), [])

  // 장기 이벤트(2일+)와 단일 이벤트 분리 + 날짜 그룹 (메모화)
  const { longEvents, groupedByDate, sortedDateEntries } = useMemo(() => {
    const long: DoorayCalendarEvent[] = []
    const grouped: Record<string, DoorayCalendarEvent[]> = {}
    for (const event of displayEvents) {
      const startStr = getStart(event)
      if (!startStr) continue
      try {
        const evStart = fixDate(startStr)
        const evEnd = fixDate(getEnd(event))
        if (isNaN(evStart.getTime())) continue
        const duration = !isNaN(evEnd.getTime()) ? evEnd.getTime() - evStart.getTime() : 0
        const isLong = duration > 2 * 24 * 60 * 60 * 1000
        if (isLong) {
          if (!long.some((e) => e.id === event.id)) long.push(event)
        } else {
          const dateKey = localDateKey(evStart)
          if (!grouped[dateKey]) grouped[dateKey] = []
          if (!grouped[dateKey].some((e) => e.id === event.id)) grouped[dateKey].push(event)
        }
      } catch {}
    }
    // 장기 이벤트는 시작일 순 정렬
    long.sort((a, b) => {
      const as = fixDate(getStart(a)).getTime() || 0
      const bs = fixDate(getStart(b)).getTime() || 0
      return as - bs
    })
    const sorted = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))
    return { longEvents: long, groupedByDate: grouped, sortedDateEntries: sorted }
  }, [displayEvents])

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-bg-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <CalendarDays size={18} className="text-clover-blue" />
          <h2 className="text-lg font-semibold text-text-primary">이번 주 일정</h2>
          <span className="text-[10px] text-text-tertiary">{displayEvents.length}개{filterIds.length > 0 ? ` / ${events.length}` : ''}</span>
          <CalendarFilter events={events} filterIds={filterIds} onFilter={setFilterIds} colorOverrides={colorOverrides} onChangeColor={handleChangeColor} />
          <button
            onClick={loadEvents}
            disabled={loading}
            className="ds-btn icon sm text-clover-blue"
            title="새로고침"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <SegTabs<CalendarViewMode>
            items={[
              { key: 'month', label: '달력' },
              { key: 'list', label: '목록' }
            ]}
            value={viewMode}
            onChange={setViewMode}
          />
          <SkillQuickToggle target="calendar" feature="calendarAnalysis" />
          <Button
            variant="ai"
            size="lg"
            onClick={runAiAnalysis}
            disabled={aiLoading || events.length === 0}
            leftIcon={aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          >
            {aiLoading ? '분석 중...' : 'AI 일정 분석'}
          </Button>
        </div>
      </div>

      {/* AI 분석 결과 */}
      {aiResult && (
        <div className="mx-6 mt-3 p-4 rounded-xl bg-gradient-to-r from-clover-orange/5 to-clover-blue/5 border border-clover-orange/20 flex-shrink-0 max-h-[50vh] overflow-y-auto">
          <div className="flex items-center gap-1.5 mb-2 py-1">
            <Sparkles size={13} className="text-clover-orange" />
            <span className="text-xs font-semibold text-clover-orange">AI 일정 분석</span>
            <button onClick={() => setAiResult(null)} className="ml-auto text-[9px] text-text-tertiary hover:text-text-secondary">닫기</button>
          </div>
          <div className="markdown-body text-xs leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{aiResult}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* CalDAV 미연결 안내 배너 */}
      {caldavStatus && !caldavStatus.connected && (
        <div className="mx-6 mt-3 p-3 rounded-xl bg-clover-orange/5 border border-clover-orange/20 flex items-center gap-3 flex-shrink-0">
          <AlertCircle size={14} className="text-clover-orange flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-text-primary font-medium">두레이 CalDAV가 연결되지 않았습니다</p>
            <p className="text-[10px] text-text-tertiary mt-0.5">
              회사 일정을 동기화하려면 설정에서 CalDAV 자격증명을 입력해주세요. 지금은 로컬 캘린더만 표시됩니다.
            </p>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('goto-settings', { detail: { tab: 'caldav' } }))}
            className="px-2.5 py-1 rounded-md bg-clover-blue text-white text-[10px] font-medium hover:bg-clover-blue/80 flex-shrink-0">
            연결하러 가기
          </button>
        </div>
      )}

      {/* 콘텐츠 — 달력 모드 */}
      {viewMode === 'month' && (
        <CalendarMonthView today={new Date()} filterIds={filterIds} colorOverrides={colorOverrides} />
      )}

      {/* 콘텐츠 — 목록 모드 */}
      {viewMode === 'list' && (
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <LoadingView message="일정 불러오는 중..." />
        ) : error ? (
          <ErrorView message={error} onRetry={loadEvents} />
        ) : (longEvents.length === 0 && Object.keys(groupedByDate).length === 0) ? (
          <EmptyView
            icon={CalendarDays}
            title="이번 주 일정이 없습니다"
            description="캘린더 필터가 걸려있으면 해제해보세요"
            actionLabel="새로고침"
            onAction={loadEvents}
          />
        ) : (
          <div className="space-y-5">
            {/* 장기 이벤트 섹션 (2일+) */}
            {longEvents.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide mb-2 text-emerald-400 flex items-center gap-1.5">
                  <CalendarDays size={11} /> 장기 일정
                  <span className="text-text-tertiary font-normal">{longEvents.length}개</span>
                </h3>
                <div className="space-y-1.5">
                  {longEvents.map((event, i) => {
                    const evStart = fixDate(getStart(event))
                    const evEnd = fixDate(getEnd(event))
                    const now = new Date()
                    const isOngoing = !isNaN(evStart.getTime()) && !isNaN(evEnd.getTime()) &&
                      evStart.getTime() <= now.getTime() && now.getTime() <= evEnd.getTime()
                    const isUpcoming = !isNaN(evStart.getTime()) && evStart.getTime() > now.getTime()
                    const periodStr = `${safeDate(getStart(event))} ~ ${safeDate(getEnd(event))}`
                    return (
                      <div key={`long-${event.id || i}`} className="flex items-start gap-3 p-2.5 bg-bg-surface border border-bg-border rounded-lg hover:border-bg-border-light transition-colors">
                        <div className="w-1 min-h-[32px] rounded-full flex-shrink-0 bg-emerald-400" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs text-text-primary">{event.subject || '(제목 없음)'}</p>
                            {isOngoing && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-400/15 text-emerald-400 font-medium">진행 중</span>
                            )}
                            {isUpcoming && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-clover-blue/15 text-clover-blue font-medium">예정</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <div className="flex items-center gap-1 text-[10px] text-text-secondary">
                              <Clock size={9} /> {periodStr}
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
            )}

            {/* 날짜별 단일 일정 */}
            {sortedDateEntries.map(([dateKey, dayEvents]) => {
              const isToday = dateKey === todayKey
              return (
                <div key={dateKey}>
                  <h3 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${isToday ? 'text-clover-blue' : 'text-text-secondary'}`}>
                    {safeDate(dateKey + 'T00:00:00+09:00')} {isToday && '(오늘)'} <span className="text-text-tertiary font-normal">{dayEvents.length}개</span>
                  </h3>
                  <div className="space-y-1.5">
                    {dayEvents.map((event, i) => {
                      const isAllDay = event.wholeDayFlag || (!safeTime(getStart(event)) && !safeTime(getEnd(event)))
                      return (
                        <div key={`${event.id || i}-${dateKey}`} className="bg-bg-surface border border-bg-border rounded-lg hover:border-bg-border-light transition-colors">
                          <div className="flex items-start gap-3 p-2.5">
                            <div className={`w-1 min-h-[32px] rounded-full flex-shrink-0 ${isAllDay ? 'bg-clover-orange' : 'bg-clover-blue'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-text-primary">{event.subject || '(제목 없음)'}</p>
                              <div className="flex items-center gap-3 mt-0.5">
                                <div className="flex items-center gap-1 text-[10px] text-text-secondary">
                                  <Clock size={9} />
                                  {isAllDay ? '종일' : `${safeTime(getStart(event))} - ${safeTime(getEnd(event))}`}
                                </div>
                                {event.location && (
                                  <div className="flex items-center gap-1 text-[10px] text-text-secondary">
                                    <MapPin size={9} /> {event.location}
                                  </div>
                                )}
                              </div>
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
      )}
    </div>
  )
}

export default CalendarAssistant
