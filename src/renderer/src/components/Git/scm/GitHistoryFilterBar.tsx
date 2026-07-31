import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CaseSensitive, ChevronDown, Regex, Search, X } from 'lucide-react'
import type { GitHistoryFilter } from '@shared/git/historyTypes'
import { countHistoryFilters } from '@shared/git/historyTypes'
import { anchoredMenuPosition, type AnchoredMenuPosition } from '../../common/anchoredMenu'
import { Input } from '../../common/ds'

/** 기간 프리셋 — 값은 git 이 그대로 이해하는 표현이다. */
const SINCE_PRESETS: { label: string; value: string }[] = [
  { label: '오늘', value: 'midnight' },
  { label: '최근 7일', value: '7 days ago' },
  { label: '최근 30일', value: '30 days ago' },
  { label: '최근 3개월', value: '3 months ago' }
]

type ChipId = 'branch' | 'author' | 'since' | 'path' | 'content'

interface GitHistoryFilterBarProps {
  filter: GitHistoryFilter
  onChange: (next: GitHistoryFilter) => void
  /** 브랜치 칩에 띄울 목록 */
  branches: string[]
  /** 브랜치를 따로 고르지 않았을 때의 기본 범위 */
  allBranches: boolean
  onAllBranchesChange: (next: boolean) => void
}

/**
 * 커밋 필터 바 (IntelliJ git log 툴바 모델).
 *
 * 검색어 한 칸 + 매칭 토글 2개 + 조건 칩들. 칩은 **서로 배타적이지 않고 함께** 걸린다 —
 * 하나를 고르면 나머지가 풀리는 라디오 방식이면 "이 경로에서 저 사람이 만진 커밋" 을 못 찾는다.
 */
function GitHistoryFilterBar({
  filter,
  onChange,
  branches,
  allBranches,
  onAllBranchesChange
}: GitHistoryFilterBarProps): JSX.Element {
  const [openChip, setOpenChip] = useState<ChipId | null>(null)
  const activeCount = countHistoryFilters(filter)

  const patch = (next: Partial<GitHistoryFilter>): void => onChange({ ...filter, ...next })

  return (
    <div className="px-3 pt-2 pb-1.5 flex flex-col gap-1.5 flex-none">
      <div className="relative">
        <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <Input
          value={filter.text ?? ''}
          onChange={(e) => patch({ text: e.target.value })}
          placeholder="텍스트 또는 해시"
          aria-label="커밋 검색"
          className="sm"
          style={{ paddingLeft: 24, paddingRight: 52 }}
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          <MatchToggle
            active={Boolean(filter.regex)}
            label="정규식"
            onClick={() => patch({ regex: !filter.regex })}
          >
            <Regex size={11} />
          </MatchToggle>
          <MatchToggle
            active={Boolean(filter.caseSensitive)}
            label="대소문자 구분"
            onClick={() => patch({ caseSensitive: !filter.caseSensitive })}
          >
            <CaseSensitive size={12} />
          </MatchToggle>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <FilterChip
          id="branch"
          label="브랜치"
          value={filter.branch ?? (allBranches ? '전체' : undefined)}
          open={openChip === 'branch'}
          onOpenChange={(o) => setOpenChip(o ? 'branch' : null)}
        >
          {(close) => (
            <>
              <MenuRow
                selected={!filter.branch && !allBranches}
                label="현재 브랜치"
                onClick={() => { patch({ branch: undefined }); onAllBranchesChange(false); close() }}
              />
              <MenuRow
                selected={!filter.branch && allBranches}
                label="모든 브랜치"
                onClick={() => { patch({ branch: undefined }); onAllBranchesChange(true); close() }}
              />
              {branches.length > 0 && <MenuDivider />}
              {branches.map((name) => (
                <MenuRow
                  key={name}
                  selected={filter.branch === name}
                  label={name}
                  onClick={() => { patch({ branch: name }); close() }}
                />
              ))}
            </>
          )}
        </FilterChip>

        <FilterChip
          id="author"
          label="작성자"
          value={filter.author}
          open={openChip === 'author'}
          onOpenChange={(o) => setOpenChip(o ? 'author' : null)}
        >
          {(close) => (
            <TextEntry
              placeholder="이름 또는 이메일"
              initial={filter.author ?? ''}
              onSubmit={(v) => { patch({ author: v || undefined }); close() }}
            />
          )}
        </FilterChip>

        <FilterChip
          id="since"
          label="기간"
          value={filter.since ? sinceLabel(filter.since) : undefined}
          open={openChip === 'since'}
          onOpenChange={(o) => setOpenChip(o ? 'since' : null)}
        >
          {(close) => (
            <>
              <MenuRow
                selected={!filter.since}
                label="전체 기간"
                onClick={() => { patch({ since: undefined }); close() }}
              />
              <MenuDivider />
              {SINCE_PRESETS.map((preset) => (
                <MenuRow
                  key={preset.value}
                  selected={filter.since === preset.value}
                  label={preset.label}
                  onClick={() => { patch({ since: preset.value }); close() }}
                />
              ))}
              <MenuDivider />
              <TextEntry
                placeholder="직접 입력 (2026-07-01)"
                initial={filter.since ?? ''}
                onSubmit={(v) => { patch({ since: v || undefined }); close() }}
              />
            </>
          )}
        </FilterChip>

        <FilterChip
          id="path"
          label="경로"
          value={filter.path}
          open={openChip === 'path'}
          onOpenChange={(o) => setOpenChip(o ? 'path' : null)}
        >
          {(close) => (
            <TextEntry
              placeholder="예: src/main"
              initial={filter.path ?? ''}
              onSubmit={(v) => { patch({ path: v || undefined }); close() }}
            />
          )}
        </FilterChip>

        <FilterChip
          id="content"
          label="코드"
          value={filter.content}
          open={openChip === 'content'}
          onOpenChange={(o) => setOpenChip(o ? 'content' : null)}
        >
          {(close) => (
            <TextEntry
              placeholder="추가·삭제된 문자열"
              hint="그 문자열이 추가되거나 삭제된 커밋만 찾습니다"
              initial={filter.content ?? ''}
              onSubmit={(v) => { patch({ content: v || undefined }); close() }}
            />
          )}
        </FilterChip>

        {activeCount > 0 && (
          <button
            onClick={() => { onChange({ regex: filter.regex, caseSensitive: filter.caseSensitive }); setOpenChip(null) }}
            className="ml-auto flex items-center gap-0.5 text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary hover:text-text-primary"
            title="모든 조건 지우기"
          >
            <X size={10} /> 지우기
          </button>
        )}
      </div>
    </div>
  )
}

function sinceLabel(value: string): string {
  return SINCE_PRESETS.find((p) => p.value === value)?.label ?? value
}

function MatchToggle({
  active,
  label,
  onClick,
  children
}: {
  active: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={label}
      aria-label={label}
      className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
        active ? 'bg-bg-active text-text-primary' : 'text-text-tertiary hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  )
}

interface FilterChipProps {
  id: ChipId
  label: string
  /** 값이 걸려 있으면 칩에 표시하고 강조한다 */
  value?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: (close: () => void) => React.ReactNode
}

/** 조건 칩 — 누르면 화면 기준 팝오버가 열린다(좁은 패널에서 잘리지 않게 body 포털). */
function FilterChip({ label, value, open, onOpenChange, children }: FilterChipProps): JSX.Element {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<AnchoredMenuPosition | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const place = (): void => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (!rect) return
      setPos(
        anchoredMenuPosition(rect, { width: 240 }, { width: window.innerWidth, height: window.innerHeight }, { align: 'start' })
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
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onOpenChange(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const active = Boolean(value)

  return (
    <>
      <button
        ref={anchorRef}
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        title={active ? `${label}: ${value}` : label}
        className={`ds-chip ${active ? 'selected' : 'neutral'} cursor-pointer max-w-[130px]`}
      >
        <span className="truncate">{active ? `${label}: ${value}` : label}</span>
        <ChevronDown size={9} className="flex-none opacity-60" />
      </button>

      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => onOpenChange(false)} />
          <div
            className="fixed z-[71] py-1 rounded-md border border-bg-border bg-bg-surface-raised shadow-lg overflow-y-auto"
            style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight }}
          >
            {children(() => onOpenChange(false))}
          </div>
        </>,
        document.body
      )}
    </>
  )
}

function MenuRow({
  selected,
  label,
  onClick
}: {
  selected?: boolean
  label: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-full px-2 py-1 flex items-center gap-1.5 text-left hover:bg-bg-surface-hover ${
        selected ? 'bg-bg-active' : ''
      }`}
    >
      <span className="w-2.5 flex-none text-text-secondary text-[calc(10px_*_var(--app-font-scale,1))]">
        {selected ? '✓' : ''}
      </span>
      <span className="flex-1 min-w-0 truncate text-[calc(11px_*_var(--app-font-scale,1))] text-text-primary">
        {label}
      </span>
    </button>
  )
}

function MenuDivider(): JSX.Element {
  return <div className="my-1 border-t border-bg-border" />
}

/** 팝오버 안의 자유 입력 — Enter 로 적용, Escape 는 상위가 닫는다. */
function TextEntry({
  placeholder,
  hint,
  initial,
  onSubmit
}: {
  placeholder: string
  hint?: string
  initial: string
  onSubmit: (value: string) => void
}): JSX.Element {
  const [draft, setDraft] = useState(initial)
  return (
    <div className="px-2 py-1.5 flex flex-col gap-1">
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onSubmit(draft.trim()) }
          e.stopPropagation()
        }}
        placeholder={placeholder}
        className="sm"
      />
      {hint && (
        <p className="text-[calc(9.5px_*_var(--app-font-scale,1))] text-text-tertiary">{hint}</p>
      )}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onSubmit(draft.trim())}
          className="ds-btn primary xs flex-1"
        >
          적용
        </button>
        {initial && (
          <button onClick={() => onSubmit('')} className="ds-btn secondary xs">
            해제
          </button>
        )}
      </div>
    </div>
  )
}

export default GitHistoryFilterBar
