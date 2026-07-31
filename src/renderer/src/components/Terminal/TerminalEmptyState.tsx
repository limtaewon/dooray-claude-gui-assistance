import { PanelRight, Terminal as TerminalIcon } from 'lucide-react'
import { OnboardingView } from '../common/ds'
import { VIEW_ONBOARDING } from '../common/onboarding/viewOnboarding'
import { TERMINAL_SHORTCUTS, type TerminalShortcutBinding } from './terminalShortcuts'

/** 빈 화면에 안내할 단축키 — 처음 열었을 때 알아야 할 것만 추린다. */
const GUIDE_IDS = ['newTab', 'splitRight', 'splitDown', 'closePane', 'toggleTaskDrawer'] as const

const GUIDE_LABELS: Record<(typeof GUIDE_IDS)[number], string> = {
  newTab: '새 터미널 탭',
  splitRight: '오른쪽으로 분할',
  splitDown: '아래로 분할',
  closePane: 'pane 닫기',
  toggleTaskDrawer: '사이드 패널 열기/닫기'
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
  const copy = VIEW_ONBOARDING.terminal

  const steps = GUIDE_IDS.map((id) => ({ id, binding: TERMINAL_SHORTCUTS.find((b) => b.id === id) }))
    .filter((g): g is { id: (typeof GUIDE_IDS)[number]; binding: TerminalShortcutBinding } => Boolean(g.binding))
    .map((g) => ({ title: GUIDE_LABELS[g.id], keys: keyChips(g.binding, isMac) }))

  return (
    <OnboardingView
      icon={TerminalIcon}
      title={copy.title}
      description={copy.description}
      steps={steps}
      hint={copy.hint}
      actions={[
        { label: '새 터미널', variant: 'primary', icon: TerminalIcon, onClick: onCreateTab },
        { label: '사이드 패널 열기', icon: PanelRight, onClick: onOpenTaskDrawer, disabled: drawerOpen }
      ]}
    />
  )
}

export default TerminalEmptyState
