import { ClipboardList, Terminal as TerminalIcon } from 'lucide-react'
import { Kbd } from '../common/ds'
import { TERMINAL_SHORTCUTS, type TerminalShortcutBinding } from './terminalShortcuts'

/** 빈 화면에 안내할 단축키 — 처음 열었을 때 알아야 할 것만 추린다. */
const GUIDE_IDS = ['newTab', 'splitRight', 'splitDown', 'closePane', 'toggleTaskDrawer'] as const

const GUIDE_LABELS: Record<(typeof GUIDE_IDS)[number], string> = {
  newTab: '새 터미널 탭',
  splitRight: '오른쪽으로 분할',
  splitDown: '아래로 분할',
  closePane: 'pane 닫기',
  toggleTaskDrawer: '두레이 업무 패널'
}

interface TerminalEmptyStateProps {
  onCreateTab: () => void
  onOpenTaskDrawer: () => void
  drawerOpen: boolean
}

/** 표기용 칩 분해 — `⌘⇧D` / `Ctrl+Shift+D` 를 낱개 키로 나눈다. */
function keyChips(binding: TerminalShortcutBinding, isMac: boolean): string[] {
  const label = isMac ? binding.macLabel : binding.winLabel
  return isMac ? [...label] : label.split('+')
}

/** 탭이 하나도 없을 때의 안내 화면 — 무엇을 할 수 있는지와 단축키를 한 번에 보여준다. */
function TerminalEmptyState({ onCreateTab, onOpenTaskDrawer, drawerOpen }: TerminalEmptyStateProps): JSX.Element {
  const isMac = navigator.platform.toUpperCase().includes('MAC')
  const guides = GUIDE_IDS.map((id) => ({
    id,
    label: GUIDE_LABELS[id],
    binding: TERMINAL_SHORTCUTS.find((b) => b.id === id)
  })).filter((g) => g.binding)

  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      <div className="w-14 h-14 rounded-[14px] bg-bg-surface border border-bg-border flex items-center justify-center">
        <TerminalIcon size={26} className="text-text-secondary" />
      </div>
      <h2 className="mt-5 text-[calc(24px_*_var(--app-font-scale,1))] font-bold text-text-primary">터미널</h2>
      <p className="mt-2 text-[calc(12.5px_*_var(--app-font-scale,1))] text-text-secondary">
        셸 세션을 열어 작업을 시작하세요.
      </p>

      <div className="flex items-center gap-2 mt-6">
        <button onClick={onCreateTab} className="ds-btn primary">
          <TerminalIcon size={14} /> 새 터미널
        </button>
        <button onClick={onOpenTaskDrawer} className="ds-btn secondary" disabled={drawerOpen}>
          <ClipboardList size={14} /> 두레이 업무 열기
        </button>
      </div>

      <div className="mt-10 w-full max-w-sm flex flex-col gap-2.5">
        {guides.map((g) => (
          <div key={g.id} className="flex items-center gap-3">
            <span className="flex-1 text-[calc(12.5px_*_var(--app-font-scale,1))] text-text-secondary">{g.label}</span>
            <span className="flex items-center gap-1">
              {keyChips(g.binding as TerminalShortcutBinding, isMac).map((k, i) => (
                <Kbd key={i}>{k}</Kbd>
              ))}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-8 text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary">
        업무 카드를 터미널로 끌어다 놓으면 그 폴더에서 바로 시작합니다
      </p>
    </div>
  )
}

export default TerminalEmptyState
