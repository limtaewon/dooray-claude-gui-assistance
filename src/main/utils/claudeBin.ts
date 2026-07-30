// claude 바이너리 경로 해석 + Windows shell 인용 + spawn 옵션의 단일 출처 (근거: ADR-v2-utils-04).
// 이 모듈을 import 하면 즉시 resolveClaudeBin() 이 1회 평가되어 execFileSync(where/command -v, 5초 타임아웃)
// 가 트리거된다 — AIService 가 기존에 모듈 로드 시점에 지던 부팅 비용을 그대로 옮겨온 것(총량 불변).
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { win32, posix } from 'path'
import { homedir } from 'os'

export type ResolveClaudeBinOptions = {
  platform?: NodeJS.Platform
  home?: string
  env?: NodeJS.ProcessEnv
  /** 테스트 주입용 execFileSync 대체 구현 */
  execFileSyncImpl?: typeof execFileSync
}

const WIN_EXT_PRIORITY = ['.cmd', '.exe', '.bat'] as const

/** `where claude` 다중 결과에서 .cmd → .exe → .bat → 확장자 없음 순으로 실존하는 첫 후보를 고른다. */
function pickWindowsCandidate(whereOutput: string): string | undefined {
  const lines = whereOutput.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  for (const ext of WIN_EXT_PRIORITY) {
    const hit = lines.find((l) => l.toLowerCase().endsWith(ext) && existsSync(l))
    if (hit) return hit
  }
  return lines.find((l) => existsSync(l))
}

/**
 * claude 바이너리의 절대경로를 해석한다.
 * mac/linux 는 기존 `resolveClaudePath()` 와 바이트 단위로 동일해야 한다 (ADR-v2-utils-04 불변식).
 */
export function resolveClaudeBin(opts?: ResolveClaudeBinOptions): string {
  const env = opts?.env ?? process.env
  if (env.CLAUDE_CLI_PATH) return env.CLAUDE_CLI_PATH

  const platform = opts?.platform ?? process.platform
  const home = opts?.home ?? homedir()
  const isWindows = platform === 'win32'
  const join = isWindows ? win32.join : posix.join
  const run = opts?.execFileSyncImpl ?? execFileSync

  // 1) 사용자 셸의 which/where — 사용자가 터미널에서 `claude` 입력 시 실행되는 그 바이너리.
  if (isWindows) {
    try {
      const out = run('where', ['claude'], { timeout: 5000 }).toString()
      const picked = pickWindowsCandidate(out)
      if (picked) return picked
    } catch { /* fall-through */ }
  } else {
    try {
      const shell = env.SHELL || '/bin/zsh'
      const out = run(shell, ['-l', '-c', 'command -v claude'], { timeout: 5000 }).toString().trim()
      if (out && existsSync(out)) return out
    } catch { /* fall-through */ }
  }

  // 2) 알려진 설치 경로 — 절대경로만 반환.
  const candidates = isWindows ? [
    join(home, '.claude', 'local', 'claude.cmd'),
    join(home, '.claude', 'bin', 'claude.cmd'),
    join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
    join(home, 'AppData', 'Local', 'npm', 'claude.cmd'),
    join(home, 'AppData', 'Roaming', 'npm', 'claude')
  ] : [
    join(home, '.claude', 'local', 'claude'),
    join(home, '.claude', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    join(home, '.local', 'bin', 'claude'),
    join(home, '.npm-global', 'bin', 'claude')
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }

  // 3) 최후 폴백 — PATH 에서 검색되도록 단순 명령어.
  return isWindows ? 'claude.cmd' : 'claude'
}

let cachedBin = resolveClaudeBin()

/** 모듈 로드 시 1회 평가된 claude 바이너리 경로. AIService 로드 시점에 이미 확정된다(평가 시점 불변, ADR-v2-utils-04 §5). */
export function getClaudeBin(): string {
  return cachedBin
}

/** 테스트 전용 — platform/env mock 변경 후 캐시를 강제로 재평가한다. */
export function resetClaudeBinCache(opts?: ResolveClaudeBinOptions): void {
  cachedBin = resolveClaudeBin(opts)
}

const WIN_SHELL_SPECIAL_RE = /[\s&|<>^()]/

/** cmd.exe 에 verbatim 인자로 넘길 값을 필요한 경우에만 큰따옴표로 감싼다. win32 전용. */
export function quoteWinShellArg(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value
  if (!WIN_SHELL_SPECIAL_RE.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

export type ClaudeSpawnCommand = {
  command: string
  shell: boolean
  windowsVerbatimArguments: boolean
}

/**
 * 플랫폼별 claude spawn 커맨드와 옵션을 돌려준다. argv 조립은 다루지 않는다 —
 * AIService.runClaudeStream 의 Windows/Mac 분기(CLAUDE.md 가이드)는 이 함수의 책임 밖.
 */
export function claudeSpawnCommand(opts?: { platform?: NodeJS.Platform; bin?: string }): ClaudeSpawnCommand {
  const platform = opts?.platform ?? process.platform
  const bin = opts?.bin ?? getClaudeBin()
  if (platform === 'win32') {
    return { command: quoteWinShellArg(bin), shell: true, windowsVerbatimArguments: true }
  }
  return { command: bin, shell: false, windowsVerbatimArguments: false }
}
