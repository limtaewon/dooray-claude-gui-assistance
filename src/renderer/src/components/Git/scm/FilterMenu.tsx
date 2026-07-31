import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { anchoredMenuPosition, type AnchoredMenuPosition } from '../../common/anchoredMenu'

export interface FilterMenuOption {
  /** 실제로 필터에 들어갈 값 */
  value: string
  label: string
  /** 오른쪽에 흐리게 붙는 보조 정보 (이메일·커밋 수 등) */
  hint?: string
}

interface FilterMenuProps {
  label: string
  /** 지금 걸려 있는 값. 없으면 칩이 회색으로 남는다 */
  value?: string
  /** 칩에 표시할 값 (없으면 value 그대로) */
  display?: string
  /** 고를 수 있는 목록. 비어 있으면 검색창이 곧 입력창이 된다 */
  options?: FilterMenuOption[]
  /** 목록에 없는 값을 직접 입력해 적용할 수 있는지 */
  allowFreeText?: boolean
  placeholder: string
  /** 목록 위에 한 줄로 붙는 설명 */
  hint?: string
  /** 목록/입력이 비었을 때 고르는 '조건 없음' 항목의 이름 */
  emptyLabel?: string
  loading?: boolean
  onChange: (next: string | undefined) => void
  /** 목록을 처음 열 때 한 번 불러온다 */
  onOpen?: () => void
}

/**
 * 필터 조건 칩 + 팝오버.
 *
 * 자유 입력 + '적용' 버튼 대신 **검색 가능한 목록**을 기본으로 둔다(IntelliJ git log 와 같은 결) —
 * 작성자·브랜치처럼 값이 정해진 조건은 뭘 칠 수 있는지 모른 채 입력하게 두면 안 된다.
 * 목록이 없는 조건(경로·코드)만 검색창이 그대로 입력창이 되고 Enter 로 적용한다.
 */
function FilterMenu({
  label,
  value,
  display,
  options,
  allowFreeText,
  placeholder,
  hint,
  emptyLabel = '전체',
  loading,
  onChange,
  onOpen
}: FilterMenuProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<AnchoredMenuPosition | null>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const openedRef = useRef(false)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const place = (): void => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (!rect) return
      setPos(
        anchoredMenuPosition(
          rect,
          { width: 260 },
          { width: window.innerWidth, height: window.innerHeight },
          { align: 'start' }
        )
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
    setQuery('')
    if (!openedRef.current) {
      openedRef.current = true
      onOpen?.()
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpen])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options ?? []
    return (options ?? []).filter(
      (o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q)
    )
  }, [options, query])

  const hasList = (options?.length ?? 0) > 0
  const apply = (next: string | undefined): void => {
    onChange(next)
    setOpen(false)
  }

  return (
    <>
      <button
        ref={anchorRef}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={value ? `${label}: ${display ?? value}` : label}
        className={`ds-chip ${value ? 'selected' : 'neutral'} cursor-pointer max-w-[140px]`}
      >
        <span className="truncate">{value ? `${label}: ${display ?? value}` : label}</span>
        <ChevronDown size={9} className="flex-none opacity-60" />
      </button>

      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[71] flex flex-col rounded-md border border-bg-border bg-bg-surface-raised shadow-xl overflow-hidden"
            style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight }}
          >
            <div className="relative flex-none border-b border-bg-border">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  // 목록이 있으면 첫 결과를, 없으면(자유 입력) 친 값을 그대로 적용한다.
                  if (filtered.length > 0) apply(filtered[0].value)
                  else if (allowFreeText) apply(query.trim() || undefined)
                }}
                placeholder={placeholder}
                aria-label={placeholder}
                className="w-full h-7 pl-7 pr-6 bg-transparent border-0 outline-none text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-primary placeholder-text-tertiary"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  aria-label="검색 지우기"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {hint && (
              <p className="px-2 py-1 flex-none text-[calc(9.5px_*_var(--app-font-scale,1))] text-text-tertiary border-b border-bg-border">
                {hint}
              </p>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto py-0.5">
              {!query && (
                <Row selected={!value} label={emptyLabel} onClick={() => apply(undefined)} />
              )}

              {loading && (
                <p className="px-2 py-2 text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary">
                  불러오는 중…
                </p>
              )}

              {filtered.map((option) => (
                <Row
                  key={option.value}
                  selected={value === option.value}
                  label={option.label}
                  hint={option.hint}
                  onClick={() => apply(option.value)}
                />
              ))}

              {!loading && hasList && filtered.length === 0 && !allowFreeText && (
                <p className="px-2 py-2 text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary">
                  일치하는 항목이 없습니다
                </p>
              )}

              {/* 목록에 없어도 직접 걸 수 있게 — 경로·코드처럼 값이 열린 조건 */}
              {allowFreeText && query.trim() && !filtered.some((o) => o.value === query.trim()) && (
                <Row
                  label={`"${query.trim()}" 적용`}
                  onClick={() => apply(query.trim())}
                />
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  )
}

function Row({
  selected,
  label,
  hint,
  onClick
}: {
  selected?: boolean
  label: string
  hint?: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={hint ? `${label} · ${hint}` : label}
      className={`w-full h-6 px-2 flex items-center gap-1.5 text-left hover:bg-bg-surface-hover ${
        selected ? 'bg-bg-active' : ''
      }`}
    >
      <span className="w-3 flex-none text-text-secondary">
        {selected ? <Check size={10} /> : null}
      </span>
      <span className="flex-1 min-w-0 truncate text-[calc(11px_*_var(--app-font-scale,1))] text-text-primary">
        {label}
      </span>
      {hint && (
        <span className="flex-none max-w-[90px] truncate text-[calc(9.5px_*_var(--app-font-scale,1))] text-text-tertiary">
          {hint}
        </span>
      )}
    </button>
  )
}

export default FilterMenu
