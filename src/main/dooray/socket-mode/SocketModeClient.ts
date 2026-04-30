import WebSocket, { type RawData } from 'ws'
import { net } from 'electron'
import { EventEmitter } from 'events'
import {
  type SocketModeTokenInfo,
  type SocketModeEvent,
  type RawSocketMessage,
  type ConnectionState,
  SESSION_LIMIT_CLOSE_CODE,
  SESSION_LIMIT_CLOSE_REASON,
  STANDBY_RETRY_INTERVAL_MS,
  PING_INTERVAL_MS,
  WS_PATH,
  SOCKET_MODE_TOKEN_PATH
} from './types'

interface ClientOptions {
  /** Open API 토큰 (`Authorization: dooray-api {token}`). 일반 dooray-api 토큰과 동일한 형식. */
  botToken: string
  /** 두레이 도메인 (예: `nhnent.dooray.com`). 토큰 발급/WebSocket host에 사용. */
  domain: string
  /** API base URL (기본: https://api.dooray.com). 토큰 발급용. */
  apiBaseUrl?: string
  /** 메신저 외 추가 서비스도 받을지 (기본: messenger만) */
  services?: string[]
}

/**
 * 두레이 Socket Mode WebSocket 클라이언트.
 * Python SDK의 SocketModeClient(aiohttp)를 Node.js로 옮긴 구현.
 *
 * 흐름:
 *   1) `connect()` → 토큰 발급(`POST /common/v1/socket-mode/tokens`) → WS 핸드셰이크
 *   2) 서버가 `sessionInfo` 메시지 보내면 ACTIVE 진입
 *   3) 30초 ping, 들어오는 message/task/page 이벤트는 'event' emit
 *   4) close(1008, AGENT_ALREADY_CONNECTED) → STANDBY 15초 후 재시도
 *   5) 핸드셰이크 401 → 토큰 재발급 후 1회 재시도
 *
 * 이벤트:
 *   - 'state' (newState: ConnectionState)
 *   - 'event' (event: SocketModeEvent)
 *   - 'error' (err: Error)
 */
export class SocketModeClient extends EventEmitter {
  private opts: Required<Omit<ClientOptions, 'apiBaseUrl' | 'services'>> & {
    apiBaseUrl: string
    services: string[]
  }

  private ws: WebSocket | null = null
  private pingTimer: NodeJS.Timeout | null = null
  private standbyTimer: NodeJS.Timeout | null = null
  private state: ConnectionState = 'DISCONNECTED'
  private tokenInfo: SocketModeTokenInfo | null = null

  private shouldReconnect = false
  private inStandbyLoop = false
  private lastCloseCode: number | null = null
  private lastCloseReason: string | null = null

  constructor(options: ClientOptions) {
    super()
    if (!options.botToken) throw new Error('SocketModeClient: botToken 필요')
    if (!options.domain) throw new Error('SocketModeClient: domain 필요')
    this.opts = {
      botToken: options.botToken,
      domain: stripScheme(options.domain),
      apiBaseUrl: options.apiBaseUrl || 'https://api.dooray.com',
      services: options.services || ['messenger']
    }
  }

  getState(): ConnectionState {
    return this.state
  }

  /** 시작. 백그라운드로 연결 유지 루프 진입. */
  async connect(): Promise<void> {
    if (this.shouldReconnect) {
      console.warn('[SocketMode] 이미 connect() 호출됨')
      return
    }
    this.shouldReconnect = true
    await this.runOnce()
  }

  /** 정상 종료. 재연결 루프도 멈춤. */
  async disconnect(): Promise<void> {
    this.shouldReconnect = false
    this.setState('DISCONNECTED')
    this.clearTimers()
    if (this.ws) {
      try { this.ws.close(1000, 'client_disconnect') } catch { /* ok */ }
      this.ws = null
    }
  }

  // ===== 내부: 연결/재연결 루프 =====

  private async runOnce(): Promise<void> {
    while (this.shouldReconnect) {
      this.lastCloseCode = null
      this.lastCloseReason = null
      try {
        this.setState('CONNECTING')
        if (!this.tokenInfo) await this.fetchSocketModeToken()
        await this.openWebSocket()
        // openWebSocket 내부에서 close 콜백 발생 시 루프가 다시 돌아옴.
        // 여기서는 close될 때까지 기다리는 게 아니라, ws 이벤트가 다음 iteration을
        // 트리거하도록 await를 거는 형태. openWebSocket이 즉시 resolve하면
        // close 발생까지 대기를 위해 별도 promise.
        await this.awaitClose()
      } catch (err) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)))
      }

      this.clearTimers()
      this.ws = null

      if (!this.shouldReconnect) break

      if (this.isSessionLimitClose()) {
        await this.handleStandby()
        continue
      }

      // 일반 close/오류면 그대로 종료 (외부에서 재기동 결정)
      console.log(
        `[SocketMode] 연결 종료 (code=${this.lastCloseCode}, reason=${this.lastCloseReason}) — 재시도 안 함`
      )
      this.setState('DISCONNECTED')
      this.shouldReconnect = false
      break
    }
  }

  private awaitClose(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.ws) { resolve(); return }
      const ws = this.ws
      const onClose = (): void => {
        ws.removeListener('close', onClose)
        ws.removeListener('error', onClose)
        resolve()
      }
      ws.on('close', onClose)
      ws.on('error', onClose)
    })
  }

  // ===== 내부: 토큰 발급 =====

  /**
   * `POST /common/v1/socket-mode/tokens` 호출 → accessToken/tenantId/memberId 획득.
   * Electron의 net.request 사용 (DoorayClient와 동일한 인증 패턴).
   */
  private fetchSocketModeToken(): Promise<void> {
    const url = `${this.opts.apiBaseUrl}${SOCKET_MODE_TOKEN_PATH}`
    return new Promise<void>((resolve, reject) => {
      const req = net.request({
        method: 'POST',
        url,
        redirect: 'follow',
        useSessionCookies: false
      })
      req.setHeader('Authorization', `dooray-api ${this.opts.botToken}`)
      req.setHeader('Content-Type', 'application/json')
      req.setHeader('Accept', 'application/json')

      let body = ''
      req.on('response', (res) => {
        const code = res.statusCode!
        res.on('data', (chunk: Buffer) => { body += chunk.toString() })
        res.on('end', () => {
          if (code >= 400) {
            reject(new Error(`Socket Mode 토큰 발급 실패 (${code}): ${body.slice(0, 200)}`))
            return
          }
          try {
            const parsed = JSON.parse(body) as { result?: SocketModeTokenInfo }
            const r = parsed.result
            if (!r?.accessToken || !r?.tenantId || !r?.organizationMemberId) {
              reject(new Error(`Socket Mode 토큰 응답 형식 오류: ${body.slice(0, 200)}`))
              return
            }
            this.tokenInfo = r
            console.log(
              `[SocketMode] 토큰 발급 OK tenantId=${r.tenantId} memberId=${r.organizationMemberId}`
            )
            resolve()
          } catch (err) {
            reject(new Error(`토큰 응답 파싱 실패: ${err instanceof Error ? err.message : String(err)}`))
          }
        })
      })
      req.on('error', (err) => reject(err))
      // 빈 body POST
      req.write('')
      req.end()
    })
  }

  // ===== 내부: WebSocket 연결 =====

  private async openWebSocket(): Promise<void> {
    if (!this.tokenInfo) throw new Error('tokenInfo 없음 (fetchSocketModeToken 선행 필요)')

    const wsUrl = `wss://${this.opts.domain}${WS_PATH}/${this.tokenInfo.tenantId}/${this.tokenInfo.organizationMemberId}`
    console.log(`[SocketMode] connecting ${wsUrl}`)

    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${this.tokenInfo.accessToken}`
        }
      })
    } catch (err) {
      throw new Error(`WebSocket 생성 실패: ${err instanceof Error ? err.message : err}`)
    }
    this.ws = ws

    ws.on('open', () => {
      console.log('[SocketMode] WS handshake OK — sessionInfo 대기')
      this.startPing()
    })

    ws.on('message', (data: RawData) => {
      const text = data.toString()
      this.handleRawMessage(text)
    })

    ws.on('close', (code, reasonBuf) => {
      this.lastCloseCode = code
      this.lastCloseReason = reasonBuf?.toString() || null
      console.log(
        `[SocketMode] close code=${code} reason=${this.lastCloseReason}`
      )
      this.clearTimers()
    })

    ws.on('unexpected-response', (_req, res) => {
      // 401 등 핸드셰이크 거부 → 토큰 재발급 후 한 번 재시도
      const status = res.statusCode
      console.warn(`[SocketMode] handshake 거부 status=${status}`)
      if (status === 401) {
        console.log('[SocketMode] 401 — 토큰 재발급 후 재시도 예정')
        this.tokenInfo = null
        // close 이벤트가 뒤이어 발생하므로 루프가 자동 재진입
      }
    })

    ws.on('error', (err) => {
      console.error('[SocketMode] WS error:', err.message)
    })
  }

  private startPing(): void {
    this.clearPing()
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping' }))
        } catch (err) {
          console.warn('[SocketMode] ping 실패:', err)
        }
      }
    }, PING_INTERVAL_MS)
  }

  // ===== 내부: 메시지 처리 =====

  private handleRawMessage(text: string): void {
    let data: RawSocketMessage
    try {
      data = JSON.parse(text) as RawSocketMessage
    } catch (err) {
      console.warn('[SocketMode] JSON 파싱 실패:', text.slice(0, 200))
      return
    }

    const msgType = data.type || ''

    // sessionInfo = 서버 세션 수락 — ACTIVE 전이
    if (msgType === 'sessionInfo') {
      console.log('[SocketMode] sessionInfo 수신 → ACTIVE')
      this.setState('ACTIVE')
      this.inStandbyLoop = false
      return
    }

    // pong (ping에 대한 응답) 무시
    if (msgType === 'pong') return

    // 메신저 메시지 정규화
    const normalized = this.normalize(data)
    if (!normalized) return

    this.emit('event', normalized)
  }

  /**
   * raw → SocketModeEvent.
   * 채널 메시지로 간주할 수 있는 type을 'message'로 통일해서 emit.
   * - 'message' (Python SDK 정규화 후 type)
   * - 'channelLog' / 'channel-log' (raw 형태로 올 수도 있는 후보)
   * - content.text가 있으면 메시지로 간주
   *
   * 그 외 read seq/presence 같은 메타 이벤트는 service/type 그대로 통과.
   */
  private normalize(data: RawSocketMessage): SocketModeEvent | null {
    const service = data.service || 'messenger'
    const rawType = data.type || ''
    const action = data.action || ''
    const content = (data.content || data.payload || {}) as Record<string, unknown>

    // 우리가 등록한 services 외엔 무시
    if (!this.opts.services.includes(service)) return null

    // 시스템 메시지 (messenger의 content.type=1)는 skip
    if (service === 'messenger' && content.type === 1) return null

    const channelId = (content.channelId as string) || data.channelId || undefined
    const text = typeof content.text === 'string' ? content.text : undefined

    // 채널 메시지로 보이는 type 화이트리스트 + 휴리스틱
    const messageLikeTypes = new Set([
      'message',
      'channelLog',
      'channel-log',
      'channelMessage',
      'channel-message'
    ])
    const looksLikeMessage =
      messageLikeTypes.has(rawType) ||
      (service === 'messenger' && !!text && !!channelId)

    if (looksLikeMessage) {
      // create/update만 메시지로 간주 (delete/read 등 메타는 제외)
      if (action && action !== 'create' && action !== 'update') return null
      return {
        envelopeId: data.envelope_id || '',
        type: 'message', // 정규화된 단일 type
        service,
        action: action || 'create',
        text,
        channelId,
        senderId: typeof content.senderId === 'string' ? content.senderId : undefined,
        logId: typeof content.id === 'string' ? content.id : undefined,
        sentAt: typeof content.sentAt === 'string' ? content.sentAt : undefined,
        content,
        raw: data
      }
    }

    // 메시지가 아닌 다른 이벤트는 그대로 emit (와처는 type=='message'만 처리하므로 자연스럽게 무시됨)
    return {
      envelopeId: data.envelope_id || '',
      type: rawType,
      service,
      action,
      channelId,
      content,
      raw: data
    }
  }

  // ===== 내부: STANDBY / state =====

  private isSessionLimitClose(): boolean {
    return (
      this.lastCloseCode === SESSION_LIMIT_CLOSE_CODE &&
      this.lastCloseReason === SESSION_LIMIT_CLOSE_REASON
    )
  }

  private async handleStandby(): Promise<void> {
    this.setState('STANDBY')
    if (!this.inStandbyLoop) {
      console.warn(
        `[SocketMode] 같은 토큰으로 다른 세션 활성 → standby (${STANDBY_RETRY_INTERVAL_MS / 1000}s 후 재시도)`
      )
    }
    this.inStandbyLoop = true
    await new Promise<void>((resolve) => {
      this.standbyTimer = setTimeout(() => {
        this.standbyTimer = null
        resolve()
      }, STANDBY_RETRY_INTERVAL_MS)
    })
  }

  private setState(next: ConnectionState): void {
    if (this.state === next) return
    const prev = this.state
    this.state = next
    console.log(`[SocketMode] state ${prev} → ${next}`)
    this.emit('state', next)
  }

  private clearPing(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null }
  }

  private clearTimers(): void {
    this.clearPing()
    if (this.standbyTimer) { clearTimeout(this.standbyTimer); this.standbyTimer = null }
  }
}

function stripScheme(domain: string): string {
  return domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
}
