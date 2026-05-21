import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from 'fs'

/**
 * Claude CLI 호출 진단 로그.
 *
 * 비개발자 사용자가 오류 제보할 때 같이 보낼 정보. ring-buffer 로 마지막 N 건만 유지.
 * 프라이버시 가드:
 * - prompt 는 처음 500자만 (긴 JSON 덤프 가독성 떨어지고 민감정보 위험 ↓)
 * - stdout/stderr 도 처음 2KB 만
 * - argv 는 plain dump (Claude CLI 옵션은 비밀 아님)
 *
 * 파일: <userData>/logs/claude-cli.log (JSONL)
 */
export interface CliLogEntry {
  at: string                    // ISO timestamp
  feature?: string              // 'briefing' | 'summarizeTask' | etc.
  bin: string                   // CLAUDE_CLI 경로
  claudeVersion?: string        // `claude --version` 결과 — 앱 부팅 시 한 번 캐싱
  argvSummary: string           // 주요 옵션 dump (prompt 본문 제외)
  promptHead: string            // prompt 처음 500자
  promptLength: number          // 원본 prompt 길이
  exitCode: number | null
  stdoutHead: string            // stdout 처음 2KB
  stdoutLength: number
  stderrHead: string            // stderr 처음 2KB
  stderrLength: number
  errorMessage?: string         // 우리쪽에서 reject 한 사유
  durationMs: number
}

/** 앱 부팅 시점 또는 첫 호출 시점에 한 번 캐싱되는 claude --version 결과. */
let cachedClaudeVersion: string | undefined
export function setClaudeVersion(version: string | undefined): void {
  cachedClaudeVersion = version
}
export function getClaudeVersion(): string | undefined {
  return cachedClaudeVersion
}

const MAX_ENTRIES = 50
const PROMPT_HEAD = 500
const STREAM_HEAD = 2048

function logPath(): string {
  const dir = join(app.getPath('userData'), 'logs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'claude-cli.log')
}

function summarizeArgv(argv: string[]): string {
  // -p prompt 본문은 빼고 나머지만 (prompt 는 promptHead 로 별도 기록).
  const out: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    out.push(a)
    // --append-system-prompt / --append-system-prompt-file 등 긴 값은 길이만
    if (a === '--append-system-prompt' && argv[i + 1]) {
      out.push(`<${argv[i + 1].length} chars>`)
      i++
    }
  }
  const joined = out.join(' ')
  return joined.length > 1500 ? joined.slice(0, 1497) + '...' : joined
}

/** ring buffer 마지막 N 건만 유지하면서 한 줄 append */
export function recordCliCall(entry: Omit<CliLogEntry, 'at'> & { at?: string }): void {
  try {
    const path = logPath()
    const lines: string[] = existsSync(path) ? readFileSync(path, 'utf-8').split('\n').filter(Boolean) : []
    lines.push(JSON.stringify({ ...entry, at: entry.at || new Date().toISOString() }))
    const trimmed = lines.slice(-MAX_ENTRIES)
    writeFileSync(path, trimmed.join('\n') + '\n', 'utf-8')
  } catch { /* 로그 실패는 앱 흐름 막지 않음 */ }
}

/** 호출 시 ctx 누적용 헬퍼. complete() 호출 시 한 줄 기록. */
export function startCliCall(args: {
  feature?: string
  bin: string
  argv: string[]
  prompt: string | null
}): {
  appendStdout: (s: string) => void
  appendStderr: (s: string) => void
  complete: (result: { exitCode: number | null; errorMessage?: string }) => void
} {
  const started = Date.now()
  let stdoutBuf = ''
  let stderrBuf = ''
  return {
    appendStdout: (s) => {
      if (stdoutBuf.length < STREAM_HEAD) stdoutBuf += s
    },
    appendStderr: (s) => {
      if (stderrBuf.length < STREAM_HEAD) stderrBuf += s
    },
    complete: (result) => {
      recordCliCall({
        feature: args.feature,
        bin: args.bin,
        claudeVersion: cachedClaudeVersion,
        argvSummary: summarizeArgv(args.argv),
        promptHead: args.prompt ? args.prompt.slice(0, PROMPT_HEAD) : '',
        promptLength: args.prompt ? args.prompt.length : 0,
        exitCode: result.exitCode,
        stdoutHead: stdoutBuf.slice(0, STREAM_HEAD),
        stdoutLength: stdoutBuf.length,
        stderrHead: stderrBuf.slice(0, STREAM_HEAD),
        stderrLength: stderrBuf.length,
        errorMessage: result.errorMessage,
        durationMs: Date.now() - started
      })
    }
  }
}

/** 최근 로그 N 건 읽기 (오래된 → 최신 순). */
export function readRecentCliLogs(limit = 5): CliLogEntry[] {
  try {
    const path = logPath()
    if (!existsSync(path)) return []
    const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean)
    const recent = lines.slice(-limit)
    const entries: CliLogEntry[] = []
    for (const line of recent) {
      try { entries.push(JSON.parse(line)) } catch { /* skip */ }
    }
    return entries
  } catch {
    return []
  }
}

export function getCliLogPath(): string {
  return logPath()
}
