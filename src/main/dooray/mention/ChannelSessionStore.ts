import Store from 'electron-store'

interface ChannelSession {
  /** TerminalManager 의 세션 id */
  tabId: string
  /** Unix epoch ms */
  lastUsedAt: number
  /** 채널 표시명 (탭 라벨/UI 보조) */
  channelName?: string
  /** 작업 진행 중 플래그 — 새 멘션 차단에 사용 */
  busy?: boolean
  /** busy=true 가 된 시각 (Unix epoch ms) */
  busySince?: number
  /** 두레이 sendMessage 시 organizationId 옵션 (종료 알림 송신용) */
  organizationId?: string
  /** claude code 세션 id — 탭이 죽거나 앱이 재시작돼도 --resume으로 이어붙이기 위해 보관 */
  claudeSessionId?: string
}

interface SessionStoreShape {
  channelSessions: Record<string, ChannelSession>
}

/**
 * 채널 ID → 진행 중인 터미널 세션 매핑 영속화.
 * 멘션 들어왔을 때 기존 탭이 살아있는지 확인하여 재사용 분기 결정.
 */
export class ChannelSessionStore {
  private store: Store<SessionStoreShape>

  constructor() {
    this.store = new Store<SessionStoreShape>({
      name: 'clauday-mention-sessions',
      defaults: { channelSessions: {} }
    })
  }

  get(channelId: string): ChannelSession | null {
    const all = this.store.get('channelSessions', {}) as Record<string, ChannelSession>
    return all[channelId] || null
  }

  set(channelId: string, tabId: string, channelName?: string, organizationId?: string): void {
    const all = this.store.get('channelSessions', {}) as Record<string, ChannelSession>
    const prev = all[channelId]
    all[channelId] = {
      tabId,
      lastUsedAt: Date.now(),
      channelName,
      organizationId: organizationId ?? prev?.organizationId,
      // busy 상태와 claudeSessionId는 markBusy/markIdle/setClaudeSessionId만 갱신 — set은 보존
      busy: prev?.busy,
      busySince: prev?.busySince,
      claudeSessionId: prev?.claudeSessionId
    }
    this.store.set('channelSessions', all)
  }

  setClaudeSessionId(channelId: string, sessionId: string): void {
    const all = this.store.get('channelSessions', {}) as Record<string, ChannelSession>
    const cur = all[channelId]
    if (!cur) return
    if (cur.claudeSessionId === sessionId) return
    all[channelId] = { ...cur, claudeSessionId: sessionId }
    this.store.set('channelSessions', all)
  }

  /** tabId로 역방향 조회 — output listener에서 채널 식별용 */
  findByTabId(tabId: string): { channelId: string; session: ChannelSession } | null {
    const all = this.store.get('channelSessions', {}) as Record<string, ChannelSession>
    for (const [cid, s] of Object.entries(all)) {
      if (s.tabId === tabId) return { channelId: cid, session: s }
    }
    return null
  }

  /** 탭이 닫혔거나 무효일 때 호출 */
  clear(channelId: string): void {
    const all = this.store.get('channelSessions', {}) as Record<string, ChannelSession>
    if (all[channelId]) {
      delete all[channelId]
      this.store.set('channelSessions', all)
    }
  }

  touch(channelId: string): void {
    const cur = this.get(channelId)
    if (!cur) return
    this.set(channelId, cur.tabId, cur.channelName)
  }

  markBusy(channelId: string): void {
    const all = this.store.get('channelSessions', {}) as Record<string, ChannelSession>
    const cur = all[channelId]
    if (!cur) return
    all[channelId] = { ...cur, busy: true, busySince: Date.now() }
    this.store.set('channelSessions', all)
  }

  markIdle(channelId: string): void {
    const all = this.store.get('channelSessions', {}) as Record<string, ChannelSession>
    const cur = all[channelId]
    if (!cur) return
    all[channelId] = { ...cur, busy: false }
    this.store.set('channelSessions', all)
  }
}
