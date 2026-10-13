import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'
import { randomUUID } from 'crypto'
import type { AddressInfo } from 'net'

export interface HookEventPayload {
  /** URL ?event= 쿼리. 우리가 정의한 이름. */
  event: string
  /** claude code가 보내는 stdin/body 의 cwd — 채널 폴더 식별에 사용 */
  cwd: string
  tool_name?: string
  tool_input?: Record<string, unknown>
  /** 전체 raw body */
  raw: Record<string, unknown>
}

/** 결정을 돌려줘야 하는 hook(PreToolUse) 처리기. signal 은 claude 가 요청을 끊으면(사용자가 PC 에서 중단) abort 된다. */
export type HookDecider = (ev: HookEventPayload, signal: AbortSignal) => Promise<Record<string, unknown> | null>

/** 결정을 기다려 응답하는 hook 이벤트 (URL ?event=) */
export const DECISION_EVENTS = new Set(['pre_tool_use'])

/**
 * loopback HTTP 서버 — claude code의 type:"http" hook 수신처.
 *
 *  - 127.0.0.1 only, 동적 포트
 *  - random secret을 X-Clauday-Secret 헤더로 검증
 *  - body는 hook stdin과 동일한 JSON (claude code 명세)
 *  - 알림성 이벤트는 즉시 200 {} 로 닫고 비동기 처리
 *  - pre_tool_use 는 decider 의 결정을 기다려 응답 본문으로 돌려준다(위험 동작 두레이 승인, 기획 §5.2)
 */
export class HookServer {
  private server: Server | null = null
  private port = 0
  private secret = ''
  private handler: ((ev: HookEventPayload) => void | Promise<void>) | null = null
  private decider: HookDecider | null = null

  async start(): Promise<{ port: number; secret: string }> {
    if (this.server) return { port: this.port, secret: this.secret }
    this.secret = randomUUID()
    this.server = createServer((req, res) => { void this.handle(req, res) })
    await new Promise<void>((resolve, reject) => {
      const onErr = (err: Error): void => reject(err)
      this.server!.once('error', onErr)
      this.server!.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address() as AddressInfo
        this.port = addr.port
        this.server!.removeListener('error', onErr)
        resolve()
      })
    })
    console.log(`[HookServer] listening on 127.0.0.1:${this.port}`)
    return { port: this.port, secret: this.secret }
  }

  setHandler(h: (ev: HookEventPayload) => void | Promise<void>): void {
    this.handler = h
  }

  setDecider(d: HookDecider): void {
    this.decider = d
  }

  getPort(): number { return this.port }
  getSecret(): string { return this.secret }

  stop(): void {
    if (this.server) {
      this.server.close()
      this.server = null
    }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end()
      return
    }
    const got = req.headers['x-clauday-secret']
    if (got !== this.secret) {
      res.statusCode = 401
      res.end()
      return
    }
    const url = new URL(req.url || '/', `http://127.0.0.1:${this.port}`)
    const event = url.searchParams.get('event') || ''

    let body = ''
    req.setEncoding('utf8')
    for await (const chunk of req) body += chunk
    let parsed: Record<string, unknown> = {}
    if (body) {
      try { parsed = JSON.parse(body) as Record<string, unknown> } catch { /* ignore */ }
    }

    const payload: HookEventPayload = {
      event,
      cwd: typeof parsed.cwd === 'string' ? parsed.cwd : '',
      tool_name: typeof parsed.tool_name === 'string' ? parsed.tool_name : undefined,
      tool_input: parsed.tool_input as Record<string, unknown> | undefined,
      raw: parsed
    }

    if (DECISION_EVENTS.has(event) && this.decider) {
      await this.respondWithDecision(res, payload)
      return
    }

    // 응답을 먼저 닫아 claude code 측 hook이 빨리 끝나게 (우리 처리는 비동기)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end('{}')

    if (this.handler) {
      try { await this.handler(payload) }
      catch (err) { console.error('[HookServer] handler 에러:', err) }
    }
  }

  private async respondWithDecision(res: ServerResponse, payload: HookEventPayload): Promise<void> {
    const controller = new AbortController()
    // claude 가 도구 호출을 거두면 이 요청이 끊긴다(S0 실측) — 응답 전에 닫히면 대기를 접게 알린다.
    res.on('close', () => { if (!res.writableEnded) controller.abort() })
    let body: Record<string, unknown> | null = null
    try {
      body = await this.decider!(payload, controller.signal)
    } catch (err) {
      console.error(`[HookServer] decider 에러 event=${payload.event}:`, err)
    }
    if (controller.signal.aborted || res.writableEnded) return
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body ?? {}))
  }
}
