import { useEffect, useState } from 'react'
import {
  DEFAULT_TERMINAL_THEME_ID,
  resolveTerminalTheme,
  type TerminalTheme
} from '@shared/terminal/themes'

const SETTINGS_KEY = 'terminalTheme'
/** 설정에서 바꾸면 열려 있는 모든 pane 이 즉시 따라오도록 */
export const TERMINAL_THEME_CHANGED = 'terminal-theme-changed'

/** 지금 터미널 테마. 설정 변경을 구독해 살아 있는 pane 에도 바로 반영된다. */
export function useTerminalTheme(): TerminalTheme {
  const [id, setId] = useState<string>(DEFAULT_TERMINAL_THEME_ID)

  useEffect(() => {
    const load = (): void => {
      void window.api.settings
        .get(SETTINGS_KEY)
        .then((saved) => setId(typeof saved === 'string' ? saved : DEFAULT_TERMINAL_THEME_ID))
        .catch(() => undefined)
    }
    load()
    window.addEventListener(TERMINAL_THEME_CHANGED, load)
    return () => window.removeEventListener(TERMINAL_THEME_CHANGED, load)
  }, [])

  return resolveTerminalTheme(id)
}

/** 테마를 저장하고 열려 있는 터미널에 알린다. */
export async function saveTerminalTheme(id: string): Promise<void> {
  await window.api.settings.set(SETTINGS_KEY, id)
  window.dispatchEvent(new CustomEvent(TERMINAL_THEME_CHANGED))
}
