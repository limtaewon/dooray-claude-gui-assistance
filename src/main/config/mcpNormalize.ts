import type { McpServerConfig } from '../../shared/types/mcp'
import { getMcpTransport } from '../../shared/types/mcp'

/** Windows 에서 .cmd/.bat 배치 런처인 stdio 계열 커맨드 이름 (확장자 없이, 대소문자 무시). */
const WRAP_TARGET_NAMES = new Set(['npx', 'uvx', 'npm', 'pnpm', 'yarn', 'bunx'])
const CMD_BAT_SUFFIX_RE = /\.(cmd|bat)$/i

function needsWrap(command: string): boolean {
  const lower = command.toLowerCase()
  if (CMD_BAT_SUFFIX_RE.test(lower)) return true
  return WRAP_TARGET_NAMES.has(lower)
}

/** 이미 `cmd /c` 로 감싼 설정인지 판정 — 멱등을 위해 두 번 감싸지 않는다. */
function isAlreadyWrapped(config: McpServerConfig): boolean {
  const command = (config.command ?? '').toLowerCase()
  const isCmdExe = command === 'cmd' || command === 'cmd.exe'
  const firstArg = config.args?.[0]
  return isCmdExe && (firstArg === '/c' || firstArg === '/C')
}

/**
 * win32 에서 npx/uvx 계열·.cmd/.bat stdio 커맨드를 `cmd /c` 로 감싼다.
 * 멱등(이미 감싼 입력은 그대로), darwin/원격 전송(http/sse)은 무변환 (근거: ADR-v2-windows-fix-06 §1).
 */
export function normalizeStdioCommandForWindows(
  config: McpServerConfig,
  opts?: { platform?: NodeJS.Platform }
): McpServerConfig {
  const platform = opts?.platform ?? process.platform
  if (platform !== 'win32') return config
  if (getMcpTransport(config) !== 'stdio') return config
  if (!config.command) return config
  if (isAlreadyWrapped(config)) return config
  if (!needsWrap(config.command)) return config

  return {
    ...config,
    command: 'cmd',
    args: ['/c', config.command, ...(config.args ?? [])]
  }
}
