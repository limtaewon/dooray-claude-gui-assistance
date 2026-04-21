import type { ReactNode } from 'react'

export type ChipTone = 'blue' | 'orange' | 'emerald' | 'red' | 'violet' | 'yellow' | 'neutral'

export interface ChipProps {
  tone?: ChipTone
  dot?: boolean
  square?: boolean
  children: ReactNode
  className?: string
}

/** 워크플로우 상태, 태그, 카운트 등에 사용 */
function Chip({ tone = 'neutral', dot = false, square = false, children, className = '' }: ChipProps): JSX.Element {
  const sq = square ? ' sq' : ''
  return (
    <span className={`ds-chip ${tone}${sq} ${className}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  )
}

export default Chip
