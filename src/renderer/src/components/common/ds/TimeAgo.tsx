import { useEffect, useState } from 'react'

function formatRelative(d: Date): string {
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 5) return '방금'
  if (diff < 60) return `${diff}초 전`
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`
  return d.toLocaleDateString('ko-KR')
}

function formatAbsolute(d: Date): string {
  return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export interface TimeAgoProps {
  date: Date | string | number
  /** true면 절대시간 표기, false면 상대시간 (기본) */
  absolute?: boolean
  /** 상대시간 자동 업데이트 interval(ms). 기본 60초 */
  updateInterval?: number
}

function TimeAgo({ date, absolute = false, updateInterval = 60_000 }: TimeAgoProps): JSX.Element {
  const d = date instanceof Date ? date : new Date(date)
  const [, tick] = useState(0)

  useEffect(() => {
    if (absolute) return
    const t = setInterval(() => tick((n) => n + 1), updateInterval)
    return () => clearInterval(t)
  }, [absolute, updateInterval])

  const abs = formatAbsolute(d)
  return (
    <span className={absolute ? 'ds-time-abs' : 'ds-time-rel'} title={abs}>
      {absolute ? abs : formatRelative(d)}
    </span>
  )
}

export default TimeAgo
