import { useEffect, useState } from 'react'
import {
  DEFAULT_TERMINAL_FONT,
  resolveTerminalFont,
  type TerminalFontSettings
} from '@shared/terminal/fonts'

const SETTINGS_KEY = 'terminalFont'
export const TERMINAL_FONT_CHANGED = 'terminal-font-changed'

/** 지금 터미널 글꼴 설정. 바꾸면 열려 있는 pane 에도 바로 반영된다. */
export function useTerminalFont(): TerminalFontSettings {
  const [font, setFont] = useState<TerminalFontSettings>(DEFAULT_TERMINAL_FONT)

  useEffect(() => {
    const load = (): void => {
      void window.api.settings
        .get(SETTINGS_KEY)
        .then((saved) => setFont(resolveTerminalFont(saved)))
        .catch(() => undefined)
    }
    load()
    window.addEventListener(TERMINAL_FONT_CHANGED, load)
    return () => window.removeEventListener(TERMINAL_FONT_CHANGED, load)
  }, [])

  return font
}

export async function saveTerminalFont(next: TerminalFontSettings): Promise<void> {
  await window.api.settings.set(SETTINGS_KEY, next)
  window.dispatchEvent(new CustomEvent(TERMINAL_FONT_CHANGED))
}
