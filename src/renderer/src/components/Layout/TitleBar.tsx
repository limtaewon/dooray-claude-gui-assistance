import { Search, Moon, Sun, PanelLeft } from 'lucide-react'
import GlobalAIIndicator from '../common/GlobalAIIndicator'
import UpdateButton from '../common/UpdateButton'
import ClaudayMark from '../common/ClaudayMark'
import { useTheme } from '../../hooks/useTheme'
import { Kbd } from '../common/ds'

interface TitleBarProps {
  /** ⌘K 커맨드 팔레트 트리거 */
  onOpenCommandPalette?: () => void
  /** 사이드바 아이콘/이름 토글 — 신호등 옆에 둔다(Orca 배치) */
  sidebarExpanded?: boolean
  onToggleSidebar?: () => void
}

/** Design System v1 TitleBar (36px). 좌측 traffic lights + 브랜드, 우측 ⌘K + 테마 토글 */
function TitleBar({ onOpenCommandPalette, sidebarExpanded, onToggleSidebar }: TitleBarProps): JSX.Element {
  const { theme, toggle } = useTheme()

  return (
    <header
      className="drag-region ds-titlebar"
      style={{ paddingLeft: 82 }}  /* 신호등 자리 */
    >
      <div className="flex items-center gap-1.5 no-drag relative z-10">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            title={sidebarExpanded ? '사이드바 접기' : '사이드바 펼치기'}
            aria-label={sidebarExpanded ? '사이드바 접기' : '사이드바 펼치기'}
            aria-pressed={sidebarExpanded}
            className="ds-btn ghost icon sm mr-1"
          >
            <PanelLeft size={14} />
          </button>
        )}
        <ClaudayMark size={15} />
        <span className="text-[calc(12px_*_var(--app-font-scale,1))] font-semibold text-text-primary leading-none">Clauday</span>
        <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary leading-none ml-0.5">Claude Code GUI</span>
      </div>

      {/* 중앙: 전역 AI 작업 인디케이터 */}
      <div className="flex-1 flex justify-center no-drag relative z-10 min-w-0">
        <GlobalAIIndicator />
      </div>

      {/* 우측: 업데이트(있을 때만) + ⌘K + 테마 토글 */}
      <div className="flex items-center gap-1 no-drag relative z-10">
        <UpdateButton />
        {onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            title="명령 팔레트"
            className="ds-btn ghost sm flex items-center gap-1"
          >
            <Search size={11} />
            <Kbd>⌘K</Kbd>
          </button>
        )}
        {/* 라벨과 아이콘 모두 '지금 어떤 테마인지'를 말한다.
            목적지를 적으면(다크에서 「Light」) 화면 글자만 보는 사용자는 현재 테마 이름으로 읽는다.
            할 동작은 title/aria-label 이 커맨드 팔레트와 같은 문구로 알린다. */}
        <button
          onClick={toggle}
          title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
          aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
          className="ds-btn ghost sm flex items-center gap-1"
        >
          {theme === 'dark' ? <Moon size={12} /> : <Sun size={12} />}
          <span>{theme === 'dark' ? '다크' : '라이트'}</span>
        </button>
      </div>
    </header>
  )
}

export default TitleBar
