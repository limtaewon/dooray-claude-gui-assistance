import { useMemo, useEffect, useRef } from 'react'
import { Hash, Clock, Circle, RefreshCw, ExternalLink } from 'lucide-react'
import type { CollectedMessage } from '../../../../shared/types/watcher'

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  const yesterday = new Date(now.getTime() - 86400000)
  if (d.toDateString() === yesterday.toDateString()) {
    return `어제 ${d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
  }
  return d.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function groupByDay(messages: CollectedMessage[]): { label: string; items: CollectedMessage[] }[] {
  const groups: Record<string, CollectedMessage[]> = {}
  const now = new Date()
  const today = now.toDateString()
  const yesterday = new Date(now.getTime() - 86400000).toDateString()

  for (const m of messages) {
    const d = new Date(m.createdAt).toDateString()
    const label = d === today ? '오늘'
      : d === yesterday ? '어제'
      : new Date(m.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
    if (!groups[label]) groups[label] = []
    groups[label].push(m)
  }
  return Object.entries(groups).map(([label, items]) => ({ label, items }))
}

/** 이름 기반 결정론적 아바타 색상 */
const AVATAR_COLORS = [
  { bg: 'rgba(59,130,246,0.15)', text: '#2563eb' },
  { bg: 'rgba(239,68,68,0.15)',  text: '#dc2626' },
  { bg: 'rgba(34,197,94,0.15)',  text: '#16a34a' },
  { bg: 'rgba(245,158,11,0.15)', text: '#d97706' },
  { bg: 'rgba(168,85,247,0.15)', text: '#9333ea' },
  { bg: 'rgba(6,182,212,0.15)',  text: '#0891b2' },
  { bg: 'rgba(249,115,22,0.15)', text: '#ea580c' },
  { bg: 'rgba(132,204,22,0.15)', text: '#65a30d' }
]

function avatarColor(name: unknown): { bg: string; text: string } {
  if (typeof name !== 'string' || !name) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(name: unknown): string {
  // 방어적: store에 저장된 메시지 중 authorName이 string이 아닌 케이스 대비
  if (typeof name !== 'string' || !name) return '?'
  const clean = name.replace(/\[[^\]]*\]/g, '').trim()
  if (!clean) return '?'
  const parts = clean.split(/\s+/)
  if (parts.length >= 2 && parts[0][0] && parts[1][0]) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return clean.slice(0, 2).toUpperCase()
}

/** URL 패턴 */
const URL_RE = /(https?:\/\/[^\s<>"]+)/g
/** 멘션 @이름 */
const MENTION_RE = /(@[가-힣A-Za-z0-9_]+(?:\[[^\]]+\])?)/g

/**
 * 텍스트를 링크/멘션/키워드로 분해 렌더.
 */
function renderContent(text: string, terms: string[]): JSX.Element {
  // 1) URL 먼저 분해
  const urlParts = splitByRegex(text, URL_RE)
  return (
    <>
      {urlParts.map((p, i) => {
        if (URL_RE.test(p)) {
          URL_RE.lastIndex = 0
          return (
            <a key={i} href={p} target="_blank" rel="noreferrer"
              className="text-clover-blue hover:underline break-all inline-flex items-center gap-0.5">
              {p}<ExternalLink size={9} className="opacity-60 flex-shrink-0" />
            </a>
          )
        }
        return <span key={i}>{renderMentions(p, terms)}</span>
      })}
    </>
  )
}

function renderMentions(text: string, terms: string[]): JSX.Element {
  const parts = splitByRegex(text, MENTION_RE)
  return (
    <>
      {parts.map((p, i) => {
        if (MENTION_RE.test(p)) {
          MENTION_RE.lastIndex = 0
          return (
            <span key={i} className="px-1 rounded bg-clover-blue/15 text-clover-blue font-medium text-[11.5px]">
              {p}
            </span>
          )
        }
        return <span key={i}>{renderHighlight(p, terms)}</span>
      })}
    </>
  )
}

function renderHighlight(text: string, terms: string[]): JSX.Element {
  if (!terms.length) return <>{text}</>
  const escaped = terms
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .filter((t) => t.length > 0)
  if (escaped.length === 0) return <>{text}</>
  try {
    const re = new RegExp(`(${escaped.join('|')})`, 'gi')
    const parts = text.split(re)
    return (
      <>
        {parts.map((p, i) =>
          re.test(p) ? (
            <mark key={i} className="bg-clover-orange/30 text-clover-orange-light font-semibold px-0.5 rounded">{p}</mark>
          ) : (
            <span key={i}>{p}</span>
          )
        )}
      </>
    )
  } catch {
    return <>{text}</>
  }
}

function splitByRegex(text: string, re: RegExp): string[] {
  const parts: string[] = []
  let last = 0
  const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  let m: RegExpExecArray | null
  while ((m = global.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(m[0])
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length > 0 ? parts : [text]
}

/** 본문 정리: 연속 빈 줄 1개로 축소 */
function cleanText(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

function MessageTimeline({ messages, onRefresh, refreshing }: {
  messages: CollectedMessage[]
  onRefresh?: () => void
  refreshing?: boolean
}): JSX.Element {
  const groups = useMemo(() => groupByDay(messages), [messages])
  const unreadIds = useMemo(() => messages.filter((m) => !m.read).map((m) => m.id), [messages])
  const markedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (unreadIds.length === 0) return
    const timer = setTimeout(() => {
      const fresh = unreadIds.filter((id) => !markedRef.current.has(id))
      if (fresh.length === 0) return
      fresh.forEach((id) => markedRef.current.add(id))
      window.api.watcher.markRead(fresh)
    }, 1500)
    return () => clearTimeout(timer)
  }, [unreadIds])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
        <Clock size={32} className="text-text-tertiary/60" />
        <div className="text-center">
          <p className="text-sm font-medium text-text-primary">수집된 메시지가 없습니다</p>
          <p className="text-[11px] text-text-tertiary mt-1 leading-relaxed">
            실시간 수신 · 최근 3일 보관<br/>
            규칙과 매치되는 메시지가 없거나 아직 첫 수신 전일 수 있습니다
          </p>
        </div>
        {onRefresh && (
          <button onClick={onRefresh} disabled={refreshing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-clover-orange to-clover-blue disabled:opacity-40 hover:opacity-90">
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? '수집 중...' : '지금 바로 수집하기'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      {groups.map((g) => (
        <div key={g.label} className="mb-6">
          {/* 날짜 구분자 */}
          <div className="sticky top-0 z-10 flex items-center gap-2 mb-3 py-1 bg-bg-primary">
            <div className="inline-flex items-center justify-center h-5 px-2 rounded-full bg-bg-surface border border-bg-border leading-none">
              <span className="text-[10px] font-bold text-text-secondary leading-none">{g.label}</span>
            </div>
            <div className="flex-1 h-px bg-bg-border/60" />
            <span className="text-[10px] text-text-tertiary">{g.items.length}건</span>
          </div>

          <div className="space-y-2">
            {g.items.map((m) => {
              const colors = avatarColor(m.authorName)
              const initials = getInitials(m.authorName)
              return (
                <div key={m.id}
                  className={`group relative flex gap-3 px-4 py-3 rounded-xl border transition-all ${
                    m.read
                      ? 'bg-bg-surface/50 border-bg-border hover:border-bg-border-light'
                      : 'bg-bg-surface border-clover-orange/50 shadow-[0_2px_8px_rgba(251,146,60,0.08)]'
                  }`}>
                  {!m.read && (
                    <Circle size={6} className="absolute top-3 left-1 text-clover-orange fill-clover-orange" />
                  )}

                  {/* Avatar */}
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold"
                    style={{ background: colors.bg, color: colors.text }}>
                    {initials}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Meta row */}
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-semibold text-text-primary">{m.authorName}</span>
                      <span className="flex items-center gap-1 text-[10px] text-text-tertiary px-1.5 py-0.5 rounded bg-bg-primary/60">
                        <Hash size={9} />
                        {m.channelName}
                      </span>
                      <span className="ml-auto text-[10px] text-text-tertiary">{formatTime(m.createdAt)}</span>
                    </div>

                    {/* Body */}
                    <div className="text-[12.5px] text-text-primary whitespace-pre-wrap break-words leading-relaxed">
                      {renderContent(cleanText(m.text), m.matchedTerms)}
                    </div>

                    {/* 원문 열기 (채널 타임라인 이동) */}
                    <a
                      href={`https://nhnent.dooray.com/messenger/channels/${m.channelId}`}
                      target="_blank"
                      rel="noreferrer"
                      title="이 채널을 두레이 메신저에서 열기"
                      className="absolute bottom-2 right-3 inline-flex items-center gap-1 text-[10px] text-text-tertiary hover:text-clover-blue opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ExternalLink size={10} />
                      채널 열기
                    </a>

                    {/* Matched terms chips */}
                    {m.matchedTerms.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 mt-2 pt-2 border-t border-bg-border/40">
                        <span className="text-[9px] text-text-tertiary leading-none">매치:</span>
                        {m.matchedTerms.slice(0, 6).map((t, i) => (
                          <span key={i}
                            className="inline-flex items-center h-[14px] px-1.5 rounded-full bg-clover-orange/15 text-clover-orange font-medium text-[9px] leading-none">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export default MessageTimeline
