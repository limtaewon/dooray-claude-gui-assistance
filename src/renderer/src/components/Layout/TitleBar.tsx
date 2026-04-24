import { Clover, Search, Moon, Sun } from 'lucide-react'
import GlobalAIIndicator from '../common/GlobalAIIndicator'
import { useTheme } from '../../hooks/useTheme'
import { Kbd } from '../common/ds'

interface TitleBarProps {
  /** ⌘K 커맨드 팔레트 트리거 */
  onOpenCommandPalette?: () => void
}

/** Design System v1 TitleBar (36px). 좌측 traffic lights + 브랜드, 우측 ⌘K + 테마 토글 */
function TitleBar({ onOpenCommandPalette }: TitleBarProps): JSX.Element {
  const { theme, toggle } = useTheme()

  return (
    <header
      className="drag-region ds-titlebar"
      style={{ paddingLeft: 82 }}  /* 신호등 자리 */
    >
      <div className="flex items-center gap-1.5 no-drag relative z-10">
        <Clover size={15} className="text-clover-orange" />
        <span className="text-[12px] font-semibold text-text-primary leading-none">Clauday</span>
        <span className="text-[10px] text-text-secondary leading-none ml-0.5">Claude Code GUI</span>
      </div>

      {/* 중앙: 전역 AI 작업 인디케이터 */}
      <div className="flex-1 flex justify-center no-drag relative z-10 min-w-0">
        <GlobalAIIndicator />
      </div>

      {/* 우측: ⌘K + 테마 토글 */}
      <div className="flex items-center gap-1 no-drag relative z-10">
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
        <button
          onClick={toggle}
          title={theme === 'dark' ? '라이트 모드로' : '다크 모드로'}
          className="ds-btn ghost sm flex items-center gap-1"
        >
          {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
          <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
      </div>
    </header>
  )
}

export default TitleBar
