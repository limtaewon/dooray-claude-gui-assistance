import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDownUp, Check } from 'lucide-react'
import { anchoredMenuPosition, type AnchoredMenuPosition } from '../common/anchoredMenu'
import { DEFAULT_TASK_SORT, TASK_SORT_KEYS, TASK_SORT_LABELS, type TaskSortKey } from './taskSort'

const MENU_WIDTH = 168

interface TaskSortMenuProps {
  value: TaskSortKey
  onChange: (next: TaskSortKey) => void
}

/**
 * 업무 목록 정렬 선택. 상세 검색 버튼과 같은 크기·같은 앵커 방식이라 나란히 놓아도 줄이 안 튄다.
 *
 * 기본값(최근 변경순)일 때는 라벨을 숨기고 아이콘만 둔다 — 좁은 패널에서 검색창을 밀어내지
 * 않으려는 것이고, 기본이 아닐 때만 지금 무슨 순서인지 밖으로 내놓는다.
 */
function TaskSortMenu({ value, onChange }: TaskSortMenuProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<AnchoredMenuPosition | null>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const place = (): void => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (!rect) return
      setPos(
        anchoredMenuPosition(rect, { width: MENU_WIDTH }, {
          width: window.innerWidth,
          height: window.innerHeight
        })
      )
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`정렬 — 지금은 ${TASK_SORT_LABELS[value]}`}
        title={`정렬 · 지금은 ${TASK_SORT_LABELS[value]}`}
        data-tour="task-drawer-sort"
        className={`flex-none flex items-center gap-1 h-[26px] px-1.5 rounded-md border ${
          open
            ? 'border-bg-border-strong bg-bg-active text-text-primary'
            : 'border-bg-border text-text-tertiary hover:text-text-primary hover:bg-bg-surface-hover'
        }`}
      >
        <ArrowDownUp size={12} />
        {value !== DEFAULT_TASK_SORT && (
          <span className="text-[calc(11px_*_var(--app-font-scale,1))] leading-none">
            {TASK_SORT_LABELS[value]}
          </span>
        )}
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
            <div
              role="menu"
              aria-label="정렬 기준"
              className="fixed z-[71] flex flex-col rounded-md border border-bg-border bg-bg-surface-raised shadow-xl overflow-hidden py-1"
              style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight }}
            >
              {TASK_SORT_KEYS.map((key) => {
                const checked = key === value
                return (
                  <button
                    key={key}
                    type="button"
                    role="menuitemradio"
                    aria-checked={checked}
                    onClick={() => {
                      onChange(key)
                      setOpen(false)
                    }}
                    className={`w-full px-2.5 py-1 flex items-center gap-1.5 text-left hover:bg-bg-surface-hover ${
                      checked ? 'text-text-primary' : 'text-text-secondary'
                    }`}
                  >
                    <span className="flex-none w-3 h-3 flex items-center justify-center">
                      {checked && <Check size={10} />}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-[calc(11px_*_var(--app-font-scale,1))]">
                      {TASK_SORT_LABELS[key]}
                    </span>
                  </button>
                )
              })}
            </div>
          </>,
          document.body
        )}
    </>
  )
}

export default TaskSortMenu
