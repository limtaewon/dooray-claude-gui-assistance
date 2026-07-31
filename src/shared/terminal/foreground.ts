/** 로그인 셸로 알려진 실행 파일 이름 — 이것만 "빈 프롬프트" 로 본다. */
const SHELL_NAMES = new Set([
  'zsh',
  '-zsh',
  'bash',
  '-bash',
  'sh',
  '-sh',
  'fish',
  '-fish',
  'ksh',
  'dash',
  'pwsh',
  'powershell',
  'cmd',
  'cmd.exe',
  'pwsh.exe',
  'powershell.exe',
  'conhost.exe'
])

/**
 * pane 에 지금 프로그램이 돌고 있는지 — 돌고 있으면 명령을 타이핑해선 안 된다.
 *
 * 셸 프롬프트가 아니라 claude/vim 같은 TUI 에 글자를 보내면 그 프로그램의 입력으로 먹혀
 * 엉뚱한 곳에서 세션이 시작되거나 진행 중인 대화가 오염된다. 판정은 **셸 이름 화이트리스트**로
 * 한다 — 실행 중인 프로그램의 이름은 무한하지만 셸은 몇 개 안 된다.
 * 이름을 못 얻으면(`null`) 비어 있다고 본다 — 확인 못 했다는 이유로 드롭을 막지는 않는다.
 */
export function isPaneBusy(foregroundProcess: string | null | undefined): boolean {
  if (!foregroundProcess) return false
  const name = foregroundProcess.trim().toLowerCase().split(/[\\/]/).pop() ?? ''
  if (!name) return false
  return !SHELL_NAMES.has(name)
}
