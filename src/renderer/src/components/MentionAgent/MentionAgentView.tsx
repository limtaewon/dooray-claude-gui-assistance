import { useState, useEffect, useCallback } from 'react'
import { X, Bot } from 'lucide-react'
import TerminalPane from '../Terminal/TerminalPane'
import type { TerminalExitPayload, TerminalSession } from '../../../../shared/types/terminal'
import { ViewOnboarding } from '../common/onboarding/viewOnboarding'

interface Entry {
  session: TerminalSession
  /** v2.0 B-1: PTY 종료 정보 — onExit 로 수신되면 채워지고 이후 덮어쓰지 않는다(렌더러측 at-most-once). */
  exitInfo?: TerminalExitPayload | null
}

/**
 * 두레이 멘션(@clauday) 전용 에이전트 영역.
 * 일반 터미널과 분리된 별도 사이드바 메뉴에서 동작.
 *
 * - main(MentionTerminalSpawner)이 자발적으로 띄운 탭만 entries에 들어감
 * - 일반 터미널의 'create-terminal' CustomEvent는 무시
 * - Cmd+T로 새 탭 만드는 것도 의도적으로 막음 (멘션 트리거가 아니면 만들 일 없음)
 *
 * 채널 ↔ 탭 매핑은 main의 ChannelSessionStore가 책임지고,
 * 렌더러는 단순히 push로 들어온 메타를 보여주기만 함.
 */
function MentionAgentView(): JSX.Element {
  const [entries, setEntries] = useState<Entry[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  const closeSession = useCallback(async (id: string) => {
    await window.api.terminal.kill(id)
    setEntries((prev) => {
      const next = prev.filter((e) => e.session.id !== id)
      if (next.length === 0) setActiveId(null)
      else if (id === activeId) setActiveId(next[next.length - 1].session.id)
      return next
    })
  }, [activeId])

  // main이 새로 띄운 멘션 탭 수신 → entries 추가 + 활성화
  useEffect(() => {
    const off = window.api.terminal.onMentionOpened((meta) => {
      setEntries((prev) => {
        if (prev.some((e) => e.session.id === meta.id)) return prev
        return [...prev, { session: meta }]
      })
      setActiveId(meta.id)
    })
    return off
  }, [])

  // 기존 채널 탭 재사용 → 활성화만
  useEffect(() => {
    const off = window.api.terminal.onMentionFocus(({ id }) => {
      setActiveId(id)
    })
    return off
  }, [])

  // v2.0 B-1: PTY 종료 통지 구독 — 자기 entries 에 있는 id 만 반영, 이미 exitInfo 있으면 덮지 않는다.
  useEffect(() => {
    const off = window.api.terminal.onExit((payload) => {
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.session.id === payload.id)
        if (idx === -1 || prev[idx].exitInfo) return prev
        const next = prev.slice()
        next[idx] = { ...next[idx], exitInfo: payload }
        return next
      })
    })
    return off
  }, [])

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      <div className="ds-tabbar">
        {entries.map(({ session, exitInfo }) => (
          <button
            key={session.id}
            onClick={() => setActiveId(session.id)}
            className={`group flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
              activeId === session.id
                ? 'bg-bg-surface text-text-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
            } ${exitInfo ? 'opacity-50' : ''}`}
            title={exitInfo ? '종료됨' : session.cwd}
          >
            <Bot size={12} className="flex-shrink-0 opacity-70" />
            <span className="truncate max-w-[180px]">{session.name}</span>
            {exitInfo && (
              <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary flex-shrink-0">종료됨</span>
            )}
            <X
              size={12}
              className="opacity-0 group-hover:opacity-60 hover:opacity-100 hover:text-red-400 transition-opacity"
              onClick={(e) => { e.stopPropagation(); void closeSession(session.id) }}
            />
          </button>
        ))}
      </div>

      <div className="flex-1 relative">
        {entries.length === 0 ? (
          <ViewOnboarding view="agent" />
        ) : (
          entries.map(({ session, exitInfo }) => (
            <TerminalPane
              key={session.id}
              sessionId={session.id}
              isActive={session.id === activeId}
              exitInfo={exitInfo}
              onRequestClose={() => void closeSession(session.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default MentionAgentView
