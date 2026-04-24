import type { ReactNode } from 'react'

export type BadgeTone = 'orange' | 'blue' | 'emerald' | 'red' | 'violet'

const BADGE_BG: Record<BadgeTone, string> = {
  orange:  'var(--clover-orange)',
  blue:    'var(--clover-blue)',
  emerald: '#22C55E',
  red:     '#EF4444',
  violet:  '#A78BFA'
}

/** 숫자 알림 뱃지 (사이드바 카운트 등) */
function Badge({ children, tone = 'orange' }: { children: ReactNode; tone?: BadgeTone }): JSX.Element {
  return <span className="ds-badge-pill" style={{ background: BADGE_BG[tone] }}>{children}</span>
}

export default Badge
