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
  CLOSE_GRACE_MS,
  reconnectDelayMs,
  PING_INTERVAL_MS,
  TOKEN_FETCH_TIMEOUT_MS,
  HANDSHAKE_TIMEOUT_MS,
  SESSION_INFO_TIMEOUT_MS,
  INBOUND_IDLE_TIMEOUT_MS,
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
  /** open 후 sessionInfo 를 기다리는 상한 타이머 — ACTIVE 가 되면 해제한다. */
  private sessionInfoTimer: NodeJS.Timeout | null = null
  /** 마지막 수신 시각. ping 틱마다 이 값이 너무 오래됐으면 죽은 회선으로 보고 끊는다. */
  private lastInboundAt = 0
  /** 진행 중인 토큰 발급 요청 — disconnect 가 즉시 끊을 수 있게 들고 있는다. */
  private pendingTokenRequest: { abort: () => void } | null = null
  private state: ConnectionState = 'DISCONNECTED'
  private tokenInfo: SocketModeTokenInfo | null = null

  private shouldReconnect = false
  private inStandbyLoop = false
  /** 연속 실패 횟수 — 붙는 순간 0 으로 돌아간다(백오프 리셋) */
  private reconnectAttempt = 0
  /**
   * 대기 중인 sleep 을 즉시 끝내는 함수들.
   * 타이머를 clearTimeout 하는 것만으로는 그 Promise 가 영영 resolve 되지 않아 루프가 그 자리에
   * 매달린 채 남는다 — disconnect() 가 루프를 빠져나가게 하려면 깨워야 한다.
   */
  private pendingWaits = new Set<() => void>()
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

  /** 정상 종료. 재연결 루프도 멈춤. 소켓이 실제로 닫힐 때까지(짧게) 기다린다. */
  async disconnect(): Promise<void> {
    this.shouldReconnect = false
    this.reconnectAttempt = 0
    this.inStandbyLoop = false
    this.setState('DISCONNECTED')
    this.clearTimers()
    // 토큰 발급 응답을 기다리는 중이면 그것도 끊는다 — 안 그러면 루프가 응답까지 매달린다.
    this.abortTokenRequest()
    // 재연결/standby 대기 중이면 그 자리에서 깨워 루프를 끝낸다.
    this.wakeAllWaits()
    await this.closeSocket()
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

      // 끊기면 스스로 다시 붙는다. 사용자가 재연결 버튼을 눌러야 데이터가 들어오는 구조는
      // '켜두면 알아서 모아준다' 는 이 기능의 전제를 깬다.
      this.reconnectAttempt += 1
      const delay = reconnectDelayMs(this.reconnectAttempt)
      console.log(
        `[SocketMode] 연결 종료 (code=${this.lastCloseCode}, reason=${this.lastCloseReason}) — ` +
          `${Math.round(delay / 1000)}초 후 재연결 (${this.reconnectAttempt}번째)`
      )
      this.setState('CONNECTING')
      // 토큰은 만료됐을 수 있으므로 버리고 다시 받는다.
      this.tokenInfo = null
      await this.wait(delay)
    }
  }

  /** disconnect() 가 오면 즉시 깨어나는 대기 — 타이머만 지우면 Promise 가 영영 안 끝난다. */
  private wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = (): void => {
        clearTimeout(timer)
        this.pendingWaits.delete(done)
        resolve()
      }
      const timer = setTimeout(done, ms)
      this.pendingWaits.add(done)
    })
  }

  private wakeAllWaits(): void {
    for (const done of Array.from(this.pendingWaits)) done()
  }

  /**
   * 소켓을 닫고 close 프레임이 서버에 닿을 시간을 준다.
   *
   * 닫자마자 새로 붙으면 서버가 아직 옛 세션을 들고 있어 '세션 중복' 으로 거절하고, 그러면
   * STANDBY 로 빠져 15초를 더 기다린다 — 재연결 버튼이 눌러도 바로 안 붙던 원인.
   */
  private closeSocket(): Promise<void> {
    const ws = this.ws
    this.ws = null
    if (!ws) return Promise.resolve()

    return new Promise<void>((resolve) => {
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.pendingWaits.delete(finish)
        resolve()
      }
      const timer = setTimeout(finish, CLOSE_GRACE_MS)
      // disconnect 가 연달아 오면 여기서도 즉시 깨어난다.
      this.pendingWaits.add(finish)
      try {
        ws.once?.('close', finish)
        ws.close(1000, 'client_disconnect')
      } catch {
        finish()
      }
    })
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

      // 응답이 영영 안 오면 루프가 여기 매달린 채 상태만 CONNECTING 으로 남는다 — 상한을 건다.
      let settled = false
      const finish = (fn: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timeoutTimer)
        this.pendingTokenRequest = null
        fn()
      }
      const timeoutTimer = setTimeout(() => {
        finish(() => {
          try { req.abort() } catch { /* ok */ }
          reject(new Error(`Socket Mode 토큰 발급 시간 초과 (${TOKEN_FETCH_TIMEOUT_MS}ms)`))
        })
      }, TOKEN_FETCH_TIMEOUT_MS)
      this.pendingTokenRequest = {
        abort: () => {
          finish(() => {
            try { req.abort() } catch { /* ok */ }
            reject(new Error('Socket Mode 토큰 발급 취소'))
          })
        }
      }

      let body = ''
      req.on('response', (res) => {
        const code = res.statusCode!
        res.on('data', (chunk: Buffer) => { body += chunk.toString() })
        res.on('end', () => {
          if (code >= 400) {
            finish(() => reject(new Error(`Socket Mode 토큰 발급 실패 (${code}): ${body.slice(0, 200)}`)))
            return
          }
          try {
            const parsed = JSON.parse(body) as { result?: SocketModeTokenInfo }
            const r = parsed.result
            if (!r?.accessToken || !r?.tenantId || !r?.organizationMemberId) {
              finish(() => reject(new Error(`Socket Mode 토큰 응답 형식 오류: ${body.slice(0, 200)}`)))
              return
            }
            this.tokenInfo = r
            console.log(
              `[SocketMode] 토큰 발급 OK tenantId=${r.tenantId} memberId=${r.organizationMemberId}`
            )
            finish(resolve)
          } catch (err) {
            finish(() => reject(new Error(`토큰 응답 파싱 실패: ${err instanceof Error ? err.message : String(err)}`)))
          }
        })
      })
      req.on('error', (err) => finish(() => reject(err)))
      // 빈 body POST
      req.write('')
      req.end()
    })
  }

  private abortTokenRequest(): void {
    const pending = this.pendingTokenRequest
    this.pendingTokenRequest = null
    pending?.abort()
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
        },
        // 업그레이드가 끝나지 않으면 open/close 어느 쪽도 오지 않는다 — ws 가 끊게 한다.
        handshakeTimeout: HANDSHAKE_TIMEOUT_MS
      })
    } catch (err) {
      throw new Error(`WebSocket 생성 실패: ${err instanceof Error ? err.message : err}`)
    }
    this.ws = ws

    ws.on('open', () => {
      console.log('[SocketMode] WS handshake OK — sessionInfo 대기')
      this.lastInboundAt = Date.now()
      this.startPing()
      this.startSessionInfoTimeout(ws)
    })

    ws.on('message', (data: RawData) => {
      this.lastInboundAt = Date.now()
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

    ws.on('unexpected-response', (req, res) => {
      // 핸드셰이크가 업그레이드 대신 HTTP 응답으로 거절된 경우(401·403·5xx·프록시).
      //
      // ⚠️ ws 는 이 이벤트에 리스너가 있으면 스스로 abortHandshake 를 하지 않는다
      // (websocket.js: `else if (!websocket.emit('unexpected-response', req, res))`).
      // 그래서 여기서 요청을 끊지 않으면 close/error 가 영영 오지 않고, awaitClose() 가
      // 그 자리에 매달려 재연결 루프가 CONNECTING 인 채로 멈춘다 — 실제 증상의 원인.
      const status = res.statusCode
      console.warn(`[SocketMode] handshake 거부 status=${status} — 소켓을 끊고 재시도한다`)
      // 토큰 문제일 수 있으니 버린다. 어차피 루프가 다음 시도에서 다시 받는다.
      this.tokenInfo = null
      try { req.destroy() } catch { /* ok */ }
      try { res.destroy?.() } catch { /* ok */ }
      // destroy 만으로 close 가 안 오는 구현을 대비해 루프를 직접 깨운다.
      this.failCurrentAttempt(ws, 4000, `handshake_rejected_${status}`)
    })

    ws.on('error', (err) => {
      console.error('[SocketMode] WS error:', err.message)
    })
  }

  private startPing(): void {
    this.clearPing()
    this.pingTimer = setInterval(() => {
      // 회선이 FIN 없이 끊기면(무선 전환·VPN 재접속) 소켓은 OPEN 인 채 남고 close 가 오지 않는다.
      // ping 을 보내도 응답이 없으면 죽은 것으로 보고 끊어서 루프가 다시 붙게 한다.
      if (this.lastInboundAt > 0 && Date.now() - this.lastInboundAt > INBOUND_IDLE_TIMEOUT_MS) {
        console.warn(
          `[SocketMode] ${Math.round(INBOUND_IDLE_TIMEOUT_MS / 1000)}초간 수신 없음 — 죽은 회선으로 보고 끊는다`
        )
        this.failCurrentAttempt(this.ws, 4001, 'inbound_idle')
        return
      }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping' }))
        } catch (err) {
          console.warn('[SocketMode] ping 실패:', err)
        }
      }
    }, PING_INTERVAL_MS)
  }

  /**
   * open 은 됐는데 sessionInfo 가 안 오는 구간을 끊는다.
   * sessionInfo 를 받아야 ACTIVE 다 — 안 오면 소켓만 열린 채 아무것도 못 받고 CONNECTING 에 남는다.
   */
  private startSessionInfoTimeout(ws: WebSocket): void {
    this.clearSessionInfoTimer()
    this.sessionInfoTimer = setTimeout(() => {
      this.sessionInfoTimer = null
      if (this.state === 'ACTIVE') return
      console.warn(
        `[SocketMode] ${SESSION_INFO_TIMEOUT_MS / 1000}초간 sessionInfo 없음 — 끊고 재시도한다`
      )
      this.failCurrentAttempt(ws, 4002, 'session_info_timeout')
    }, SESSION_INFO_TIMEOUT_MS)
  }

  /**
   * 지금 시도를 실패로 끝내고 재연결 루프를 깨운다.
   * 소켓을 terminate 하면 close 가 오지만, close 가 안 오는 구현(핸드셰이크 거절 등)도 있어
   * 마지막에 emit('close') 로 직접 깨운다 — awaitClose 가 매달리지 않게 하는 것이 목적이다.
   */
  private failCurrentAttempt(ws: WebSocket | null, code: number, reason: string): void {
    this.clearTimers()
    if (!ws) return
    this.lastCloseCode = code
    this.lastCloseReason = reason
    try {
      ws.terminate?.()
    } catch { /* ok */ }
    try {
      ws.emit('close', code, Buffer.from(reason))
    } catch { /* ok */ }
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
      this.clearSessionInfoTimer()
      // 백오프 리셋 — 이게 없으면 한 번 끊길 때마다 간격이 계속 늘어 상한(30초)에 눌러앉는다.
      // 잠깐 끊겼다 붙는 흔한 경우에도 다음 재연결이 30초씩 걸려 "안 붙는다" 로 보인다.
      this.reconnectAttempt = 0
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
    await this.wait(STANDBY_RETRY_INTERVAL_MS)
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

  private clearSessionInfoTimer(): void {
    if (this.sessionInfoTimer) { clearTimeout(this.sessionInfoTimer); this.sessionInfoTimer = null }
  }

  private clearTimers(): void {
    this.clearPing()
    this.clearSessionInfoTimer()
  }
}

function stripScheme(domain: string): string {
  return domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
}
