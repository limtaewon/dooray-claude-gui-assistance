import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const CLAUDE_LOCAL_SETTINGS_DIR = '.claude'
const CLAUDE_LOCAL_SETTINGS_FILE = 'settings.local.json'
/** claude code의 사용자 설정 — 폴더별 trust 상태가 여기 저장됨 */
export const CLAUDE_USER_CONFIG = join(homedir(), '.claude.json')

export type TrustResult = 'written' | 'already-trusted' | 'no-config' | 'failed'

/**
 * claude code 를 "질문 없이" 띄우기 위한 폴더 준비 로직.
 * 소비자: 멘션 채널 폴더(AgentWorkspaceManager), C-2 워크스페이스 워크트리.
 */

/**
 * 대상 폴더의 .claude/settings.local.json 작성.
 * PostToolUse / Stop hook을 우리 loopback HTTP 서버로 라우팅.
 */
export function writeHookSettings(
  dir: string,
  hookConfig: { port: number; secret: string } | null
): boolean {
  if (!hookConfig) return false
  const hookSettingsDir = join(dir, CLAUDE_LOCAL_SETTINGS_DIR)
  mkdirSync(hookSettingsDir, { recursive: true })
  const settingsPath = join(hookSettingsDir, CLAUDE_LOCAL_SETTINGS_FILE)
  const baseUrl = `http://127.0.0.1:${hookConfig.port}/clauday-hook`
  const headers = { 'X-Clauday-Secret': hookConfig.secret }
  const settings = {
    hooks: {
      PostToolUse: [
        {
          matcher: 'Edit|Write|Bash|Read|Glob|Grep|TodoWrite|WebFetch|WebSearch',
          hooks: [{ type: 'http', url: `${baseUrl}?event=post_tool_use`, headers }]
        }
      ],
      Stop: [
        {
          hooks: [{ type: 'http', url: `${baseUrl}?event=stop`, headers }]
        }
      ]
    }
  }
  const next = JSON.stringify(settings, null, 2)
  let prev = ''
  if (existsSync(settingsPath)) {
    try { prev = readFileSync(settingsPath, 'utf8') } catch { /* ignore */ }
  }
  if (prev.trim() !== next.trim()) {
    writeFileSync(settingsPath, next, 'utf8')
    return true
  }
  return false
}

/**
 * ~/.claude.json 의 projects.{absPath}.hasTrustDialogAccepted = true 로 미리 표시.
 * - claude 미설치/설정 없으면 no-op (이번 호출은 무시; 사용자가 답하면 다음부터 적용됨)
 * - 이미 true면 no-op
 * - atomic write (tmp → rename) 로 동시 쓰기 race 최소화
 */
export function preApproveTrust(dir: string, opts?: { configPath?: string }): TrustResult {
  const configPath = opts?.configPath ?? CLAUDE_USER_CONFIG
  if (!existsSync(configPath)) return 'no-config'
  try {
    const raw = readFileSync(configPath, 'utf8')
    const config = JSON.parse(raw) as { projects?: Record<string, Record<string, unknown>> }
    const projects = config.projects || {}
    const cur = projects[dir] || {}
    if (cur.hasTrustDialogAccepted === true) return 'already-trusted'
    cur.hasTrustDialogAccepted = true
    projects[dir] = cur
    config.projects = projects
    const tmp = configPath + '.clauday-tmp'
    writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8')
    renameSync(tmp, configPath)
    return 'written'
  } catch (err) {
    console.warn('[AgentWorkspace] trust 사전 등록 실패 (무시):', err)
    return 'failed'
  }
}
