import { useState, useEffect, useCallback } from 'react'
import { X, Bot } from 'lucide-react'
import TerminalPane from '../Terminal/TerminalPane'
import type { TerminalSession } from '../../../../shared/types/terminal'

interface Entry {
  session: TerminalSession
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

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      <div className="ds-tabbar">
        {entries.map(({ session }) => (
          <button
            key={session.id}
            onClick={() => setActiveId(session.id)}
            className={`group flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
              activeId === session.id
                ? 'bg-bg-surface text-text-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
            }`}
            title={session.cwd}
          >
            <Bot size={12} className="flex-shrink-0 opacity-70" />
            <span className="truncate max-w-[180px]">{session.name}</span>
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
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Bot size={48} className="text-text-tertiary" />
            <div className="text-center max-w-md">
              <p className="text-sm text-text-primary font-medium mb-1">에이전트 대기 중</p>
              <p className="text-xs text-text-secondary leading-relaxed">
                두레이 채팅방에서 본인이 <code className="px-1 rounded bg-bg-surface text-clover-blue">@clauday</code> 라고
                호출하면, 그 채널 전용 작업 폴더와 세션이 자동으로 시작됩니다.
              </p>
              <p className="text-[10px] text-text-tertiary mt-3">
                작업물 위치: ~/Clauday-Workspaces/agent/{'{channelId}'}/
              </p>
            </div>
          </div>
        ) : (
          entries.map(({ session }) => (
            <TerminalPane
              key={session.id}
              sessionId={session.id}
              isActive={session.id === activeId}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default MentionAgentView
