import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, SlidersHorizontal } from 'lucide-react'
import { anchoredMenuPosition, type AnchoredMenuPosition } from '../common/anchoredMenu'
import {
  TASK_FACET_LABELS,
  clearDetailFilters,
  detailFilterCount,
  toggleFilterFacet,
  type TaskFacetKey,
  type TaskFacetOption,
  type TaskFacets,
  type TaskFilterState
} from './taskFilter'

const MENU_WIDTH = 240
const SECTIONS: TaskFacetKey[] = ['workflows', 'tags', 'milestones']

interface TaskFilterMenuProps {
  facets: TaskFacets
  state: TaskFilterState
  onChange: (next: TaskFilterState) => void
}

/**
 * 상태 · 태그 · 단계로 업무를 좁히는 상세 검색 버튼 + 팝오버.
 *
 * 작업 패널은 폭이 좁아 축마다 줄을 내줄 수 없다 — 접어두고 걸린 개수만 배지로 알린다.
 * 후보가 하나도 없는 축(단계를 안 쓰는 프로젝트 등)은 아예 그리지 않는다.
 */
function TaskFilterMenu({ facets, state, onChange }: TaskFilterMenuProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<AnchoredMenuPosition | null>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const count = detailFilterCount(state)
  const sections = SECTIONS.filter((key) => facets[key].length > 0)

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
        aria-label="상세 검색"
        title="상태 · 태그 · 단계로 좁히기"
        data-tour="task-drawer-filter"
        className={`flex-none flex items-center gap-1 h-[26px] px-1.5 rounded-md border ${
          count > 0 || open
            ? 'border-bg-border-strong bg-bg-active text-text-primary'
            : 'border-bg-border text-text-tertiary hover:text-text-primary hover:bg-bg-surface-hover'
        }`}
      >
        <SlidersHorizontal size={12} />
        {count > 0 && (
          <span className="min-w-[14px] px-1 rounded-full bg-c-blue-bg text-c-blue-fg text-center font-semibold text-[calc(11px_*_var(--app-font-scale,1))] leading-[14px]">
            {count}
          </span>
        )}
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
            <div
              role="dialog"
              aria-label="상세 검색"
              className="fixed z-[71] flex flex-col rounded-md border border-bg-border bg-bg-surface-raised shadow-xl overflow-hidden"
              style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight }}
            >
              <div className="flex-1 min-h-0 overflow-y-auto py-1">
                {sections.length === 0 ? (
                  <p className="px-3 py-3 text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary leading-relaxed">
                    좁힐 수 있는 상태 · 태그 · 단계가 아직 없습니다. 업무를 불러오면 여기 나옵니다.
                  </p>
                ) : (
                  sections.map((key) => (
                    <FacetSection
                      key={key}
                      title={TASK_FACET_LABELS[key]}
                      options={facets[key]}
                      selected={state[key]}
                      onToggle={(value) => onChange(toggleFilterFacet(state, key, value))}
                    />
                  ))
                )}
              </div>

              {count > 0 && (
                <button
                  type="button"
                  onClick={() => onChange(clearDetailFilters(state))}
                  className="flex-none px-3 py-1.5 border-t border-bg-border text-left text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover"
                >
                  상세 검색 지우기
                </button>
              )}
            </div>
          </>,
          document.body
        )}
    </>
  )
}

function FacetSection({
  title,
  options,
  selected,
  onToggle
}: {
  title: string
  options: TaskFacetOption[]
  selected: string[]
  onToggle: (value: string) => void
}): JSX.Element {
  return (
    <div className="pb-1">
      <p className="px-2.5 pt-1.5 pb-1 text-[calc(9.5px_*_var(--app-font-scale,1))] font-semibold text-text-tertiary uppercase tracking-wide">
        {title}
      </p>
      {options.map((option) => {
        const checked = selected.includes(option.value)
        return (
          <button
            key={option.value}
            type="button"
            role="checkbox"
            aria-checked={checked}
            onClick={() => onToggle(option.value)}
            className={`w-full px-2.5 py-1 flex items-center gap-1.5 text-left hover:bg-bg-surface-hover ${
              checked ? 'text-text-primary' : 'text-text-secondary'
            }`}
          >
            <span
              className={`flex-none w-3 h-3 rounded-[3px] border flex items-center justify-center ${
                checked ? 'bg-bg-active border-bg-border-strong' : 'border-bg-border'
              }`}
            >
              {checked && <Check size={9} />}
            </span>
            <span className="flex-1 min-w-0 truncate text-[calc(11px_*_var(--app-font-scale,1))]">
              {option.value}
            </span>
            <span className="flex-none text-[calc(9.5px_*_var(--app-font-scale,1))] text-text-tertiary tabular-nums">
              {option.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default TaskFilterMenu
