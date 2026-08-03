/** 마크의 12방향 획. 앱 아이콘(build/icon.svg)과 같은 좌표를 쓴다 — 한쪽만 바뀌면 로고가 갈린다. */
const RAYS: Array<[number, number, number, number]> = [
  [15.5, 12, 22, 12],
  [15.03, 13.75, 20.66, 17],
  [13.75, 15.03, 17, 20.66],
  [12, 15.5, 12, 22],
  [10.25, 15.03, 7, 20.66],
  [8.97, 13.75, 3.34, 17],
  [8.5, 12, 2, 12],
  [8.97, 10.25, 3.34, 7],
  [10.25, 8.97, 7, 3.34],
  [12, 8.5, 12, 2],
  [13.75, 8.97, 17, 3.34],
  [15.03, 10.25, 20.66, 7]
]

/** 그라디언트 id 는 문서 전역이라 인스턴스마다 달라야 한다 */
let seq = 0

export interface ClaudayMarkProps {
  size?: number
  /**
   * true 면 브랜드 그라디언트(주황→파랑), false 면 currentColor.
   * 작은 크기에서는 그라디언트가 거의 안 보이므로 크롬에 놓을 때는 mono 가 낫다.
   */
  gradient?: boolean
  className?: string
}

/** Clauday 브랜드 마크. 앱 아이콘의 방사형 심볼을 그대로 쓴다. */
function ClaudayMark({ size = 16, gradient = true, className = '' }: ClaudayMarkProps): JSX.Element {
  const gradientId = `clauday-mark-${(seq += 1)}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label="Clauday"
    >
      {gradient && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--clauday-orange-light)" />
            <stop offset="100%" stopColor="var(--clauday-blue-light)" />
          </linearGradient>
        </defs>
      )}
      <g
        fill="none"
        stroke={gradient ? `url(#${gradientId})` : 'currentColor'}
        strokeWidth={1.7}
        strokeLinecap="round"
      >
        {RAYS.map(([x1, y1, x2, y2]) => (
          <line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>
    </svg>
  )
}

export default ClaudayMark
