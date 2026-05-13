import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  ChevronLeft, ChevronRight, Clock, MapPin, Plus,
  CalendarDays as CalIcon, Loader2, Trash2, Bell, Users, ExternalLink, Check, X as XIcon, HelpCircle,
  Edit2, UserCheck, Star
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { Modal, Input, Textarea, Button } from '../common/ds'
import type {
  UnifiedCalendar,
  UnifiedEvent,
  UnifiedEventCreate
} from '../../../../shared/types/calendar'
import { colorStyleFor as sharedColorStyleFor, type ColorStyle } from './calendarColors'

// ─────────────────────────────────────────────────────────────
// v1.5 캘린더 — 월간 그리드 (구글 캘린더 스타일 페이지 전환)
//   * 6주 고정 그리드, visibleMonth 기준
//   * 마우스 휠 한 번 → 한 달 점프 (lock 으로 과민 반응 방지)
//   * 월 전환 시 부드러운 fade-slide 트랜지션
//   * 셀 드래그로 다일 일정 빠른 생성
//   * 드래그 중 컨테이너 가장자리에 머무르면 자동으로 다음/이전 달 advance
// ─────────────────────────────────────────────────────────────

// 색상 팔레트 / 해석 로직은 ./calendarColors 로 이전됨 (CalendarFilter 와 공유)

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const MIN_VISIBLE_PER_CELL = 1
const FALLBACK_VISIBLE_PER_CELL = 3
const SLOT_H = 18
const SLOT_GAP = 2
const DATE_AREA_H = 28
const MORE_LINE_H = 22

const WHEEL_THRESHOLD = 16     // px — 작은 트랙패드 진동 무시
const WHEEL_IDLE_MS = 300      // 휠 입력이 이만큼 끊겨야 풀림 (inertia 보호)
const WHEEL_MAX_LOCK_MS = 2000 // 안전망: 어떤 경우에도 이 시간 후 강제 해제
const DRAG_EDGE_PX = 60        // 드래그 중 가장자리 진입 거리
const DRAG_EDGE_DELAY_MS = 380 // 가장자리 머무름 후 자동 월 전환 발동
const DRAG_COOLDOWN_MS = 800   // advance 후 이만큼은 진동에도 재무장 금지

function startOfDay(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function fmtTime(d: Date): string { return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` }
function fmtTime12(d: Date): string {
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  const period = h < 12 ? 'am' : 'pm'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${String(h12).padStart(2, '0')}:${m}${period}`
}
const KO_DOW = ['일', '월', '화', '수', '목', '금', '토']
function fmtDateDot(d: Date): string {
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}(${KO_DOW[d.getDay()]})`
}
function fmtRange(start: Date, end: Date, allDay: boolean): string {
  const same = isSameDay(start, end)
  if (allDay) return same ? `${fmtDateDot(start)} · 종일` : `${fmtDateDot(start)} ~ ${fmtDateDot(end)} · 종일`
  if (same) return `${fmtDateDot(start)} ${fmtTime12(start)} ~ ${fmtTime12(end)}`
  return `${fmtDateDot(start)} ${fmtTime12(start)} ~ ${fmtDateDot(end)} ${fmtTime12(end)}`
}
function fmtMonthTitle(d: Date): string { return `${d.getFullYear()}년 ${d.getMonth() + 1}월` }
function fmtDayLong(d: Date): string {
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
}
function fmtDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

type Segment = {
  event: UnifiedEvent
  col: number
  span: number
  slot: number
  isMulti: boolean
  startsHere: boolean
  endsHere: boolean
}

interface Props {
  today: Date
  filterIds: string[]
  /** 캘린더별 사용자 지정 색상 (id → hex). 없으면 서버 색 / 해시 팔레트 사용. */
  colorOverrides?: Record<string, string>
}

interface DragRange {
  start: Date
  end: Date
}

function CalendarMonthView({ today, filterIds, colorOverrides }: Props): JSX.Element {
  const colorStyleFor = useCallback(
    (calId: string, cals: UnifiedCalendar[]): ColorStyle => sharedColorStyleFor(calId, cals, colorOverrides),
    [colorOverrides]
  )
  const [visibleMonth, setVisibleMonth] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1))
  const [transitionDir, setTransitionDir] = useState<1 | -1>(1)
  const [transitionKey, setTransitionKey] = useState(0)

  const [calendars, setCalendars] = useState<UnifiedCalendar[]>([])
  const [events, setEvents] = useState<UnifiedEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<UnifiedEvent | null>(null)
  const [newRange, setNewRange] = useState<DragRange | null>(null)
  const [moreDate, setMoreDate] = useState<Date | null>(null)
  const [deleting, setDeleting] = useState(false)

  // 드래그
  const dragAnchorRef = useRef<Date | null>(null)
  const [dragRange, setDragRange] = useState<DragRange | null>(null)
  const dragDidMoveRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)

  // 월 전환 lock — idle + max-time 이중 보호
  const wheelLockRef = useRef(false)
  const wheelIdleTimerRef = useRef<number | null>(null)
  const wheelMaxTimerRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // 반응형: 셀당 표시 가능한 막대 수 — 컨테이너 height 측정 후 동적 계산
  const [rowHeight, setRowHeight] = useState(140)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = (): void => {
      const h = el.clientHeight / 6
      if (h > 60) setRowHeight(h)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const maxVisible = useMemo(() => {
    const available = rowHeight - DATE_AREA_H - MORE_LINE_H
    const computed = Math.floor(available / (SLOT_H + SLOT_GAP))
    return Math.max(MIN_VISIBLE_PER_CELL, computed || FALLBACK_VISIBLE_PER_CELL)
  }, [rowHeight])

  // 6주 고정 그리드 (visibleMonth 기준)
  const gridStart = useMemo(
    () => addDays(visibleMonth, -visibleMonth.getDay()),
    [visibleMonth]
  )
  const weeks = useMemo(
    () => Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d))),
    [gridStart]
  )
  const gridEnd = useMemo(() => addDays(gridStart, 42), [gridStart])

  useEffect(() => {
    window.api.calendar.listCalendars().then(setCalendars).catch(() => setCalendars([]))
  }, [])

  const loadEvents = useCallback(async (): Promise<void> => {
    setLoading(true); setError(null)
    try {
      const list = await window.api.calendar.listEvents({
        from: gridStart.toISOString(),
        to: gridEnd.toISOString(),
        calendarIds: filterIds.length > 0 ? filterIds : undefined
      })
      console.log('[CalendarMonthView] loadEvents → count:', list.length)
      setEvents(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : '이벤트 로드 실패')
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [gridStart, gridEnd, filterIds])

  useEffect(() => { loadEvents() }, [loadEvents])

  // CTag polling 결과로 데이터가 변경되면 자동 reload
  useEffect(() => {
    const off = window.api.caldav.onUpdated(() => { loadEvents() })
    return off
  }, [loadEvents])

  /** 월 점프 — wheel/버튼/드래그 자동 advance 공용 (lock 은 호출 측에서 관리) */
  const jumpMonths = useCallback((delta: number, opts?: { animate?: boolean }): void => {
    if (delta === 0) return
    if (opts?.animate !== false) {
      setTransitionDir(delta > 0 ? 1 : -1)
      setTransitionKey((k) => k + 1)
    }
    setVisibleMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))
  }, [])

  const jumpToToday = useCallback((): void => {
    const t = new Date(today.getFullYear(), today.getMonth(), 1)
    const delta = (t.getFullYear() - visibleMonth.getFullYear()) * 12 + (t.getMonth() - visibleMonth.getMonth())
    if (delta === 0) return
    jumpMonths(delta)
  }, [today, visibleMonth, jumpMonths])

  // 휠 — 한 번에 한 달. idle + max-time 이중 보호 (트랙패드 관성으로 인한 다중 advance 차단)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const clearWheelTimers = (): void => {
      if (wheelIdleTimerRef.current !== null) { window.clearTimeout(wheelIdleTimerRef.current); wheelIdleTimerRef.current = null }
      if (wheelMaxTimerRef.current !== null) { window.clearTimeout(wheelMaxTimerRef.current); wheelMaxTimerRef.current = null }
    }

    const releaseLock = (): void => {
      wheelLockRef.current = false
      clearWheelTimers()
    }

    const onWheel = (e: WheelEvent): void => {
      if (Math.abs(e.deltaY) < WHEEL_THRESHOLD) return
      e.preventDefault()
      if (!wheelLockRef.current) {
        wheelLockRef.current = true
        jumpMonths(e.deltaY > 0 ? 1 : -1)
        // 안전망: 어떤 경우에도 이 시간 후에는 무조건 해제
        wheelMaxTimerRef.current = window.setTimeout(releaseLock, WHEEL_MAX_LOCK_MS)
      }
      // idle 갱신: 큰 휠 이벤트가 들어올 때마다 idle 타이머 재시작
      if (wheelIdleTimerRef.current !== null) window.clearTimeout(wheelIdleTimerRef.current)
      wheelIdleTimerRef.current = window.setTimeout(releaseLock, WHEEL_IDLE_MS)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      clearWheelTimers()
    }
  }, [jumpMonths])

  // 슬롯 레이아웃
  const weekSegs: Segment[][] = useMemo(() => weeks.map((week) => {
    const rowStart = startOfDay(week[0])
    const rowEnd = startOfDay(week[6])
    const visible = events.filter((e) => {
      const s = startOfDay(new Date(e.start)).getTime()
      const en = startOfDay(new Date(e.end)).getTime()
      return en >= rowStart.getTime() && s <= rowEnd.getTime()
    })
    visible.sort((a, b) => {
      const adur = startOfDay(new Date(a.end)).getTime() - startOfDay(new Date(a.start)).getTime()
      const bdur = startOfDay(new Date(b.end)).getTime() - startOfDay(new Date(b.start)).getTime()
      if (adur !== bdur) return bdur - adur
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
      return new Date(a.start).getTime() - new Date(b.start).getTime()
    })
    const occupy = Array.from({ length: 7 }, () => new Set<number>())
    const out: Segment[] = []
    for (const ev of visible) {
      const evS = startOfDay(new Date(ev.start)).getTime()
      const evE = startOfDay(new Date(ev.end)).getTime()
      const col = Math.max(0, Math.floor((evS - rowStart.getTime()) / 86400000))
      const colEnd = Math.min(6, Math.floor((evE - rowStart.getTime()) / 86400000))
      let slot = 0
      while (true) {
        let ok = true
        for (let c = col; c <= colEnd; c++) if (occupy[c].has(slot)) { ok = false; break }
        if (ok) break
        slot++
      }
      for (let c = col; c <= colEnd; c++) occupy[c].add(slot)
      out.push({
        event: ev, col, span: colEnd - col + 1, slot,
        isMulti: colEnd > col || ev.allDay,
        startsHere: evS >= rowStart.getTime(),
        endsHere: evE <= rowEnd.getTime()
      })
    }
    return out
  }), [weeks, events])

  const hiddenCountByDay = (day: Date, segs: Segment[]): number => {
    const col = day.getDay()
    const usedSlots = segs.filter((s) => s.col <= col && s.col + s.span - 1 >= col).map((s) => s.slot)
    if (usedSlots.length === 0) return 0
    const maxSlot = Math.max(...usedSlots) + 1
    return Math.max(0, maxSlot - maxVisible)
  }

  const eventsOnDay = (day: Date): UnifiedEvent[] =>
    events.filter((e) => {
      const t = startOfDay(day).getTime()
      return t >= startOfDay(new Date(e.start)).getTime() && t <= startOfDay(new Date(e.end)).getTime()
    }).sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
      return new Date(a.start).getTime() - new Date(b.start).getTime()
    })

  const calendarName = (id: string): string =>
    calendars.find((c) => c.id === id)?.name ?? '캘린더'

  const handleCreate = async (input: UnifiedEventCreate): Promise<void> => {
    await window.api.calendar.createEvent(input)
    setNewRange(null)
    await loadEvents()
  }

  const handleDelete = async (ev: UnifiedEvent): Promise<void> => {
    if (ev.source !== 'local' && ev.source !== 'caldav') return
    const label = ev.source === 'caldav' ? '두레이' : '로컬'
    if (!window.confirm(`${label} 일정 "${ev.summary}" 을(를) 삭제할까요?\n${ev.source === 'caldav' ? '두레이 캘린더에서도 삭제됩니다.' : ''}`)) return
    setDeleting(true)
    try {
      console.log('[handleDelete] start id=', ev.id, 'caldavUrl=', ev.caldavUrl)
      await window.api.calendar.deleteEvent({
        source: ev.source,
        id: ev.id,
        calendarId: ev.calendarId,
        caldavUrl: ev.caldavUrl,
        etag: ev.etag
      })
      console.log('[handleDelete] IPC done, closing modals + reload')
      setSelected(null)
      setMoreDate(null)  // 더보기 모달도 닫음 (열려있었을 수도)
      await loadEvents()
      console.log('[handleDelete] done')
    } catch (e) {
      alert(`삭제 실패: ${e instanceof Error ? e.message : ''}`)
    } finally {
      setDeleting(false)
    }
  }

  // 드래그 시작 — dragRange 는 실제 다른 셀로 움직였을 때만 set (mousemove 에서)
  const onCellMouseDown = (day: Date) => (e: React.MouseEvent): void => {
    if (e.button !== 0) return
    dragAnchorRef.current = day
    dragDidMoveRef.current = false
    setIsDragging(true)
  }

  // mouseup — 전역. moved=true 일 때만 새 일정 모달 (안 움직인 클릭은 onClick 핸들러가 처리)
  useEffect(() => {
    const onUp = (): void => {
      if (!dragAnchorRef.current) return
      const range = dragRange
      const moved = dragDidMoveRef.current
      dragAnchorRef.current = null
      setDragRange(null)
      setIsDragging(false)
      if (range && moved) setNewRange(range)
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [dragRange])

  // 드래그 중: hit-test + 가장자리 머무름 자동 월 advance
  useEffect(() => {
    if (!isDragging) return
    const el = containerRef.current
    if (!el) return
    let mouseX = 0, mouseY = 0
    let edgeTimer: number | null = null
    let edgeDir: 0 | 1 | -1 = 0
    /** 한 번 advance 후 사용자가 안쪽으로 돌아와야 다시 무장 */
    let edgeArmed = true
    /**
     * advance 직후의 강력한 cooldown — 빠른 드래그가 가장자리 진입/이탈을 진동시켜도
     * cooldown 내에는 절대로 재무장되지 않음. 한 드래그에서 우발적 다중 advance 방지.
     */
    let cooldownActive = false
    let cooldownTimer: number | null = null

    const clearEdge = (): void => {
      if (edgeTimer !== null) { window.clearTimeout(edgeTimer); edgeTimer = null }
      edgeDir = 0
    }

    const fireAdvance = (dir: 1 | -1): void => {
      jumpMonths(dir)
      edgeArmed = false
      cooldownActive = true
      clearEdge()
      if (cooldownTimer !== null) window.clearTimeout(cooldownTimer)
      cooldownTimer = window.setTimeout(() => {
        cooldownActive = false
        cooldownTimer = null
        // cooldown 풀린 시점에 사용자가 안쪽에 있어야 다음 진입 시 또 발동 가능
      }, DRAG_COOLDOWN_MS)
    }

    const onMove = (e: MouseEvent): void => {
      mouseX = e.clientX; mouseY = e.clientY
      // elementsFromPoint 으로 막대(pointer-events-auto)를 통과해 그 아래 셀까지 탐색
      const stack = document.elementsFromPoint(mouseX, mouseY)
      let cell: HTMLElement | null = null
      for (const el of stack) {
        const c = (el as HTMLElement).closest?.('[data-date]') as HTMLElement | null
        if (c) { cell = c; break }
      }
      if (cell?.dataset.date && dragAnchorRef.current) {
        const [y, m, d] = cell.dataset.date.split('-').map(Number)
        const day = new Date(y, m - 1, d)
        const a = dragAnchorRef.current.getTime()
        const b = day.getTime()
        // anchor 와 같은 셀이면 movement 로 인정 X (단순 클릭과 미세 진동 구분)
        if (a !== b) {
          dragDidMoveRef.current = true
          setDragRange({
            start: new Date(Math.min(a, b)),
            end: new Date(Math.max(a, b))
          })
        }
      }
      // 가장자리 트래킹
      const rect = el.getBoundingClientRect()
      const fromTop = mouseY - rect.top
      const fromBottom = rect.bottom - mouseY
      let dir: 0 | 1 | -1 = 0
      if (fromTop < DRAG_EDGE_PX && mouseY > 0) dir = -1
      else if (fromBottom < DRAG_EDGE_PX && mouseY > 0) dir = 1

      if (dir === 0) {
        if (edgeDir !== 0) clearEdge()
        // cooldown 중에는 재무장 보류
        if (!cooldownActive) edgeArmed = true
        return
      }
      // cooldown 중이거나 비무장 상태면 무시
      if (cooldownActive || !edgeArmed) return
      if (dir !== edgeDir) {
        clearEdge()
        edgeDir = dir
        edgeTimer = window.setTimeout(() => fireAdvance(dir as 1 | -1), DRAG_EDGE_DELAY_MS)
      }
    }

    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      clearEdge()
      if (cooldownTimer !== null) window.clearTimeout(cooldownTimer)
    }
  }, [isDragging, jumpMonths])

  /** 드래그 미리보기의 row별 segment */
  const dragSegmentsForRow = (week: Date[]): { col: number; span: number; startsHere: boolean; endsHere: boolean } | null => {
    if (!dragRange) return null
    const rowStart = startOfDay(week[0]).getTime()
    const rowEnd = startOfDay(week[6]).getTime()
    const ds = startOfDay(dragRange.start).getTime()
    const de = startOfDay(dragRange.end).getTime()
    if (de < rowStart || ds > rowEnd) return null
    const col = Math.max(0, Math.floor((Math.max(ds, rowStart) - rowStart) / 86400000))
    const colEnd = Math.min(6, Math.floor((Math.min(de, rowEnd) - rowStart) / 86400000))
    return {
      col,
      span: colEnd - col + 1,
      startsHere: ds >= rowStart,
      endsHere: de <= rowEnd
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 월 네비 */}
      <div className="flex items-center justify-between px-6 py-2 border-b border-bg-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 key={visibleMonth.getTime()}
            className="ds-month-label-anim text-sm font-semibold text-text-primary tabular-nums">
            {fmtMonthTitle(visibleMonth)}
          </h3>
          <div className="flex items-center gap-0.5 ml-1">
            <button onClick={() => jumpMonths(-1)} className="ds-btn icon sm" title="이전 달"><ChevronLeft size={14} /></button>
            <button onClick={jumpToToday} className="ds-btn sm px-2 text-[11px]">오늘</button>
            <button onClick={() => jumpMonths(1)} className="ds-btn icon sm" title="다음 달"><ChevronRight size={14} /></button>
          </div>
        </div>
        <span className="text-[10px] text-text-tertiary">
          {loading ? '불러오는 중…' : error ? <span className="text-rose-400">{error}</span> : `${events.length}개 일정`}
        </span>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b border-bg-border flex-shrink-0 bg-bg-surface">
        {WEEKDAYS.map((w, i) => (
          <div key={w}
            className={`px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-right ${
              i === 0 ? 'text-rose-400' : i === 6 ? 'text-clover-blue' : 'text-text-secondary'
            }`}>{w}</div>
        ))}
      </div>

      {/* 그리드 — overflow-hidden, wheel 페이지 전환 */}
      <div ref={containerRef}
        className="flex-1 overflow-hidden bg-bg-primary select-none relative">
        <div key={transitionKey}
          className={`grid grid-rows-6 h-full ${transitionDir > 0 ? 'ds-month-in-next' : 'ds-month-in-prev'}`}>
          {weeks.map((week, wi) => {
            const segs = weekSegs[wi]
            const visibleSegs = segs.filter((s) => s.slot < maxVisible)
            return (
              <div key={wi}
                className="relative grid grid-cols-7 border-b border-bg-border last:border-b-0">
                {week.map((day, di) => {
                  const inMonth = day.getMonth() === visibleMonth.getMonth()
                  const isToday = isSameDay(day, today)
                  const hCount = hiddenCountByDay(day, segs)
                  return (
                    <div key={di}
                      data-date={fmtDateInput(day)}
                      onMouseDown={onCellMouseDown(day)}
                      onClick={() => setNewRange({ start: day, end: day })}
                      className={`relative text-left border-r border-bg-border last:border-r-0 transition-colors group cursor-pointer ${
                        inMonth ? 'hover:bg-bg-surface-hover/60' : 'bg-bg-surface/30 hover:bg-bg-surface-hover/40'
                      }`}>
                      <div className="absolute top-1 right-1.5 z-[1] flex items-center gap-0.5 pointer-events-none">
                        {isToday ? (
                          <>
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-clover-blue text-white text-[11px] font-bold leading-none">{day.getDate()}</span>
                            <span className="text-[11px] font-medium text-text-secondary">일</span>
                          </>
                        ) : (
                          <span className={`text-[11px] font-medium ${
                            di === 0
                              ? inMonth ? 'text-rose-400' : 'text-rose-400/45'
                              : di === 6
                                ? inMonth ? 'text-clover-blue' : 'text-clover-blue/45'
                                : inMonth ? 'text-text-secondary' : 'text-text-tertiary/40'
                          }`}>{day.getDate()}일</span>
                        )}
                      </div>
                      <Plus size={11} className="absolute top-2 left-2 text-text-tertiary opacity-0 group-hover:opacity-60 transition-opacity pointer-events-none" />
                      <div style={{ height: DATE_AREA_H + maxVisible * (SLOT_H + SLOT_GAP) }} />
                      {hCount > 0 && (
                        <span
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); setMoreDate(day) }}
                          className="absolute bottom-1.5 left-2 right-2 text-[10px] text-text-tertiary hover:text-clover-blue text-left cursor-pointer">
                          +{hCount}개 더 보기
                        </span>
                      )}
                    </div>
                  )
                })}

                {/* 드래그 선택 영역 — row 전체 높이에 걸친 둥근 테두리 박스 */}
                {(() => {
                  const ds = dragSegmentsForRow(week)
                  if (!ds) return null
                  // row 사이가 이어질 때 모서리 처리
                  const rL = ds.startsHere ? 'rounded-l-lg' : ''
                  const rR = ds.endsHere ? 'rounded-r-lg' : ''
                  return (
                    <div className="pointer-events-none absolute inset-0 grid grid-cols-7 z-20">
                      <div style={{ gridColumn: `${ds.col + 1} / span ${ds.span}` }}
                        className={`m-0.5 ring-2 ring-clover-blue bg-clover-blue/5 ${rL} ${rR}`} />
                    </div>
                  )
                })()}

                {/* 이벤트 막대 — items-start 로 자식이 row 전체를 stretch 안 함 (셀 클릭 영역 보존) */}
                <div className="pointer-events-none absolute inset-0 grid grid-cols-7 items-start"
                  style={{ paddingTop: DATE_AREA_H + 2 }}>
                  {visibleSegs.map((seg) => {
                    const c = colorStyleFor(seg.event.calendarId, calendars)
                    const top = seg.slot * (SLOT_H + SLOT_GAP)
                    const radiusL = seg.startsHere ? 'rounded-l-md' : ''
                    const radiusR = seg.endsHere ? 'rounded-r-md' : ''
                    const barStyle: React.CSSProperties = seg.isMulti
                      ? { height: SLOT_H, backgroundColor: c.barBg, color: c.barText }
                      : { height: SLOT_H, backgroundColor: c.softBg, color: c.softText }
                    return (
                      <div key={`${seg.event.source}:${seg.event.id || seg.event.start}-${wi}-${seg.slot}`}
                        style={{ gridColumn: `${seg.col + 1} / span ${seg.span}`, marginTop: top }}
                        className="row-start-1 px-[2px] pointer-events-auto">
                        <div
                          onMouseDown={(e) => {
                            if (e.button !== 0) return
                            // 막대는 셀과 sibling 이라 bubble 로는 셀 anchor 못 잡음 → 막대에서 직접 잡기
                            const rowStartDay = week[0]
                            const day = addDays(rowStartDay, seg.col)
                            dragAnchorRef.current = day
                            dragDidMoveRef.current = false
                            setIsDragging(true)
                          }}
                          onClick={(e) => { e.stopPropagation(); if (!dragDidMoveRef.current) setSelected(seg.event) }}
                          style={barStyle}
                          className={`flex items-center gap-1 px-1.5 cursor-pointer truncate text-[10px] leading-none font-medium hover:brightness-110 ${radiusL} ${radiusR}`}>
                          {seg.event.source === 'holiday' && seg.startsHere && (
                            <Star size={9} className="flex-shrink-0" fill="currentColor" />
                          )}
                          {!seg.isMulti && seg.event.source !== 'holiday' && (
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.dotBg }} />
                          )}
                          <span className="truncate">
                            {seg.isMulti
                              ? `${!seg.startsHere ? '… ' : ''}${seg.event.summary}`
                              : `${fmtTime(new Date(seg.event.start))} ${seg.event.summary}`}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 이벤트 상세 */}
      <Modal open={!!selected} onClose={() => { if (!deleting) setSelected(null) }}
        width={580}
        resizable
        title={selected && (selected.source === 'local' || selected.source === 'caldav') ? (
          <button
            onClick={() => handleDelete(selected)}
            disabled={deleting}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
            {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            {deleting ? '삭제 중…' : '삭제'}
          </button>
        ) : ''}>
        {selected && <EventDetailBody event={selected} calendarName={calendarName(selected.calendarId)} colorBg={colorStyleFor(selected.calendarId, calendars).barBg} />}
      </Modal>

      {/* 새 일정 모달 */}
      {newRange && (
        <NewEventModal
          range={newRange}
          calendars={calendars}
          onClose={() => setNewRange(null)}
          onCreate={handleCreate}
        />
      )}

      {/* 일자 더보기 */}
      <Modal open={!!moreDate} onClose={() => setMoreDate(null)}
        width={340}
        title={moreDate ? `${fmtDayLong(moreDate)} · ${eventsOnDay(moreDate).length}개 일정` : ''}>
        <div className="-mx-3 -my-2 max-h-[60vh] overflow-y-auto">
          {moreDate && eventsOnDay(moreDate).map((e) => {
            const c = colorStyleFor(e.calendarId, calendars)
            const isMulti = !isSameDay(new Date(e.start), new Date(e.end)) || e.allDay
            return (
              <button key={`${e.source}:${e.id}`}
                onClick={() => { setMoreDate(null); setSelected(e) }}
                className="w-full text-left px-3 py-1.5 hover:bg-bg-surface-hover flex items-center gap-2 text-[11px]">
                {isMulti
                  ? <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: c.barBg }} />
                  : <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.dotBg }} />}
                <span className="text-text-tertiary tabular-nums w-12 flex-shrink-0">
                  {isMulti ? '종일' : fmtTime(new Date(e.start))}
                </span>
                <span className="truncate text-text-primary">{e.summary}</span>
              </button>
            )
          })}
        </div>
      </Modal>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 새 일정 모달
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// 이벤트 상세 본문 — 두레이 스타일
// ─────────────────────────────────────────────────────────────
function EventDetailBody({ event, calendarName, colorBg }: {
  event: UnifiedEvent
  calendarName: string
  colorBg: string
}): JSX.Element {
  const statusBadge = statusBadgeOf(event.status)
  return (
    <div className="space-y-4">
      {/* 제목 + 우측 캘린더 표시 */}
      <div className="flex items-start gap-4">
        <h2 className="flex-1 text-[17px] font-semibold leading-snug text-text-primary break-words">
          {event.summary || '(제목 없음)'}
          {statusBadge && <span className={`align-middle ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${statusBadge.cls}`}>{statusBadge.label}</span>}
        </h2>
        <div className="flex items-center gap-1.5 text-[11px] text-text-secondary flex-shrink-0 mt-1">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorBg }} />
          <span className="truncate max-w-[140px]">{calendarName}</span>
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
            event.source === 'local' ? 'bg-emerald-500/15 text-emerald-400'
              : event.source === 'caldav' ? 'bg-clover-blue/15 text-clover-blue'
              : 'bg-rose-500/15 text-rose-400'
          }`}>{event.source === 'local' ? '내 일정' : event.source === 'caldav' ? '두레이' : '공휴일'}</span>
        </div>
      </div>

      <div className="space-y-3 text-[12px] leading-relaxed">
        {/* 시간 */}
        <DetailRow icon={<Clock size={14} />}>
          <span className="text-text-primary">{fmtRange(new Date(event.start), new Date(event.end), event.allDay)}</span>
        </DetailRow>

        {/* 장소 */}
        {event.location && (
          <DetailRow icon={<MapPin size={14} />}>
            <span className="text-text-primary break-words">{event.location}</span>
          </DetailRow>
        )}

        {/* 주최자 */}
        {event.organizer && (event.organizer.name || event.organizer.email) && (
          <DetailRow icon={<UserCheck size={14} />}>
            <span className="text-text-primary">{event.organizer.name || event.organizer.email}</span>
            <span className="ml-2 text-[10px] text-text-tertiary px-1.5 py-0.5 rounded bg-bg-surface border border-bg-border">등록자</span>
          </DetailRow>
        )}

        {/* 참석자 */}
        <DetailRow icon={<Users size={14} />}>
          {!event.attendees || event.attendees.length === 0 ? (
            <span className="text-text-tertiary">등록된 참석자가 없습니다.</span>
          ) : (
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-text-primary font-medium">참석자 {event.attendees.length}명</span>
                <AttendeeSummary attendees={event.attendees} />
              </div>
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {event.attendees.slice(0, 12).map((a, i) => (
                  <li key={i} className="flex items-center gap-1 text-text-secondary">
                    <PartstatIcon partstat={a.partstat} />
                    <span className="truncate max-w-[180px]">{a.name || a.email || '(이름 없음)'}</span>
                    {a.role === 'OPT-PARTICIPANT' && <span className="text-text-tertiary text-[9px]">선택</span>}
                  </li>
                ))}
                {event.attendees.length > 12 && (
                  <li className="text-text-tertiary">… 외 {event.attendees.length - 12}명</li>
                )}
              </ul>
            </div>
          )}
        </DetailRow>

        {/* 알림 */}
        {event.alarms && event.alarms.length > 0 && (
          <DetailRow icon={<Bell size={14} />}>
            <div className="flex flex-wrap gap-1.5">
              {event.alarms.map((a, i) => (
                <span key={i} className="px-2 py-0.5 rounded-md bg-clover-orange/10 text-clover-orange text-[11px] font-medium">
                  {fmtTrigger(a.trigger)}
                </span>
              ))}
            </div>
          </DetailRow>
        )}

        {/* 외부 링크 */}
        {event.webUrl && (
          <DetailRow icon={<ExternalLink size={14} />}>
            <a href={event.webUrl} target="_blank" rel="noreferrer"
              className="text-clover-blue hover:underline truncate inline-block max-w-full">{event.webUrl}</a>
          </DetailRow>
        )}
      </div>

      {/* 설명 박스 — 마크다운 렌더 */}
      {event.description && (
        <div className="flex items-start gap-3">
          <Edit2 size={14} className="text-text-tertiary mt-1.5 flex-shrink-0" />
          <div className="flex-1 min-w-0 rounded-lg border border-bg-border bg-bg-surface/30 p-3 markdown-body text-[12px] leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
              {event.description}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}

/** 좌측 아이콘 + 우측 콘텐츠 정렬용 wrapper */
function DetailRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-start gap-3">
      <span className="text-text-tertiary mt-0.5 flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function AttendeeSummary({ attendees }: { attendees: UnifiedEvent['attendees'] }): JSX.Element | null {
  if (!attendees) return null
  let accepted = 0, declined = 0, tentative = 0, pending = 0
  for (const a of attendees) {
    switch (a.partstat) {
      case 'ACCEPTED': accepted++; break
      case 'DECLINED': declined++; break
      case 'TENTATIVE': tentative++; break
      default: pending++
    }
  }
  const parts: string[] = []
  if (accepted) parts.push(`수락 ${accepted}`)
  if (tentative) parts.push(`임시 ${tentative}`)
  if (declined) parts.push(`거절 ${declined}`)
  if (pending) parts.push(`미응답 ${pending}`)
  return <span className="text-text-tertiary text-[10px] font-normal">{parts.join(' · ')}</span>
}

function PartstatIcon({ partstat }: { partstat?: string }): JSX.Element {
  if (partstat === 'ACCEPTED') return <Check size={10} className="text-emerald-400 flex-shrink-0" />
  if (partstat === 'DECLINED') return <XIcon size={10} className="text-rose-400 flex-shrink-0" />
  if (partstat === 'TENTATIVE') return <HelpCircle size={10} className="text-clover-orange flex-shrink-0" />
  return <span className="w-2 h-2 rounded-full border border-text-tertiary flex-shrink-0" />
}

function statusBadgeOf(status?: string): { label: string; cls: string } | null {
  if (!status) return null
  switch (status.toUpperCase()) {
    case 'CONFIRMED': return { label: '확정', cls: 'bg-emerald-500/15 text-emerald-400' }
    case 'TENTATIVE': return { label: '임시', cls: 'bg-clover-orange/15 text-clover-orange' }
    case 'CANCELLED': return { label: '취소됨', cls: 'bg-rose-500/15 text-rose-400 line-through' }
    default: return null
  }
}

/** TRIGGER 표현을 사람 친화 텍스트로 (예: -PT15M → 15분 전, -P1D → 1일 전) */
function fmtTrigger(trigger: string): string {
  const m = trigger.match(/^(-?)P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i)
  if (!m) return trigger
  const sign = m[1] === '-' ? '전' : '후'
  const days = parseInt(m[2] || '0', 10)
  const hours = parseInt(m[3] || '0', 10)
  const mins = parseInt(m[4] || '0', 10)
  const secs = parseInt(m[5] || '0', 10)
  const parts: string[] = []
  if (days) parts.push(`${days}일`)
  if (hours) parts.push(`${hours}시간`)
  if (mins) parts.push(`${mins}분`)
  if (secs) parts.push(`${secs}초`)
  if (parts.length === 0) return `정각 알림`
  return `${parts.join(' ')} ${sign} 알림`
}

function NewEventModal({ range, calendars, onClose, onCreate }: {
  range: DragRange
  calendars: UnifiedCalendar[]
  onClose: () => void
  onCreate: (input: UnifiedEventCreate) => Promise<void>
}): JSX.Element {
  const writable = calendars.filter((c) => c.writable)
  const [calendarId, setCalendarId] = useState<string>(writable[0]?.id ?? '')
  const [summary, setSummary] = useState('')
  const isMultiDay = !isSameDay(range.start, range.end)
  const [allDay, setAllDay] = useState(isMultiDay)
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('11:00')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (!calendarId && writable[0]) setCalendarId(writable[0].id) }, [writable, calendarId])

  const startDateStr = fmtDateInput(range.start)
  const endDateStr = fmtDateInput(range.end)

  const handleSubmit = async (): Promise<void> => {
    if (!summary.trim()) { setError('제목을 입력해주세요.'); return }
    if (!calendarId) { setError('쓰기 가능한 캘린더가 없습니다.'); return }
    setSubmitting(true); setError(null)
    try {
      const cal = calendars.find((c) => c.id === calendarId)
      if (!cal) throw new Error('캘린더를 찾을 수 없습니다.')
      let startISO: string, endISO: string
      if (allDay) {
        startISO = new Date(`${startDateStr}T00:00:00`).toISOString()
        endISO = new Date(`${endDateStr}T23:59:59`).toISOString()
      } else {
        startISO = new Date(`${startDateStr}T${startTime}:00`).toISOString()
        endISO = new Date(`${endDateStr}T${endTime}:00`).toISOString()
      }
      await onCreate({
        source: cal.source,
        calendarId: cal.id,
        summary: summary.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        start: startISO,
        end: endISO,
        allDay
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSubmitting(false)
    }
  }

  const title = isMultiDay
    ? `새 일정 — ${fmtDayLong(range.start)} ~ ${fmtDayLong(range.end)}`
    : `새 일정 — ${fmtDayLong(range.start)}`

  return (
    <Modal open onClose={onClose}
      width={420}
      icon={<Plus size={14} className="text-clover-blue" />}
      title={title}
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="ghost" size="md" onClick={onClose}>취소</Button>
          <Button variant="primary" size="md" onClick={handleSubmit} disabled={submitting}
            leftIcon={submitting ? <Loader2 size={12} className="animate-spin" /> : undefined}>
            만들기
          </Button>
        </div>
      }>
      <div className="space-y-3 text-[11px]">
        <Field label="제목">
          <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="일정 제목" />
        </Field>
        <Field label="캘린더">
          <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)}
            className="ds-input w-full">
            {writable.length === 0 && <option value="">쓰기 가능한 캘린더 없음</option>}
            {writable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.source === 'local' ? '(내 일정)' : '(두레이)'}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-1.5 text-text-secondary">
          <input type="checkbox" className="accent-clover-blue" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />종일
        </label>
        {!allDay && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="시작 시간">
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </Field>
            <Field label="종료 시간">
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </Field>
          </div>
        )}
        <Field label="장소"><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="회의실 / 주소" /></Field>
        <Field label="메모"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="설명" /></Field>
        {error && <p className="text-[11px] text-rose-400">{error}</p>}
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-1">
      <label className="block text-[9px] text-text-tertiary uppercase tracking-wide font-semibold">{label}</label>
      {children}
    </div>
  )
}

export default CalendarMonthView
