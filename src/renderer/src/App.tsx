import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Calendar as CalendarIcon, Terminal as TerminalIcon, GitBranch, Users, Server, Sparkles,
  MessageSquare, BarChart3, BookOpen, Settings as SettingsIcon, Radar, Moon, Sun, Lightbulb, Bot,
  LayoutDashboard, ListTodo, MessageCircle, FileText, CheckSquare, Workflow
} from 'lucide-react'
import Sidebar from './components/Layout/Sidebar'
import TitleBar from './components/Layout/TitleBar'
import MCPManager from './components/MCP/MCPManager'
import SkillsManager from './components/Skills/SkillsManager'
import ErrorBoundary from './components/common/ErrorBoundary'
import UsageDashboard from './components/Usage/UsageDashboard'
import DooraySetup from './components/Dooray/DooraySetup'
import DoorayAssistant from './components/Dooray/DoorayAssistant'
import TerminalView from './components/Terminal/TerminalView'
import MentionAgentView from './components/MentionAgent/MentionAgentView'
import ClaudeManual from './components/ClaudeManual/ClaudeManual'
import ClaudeCodeSessionsView from './components/Sessions/ClaudeCodeSessionsView'
import BranchWorkspace from './components/Git/BranchWorkspace'
import SettingsView from './components/Settings/SettingsView'
import ImageLightbox from './components/common/ImageLightbox'
import CommunityView from './components/Community/CommunityView'
import MonitoringView from './components/Monitoring/MonitoringView'
import AIRecommendView from './components/AIRecommend/AIRecommendView'
import HarnessStudioView from './components/HarnessStudio/HarnessStudioView'
import QuickTodoModal from './components/Dooray/QuickTodoModal'
import { ToastHost, CommandPalette, type CommandGroup, type CommandItem } from './components/common/ds'
import ErrorReportProvider from './components/ErrorReport/ErrorReportProvider'
import FeedbackProvider from './components/Feedback/FeedbackProvider'
import { useTheme } from './hooks/useTheme'

type View = 'mcp' | 'skills' | 'usage' | 'dooray' | 'terminal' | 'manual' | 'sessions' | 'git' | 'settings' | 'community' | 'monitoring' | 'ai-recommend' | 'agent' | 'harness'

/** Cmd+E 최근 뷰 LRU 항목 — sub 가 있으면 같은 view 안의 sub-tab 별로 별개 entry */
interface RecentViewItem {
  view: View
  /** 현재는 두레이 대시보드의 sub-tab(dashboard|tasks|wiki|calendar|messenger|briefing|report) 만 사용 */
  sub?: string
}

const DOORAY_SUBTAB_LABELS: Record<string, string> = {
  dashboard: '대시보드',
  tasks: '태스크',
  wiki: '위키',
  calendar: '캘린더',
  messenger: '메신저',
  briefing: '브리핑',
  report: '보고서'
}

function App(): JSX.Element {
  const [activeView, setActiveView] = useState<View>('dooray')
  const [doorayConfigured, setDoorayConfigured] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [quickTodoOpen, setQuickTodoOpen] = useState(false)
  const { theme, toggle: toggleTheme } = useTheme()

  // 앱 시작 시 startupView 설정 적용
  useEffect(() => {
    (async () => {
      const v = await window.api.settings.get('startupView') as string | null
      if (v === 'last') {
        const last = await window.api.settings.get('lastView') as View | null
        if (last) setActiveView(last)
      } else if (v && ['dooray', 'terminal', 'git'].includes(v)) {
        setActiveView(v as View)
      }
    })()
  }, [])

  // 뷰 변경 시 lastView 기록 + analytics
  const dwellStartRef = useRef<{ view: View; at: number } | null>(null)
  useEffect(() => {
    window.api.settings.set('lastView', activeView)
    const prev = dwellStartRef.current
    if (prev && prev.view !== activeView) {
      window.api.analytics.track('view.dwell', {
        durationMs: Date.now() - prev.at,
        meta: { view: prev.view }
      })
    }
    window.api.analytics.track('view.open', { meta: { view: activeView } })
    dwellStartRef.current = { view: activeView, at: Date.now() }
  }, [activeView])

  // ⌘K 글로벌 단축키 + Shift 2회 (IntelliJ "Search Everywhere" 식) 단축키
  useEffect(() => {
    const DOUBLE_SHIFT_MS = 400
    let lastShiftAt = 0
    let shiftCorrupted = false // Shift 누른 동안 다른 키 같이 눌렀으면 "쉬프트만 두 번" 패턴 아님

    const onKeyDown = (e: KeyboardEvent): void => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen((o) => !o)
        return
      }
      // ⌘/Ctrl+/ — 어디서든 오늘 할 일 빠른 추가
      if (meta && !e.shiftKey && (e.key === '/' || e.code === 'Slash')) {
        e.preventDefault()
        setQuickTodoOpen(true)
        return
      }
      // ⌘/Ctrl+Shift+B — 어디서든 피드백 모달
      if (meta && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('open-feedback-modal'))
        return
      }
      // Shift 외 다른 키가 같이 눌렸으면 더블 Shift 후보 무효화
      if (e.shiftKey && e.key !== 'Shift') {
        shiftCorrupted = true
      }
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key !== 'Shift') return
      // Shift+다른키 조합이었으면 카운트 안 함
      if (shiftCorrupted) {
        shiftCorrupted = false
        lastShiftAt = 0
        return
      }
      const now = Date.now()
      if (lastShiftAt && now - lastShiftAt < DOUBLE_SHIFT_MS) {
        // 입력 필드에서 Shift 두 번 눌러도 글자가 안 들어가니 그대로 트리거
        setCmdOpen((o) => !o)
        lastShiftAt = 0
      } else {
        lastShiftAt = now
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // #4 메뉴 이동 — Cmd+E "최근 뷰" 팝업.
  //   activeView/dooraySubTab 변경마다 recentItems LRU 의 맨 앞으로 옮김.
  //   두레이 같이 sub-tab 이 있는 뷰는 sub 별로 별개 entry — "두레이 - 캘린더" 식.
  //   ⌘E: 팝업 열기 + index=1(직전) 자동 highlight. 이미 열려있으면 다음 항목으로 cycle.
  //   ↑↓ 탐색, Enter 선택, Esc 닫기. (예전엔 ⌘ 떼면 자동 확정이었으나 사용자 피드백으로 모달 유지)
  const [doorayTab, setDoorayTab] = useState<string | undefined>(undefined)
  useEffect(() => {
    const onSub = (e: Event): void => {
      const tab = (e as CustomEvent<{ tab?: string }>).detail?.tab
      if (tab) setDoorayTab(tab)
    }
    window.addEventListener('dooray-subtab', onSub as EventListener)
    return () => window.removeEventListener('dooray-subtab', onSub as EventListener)
  }, [])

  const [recentItems, setRecentItems] = useState<RecentViewItem[]>([{ view: activeView }])
  const [recentPaletteOpen, setRecentPaletteOpen] = useState(false)
  const [recentIndex, setRecentIndex] = useState(0)

  useEffect(() => {
    const sub = activeView === 'dooray' ? doorayTab : undefined
    setRecentItems((prev) => {
      const next = [{ view: activeView, sub }, ...prev.filter((it) => !(it.view === activeView && (it.sub ?? '') === (sub ?? '')))]
      return next.slice(0, 10)
    })
  }, [activeView, doorayTab])

  const applyRecent = useCallback((targetIdx: number): void => {
    setRecentPaletteOpen(false)
    setRecentItems((prev) => {
      const target = prev[targetIdx]
      if (!target) return prev
      if (target.view !== activeView) setActiveView(target.view)
      if (target.view === 'dooray' && target.sub) {
        // 두레이 sub-tab 점프 — DoorayAssistant 가 listen 해서 setActiveTab
        window.dispatchEvent(new CustomEvent('goto-dooray-subtab', { detail: { tab: target.sub } }))
      }
      return prev
    })
  }, [activeView])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setRecentPaletteOpen((wasOpen) => {
          if (!wasOpen) {
            setRecentIndex(Math.min(1, recentItems.length - 1))
            // 터미널/xterm 등 다른 요소에 포커스가 있으면 화살표가 그쪽으로 흘러간다.
            // 팔레트가 자체 포커스를 잡기 전에 활성 요소부터 blur 해서 키 이벤트가 window 리스너로 직행하게.
            const active = document.activeElement as HTMLElement | null
            if (active && typeof active.blur === 'function') active.blur()
            return true
          }
          setRecentIndex((i) => {
            const max = Math.max(recentItems.length - 1, 0)
            return i >= max ? 0 : i + 1
          })
          return true
        })
        return
      }
      if (!recentPaletteOpen) return
      if (e.key === 'Escape') { e.preventDefault(); setRecentPaletteOpen(false) }
      else if (e.key === 'Enter') {
        e.preventDefault()
        setRecentIndex((i) => { applyRecent(i); return i })
      }
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setRecentIndex((i) => Math.min(i + 1, recentItems.length - 1))
      }
      else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setRecentIndex((i) => Math.max(i - 1, 0))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [recentPaletteOpen, recentItems.length, applyRecent])

  // 다른 화면(Claude 채팅 등)에서 인앱 터미널로 이동 요청
  useEffect(() => {
    const onGoto = (): void => setActiveView('terminal')
    window.addEventListener('goto-terminal', onGoto)
    return () => window.removeEventListener('goto-terminal', onGoto)
  }, [])

  // 다른 화면에서 설정으로 이동 요청
  useEffect(() => {
    const onGoto = (): void => setActiveView('settings')
    window.addEventListener('goto-settings', onGoto)
    return () => window.removeEventListener('goto-settings', onGoto)
  }, [])

  // #7 OS 알림 클릭 → AI 추천 화면. preload 가 ipc 받아 콜백으로 라우팅.
  useEffect(() => {
    return window.api.aiRecommendNotify.onGoto(() => setActiveView('ai-recommend'))
  }, [])

  // 커맨드 팔레트 그룹 구성
  const commandGroups = useMemo<CommandGroup[]>(() => [
    {
      label: '이동',
      items: [
        { id: 'go-dooray:dashboard', label: '두레이 — 대시보드', icon: <LayoutDashboard size={13} />, hint: '⌘1' },
        { id: 'go-dooray:tasks', label: '두레이 — 태스크', icon: <ListTodo size={13} /> },
        { id: 'go-dooray:wiki', label: '두레이 — 위키', icon: <BookOpen size={13} /> },
        { id: 'go-dooray:calendar', label: '두레이 — 캘린더', icon: <CalendarIcon size={13} /> },
        { id: 'go-dooray:messenger', label: '두레이 — 메신저', icon: <MessageCircle size={13} /> },
        { id: 'go-dooray:briefing', label: '두레이 — AI 브리핑', icon: <Sparkles size={13} /> },
        { id: 'go-dooray:report', label: '두레이 — AI 보고서', icon: <FileText size={13} /> },
        { id: 'go-monitoring', label: '모니터링', icon: <Radar size={13} />, hint: '⌘2' },
        { id: 'go-agent', label: '에이전트', icon: <Bot size={13} /> },
        { id: 'go-terminal', label: '터미널', icon: <TerminalIcon size={13} />, hint: '⌘3' },
        { id: 'go-git', label: '브랜치 작업', icon: <GitBranch size={13} />, hint: '⌘4' },
        { id: 'go-harness', label: 'Harness Studio', icon: <Workflow size={13} /> },
        { id: 'go-community', label: '커뮤니티', icon: <Users size={13} /> },
        { id: 'go-mcp', label: 'MCP 서버', icon: <Server size={13} /> },
        { id: 'go-skills', label: 'Claude 스킬', icon: <Sparkles size={13} /> },
        { id: 'go-ai-recommend', label: 'AI 추천', icon: <Lightbulb size={13} /> },
        { id: 'go-sessions', label: '세션', icon: <MessageSquare size={13} /> },
        { id: 'go-usage', label: '사용량', icon: <BarChart3 size={13} /> },
        { id: 'go-manual', label: '매뉴얼', icon: <BookOpen size={13} /> },
        { id: 'go-settings', label: '설정', icon: <SettingsIcon size={13} /> }
      ]
    },
    {
      label: '명령',
      items: [
        {
          id: 'quick-todo',
          label: '오늘 할 일 빠른 추가',
          icon: <CheckSquare size={13} className="text-emerald-500" />,
          hint: '⌘/'
        },
        {
          id: 'toggle-theme',
          label: theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환',
          icon: theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />,
          hint: ''
        }
      ]
    }
  ], [theme])

  const runCommand = (item: CommandItem): void => {
    if (item.id.startsWith('go-')) {
      const target = item.id.slice(3) // e.g. "dooray:tasks" or "monitoring"
      const [view, subTab] = target.split(':') as [View, string | undefined]
      setActiveView(view)
      if (view === 'dooray' && subTab) {
        // DoorayAssistant 가 listen — 약간의 지연(렌더 후) 보장 위해 microtask 로 dispatch
        Promise.resolve().then(() => {
          window.dispatchEvent(new CustomEvent('goto-dooray-subtab', { detail: { tab: subTab } }))
        })
      }
      return
    }
    if (item.id === 'toggle-theme') toggleTheme()
    if (item.id === 'quick-todo') setQuickTodoOpen(true)
  }

  // 뷰별 visibility — 항상 마운트
  const vis = (view: View): string =>
    activeView === view ? 'z-10' : 'z-0 pointer-events-none invisible'

  return (
    <ToastHost>
      <ErrorReportProvider>
      <FeedbackProvider>
      <div className="flex flex-col h-full bg-bg-primary">
        <TitleBar onOpenCommandPalette={() => setCmdOpen(true)} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar activeView={activeView} onViewChange={setActiveView} />
          <main className="flex-1 overflow-hidden relative">
            <div className={`absolute inset-0 ${vis('dooray')}`}>
              {doorayConfigured ? (
                <DoorayAssistant onDisconnect={async () => {
                  if (!window.confirm('두레이 연결을 해제할까요?\n저장된 API 토큰이 제거되고 다시 로그인해야 합니다.')) return
                  await window.api.dooray.deleteToken()
                  setDoorayConfigured(false)
                }} />
              ) : (
                <DooraySetup onConfigured={() => setDoorayConfigured(true)} />
              )}
            </div>
            <div className={`absolute inset-0 ${vis('terminal')}`}>
              <TerminalView />
            </div>
            <div className={`absolute inset-0 ${vis('agent')}`}>
              <MentionAgentView />
            </div>
            <div className={`absolute inset-0 ${vis('git')}`}>
              <BranchWorkspace onOpenTerminal={() => setActiveView('terminal')} />
            </div>
            <div className={`absolute inset-0 ${vis('mcp')}`}><MCPManager /></div>
            <div className={`absolute inset-0 ${vis('skills')}`}>
              <ErrorBoundary label="Skills"><SkillsManager /></ErrorBoundary>
            </div>
            <div className={`absolute inset-0 ${vis('ai-recommend')}`}>
              <ErrorBoundary label="AI Recommend"><AIRecommendView /></ErrorBoundary>
            </div>
            <div className={`absolute inset-0 ${vis('community')}`}><CommunityView active={activeView === 'community'} /></div>
            <div className={`absolute inset-0 ${vis('monitoring')}`}>
              <ErrorBoundary label="Monitoring">
                <MonitoringView active={activeView === 'monitoring'} />
              </ErrorBoundary>
            </div>
            <div className={`absolute inset-0 ${vis('sessions')}`}>
              <ErrorBoundary label="Claude Code">
                <ClaudeCodeSessionsView active={activeView === 'sessions'} />
              </ErrorBoundary>
            </div>
            <div className={`absolute inset-0 ${vis('harness')}`}>
              <ErrorBoundary label="Harness Studio">
                <HarnessStudioView active={activeView === 'harness'} />
              </ErrorBoundary>
            </div>
            <div className={`absolute inset-0 ${vis('usage')}`}><UsageDashboard /></div>
            <div className={`absolute inset-0 ${vis('manual')}`}><ClaudeManual /></div>
            <div className={`absolute inset-0 ${vis('settings')}`}><SettingsView /></div>
          </main>
        </div>
        <ImageLightbox />
        <CommandPalette
          open={cmdOpen}
          onClose={() => setCmdOpen(false)}
          groups={commandGroups}
          onRun={runCommand}
        />
        <RecentViewsPalette
          open={recentPaletteOpen}
          items={recentItems}
          index={recentIndex}
          onHover={setRecentIndex}
          onPick={applyRecent}
          onClose={() => setRecentPaletteOpen(false)}
        />
        <QuickTodoModal open={quickTodoOpen} onClose={() => setQuickTodoOpen(false)} />
      </div>
      </FeedbackProvider>
      </ErrorReportProvider>
    </ToastHost>
  )
}

/**
 * Cmd+E 최근 뷰 팝업.
 * 0번째는 현재 활성 항목 (옅게). 1번째부터가 직전 뷰들.
 * sub 가 있으면 "두레이 - 캘린더" 식 라벨로 분리 표시.
 * Esc 또는 backdrop 클릭으로만 닫힘 (예전엔 ⌘ 떼면 자동 확정이었으나 사용자 피드백으로 모달 유지).
 */
function RecentViewsPalette({ open, items, index, onHover, onPick, onClose }: {
  open: boolean
  items: RecentViewItem[]
  index: number
  onHover: (i: number) => void
  onPick: (i: number) => void
  onClose: () => void
}): JSX.Element | null {
  if (!open) return null
  const labelOf = (it: RecentViewItem): { label: string; icon: JSX.Element } => {
    const v = it.view
    const base = ((): { label: string; icon: JSX.Element } => {
      switch (v) {
        case 'dooray': return { label: '두레이', icon: <CalendarIcon size={13} /> }
        case 'monitoring': return { label: '모니터링', icon: <Radar size={13} /> }
        case 'terminal': return { label: '터미널', icon: <TerminalIcon size={13} /> }
        case 'git': return { label: '브랜치 작업', icon: <GitBranch size={13} /> }
        case 'community': return { label: '커뮤니티', icon: <Users size={13} /> }
        case 'mcp': return { label: 'MCP 서버', icon: <Server size={13} /> }
        case 'skills': return { label: 'Claude 스킬', icon: <Sparkles size={13} /> }
        case 'ai-recommend': return { label: 'AI 추천', icon: <Lightbulb size={13} /> }
        case 'sessions': return { label: '세션', icon: <MessageSquare size={13} /> }
        case 'usage': return { label: '사용량', icon: <BarChart3 size={13} /> }
        case 'manual': return { label: '매뉴얼', icon: <BookOpen size={13} /> }
        case 'settings': return { label: '설정', icon: <SettingsIcon size={13} /> }
        case 'agent': return { label: '에이전트', icon: <Bot size={13} /> }
        case 'harness': return { label: 'Harness Studio', icon: <Workflow size={13} /> }
        default: return { label: v, icon: <BookOpen size={13} /> }
      }
    })()
    if (it.sub && v === 'dooray') {
      const subLabel = DOORAY_SUBTAB_LABELS[it.sub] ?? it.sub
      return { label: `${base.label} · ${subLabel}`, icon: base.icon }
    }
    return base
  }
  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[18vh] bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        // 팔레트가 열리면 즉시 포커스를 잡아 xterm 등 다른 요소가 화살표를 가로채는 것을 막는다.
        ref={(el) => { if (el) el.focus() }}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-[380px] rounded-xl shadow-2xl overflow-hidden outline-none"
        style={{ background: 'var(--bg-surface-raised)', border: '1px solid var(--bg-border)' }}
      >
        <div className="px-3 py-2 border-b border-bg-border flex items-center gap-2">
          <span className="text-[10px] font-semibold text-text-secondary">최근 뷰</span>
          <span className="text-[10px] text-text-tertiary">⌘E 다음 · ↑↓ 이동 · Enter 선택 · Esc 닫기</span>
        </div>
        <div className="py-1 max-h-[60vh] overflow-y-auto">
          {items.map((it, i) => {
            const { label, icon } = labelOf(it)
            const hi = i === index
            const isCurrent = i === 0
            return (
              <button
                key={`${it.view}:${it.sub ?? ''}-${i}`}
                onMouseEnter={() => onHover(i)}
                onClick={() => onPick(i)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                  hi ? 'bg-clauday-blue/15' : 'hover:bg-bg-surface-hover'
                }`}
              >
                <span className={hi ? 'text-clauday-blue' : isCurrent ? 'text-text-tertiary' : 'text-text-secondary'}>
                  {icon}
                </span>
                <span className={`text-[12px] flex-1 truncate ${hi ? 'text-text-primary font-medium' : isCurrent ? 'text-text-tertiary' : 'text-text-primary'}`}>
                  {label}
                </span>
                {isCurrent && <span className="text-[9px] text-text-tertiary">현재</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default App
