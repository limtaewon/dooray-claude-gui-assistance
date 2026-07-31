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
  /** 온보딩 투어가 가리킬 앵커 이름 */
  'data-tour'?: string
}

/** 세그먼티드 탭 (단일 선택, 수평) — Settings 내부 탭 등에서 사용 */
function SegTabs<T extends string>({
  items,
  value,
  onChange,
  className = '',
  'data-tour': dataTour
}: SegTabsProps<T>): JSX.Element {
  return (
    <div className={`ds-seg ${className}`} data-tour={dataTour}>
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
