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

export interface HookSettingsOptions {
  /** 멘션 채널: UserPromptSubmit(턴 출처)·PreToolUse(진행 단계 + 위험 동작 두레이 승인) hook */
  trackPrompts?: boolean
}

/** PreToolUse 대기 한도(초) — 위험 동작 승인을 기다린다. 브로커가 570초에 먼저 거절해 "무응답 = 거절" 을 보장한다 */
const PRE_TOOL_USE_TIMEOUT_SEC = 600

/**
 * 대상 폴더의 .claude/settings.local.json 작성.
 * hook 을 우리 loopback HTTP 서버로 라우팅한다. hooks 는 매번 새로 쓰고, 그 밖의 키(permissions 등
 * 사용자·Claude Code 가 쌓은 것)는 보존한다. 예전 버전이 넣은 permissions.ask 는 걷어 낸다.
 */
export function writeHookSettings(
  dir: string,
  hookConfig: { port: number; secret: string } | null,
  opts: HookSettingsOptions = {}
): boolean {
  if (!hookConfig) return false
  const hookSettingsDir = join(dir, CLAUDE_LOCAL_SETTINGS_DIR)
  mkdirSync(hookSettingsDir, { recursive: true })
  const settingsPath = join(hookSettingsDir, CLAUDE_LOCAL_SETTINGS_FILE)
  const baseUrl = `http://127.0.0.1:${hookConfig.port}/clauday-hook`
  const headers = { 'X-Clauday-Secret': hookConfig.secret }
  const hooks: Record<string, unknown[]> = {
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
  // 멘션 채널: 턴이 멘션에서 시작됐는지(TUI 직접 입력이 아닌지) 가려 두레이 오회신을 막고, 진행 단계를 보인다.
  if (opts.trackPrompts) {
    hooks.UserPromptSubmit = [{ hooks: [{ type: 'http', url: `${baseUrl}?event=user_prompt_submit`, headers }] }]
    hooks.PreToolUse = [{ hooks: [{ type: 'http', url: `${baseUrl}?event=pre_tool_use`, headers, timeout: PRE_TOOL_USE_TIMEOUT_SEC }] }]
  }

  let prevRaw = ''
  let prevJson: Record<string, unknown> = {}
  if (existsSync(settingsPath)) {
    try {
      prevRaw = readFileSync(settingsPath, 'utf8')
      prevJson = JSON.parse(prevRaw) as Record<string, unknown>
    } catch (err) {
      console.warn(`[claudeDirSetup] 기존 settings.local.json 을 읽지 못해 새로 씀 path=${settingsPath}:`, err)
      prevJson = {}
    }
  }
  const settings: Record<string, unknown> = { ...prevJson, hooks }
  const permissions = cleanPermissions(prevJson.permissions)
  if (permissions) settings.permissions = permissions
  else delete settings.permissions

  const next = JSON.stringify(settings, null, 2)
  if (prevRaw.trim() !== next.trim()) {
    writeFileSync(settingsPath, next, 'utf8')
    return true
  }
  return false
}

/** 기존 permissions 는 그대로 두되, v2.1 초기 빌드가 넣은 ask 정책만 걷어 낸다. */
function cleanPermissions(prev: unknown): Record<string, unknown> | null {
  if (!prev || typeof prev !== 'object') return null
  const out: Record<string, unknown> = { ...(prev as Record<string, unknown>) }
  delete out.ask
  return Object.keys(out).length ? out : null
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
