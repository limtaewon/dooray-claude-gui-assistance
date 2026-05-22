import { useEffect, useState } from 'react'
import { Server, Sparkles, BarChart3, Calendar, Terminal, BookOpen, MessageSquare, GitBranch, Settings, Users, Radar, Lightbulb, Bot, MessageSquarePlus } from 'lucide-react'
import { useFeedback } from '../Feedback/FeedbackProvider'

export type SidebarView = 'mcp' | 'skills' | 'usage' | 'dooray' | 'terminal' | 'manual' | 'sessions' | 'git' | 'settings' | 'community' | 'monitoring' | 'ai-recommend' | 'agent'
// 호환성 유지를 위해 기존 별칭도 export
export type View = SidebarView

interface SidebarProps {
  activeView: View
  onViewChange: (view: View) => void
}

export interface SidebarNavItem { view: View; icon: typeof Server; label: string }

/** 사용자가 순서/노출을 커스텀할 수 있는 항목 전체 (settings/manual 은 standalone, 항상 노출/고정). */
export const CUSTOMIZABLE_NAV_ITEMS: SidebarNavItem[] = [
  { view: 'dooray', icon: Calendar, label: '두레이' },
  { view: 'monitoring', icon: Radar, label: '모니터링' },
  { view: 'agent', icon: Bot, label: '에이전트' },
  { view: 'terminal', icon: Terminal, label: '터미널' },
  { view: 'git', icon: GitBranch, label: '브랜치 작업' },
  { view: 'community', icon: Users, label: '커뮤니티' },
  { view: 'mcp', icon: Server, label: 'MCP 서버' },
  { view: 'skills', icon: Sparkles, label: 'Claude 스킬' },
  { view: 'ai-recommend', icon: Lightbulb, label: 'AI 추천' },
  { view: 'sessions', icon: MessageSquare, label: 'Claude 채팅' },
  { view: 'usage', icon: BarChart3, label: '사용량' }
]

const STANDALONE_ITEMS: SidebarNavItem[] = [
  { view: 'manual', icon: BookOpen, label: '매뉴얼' },
  { view: 'settings', icon: Settings, label: '설정' }
]

export interface SidebarPrefs {
  /** 사용자 선호 순서. 새로 추가된 view 는 자동으로 뒤에 append. */
  order: View[]
  /** 숨김 처리된 view 목록. */
  hidden: View[]
}

export const DEFAULT_SIDEBAR_PREFS: SidebarPrefs = {
  order: CUSTOMIZABLE_NAV_ITEMS.map((i) => i.view),
  hidden: []
}

/** 저장된 prefs 와 현재 카탈로그를 머지 — 신규 항목은 뒤에 append, 사라진 항목은 제거. */
function resolveOrderedItems(prefs: SidebarPrefs | null): SidebarNavItem[] {
  const map = new Map(CUSTOMIZABLE_NAV_ITEMS.map((i) => [i.view, i]))
  const seen = new Set<View>()
  const ordered: SidebarNavItem[] = []
  const order = prefs?.order || DEFAULT_SIDEBAR_PREFS.order
  const hidden = new Set(prefs?.hidden || [])
  for (const view of order) {
    const item = map.get(view)
    if (item && !seen.has(view)) { ordered.push(item); seen.add(view) }
  }
  // 새로 추가된 view (사용자 prefs 에 없음) 는 카탈로그 순서대로 뒤에
  for (const item of CUSTOMIZABLE_NAV_ITEMS) {
    if (!seen.has(item.view)) ordered.push(item)
  }
  return ordered.filter((i) => !hidden.has(i.view))
}

/** Design System v1 Sidebar (56px). 36×36 버튼, 20px 아이콘, 활성 상태 blue 그라디언트.
 *  불투명도 낮은 분리선으로 그룹 구분. */
function NavButton({
  view, icon: Icon, label, active, onClick, badge, pulse
}: SidebarNavItem & { active: boolean; onClick: () => void; badge?: number; pulse?: boolean }): JSX.Element {
  return (
    <button
      key={view}
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`relative w-9 h-9 rounded-[7px] flex items-center justify-center transition-all duration-150 ${
        active
          ? 'bg-gradient-to-br from-clauday-blue to-clauday-blue/80 text-white shadow-md shadow-clauday-blue/20'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
      }`}
    >
      <Icon size={20} />
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-clauday-orange text-white text-[9px] font-bold flex items-center justify-center border-2 border-bg-surface">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {pulse && (!badge || badge === 0) && (
        <span className="absolute top-0.5 right-0.5 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-clauday-orange opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-clauday-orange" />
        </span>
      )}
    </button>
  )
}

function Sidebar({ activeView, onViewChange }: SidebarProps): JSX.Element {
  const feedback = useFeedback()
  const [monitoringUnread, setMonitoringUnread] = useState(0)
  const [monitoringPulse, setMonitoringPulse] = useState(false)
  const [agentUnread, setAgentUnread] = useState(0)
  const [agentPulse, setAgentPulse] = useState(false)
  const [prefs, setPrefs] = useState<SidebarPrefs | null>(null)

  // 저장된 prefs 로드 + 변경 이벤트 구독 — 설정에서 바꾸면 즉시 반영
  useEffect(() => {
    const load = (): void => {
      window.api.settings.get('sidebarPrefs')
        .then((saved) => {
          if (saved && typeof saved === 'object') setPrefs(saved as SidebarPrefs)
          else setPrefs(null)
        })
        .catch(() => setPrefs(null))
    }
    load()
    const onChange = (): void => load()
    window.addEventListener('sidebar-prefs-changed', onChange)
    return () => window.removeEventListener('sidebar-prefs-changed', onChange)
  }, [])

  useEffect(() => {
    const refresh = async (): Promise<void> => {
      try {
        const counts = await window.api.watcher.unreadCounts()
        const total = Object.values(counts).reduce((a, b) => a + b, 0)
        setMonitoringUnread(total)
      } catch { /* ignore */ }
    }
    refresh()
    const unsub = window.api.watcher.onNewMessages(({ messages }) => {
      refresh()
      if (messages && messages.length > 0) setMonitoringPulse(true)
    })
    const timer = setInterval(refresh, 10_000)
    return () => { unsub(); clearInterval(timer) }
  }, [])

  // v1.4: 에이전트 멘션 알림 — 와처와 동일 패턴
  useEffect(() => {
    const off = window.api.mention.onReceived(() => {
      setAgentUnread((n) => n + 1)
      setAgentPulse(true)
    })
    return off
  }, [])

  useEffect(() => {
    if (activeView === 'monitoring') setMonitoringPulse(false)
    if (activeView === 'agent') {
      setAgentUnread(0)
      setAgentPulse(false)
    }
  }, [activeView])

  const items = resolveOrderedItems(prefs)

  return (
    <aside className="w-14 bg-bg-surface border-r border-bg-border flex flex-col items-center py-2 gap-0.5 flex-shrink-0">
      {items.map((item) => (
        <NavButton
          key={item.view}
          {...item}
          active={activeView === item.view}
          onClick={() => onViewChange(item.view)}
          badge={
            item.view === 'monitoring' ? monitoringUnread :
            item.view === 'agent' ? agentUnread : undefined
          }
          pulse={
            item.view === 'monitoring' ? monitoringPulse :
            item.view === 'agent' ? agentPulse : undefined
          }
        />
      ))}
      <div className="flex-1" />
      <div className="w-7 h-px bg-bg-border/60 my-1" />
      {/* 피드백 버튼 */}
      <button
        onClick={() => feedback.open()}
        title="피드백"
        aria-label="피드백"
        className="w-9 h-9 rounded-[7px] flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-all duration-150"
      >
        <MessageSquarePlus size={20} />
      </button>
      {STANDALONE_ITEMS.map((item) => (
        <NavButton
          key={item.view}
          {...item}
          active={activeView === item.view}
          onClick={() => onViewChange(item.view)}
        />
      ))}
    </aside>
  )
}

export default Sidebar
