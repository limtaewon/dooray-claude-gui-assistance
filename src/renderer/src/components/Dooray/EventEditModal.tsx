import { useState, useEffect } from 'react'
import { Loader2, Edit2, Trash2, AlertTriangle } from 'lucide-react'
import { Modal, Input, Textarea, Button } from '../common/ds'
import type { UnifiedEvent, UnifiedEventUpdate, UnifiedCalendar } from '../../../../shared/types/calendar'

// ─────────────────────────────────────────────────────────────
// EventEditModal — 일정 상세 편집 (제목/시작·종료/위치/설명)
//   * UnifiedEvent 전체를 받아 source 에 따라 read-only 결정
//   * 공휴일(holiday) 은 편집 불가 — 읽기 전용 안내 표시
//   * 저장 → window.api.calendar.updateEvent, 삭제 → window.api.calendar.deleteEvent
// ─────────────────────────────────────────────────────────────

interface Props {
  /** 편집할 일정. null 이면 모달 닫힘 */
  event: UnifiedEvent | null
  /** 캘린더 메타 (캘린더명 표시용) */
  calendars: UnifiedCalendar[]
  onClose: () => void
  /** 저장 또는 삭제 완료 후 호출 — 부모 쪽에서 이벤트 목록 재로드 */
  onSaved: () => void
}

/** ISO datetime-local input 형식 (YYYY-MM-DDTHH:mm) 으로 변환 */
function toDatetimeLocal(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 종일 이벤트의 날짜를 date input (YYYY-MM-DD) 형식으로 변환 */
function toDateInput(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * UnifiedEvent 의 start/end/allDay 를 폼 초기값으로 변환.
 * 종일 여부(allDay)를 기준으로 date 또는 datetime-local 포맷 반환.
 */
export function eventToFormValues(event: UnifiedEvent): {
  summary: string
  startValue: string
  endValue: string
  allDay: boolean
  location: string
  description: string
} {
  return {
    summary: event.summary ?? '',
    startValue: event.allDay ? toDateInput(event.start) : toDatetimeLocal(event.start),
    endValue: event.allDay ? toDateInput(event.end) : toDatetimeLocal(event.end),
    allDay: event.allDay,
    location: event.location ?? '',
    description: event.description ?? ''
  }
}

/**
 * 폼 값과 원본 UnifiedEvent 를 UnifiedEventUpdate 로 변환.
 * caldavUrl/etag 는 원본에서 그대로 전달해 CalDAV 업데이트 시 충돌 감지에 사용.
 */
export function formValuesToUpdate(
  event: UnifiedEvent,
  values: ReturnType<typeof eventToFormValues>
): UnifiedEventUpdate {
  let startISO: string
  let endISO: string
  if (values.allDay) {
    // date input → 로컬 자정 ISO
    startISO = new Date(`${values.startValue}T00:00:00`).toISOString()
    endISO = new Date(`${values.endValue}T23:59:59`).toISOString()
  } else {
    startISO = new Date(values.startValue).toISOString()
    endISO = new Date(values.endValue).toISOString()
  }
  return {
    source: event.source as 'local' | 'caldav',
    id: event.id,
    calendarId: event.calendarId,
    caldavUrl: event.caldavUrl,
    etag: event.etag,
    summary: values.summary.trim(),
    description: values.description.trim() || undefined,
    location: values.location.trim() || undefined,
    start: startISO,
    end: endISO,
    allDay: values.allDay
  }
}

function EventEditModal({ event, calendars, onClose, onSaved }: Props): JSX.Element | null {
  const [summary, setSummary] = useState('')
  const [startValue, setStartValue] = useState('')
  const [endValue, setEndValue] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // event 변경 시 폼 초기화
  useEffect(() => {
    if (!event) return
    const vals = eventToFormValues(event)
    setSummary(vals.summary)
    setStartValue(vals.startValue)
    setEndValue(vals.endValue)
    setAllDay(vals.allDay)
    setLocation(vals.location)
    setDescription(vals.description)
    setError(null)
  }, [event])

  if (!event) return null

  const isReadOnly = event.source === 'holiday'
  const isWritable = event.source === 'local' || event.source === 'caldav'
  const calendarName = calendars.find((c) => c.id === event.calendarId)?.name ?? '캘린더'

  const handleSave = async (): Promise<void> => {
    if (!summary.trim()) { setError('제목을 입력해주세요.'); return }
    if (!startValue || !endValue) { setError('시작/종료 일시를 입력해주세요.'); return }
    setSaving(true); setError(null)
    try {
      const update = formValuesToUpdate(event, { summary, startValue, endValue, allDay, location, description })
      await window.api.calendar.updateEvent(update)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    const label = event.source === 'caldav' ? '두레이' : '로컬'
    if (!window.confirm(`${label} 일정 "${event.summary}" 을(를) 삭제할까요?${event.source === 'caldav' ? '\n두레이 캘린더에서도 삭제됩니다.' : ''}`)) return
    setDeleting(true); setError(null)
    try {
      await window.api.calendar.deleteEvent({
        source: event.source as 'local' | 'caldav',
        id: event.id,
        calendarId: event.calendarId,
        caldavUrl: event.caldavUrl,
        etag: event.etag
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패')
    } finally {
      setDeleting(false)
    }
  }

  const titleNode = (
    <span className="flex items-center gap-1.5">
      <Edit2 size={13} className="text-clauday-blue flex-shrink-0" />
      <span className="truncate max-w-[200px] text-text-primary font-medium text-[calc(13px_*_var(--app-font-scale,1))]">
        {isReadOnly ? event.summary : '일정 편집'}
      </span>
      <span className={`ml-1 px-1.5 py-0.5 rounded text-[calc(9px_*_var(--app-font-scale,1))] font-medium flex-shrink-0 ${
        event.source === 'local' ? 'bg-emerald-500/15 text-emerald-400'
          : event.source === 'caldav' ? 'bg-clauday-blue/15 text-clauday-blue'
          : 'bg-rose-500/15 text-rose-400'
      }`}>
        {event.source === 'local' ? '내 일정' : event.source === 'caldav' ? '두레이' : '공휴일'}
      </span>
    </span>
  )

  return (
    <Modal
      open={!!event}
      onClose={onClose}
      width={440}
      title={titleNode}
      footer={
        isWritable ? (
          <div className="flex items-center justify-between w-full gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting || saving}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[calc(11px_*_var(--app-font-scale,1))] text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              {deleting ? '삭제 중…' : '삭제'}
            </button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="md" onClick={onClose} disabled={saving || deleting}>취소</Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleSave}
                disabled={saving || deleting}
                leftIcon={saving ? <Loader2 size={12} className="animate-spin" /> : undefined}>
                {saving ? '저장 중…' : '저장'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end w-full">
            <Button variant="ghost" size="md" onClick={onClose}>닫기</Button>
          </div>
        )
      }>
      <div className="space-y-3 text-[calc(11px_*_var(--app-font-scale,1))]">
        {/* 읽기 전용 안내 (공휴일) */}
        {isReadOnly && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-clauday-orange/5 border border-clauday-orange/20">
            <AlertTriangle size={13} className="text-clauday-orange flex-shrink-0" />
            <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary">공휴일 일정은 편집할 수 없습니다.</span>
          </div>
        )}

        {/* 캘린더 표시 (읽기 전용) */}
        <div className="flex items-center gap-2 text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary">
          <span className="text-text-tertiary uppercase tracking-wide text-[calc(9px_*_var(--app-font-scale,1))] font-semibold w-14 flex-shrink-0">캘린더</span>
          <span className="text-text-primary">{calendarName}</span>
        </div>

        {/* 제목 */}
        <Field label="제목">
          <Input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="일정 제목"
            disabled={isReadOnly}
            onKeyDown={(e) => { if (e.key === 'Enter' && isWritable) handleSave() }}
          />
        </Field>

        {/* 종일 토글 */}
        {isWritable && (
          <label className="flex items-center gap-1.5 text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              className="accent-clauday-blue"
              checked={allDay}
              onChange={(e) => {
                const next = e.target.checked
                setAllDay(next)
                // allDay 전환 시 입력 형식도 변환
                if (next) {
                  setStartValue(startValue.split('T')[0] ?? '')
                  setEndValue(endValue.split('T')[0] ?? '')
                } else {
                  setStartValue(startValue + 'T09:00')
                  setEndValue(endValue + 'T10:00')
                }
              }}
            />
            종일
          </label>
        )}

        {/* 시작/종료 */}
        {allDay ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label="시작일">
              <Input type="date" value={startValue} onChange={(e) => setStartValue(e.target.value)} disabled={isReadOnly} />
            </Field>
            <Field label="종료일">
              <Input type="date" value={endValue} onChange={(e) => setEndValue(e.target.value)} disabled={isReadOnly} />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Field label="시작 일시">
              <Input type="datetime-local" value={startValue} onChange={(e) => setStartValue(e.target.value)} disabled={isReadOnly} />
            </Field>
            <Field label="종료 일시">
              <Input type="datetime-local" value={endValue} onChange={(e) => setEndValue(e.target.value)} disabled={isReadOnly} />
            </Field>
          </div>
        )}

        {/* 위치 */}
        <Field label="위치">
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="회의실 / 주소"
            disabled={isReadOnly}
          />
        </Field>

        {/* 설명 */}
        <Field label="설명">
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="메모"
            disabled={isReadOnly}
          />
        </Field>

        {/* 오류 */}
        {error && (
          <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-rose-400">{error}</p>
        )}
      </div>
    </Modal>
  )
}

/** 폼 필드 래퍼 — 라벨 + 인풋 세로 배치 */
function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-1">
      <label className="block text-[calc(9px_*_var(--app-font-scale,1))] text-text-tertiary uppercase tracking-wide font-semibold">{label}</label>
      {children}
    </div>
  )
}

export default EventEditModal
