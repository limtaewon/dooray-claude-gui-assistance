import { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react'
import { RefreshCw, Clock, MapPin, AlertCircle, CalendarDays, Loader2, Settings, Check, Plus, ListTodo } from 'lucide-react'
import type { DoorayCalendarEvent } from '../../../../shared/types/dooray'
import { LoadingView, ErrorView, EmptyView } from '../common/StateViews'
import { Button, Input, SegTabs, useToast } from '../common/ds'
import CalendarMonthView from './CalendarMonthView'
import EventEditModal from './EventEditModal'
import { COLOR_PALETTE, resolveCalendarHex, normalizeHex } from './calendarColors'
import type { UnifiedCalendar, UnifiedEvent } from '../../../../shared/types/calendar'

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
        <div className="text-[calc(10px_*_var(--app-font-scale,1))] font-semibold text-text-tertiary uppercase tracking-wide mb-1.5">인기 색상</div>
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
          <div className="text-[calc(10px_*_var(--app-font-scale,1))] font-semibold text-text-tertiary uppercase tracking-wide mb-1.5">사용자 지정</div>
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
              className={`flex-1 min-w-0 text-[calc(11px_*_var(--app-font-scale,1))] px-2 py-1 rounded bg-bg-surface-hover border ${invalid ? 'border-rose-500' : 'border-bg-border'} text-text-primary outline-none focus:border-clauday-blue font-mono`}
            />
          </div>
          {invalid && <div className="text-[calc(9px_*_var(--app-font-scale,1))] text-rose-400 mt-1">올바른 hex 값을 입력하세요 (예: #3b82f6)</div>}
          <div className="mt-1.5 text-[calc(9px_*_var(--app-font-scale,1))] text-text-tertiary">창을 닫으면 자동 적용됩니다</div>
        </div>

        {overridden && (
          <button
            onClick={onReset}
            className="mt-2 w-full text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary hover:text-text-secondary border-t border-bg-border pt-1.5">
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
          <span className={`text-[calc(11px_*_var(--app-font-scale,1))] truncate ${checked ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>{c.name}</span>
        </button>
        {c.count > 0 && <span className="text-[calc(9px_*_var(--app-font-scale,1))] text-text-tertiary flex-shrink-0">{c.count}</span>}
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
        className={`ds-btn icon sm ${filterIds.length > 0 ? 'text-clauday-blue' : ''}`}
        title="표시할 캘린더 선택">
        <Settings size={15} />
        {filterIds.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-clauday-blue text-[calc(8px_*_var(--app-font-scale,1))] text-white flex items-center justify-center font-bold">
            {filterIds.length}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 w-64 bg-bg-surface border border-bg-border rounded-xl shadow-2xl z-40 overflow-hidden">
            <div className="px-3 py-2 border-b border-bg-border bg-bg-surface-hover">
              <span className="text-[calc(11px_*_var(--app-font-scale,1))] font-semibold text-text-primary">표시할 캘린더 선택</span>
              <span className="text-[calc(9px_*_var(--app-font-scale,1))] text-text-tertiary ml-2">{filterIds.length > 0 ? `${filterIds.length}개` : '전체'}</span>
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {groups.local.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-[calc(9px_*_var(--app-font-scale,1))] font-semibold text-text-tertiary uppercase tracking-wide">Clauday</div>
                  {groups.local.map(renderItem)}
                </>
              )}
              {groups.caldav.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-[calc(9px_*_var(--app-font-scale,1))] font-semibold text-text-tertiary uppercase tracking-wide">두레이</div>
                  {groups.caldav.map(renderItem)}
                </>
              )}
              {/* 공휴일은 필터로 끌 수 없음 — 항상 표시되므로 필터 UI 에서 제외 */}
            </div>
            <div className="px-3 py-1.5 border-t border-bg-border text-[calc(9px_*_var(--app-font-scale,1))] text-text-tertiary">선택 없으면 전체 표시</div>
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
  // 원본 UnifiedEvent 보존 — 편집 모달에서 caldavUrl/etag 가 필요하므로 DoorayCalendarEvent 매핑 전 원본을 별도 유지
  const [unifiedEventsMap, setUnifiedEventsMap] = useState<Map<string, UnifiedEvent>>(new Map())
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 목록 뷰에서 클릭한 일정 → 편집 모달
  const [editingEvent, setEditingEvent] = useState<UnifiedEvent | null>(null)
  const [filterIds, setFilterIds] = useState<string[]>([])
  const [filterLoaded, setFilterLoaded] = useState(false)
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>({})
  const [colorsLoaded, setColorsLoaded] = useState(false)
  // 캘린더 메타 (list 뷰의 좌측 막대 색 적용용 — caldav/local/holiday source 정보 + 기본색 포함)
  const [unifiedCalendars, setUnifiedCalendars] = useState<UnifiedCalendar[]>([])
  useEffect(() => {
    window.api.calendar.listCalendars()
      .then(setUnifiedCalendars)
      .catch(() => setUnifiedCalendars([]))
  }, [])
  const [viewMode, setViewMode] = useState<CalendarViewMode>('list')
  const [viewModeLoaded, setViewModeLoaded] = useState(false)
  const [caldavStatus, setCaldavStatus] = useState<{ connected: boolean; username: string | null } | null>(null)
  // focus 시 서버 동기화 throttle (30초) — 마지막 focus-sync 시각
  const lastFocusSyncRef = useRef(0)

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
    // 창에 다시 들어올 때(focus) 서버 변경분을 가볍게 당겨온다 — poller 3분 주기를 기다리지 않도록.
    // 잦은 alt-tab 으로 두레이 quota 를 압박하지 않게 30초 throttle. incrementalSync 가 변경을
    // 감지하면 main 이 caldav-updated 를 쏘므로 onUpdated → loadEvents 로 자동 반영된다.
    const onFocus = (): void => {
      loadStatus()
      const now = Date.now()
      if (now - lastFocusSyncRef.current < 30_000) { loadEvents(); return }
      lastFocusSyncRef.current = now
      window.api.caldav.incrementalSync().catch(() => { /* 백그라운드 */ }).finally(() => loadEvents())
    }
    const offUpdated = window.api.caldav.onUpdated(() => { loadEvents() })
    window.addEventListener('caldav-status-changed', onChange)
    window.addEventListener('focus', onFocus)
    return () => {
      offUpdated()
      window.removeEventListener('caldav-status-changed', onChange)
      window.removeEventListener('focus', onFocus)
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
  // #9 빠른 할일 추가 — 캘린더를 todo 보드처럼 활용. 자연어 한 줄 + Enter → 오늘 종일 로컬 일정 즉시 생성.
  const [quickTodo, setQuickTodo] = useState('')
  const [creatingTodo, setCreatingTodo] = useState(false)
  const toast = useToast()

  const loadEvents = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const endOfWeek = new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000)
      // List 뷰도 unified API 로 단일화 (#9 후속). dooray.calendar.events 는 이미
      // main 의 getEventsLegacy 가 unified 결과를 어댑트한 wrapper 라 호출하면 중복 데이터.
      // 직접 unified 만 호출하고 DoorayCalendarEvent shape 으로 변환.
      // 캘린더 이름은 listCalendars 결과에서 lookup — 같이 fetch 해서 매 이벤트에 실제 이름 부여.
      const [unified, calMeta] = await Promise.all([
        window.api.calendar.listEvents({ from: startOfDay.toISOString(), to: endOfWeek.toISOString() }),
        window.api.calendar.listCalendars().catch(() => [] as UnifiedCalendar[])
      ])
      const nameById = new Map<string, string>()
      for (const c of (calMeta || [])) nameById.set(c.id, c.name)
      // 원본 UnifiedEvent 를 compositeId(source:id) 로 맵핑 — 편집 모달에 caldavUrl/etag 전달
      const newMap = new Map<string, UnifiedEvent>()
      const merged: DoorayCalendarEvent[] = (unified || []).map((u) => {
        const compositeId = `${u.source}:${u.id}`
        newMap.set(compositeId, u)
        return {
          id: compositeId,
          subject: u.summary,
          startedAt: u.start,
          endedAt: u.end,
          location: u.location,
          description: u.description,
          wholeDayFlag: u.allDay,
          calendar: {
            id: u.calendarId,
            name: u.source === 'local'
              ? (nameById.get(u.calendarId) || '내 일정')
              : u.source === 'holiday' ? '공휴일'
              : (nameById.get(u.calendarId) || '캘린더')
          }
        }
      })
      console.log('[CalendarAssistant] loaded', merged.length, 'events from unified')
      setUnifiedEventsMap(newMap)
      setEvents(merged)
    } catch (err) {
      console.error('[CalendarAssistant] loadEvents 실패:', err)
      setError(err instanceof Error ? err.message : String(err))
      setEvents([])
    }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadEvents() }, [loadEvents])
  // caldav-updated 구독은 line 307 의 useEffect 에 이미 등록됨 — 중복 listener 가 loadEvents 를 두 번 호출하던 문제 제거.

  /**
   * 새로고침 버튼 핸들러 — fullSync 로 서버에서 최신 데이터를 받아온 뒤 로컬 캐시를 재로드.
   * 백그라운드 poller 가 하는 incrementalSync 와 달리 명시적 사용자 액션이므로 fullSync 호출.
   */
  const handleRefresh = useCallback(async () => {
    if (syncing || loading) return
    setSyncing(true); setError(null)
    try {
      await window.api.caldav.fullSync()
      await loadEvents()
    } catch (err) {
      console.error('[CalendarAssistant] handleRefresh 실패:', err)
      toast.error(err instanceof Error ? err.message : '새로고침 실패')
    } finally {
      setSyncing(false)
    }
  }, [syncing, loading, loadEvents, toast])

  // #9 빠른 할일 추가 — 텍스트 한 줄 → 오늘 종일 로컬 일정 즉시 생성.
  const handleQuickAdd = async (): Promise<void> => {
    const text = quickTodo.trim()
    if (!text || creatingTodo) return
    setCreatingTodo(true)
    try {
      const cals = await window.api.calendar.listCalendars()
      const localCal = cals.find((c) => c.source === 'local' && c.writable)
      if (!localCal) {
        toast.error('로컬 캘린더가 없습니다')
        return
      }
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      await window.api.calendar.createEvent({
        source: 'local',
        calendarId: localCal.id,
        summary: text,
        start: today.toISOString(),
        end: today.toISOString(),
        allDay: true
      })
      setQuickTodo('')
      toast.success(`할 일 등록: ${text}`)
      // 월 뷰는 자동 reload (caldav-updated 이벤트 구독). 리스트 뷰는 native API 라 별도.
      await loadEvents()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '등록 실패')
    } finally {
      setCreatingTodo(false)
    }
  }

  // 캘린더 필터 적용 (메모화)
  const displayEvents = useMemo(() =>
    filterIds.length > 0
      ? events.filter((e) => {
          // 공휴일은 사용자가 토글로 끌 수 없는 캘린더 — filter 무시 (서버 unified API 정책과 동일).
          // 캘린더 토글 팝업에 공휴일 항목이 없는데 filter 적용하면 다 빠져 일정 0개로 보임.
          if (e.calendar?.id === 'holiday-kr') return true
          return !!e.calendar?.id && filterIds.includes(e.calendar.id)
        })
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
          <CalendarDays size={18} className="text-clauday-blue" />
          <h2 className="text-lg font-semibold text-text-primary">이번 주 일정</h2>
          <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">{displayEvents.length}개{filterIds.length > 0 ? ` / ${events.length}` : ''}</span>
          <CalendarFilter events={events} filterIds={filterIds} onFilter={setFilterIds} colorOverrides={colorOverrides} onChangeColor={handleChangeColor} />
          <button
            onClick={handleRefresh}
            disabled={loading || syncing}
            className="ds-btn icon sm text-clauday-blue"
            title="서버에서 새로고침"
          >
            <RefreshCw size={15} className={(loading || syncing) ? 'animate-spin' : ''} />
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
        </div>
      </div>

      {/* #9 빠른 할일 추가 — 캘린더를 todo 보드로 활용. Enter 한 번에 오늘 종일 일정 생성. */}
      <div className="mx-6 mt-3 flex items-center gap-2 flex-shrink-0">
        <ListTodo size={14} className="text-clauday-blue flex-shrink-0" />
        <input
          type="text"
          className="flex-1 bg-bg-surface border border-bg-border hover:border-clauday-blue/40 focus:border-clauday-blue/60 outline-none rounded-lg px-3 py-1.5 text-[calc(13px_*_var(--app-font-scale,1))] text-text-primary placeholder-text-tertiary transition-colors"
          placeholder='오늘 할 일 입력 후 Enter'
          value={quickTodo}
          onChange={(e) => setQuickTodo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAdd() }}
          disabled={creatingTodo}
        />
        <Button
          variant="primary"
          size="sm"
          onClick={handleQuickAdd}
          disabled={creatingTodo || !quickTodo.trim()}
          leftIcon={creatingTodo ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
        >
          {creatingTodo ? '등록 중...' : '등록'}
        </Button>
      </div>

      {/* CalDAV 미연결 안내 배너 */}
      {caldavStatus && !caldavStatus.connected && (
        <div className="mx-6 mt-3 p-3 rounded-xl bg-clauday-orange/5 border border-clauday-orange/20 flex items-center gap-3 flex-shrink-0">
          <AlertCircle size={14} className="text-clauday-orange flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-primary font-medium">두레이 CalDAV가 연결되지 않았습니다</p>
            <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5">
              회사 일정을 동기화하려면 설정에서 CalDAV 자격증명을 입력해주세요. 지금은 로컬 캘린더만 표시됩니다.
            </p>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('goto-settings', { detail: { tab: 'caldav' } }))}
            className="px-2.5 py-1 rounded-md bg-clauday-blue text-white text-[calc(10px_*_var(--app-font-scale,1))] font-medium hover:bg-clauday-blue/80 flex-shrink-0">
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
                    const barColor = resolveCalendarHex(event.calendar?.id || '', unifiedCalendars, colorOverrides)
                    const unified = unifiedEventsMap.get(event.id)
                    return (
                      <div
                        key={`long-${event.id || i}`}
                        onClick={() => unified && setEditingEvent(unified)}
                        className={`flex items-start gap-3 p-2.5 bg-bg-surface border border-bg-border rounded-lg hover:border-bg-border-light transition-colors ${unified ? 'cursor-pointer' : ''}`}>
                        <div className="w-1 min-h-[32px] rounded-full flex-shrink-0" style={{ backgroundColor: barColor }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs text-text-primary">{event.subject || '(제목 없음)'}</p>
                            {isOngoing && (
                              <span className="text-[calc(9px_*_var(--app-font-scale,1))] px-1.5 py-0.5 rounded-full bg-emerald-400/15 text-emerald-400 font-medium">진행 중</span>
                            )}
                            {isUpcoming && (
                              <span className="text-[calc(9px_*_var(--app-font-scale,1))] px-1.5 py-0.5 rounded-full bg-clauday-blue/15 text-clauday-blue font-medium">예정</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <div className="flex items-center gap-1 text-[calc(10px_*_var(--app-font-scale,1))] text-text-secondary">
                              <Clock size={9} /> {periodStr}
                            </div>
                            {event.location && (
                              <div className="flex items-center gap-1 text-[calc(10px_*_var(--app-font-scale,1))] text-text-secondary">
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
                  <h3 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${isToday ? 'text-clauday-blue' : 'text-text-secondary'}`}>
                    {safeDate(dateKey + 'T00:00:00+09:00')} {isToday && '(오늘)'} <span className="text-text-tertiary font-normal">{dayEvents.length}개</span>
                  </h3>
                  <div className="space-y-1.5">
                    {dayEvents.map((event, i) => {
                      const isAllDay = event.wholeDayFlag || (!safeTime(getStart(event)) && !safeTime(getEnd(event)))
                      const barColor = resolveCalendarHex(event.calendar?.id || '', unifiedCalendars, colorOverrides)
                      const unified = unifiedEventsMap.get(event.id)
                      return (
                        <div
                          key={`${event.id || i}-${dateKey}`}
                          onClick={() => unified && setEditingEvent(unified)}
                          className={`bg-bg-surface border border-bg-border rounded-lg hover:border-bg-border-light transition-colors ${unified ? 'cursor-pointer' : ''}`}>
                          <div className="flex items-start gap-3 p-2.5">
                            <div className="w-1 min-h-[32px] rounded-full flex-shrink-0" style={{ backgroundColor: barColor }} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-text-primary">{event.subject || '(제목 없음)'}</p>
                              <div className="flex items-center gap-3 mt-0.5">
                                <div className="flex items-center gap-1 text-[calc(10px_*_var(--app-font-scale,1))] text-text-secondary">
                                  <Clock size={9} />
                                  {isAllDay ? '종일' : `${safeTime(getStart(event))} - ${safeTime(getEnd(event))}`}
                                </div>
                                {event.location && (
                                  <div className="flex items-center gap-1 text-[calc(10px_*_var(--app-font-scale,1))] text-text-secondary">
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

      {/* 일정 편집 모달 — 목록 뷰에서 일정 클릭 시 표시 */}
      <EventEditModal
        event={editingEvent}
        calendars={unifiedCalendars}
        onClose={() => setEditingEvent(null)}
        onSaved={loadEvents}
      />
    </div>
  )
}

export default CalendarAssistant
