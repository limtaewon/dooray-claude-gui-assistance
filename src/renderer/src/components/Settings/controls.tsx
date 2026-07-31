/**
 * 설정 화면 공용 컨트롤.
 *
 * 레이아웃 문법과 컨트롤 패턴은 Orca(https://github.com/stablyai/orca — orca@1.4.162-rc.0,
 * `src/renderer/src/components/settings/SettingsFormControls.tsx`)를 이식했다.
 * Copyright (c) 2026 Lovecast Inc. — MIT License.
 * 변경: Tailwind 팔레트 직접 참조를 Clauday 토큰으로 교체, 라벨/설명 이중 기재 구조를 하나로 합침
 *   (원본은 `SearchableSetting` 과 `SettingsRow` 가 같은 문구를 두 번 받는다).
 *
 * 규칙 하나만 지키면 된다 — **모든 설정 항목은 좌: 라벨+설명 / 우: 컨트롤 2열**이다.
 * 컨트롤이 세로로 길 때만 `alignTop`.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { matchesSettingsSearch } from './settingsSearch'
import { useSettingsSearchQuery } from './SettingsSection'

interface SettingsRowProps {
  label: ReactNode
  description?: ReactNode
  control: ReactNode
  /** 제목·설명에 없지만 사람들이 칠 법한 말 — 검색에 걸리게 한다 */
  searchKeywords?: string[]
  /** 검색어와 무관하게 항상 보인다 (그룹 안내문 등) */
  alwaysVisible?: boolean
  /** 컨트롤이 세로로 길면 위쪽 정렬 */
  alignTop?: boolean
  className?: string
}

/** 설정 한 줄. 검색어에 안 걸리면 스스로 사라진다. */
export function SettingsRow({
  label,
  description,
  control,
  searchKeywords,
  alwaysVisible,
  alignTop,
  className = ''
}: SettingsRowProps): JSX.Element | null {
  const query = useSettingsSearchQuery()
  const searchable = {
    title: typeof label === 'string' ? label : '',
    description: typeof description === 'string' ? description : undefined,
    keywords: searchKeywords
  }
  if (!alwaysVisible && !matchesSettingsSearch(query, searchable)) return null

  return (
    <div
      className={`flex gap-4 ${description ? 'py-3' : 'py-2'} ${
        alignTop ? 'items-start' : 'items-center justify-between'
      } ${className}`}
    >
      <div className={`min-w-0 flex-1 ${description ? 'space-y-1' : 'space-y-0.5'}`}>
        <div className="text-[calc(12.5px_*_var(--app-font-scale,1))] font-medium text-text-primary">
          {label}
        </div>
        {description && (
          <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <div className="flex-none">{control}</div>
    </div>
  )
}

interface SettingsSwitchProps {
  checked: boolean
  onChange: () => void
  disabled?: boolean
  ariaLabel?: string
}

/**
 * 토글. **켜짐 색은 브랜드색이 아니라 전경색**이다 — 설정 화면의 색 예산은
 * 위험·경고·성공에만 쓴다. 토글을 브랜드색으로 칠하면 화면이 시끄러워지고
 * 정작 위험 신호가 묻힌다.
 */
export function SettingsSwitch({ checked, onChange, disabled, ariaLabel }: SettingsSwitchProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 flex-none cursor-pointer items-center rounded-full border border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-text-primary' : 'bg-bg-border-strong'
      }`}
    >
      <span
        className={`pointer-events-none block h-3.5 w-3.5 rounded-full bg-bg-surface shadow-sm transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

/** 토글 행 — 가장 흔한 조합이라 따로 둔다. */
export function SettingsSwitchRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  searchKeywords,
  className
}: {
  label: ReactNode
  description?: ReactNode
  checked: boolean
  onChange: () => void
  disabled?: boolean
  searchKeywords?: string[]
  className?: string
}): JSX.Element | null {
  return (
    <SettingsRow
      label={label}
      description={description}
      searchKeywords={searchKeywords}
      className={className}
      control={
        <SettingsSwitch
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          ariaLabel={typeof label === 'string' ? label : undefined}
        />
      }
    />
  )
}

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  disabled?: boolean
  title?: string
}

/**
 * 세그먼티드 컨트롤. **선택지가 2~4개면 셀렉트보다 이쪽**이다 —
 * 무엇을 고를 수 있는지가 접히지 않고 보인다.
 */
export function SettingsSegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  equalWidth
}: {
  value: T
  onChange: (next: T) => void
  options: readonly SegmentedOption<T>[]
  ariaLabel?: string
  equalWidth?: boolean
}): JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center rounded-md border border-bg-border bg-bg-primary p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={option.disabled}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`rounded-[5px] px-2.5 py-0.5 text-center text-[calc(11px_*_var(--app-font-scale,1))] transition-colors ${
              equalWidth ? 'flex-1' : ''
            } ${
              active
                ? 'bg-bg-active font-medium text-text-primary'
                : option.disabled
                  ? 'cursor-not-allowed text-text-tertiary opacity-50'
                  : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** 섹션 안의 소제목. 라벨과 같은 크기에 굵기로만 차등한다. */
export function SettingsSubsectionHeader({
  title,
  description,
  action
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1 min-w-0">
        <h3 className="text-[calc(12.5px_*_var(--app-font-scale,1))] font-semibold text-text-primary">
          {title}
        </h3>
        {description && (
          <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex-none">{action}</div>}
    </div>
  )
}

export type SettingsBadgeTone = 'neutral' | 'accent' | 'warning' | 'danger'

const BADGE_TONE: Record<SettingsBadgeTone, string> = {
  neutral: 'border-bg-border text-text-tertiary',
  accent: 'border-bg-border-strong text-text-primary',
  warning: 'border-[var(--c-orange-solid)] text-[var(--c-orange-solid)]',
  danger: 'border-[var(--c-red-solid)] text-[var(--c-red-solid)]'
}

export function SettingsBadge({
  tone = 'neutral',
  children
}: {
  tone?: SettingsBadgeTone
  children: ReactNode
}): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[calc(9.5px_*_var(--app-font-scale,1))] font-medium ${BADGE_TONE[tone]}`}
    >
      {children}
    </span>
  )
}

/**
 * 숫자 입력 행. **타이핑 중에는 저장하지 않고 blur/Enter 에 커밋**한다 —
 * 중간값(`1`, `12`)이 저장되면 clamp 가 걸려 입력이 튄다.
 */
export function SettingsNumberRow({
  label,
  description,
  value,
  min,
  max,
  step = 1,
  suffix,
  defaultValue,
  onChange,
  searchKeywords
}: {
  label: ReactNode
  description?: ReactNode
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  defaultValue?: number
  onChange: (next: number) => void
  searchKeywords?: string[]
}): JSX.Element | null {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  const commit = (): void => {
    const parsed = Number.parseFloat(draft)
    if (!Number.isFinite(parsed)) {
      setDraft(String(value))
      return
    }
    const clamped = Math.min(max, Math.max(min, parsed))
    setDraft(String(clamped))
    if (clamped !== value) onChange(clamped)
  }

  return (
    <SettingsRow
      label={label}
      description={
        description && defaultValue !== undefined ? (
          <>
            {description} <span className="text-text-tertiary opacity-70">· 기본값 {defaultValue}</span>
          </>
        ) : (
          description
        )
      }
      searchKeywords={searchKeywords}
      control={
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={draft}
            min={min}
            max={max}
            step={step}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit() }
            }}
            aria-label={typeof label === 'string' ? label : undefined}
            className="ds-input sm w-20 tabular-nums"
          />
          {suffix && (
            <span className="text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary">
              {suffix}
            </span>
          )}
        </div>
      }
    />
  )
}

/**
 * 서브섹션 사이 구분선. **index > 0 일 때만** 그린다 — 검색으로 앞 섹션이 사라져도
 * 고아 구분선이 남지 않아야 한다.
 */
export function SettingsDivider(): JSX.Element {
  return <div className="h-px w-full bg-bg-border" />
}
