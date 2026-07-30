import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { preApproveTrust, writeHookSettings } from '../../claude/claudeDirSetup'

const DEFAULT_ROOT = join(homedir(), 'Clauday-Workspaces')
const AGENT_DIRNAME = 'agent'
const TASKS_DIRNAME = 'tasks'
const CLAUDE_MD = 'CLAUDE.md'

export interface ChannelWorkspace {
  channelDir: string
  tasksDir: string
  claudeMdPath: string
}

/** `.claude` 준비(trust/hook settings) 의존성 — 테스트에서 홈 오염 없이 대체 주입 가능 */
export interface ClaudeDirSetupDeps {
  preApproveTrust: typeof preApproveTrust
  writeHookSettings: typeof writeHookSettings
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

  constructor(
    root: string = DEFAULT_ROOT,
    private deps: ClaudeDirSetupDeps = { preApproveTrust, writeHookSettings }
  ) {
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
    this.deps.preApproveTrust(channelDir)

    // claude code의 hook 설정 (.claude/settings.local.json) 자동 작성.
    // 매 호출 시 현재 hookConfig 기준으로 갱신 (port/secret이 부팅마다 바뀜).
    this.deps.writeHookSettings(channelDir, this.hookConfig)

    return { channelDir, tasksDir, claudeMdPath }
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
