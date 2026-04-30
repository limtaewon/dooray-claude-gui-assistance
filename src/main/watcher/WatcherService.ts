import { BrowserWindow, Notification } from 'electron'
import { randomUUID, createHash } from 'crypto'
import Store from 'electron-store'
import type {
  Watcher, CollectedMessage, FilterRule, WatcherCreateRequest, WatcherUpdateRequest
} from '../../shared/types/watcher'
import { IPC_CHANNELS } from '../../shared/types/ipc'
import { MessengerService } from '../dooray/MessengerService'
import type { DoorayChannelLog } from '../dooray/MessengerService'
import type { SocketModeEvent } from '../dooray/socket-mode/types'

const POLL_INTERVAL_MS = 2 * 60 * 1000
const RETENTION_MS = 3 * 24 * 60 * 60 * 1000 // 3일
/** 정기 폴링 시 채널당 fetch 개수. 두레이 API는 since/cursor 기반 조회를 지원하지 않아
 * 매번 최신 N개를 가져온다. 활발한 채널에서 2분 사이 N개를 초과하면 매치 메시지가
 * 영구 누락되므로 충분한 여유를 둔다. */
const POLL_FETCH_SIZE = 300
/** 사용자 명시 새로고침/첫 진입 시. 누락분 catch-up 위해 더 크게. */
const REFRESH_FETCH_SIZE = 500

interface WatcherStoreShape {
  watchers: Watcher[]
  messages: CollectedMessage[]
}

export class WatcherService {
  private store: Store<WatcherStoreShape>
  private mainWindow: BrowserWindow | null = null
  private pollTimer: NodeJS.Timeout | null = null
  /** 진행 중인 폴링이 있는지 (중복 방지) */
  private polling = false

  constructor(private messenger: MessengerService) {
    this.store = new Store<WatcherStoreShape>({
      name: 'clauday-watchers',
      defaults: { watchers: [], messages: [] }
    })
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  /** 앱 시작 시 폴링 시작 */
  start(): void {
    this.pruneOldMessages()
    this.pollTimer = setInterval(() => void this.poll(), POLL_INTERVAL_MS)
    // 앱 시작 3초 후 첫 폴링 (네트워크 준비 대기)
    setTimeout(() => void this.poll(), 3000)
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  // ===== CRUD =====

  listWatchers(): Watcher[] {
    return this.store.get('watchers', [])
  }

  createWatcher(req: WatcherCreateRequest): Watcher {
    const now = new Date().toISOString()
    const watcher: Watcher = {
      id: randomUUID(),
      name: req.name,
      instruction: req.instruction,
      channelIds: req.channelIds,
      channelNames: req.channelNames,
      filter: req.filter,
      enabled: true,
      createdAt: now,
      updatedAt: now
    }
    const list = this.listWatchers()
    list.push(watcher)
    this.store.set('watchers', list)

    // 생성 직후 백그라운드로 과거 3일 히스토리 한번 fetch
    void this.collectForWatcher(watcher, true)
    return watcher
  }

  updateWatcher(id: string, patch: WatcherUpdateRequest): Watcher | null {
    const list = this.listWatchers()
    const i = list.findIndex((w) => w.id === id)
    if (i < 0) return null
    const updated: Watcher = {
      ...list[i],
      ...patch,
      channelIds: patch.channelIds ?? list[i].channelIds,
      channelNames: patch.channelNames ?? list[i].channelNames,
      filter: patch.filter ?? list[i].filter,
      updatedAt: new Date().toISOString()
    }
    list[i] = updated
    this.store.set('watchers', list)
    return updated
  }

  deleteWatcher(id: string): void {
    this.store.set('watchers', this.listWatchers().filter((w) => w.id !== id))
    // 관련 메시지도 제거
    this.store.set('messages', this.allMessages().filter((m) => m.watcherId !== id))
  }

  // ===== 메시지 =====

  messagesForWatcher(watcherId: string): CollectedMessage[] {
    // 정렬은 ISO 문자열을 Date로 파싱한 timestamp 기준으로 비교한다.
    // (과거 일부 메시지가 UTC 'Z'로, 현재 메시지가 KST '+09:00'로 저장돼있는 상황에서도
    //  실제 시간순으로 정확히 정렬되도록.)
    const ts = (s?: string): number => {
      if (!s) return 0
      const t = new Date(s).getTime()
      return Number.isFinite(t) ? t : 0
    }
    return this.allMessages()
      .filter((m) => m.watcherId === watcherId)
      .sort((a, b) => ts(b.createdAt) - ts(a.createdAt))
  }

  markRead(messageIds: string[]): void {
    const ids = new Set(messageIds)
    const next = this.allMessages().map((m) =>
      ids.has(m.id) ? { ...m, read: true } : m
    )
    this.store.set('messages', next)
  }

  markAllRead(watcherId: string): void {
    const next = this.allMessages().map((m) =>
      m.watcherId === watcherId ? { ...m, read: true } : m
    )
    this.store.set('messages', next)
  }

  /** watcherId별 미읽음 개수 */
  unreadCounts(): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const m of this.allMessages()) {
      if (m.read) continue
      counts[m.watcherId] = (counts[m.watcherId] || 0) + 1
    }
    return counts
  }

  /** 수동 재수집 (UI의 새로고침 버튼에서).
   * 진행 중인 백그라운드 폴링(this.polling)이 있어도 무시되지 않게,
   * watcher별로 직접 collectForWatcher를 호출한다. (이전에는 글로벌 refresh가
   * polling 락에 부딪혀 조용히 무시되는 버그가 있었다.) */
  async refresh(watcherId?: string): Promise<void> {
    const t0 = Date.now()
    if (watcherId) {
      const w = this.listWatchers().find((x) => x.id === watcherId)
      if (!w) {
        console.warn(`[WatcherService] refresh: watcher 없음 ${watcherId}`)
        return
      }
      console.log(`[WatcherService] refresh START watcher="${w.name}" (단일, force=true)`)
      await this.collectForWatcher(w, true)
      console.log(`[WatcherService] refresh DONE watcher="${w.name}" (${Date.now() - t0}ms)`)
      return
    }

    // 글로벌 새로고침: enabled 와처 전체를 병렬 수집 (락 우회)
    const watchers = this.listWatchers().filter((w) => w.enabled)
    console.log(`[WatcherService] refresh START 전체 (${watchers.length}개 와처, polling=${this.polling})`)
    await Promise.all(
      watchers.map((w) =>
        this.collectForWatcher(w, true).catch((err) => {
          console.error(`[WatcherService] refresh 실패 ${w.name}:`, err)
        })
      )
    )
    this.pruneOldMessages()
    console.log(`[WatcherService] refresh DONE 전체 (${watchers.length}개, ${Date.now() - t0}ms)`)
  }

  /**
   * Socket Mode 실시간 이벤트 처리.
   * BotService.addEventListener를 통해 들어오는 메시지를 즉시 와처 매치 로직에 통과시킨다.
   * 폴링과 dedup이 같이 동작 (hashId 기반)이라 양쪽 다 활성화돼있어도 중복 안 쌓임.
   *
   * 멤버 이름 lookup을 await로 처리하여 저장 시점에 이미 authorName이 들어가있게 함
   * (폴링과 동일한 흐름. 이전 비동기 보정 방식은 UI가 이름 없는 첫 그림을 그려서 사용자가
   *  다른 탭 갔다와야 이름이 보이는 문제가 있었음).
   */
  async handleSocketEvent(event: SocketModeEvent): Promise<void> {
    if (event.service !== 'messenger' || event.type !== 'message') return
    if (!event.text || !event.channelId || !event.logId) return

    const watchers = this.listWatchers().filter((w) =>
      w.enabled && w.channelIds.includes(event.channelId!)
    )
    if (watchers.length === 0) return

    // 매칭이 하나라도 있는지 먼저 체크 (멤버 lookup API 호출 절약)
    const matchByWatcher = new Map<string, ReturnType<typeof matchFilter>>()
    for (const w of watchers) {
      const matched = matchFilter(event.text, w.filter)
      if (matched) matchByWatcher.set(w.id, matched)
    }
    if (matchByWatcher.size === 0) return

    // 이름 lookup (캐시 hit이면 즉시 반환, miss면 1번의 멤버 API 호출)
    let authorName = '알 수 없음'
    if (event.senderId) {
      try {
        const resolved = await this.messenger.getMemberName(event.senderId)
        if (typeof resolved === 'string' && resolved) authorName = resolved
        else if (event.senderId) authorName = `멤버 ${event.senderId.slice(-6)}`
      } catch {
        authorName = `멤버 ${event.senderId.slice(-6)}`
      }
    }

    const cutoff = new Date(Date.now() - RETENTION_MS).toISOString()
    const sentAt = event.sentAt || new Date().toISOString()
    const existing = this.allMessages()
    const existingById = new Map(existing.map((m) => [m.id, m]))

    let totalNewCount = 0
    const newMessagesPerWatcher = new Map<string, CollectedMessage[]>()

    for (const watcher of watchers) {
      const matched = matchByWatcher.get(watcher.id)
      if (!matched) continue

      const channelIdxAt = watcher.channelIds.indexOf(event.channelId!)
      const channelName = watcher.channelNames[channelIdxAt] || event.channelId!

      const msgId = hashId(watcher.id, event.channelId!, event.logId!)
      if (existingById.has(msgId)) continue

      const msg: CollectedMessage = {
        id: msgId,
        watcherId: watcher.id,
        channelId: event.channelId!,
        channelName,
        messageId: event.logId!,
        text: event.text!,
        authorName,
        authorId: event.senderId,
        createdAt: sentAt > cutoff ? sentAt : cutoff,
        matchedTerms: matched.terms,
        read: false
      }

      existingById.set(msgId, msg)
      const arr = newMessagesPerWatcher.get(watcher.id) || []
      arr.push(msg)
      newMessagesPerWatcher.set(watcher.id, arr)
      totalNewCount++
    }

    if (totalNewCount === 0) return

    const all: CollectedMessage[] = []
    for (const m of existingById.values()) all.push(m)
    this.store.set('messages', all)

    for (const [watcherId, msgs] of newMessagesPerWatcher) {
      this.emitNewMessages(watcherId, msgs)
    }

    console.log(
      `[WatcherService] socket event 매치 ${totalNewCount}개 (와처 ${newMessagesPerWatcher.size}개) author="${authorName}"`
    )
  }

  // ===== 내부: 폴링/매칭 =====

  private allMessages(): CollectedMessage[] {
    const raw = this.store.get('messages', [])
    // 과거 버그(Promise 객체가 authorName으로 저장된 케이스)나 누락 필드 sanitize.
    // 매번 호출되므로 가벼운 정규화만 수행.
    return raw.map((m) => ({
      ...m,
      authorName: typeof m.authorName === 'string' ? m.authorName : '',
      text: typeof m.text === 'string' ? m.text : '',
      channelName: typeof m.channelName === 'string' ? m.channelName : ''
    }))
  }

  private async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      const watchers = this.listWatchers().filter((w) => w.enabled)
      for (const w of watchers) {
        try {
          await this.collectForWatcher(w, false)
        } catch (err) {
          console.error(`[WatcherService] poll 실패 ${w.name}:`, err)
        }
      }
      this.pruneOldMessages()
    } finally {
      this.polling = false
    }
  }

  /** 특정 watcher에 대해 채널들에서 새 메시지 fetch + 매칭 + 저장 */
  private async collectForWatcher(watcher: Watcher, firstRun: boolean): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_MS).toISOString()

    const existing = this.allMessages()
    const existingById = new Map(existing.map((m) => [m.id, m]))
    const newMessages: CollectedMessage[] = []
    const updatedIds: Array<{ id: string; authorName: string; text: string }> = []

    // 채널별 매칭된 로그를 먼저 모은 뒤, 멤버 이름을 일괄 조회 후 메시지 생성
    const matchedPerChannel: Array<{
      channelId: string
      channelName: string
      log: DoorayChannelLog
      text: string
      createdAt: string
      matchedTerms: string[]
    }> = []

    for (let i = 0; i < watcher.channelIds.length; i++) {
      const channelId = watcher.channelIds[i]
      const channelName = watcher.channelNames[i] || channelId
      let logs: DoorayChannelLog[] = []
      try {
        // firstRun: 더 큰 catch-up size, 이후: 폴링 size.
        // 두레이 메신저 API는 cursor/since 기반 조회를 지원하지 않아 매번 최신 N개를
        // 가져온다. 활발한 채널에서 N을 초과한 메시지는 누락되므로 여유를 크게 둔다.
        const size = firstRun ? REFRESH_FETCH_SIZE : POLL_FETCH_SIZE
        logs = await this.messenger.fetchChannelLogs(channelId, size)
      } catch (err) {
        console.error(`[WatcherService] fetchChannelLogs 실패 ${channelName}:`, err)
        continue
      }
      console.log(`[WatcherService] ${watcher.name} / ${channelName}: ${logs.length}건 fetched`)

      // 누락 진단 (1): 시간 범위 — 두레이가 정말 최근 메시지를 안 돌려주는지 확인
      if (logs.length > 0) {
        const ts = (l: DoorayChannelLog): string => l.sentAt || l.createdAt || ''
        const newest = ts(logs[0])
        const oldest = ts(logs[logs.length - 1])
        console.log(`[WatcherService] ${watcher.name} / ${channelName} 시간범위: ${newest} ~ ${oldest}`)
      }

      // 누락 진단 (2): type/subtype 분포 — thread 메시지가 별도 type으로 빠질 가능성
      const typeStats = new Map<string, number>()
      for (const log of logs) {
        const key = String(log.type || '(none)') + (log.flags && typeof log.flags === 'object' && 'subtype' in log.flags ? `/${(log.flags as Record<string, unknown>).subtype}` : '')
        typeStats.set(key, (typeStats.get(key) || 0) + 1)
      }
      if (typeStats.size > 0) {
        console.log(`[WatcherService] ${watcher.name} / ${channelName} 타입 분포:`, Object.fromEntries(typeStats))
      }

      // 누락 진단 (3): 최신 5건 본문 + 매치 여부
      if (logs.length > 0) {
        const sample = logs.slice(0, 5).map((log) => {
          const t = extractText(log)
          const tsv = log.sentAt || log.createdAt || '(no timestamp)'
          const matched = t ? matchFilter(t, watcher.filter) : null
          return {
            id: String(log.id || '').slice(-6),
            ts: tsv.slice(11, 19),
            type: log.type || '-',
            textLen: t.length,
            preview: t.slice(0, 80).replace(/\n/g, ' ') || '(본문 없음)',
            match: matched ? `✓(${matched.terms.join(',')})` : '✗'
          }
        })
        console.log(`[WatcherService] ${watcher.name} / ${channelName} 최신 5건:`)
        console.table(sample)
      }

      // 누락 진단 (4): 본문이 빈(extractText=0) 메시지 카운트 — 본문 추출 누락 확인
      let emptyTextCount = 0
      for (const log of logs) {
        if (!extractText(log)) emptyTextCount++
      }
      if (emptyTextCount > 0) {
        console.log(`[WatcherService] ${watcher.name} / ${channelName} 본문 추출 실패 ${emptyTextCount}/${logs.length}건`)
      }

      let matchedCount = 0
      for (const log of logs) {
        const text = extractText(log)
        if (!text) continue
        const createdAt = log.sentAt || log.createdAt
        // 타임스탬프/ID 없는 시스템 로그는 스킵
        if (!createdAt || !log.id) continue
        // 보관 기간(3일) 밖이면 스킵
        if (createdAt < cutoff) continue
        const matched = matchFilter(text, watcher.filter)
        if (!matched) continue
        matchedCount++
        matchedPerChannel.push({ channelId, channelName, log, text, createdAt, matchedTerms: matched.terms })
      }
      console.log(`[WatcherService] ${watcher.name} / ${channelName}: 매치 ${matchedCount}개`)
    }

    // 매칭된 메시지들의 sender 멤버 ID 모아서 일괄 이름 조회 (API 호출 최소화)
    const memberIds = new Set<string>()
    for (const m of matchedPerChannel) {
      const id = m.log.sender?.organizationMemberId || m.log.creator?.member?.organizationMemberId
      if (id) memberIds.add(id)
    }
    await this.messenger.resolveMemberNames(Array.from(memberIds))

    // 메시지 객체 생성
    for (const m of matchedPerChannel) {
      const authorId = m.log.sender?.organizationMemberId || m.log.creator?.member?.organizationMemberId
      const nameFromLog = m.log.sender?.name || m.log.creator?.member?.name
      const resolvedName = authorId ? await this.messenger.getMemberName(authorId) : ''
      const authorName = nameFromLog || resolvedName || '알 수 없음'

      const msgId = hashId(watcher.id, m.channelId, m.log.id)
      const prev = existingById.get(msgId)
      if (prev) {
        // 이미 저장된 메시지는 authorName/text만 보정 (이전 '알 수 없음' 또는 JSON 원본 케이스)
        const needsNameFix = prev.authorName === '알 수 없음' && authorName !== '알 수 없음'
        const needsTextFix = prev.text !== m.text
        if (needsNameFix || needsTextFix) {
          updatedIds.push({ id: msgId, authorName, text: m.text })
        }
        continue
      }
      const msg: CollectedMessage = {
        id: msgId,
        watcherId: watcher.id,
        channelId: m.channelId,
        channelName: m.channelName,
        messageId: m.log.id,
        text: m.text,
        authorName,
        authorId,
        createdAt: m.createdAt,
        matchedTerms: m.matchedTerms,
        read: false
      }
      existingById.set(msgId, msg)
      newMessages.push(msg)
    }

    if (newMessages.length > 0 || updatedIds.length > 0) {
      const updateMap = new Map(updatedIds.map((u) => [u.id, u]))
      const updatedExisting = existing.map((m) => {
        const u = updateMap.get(m.id)
        return u ? { ...m, authorName: u.authorName, text: u.text } : m
      })
      const all = [...updatedExisting, ...newMessages]
      this.store.set('messages', all)
      if (newMessages.length > 0) {
        this.emitNewMessages(watcher.id, newMessages)
      }
    }

    // 마지막 체크 시각 갱신
    this.updateWatcher(watcher.id, { /* lastCheckedAt은 별도 저장 */ })
    const list = this.listWatchers()
    const i = list.findIndex((w) => w.id === watcher.id)
    if (i >= 0) {
      list[i] = { ...list[i], lastCheckedAt: new Date().toISOString() }
      this.store.set('watchers', list)
    }
  }

  private pruneOldMessages(): void {
    const cutoff = new Date(Date.now() - RETENTION_MS).toISOString()
    const all = this.allMessages()
    const kept = all.filter((m) => m && typeof m.createdAt === 'string' && m.createdAt >= cutoff)
    if (kept.length !== all.length) {
      this.store.set('messages', kept)
    }
  }

  private emitNewMessages(watcherId: string, messages: CollectedMessage[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.WATCHER_NEW_MESSAGES, { watcherId, messages })
    }
    this.showOsNotification(watcherId, messages)
  }

  /** OS 시스템 알림. 메시지가 많을 땐 첫 1건만 미리보기로 띄우고 나머지는 개수로 표시. */
  private showOsNotification(watcherId: string, messages: CollectedMessage[]): void {
    if (messages.length === 0) return
    if (!Notification.isSupported()) return
    const watcher = this.listWatchers().find((w) => w.id === watcherId)
    const watcherName = watcher?.name || '와처'
    const head = messages[0]

    const title = messages.length === 1
      ? `[${watcherName}] ${head.channelName}`
      : `[${watcherName}] 새 메시지 ${messages.length}건`

    const bodyHead = `${head.authorName} · ${head.channelName}\n${truncate(head.text.replace(/\n+/g, ' '), 140)}`
    const body = messages.length === 1
      ? bodyHead
      : `${bodyHead}\n외 ${messages.length - 1}건`

    try {
      const notification = new Notification({
        title,
        body,
        silent: false
      })
      notification.on('click', () => {
        // 알림 클릭 시 앱 창 포커스 + 모니터링 탭으로 이동 신호
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          if (this.mainWindow.isMinimized()) this.mainWindow.restore()
          this.mainWindow.show()
          this.mainWindow.focus()
          this.mainWindow.webContents.send(IPC_CHANNELS.WATCHER_NOTIFICATION_CLICK, { watcherId })
        }
      })
      notification.show()
    } catch (err) {
      console.warn('[WatcherService] OS 알림 표시 실패:', err)
    }
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

// ===== 유틸 =====

function hashId(watcherId: string, channelId: string, messageId: string): string {
  return createHash('md5').update(`${watcherId}|${channelId}|${messageId}`).digest('hex')
}

function extractText(log: DoorayChannelLog): string {
  // 가능한 본문 필드를 순서대로 시도 (두레이 메신저 로그 필드명 변동 대응)
  const candidates: string[] = []
  if (typeof log.text === 'string' && log.text.trim()) candidates.push(log.text)
  if (typeof log.message === 'string' && log.message.trim()) candidates.push(log.message)
  if (typeof log.messageText === 'string' && log.messageText.trim()) candidates.push(log.messageText)
  if (typeof log.content === 'string' && log.content.trim()) candidates.push(log.content)
  if (typeof log.body === 'string' && log.body.trim()) candidates.push(log.body)
  if (log.content && typeof log.content === 'object' && 'content' in log.content) {
    const c = (log.content as { content?: unknown }).content
    if (typeof c === 'string' && c.trim()) candidates.push(c)
  }
  if (log.body && typeof log.body === 'object' && 'content' in log.body) {
    const c = (log.body as { content?: unknown }).content
    if (typeof c === 'string' && c.trim()) candidates.push(c)
  }
  for (const raw of candidates) {
    const plain = unwrapRichText(raw)
    if (plain) return plain
  }
  return ''
}

/**
 * 봇/웹훅이 보내는 rich-text JSON 포맷을 평문으로 변환.
 * 예: '{"type":0,"text":"...","attachments":[...]}' → "..."
 * 예: '{"blocks":[{"text":"..."}, ...]}' → 텍스트 합침
 * 파싱 실패 시 원본 반환.
 */
function unwrapRichText(raw: string): string {
  const trimmed = raw.trim()
  // JSON 객체/배열로 시작하지 않으면 그냥 평문
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return trimmed
  try {
    const parsed = JSON.parse(trimmed)
    const pieces: string[] = []
    collectText(parsed, pieces)
    const joined = pieces.join('\n').trim()
    return joined || trimmed
  } catch {
    return trimmed
  }
}

function collectText(node: unknown, out: string[]): void {
  if (node == null) return
  if (typeof node === 'string') {
    if (node.trim()) out.push(node)
    return
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out)
    return
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>
    // 우선순위 높은 텍스트 필드
    for (const key of ['text', 'content', 'title', 'pretext', 'fallback', 'message']) {
      const v = obj[key]
      if (typeof v === 'string' && v.trim()) out.push(v)
      else if (v && typeof v === 'object') collectText(v, out)
    }
    // 블록/첨부 구조 재귀
    for (const key of ['blocks', 'attachments', 'elements', 'fields']) {
      const v = obj[key]
      if (v) collectText(v, out)
    }
  }
}

/** FilterRule 매칭. 매치되면 어떤 용어가 맞았는지 반환 */
function matchFilter(text: string, rule: FilterRule): { terms: string[] } | null {
  const lower = text.toLowerCase()

  // 제외 규칙 먼저 평가
  if (rule.exclude && rule.exclude.some((w) => lower.includes(w.toLowerCase()))) return null
  if (rule.excludeRegex && rule.excludeRegex.some((r) => safeRegex(r).test(text))) return null

  const matched: string[] = []

  if (rule.allOf && rule.allOf.length > 0) {
    const ok = rule.allOf.every((w) => lower.includes(w.toLowerCase()))
    if (!ok) return null
    matched.push(...rule.allOf)
  }

  let anyMatched = matched.length > 0
  if (rule.anyOf && rule.anyOf.length > 0) {
    const found = rule.anyOf.filter((w) => lower.includes(w.toLowerCase()))
    if (found.length > 0) {
      matched.push(...found)
      anyMatched = true
    } else if (!rule.regex || rule.regex.length === 0) {
      // anyOf만 있고 안 걸리면 탈락 (regex에서 기회 주지 않는 한)
      return null
    }
  }

  if (rule.regex && rule.regex.length > 0) {
    const found = rule.regex.filter((r) => safeRegex(r).test(text))
    if (found.length > 0) {
      matched.push(...found)
      anyMatched = true
    }
  }

  // allOf/anyOf/regex 어느 것도 정의 안 된 경우 → 모든 메시지 매치 (exclude만 필터)
  const hasAnyPositive = !!(rule.allOf?.length || rule.anyOf?.length || rule.regex?.length)
  if (!hasAnyPositive) return { terms: [] }

  return anyMatched ? { terms: Array.from(new Set(matched)) } : null
}

function safeRegex(pattern: string): RegExp {
  try { return new RegExp(pattern, 'i') }
  catch { return /__never_matches__/ }
}
