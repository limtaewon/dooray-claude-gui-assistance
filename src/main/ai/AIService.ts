import { execFile, execFileSync, spawn } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, delimiter as pathDelimiter } from 'path'
import { homedir } from 'os'
import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/types/ipc'
import type { DoorayTask, DoorayCalendarEvent } from '../../shared/types/dooray'
import type { AIBriefing, AIReport, AIProgressEvent, AIModelName, AIModelConfig } from '../../shared/types/ai'

interface ClaudeCliResult {
  type: string
  result: string
  duration_ms: number
  session_id: string
  is_error: boolean
  total_cost_usd: number
}

const BRIEFING_SYSTEM_PROMPT = `두레이 업무 브리핑을 생성하세요. 3가지 데이터가 제공됩니다:
1. 내 담당 태스크 (toMemberIds)
2. 내가 참조/멘션된 태스크 (ccMemberIds) — 내가 알아야 할 상황
3. 이번 주 캘린더 일정 — 각 항목의 \`source\` 필드로 종류 구분
   - \`caldav\`: 두레이 회사 캘린더의 회의/일정 (외부 의무)
   - \`local\`: 사용자가 Clauday 의 "빠른 할 일" 로 직접 등록한 todo (자기 의지)
   - \`holiday\`: 한국 공휴일 (참고용)

분석 관점 (각 카테고리는 서로 배타적 — 한 태스크는 한 곳에만):
- **urgent (긴급)**: 다음 중 하나만 해당. 추측 금지.
  · dueDate 가 오늘 또는 향후 3일 이내 (= 마감 임박 — 가장 우선)
  · dueDate 가 이미 지나간 working/registered (= 지연)
  · subject/workflowName 에 "오류", "실패", "장애", "버그" 키워드 명시
  ⚠️ "오래된 working" 은 urgent 에 넣지 말고 stale 에. 매일 같은 항목이 urgent 로 떠서 무뎌짐.
- **focus (오늘 집중)**: workflowClass=working 인 담당 태스크 중 오늘 진척시킬 가치가 있는 것. registered 는 원칙적으로 focus 에 넣지 말 것. local 일정과 연계되는 항목 우선.
- **stale (방치/장기)**: 다음 중 하나만.
  · registered 가 3일 이상 (착수 필요)
  · workflowName 이 "잠정 보류" / "개발 대기" 인 working (실질 멈춤)
  · working 인데 createdAt 14일 이상 경과 (장기화)
  daysSinceCreated 값 필수.
- **mentioned (멘션됨)**: CC 태스크 전용. 본인이 실제로 액션해야 할 명확한 이유가 있는 것만 (보통 0~5개). 단순 CC 만으로는 부족 — 사용자 정의 스킬의 매칭 패턴이 있으면 적용.
- **todayEvents (오늘 일정)**: 오늘 진행되는 이벤트만 (시작이 오늘 끝나기 전 AND 끝이 오늘 시작 이후). holiday source 는 종일 단순 표기.
- **recommendations (AI 추천)**: 3~6개. 회의 사이 빈 시간 + 로컬 todo 연계, 우선순위 충돌, 휴가/마감 충돌, 놓치기 쉬운 것.

**분류 강제 규칙 (반드시)**:
1. urgent / focus / stale 의 taskId 는 [내 담당 태스크] 또는 [오늘 마감 태스크] 에만 있어야 함. CC id 금지.
2. mentioned 의 taskId 는 [내가 참조/멘션된 태스크] 에만. 담당 id 금지.
3. **한 taskId 는 하나의 카테고리에만 등장**. 같은 id 가 urgent+stale 또는 focus+stale 에 동시 등장 금지. 우선순위: urgent > focus > stale > mentioned.
4. **subject 필드 = 원본 그대로**. 두레이 데이터의 subject 를 그대로 사용. emoji, "[프로젝트]", "🚀" 같은 prefix 를 subject 에 붙이지 말 것.
5. **reason 에는 사용자 스킬의 출력 형식을 적극 활용**. 사용자 스킬에 "🔄 [NEON] ... 잠정 보류 N일째", "🚀 [재무서비스-배포] ...", "📋 [NEON-기획] ..." 같은 출력 형식이 정의되어 있으면 그 emoji + prefix + 톤을 **reason 의 앞부분에 넣을 것**. 그래야 사용자가 어떤 패턴/스킬이 적용됐는지 한 눈에 보임. 사용자 스킬에 출력 형식이 없는 경우는 평이한 텍스트로.
6. 완료(closed) 태스크는 어떤 카테고리에도 등장 금지.

**구체성 가드** — 모든 reason / recommendation 에 적용:
- "확인", "검토", "점검", "재확인", "파악", "자문 가능성", "영향도 확인" 같은 막연한 표현 단독 사용 금지. 무엇을 어떻게 할지 명시.
- 모든 추천은 [구체 동사 + 대상 + 기한/시각] 형태. 시각 anchor 가 없으면 "오전/오후/미팅 전/EOD" 같은 시간대 anchor 필수.
- reason 도 데이터의 실제 값 인용: 마감일·workflowName·daysSinceCreated·subject 키워드 등.
- "~필요할 가능성", "~수 있음" 같은 추측 표현은 데이터에서 직접 도출되는 경우만 사용. 근거가 없으면 mentioned 에 넣지 말 것.

**에이전틱 행동** — 두레이 데이터만 정리하지 말고 외부 시스템 상태를 적극 fetch 하라:

오늘 캘린더 일정/todo(특히 \`source=local\`) 가 외부 시스템 상태를 암시하면, 사용 가능한 도구로 **직접 grounding data 를 fetch** 한 뒤 recommendations 에 실제 항목·번호·URL 을 인용하라. 막연한 "확인하세요" 대신 구체적인 데이터로 답한다.

사용 가능한 도구 (사용자 환경에 따라 일부는 동작 안 할 수 있음 — 실패하면 조용히 skip):
- \`Bash\` — 사용자 셸 명령. 사용자가 "사용자 정의 규칙(스킬)" 섹션에서 권장한 명령을 우선 활용.
- \`WebSearch\` / \`WebFetch\` — 외부 정보·뉴스·릴리스 노트 조회.
- \`mcp__dooray-mcp__*\` — 두레이 태스크/위키/캘린더/멤버 추가 조회.

**사용자 스킬을 항상 먼저 확인하라.** 아래 "사용자 정의 규칙" 섹션에 사용자가 정의한 도메인별 명령/패턴(예: PR 조회, 배포 상태, 사내 시스템 등)이 있으면 그것이 가장 신뢰할 수 있는 가이드다. 캘린더/todo 키워드와 사용자 스킬의 트리거를 매칭해서 도구 호출.

**호출을 망설이지 말 것**:
- "두레이 데이터에 이미 있으니 됐다" 는 잘못된 판단. 두레이와 외부 시스템(VCS, CI, 모니터링, 메신저 등)은 별개 — 둘 다 봐야 완전한 그림.
- 도구 결과가 비거나 에러 → 조용히 skip, 다른 도구 시도. 실패 명령을 사용자에게 노출하지 않는다.
- 같은 도구를 같은 인자로 두 번 호출 금지.
- 결과가 있으면 recommendations 에 **URL 그대로 포함** (UI 가 자동으로 링크화함). 예: "리뷰 대기 PR 3건: https://... , https://... , https://..."
- 호출 횟수 권장: 외부 트리거 있으면 **3~8회**, 트리거 없으면 0회.
- **최종 응답은 반드시 아래 JSON 만**. 도구 호출 사이에 텍스트 설명 추가 금지.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "greeting": "상황을 요약한 한줄 (예: 목요일 아침, 배치 알림이 쏟아지고 있습니다)",
  "urgent": [{"taskId": "...", "subject": "...", "reason": "구체적 이유"}],
  "focus": [{"taskId": "...", "subject": "...", "reason": "구체적 이유"}],
  "mentioned": [{"taskId": "...", "subject": "...", "reason": "왜 내가 알아야 하는지"}],
  "stale": [{"taskId": "...", "subject": "...", "daysSinceCreated": 3}],
  "todayEvents": [{"subject": "...", "time": "14:00-15:00"}],
  "recommendations": ["구체적 행동 제안 1 (도구로 확인한 실제 데이터 인용)", "구체적 행동 제안 2", "..."]
}`

/**
 * 패키징된 앱에서도 claude CLI 를 찾을 수 있도록 PATH 보강.
 *
 * Why **절대경로** 우선?
 *   사용자 머신에 claude 바이너리가 여러 개 깔려있는 경우 (예: brew + npm-global + .local/bin),
 *   spawn 시 PATH 에서 동적 검색되면 우리가 prepend 한 PATH 의 영향으로 사용자가 의도한 것과
 *   다른(보통 더 오래된) 바이너리가 잡힌다. 그러면 신규 옵션(--include-hook-events 등)이
 *   "unknown option" 으로 실패. 사용자 셸 PATH 에서 정확히 어떤 claude 가 잡히는지를
 *   `which`/`where` 로 확정해 절대경로로 spawn 한다.
 */
function resolveClaudePath(): string {
  if (process.env.CLAUDE_CLI_PATH) return process.env.CLAUDE_CLI_PATH

  const isWindows = process.platform === 'win32'
  const home = homedir()

  // 1) 사용자 셸의 which/where — 사용자가 터미널에서 `claude` 입력 시 실행되는 그 바이너리.
  //    spawn 시점에서 우리 PATH 보강과 무관하게 항상 같은 바이너리를 쓰게 됨.
  if (isWindows) {
    try {
      const out = execFileSync('where', ['claude'], { timeout: 5000 }).toString().trim().split('\n')[0].trim()
      if (out && existsSync(out)) return out
    } catch { /* fall-through */ }
  } else {
    try {
      const shell = process.env.SHELL || '/bin/zsh'
      const out = execFileSync(shell, ['-l', '-c', 'command -v claude'], { timeout: 5000 }).toString().trim()
      if (out && existsSync(out)) return out
    } catch { /* fall-through */ }
  }

  // 2) 알려진 설치 경로 — 절대경로만 반환 (단순 'claude' 는 안 씀).
  const candidates = isWindows ? [
    join(home, '.claude', 'local', 'claude.cmd'),
    join(home, '.claude', 'bin', 'claude.cmd'),
    join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
    join(home, 'AppData', 'Local', 'npm', 'claude.cmd'),
    join(home, 'AppData', 'Roaming', 'npm', 'claude'),
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

  // 3) 최후 폴백 — PATH 에서 검색되도록 단순 명령어. 이 단계 도달 시 아래 spawn PATH 보강이 의미 가짐.
  return isWindows ? 'claude.cmd' : 'claude'
}

const CLAUDE_CLI = resolveClaudePath()

export function getClaudeBin(): string { return CLAUDE_CLI }

import { decodeProcessText, isBenignStderr } from '../utils/procText'
import { startCliCall, setClaudeVersion } from '../utils/cliLogger'

/**
 * 앱 부팅 시 claude --version 한 번 캐싱.
 * 같은 claude 바이너리를 매번 호출할 필요 없고, 진단 로그에 자동 첨부되어
 * 사용자별 버전 차이를 즉시 비교 가능.
 */
function captureClaudeVersion(): void {
  try {
    const out = execFileSync(CLAUDE_CLI, ['--version'], {
      timeout: 5000,
      env: { ...process.env, DISABLE_OMC: '1' },
      shell: process.platform === 'win32',
      encoding: 'utf-8'
    })
    setClaudeVersion(out.toString().trim() || undefined)
  } catch { /* 미설치 또는 PATH 문제 — isAvailable() 에서 처리 */ }
}
captureClaudeVersion()

/**
 * Claude CLI 오류를 사용자 친화적 메시지로 변환.
 * "Not logged in" 같은 원인 불분명 에러에 복구 가이드 첨부.
 */
function wrapClaudeError(message: string, stderr?: string): Error {
  const full = `${message}\n${stderr || ''}`.toLowerCase()
  const isAuth = full.includes('not logged in')
    || full.includes('unauthorized')
    || full.includes('401')
    || full.includes('credentials not found')
    || full.includes('please run /login')
    || full.includes('please login')
  if (isAuth) {
    return new Error(
      'Claude 로그인이 필요합니다.\n\n' +
      '해결 방법:\n' +
      '1) 터미널에서 `claude` 를 실행하여 /login 으로 로그인\n' +
      '2) 또는 환경변수 ANTHROPIC_API_KEY 설정 후 앱 재시작\n\n' +
      `원본 오류: ${message.substring(0, 200)}`
    )
  }
  return new Error(`Claude CLI 오류: ${message}`)
}

function buildArgs(prompt: string, opts: {
  model?: string
  systemPrompt?: string
  maxBudget?: string
  effort?: string
  allowMcp?: boolean
  /** 특정 MCP 서버만 선택적으로 허용. 지정되면 allowMcp 설정과 무관하게 이 목록만 허용 */
  mcpServers?: string[]
  /** 모든 도구 차단 (프롬프트만으로 응답) */
  noTools?: boolean
  /** 웹 조사만 허용 (WebSearch + WebFetch). MCP/파일/Bash 등은 차단. 에이전틱 정리 용도 */
  webOnly?: boolean
  /** Read tool 추가 허용 — 이미지/파일 분석용 */
  allowRead?: boolean
  /**
   * 에이전틱 모드 — 캘린더 일정/태스크 컨텍스트를 보고 LLM 이 외부 grounding data 를
   * 직접 fetch 해서 진짜 비서 같은 브리핑을 만들도록 광범위 도구 허용.
   * 허용: Bash, WebSearch, WebFetch, Read + mcpServers (지정 시) 또는 기본 MCP 셋.
   * 차단: Edit, Write, TodoWrite, Task (브리핑은 read-only 작업).
   */
  agentic?: boolean
}): string[] {
  const args = [
    '-p', prompt,
    '--output-format', 'json',
    '--model', opts.model || 'sonnet',
    '--no-session-persistence',
    '--effort', opts.effort || 'low',
    // Claude CLI 자체 skill 카탈로그(115개)를 system prompt 에서 제거.
    // 사용자 brief 스킬 4개가 노이즈에 묻히던 문제. --bare 는 keychain auth 도 끊어서 사용 X
    // (사용자가 ANTHROPIC_API_KEY env 설정 안 했으면 "Not logged in" 발생).
    '--disable-slash-commands',
    // 머신별 동적 섹션 (cwd, env info, memory paths, git status) 을 system prompt 에서 분리.
    // 캐시 hit 률 ↑, system prompt 깨끗.
    '--exclude-dynamic-system-prompt-sections'
  ]
  if (opts.systemPrompt) args.push('--append-system-prompt', opts.systemPrompt)
  if (opts.maxBudget) args.push('--max-budget-usd', opts.maxBudget)
  // allowedTools 는 단일 push — 여러 분기에서 합쳐서 push
  const allowed: string[] = []
  if (opts.noTools) {
    args.push('--disallowedTools', 'mcp__*,Bash,Edit,Write,Read,TodoWrite,WebFetch,WebSearch,Task')
  } else if (opts.agentic) {
    // 에이전틱 — 광범위 read-only 권한. 쓰기 도구는 명시적으로 차단.
    allowed.push('Bash', 'WebSearch', 'WebFetch', 'Read')
    if (opts.mcpServers && opts.mcpServers.length > 0) {
      for (const name of opts.mcpServers) allowed.push(`mcp__${name}__*`)
    } else {
      allowed.push('mcp__dooray-mcp__*', 'mcp__mcp-clickhouse__*', 'mcp__mysql-nfi__*')
    }
    args.push('--disallowedTools', 'Edit,Write,TodoWrite,Task')
  } else if (opts.webOnly) {
    allowed.push('WebSearch', 'WebFetch')
  } else if (opts.mcpServers && opts.mcpServers.length > 0) {
    for (const name of opts.mcpServers) allowed.push(`mcp__${name}__*`)
  } else if (opts.allowMcp) {
    allowed.push('mcp__dooray-mcp__*', 'mcp__mcp-clickhouse__*', 'mcp__mysql-nfi__*')
  }
  if (opts.allowRead && !opts.noTools && !opts.agentic) allowed.push('Read')
  if (allowed.length > 0) args.push('--allowedTools', allowed.join(','))
  return args
}

/** 사용자 설정에서 주입 가능한 ANTHROPIC_API_KEY 보관소 */
let userAnthropicApiKey: string | null = null
export function setUserAnthropicApiKey(key: string | null): void {
  userAnthropicApiKey = key && key.trim() ? key.trim() : null
}

/** 패키징 앱에서도 동작하도록 PATH 보강 + OMC/플러그인 훅 비활성화 (속도 최적화) */
function enrichedEnv(): Record<string, string> {
  const home = homedir()
  const isWindows = process.platform === 'win32'
  const extraPaths = isWindows ? [
    join(home, '.claude', 'local'),
    join(home, '.claude', 'bin'),
    join(home, 'AppData', 'Roaming', 'npm'),
    join(home, 'AppData', 'Local', 'npm'),
  ] : [
    join(home, '.claude', 'local'),
    join(home, '.claude', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
    join(home, '.local', 'bin'),
    join(home, '.npm-global', 'bin')
  ]
  const currentPath = process.env.PATH || (isWindows ? '' : '/usr/bin:/bin')
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PATH: [...extraPaths, currentPath].join(pathDelimiter),
    // OMC ultrawork 세션 복원 훅 비활성화 (매번 75k 토큰 로드 방지)
    DISABLE_OMC: '1'
  }
  // 사용자가 설정에 API 키를 입력했으면 우선 적용 (키체인 접근 불가능한 패키징 앱 대비)
  if (userAnthropicApiKey) {
    env.ANTHROPIC_API_KEY = userAnthropicApiKey
  }
  return env
}

export class AIService {
  private mainWindow: BrowserWindow | null = null
  private modelConfig: AIModelConfig = {}
  private skillLoader: ((target: string) => Array<{ name: string; content: string }>) | null = null

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  /** 외부에서 target별 스킬 로더 주입 (SkillStore.forTarget과 연결) */
  setSkillLoader(loader: (target: string) => Array<{ name: string; content: string }>): void {
    this.skillLoader = loader
  }

  setModelConfig(config: AIModelConfig): void {
    this.modelConfig = config
  }

  getModelConfig(): AIModelConfig {
    return this.modelConfig
  }

  /** 기능별 모델 선택 (설정이 없으면 기본값 사용) */
  private pickModel(feature: keyof AIModelConfig, defaultModel: AIModelName): AIModelName {
    return this.modelConfig[feature] || defaultModel
  }

  /**
   * base system prompt에 사용자의 스킬들을 merge.
   * target의 스킬 + 'all' 스킬을 모두 포함.
   * 스킬은 "사용자 정의 규칙" 섹션으로 system prompt 뒤에 추가되어 LLM이 강하게 준수.
   */
  private buildSystemPrompt(base: string, target: string): string {
    if (!this.skillLoader) return base
    let skills: Array<{ name: string; content: string }> = []
    try {
      const targetSkills = this.skillLoader(target)
      skills = targetSkills
    } catch { /* ok */ }
    if (skills.length === 0) return base

    const skillBlock = skills.map((s) => `### ${s.name}\n${s.content}`).join('\n\n')
    return `${base}

---

[사용자 정의 규칙 — 반드시 준수]
위 기본 규칙에 더해 아래 사용자 정의 규칙을 반드시 적용하세요. 충돌 시 사용자 규칙을 우선합니다.

${skillBlock}`
  }

  /** 진행상황 이벤트 발행 */
  private emitProgress(
    requestId: string | undefined,
    stage: AIProgressEvent['stage'],
    message: string,
    startedAt: number,
    chunk?: string
  ): void {
    if (!requestId || !this.mainWindow || this.mainWindow.isDestroyed()) return
    const event: AIProgressEvent = {
      requestId,
      stage,
      message,
      elapsedMs: Date.now() - startedAt,
      ...(chunk !== undefined ? { chunk } : {})
    }
    this.mainWindow.webContents.send(IPC_CHANNELS.AI_PROGRESS, event)
  }

  /** 기본(non-streaming) claude 실행 */
  private runClaude(args: string[]): Promise<ClaudeCliResult> {
    return new Promise((resolve, reject) => {
      execFile(
        CLAUDE_CLI,
        args,
        {
          maxBuffer: 1024 * 1024 * 5,
          timeout: 120000,
          env: enrichedEnv(),
          // Windows cp949 mojibake 방지 — raw Buffer 로 받아 decodeProcessText 가
          // utf-8/euc-kr 자동 판별 후 디코드.
          encoding: 'buffer'
        },
        (error, stdoutBuf, stderrBuf) => {
          const stdout = decodeProcessText(stdoutBuf as Buffer)
          const stderr = decodeProcessText(stderrBuf as Buffer)
          if (error && !stdout) {
            reject(wrapClaudeError(error.message, stderr))
            return
          }
          try {
            const result = JSON.parse(stdout) as ClaudeCliResult
            if (result.is_error) {
              reject(wrapClaudeError(result.result, stderr))
              return
            }
            resolve(result)
          } catch {
            resolve({
              type: 'result',
              result: stdout || stderr || '응답을 받지 못했습니다.',
              duration_ms: 0,
              session_id: '',
              is_error: false,
              total_cost_usd: 0
            })
          }
        }
      )
    })
  }

  /**
   * 스트리밍 claude 실행 (stream-json)
   * 각 텍스트 청크를 onChunk로 전달하고, 최종 결과 반환
   */
  private runClaudeStream(
    args: string[],
    onChunk: (text: string) => void,
    options: { timeoutMs?: number | null; feature?: string } = {}
  ): Promise<ClaudeCliResult> {
    return new Promise((resolve, reject) => {
      // --output-format {json} 제거 후 stream-json 옵션 추가
      const cleaned: string[] = []
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--output-format') { i++; continue }
        cleaned.push(args[i])
      }
      cleaned.push(
        '--output-format', 'stream-json',
        '--include-partial-messages',
        '--verbose'
      )

      // 명령줄 길이 한계 회피: `-p <prompt>` 의 prompt 본문을 argv 에서 빼서 stdin 으로 파이프.
      // Why: 브리핑처럼 태스크 JSON 덤프가 누적되면 prompt 가 수십 KB 가 되는데,
      // Windows 의 cmd.exe 명령줄 한계(~8KB) 와 CreateProcess(~32KB) 에 둘 다 걸려
      // "명령줄이 너무 깁니다" 오류 발생. claude CLI 는 `-p` 단독이면 stdin 을 읽으므로
      // prompt 만 stdin 으로 옮겨주면 한계를 우회. 플랫폼 무관 일관 적용 (mac 도 안전).
      let stdinPrompt: string | null = null
      const pIdx = cleaned.indexOf('-p')
      if (pIdx >= 0 && pIdx + 1 < cleaned.length && !cleaned[pIdx + 1].startsWith('-')) {
        stdinPrompt = cleaned[pIdx + 1]
        cleaned.splice(pIdx + 1, 1)
      }

      const isWindows = process.platform === 'win32'

      // ⚠️ Windows 한정 분기 — Mac/Linux 는 절대 건드리지 말 것.
      // CLAUDE.md 의 "AIService.runClaudeStream Windows/Mac 분기 가이드" 참고.
      //
      // 증상: v1.5.4 진단 데이터에서 Windows 사용자가 같은 claude 버전(2.1.146)임에도
      // stdout 으로 stream-json 이 아닌 평문 마크다운을 흘림 → 우리 파서가 빈 결과로 처리.
      //
      // 원인 가설: `--append-system-prompt <3775 chars>` 의 큰 값이 windowsVerbatimArguments
      // 모드 + cmd 의 인자 파싱과 충돌해 system prompt 본문 내 공백/개행이 인자 구분자로
      // 잘못 해석되며 뒤의 `--output-format stream-json` 등이 잘려나감.
      //
      // 회피: Windows 에서만 system prompt 를 argv 에서 빼서 stdin prompt 의 prefix 로 합침.
      // Mac 은 정상 동작 중이므로 기존 argv 경로 유지 (system prompt 캐싱 효과 보존).
      if (isWindows) {
        const aspIdx = cleaned.indexOf('--append-system-prompt')
        if (aspIdx >= 0 && aspIdx + 1 < cleaned.length) {
          const systemContent = cleaned[aspIdx + 1]
          cleaned.splice(aspIdx, 2)
          stdinPrompt = `[시스템 지시 — 반드시 준수]
${systemContent}

---

[사용자 요청]
${stdinPrompt ?? ''}`
        }
      }

      // Windows 호환 (Issue #11): claude 가 .cmd 면 Node 의 spawn 이 자동 추론 못함 → shell:true.
      // windowsVerbatimArguments 로 cmd codepage 변환 차단 (한글 prompt 깨짐 방지).
      const proc = spawn(CLAUDE_CLI, cleaned, {
        env: enrichedEnv(),
        shell: isWindows,
        windowsVerbatimArguments: isWindows
      })

      if (stdinPrompt !== null && proc.stdin) {
        proc.stdin.on('error', () => { /* EPIPE 등은 close 핸들러가 처리 */ })
        proc.stdin.write(stdinPrompt, 'utf8')
        proc.stdin.end()
      }
      let buffer = ''
      let finalResult: ClaudeCliResult | null = null
      let accumulated = ''
      // Windows cp949 mojibake 방지를 위해 raw Buffer 누적 — 사용 시점에서 디코드.
      const stderrChunks: Buffer[] = []
      const readStderr = (): string => decodeProcessText(Buffer.concat(stderrChunks))

      // 진단 로그 누적 — 호출 끝나면 userData/logs/claude-cli.log 에 한 줄 추가.
      // 사용자가 오류 제보할 때 같이 보낼 데이터.
      const diag = startCliCall({
        feature: options.feature,
        bin: CLAUDE_CLI,
        argv: cleaned,
        prompt: stdinPrompt
      })

      // timeoutMs === null이면 타임아웃 없음(장시간 MCP 작업용). 미지정이면 120초.
      const timeoutMs = options.timeoutMs === undefined ? 120000 : options.timeoutMs
      const timeout = timeoutMs !== null ? setTimeout(() => {
        proc.kill()
        diag.complete({ exitCode: null, errorMessage: `타임아웃 ${Math.round(timeoutMs / 1000)}초` })
        reject(new Error(`Claude CLI 타임아웃 (${Math.round(timeoutMs / 1000)}초)`))
      }, timeoutMs) : null

      // raw stdout 누적 — stream-json 라인이 안 들어오는 환경(특정 Windows 머신에서 claude 가
      // 평문으로 응답하는 케이스 — v1.5.3 의 진단으로 확인됨) 에서 응답이 통째로 사라지는 것을
      // 방지하기 위한 fallback. close 핸들러에서 finalResult/accumulated 둘 다 비어있고
      // rawStdout 에 텍스트가 있으면 그걸 result 로 사용.
      let rawStdout = ''
      const RAW_STDOUT_CAP = 200 * 1024  // 200KB — 평문 응답이라도 보통 이 안쪽

      proc.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString('utf-8')
        diag.appendStdout(chunk)
        if (rawStdout.length < RAW_STDOUT_CAP) rawStdout += chunk
        buffer += chunk
        let idx: number
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.substring(0, idx).trim()
          buffer = buffer.substring(idx + 1)
          if (!line) continue
          try {
            const obj = JSON.parse(line)

            // 최종 결과
            if (obj.type === 'result') {
              finalResult = {
                type: 'result',
                result: obj.result || accumulated,
                duration_ms: obj.duration_ms || 0,
                session_id: obj.session_id || '',
                is_error: obj.is_error || false,
                total_cost_usd: obj.total_cost_usd || 0
              }
              continue
            }

            // stream_event: content_block_delta with text_delta (가장 중요)
            if (obj.type === 'stream_event' && obj.event?.type === 'content_block_delta') {
              const delta = obj.event.delta
              if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
                accumulated += delta.text
                onChunk(delta.text)
              }
              // thinking_delta는 무시 (사용자에게 보여주지 않음)
              continue
            }

            // assistant 메시지 (전체 블록 완료 시) — text + tool_use 노출
            if (obj.type === 'assistant' && obj.message?.content) {
              const content = obj.message.content
              if (Array.isArray(content)) {
                for (const block of content) {
                  if (block.type === 'text' && typeof block.text === 'string') {
                    // 이미 stream_event로 받은 경우 무시, 아니면 추가
                    if (!accumulated.includes(block.text) && block.text.length > 0) {
                      if (block.text.startsWith(accumulated)) {
                        const d = block.text.substring(accumulated.length)
                        if (d) { accumulated = block.text; onChunk(d) }
                      } else if (accumulated.length === 0) {
                        accumulated = block.text
                        onChunk(block.text)
                      }
                    }
                  }
                  // MCP 도구 호출 가시화: "🔧 tool(input요약)" 라인으로 스트림에 기록
                  if (block.type === 'tool_use' && typeof block.name === 'string') {
                    const inputStr = (() => {
                      try {
                        const s = JSON.stringify(block.input || {})
                        return s.length > 180 ? s.slice(0, 177) + '...' : s
                      } catch { return '{}' }
                    })()
                    const line = `\n🔧 ${block.name} ${inputStr}\n`
                    onChunk(line)
                  }
                }
              }
            }

            // user 메시지 안의 tool_result (MCP 응답) — 요약만 표시
            if (obj.type === 'user' && obj.message?.content) {
              const content = obj.message.content
              if (Array.isArray(content)) {
                for (const block of content) {
                  if (block.type === 'tool_result') {
                    const tr = typeof block.content === 'string'
                      ? block.content
                      : Array.isArray(block.content)
                        ? block.content.map((c: { text?: string }) => c?.text || '').join('')
                        : ''
                    const brief = tr ? (tr.length > 120 ? tr.slice(0, 117) + '...' : tr).replace(/\n/g, ' ') : ''
                    onChunk(`   ↳ ${block.is_error ? '❌ ' : '✓ '}${brief}\n`)
                  }
                }
              }
            }
          } catch {
            // non-JSON 라인 무시
          }
        }
      })

      proc.stderr.on('data', (data: Buffer) => {
        diag.appendStderr(data.toString('utf-8'))
        stderrChunks.push(data)
      })

      proc.on('error', (err) => {
        if (timeout) clearTimeout(timeout)
        diag.complete({ exitCode: null, errorMessage: `spawn error: ${err.message}` })
        reject(wrapClaudeError(err.message, readStderr()))
      })

      proc.on('close', (code) => {
        if (timeout) clearTimeout(timeout)
        if (finalResult) {
          if (!finalResult.result && accumulated) finalResult.result = accumulated
          diag.complete({ exitCode: code })
          resolve(finalResult)
        } else if (accumulated) {
          diag.complete({ exitCode: code })
          resolve({
            type: 'result',
            result: accumulated,
            duration_ms: 0,
            session_id: '',
            is_error: false,
            total_cost_usd: 0
          })
        } else {
          // raw stdout fallback — stream-json 라인이 안 들어왔지만 stdout 에 평문 응답이 있는 경우.
          // v1.5.3 진단에서 일부 Windows 사용자가 같은 claude 버전임에도 stream-json 이 아니라
          // 평문 마크다운을 stdout 으로 흘리는 케이스 발견. 응답 본문이 살아있으니 폐기하지 말고
          // 통째로 result 로 사용. 정상 stream-json 모드에서는 finalResult/accumulated 가 먼저
          // 잡히므로 이 분기 진입 자체가 없음 → 회귀 위험 없음.
          const rawTrimmed = rawStdout.trim()
          if (rawTrimmed.length > 0) {
            diag.complete({
              exitCode: code,
              errorMessage: `stream-json 라인 미수신 → raw stdout fallback (${rawTrimmed.length} chars)`
            })
            resolve({
              type: 'result',
              result: rawTrimmed,
              duration_ms: 0,
              session_id: '',
              is_error: false,
              total_cost_usd: 0
            })
            return
          }

          // Issue #11 — exit 0 인데 결과가 없는 경우: stderr 가 Warning: 류 비치명 메시지일 가능성이 큼.
          // claude 가 `-p` 모드에서 출력하는 "Warning: no stdin data received in 3s, proceeding without it"
          // 같은 메시지는 정상 동작 중 발생하는 경고라 사용자에게 에러로 노출하면 혼란.
          const stderrText = readStderr()
          // 비치명 stderr (Warning, OMC 훅 실패 등) 만이면 사용자 작업 흐름 끊지 말고 빈 결과로 통과.
          // 패턴/판정 로직은 src/main/utils/procText.ts 의 isBenignStderr 가 일관 관리.
          if (isBenignStderr(stderrText)) {
            diag.complete({ exitCode: code, errorMessage: 'benign stderr — 빈 결과로 통과' })
            resolve({
              type: 'result',
              result: '',
              duration_ms: 0,
              session_id: '',
              is_error: false,
              total_cost_usd: 0
            })
            return
          }
          const msg = stderrText || `Claude CLI 종료 코드 ${code}`
          diag.complete({ exitCode: code, errorMessage: msg })
          reject(wrapClaudeError(msg, stderrText))
        }
      })
    })
  }

  isAvailable(): boolean {
    try {
      // Windows: .cmd 추론을 위해 shell:true. `--version` 만 받으므로 codepage 변환 영향 없음.
      execFileSync(CLAUDE_CLI, ['--version'], {
        timeout: 5000,
        env: enrichedEnv(),
        shell: process.platform === 'win32'
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * 범용 AI 호출 (세션 없음, 단순 프롬프트 → 응답)
   * 위키 요약/구조분석, 세션 요약, 캘린더 분석 등에서 사용
   */
  async ask(
    prompt: string,
    opts?: { systemPrompt?: string; model?: AIModelName; maxBudget?: string; requestId?: string; feature?: keyof AIModelConfig; mcpServers?: string[]; imagePaths?: string[] }
  ): Promise<string> {
    const feature = opts?.feature
    const defaultModel = opts?.model || 'sonnet'
    const model = feature ? this.pickModel(feature, defaultModel) : defaultModel

    // feature → skill target 매핑
    const FEATURE_TO_TARGET: Partial<Record<keyof AIModelConfig, string>> = {
      wikiSummarize: 'wiki',
      wikiStructure: 'wiki',
      wikiProofread: 'wiki',
      wikiImprove: 'wiki',
      wikiDraft: 'wiki',
      summarizeTask: 'task',
      briefing: 'briefing',
      report: 'report',
      calendarAnalysis: 'calendar',
      sessionSummary: 'insights',
      generateSkill: 'all',
      messengerCompose: 'messenger'
    }
    const target = feature ? FEATURE_TO_TARGET[feature] : undefined

    const baseSystem = opts?.systemPrompt || '당신은 유용한 한국어 AI 비서입니다.'
    const mergedSystem = target ? this.buildSystemPrompt(baseSystem, target) : baseSystem

    // 이미지 첨부 — prompt 에 절대경로를 명시하고 Read tool 을 허용. CLI 가 이미지 파일을 직접 분석.
    const images = (opts?.imagePaths || []).filter((p) => !!p && p.trim().length > 0)
    const finalPrompt = images.length > 0
      ? `[첨부 이미지 — Read tool 로 읽어서 시각적 내용을 분석에 활용하세요. ${images.length}장]\n${images.map((p) => `- ${p}`).join('\n')}\n\n${prompt}`
      : prompt

    const args = buildArgs(finalPrompt, {
      model,
      systemPrompt: mergedSystem,
      maxBudget: opts?.maxBudget || '0.3',
      mcpServers: opts?.mcpServers,
      allowMcp: false,
      allowRead: images.length > 0
    })

    const result = await this.runWithProgress(opts?.requestId, '✨ AI 응답 생성 중...', args, { feature: feature || 'ask' })
    return result.result
  }

  /** 스트리밍 기반으로 AI 호출 + 진행상황 이벤트 발행 */
  private async runWithProgress(
    requestId: string | undefined,
    stageMessage: string,
    args: string[],
    options: { timeoutMs?: number | null; feature?: string } = {}
  ): Promise<ClaudeCliResult> {
    const started = Date.now()
    this.emitProgress(requestId, 'thinking', stageMessage, started)
    const result = await this.runClaudeStream(args, (chunk) => {
      this.emitProgress(requestId, 'streaming', stageMessage, started, chunk)
    }, options)
    this.emitProgress(requestId, 'done', '완료', started)
    return result
  }

  async generateBriefing(
    tasks: DoorayTask[],
    events: DoorayCalendarEvent[],
    _skillsUnused?: Array<{ name: string; content: string }>, // deprecated: skillLoader 사용
    ccTasks?: DoorayTask[],
    dueTodayTasks?: DoorayTask[],
    requestId?: string,
    mcpServers?: string[],
    /** 위임 모드 여부 — true 면 task 데이터는 AI 가 MCP 로 직접 수집. sourceMeta 에 표시. */
    delegated?: boolean
  ): Promise<AIBriefing> {
    const started = Date.now()
    this.emitProgress(requestId, 'collecting', '브리핑 데이터 준비 중...', started)

    const today = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    })

    // closed 는 브리핑에 무의미 — 토큰 낭비 + LLM 혼선 (실제 데이터에서 50개 중 31개가 closed 인 케이스 발견).
    // registered + working 만 남긴 뒤 50개 slice.
    const activeTasks = tasks.filter((t) => t.workflowClass !== 'closed')
    const taskData = activeTasks.slice(0, 50).map((t) => ({
      id: t.id, subject: t.subject, status: t.workflowClass,
      workflowName: t.workflow?.name, project: t.projectCode,
      tags: t.tags?.map((tag) => tag.name).filter(Boolean),
      milestone: t.milestone?.name,
      dueDate: t.dueDateAt, created: t.createdAt
    }))

    // 일정 source 라벨링 — getEventsLegacy 가 id 에 "${source}:${id}" 형식으로 prefix.
    // LLM 이 "내가 등록한 todo (local)" vs "두레이 회의 (caldav)" vs "공휴일 (holiday)" 를 구분해 우선순위/추천에 반영.
    const inferSource = (id?: string): 'local' | 'caldav' | 'holiday' | 'unknown' => {
      if (!id) return 'unknown'
      if (id.startsWith('local:')) return 'local'
      if (id.startsWith('holiday:')) return 'holiday'
      if (id.startsWith('caldav:')) return 'caldav'
      return 'unknown'
    }
    const eventData = events.map((e) => ({
      subject: e.subject,
      start: e.startedAt || e.startAt,
      end: e.endedAt || e.endAt,
      location: e.location,
      allDay: e.wholeDayFlag,
      source: inferSource(e.id)
    }))

    const ccData = (ccTasks || []).slice(0, 30).map((t) => ({
      id: t.id, subject: t.subject, status: t.workflowClass,
      project: t.projectCode, created: t.createdAt
    }))

    const dueTodayData = (dueTodayTasks || []).map((t) => ({
      id: t.id, subject: t.subject, status: t.workflowClass, project: t.projectCode
    }))

    const allEmpty = taskData.length === 0 && dueTodayData.length === 0 && ccData.length === 0 && eventData.length === 0
    const prompt = allEmpty
      ? `오늘: ${today}

데이터가 제공되지 않았습니다. 사용자가 설정한 스킬(system prompt에 포함됨) 의 "규칙"(데이터 수집 범위, 특정 ID 필터 등)만 따르고, 해당 스킬 내부의 "출력 형식" 섹션은 무시하세요.

작업 순서:
1. 스킬 규칙에 맞는 MCP 도구를 호출해서 필요한 태스크/일정을 수집
2. 수집한 데이터를 분석
3. **반드시 본 system prompt의 JSON 스키마(greeting/urgent/focus/mentioned/stale/todayEvents/recommendations)로만 최종 응답**

주의: 데이터가 적더라도 JSON 스키마는 반드시 유지 (빈 배열 허용). 텍스트 서술이나 마크다운 형식으로 답하지 마세요.`
      : `오늘: ${today}

[내 담당 태스크 ${taskData.length}개]
${JSON.stringify(taskData)}

[오늘 마감 태스크 ${dueTodayData.length}개]
${JSON.stringify(dueTodayData)}

[내가 참조/멘션된 태스크 ${ccData.length}개 (진행중/등록만)]
${JSON.stringify(ccData)}

[일정 ${eventData.length}개]
${JSON.stringify(eventData)}`

    const args = buildArgs(prompt, {
      model: this.pickModel('briefing', 'opus'),
      systemPrompt: this.buildSystemPrompt(BRIEFING_SYSTEM_PROMPT, 'briefing'),
      // 에이전틱 — 캘린더 일정 보고 LLM 이 사용자 스킬의 명령/MCP/web 으로 grounding data 직접 fetch.
      // 도구 호출 라운드트립 고려해서 budget/effort 여유있게.
      maxBudget: allEmpty ? '3.0' : '2.5',
      effort: 'high',
      mcpServers,
      agentic: true
    })

    this.emitProgress(requestId, 'thinking', `🤖 Claude (${this.pickModel('briefing', 'opus')}) 시작 중...`, started)
    // 에이전틱 모드 — 도구 호출 라운드트립이 있어 5분까지 허용. allEmpty 는 그대로 무제한.
    const probes: Array<{ name: string; summary?: string }> = []
    const result = await this.runClaudeStream(args, (chunk) => {
      this.emitProgress(requestId, 'streaming', '✨ 응답 생성 중...', started, chunk)
      // chunk 에서 도구 호출 라인 캡처 — runClaudeStream 이 "\n🔧 toolName {input}\n" 형식으로 emit
      const match = chunk.match(/🔧 ([\w-]+(?:__[\w-]+)?)\s+(\{[^\n]*\})/)
      if (match) {
        const name = match[1]
        const inputStr = match[2]
        const summary = inputStr.length > 100 ? inputStr.slice(0, 97) + '...' : inputStr
        // 같은 (name, summary) 중복 제거
        if (!probes.some((p) => p.name === name && p.summary === summary)) {
          probes.push({ name, summary })
        }
      }
    }, allEmpty ? { timeoutMs: null, feature: 'briefing' } : { timeoutMs: 300000, feature: 'briefing' })
    this.emitProgress(requestId, 'parsing', '결과 정리 중...', started)

    // JSON 추출 — 마크다운 코드블록(```json ... ```) 처리 및 에러 명확화
    const raw = (result.result || '').trim()
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    // 위임 모드에서 AI가 스킬 출력 형식(텍스트/마크다운)을 그대로 준 경우 폴백
    const textFallback = (msg: string): AIBriefing => {
      this.emitProgress(requestId, 'done', '완료', started)
      return {
        greeting: msg.slice(0, 3000) || '브리핑 결과가 비어있습니다.',
        urgent: [], focus: [], mentioned: [], stale: [], todayEvents: [], recommendations: []
      }
    }
    if (!jsonMatch) {
      // raw 에 텍스트가 있으면 무조건 textFallback — 구조화된 카테고리는 못 얻지만
      // 본문은 살아남아 사용자가 결과를 볼 수 있음. 일부 Windows 사용자처럼
      // stream-json 이 평문으로 떨어지는 환경 (v1.5.4 fallback 으로 raw 가 살아온 경우) 도 포함.
      if (raw) return textFallback(raw)
      this.emitProgress(requestId, 'done', '완료', started)
      throw new Error(`AI 응답에서 JSON을 찾지 못했습니다.\n\n응답: ${raw.substring(0, 400)}`)
    }
    try {
      const briefing = JSON.parse(jsonMatch[0]) as AIBriefing
      // 이번주 일정 범위 라벨 — "5/20~5/27" 형식
      const fmtMD = (d: Date): string => `${d.getMonth() + 1}/${d.getDate()}`
      const evStart = new Date()
      const startOfDay = new Date(evStart.getFullYear(), evStart.getMonth(), evStart.getDate())
      const endOfWeek = new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000)

      // 분류 누수 정정:
      //  1) focus/urgent/stale 에 CC id 섞이면 → mentioned 로 이동, 모르는 id 면 drop
      //  2) closed 태스크 id 가 어디든 들어오면 drop
      //  3) cross-category dedup — 한 taskId 가 여러 카테고리에 있으면 우선순위 (urgent > focus > stale > mentioned) 만 유지
      //  4) subject 는 두레이 원본으로 강제 교체 (LLM 이 emoji/prefix 붙이는 누수 방지)
      const myIds = new Set([
        ...tasks.filter((t) => t.workflowClass !== 'closed').map((t) => t.id),
        ...(dueTodayTasks || []).map((t) => t.id)
      ])
      const ccIds = new Set((ccTasks || []).map((t) => t.id))
      const subjectById = new Map<string, string>()
      for (const t of tasks) subjectById.set(t.id, t.subject)
      for (const t of (dueTodayTasks || [])) subjectById.set(t.id, t.subject)
      for (const t of (ccTasks || [])) subjectById.set(t.id, t.subject)

      type Item = { taskId: string; subject: string; reason?: string; daysSinceCreated?: number }
      const movedToMentioned: Item[] = []
      const filterMyOnly = <T extends Item>(arr: T[] | undefined): T[] => {
        if (!Array.isArray(arr)) return []
        const out: T[] = []
        for (const it of arr) {
          if (!it?.taskId) { out.push(it); continue }
          if (myIds.has(it.taskId)) out.push(it)
          else if (ccIds.has(it.taskId)) movedToMentioned.push({ taskId: it.taskId, subject: it.subject, reason: it.reason || '참조된 항목' })
          // 모르는 id (closed 등) 는 drop
        }
        return out
      }
      let urgent = filterMyOnly(briefing.urgent)
      let focus = filterMyOnly(briefing.focus)
      let stale = filterMyOnly(briefing.stale)

      // cross-category dedup — 우선순위 높은 카테고리에 이미 있으면 낮은 카테고리에서 제거
      const usedInHigher = new Set<string>()
      const dedupAgainst = <T extends Item>(arr: T[]): T[] => {
        const out: T[] = []
        for (const it of arr) {
          if (it?.taskId && usedInHigher.has(it.taskId)) continue
          out.push(it)
          if (it?.taskId) usedInHigher.add(it.taskId)
        }
        return out
      }
      urgent = dedupAgainst(urgent)
      focus = dedupAgainst(focus)
      stale = dedupAgainst(stale)

      const mentionedRaw = Array.isArray(briefing.mentioned) ? briefing.mentioned : []
      const mentionedFiltered = mentionedRaw.filter((m) => !m?.taskId || ccIds.has(m.taskId))
      const mentionedSeen = new Set<string>()
      const mentioned = [...mentionedFiltered, ...movedToMentioned].filter((m) => {
        if (!m?.taskId) return true
        // higher 카테고리에 이미 있으면 mentioned 에서도 제거 (담당으로 분류된 게 또 mentioned 에 오면 의미 없음)
        if (usedInHigher.has(m.taskId)) return false
        if (mentionedSeen.has(m.taskId)) return false
        mentionedSeen.add(m.taskId)
        return true
      })

      // subject 원본 강제 교체 — LLM 이 "🚀 [재무서비스-배포] 21주차 배포 취합" 처럼 prefix 붙이는 누수 방지
      const restoreSubject = <T extends Item>(arr: T[]): T[] => arr.map((it) => {
        if (!it?.taskId) return it
        const orig = subjectById.get(it.taskId)
        return orig ? { ...it, subject: orig } : it
      })
      urgent = restoreSubject(urgent)
      focus = restoreSubject(focus)
      stale = restoreSubject(stale)
      // mentioned 는 AIBriefing 의 strict shape 으로 좁히기 — reason 누락 시 기본 문구 채움
      const mentionedFinal = restoreSubject(mentioned).map((m) => ({
        taskId: m.taskId,
        subject: m.subject,
        reason: m.reason || '참조된 항목'
      }))

      const safe: AIBriefing = {
        greeting: briefing.greeting || '오늘도 좋은 하루 보내세요!',
        urgent: urgent as AIBriefing['urgent'],
        focus: focus as AIBriefing['focus'],
        mentioned: mentionedFinal,
        stale: stale as AIBriefing['stale'],
        todayEvents: Array.isArray(briefing.todayEvents) ? briefing.todayEvents : [],
        recommendations: Array.isArray(briefing.recommendations) ? briefing.recommendations : [],
        sourceMeta: {
          taskCount: tasks.length,
          ccTaskCount: (ccTasks || []).length,
          dueTodayCount: (dueTodayTasks || []).length,
          eventCount: events.length,
          eventRange: `${fmtMD(startOfDay)}~${fmtMD(endOfWeek)}`,
          collectedAt: new Date(started).toISOString(),
          delegated: !!delegated,
          probes: probes.length > 0 ? probes : undefined
        }
      }
      this.emitProgress(requestId, 'done', '완료', started)
      return safe
    } catch (err) {
      if (allEmpty) return textFallback(raw)
      this.emitProgress(requestId, 'done', '완료', started)
      throw new Error(`AI JSON 파싱 실패: ${err instanceof Error ? err.message : String(err)}\n\n응답: ${jsonMatch[0].substring(0, 400)}`)
    }
  }

  async summarizeTask(task: DoorayTask, taskBody?: string, requestId?: string): Promise<string> {
    const prompt = `태스크: ${task.subject}\n상태: ${task.workflowClass}\n프로젝트: ${task.projectCode || '알 수 없음'}\n마감: ${task.dueDateAt || '없음'}\n\n${taskBody ? '본문:\n' + taskBody.substring(0, 3000) : '(본문 없음)'}\n\n핵심 목표, 현재 상태, 다음 액션을 3줄 이내로 요약.`

    const result = await this.runWithProgress(requestId, '태스크 요약 중...', buildArgs(prompt, {
      model: this.pickModel('summarizeTask', 'haiku'),
      systemPrompt: this.buildSystemPrompt('두레이 태스크를 간결하게 분석하는 AI. 한국어로 3줄 이내 요약.', 'task'),
      maxBudget: '0.1'
    }), { feature: 'summarizeTask' })

    return result.result || '요약을 생성할 수 없습니다.'
  }

  async generateReport(
    type: 'daily' | 'weekly',
    tasks: DoorayTask[],
    events: DoorayCalendarEvent[],
    requestId?: string,
    mcpServers?: string[]
  ): Promise<AIReport> {
    const started = Date.now()
    this.emitProgress(requestId, 'collecting', '업무 데이터 집계 중...', started)

    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
    const period = type === 'daily' ? '일일' : '주간'
    const done = tasks.filter((t) => t.workflowClass === 'closed')
    const working = tasks.filter((t) => t.workflowClass === 'working')
    const registered = tasks.filter((t) => t.workflowClass === 'registered')

    // 태스크 정보를 풍부하게 구조화 — 단순 subject 나열이 아닌 맥락 있는 데이터 제공
    const fmtTask = (t: DoorayTask) => {
      const parts: string[] = [`[${t.projectCode || '?'}] ${t.subject}`]
      if (t.workflow?.name) parts.push(`상태: ${t.workflow.name}`)
      if (t.dueDateAt) parts.push(`마감: ${t.dueDateAt.slice(0, 10)}`)
      if (t.milestone?.name) parts.push(`마일스톤: ${t.milestone.name}`)
      if (t.tags && t.tags.length > 0) parts.push(`태그: ${t.tags.map((tag) => tag.name).join(', ')}`)
      return `- ${parts.join(' | ')}`
    }

    const allEmpty = tasks.length === 0 && events.length === 0
    const prompt = allEmpty
      ? `${period} 업무 보고서를 작성해주세요.\n작성 기준일: ${today}\n\n데이터가 제공되지 않았습니다. 사용자가 설정한 스킬(system prompt에 포함됨) 지시에 따라 MCP 도구로 필요한 태스크·일정을 직접 조회한 뒤, 아래 지정된 보고서 형식에 맞춰 작성하세요.`
      : `${period} 업무 보고서를 작성해주세요.\n작성 기준일: ${today}

---

## 완료된 태스크 (${done.length}개)
${done.length > 0
  ? done.slice(0, 20).map(fmtTask).join('\n')
  : '(이 기간 완료된 태스크 없음)'}

## 진행 중인 태스크 (${working.length}개)
${working.length > 0
  ? working.slice(0, 20).map(fmtTask).join('\n')
  : '(진행 중인 태스크 없음)'}

## 예정·등록된 태스크 (${registered.length}개)
${registered.length > 0
  ? registered.slice(0, 10).map(fmtTask).join('\n')
  : '(예정 태스크 없음)'}

## ${type === 'daily' ? '오늘' : '이번 주'} 일정 (${events.length}개)
${events.length > 0
  ? events.slice(0, 15).map((e) => {
      const start = e.startedAt || e.startAt || ''
      const end = e.endedAt || e.endAt || ''
      const timeStr = start ? `${start.slice(11, 16)}${end ? '-' + end.slice(11, 16) : ''}` : '종일'
      return `- ${timeStr} ${e.subject}${e.location ? ` (${e.location})` : ''}`
    }).join('\n')
  : '(일정 없음)'}`

    const REPORT_SYSTEM_PROMPT = `당신은 두레이 업무 보고서를 작성하는 전문 비서입니다. 한국어로 자연스럽고 명확한 보고서를 마크다운 형식으로 작성합니다.

## 역할 정의
- 개인 업무 현황을 임원/팀장/본인이 한눈에 파악할 수 있는 ${period} 보고서 작성
- 두레이 태스크 데이터를 단순 나열이 아닌 의미 있는 업무 스토리로 재구성
- 외부 시스템(PR, 배포, CI 등)과 연계되는 항목은 실제 데이터를 조회하여 구체화

## 보고서 구조 (이 순서와 섹션을 반드시 지킬 것)

### 1. 요약 (Executive Summary)
- 2~4문장. "${period} 핵심 업무 = [완료 N건 + 진행 N건], 주목할 사항: ..."
- 완료·진행·대기 건수와 가장 중요한 1~2가지 사항만 압축

### 2. 완료 업무
- 각 태스크별 한 줄 설명: **무엇을** 했고 **결과/상태**가 어떤지
- 형식: \`[프로젝트] 태스크 제목 — 완료 내용 한 줄\`
- 여러 관련 태스크는 묶어서 서술 가능

### 3. 진행 중인 업무
- 형식: \`[프로젝트] 태스크 제목 — 현재 상태 + 다음 액션\`
- 마감일이 있으면 명시. 블로커가 있으면 명시.
- 워크플로우명(status)이 있으면 괄호에 표기

### 4. 예정·계획 업무
- 다음 단계로 착수할 항목
- 일정과 연계되는 항목 우선 표기

### 5. 리스크 / 이슈 (있을 경우)
- 마감 임박, 블로커, 의존성 등
- 없으면 이 섹션 생략

### 6. 외부 연계 조회 결과 (도구 호출 결과가 있을 때만)
- PR 상태, 배포 현황, CI 결과 등을 조회한 내용
- URL은 마크다운 링크로 포함

## 작성 원칙
- **구체성**: "확인", "검토", "점검" 같은 막연한 동사 단독 사용 금지. "결제 API v2 통합 완료 (PR #241 머지)", "사용자 알림 로직 리팩토링 진행 중 (60% 완료, 마감 6/25)" 처럼 대상과 상태가 명확해야 함
- **간결성**: 섹션당 5~8항목 이내. 없는 항목은 "(없음)" 한 줄로 표시
- **자연스러운 한국어**: 업무 보고서 톤. 지나치게 격식체(~하였습니다)보다는 간결한 명사형/동사형 마침
- **계층 구조**: 헤딩(##, ###), 불릿(-), 코드(\`\`)를 목적에 맞게 사용

## 에이전틱 행동 — 외부 시스템 grounding
태스크 제목이나 일정이 외부 시스템 상태를 암시하면 도구로 직접 확인하라:
- \`Bash\`: git log, 배포 스크립트, 내부 CLI 명령 (사용자 스킬에 정의된 명령 우선)
- \`WebSearch\` / \`WebFetch\`: 외부 링크, 릴리스 노트, 이슈 트래커
- \`mcp__dooray-mcp__*\` 및 기타 활성 MCP: 추가 태스크 세부 정보 조회

도구 호출 원칙:
- 같은 인자로 동일 도구 두 번 호출 금지
- 도구 실패 시 해당 항목 조용히 skip, 나머지 보고서 계속 작성
- 호출 결과 URL 은 마크다운 링크로 포함 (UI 가 자동 렌더링)
- 사용자 스킬에 명시된 명령이 있으면 그것을 최우선 활용

## 최종 출력 형식
- 마크다운 문서 하나 (코드블록이나 JSON 감싸기 금지)
- 위 6개 섹션 순서 유지 (해당 없는 섹션은 간략히 "(없음)")
- 마지막에 \`---\n*보고서 생성: ${today}*\` 한 줄 추가`

    const args = buildArgs(prompt, {
      model: this.pickModel('report', 'opus'),
      systemPrompt: this.buildSystemPrompt(REPORT_SYSTEM_PROMPT, 'report'),
      // 에이전틱 — Bash + Web + MCP 광범위 허용. 보고서는 깊이 있는 분석이라 budget/effort 여유있게.
      maxBudget: allEmpty ? '3.5' : '3.0',
      effort: 'high',
      mcpServers,
      agentic: true
    })

    this.emitProgress(requestId, 'thinking', `${period} 보고서 작성 중...`, started)
    const probes: Array<{ name: string; summary?: string }> = []
    const result = await this.runClaudeStream(args, (chunk) => {
      this.emitProgress(requestId, 'streaming', `${period} 보고서 작성 중...`, started, chunk)
      // 도구 호출 라인 캡처 — 브리핑과 동일 패턴
      const match = chunk.match(/🔧 ([\w-]+(?:__[\w-]+)?)\s+(\{[^\n]*\})/)
      if (match) {
        const name = match[1]
        const inputStr = match[2]
        const summary = inputStr.length > 100 ? inputStr.slice(0, 97) + '...' : inputStr
        if (!probes.some((p) => p.name === name && p.summary === summary)) {
          probes.push({ name, summary })
        }
      }
    }, allEmpty ? { timeoutMs: null, feature: 'report' } : { timeoutMs: 300000, feature: 'report' })
    this.emitProgress(requestId, 'done', '완료', started)

    return {
      title: `${period} 업무 보고서 - ${today}`,
      content: result.result,
      generatedAt: new Date().toISOString(),
      sourceMeta: {
        taskCount: tasks.length,
        ccTaskCount: 0,
        dueTodayCount: 0,
        eventCount: events.length,
        collectedAt: new Date(started).toISOString(),
        probes: probes.length > 0 ? probes : undefined
      }
    }
  }

  async wikiProofread(title: string, content: string, requestId?: string): Promise<string> {
    const result = await this.runWithProgress(requestId, '위키 교정 중...', buildArgs(
      `다음 두레이 위키 문서를 교정하세요.\n\n제목: ${title}\n\n---\n${content.substring(0, 8000)}`, {
      model: this.pickModel('wikiProofread', 'opus'),
      systemPrompt: this.buildSystemPrompt(`위키 문서 교정 전문가. 규칙:
- 맞춤법, 문법, 띄어쓰기 교정
- 기술 용어는 원래대로 유지 (코드, 명령어, 경로 등)
- 마크다운 형식 완벽 유지 (헤딩, 리스트, 코드블록, 테이블 등)
- HTML 태그(<br>, <table> 등)도 그대로 유지
- 교정된 전체 문서를 마크다운으로 출력 (설명 없이 결과만)`, 'wiki'),
      maxBudget: '1'
    }), { feature: 'wikiProofread' })
    return result.result
  }

  async wikiImprove(title: string, content: string, requestId?: string): Promise<string> {
    const result = await this.runWithProgress(requestId, '위키 개선 중...', buildArgs(
      `다음 두레이 위키 문서를 개선하세요.\n\n제목: ${title}\n\n---\n${content.substring(0, 8000)}`, {
      model: this.pickModel('wikiImprove', 'opus'),
      systemPrompt: this.buildSystemPrompt(`위키 문서 개선 전문가. 규칙:
- 가독성 향상: 긴 문단을 나누고, 핵심을 먼저 배치
- 구조 개선: 적절한 헤딩 레벨, 목록 활용, 코드블록 정리
- 내용은 변경하지 않되 표현을 더 명확하게
- 불필요한 반복 제거
- 마크다운 형식으로 개선된 전체 문서 출력 (설명 없이 결과만)
- HTML 태그(<br>, <table> 등)도 유지`, 'wiki'),
      maxBudget: '1'
    }), { feature: 'wikiImprove' })
    return result.result
  }

  /**
   * 메신저 메시지 정리/생성.
   * 사용자가 말한 내용을 두레이 메신저에 보낼 수 있도록 깔끔하게 정리.
   */
  /**
   * 메신저 메시지 정리 — 에이전틱 모드.
   * - 채널 ID/내부 채널 조회는 불필요(호출부가 API로 발송) → MCP/Bash/파일 차단
   * - 사용자 요청이 외부 사실을 필요로 하면(여행지, 가게, 일정 등) WebSearch/WebFetch 로 스스로 조사
   * - 최종 출력은 메시지 본문 한 덩어리
   */
  async composeMessengerMessage(instruction: string, channelName?: string, requestId?: string): Promise<string> {
    const prompt = `${channelName ? `"${channelName}" 채널` : '선택된 채널'}에 보낼 메신저 메시지를 작성해줘.

사용자 요청:
${instruction}

작성 가이드:
- 요청에 외부 정보(가게, 장소, 일정, 날씨, 최신 뉴스 등)가 필요하면 WebSearch / WebFetch 로 직접 조사해서 반영할 것
- 여러 선택지/계획이 필요하면 스스로 정리해서 최종 메시지에 녹여낼 것
- 대상 채널 이름("${channelName || ''}")의 분위기(팀/공지/개인 등)를 감안한 말투
- 내부 도구(MCP/파일/터미널)는 사용하지 말 것 — 채널 상세 같은 걸 조회할 필요 없음
- 최종 응답은 메신저에 **바로 붙여넣을 메시지 본문 하나**만 (머리말/설명/코드블록 금지)`

    const result = await this.runWithProgress(requestId, '메시지 작성 중... (필요시 웹 조사)', buildArgs(prompt, {
      model: this.pickModel('messengerCompose', 'sonnet'),
      systemPrompt: this.buildSystemPrompt(`두레이 메신저 메시지 작성 에이전트.

역할:
- 사용자의 의도를 파악하고, 외부 사실 확인이 필요하면 WebSearch/WebFetch 로 조사한 뒤 메시지에 자연스럽게 녹여냄
- 조사 결과는 메시지 본문에 통합 (링크는 꼭 필요할 때만 포함)
- 채널 성격(팀방/공지/1:1)에 맞는 톤으로 자동 조절

출력 규칙:
- 메신저에 바로 붙여넣을 **메시지 본문만** 출력 — 설명/머리말/사고과정 금지
- 핵심부터, 불필요한 수식어 제거, 업무적이면서 자연스러운 한국어
- 여러 건은 번호/불릿으로 정리
- 마크다운은 최소한(**, \`code\`, 목록)만
- 적절한 길이 (짧은 공지는 짧게, 계획서는 필요한 만큼)`, 'messenger'),
      maxBudget: '0.5',
      effort: 'medium',
      webOnly: true
    }), { timeoutMs: 180000, feature: 'messengerCompose' })
    return result.result
  }

  /**
   * 자연어 지시 → FilterRule JSON 생성. 모니터링 와처에서 사용.
   */
  async generateFilterRule(instruction: string, requestId?: string): Promise<{
    anyOf?: string[]
    allOf?: string[]
    regex?: string[]
    exclude?: string[]
    excludeRegex?: string[]
    description: string
  }> {
    const prompt = `사용자의 자연어 요청을 두레이 메신저 메시지 필터 규칙(JSON)으로 변환하세요.

요청:
${instruction}

반드시 아래 JSON만 응답하세요 (설명 문장/코드블록 금지):
{
  "anyOf": ["키워드1", "키워드2"],
  "allOf": [],
  "regex": [],
  "exclude": [],
  "excludeRegex": [],
  "description": "포함 키워드 중심 한줄 요약"
}

핵심 원칙:
- 사용자가 입력한 단어/주제는 기본적으로 **포함(anyOf)** 조건으로 해석
- "XX 제외", "단 YY는 빼고", "아닌 것만" 같은 명시적 제외 표현이 있을 때만 exclude 사용
- 사용자가 단순히 명사/주제만 적었다면 관련 동의어/유사어를 anyOf에 보강
- 예: 입력 "리뷰 확인" → anyOf: ["리뷰", "review", "PR", "머지"], exclude: []
- 예: 입력 "배포 알림" → anyOf: ["배포", "deploy", "릴리즈", "release"], exclude: []
- 예: 입력 "장애, 에러만 단 테스트 제외" → anyOf: ["장애", "에러", "error", "fail"], exclude: ["테스트"]

필드 설명:
- anyOf: 이 중 하나만 포함되어도 매치 (OR) — 대부분 케이스에서 주력
- allOf: 모두 포함되어야 매치 (AND) — 좁은 조건에만 사용
- regex: 정규식 (i 플래그 자동 적용). 숫자 패턴, 포맷 매칭 필요할 때만
- exclude: 이 단어 포함 시 무조건 제외 — 사용자가 명시적으로 제외 언급한 경우만
- description: 1줄로 규칙 요약 (사용자에게 보여줌, "~을 포함한 메시지" 형태 권장)
- 배열이 비어도 되지만 키는 항상 모두 포함`

    const result = await this.runWithProgress(requestId, 'AI 필터 규칙 생성 중...', buildArgs(prompt, {
      model: 'sonnet',
      systemPrompt: '메시지 필터 규칙 생성 전문가. 항상 유효한 JSON만 응답합니다.',
      maxBudget: '0.1'
    }), { feature: 'filterRule' })

    const text = result.result.trim()
    // JSON 추출 (``` 코드블록 제거)
    const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/, '').trim()
    try {
      const parsed = JSON.parse(clean)
      return {
        anyOf: Array.isArray(parsed.anyOf) ? parsed.anyOf : [],
        allOf: Array.isArray(parsed.allOf) ? parsed.allOf : [],
        regex: Array.isArray(parsed.regex) ? parsed.regex : [],
        exclude: Array.isArray(parsed.exclude) ? parsed.exclude : [],
        excludeRegex: Array.isArray(parsed.excludeRegex) ? parsed.excludeRegex : [],
        description: typeof parsed.description === 'string' ? parsed.description : instruction
      }
    } catch (err) {
      throw new Error(`AI 응답 JSON 파싱 실패: ${err instanceof Error ? err.message : String(err)}\n응답: ${clean.substring(0, 200)}`)
    }
  }

  async generateWikiDraft(taskSubject: string, taskBody?: string, projectCode?: string, requestId?: string): Promise<string> {
    const prompt = `완료 태스크 기반 위키 문서 초안을 마크다운으로 작성.\n프로젝트: ${projectCode || '알 수 없음'}\n태스크: ${taskSubject}\n${taskBody ? '\n본문:\n' + taskBody.substring(0, 3000) : ''}\n\n## 개요\n## 변경 내용\n## 영향 범위\n## 참고 사항`

    const result = await this.runWithProgress(requestId, '위키 초안 작성 중...', buildArgs(prompt, {
      model: this.pickModel('wikiDraft', 'sonnet'),
      systemPrompt: this.buildSystemPrompt('두레이 위키 문서 전문 작성 AI. 개발 문서를 구조화된 마크다운으로 작성합니다.', 'wiki'),
      maxBudget: '0.2'
    }), { feature: 'wikiDraft' })
    return result.result
  }

  async generateSkill(
    request: string,
    target: string,
    requestId?: string,
    mcpServers?: string[]
  ): Promise<{ name: string; description: string; content: string }> {
    const useMcp = !!(mcpServers && mcpServers.length > 0)
    const mcpHint = useMcp ? `

[MCP 도구 사용 권한]
아래 MCP 서버 도구를 호출하여 실제 데이터(ID, 이름, 설정값 등)를 조회한 뒤
조회 결과를 스킬 content에 그대로 박아 넣으세요. 스킬이 나중에 실행될 때
다시 MCP를 호출할 필요 없도록, 구체적인 ID/값을 content에 기록하세요.

허용 MCP: ${mcpServers!.join(', ')}

예: "FI 휴가 캘린더 ID는 12345" 처럼 조회 결과를 스킬 본문에 고정값으로 기록.` : ''

    const prompt = `사용자가 요청한 AI 스킬을 생성하세요.

적용 대상: ${target}
사용자 요청: ${request}${mcpHint}

반드시 아래 JSON만 응답하세요 (설명/머리말/코드블록 금지):
{
  "name": "스킬 이름 (짧고 명확하게)",
  "description": "한줄 설명",
  "content": "## 규칙\\n- 구체적인 조건과 동작\\n\\n## 출력 형식\\n- AI가 결과를 어떤 형태로 보여줄지"
}`

    const result = await this.runWithProgress(requestId, '스킬 생성 중...', buildArgs(prompt, {
      // 스킬 생성은 품질이 중요하므로 항상 Opus 사용 (사용자 설정 무시)
      model: 'opus',
      // MCP 사용 시 effort 올려서 도구 호출 여유 확보
      effort: useMcp ? 'medium' : 'low',
      mcpServers,
      systemPrompt: `두레이(Dooray) 업무 관리 AI 스킬 생성 전문가. 사용자의 요구사항을 분석하여 구체적이고 실행 가능한 스킬 규칙을 마크다운으로 작성합니다.

스킬 규칙 작성 지침:
- 두레이 태스크의 workflowClass: backlog, registered, working, closed
- 태스크 필드: subject, workflowClass, workflow.name, tags, milestone, priority, dueDateAt, createdAt
- 캘린더 필드: subject, startedAt, endedAt, location, wholeDayFlag
- 프로젝트별로 다른 워크플로우 이름이 있을 수 있음
- 마일스톤은 "26년 15주차" 같은 형식
- 구체적인 조건, 비교 로직, 출력 형식을 명확하게 작성
${useMcp ? `
[MCP 활용]
- 허용된 MCP 도구로 먼저 필요한 ID/설정을 조회 (예: 멤버 이름 → ID, 캘린더 이름 → ID)
- 조회 결과를 스킬 content에 하드코딩하여 런타임에 다시 조회할 필요 없게 만들기
- 도구 호출은 꼭 필요한 만큼만, 최소한으로` : ''}`,
      maxBudget: useMcp ? '1.0' : '0.3'
    }), { feature: 'generateSkill' })

    try {
      const jsonMatch = result.result.match(/\{[\s\S]*\}/)
      if (jsonMatch) return JSON.parse(jsonMatch[0])
    } catch { /* fallback */ }

    return {
      name: '새 스킬',
      description: request.substring(0, 50),
      content: `## 규칙\n${request}\n\n## 출력 형식\n- 분석 결과를 목록으로 표시`
    }
  }

  /** AI 추천 결과 캐시 파일 경로 */
  private aiRecommendCachePath(): string {
    const dir = join(homedir(), '.clauday')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return join(dir, 'ai-recommend-cache.json')
  }

  /** 저장된 마지막 AI 추천 결과 (없으면 null) */
  getLastAIRecommendation(): import('../../shared/types/ai-recommend').AIRecommendResult | null {
    try {
      const path = this.aiRecommendCachePath()
      if (!existsSync(path)) return null
      const raw = readFileSync(path, 'utf-8')
      return JSON.parse(raw) as import('../../shared/types/ai-recommend').AIRecommendResult
    } catch {
      return null
    }
  }

  private saveAIRecommendation(result: import('../../shared/types/ai-recommend').AIRecommendResult): void {
    try {
      writeFileSync(this.aiRecommendCachePath(), JSON.stringify(result, null, 2), 'utf-8')
    } catch (err) {
      console.warn('[AIService] AI 추천 결과 캐시 저장 실패:', err)
    }
  }

  /**
   * AI 활용 사례 공유 프로젝트의 task들을 개인 Claude Code setup과 비교 분석.
   * - dooray-mcp로 task 조회 (claude -p가 tool call로 수행)
   * - 스킬/MCP 목록은 프롬프트에 미리 주입
   * - 결과는 3 카테고리(immediate/reference/covered) JSON
   */
  async analyzeAISharing(
    skills: Array<{ name: string; description?: string }>,
    mcpServerNames: string[],
    options: { projectId: string; limit?: number; requestId?: string; mcpServers?: string[] }
  ): Promise<import('../../shared/types/ai-recommend').AIRecommendResult> {
    const started = Date.now()
    const { projectId, limit = 60, requestId, mcpServers: overrideMcp } = options
    this.emitProgress(requestId, 'collecting', '사례 조회 준비 중...', started)

    const skillsBlock = skills.length > 0
      ? skills.map((s) => `- ${s.name}${s.description ? `: ${s.description}` : ''}`).join('\n')
      : '(설치된 스킬 없음)'
    const mcpBlock = mcpServerNames.length > 0 ? mcpServerNames.map((n) => `- ${n}`).join('\n') : '(설정된 MCP 없음)'

    const prompt = `당신은 AI 활용 사례 추천 분석가입니다.

## Step 1: Dooray task 조회
dooray-mcp의 \`get_task_list_with_param\` tool을 호출하세요.
- project_id: "${projectId}"
- task_query: {"size": ${limit}, "order": "-createdAt"}

## Step 2: 분류
조회한 task들을 아래 사용자의 현재 setup과 비교해 3 카테고리로 분류하세요.

### 사용자 현재 스킬 (~/.claude/skills/)
${skillsBlock}

### 사용자 현재 MCP 서버 (~/.claude.json)
${mcpBlock}

## 분류 기준
- "immediate" (즉시 도입 가치): 사용자의 현재 스킬/MCP로 커버되지 않는 gap을 직접적으로 메우는 사례
- "reference" (참고할만한 사례): 흥미롭지만 지금 당장 필요하진 않음 (분야가 다르거나 성숙도가 낮거나)
- "covered" (이미 보유/유사): 이미 설치된 스킬/MCP로 동일/유사한 효과 달성 가능 (어떤 것으로 커버되는지 coveredBy에 명시)

## 출력 형식 (JSON only, 마크다운 감싸지 말 것)
\`\`\`json
{
  "summary": "총 N건 분석 완료 — X건 즉시 도입, Y건 참고, Z건 이미 보유",
  "analyzedCount": 60,
  "immediate": [
    {"taskId": "4316525978676382391", "title": "task 제목", "reason": "왜 필요한지 1-2문장"}
  ],
  "reference": [
    {"taskId": "...", "title": "...", "reason": "..."}
  ],
  "covered": [
    {"taskId": "...", "title": "...", "reason": "...", "coveredBy": "bmad-architect"}
  ]
}
\`\`\`

규칙:
- taskId는 get_task_list_with_param 결과의 각 task id 필드 그대로 사용
- reason은 사용자의 실제 보유 스킬/MCP를 언급해 구체적으로 (예: "watcher와 dooray-mcp로 이미 가능" 대신 "monitoring 기능과 겹침")
- title은 task의 subject 원문
- JSON 외에 어떤 설명도 출력 금지`

    const AI_RECOMMEND_SYSTEM = `당신은 Dooray "AI 활용 사례 공유 프로젝트"의 task들을 사용자의 개인 Claude Code setup(~/.claude/skills/, MCP 서버)과 비교하여 "즉시 도입 / 참고 / 이미 보유" 3 카테고리로 분류하는 전문가입니다.

분류 원칙:
- 사용자의 보유 스킬/MCP와 실제로 같은 문제를 푸는 task만 "covered"로 판정
- 도메인이 다르거나 구현 수준이 큰 차이면 "reference"
- 사용자의 setup에서 뚜렷한 gap을 메우는 task는 "immediate"
- reason은 반드시 사용자의 구체적인 보유 자원을 언급
- 출력은 항상 유효한 JSON 한 덩어리`

    // 사용자가 도구 선택 UI에서 명시적으로 고른 게 있으면 그것만 사용, 아니면 기본값 (dooray-mcp)
    const mcpForCall = overrideMcp && overrideMcp.length > 0 ? overrideMcp : ['dooray-mcp']
    const args = buildArgs(prompt, {
      model: this.pickModel('aiRecommend', 'opus'),
      systemPrompt: this.buildSystemPrompt(AI_RECOMMEND_SYSTEM, 'aiRecommend'),
      mcpServers: mcpForCall,
      maxBudget: '3.0',
      effort: 'medium'
    })

    this.emitProgress(requestId, 'thinking', '분석 시작 중...', started)
    // MCP tool call이 여러 번 일어날 수 있어 타임아웃 해제 (사용자가 재분석 버튼으로만 종료 의도 표현)
    const result = await this.runClaudeStream(args, (chunk) => {
      this.emitProgress(requestId, 'streaming', '분석 중...', started, chunk)
    }, { timeoutMs: null, feature: 'recommend' })
    this.emitProgress(requestId, 'parsing', '결과 정리 중...', started)

    const raw = (result.result || '').trim()
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      this.emitProgress(requestId, 'done', '완료', started)
      const hint = !raw
        ? '응답이 비어있습니다. MCP 호출 중 한도 초과 또는 오류일 수 있습니다. 스킬에서 조회 범위를 줄여보세요.'
        : `응답에 JSON 형식이 없습니다.\n\n원본:\n${raw.substring(0, 800)}`
      throw new Error(`AI 응답에서 JSON을 찾지 못했습니다.\n\n${hint}`)
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      summary?: string
      analyzedCount?: number
      immediate?: Array<{ taskId: string; title: string; reason: string }>
      reference?: Array<{ taskId: string; title: string; reason: string }>
      covered?: Array<{ taskId: string; title: string; reason: string; coveredBy?: string }>
    }

    const attachUrl = <T extends { taskId: string }>(arr: T[] | undefined): Array<T & { url: string }> =>
      (arr || []).map((item) => ({ ...item, url: `https://nhnent.dooray.com/task/${projectId}/${item.taskId}` }))

    const final: import('../../shared/types/ai-recommend').AIRecommendResult = {
      summary: parsed.summary || '분석 완료',
      analyzedCount: parsed.analyzedCount || 0,
      immediate: attachUrl(parsed.immediate),
      reference: attachUrl(parsed.reference),
      covered: attachUrl(parsed.covered).map((i) => ({ ...i, coveredBy: (i as { coveredBy?: string }).coveredBy })),
      analyzedAt: Date.now(),
      costUsd: result.total_cost_usd
    }

    this.saveAIRecommendation(final)
    this.emitProgress(requestId, 'done', '완료', started)
    return final
  }

}
