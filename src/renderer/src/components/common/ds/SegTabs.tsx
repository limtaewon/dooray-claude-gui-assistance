import type { ReactNode } from 'react'

export interface SegTabItem<T extends string = string> {
  key: T
  label: ReactNode
  icon?: ReactNode
}

export interface SegTabsProps<T extends string = string> {
  items: SegTabItem<T>[]
  value: T
  onChange: (key: T) => void
  className?: string
}

/** 세그먼티드 탭 (단일 선택, 수평) — Settings 내부 탭 등에서 사용 */
function SegTabs<T extends string>({ items, value, onChange, className = '' }: SegTabsProps<T>): JSX.Element {
  return (
    <div className={`ds-seg ${className}`}>
      {items.map((it) => (
        <button key={it.key} className={`seg-item ${value === it.key ? 'active' : ''}`}
          onClick={() => onChange(it.key)}>
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>
  )
}

export default SegTabs
