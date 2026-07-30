import { useEffect, useState } from 'react'
import { Server, Sparkles, BarChart3, Calendar, Terminal, BookOpen, MessageSquare, GitBranch, Settings, Users, Radar, Lightbulb, Bot, Workflow } from 'lucide-react'

export type SidebarView = 'mcp' | 'skills' | 'usage' | 'dooray' | 'terminal' | 'manual' | 'sessions' | 'settings' | 'community' | 'monitoring' | 'ai-recommend' | 'agent' | 'harness' | 'workspace'
// 호환성 유지를 위해 기존 별칭도 export
export type View = SidebarView

interface SidebarProps {
  activeView: View
  onViewChange: (view: View) => void
  /** 아이콘만 보기 ↔ 아이콘+이름. 토글 버튼은 타이틀바에 있다. */
  expanded?: boolean
}

/** 도메인 식별색 — Claude 계열은 주황, 두레이 계열은 파랑. 나머지는 무채색. */
export type NavAccent = 'claude' | 'dooray' | undefined

export interface SidebarNavItem { view: View; icon: typeof Server; label: string; accent?: NavAccent }

const ACCENT_CLASS: Record<'claude' | 'dooray', string> = {
  claude: 'text-brand-claude',
  dooray: 'text-brand-dooray'
}

/** 사용자가 순서/노출을 커스텀할 수 있는 항목 전체 (settings/manual 은 standalone, 항상 노출/고정). */
export const CUSTOMIZABLE_NAV_ITEMS: SidebarNavItem[] = [
  { view: 'dooray', icon: Calendar, label: '두레이', accent: 'dooray' },
  { view: 'monitoring', icon: Radar, label: '모니터링', accent: 'dooray' },
  { view: 'agent', icon: Bot, label: '에이전트', accent: 'dooray' },
  { view: 'terminal', icon: Terminal, label: '터미널' },
  { view: 'harness', icon: Workflow, label: 'Harness Studio', accent: 'claude' },
  { view: 'community', icon: Users, label: '커뮤니티', accent: 'dooray' },
  { view: 'mcp', icon: Server, label: 'MCP 서버', accent: 'claude' },
  { view: 'skills', icon: Sparkles, label: 'Claude 스킬', accent: 'claude' },
  { view: 'ai-recommend', icon: Lightbulb, label: 'AI 추천', accent: 'claude' },
  { view: 'sessions', icon: MessageSquare, label: 'Claude 채팅', accent: 'claude' },
  { view: 'usage', icon: BarChart3, label: '사용량', accent: 'claude' }
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

/** Design System Sidebar. 36×36 버튼, 20px 아이콘. 활성 상태는 무채색(--bg-active 면 + 밝은 글자) —
 *  크롬에는 색을 쓰지 않는다. 배지는 --badge-* 토큰(라이트=오렌지, 다크=밝은 회색 면). */
function NavButton({
  view, icon: Icon, label, accent, active, onClick, badge, pulse, expanded
}: SidebarNavItem & { active: boolean; onClick: () => void; badge?: number; pulse?: boolean; expanded: boolean }): JSX.Element {
  // 도메인 색은 활성/비활성과 무관하게 유지한다 — 클릭할 때 색이 빠지면 이질적이다.
  const iconClass = accent ? ACCENT_CLASS[accent] : ''
  return (
    <button
      key={view}
      onClick={onClick}
      title={expanded ? undefined : label}
      aria-label={label}
      className={`relative h-9 rounded-[7px] flex items-center transition-all duration-150 ${
        expanded ? 'w-full gap-2.5 px-2.5 justify-start' : 'w-9 justify-center'
      } ${
        active
          ? 'bg-bg-active text-text-primary'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
      }`}
    >
      <Icon size={20} className={`flex-none ${iconClass}`} />
      {expanded && (
        <span className="text-[calc(12px_*_var(--app-font-scale,1))] font-medium truncate">{label}</span>
      )}
      {badge !== undefined && badge > 0 && (
        <span className={`min-w-[14px] h-[14px] px-[3px] rounded-full bg-badge-bg text-badge-fg text-[calc(9px_*_var(--app-font-scale,1))] font-bold flex items-center justify-center ${
          expanded ? 'ml-auto flex-none' : 'absolute -top-0.5 -right-0.5 border-2 border-bg-sidebar'
        }`}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {pulse && (!badge || badge === 0) && (
        <span className="absolute top-0.5 right-0.5 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-badge-bg opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-badge-bg" />
        </span>
      )}
    </button>
  )
}

function Sidebar({ activeView, onViewChange, expanded = true }: SidebarProps): JSX.Element {
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
    <aside className={`bg-bg-sidebar border-r border-bg-border flex flex-col py-2 gap-0.5 flex-shrink-0 transition-[width] duration-150 ${
      expanded ? 'w-44 items-stretch px-2' : 'w-14 items-center'
    }`}>
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
          expanded={expanded}
        />
      ))}
      <div className="flex-1" />
      <div className="w-7 h-px bg-bg-border/60 my-1" />
      {STANDALONE_ITEMS.map((item) => (
        <NavButton
          key={item.view}
          {...item}
          active={activeView === item.view}
          onClick={() => onViewChange(item.view)}
          expanded={expanded}
        />
      ))}
    </aside>
  )
}

export default Sidebar
