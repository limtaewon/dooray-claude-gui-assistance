import { spawn, type ChildProcess } from 'child_process'
import { StringDecoder } from 'string_decoder'
import { decodeProcessText, isBenignStderr } from '../utils/procText'
import { BrowserWindow } from 'electron'
import { homedir } from 'os'
import { join, delimiter as pathDelimiter } from 'path'
import { IPC_CHANNELS } from '../../shared/types/ipc'
import type { ClaudeChatEvent, ClaudeChatSendRequest } from '../../shared/types/claude-chat'
import { claudeSpawnCommand } from '../utils/claudeBin'

/**
 * Electron 패키징 앱은 GUI 에서 실행되어 PATH 가 부족하다 (.zshrc/.bashrc 미실행).
 * claude CLI 내부 hook 과 MCP 서버는 node 를 호출하므로 PATH 에 nvm/homebrew 경로를 보강.
 *
 * Why extraPaths 를 **append** (뒤에 붙이기)?
 *   여러 머신에서 claude / node 가 다양한 위치에 설치되어 있어, prepend 하면 우리 추가
 *   경로의 구버전이 사용자 PATH 의 신버전을 가리는 문제가 발생. 사용자 PATH 가 우선이고
 *   부족할 때만 우리 fallback 이 메우게 한다.
 */
function enrichedClaudeEnv(): NodeJS.ProcessEnv {
  const home = homedir()
  const isWindows = process.platform === 'win32'
  const extraPaths = isWindows
    ? [
        join(home, '.claude', 'local'),
        join(home, '.claude', 'bin'),
        join(home, 'AppData', 'Roaming', 'npm'),
        join(home, 'AppData', 'Local', 'npm'),
      ]
    : [
        join(home, '.claude', 'local'),
        join(home, '.claude', 'bin'),
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/opt/homebrew/sbin',
        join(home, '.local', 'bin'),
        join(home, '.npm-global', 'bin'),
      ]
  const currentPath = process.env.PATH || (isWindows ? '' : '/usr/bin:/bin')
  return {
    ...process.env,
    PATH: [currentPath, ...extraPaths].join(pathDelimiter),
  }
}

interface ChatSession {
  proc: ChildProcess
  cwd: string
  /** stdout 버퍼 (개행 단위 파싱용) */
  buffer: string
  /** stdout 전용 디코더 — 세션(=프로세스)당 1개. chunk 경계에서 멀티바이트가 쪼개져도 깨지지 않게 경계를 보존한다. */
  stdoutDecoder: StringDecoder
  /** stderr 누적 (오류 메시지 표시용) — Windows cp949 mojibake 방지 위해 raw Buffer 로 누적, 사용 시점 디코드 */
  stderrChunks: Buffer[]
  lastTextMsgId: string
  sessionId?: string
  /** result 이벤트가 와서 응답 종료가 보고된 적 있는지 */
  hasResultBeenSent: boolean
}

/**
 * Claude Code 인터랙티브 세션 실행기.
 *
 * 동작 모델 (v1.3+):
 *   chatId 당 하나의 long-running `claude` 프로세스를 유지하고
 *   stdin/stdout 으로 stream-json 통신한다 (CLI 인터랙티브 모드와 동등한 효과).
 *
 *   spawn 1회:
 *     claude -p
 *       --input-format stream-json
 *       --output-format stream-json
 *       --include-partial-messages
 *       --include-hook-events
 *       --permission-mode bypassPermissions
 *       [--resume sessionId]
 *
 *   사용자 메시지: stdin 에 newline-terminated JSON
 *     {"type":"user","message":{"role":"user","content":[{"type":"text","text":"..."}]}}
 *
 *   응답: stdout 의 stream-json 이벤트 (assistant/user/stream_event/result/...)
 *
 * 이전 모델(매 prompt 새 프로세스 spawn)과 차이:
 *   - 프로세스 1개로 여러 turn 수행 → spawn 비용 ↓
 *   - 권한 prompt 자동 통과 (bypassPermissions) → 비개발자 UX 마찰 없음
 *   - skill / mcp / hook / sub-agent 가 인터랙티브 모드와 동일하게 활성
 */
export class ClaudeChatService {
  private claudeBin: string
  private sessions: Map<string, ChatSession> = new Map()

  constructor(claudeBin: string) {
    this.claudeBin = claudeBin
  }

  /** 메시지 전송. 활성 프로세스가 없으면 새로 spawn. */
  send(req: ClaudeChatSendRequest): { sessionIdPromise: Promise<string | undefined> } {
    const { chatId, prompt, sessionId, cwd } = req

    let session = this.sessions.get(chatId)
    // 프로세스가 죽었거나 cwd 가 바뀌었으면 재시작
    if (session && (session.proc.killed || session.proc.exitCode !== null || (cwd && session.cwd !== cwd))) {
      this.cancel(chatId)
      session = undefined
    }
    if (!session) {
      session = this.startSession(chatId, { cwd: cwd || process.cwd(), resumeSessionId: sessionId })
    }

    // 응답 종료 신호 초기화 (이번 turn 의 result 이벤트를 기다림)
    session.hasResultBeenSent = false
    session.lastTextMsgId = ''

    // user 메시지를 stdin 으로 전달
    const message = {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: prompt }]
      }
    }
    try {
      if (session.proc.stdin && !session.proc.stdin.destroyed) {
        session.proc.stdin.write(JSON.stringify(message) + '\n')
      }
    } catch (err) {
      this.emit({ type: 'error', chatId, message: `메시지 전송 실패: ${err instanceof Error ? err.message : String(err)}` })
    }

    // 호출 측은 sessionId 를 기다리는 promise 받기 — result 이벤트에서 채워줌
    const sessionIdPromise = new Promise<string | undefined>((resolve) => {
      // 이번 turn 의 result 가 올 때까지 짧은 polling
      const start = Date.now()
      const tick = (): void => {
        const s = this.sessions.get(chatId)
        if (!s) { resolve(undefined); return }
        if (s.hasResultBeenSent) { resolve(s.sessionId); return }
        if (Date.now() - start > 10 * 60 * 1000) { resolve(s.sessionId); return } // 10분 타임아웃
        setTimeout(tick, 200)
      }
      tick()
    })

    return { sessionIdPromise }
  }

  cancel(chatId: string): void {
    const session = this.sessions.get(chatId)
    if (!session) return
    try { session.proc.stdin?.end() } catch { /* ok */ }
    try { session.proc.kill('SIGTERM') } catch { /* ok */ }
    this.sessions.delete(chatId)
  }

  /** 모든 채팅 세션 종료 (앱 종료 시) */
  dispose(): void {
    for (const id of Array.from(this.sessions.keys())) this.cancel(id)
  }

  // ===== 내부: 세션 시작 / 메시지 처리 =====

  private startSession(
    chatId: string,
    opts: { cwd: string; resumeSessionId?: string }
  ): ChatSession {
    const args: string[] = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--include-hook-events',
      '--permission-mode', 'bypassPermissions',
      '--verbose'
    ]
    if (opts.resumeSessionId) {
      args.push('--resume', opts.resumeSessionId)
    }

    // command/shell/windowsVerbatimArguments 는 claudeSpawnCommand 단일 계약에서만 나온다
    // (ADR-v2-windows-fix-02 §2) — win32 공백 포함 경로 인용 포함.
    const { command, shell, windowsVerbatimArguments } = claudeSpawnCommand({ bin: this.claudeBin })
    const proc = spawn(command, args, {
      cwd: opts.cwd,
      env: enrichedClaudeEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell,
      windowsVerbatimArguments
    })

    const session: ChatSession = {
      proc,
      cwd: opts.cwd,
      buffer: '',
      // 세션(=프로세스)마다 하나 — 모듈 전역 공유 금지 (동시 실행 중인 다른 세션의 바이트가 섞인다).
      stdoutDecoder: new StringDecoder('utf8'),
      stderrChunks: [],
      lastTextMsgId: '',
      sessionId: opts.resumeSessionId,
      hasResultBeenSent: false
    }
    this.sessions.set(chatId, session)

    proc.stdout.on('data', (data: Buffer) => {
      session.buffer += session.stdoutDecoder.write(data)
      let idx: number
      while ((idx = session.buffer.indexOf('\n')) >= 0) {
        const line = session.buffer.substring(0, idx).trim()
        session.buffer = session.buffer.substring(idx + 1)
        if (!line) continue
        try {
          const obj = JSON.parse(line) as Record<string, unknown>
          this.handleJsonLine(chatId, obj)
        } catch {
          // non-JSON 라인 무시
        }
      }
    })

    proc.stderr.on('data', (d: Buffer) => {
      session.stderrChunks.push(d)
    })

    proc.on('error', (err) => {
      this.emit({ type: 'error', chatId, message: err.message })
      this.sessions.delete(chatId)
    })

    proc.on('close', (code) => {
      // 불완전한 멀티바이트 시퀀스로 close 시점까지 남아있던 잔여 — 버리되 조용히 버리지 않는다.
      const decoderTail = session.stdoutDecoder.end()
      if (decoderTail) {
        console.warn(`[ClaudeChatService] stdout 디코더 잔여 바이트 폐기 chatId=${chatId} len=${decoderTail.length}`)
      }
      // 정상 종료(0)가 아닌데 result 이벤트도 못 받았으면 사용자에게 에러 노출.
      // 단, stderr 가 전부 비치명(Warning, OMC 훅 실패 등)이면 false-fatal 방지를 위해 noop.
      if (code !== 0 && !session.hasResultBeenSent) {
        const stderrText = decodeProcessText(Buffer.concat(session.stderrChunks)).trim()
        if (!isBenignStderr(stderrText)) {
          this.emit({
            type: 'error',
            chatId,
            message: stderrText || `claude 종료 코드 ${code}`
          })
        }
      }
      this.sessions.delete(chatId)
    })

    return session
  }

  private handleJsonLine(chatId: string, obj: Record<string, unknown>): void {
    const session = this.sessions.get(chatId)
    if (!session) return

    const type = obj.type as string | undefined

    if (type === 'stream_event') {
      const ev = obj.event as Record<string, unknown> | undefined
      if (ev?.type === 'content_block_delta') {
        const delta = ev.delta as Record<string, unknown> | undefined
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          const msgId = session.lastTextMsgId || `msg-${Date.now()}`
          if (!session.lastTextMsgId) session.lastTextMsgId = msgId
          this.emit({ type: 'assistant_text', chatId, msgId, delta: delta.text })
        }
      }
      return
    }

    if (type === 'assistant') {
      const msg = obj.message as Record<string, unknown> | undefined
      const content = msg?.content as unknown[] | undefined
      const msgId = (msg?.id as string) || `msg-${Date.now()}`
      if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as Record<string, unknown>
          if (b.type === 'tool_use') {
            this.emit({
              type: 'tool_use',
              chatId,
              toolId: (b.id as string) || `tool-${Date.now()}`,
              name: (b.name as string) || 'tool',
              input: b.input
            })
          } else if (b.type === 'text') {
            session.lastTextMsgId = msgId
          }
        }
      }
      // 일부 stream-json 변종은 result 에 usage 가 없고 매 assistant 메시지에 동봉된다.
      // ctx 표시용으로 즉시 emit.
      const usage = msg?.usage as Record<string, unknown> | undefined
      if (usage) {
        const num = (k: string): number | undefined => {
          const v = usage[k]
          return typeof v === 'number' ? v : undefined
        }
        this.emit({
          type: 'usage',
          chatId,
          inputTokens: num('input_tokens'),
          cacheReadTokens: num('cache_read_input_tokens'),
          cacheCreationTokens: num('cache_creation_input_tokens'),
          outputTokens: num('output_tokens')
        })
      }
      return
    }

    if (type === 'user') {
      const msg = obj.message as Record<string, unknown> | undefined
      const content = msg?.content as unknown[] | undefined
      if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as Record<string, unknown>
          if (b.type === 'tool_result') {
            const rawContent = b.content
            const contentStr = typeof rawContent === 'string'
              ? rawContent
              : Array.isArray(rawContent)
                ? rawContent.map((c) => {
                    const cc = c as Record<string, unknown>
                    return typeof cc.text === 'string' ? cc.text : JSON.stringify(cc)
                  }).join('\n')
                : JSON.stringify(rawContent)
            this.emit({
              type: 'tool_result',
              chatId,
              toolId: (b.tool_use_id as string) || '',
              content: contentStr.slice(0, 2000),
              isError: b.is_error === true
            })
          }
        }
      }
      return
    }

    if (type === 'result') {
      const sid = obj.session_id as string | undefined
      if (sid) session.sessionId = sid
      session.hasResultBeenSent = true
      // result 이벤트에 usage 가 동봉되거나, 또는 obj.message?.usage 형태로 들어올 수도 있다.
      // claude code 의 stream-json 응답 변종을 모두 대응.
      const usageRaw =
        ((obj.usage as Record<string, unknown> | undefined) ||
          ((obj.message as Record<string, unknown> | undefined)?.usage as Record<string, unknown> | undefined)) || {}
      const num = (k: string): number | undefined => {
        const v = usageRaw[k]
        return typeof v === 'number' ? v : undefined
      }
      this.emit({
        type: 'result',
        chatId,
        sessionId: sid || '',
        durationMs: (obj.duration_ms as number) || 0,
        costUsd: (obj.total_cost_usd as number) || 0,
        isError: (obj.is_error as boolean) || false,
        inputTokens: num('input_tokens'),
        cacheReadTokens: num('cache_read_input_tokens'),
        cacheCreationTokens: num('cache_creation_input_tokens'),
        outputTokens: num('output_tokens')
      })
      // 응답 turn 종료. 다음 user 메시지를 받을 준비. 프로세스는 유지.
    }
  }

  private emit(ev: ClaudeChatEvent): void {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win || win.isDestroyed()) return
    win.webContents.send(IPC_CHANNELS.CLAUDE_CHAT_EVENT, ev)
  }
}
