import { execFile, execFileSync, spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
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

  // 이미 PATH에 있으면 그대로
  try {
    execFileSync('claude', ['--version'], { timeout: 3000, stdio: 'ignore' })
    return 'claude'
  } catch {}

  // 일반적인 설치 경로 탐색
  const home = homedir()
  const candidates = [
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

  // 로그인 쉘에서 which로 탐색
  try {
    const shell = process.env.SHELL || '/bin/zsh'
    const result = execFileSync(shell, ['-l', '-c', 'which claude'], { timeout: 5000 }).toString().trim()
    if (result && existsSync(result)) return result
  } catch {}

  return 'claude' // 최후의 폴백
}

const CLAUDE_CLI = resolveClaudePath()

function buildArgs(prompt: string, opts: {
  model?: string
  systemPrompt?: string
  maxBudget?: string
  effort?: string
  allowMcp?: boolean
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
  // MCP 도구 허용 (dooray-mcp, clickhouse 등)
  if (opts.allowMcp) {
    args.push('--allowedTools', 'mcp__dooray-mcp__*,mcp__mcp-clickhouse__*,mcp__mysql-nfi__*')
  }
  return args
}

/** 패키징 앱에서도 동작하도록 PATH 보강 + OMC/플러그인 훅 비활성화 (속도 최적화) */
function enrichedEnv(): Record<string, string> {
  const home = homedir()
  const extraPaths = [
    join(home, '.claude', 'local'),
    join(home, '.claude', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
    join(home, '.local', 'bin'),
    join(home, '.npm-global', 'bin')
  ]
  const currentPath = process.env.PATH || '/usr/bin:/bin'
  return {
    ...(process.env as Record<string, string>),
    PATH: [...extraPaths, currentPath].join(':'),
    // OMC ultrawork 세션 복원 훅 비활성화 (매번 75k 토큰 로드 방지)
    DISABLE_OMC: '1',
    // Claude Code 간소화 모드
    CLAUDE_CODE_SIMPLE: '1'
  }
}

export class AIService {
  private mainWindow: BrowserWindow | null = null
  private modelConfig: AIModelConfig = {}

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
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
            reject(new Error(`Claude CLI 오류: ${error.message}`))
            return
          }
          try {
            const result = JSON.parse(stdout) as ClaudeCliResult
            if (result.is_error) {
              reject(new Error(`AI 응답 오류: ${result.result}`))
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
        reject(new Error(`Claude CLI 오류: ${err.message}`))
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
          reject(new Error(stderrBuf || `Claude CLI 종료 코드 ${code}`))
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

    const args = buildArgs(prompt, {
      model,
      systemPrompt: opts?.systemPrompt,
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
    skills?: Array<{ name: string; content: string }>,
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
      project: t.projectCode, dueDate: t.dueDateAt, created: t.createdAt
    }))

    const eventData = events.map((e) => ({
      subject: e.subject, start: e.startAt, end: e.endAt, location: e.location
    }))

    const skillBlock = skills && skills.length > 0
      ? `\n\n[적용된 AI 스킬]\n${skills.map((s) => `### ${s.name}\n${s.content}`).join('\n\n')}`
      : ''

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
${JSON.stringify(eventData)}${skillBlock}`

    const args = buildArgs(prompt, {
      model: this.pickModel('briefing', 'sonnet'),
      systemPrompt: BRIEFING_SYSTEM_PROMPT,
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

    try {
      const jsonMatch = result.result.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const briefing = JSON.parse(jsonMatch[0]) as AIBriefing
        this.emitProgress(requestId, 'done', '완료', started)
        return briefing
      }
    } catch { /* fallback */ }

    this.emitProgress(requestId, 'done', '완료', started)
    return {
      greeting: '오늘도 좋은 하루 보내세요!',
      urgent: [], focus: [], mentioned: [], stale: [], todayEvents: [],
      recommendations: ['태스크 목록을 확인해보세요.']
    }
  }

  async summarizeTask(task: DoorayTask, taskBody?: string, requestId?: string): Promise<string> {
    const prompt = `태스크: ${task.subject}\n상태: ${task.workflowClass}\n프로젝트: ${task.projectCode || '알 수 없음'}\n마감: ${task.dueDateAt || '없음'}\n\n${taskBody ? '본문:\n' + taskBody.substring(0, 3000) : '(본문 없음)'}\n\n핵심 목표, 현재 상태, 다음 액션을 3줄 이내로 요약.`

    const result = await this.runWithProgress(requestId, '태스크 요약 중...', buildArgs(prompt, {
      model: this.pickModel('summarizeTask', 'haiku'),
      systemPrompt: '두레이 태스크를 간결하게 분석하는 AI. 한국어로 3줄 이내 요약.',
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
    const done = tasks.filter((t) => t.workflowClass === 'done')
    const working = tasks.filter((t) => t.workflowClass === 'working')
    const registered = tasks.filter((t) => t.workflowClass === 'registered')

    const prompt = `${period} 업무 보고서를 마크다운으로 작성.\n오늘: ${today}\n\n완료(${done.length}개):\n${done.slice(0, 20).map((t) => `- [${t.projectCode}] ${t.subject}`).join('\n') || '없음'}\n\n진행중(${working.length}개):\n${working.slice(0, 20).map((t) => `- [${t.projectCode}] ${t.subject}`).join('\n') || '없음'}\n\n예정(${registered.length}개):\n${registered.slice(0, 10).map((t) => `- [${t.projectCode}] ${t.subject}`).join('\n') || '없음'}\n\n일정(${events.length}개):\n${events.slice(0, 10).map((e) => `- ${e.subject} (${e.startAt})`).join('\n') || '없음'}`

    const args = buildArgs(prompt, {
      model: this.pickModel('report', 'sonnet'),
      systemPrompt: '업무 보고서 전문 작성 AI. 간결하고 명확한 마크다운 보고서를 생성합니다. 한국어로 작성.',
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
      systemPrompt: `위키 문서 교정 전문가. 규칙:
- 맞춤법, 문법, 띄어쓰기 교정
- 기술 용어는 원래대로 유지 (코드, 명령어, 경로 등)
- 마크다운 형식 완벽 유지 (헤딩, 리스트, 코드블록, 테이블 등)
- HTML 태그(<br>, <table> 등)도 그대로 유지
- 교정된 전체 문서를 마크다운으로 출력 (설명 없이 결과만)`,
      maxBudget: '1'
    }))
    return result.result
  }

  async wikiImprove(title: string, content: string, requestId?: string): Promise<string> {
    const result = await this.runWithProgress(requestId, '위키 개선 중...', buildArgs(
      `다음 두레이 위키 문서를 개선하세요.\n\n제목: ${title}\n\n---\n${content.substring(0, 8000)}`, {
      model: this.pickModel('wikiImprove', 'opus'),
      systemPrompt: `위키 문서 개선 전문가. 규칙:
- 가독성 향상: 긴 문단을 나누고, 핵심을 먼저 배치
- 구조 개선: 적절한 헤딩 레벨, 목록 활용, 코드블록 정리
- 내용은 변경하지 않되 표현을 더 명확하게
- 불필요한 반복 제거
- 마크다운 형식으로 개선된 전체 문서 출력 (설명 없이 결과만)
- HTML 태그(<br>, <table> 등)도 유지`,
      maxBudget: '1'
    }))
    return result.result
  }

  async generateWikiDraft(taskSubject: string, taskBody?: string, projectCode?: string, requestId?: string): Promise<string> {
    const prompt = `완료 태스크 기반 위키 문서 초안을 마크다운으로 작성.\n프로젝트: ${projectCode || '알 수 없음'}\n태스크: ${taskSubject}\n${taskBody ? '\n본문:\n' + taskBody.substring(0, 3000) : ''}\n\n## 개요\n## 변경 내용\n## 영향 범위\n## 참고 사항`

    const result = await this.runWithProgress(requestId, '위키 초안 작성 중...', buildArgs(prompt, {
      model: this.pickModel('wikiDraft', 'sonnet'),
      systemPrompt: '두레이 위키 문서 전문 작성 AI. 개발 문서를 구조화된 마크다운으로 작성합니다.',
      maxBudget: '0.2'
    }))
    return result.result
  }

  async generateSkill(request: string, target: string, requestId?: string): Promise<{ name: string; description: string; content: string }> {
    const prompt = `사용자가 요청한 AI 스킬을 생성하세요.

적용 대상: ${target}
사용자 요청: ${request}

반드시 아래 JSON만 응답하세요:
{
  "name": "스킬 이름 (짧고 명확하게)",
  "description": "한줄 설명",
  "content": "## 규칙\\n- 구체적인 조건과 동작\\n\\n## 출력 형식\\n- AI가 결과를 어떤 형태로 보여줄지"
}`

    const result = await this.runWithProgress(requestId, '스킬 생성 중...', buildArgs(prompt, {
      model: this.pickModel('generateSkill', 'sonnet'),
      systemPrompt: `두레이(Dooray) 업무 관리 AI 스킬 생성 전문가. 사용자의 요구사항을 분석하여 구체적이고 실행 가능한 스킬 규칙을 마크다운으로 작성합니다.

스킬 규칙 작성 지침:
- 두레이 태스크의 workflowClass: backlog, registered, working, closed
- 태스크 필드: subject, workflowClass, workflow.name, tags, milestone, priority, dueDateAt, createdAt
- 캘린더 필드: subject, startedAt, endedAt, location, wholeDayFlag
- 프로젝트별로 다른 워크플로우 이름이 있을 수 있음
- 마일스톤은 "26년 15주차" 같은 형식
- 구체적인 조건, 비교 로직, 출력 형식을 명확하게 작성`,
      maxBudget: '0.3'
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
      systemPrompt: '회의록 템플릿 생성 AI. 구조화된 회의록을 작성합니다.',
      maxBudget: '0.1'
    }))
    return result.result
  }
}
