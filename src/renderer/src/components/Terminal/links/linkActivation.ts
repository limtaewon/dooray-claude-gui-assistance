/**
 * 링크 활성화 판정 — Cmd(mac)/Ctrl(win/linux) + 클릭. `TerminalPane.tsx` 의 기존 `isMac` 판별과
 * 동일한 `navigator.platform` 휴리스틱을 재사용한다 (기존 커스텀 provider 의 관례 유지).
 */
function isMacPlatform(): boolean {
  return navigator.platform.toUpperCase().includes('MAC')
}

export function isLinkActivationEvent(event: Pick<MouseEvent, 'metaKey' | 'ctrlKey'> | undefined): boolean {
  return isMacPlatform() ? Boolean(event?.metaKey) : Boolean(event?.ctrlKey)
}

/** Alt 조합은 마우스 리포팅 TUI 로 그대로 보내야 하는 xterm 관례 — URL 활성화에서는 제외한다. */
export function isHttpLinkActivationEvent(event: MouseEvent | undefined): boolean {
  return Boolean(event && !event.altKey && isLinkActivationEvent(event))
}
