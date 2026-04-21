import { BrowserWindow } from 'electron'
import { randomUUID, createHash } from 'crypto'
import Store from 'electron-store'
import type {
  Watcher, CollectedMessage, FilterRule, WatcherCreateRequest, WatcherUpdateRequest
} from '../../shared/types/watcher'
import { IPC_CHANNELS } from '../../shared/types/ipc'
import { MessengerService } from '../dooray/MessengerService'
import type { DoorayChannelLog } from '../dooray/MessengerService'

const POLL_INTERVAL_MS = 2 * 60 * 1000
const RETENTION_MS = 3 * 24 * 60 * 60 * 1000 // 3일

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
    return this.allMessages()
      .filter((m) => m.watcherId === watcherId)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
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

  /** 수동 재수집 (UI의 새로고침 버튼에서) */
  async refresh(watcherId?: string): Promise<void> {
    if (watcherId) {
      const w = this.listWatchers().find((x) => x.id === watcherId)
      if (w) await this.collectForWatcher(w, false)
    } else {
      await this.poll()
    }
  }

  // ===== 내부: 폴링/매칭 =====

  private allMessages(): CollectedMessage[] {
    return this.store.get('messages', [])
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
        // firstRun: 최대한 많이, 이후: 최근 100개로 충분 (2분 주기 폴링)
        const size = firstRun ? 200 : 100
        logs = await this.messenger.fetchChannelLogs(channelId, size)
      } catch (err) {
        console.error(`[WatcherService] fetchChannelLogs 실패 ${channelName}:`, err)
        continue
      }
      console.log(`[WatcherService] ${watcher.name} / ${channelName}: ${logs.length}건 fetched`)

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
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.webContents.send(IPC_CHANNELS.WATCHER_NEW_MESSAGES, { watcherId, messages })
  }
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
