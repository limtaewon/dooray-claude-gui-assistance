import { BrowserWindow } from 'electron'
import Store from 'electron-store'
import { SocketModeClient } from './SocketModeClient'
import type { ConnectionState, SocketModeEvent } from './types'
import { IPC_CHANNELS } from '../../../shared/types/ipc'
import type { DoorayClient } from '../DoorayClient'

interface BotConfigShape {
  /** 두레이 도메인 (예: nhnent.dooray.com). 비어있으면 봇 모드 비활성. 있으면 자동 활성. */
  doorayBotDomain: string
}

/**
 * Dooray Bot 통합 서비스.
 * - 도메인/enabled 설정 관리 (토큰은 기존 DoorayClient에서 재사용)
 * - SocketModeClient 라이프사이클 (시작/중지/재시작)
 * - 들어오는 이벤트 → renderer + 와처에 전파
 * - 메시지 송신은 기존 MessengerService.sendMessage 재사용 (Open API)
 */
export class BotService {
  private store: Store<BotConfigShape>
  private mainWindow: BrowserWindow | null = null
  private client: SocketModeClient | null = null
  private state: ConnectionState = 'DISCONNECTED'
  /** 마지막 에러 메시지 (UI 표시용) */
  private lastError: string | null = null
  /** 매치 핸들러 (와처가 등록) */
  private eventListeners: Set<(ev: SocketModeEvent) => void> = new Set()

  constructor(private doorayClient: DoorayClient) {
    this.store = new Store<BotConfigShape>({
      name: 'clauday-bot',
      defaults: { doorayBotDomain: '' }
    })
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  // ===== 설정 =====

  /** 봇은 별도 토큰을 갖지 않는다 — DoorayClient의 dooray-api 토큰을 그대로 재사용. */
  private async getApiToken(): Promise<string | null> {
    return this.doorayClient.getToken()
  }

  getDomain(): string {
    return this.store.get('doorayBotDomain', '')
  }

  setDomain(domain: string): void {
    this.store.set('doorayBotDomain', domain.trim())
  }

  /** 도메인 + 두레이 API 토큰 둘 다 있으면 ready (도메인이 곧 봇 모드 활성화 신호) */
  async isReady(): Promise<boolean> {
    if (!this.getDomain()) return false
    const token = await this.getApiToken()
    return !!token
  }

  // ===== 라이프사이클 =====

  async start(): Promise<void> {
    if (this.client) {
      console.log('[BotService] 이미 시작됨')
      return
    }
    if (!(await this.isReady())) {
      console.log('[BotService] 봇 설정 미완료 (도메인 또는 두레이 토큰 없음) — 시작 안 함')
      return
    }

    const token = (await this.getApiToken())!
    const domain = this.getDomain()

    this.lastError = null
    const client = new SocketModeClient({
      botToken: token,
      domain,
      services: ['messenger']
    })

    client.on('state', (newState: ConnectionState) => {
      this.state = newState
      this.emitStateUpdate()
    })

    client.on('event', (ev: SocketModeEvent) => {
      // 채널 메시지만 와처/UI 통보. 메타 이벤트(channelMemberReadSeq 등)는 silently 무시.
      if (ev.type !== 'message') return
      console.log(
        `[BotService] message channelId=${ev.channelId} text="${(ev.text || '').slice(0, 60)}"`
      )
      for (const listener of this.eventListeners) {
        try { listener(ev) } catch (err) { console.error('[BotService] listener 에러:', err) }
      }
      this.emitEvent(ev)
    })

    client.on('error', (err: Error) => {
      console.error('[BotService] client error:', err.message)
      this.lastError = err.message
      this.emitStateUpdate()
    })

    this.client = client

    // connect()는 내부적으로 무한 루프로 돌므로 await 안 함 (백그라운드)
    client.connect().catch((err) => {
      console.error('[BotService] connect 실패:', err)
      this.lastError = err instanceof Error ? err.message : String(err)
      this.emitStateUpdate()
    })
  }

  async stop(): Promise<void> {
    if (!this.client) return
    await this.client.disconnect()
    this.client = null
    this.state = 'DISCONNECTED'
    this.emitStateUpdate()
  }

  /** 설정 변경 후 재시작 */
  async restart(): Promise<void> {
    await this.stop()
    await this.start()
  }

  // ===== 이벤트 listener (와처 등 내부 모듈용) =====

  addEventListener(listener: (ev: SocketModeEvent) => void): () => void {
    this.eventListeners.add(listener)
    return () => { this.eventListeners.delete(listener) }
  }

  // ===== Renderer 통보 =====

  getStatus(): { state: ConnectionState; lastError: string | null; ready: boolean } {
    return {
      state: this.state,
      lastError: this.lastError,
      ready: this.client !== null
    }
  }

  private emitStateUpdate(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.webContents.send(IPC_CHANNELS.BOT_STATE_UPDATE, this.getStatus())
  }

  private emitEvent(ev: SocketModeEvent): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    // raw는 디버깅용이라 IPC로 보낼 땐 빼서 페이로드 작게
    const lite = { ...ev, raw: undefined }
    this.mainWindow.webContents.send(IPC_CHANNELS.BOT_EVENT, lite)
  }
}
