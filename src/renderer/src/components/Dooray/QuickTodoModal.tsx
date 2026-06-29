import { useState, useEffect, useRef } from 'react'
import { CheckSquare, Loader2 } from 'lucide-react'
import { Modal } from '../common/ds'
import { useToast } from '../common/ds/Toast'

/**
 * 어디서든 ⌘/Ctrl+Shift+T 로 열어 한 줄 todo 를 오늘 자 종일 로컬 일정으로 추가.
 * CalendarAssistant 의 handleQuickAdd 와 동일한 API 사용 — 캘린더 화면 안 가도 등록 가능.
 */
function QuickTodoModal({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const toast = useToast()

  useEffect(() => {
    if (open) {
      setText('')
      // 다음 tick 에 focus (모달 mount 완료 후)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const submit = async (): Promise<void> => {
    const value = text.trim()
    if (!value || submitting) return
    setSubmitting(true)
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
        summary: value,
        start: today.toISOString(),
        end: today.toISOString(),
        allDay: true
      })
      toast.success(`할 일 등록: ${value}`)
      // 캘린더 화면이 떠 있다면 자동 reload (caldav-updated 이벤트 구독). 없어도 다음 진입 시 보임.
      window.dispatchEvent(new CustomEvent('caldav-updated'))
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '등록 실패')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<CheckSquare size={14} className="text-emerald-500" />}
      title="오늘 할 일 빠른 추가"
      width={520}
    >
      <div className="p-4">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'Enter') { e.preventDefault(); void submit() }
          }}
          placeholder="예: 슬랙 답장하기 / 코드리뷰 3건 / 휴가 신청"
          disabled={submitting}
          className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-emerald-500"
        />
        <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mt-2">
          오늘 자 종일 일정으로 로컬 캘린더에 등록됩니다. Enter 로 저장, Esc 로 취소.
        </p>
        {submitting && (
          <div className="flex items-center gap-1.5 mt-2 text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary">
            <Loader2 size={12} className="animate-spin" /> 등록 중...
          </div>
        )}
      </div>
    </Modal>
  )
}

export default QuickTodoModal
