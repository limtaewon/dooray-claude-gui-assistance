/** xterm 에 그대로 넘기는 windowsPty 옵션 형태 (`@xterm/xterm` 의 `IWindowsPty` 와 동일). */
export interface WindowsPtyOptions {
  backend: 'conpty'
  buildNumber: number
}

/** ConPTY 가 wrap marker 를 정확히 보고하기 시작하는 Windows 11 빌드 (ADR-v2-windows-fix-03 §4). */
const CONPTY_REFLOW_BUILD_GATE = 21376

/**
 * xterm 의 windowsPty 옵션. win32 + 신형 ConPTY(빌드 21376 이상)에서만 값을 돌려주고, 그 외
 * (구형 빌드 · 다른 플랫폼 · 파싱 실패)에는 undefined 로 떨어져 현행 동작을 그대로 보존한다.
 * 지정 시 reflow-off 휴리스틱이 켜지는데, 실기 검증 없이 구형 빌드까지 켜는 것은 위험해 게이트를 둔다.
 */
export function windowsPtyOptions(
  platform: string,
  osRelease: string | undefined
): WindowsPtyOptions | undefined {
  if (platform !== 'win32' || !osRelease) return undefined
  const buildNumber = Number(osRelease.split('.')[2])
  if (!Number.isFinite(buildNumber) || buildNumber < CONPTY_REFLOW_BUILD_GATE) return undefined
  return { backend: 'conpty', buildNumber }
}
