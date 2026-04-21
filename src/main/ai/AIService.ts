import { execFile, execFileSync, spawn } from 'child_process'
import { existsSync } from 'fs'
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
3. 이번 주 캘린더 일정

분석 관점:
- 긴급: 마감 임박, 오류/실패 키워드, 오래 방치된 working 태스크
- 오늘 집중: working 상태이거나 오늘 마감인 담당 태스크
- 멘션됨: CC 태스크 중 내가 확인/대응해야 할 것 (진행중/등록 상태만)
- 착수 필요: registered 상태로 3일 이상 된 담당 태스크
- 오늘 일정: 캘린더 이벤트
- AI 추천: 위 분석에서 도출되는 행동 제안 (우선순위, 리스크, 놓치기 쉬운 것)

반드시 아래 JSON 형식으로만 응답하세요:
{
  "greeting": "상황을 요약한 한줄 (예: 목요일 아침, 배치 알림이 쏟아지고 있습니다)",
  "urgent": [{"taskId": "...", "subject": "...", "reason": "구체적 이유"}],
  "focus": [{"taskId": "...", "subject": "...", "reason": "구체적 이유"}],
  "mentioned": [{"taskId": "...", "subject": "...", "reason": "왜 내가 알아야 하는지"}],
  "stale": [{"taskId": "...", "subject": "...", "daysSinceCreated": 3}],
  "todayEvents": [{"subject": "...", "time": "14:00-15:00"}],
  "recommendations": ["구체적 행동 제안 1", "구체적 행동 제안 2", "구체적 행동 제안 3"]
}`

/** 패키징된 앱에서도 claude CLI를 찾을 수 있도록 PATH 보강 */
function resolveClaudePath(): string {
  // 환경변수로 직접 지정된 경우
  if (process.env.CLAUDE_CLI_PATH) return process.env.CLAUDE_CLI_PATH

  const isWindows = process.platform === 'win32'
  const home = homedir()

  // 이미 PATH에 있으면 그대로
  try {
    execFileSync(isWindows ? 'claude.cmd' : 'claude', ['--version'], { timeout: 3000, stdio: 'ignore', shell: isWindows })
    return isWindows ? 'claude.cmd' : 'claude'
  } catch {}
  if (isWindows) {
    try {
      execFileSync('claude', ['--version'], { timeout: 3000, stdio: 'ignore', shell: true })
      return 'claude'
    } catch {}
  }

  // 플랫폼별 일반적인 설치 경로 탐색
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

  // 셸에서 탐색
  if (isWindows) {
    try {
      const result = execFileSync('where', ['claude'], { timeout: 5000 }).toString().trim().split('\n')[0].trim()
      if (result && existsSync(result)) return result
    } catch {}
  } else {
    try {
      const shell = process.env.SHELL || '/bin/zsh'
      const result = execFileSync(shell, ['-l', '-c', 'which claude'], { timeout: 5000 }).toString().trim()
      if (result && existsSync(result)) return result
    } catch {}
  }

  return 'claude' // 최후의 폴백
}

const CLAUDE_CLI = resolveClaudePath()

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
}): string[] {
  const args = [
    '-p', prompt,
    '--output-format', 'json',
    '--model', opts.model || 'sonnet',
    '--no-session-persistence',
    '--effort', opts.effort || 'low'
  ]
  if (opts.systemPrompt) args.push('--append-system-prompt', opts.systemPrompt)
  if (opts.maxBudget) args.push('--max-budget-usd', opts.maxBudget)
  // 사용자가 선택한 MCP 서버만 허용
  if (opts.mcpServers && opts.mcpServers.length > 0) {
    const patterns = opts.mcpServers.map((name) => `mcp__${name}__*`).join(',')
    args.push('--allowedTools', patterns)
  } else if (opts.allowMcp) {
    // 레거시 호환: allowMcp:true일 때는 기본 몇 개 허용
    args.push('--allowedTools', 'mcp__dooray-mcp__*,mcp__mcp-clickhouse__*,mcp__mysql-nfi__*')
  }
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
          env: enrichedEnv()
        },
        (error, stdout, stderr) => {
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
    onChunk: (text: string) => void
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

      const proc = spawn(CLAUDE_CLI, cleaned, { env: enrichedEnv() })
      let buffer = ''
      let finalResult: ClaudeCliResult | null = null
      let accumulated = ''
      let stderrBuf = ''

      const timeout = setTimeout(() => {
        proc.kill()
        reject(new Error('Claude CLI 타임아웃 (120초)'))
      }, 120000)

      proc.stdout.on('data', (data: Buffer) => {
        buffer += data.toString('utf-8')
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

            // assistant 메시지 (전체 블록 완료 시)
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
                }
              }
            }
          } catch {
            // non-JSON 라인 무시
          }
        }
      })

      proc.stderr.on('data', (data: Buffer) => {
        stderrBuf += data.toString('utf-8')
      })

      proc.on('error', (err) => {
        clearTimeout(timeout)
        reject(wrapClaudeError(err.message, stderrBuf))
      })

      proc.on('close', (code) => {
        clearTimeout(timeout)
        if (finalResult) {
          if (!finalResult.result && accumulated) finalResult.result = accumulated
          resolve(finalResult)
        } else if (accumulated) {
          resolve({
            type: 'result',
            result: accumulated,
            duration_ms: 0,
            session_id: '',
            is_error: false,
            total_cost_usd: 0
          })
        } else {
          reject(wrapClaudeError(stderrBuf || `Claude CLI 종료 코드 ${code}`, stderrBuf))
        }
      })
    })
  }

  isAvailable(): boolean {
    try {
      execFileSync(CLAUDE_CLI, ['--version'], { timeout: 5000, env: enrichedEnv() })
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
    opts?: { systemPrompt?: string; model?: AIModelName; maxBudget?: string; requestId?: string; feature?: keyof AIModelConfig }
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
      meetingNote: 'calendar',
      calendarAnalysis: 'calendar',
      sessionSummary: 'insights',
      generateSkill: 'all',
      messengerCompose: 'messenger'
    }
    const target = feature ? FEATURE_TO_TARGET[feature] : undefined

    const baseSystem = opts?.systemPrompt || '당신은 유용한 한국어 AI 비서입니다.'
    const mergedSystem = target ? this.buildSystemPrompt(baseSystem, target) : baseSystem

    const args = buildArgs(prompt, {
      model,
      systemPrompt: mergedSystem,
      maxBudget: opts?.maxBudget || '0.3',
      allowMcp: false
    })

    const result = await this.runWithProgress(opts?.requestId, '✨ AI 응답 생성 중...', args)
    return result.result
  }

  /** 스트리밍 기반으로 AI 호출 + 진행상황 이벤트 발행 */
  private async runWithProgress(
    requestId: string | undefined,
    stageMessage: string,
    args: string[]
  ): Promise<ClaudeCliResult> {
    const started = Date.now()
    this.emitProgress(requestId, 'thinking', stageMessage, started)
    const result = await this.runClaudeStream(args, (chunk) => {
      this.emitProgress(requestId, 'streaming', stageMessage, started, chunk)
    })
    this.emitProgress(requestId, 'done', '완료', started)
    return result
  }

  async generateBriefing(
    tasks: DoorayTask[],
    events: DoorayCalendarEvent[],
    _skillsUnused?: Array<{ name: string; content: string }>, // deprecated: skillLoader 사용
    ccTasks?: DoorayTask[],
    dueTodayTasks?: DoorayTask[],
    requestId?: string
  ): Promise<AIBriefing> {
    const started = Date.now()
    this.emitProgress(requestId, 'collecting', '브리핑 데이터 준비 중...', started)

    const today = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    })

    const taskData = tasks.slice(0, 50).map((t) => ({
      id: t.id, subject: t.subject, status: t.workflowClass,
      workflowName: t.workflow?.name, project: t.projectCode,
      tags: t.tags?.map((tag) => tag.name).filter(Boolean),
      milestone: t.milestone?.name,
      dueDate: t.dueDateAt, created: t.createdAt
    }))

    const eventData = events.map((e) => ({
      subject: e.subject,
      start: e.startedAt || e.startAt,
      end: e.endedAt || e.endAt,
      location: e.location,
      allDay: e.wholeDayFlag
    }))

    const ccData = (ccTasks || []).slice(0, 30).map((t) => ({
      id: t.id, subject: t.subject, status: t.workflowClass,
      project: t.projectCode, created: t.createdAt
    }))

    const dueTodayData = (dueTodayTasks || []).map((t) => ({
      id: t.id, subject: t.subject, status: t.workflowClass, project: t.projectCode
    }))

    const prompt = `오늘: ${today}

[내 담당 태스크 ${taskData.length}개]
${JSON.stringify(taskData)}

[오늘 마감 태스크 ${dueTodayData.length}개]
${JSON.stringify(dueTodayData)}

[내가 참조/멘션된 태스크 ${ccData.length}개 (진행중/등록만)]
${JSON.stringify(ccData)}

[일정 ${eventData.length}개]
${JSON.stringify(eventData)}`

    const args = buildArgs(prompt, {
      model: this.pickModel('briefing', 'sonnet'),
      systemPrompt: this.buildSystemPrompt(BRIEFING_SYSTEM_PROMPT, 'briefing'),
      maxBudget: '0.3',
      allowMcp: false // 데이터가 이미 프롬프트에 있음, MCP 로딩 skip으로 속도 개선
    })

    this.emitProgress(requestId, 'thinking', `🤖 Claude (${this.pickModel('briefing', 'sonnet')}) 시작 중...`, started)
    let firstChunk = true
    const result = await this.runClaudeStream(args, (chunk) => {
      if (firstChunk) {
        this.emitProgress(requestId, 'streaming', '✨ 응답 생성 중...', started, chunk)
        firstChunk = false
      } else {
        this.emitProgress(requestId, 'streaming', '✨ 응답 생성 중...', started, chunk)
      }
    })
    this.emitProgress(requestId, 'parsing', '결과 정리 중...', started)

    // JSON 추출 — 마크다운 코드블록(```json ... ```) 처리 및 에러 명확화
    const raw = (result.result || '').trim()
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      this.emitProgress(requestId, 'done', '완료', started)
      throw new Error(`AI 응답에서 JSON을 찾지 못했습니다.\n\n응답: ${raw.substring(0, 400)}`)
    }
    try {
      const briefing = JSON.parse(jsonMatch[0]) as AIBriefing
      // 필수 배열 필드 기본값 보정 (일부 누락된 경우)
      const safe: AIBriefing = {
        greeting: briefing.greeting || '오늘도 좋은 하루 보내세요!',
        urgent: Array.isArray(briefing.urgent) ? briefing.urgent : [],
        focus: Array.isArray(briefing.focus) ? briefing.focus : [],
        mentioned: Array.isArray(briefing.mentioned) ? briefing.mentioned : [],
        stale: Array.isArray(briefing.stale) ? briefing.stale : [],
        todayEvents: Array.isArray(briefing.todayEvents) ? briefing.todayEvents : [],
        recommendations: Array.isArray(briefing.recommendations) ? briefing.recommendations : []
      }
      this.emitProgress(requestId, 'done', '완료', started)
      return safe
    } catch (err) {
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
    }))

    return result.result || '요약을 생성할 수 없습니다.'
  }

  async generateReport(
    type: 'daily' | 'weekly',
    tasks: DoorayTask[],
    events: DoorayCalendarEvent[],
    requestId?: string
  ): Promise<AIReport> {
    const started = Date.now()
    this.emitProgress(requestId, 'collecting', '업무 데이터 집계 중...', started)

    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
    const period = type === 'daily' ? '일일' : '주간'
    const done = tasks.filter((t) => t.workflowClass === 'closed')
    const working = tasks.filter((t) => t.workflowClass === 'working')
    const registered = tasks.filter((t) => t.workflowClass === 'registered')

    const prompt = `${period} 업무 보고서를 마크다운으로 작성.\n오늘: ${today}\n\n완료(${done.length}개):\n${done.slice(0, 20).map((t) => `- [${t.projectCode}] ${t.subject}`).join('\n') || '없음'}\n\n진행중(${working.length}개):\n${working.slice(0, 20).map((t) => `- [${t.projectCode}] ${t.subject}`).join('\n') || '없음'}\n\n예정(${registered.length}개):\n${registered.slice(0, 10).map((t) => `- [${t.projectCode}] ${t.subject}`).join('\n') || '없음'}\n\n일정(${events.length}개):\n${events.slice(0, 10).map((e) => `- ${e.subject} (${e.startAt})`).join('\n') || '없음'}`

    const args = buildArgs(prompt, {
      model: this.pickModel('report', 'sonnet'),
      systemPrompt: this.buildSystemPrompt('업무 보고서 전문 작성 AI. 간결하고 명확한 마크다운 보고서를 생성합니다. 한국어로 작성.', 'report'),
      maxBudget: '0.3'
    })

    this.emitProgress(requestId, 'thinking', `${period} 보고서 작성 중...`, started)
    const result = await this.runClaudeStream(args, (chunk) => {
      this.emitProgress(requestId, 'streaming', `${period} 보고서 작성 중...`, started, chunk)
    })
    this.emitProgress(requestId, 'done', '완료', started)

    return { title: `${period} 업무 보고서 - ${today}`, content: result.result, generatedAt: new Date().toISOString() }
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
    }))
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
    }))
    return result.result
  }

  /**
   * 메신저 메시지 정리/생성.
   * 사용자가 말한 내용을 두레이 메신저에 보낼 수 있도록 깔끔하게 정리.
   */
  async composeMessengerMessage(instruction: string, channelName?: string, requestId?: string): Promise<string> {
    const channelHint = channelName ? `\n대상 채널: ${channelName}` : ''
    const prompt = `다음 내용을 두레이 메신저로 보낼 메시지로 정리하세요.${channelHint}\n\n내용:\n${instruction}`

    const result = await this.runWithProgress(requestId, '메시지 작성 중...', buildArgs(prompt, {
      model: this.pickModel('messengerCompose', 'sonnet'),
      systemPrompt: this.buildSystemPrompt(`두레이 메신저 메시지 작성 전문가.

규칙:
- 메신저에 바로 붙여넣을 수 있는 자연스러운 메시지 본문만 출력 (설명/머리말 금지)
- 업무적 신뢰감을 주되 과하게 딱딱하지 않은 한국어
- 핵심을 먼저, 불필요한 수식어 제거
- 여러 건이면 번호나 불릿으로 정리
- 마크다운 일부 지원(**, \`code\`, 목록) — 과도한 마크업은 피함
- 메시지 길이는 보내려는 내용에 맞춰 간결하게`, 'messenger'),
      maxBudget: '0.2'
    }))
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
    }))

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
    }))
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

    const result = await this.runWithProgress(requestId, useMcp ? '스킬 생성 중 (MCP 조회 포함)...' : '스킬 생성 중...', buildArgs(prompt, {
      model: this.pickModel('generateSkill', 'sonnet'),
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
    }))

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

  async generateMeetingNote(eventSubject: string, eventDescription?: string, attendees?: string[], requestId?: string): Promise<string> {
    const prompt = `회의록 템플릿을 마크다운으로 생성.\n회의명: ${eventSubject}\n${eventDescription ? '설명: ' + eventDescription : ''}\n${attendees?.length ? '참석자: ' + attendees.join(', ') : ''}`

    const result = await this.runWithProgress(requestId, '회의록 생성 중...', buildArgs(prompt, {
      model: this.pickModel('meetingNote', 'haiku'),
      systemPrompt: this.buildSystemPrompt('회의록 템플릿 생성 AI. 구조화된 회의록을 작성합니다.', 'calendar'),
      maxBudget: '0.1'
    }))
    return result.result
  }
}
