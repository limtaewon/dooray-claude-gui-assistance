import { spawn, type ChildProcess } from 'child_process'
import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/types/ipc'
import type { ClaudeChatEvent, ClaudeChatSendRequest } from '../../shared/types/claude-chat'

/**
 * Claude Code 대화형 세션 실행기.
 * `claude -p <prompt> --output-format stream-json`을 spawn 하여
 * stream-json 이벤트를 파싱 후 renderer 로 전달한다.
 *
 * 한 chatId 당 최대 1개의 실행 중 프로세스를 유지.
 */
export class ClaudeChatService {
  private claudeBin: string
  private active: Map<string, ChildProcess> = new Map()

  constructor(claudeBin: string) {
    this.claudeBin = claudeBin
  }

  /** 실행. onDone 콜백은 session_id 회수용 */
  send(req: ClaudeChatSendRequest): { sessionIdPromise: Promise<string | undefined> } {
    const { chatId, prompt, sessionId, cwd } = req

    // 기존 실행 중인 프로세스 종료
    this.cancel(chatId)

    const args: string[] = ['-p', prompt, '--output-format', 'stream-json', '--include-partial-messages', '--verbose']
    if (sessionId) { args.push('--resume', sessionId) }

    let resolveSession: (id: string | undefined) => void = () => {}
    const sessionIdPromise = new Promise<string | undefined>((res) => { resolveSession = res })

    const proc = spawn(this.claudeBin, args, { cwd: cwd || process.cwd(), env: process.env })
    this.active.set(chatId, proc)

    let buffer = ''
    let lastTextMsgId = ''
    let stderrBuf = ''

    proc.stdout.on('data', (data: Buffer) => {
      buffer += data.toString('utf-8')
      let idx: number
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.substring(0, idx).trim()
        buffer = buffer.substring(idx + 1)
        if (!line) continue
        try {
          const obj = JSON.parse(line) as Record<string, unknown>
          this.handleJsonLine(chatId, obj, {
            setLastTextMsgId: (id) => { lastTextMsgId = id },
            getLastTextMsgId: () => lastTextMsgId
          })
        } catch {
          // non-JSON 라인 무시
        }
      }
    })

    proc.stderr.on('data', (d: Buffer) => { stderrBuf += d.toString('utf-8') })

    proc.on('error', (err) => {
      this.emit({ type: 'error', chatId, message: err.message })
      this.active.delete(chatId)
      resolveSession(undefined)
    })

    proc.on('close', (code) => {
      if (code !== 0 && !this.hasResultBeenSent.get(chatId)) {
        this.emit({ type: 'error', chatId, message: stderrBuf.trim() || `claude 종료 코드 ${code}` })
      }
      this.active.delete(chatId)
      this.hasResultBeenSent.delete(chatId)
      resolveSession(this.sessionIdByChat.get(chatId))
    })

    return { sessionIdPromise }
  }

  cancel(chatId: string): void {
    const proc = this.active.get(chatId)
    if (proc && !proc.killed) {
      try { proc.kill() } catch {}
    }
    this.active.delete(chatId)
  }

  private hasResultBeenSent = new Map<string, boolean>()
  private sessionIdByChat = new Map<string, string>()

  private handleJsonLine(
    chatId: string,
    obj: Record<string, unknown>,
    ctx: { setLastTextMsgId: (id: string) => void; getLastTextMsgId: () => string }
  ): void {
    const type = obj.type as string | undefined

    if (type === 'stream_event') {
      const ev = obj.event as Record<string, unknown> | undefined
      if (ev?.type === 'content_block_delta') {
        const delta = ev.delta as Record<string, unknown> | undefined
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          const msgId = ctx.getLastTextMsgId() || `msg-${Date.now()}`
          if (!ctx.getLastTextMsgId()) ctx.setLastTextMsgId(msgId)
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
            // 텍스트 블록 시작 — 다음 delta 들은 이 msgId 로
            ctx.setLastTextMsgId(msgId)
          }
        }
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
      if (sid) this.sessionIdByChat.set(chatId, sid)
      this.hasResultBeenSent.set(chatId, true)
      this.emit({
        type: 'result',
        chatId,
        sessionId: sid || '',
        durationMs: (obj.duration_ms as number) || 0,
        costUsd: (obj.total_cost_usd as number) || 0,
        isError: (obj.is_error as boolean) || false
      })
    }
  }

  private emit(ev: ClaudeChatEvent): void {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win || win.isDestroyed()) return
    win.webContents.send(IPC_CHANNELS.CLAUDE_CHAT_EVENT, ev)
  }
}
