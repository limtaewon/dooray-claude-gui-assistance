import { quoteWinShellArg } from '../utils/claudeBin'

export interface StartTaskSpawn {
  command: string
  /** win32 는 verbatim 커맨드라인 문자열, 그 외는 argv 배열 (ADR-v2-windows-fix-04 §2). */
  args: string[] | string
  /** 터미널 탭 표시 이름 — 스폰 커맨드(win32 는 cmd.exe)와 분리해서 항상 'claude' 로 보이게 한다. */
  displayName: string
  /** win32 에서만 — 호출자가 쓰기/정리 책임을 진다. */
  promptFile?: string
}

export interface BuildStartTaskSpawnParams {
  prompt: string
  platform: NodeJS.Platform
  claudeBin: string
  comspec?: string
  /** win32 필수 — 호출자가 tmpdir 기준으로 결정한 프롬프트 임시파일 경로. */
  promptFilePath?: string
  model?: string
}

const CMD_KIND_RE = /cmd(\.exe)?$/i

/**
 * 태스크 시작용 claude 스폰 명세를 만든다.
 * darwin/linux 는 현행 그대로(argv 로 프롬프트 직접 전달) — 동작하는 것을 건드리지 않는다.
 * win32 는 PATHEXT·개행·커맨드라인 길이 3중 문제를 프롬프트 임시파일 + cmd 파이프로 동시 해소한다
 * (ADR-v2-windows-fix-04).
 */
export function buildStartTaskSpawn(params: BuildStartTaskSpawnParams): StartTaskSpawn {
  const model = params.model ?? 'sonnet'

  if (params.platform !== 'win32') {
    return {
      command: 'claude',
      args: ['-p', params.prompt, '--model', model],
      displayName: 'claude'
    }
  }

  if (!params.promptFilePath) {
    throw new Error('[startTaskSpawn] win32 는 promptFilePath 가 필수입니다')
  }

  const command = params.comspec && CMD_KIND_RE.test(params.comspec) ? params.comspec : 'cmd.exe'
  const quotedBin = quoteWinShellArg(params.claudeBin)
  const quotedPromptFile = quoteWinShellArg(params.promptFilePath)
  const commandLine = `/d /s /c "chcp 65001>nul && type ${quotedPromptFile} | ${quotedBin} -p --model ${model}"`

  return {
    command,
    args: commandLine,
    displayName: 'claude',
    promptFile: params.promptFilePath
  }
}
