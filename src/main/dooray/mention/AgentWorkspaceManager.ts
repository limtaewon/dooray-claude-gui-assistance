import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const DEFAULT_ROOT = join(homedir(), 'Clauday-Workspaces')
const AGENT_DIRNAME = 'agent'
const TASKS_DIRNAME = 'tasks'
const CLAUDE_MD = 'CLAUDE.md'
const CLAUDE_LOCAL_SETTINGS_DIR = '.claude'
const CLAUDE_LOCAL_SETTINGS_FILE = 'settings.local.json'
/** claude code의 사용자 설정 — 폴더별 trust 상태가 여기 저장됨 */
const CLAUDE_USER_CONFIG = join(homedir(), '.claude.json')

export interface ChannelWorkspace {
  channelDir: string
  tasksDir: string
  claudeMdPath: string
}

/**
 * 두레이 멘션 에이전트의 워크스페이스 매니저.
 *
 *  ~/Clauday-Workspaces/
 *    └ agent/
 *        └ {channelId}/         ← claude code의 cwd
 *            ├ CLAUDE.md        ← 채널 메모리 (claude code 자동 로드)
 *            └ tasks/
 *                └ {logId}.md   ← 멘션마다 빌드된 prompt 파일
 *
 * 정책:
 *  - 사용자 가시 영역(home 직속)에 두어 앱 삭제·업데이트와 무관하게 작업물 보존
 *  - 채널별 폴더로 작업 격리 (claude session이 다른 채널 컨텍스트와 안 섞임)
 *  - CLAUDE.md는 처음 한 번 헤더만 깔아두고, 이후 갱신은 claude/사용자가 자유롭게
 *  - tasks/{logId}.md는 매 멘션마다 새로 만듦 (히스토리)
 */
export class AgentWorkspaceManager {
  private root: string
  /** claude code hook을 우리 main 프로세스로 라우팅하기 위한 loopback 서버 정보 */
  private hookConfig: { port: number; secret: string } | null = null

  constructor(root: string = DEFAULT_ROOT) {
    this.root = root
  }

  setRoot(root: string): void {
    this.root = root || DEFAULT_ROOT
  }

  setHookConfig(cfg: { port: number; secret: string } | null): void {
    this.hookConfig = cfg
  }

  getRoot(): string {
    return this.root
  }

  getAgentRoot(): string {
    return join(this.root, AGENT_DIRNAME)
  }

  /** 채널 폴더 보장 + CLAUDE.md 초기화 + tasks/ 디렉토리 보장. 이미 있으면 no-op. */
  ensureChannel(channelId: string, channelName?: string): ChannelWorkspace {
    const channelDir = join(this.getAgentRoot(), sanitizeId(channelId))
    const tasksDir = join(channelDir, TASKS_DIRNAME)
    const claudeMdPath = join(channelDir, CLAUDE_MD)

    mkdirSync(tasksDir, { recursive: true })

    if (!existsSync(claudeMdPath)) {
      writeFileSync(claudeMdPath, initialClaudeMd(channelId, channelName), 'utf8')
    }

    // claude code의 trust 다이얼로그 회피 — 폴더를 미리 trust 등록해서
    // 새 세션 시작 시 사용자 입력 차단 없이 바로 작업할 수 있게 한다.
    this.preApproveTrust(channelDir)

    // claude code의 hook 설정 (.claude/settings.local.json) 자동 작성.
    // 매 호출 시 현재 hookConfig 기준으로 갱신 (port/secret이 부팅마다 바뀜).
    this.writeHookSettings(channelDir)

    return { channelDir, tasksDir, claudeMdPath }
  }

  /**
   * 채널 폴더의 .claude/settings.local.json 작성.
   * PostToolUse / Stop hook을 우리 loopback HTTP 서버로 라우팅.
   */
  private writeHookSettings(channelDir: string): void {
    if (!this.hookConfig) return
    const dir = join(channelDir, CLAUDE_LOCAL_SETTINGS_DIR)
    mkdirSync(dir, { recursive: true })
    const settingsPath = join(dir, CLAUDE_LOCAL_SETTINGS_FILE)
    const baseUrl = `http://127.0.0.1:${this.hookConfig.port}/clauday-hook`
    const headers = { 'X-Clauday-Secret': this.hookConfig.secret }
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
    }
  }

  /**
   * ~/.claude.json 의 projects.{absPath}.hasTrustDialogAccepted = true 로 미리 표시.
   * - claude 미설치/설정 없으면 no-op (이번 호출은 무시; 사용자가 답하면 다음부터 적용됨)
   * - 이미 true면 no-op
   * - atomic write (tmp → rename) 로 동시 쓰기 race 최소화
   */
  private preApproveTrust(channelDir: string): void {
    if (!existsSync(CLAUDE_USER_CONFIG)) return
    try {
      const raw = readFileSync(CLAUDE_USER_CONFIG, 'utf8')
      const config = JSON.parse(raw) as { projects?: Record<string, Record<string, unknown>> }
      const projects = config.projects || {}
      const cur = projects[channelDir] || {}
      if (cur.hasTrustDialogAccepted === true) return
      cur.hasTrustDialogAccepted = true
      projects[channelDir] = cur
      config.projects = projects
      const tmp = CLAUDE_USER_CONFIG + '.clauday-tmp'
      writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8')
      renameSync(tmp, CLAUDE_USER_CONFIG)
    } catch (err) {
      console.warn('[AgentWorkspace] trust 사전 등록 실패 (무시):', err)
    }
  }

  /** prompt 파일 저장. 반환값은 채널 폴더 기준 상대경로 (예: tasks/{logId}.md) */
  writeTaskPrompt(channelId: string, logId: string, prompt: string): string {
    const ws = this.ensureChannel(channelId)
    const safeLogId = sanitizeId(logId)
    const filename = `${safeLogId}.md`
    const fullPath = join(ws.tasksDir, filename)
    writeFileSync(fullPath, prompt, 'utf8')
    return join(TASKS_DIRNAME, filename)
  }
}

function sanitizeId(id: string): string {
  // 두레이 ID는 숫자 문자열이라 안전하지만 방어적으로 OS 금지문자 제거
  return id.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function initialClaudeMd(channelId: string, channelName?: string): string {
  const lines: string[] = []
  lines.push(`# Channel Memory: ${channelName || channelId}`)
  lines.push('')
  lines.push(`Dooray channel id: ${channelId}`)
  lines.push('')
  lines.push('## 메모')
  lines.push('')
  lines.push('이 파일은 채널별 작업 메모리입니다. 사용자가 "기억해줘" 등으로 요청한 사실을 여기에 누적해주세요.')
  lines.push('claude code 세션 시작 시 자동으로 system prompt에 포함됩니다.')
  lines.push('')
  return lines.join('\n')
}
