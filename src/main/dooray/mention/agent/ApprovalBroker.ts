import type { MessengerAttachment, MessengerService } from '../../MessengerService'
import { CARD_AUTHOR, CARD_COLORS } from './AgentCardBuilder'
import { withPrefix } from './ResultPublisher'

/** 두레이 승인 결과. always: "항상 승인" — 같은 서명은 다시 묻지 않는다(기억은 호출 측 몫) */
export type PermissionDecision =
  | { behavior: 'allow'; always?: boolean }
  | { behavior: 'deny'; message: string }

export interface ApprovalRequest {
  /** 세션 채널(작업 폴더 기준) */
  channelId: string
  /** 승인 카드를 보낼 자리 — 멘션이 온 채널 */
  replyChannelId: string
  organizationId?: string
  toolName: string
  toolInput: Record<string, unknown>
  /** 왜 묻는지 — 위험 분류 (예: "원격 저장소 변경") */
  reason?: string
  /** claude 가 도구 호출을 거두면(사용자가 PC 에서 중단) hook 요청이 끊긴다 — 그때 대기를 접는다 */
  signal?: AbortSignal
}

export type ApprovalAnswer =
  | { kind: 'allow' }
  | { kind: 'always' }
  | { kind: 'deny'; reason?: string }

/**
 * 답장 판정 — 단독 메시지만 인정한다. "승인 절차가…" 같은 문장은 일반 대화로 흘린다(기획 §10).
 */
export function parseApprovalReply(text: string): ApprovalAnswer | null {
  const t = text.trim().replace(/^\[Clauday\]\s*/, '')
  if (/^(항상\s*승인|항상\s*허용|always)$/i.test(t)) return { kind: 'always' }
  if (/^(승인|허용|ㅇㅋ|ok|okay|yes|y)[.!]?$/i.test(t)) return { kind: 'allow' }
  // 사유는 한국어 "거절/거부" 뒤에만 받는다 — "no problem" 같은 영어 문장을 거절로 읽지 않도록
  if (/^(no|n)[.!]?$/i.test(t)) return { kind: 'deny' }
  const deny = /^(거절|거부)(?:[\s:,.]+(.+))?$/s.exec(t)
  if (deny) return { kind: 'deny', reason: deny[2]?.trim() || undefined }
  return null
}

/** 반응 값(두레이 이모지 이름) → 판정. 내가 누른 것만 본다 */
const REACTION_ANSWERS: Record<string, ApprovalAnswer> = {
  white_check_mark: { kind: 'allow' },
  heavy_check_mark: { kind: 'allow' },
  ballot_box_with_check: { kind: 'allow' },
  '+1': { kind: 'allow' },
  thumbsup: { kind: 'allow' },
  x: { kind: 'deny' },
  negative_squared_cross_mark: { kind: 'deny' },
  no_entry: { kind: 'deny' },
  no_entry_sign: { kind: 'deny' },
  '-1': { kind: 'deny' },
  thumbsdown: { kind: 'deny' },
  ok_hand: { kind: 'always' }
}

/** 메시지 반응 목록에서 내가 누른 판정. 거절이 하나라도 있으면 거절이 이긴다 */
export function parseApprovalReactions(reactions: unknown, myMemberId: string): ApprovalAnswer | null {
  if (!Array.isArray(reactions)) return null
  const mine = reactions
    .filter((r): r is { value: string; memberIds?: unknown } => !!r && typeof (r as { value?: unknown }).value === 'string')
    .filter((r) => Array.isArray(r.memberIds) && (r.memberIds as unknown[]).map(String).includes(myMemberId))
    .map((r) => REACTION_ANSWERS[r.value])
    .filter((a): a is ApprovalAnswer => !!a)
  return mine.find((a) => a.kind === 'deny') ?? mine.find((a) => a.kind === 'always') ?? mine.find((a) => a.kind === 'allow') ?? null
}

/** 카드에 보이지 않을 기술 값 — 사람이 판단하는 데 쓸모가 없다 */
const HIDDEN_KEYS = /^(idempotencyKey|sha256|confirmationFingerprint|fingerprint|sessionId|baseRevision|contentType|uploadType|token)$/i

/** 카드에 보일 요청 요지 — 무엇을 승인하는지 사람이 바로 읽게. 카드 안은 평문만 렌더된다 */
export function describeToolRequest(toolName: string, input: Record<string, unknown>): { title: string; detail: string } {
  const str = (k: string): string => (typeof input[k] === 'string' ? (input[k] as string) : typeof input[k] === 'number' ? String(input[k]) : '')
  const clip = (s: string, n = 400): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
  switch (toolName) {
    case 'Bash':
      return { title: '명령 실행', detail: clip(str('command')) + (str('description') ? `\n(${clip(str('description'), 120)})` : '') }
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
      return { title: '파일 수정', detail: str('file_path') }
    case 'WebFetch':
      return { title: '웹 접근', detail: str('url') }
  }
  const mcp = /^mcp__(.+?)__(.+)$/.exec(toolName)
  if (!mcp) return { title: toolName, detail: summarizeInput(input, clip) }
  const server = mcp[1].toLowerCase()
  const op = mcp[2]
  if (server.startsWith('drop')) {
    const files = Array.isArray(input.files) ? (input.files as Array<Record<string, unknown>>) : []
    const fileLines = files.map((f) => {
      const size = typeof f.sizeBytes === 'number' ? ` · ${Math.max(1, Math.round(f.sizeBytes / 1024))}KB` : typeof f.content === 'string' ? ` · ${Math.max(1, Math.round(f.content.length / 1024))}KB` : ''
      return `${String(f.path ?? '')}${size}`
    })
    const where = str('project') || str('name') || (typeof input.html === 'string' ? '새 프로젝트' : '')
    const lines = [where && `프로젝트 · ${where}${str('visibility') ? ` (${str('visibility')})` : ''}`, ...fileLines, str('path') && `파일 · ${str('path')}`]
    return { title: `Drop ${DROP_OPS[op] ?? op}`, detail: lines.filter(Boolean).join('\n') || summarizeInput(input, clip) }
  }
  const sql = str('query') || str('sql') || str('statement')
  if (sql) return { title: `DB ${op}`, detail: clip(sql, 500) }
  return { title: `${mcp[1]} · ${op}`, detail: summarizeInput(input, clip) }
}

const DROP_OPS: Record<string, string> = {
  drop_publish: '새 프로젝트로 게시',
  drop_upload: '파일 게시',
  drop_upload_finish: '파일 게시',
  drop_commit_upload: '파일 게시(확인 후)',
  drop_delete_file: '파일 삭제'
}

/** 입력을 "키 · 값" 줄로 — 기술 값은 빼고 긴 값은 자른다 */
function summarizeInput(input: Record<string, unknown>, clip: (s: string, n?: number) => string): string {
  return Object.entries(input)
    .filter(([k, v]) => !HIDDEN_KEYS.test(k) && v !== null && v !== undefined && v !== '')
    .slice(0, 6)
    .map(([k, v]) => `${k} · ${clip(typeof v === 'string' ? v : JSON.stringify(v), 160)}`)
    .join('\n')
}

export interface ApprovalBrokerDeps {
  messenger: Pick<MessengerService, 'sendCard' | 'sendMessage' | 'fetchChannelLogs' | 'deleteMessage'>
  /** 반응 판정에 쓰는 내 멤버 id — 내가 누른 반응만 인정한다 */
  getMyMemberId?: () => Promise<string | null>
  /** 승인 카드 반응 확인 주기 */
  pollIntervalMs?: number
  /** 승인 대기를 사용자에게 알린다 (OS 알림) */
  notify?: (info: { channelId: string; title: string }) => void
  /** 진행 메시지 단계 표시 */
  onWaiting?: (channelId: string, waiting: boolean) => void
  /** 무응답 시 거절까지 — hook timeout(600초)보다 먼저 명시 거절해 "무응답 = 거절" 을 보장한다 */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 570_000
const DEFAULT_POLL_MS = 3_000
/** 카드를 찾을 최근 메시지 수 — 대기 중 대화가 이보다 많이 쌓이면 반응은 못 보고 답장으로만 판정된다 */
const POLL_FETCH_SIZE = 50

interface Pending {
  replyChannelId: string
  organizationId?: string
  title: string
  finish: (decision: PermissionDecision | null, note: string) => void
}

/**
 * 두레이 승인 브로커 (기획 §5.2).
 * 위험 동작(DangerGate)의 PreToolUse hook 이 오면 승인 카드를 보내고, **카드에 내가 누른 반응(✅❌👌)** 또는
 * 같은 채널의 **내 단독 답장**을 기다려 결정을 돌려준다. 판정이 나면 카드를 지우고 결과 한 줄만 남긴다.
 * 버튼은 쓰지 않는다 — 클릭이 커맨드 앱 서버로만 가서 설치형(각자 로컬) Clauday 가 받을 수 없다(2026-10-14 실측).
 */
export class ApprovalBroker {
  /** 회신 채널 → 대기 중 요청. Claude 는 도구를 순차 호출하므로 채널당 하나 */
  private pending = new Map<string, Pending>()

  constructor(private deps: ApprovalBrokerDeps) {}

  hasPending(replyChannelId: string): boolean {
    return this.pending.has(replyChannelId)
  }

  async request(req: ApprovalRequest): Promise<PermissionDecision | null> {
    // PC 에서 이미 답해 hook 이 끊긴 요청이면 카드를 보내지 않는다
    if (req.signal?.aborted) return null
    // 같은 자리에 남은 대기가 있으면 접는다 — TUI 에서 처리돼 hook 이 끊긴 뒤 새 요청이 온 경우
    this.pending.get(req.replyChannelId)?.finish(null, '')

    const { title, detail } = describeToolRequest(req.toolName, req.toolInput)
    const minutes = Math.max(1, Math.floor((this.deps.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 60000))
    const card: MessengerAttachment = {
      authorName: `${CARD_AUTHOR} · ${minutes}분 뒤 자동 거절`,
      title: `🟧 ${title}`,
      text: detail || undefined,
      color: CARD_COLORS.warn,
      fields: [{ title: '반응을 눌러 주세요', value: '✅ 승인 · ❌ 거절 · 👌 항상 승인 (답장도 됩니다)', short: false }]
    }
    let cardLogId: string | null = null
    try {
      cardLogId = await this.deps.messenger.sendCard(req.replyChannelId, withPrefix(`승인 필요 · ${req.reason ?? title}`), [card], req.organizationId)
    } catch (err) {
      // 카드를 못 보내면 두레이에서 답할 길이 없다. 권한 확인 없이 도는 모드라 결정을 비우면 위험 동작이 그냥 실행된다 — 거절한다.
      console.warn(`[ApprovalBroker] 승인 카드 송신 실패 — 거절 channelId=${req.replyChannelId} tool=${req.toolName}:`, err)
      return { behavior: 'deny', message: '두레이로 승인 요청을 보내지 못해 실행하지 않았습니다. 사용자에게 직접 확인을 요청하세요.' }
    }
    this.deps.notify?.({ channelId: req.replyChannelId, title: `@clauday 승인 필요 — ${title}` })
    this.deps.onWaiting?.(req.channelId, true)
    console.log(`[ApprovalBroker] 승인 대기 channelId=${req.replyChannelId} tool=${req.toolName}`)

    const startedAt = Date.now()
    return new Promise<PermissionDecision | null>((resolve) => {
      let settled = false
      let entry: Pending | null = null
      const finish = (decision: PermissionDecision | null, note: string): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        clearInterval(poller)
        // 판정이 끝난 카드는 지운다 — 결과는 아래 한 줄로 남는다
        if (cardLogId) void this.removeCard(req.replyChannelId, cardLogId)
        req.signal?.removeEventListener('abort', onAbort)
        // 저장된 항목이 이 요청의 것일 때만 지운다 — 판정 뒤 같은 채널의 일반 대화("ok")를 삼키지 않도록
        if (entry && this.pending.get(req.replyChannelId) === entry) this.pending.delete(req.replyChannelId)
        this.deps.onWaiting?.(req.channelId, false)
        if (note) void this.sendNote(req.replyChannelId, note, req.organizationId)
        resolve(decision)
      }
      const elapsed = (): string => `${Math.max(1, Math.round((Date.now() - startedAt) / 1000))}초`
      const timer = setTimeout(
        () => finish({ behavior: 'deny', message: '두레이에서 승인 응답이 없어 거절했습니다. 필요하면 사용자에게 다시 확인을 요청하세요.' }, `⏰ ${title} — 응답이 없어 거절했습니다 (${elapsed()})`),
        this.deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
      )
      const onAbort = (): void => finish(null, `🖥 ${title} — PC 에서 중단됨 (${elapsed()})`)
      // 반응 확인 — 카드에 내가 누른 ✅❌👌 를 주기적으로 본다
      let polling = false
      const poller = setInterval(() => {
        if (polling || !cardLogId || !this.deps.getMyMemberId) return
        polling = true
        void this.readReaction(req.replyChannelId, cardLogId)
          .then((answer) => { if (answer && entry) this.apply(entry, answer, title) })
          .finally(() => { polling = false })
      }, this.deps.pollIntervalMs ?? DEFAULT_POLL_MS)
      if (req.signal?.aborted) {
        onAbort()
        return
      }
      req.signal?.addEventListener('abort', onAbort)
      entry = {
        replyChannelId: req.replyChannelId,
        organizationId: req.organizationId,
        title,
        finish: (decision, note) => finish(decision, note ? `${note} (${elapsed()})` : '')
      }
      this.pending.set(req.replyChannelId, entry)
    })
  }

  /**
   * 채널에 온 내 메시지 — 대기 중인 승인의 답이면 판정하고 true 를 돌려준다(소비됨).
   * 판정할 수 없는 메시지는 일반 대화로 흘린다.
   */
  onReply(replyChannelId: string, text: string): boolean {
    const p = this.pending.get(replyChannelId)
    if (!p) return false
    const answer = parseApprovalReply(text)
    if (!answer) return false
    this.apply(p, answer, p.title)
    return true
  }

  private apply(p: Pending, answer: ApprovalAnswer, title: string): void {
    if (answer.kind === 'deny') {
      const reason = answer.reason ? `: ${answer.reason}` : ''
      p.finish({ behavior: 'deny', message: `두레이에서 사용자가 거절했습니다${reason}` }, `⛔ ${title} — 거절됨${reason}`)
    } else if (answer.kind === 'always') {
      p.finish({ behavior: 'allow', always: true }, `✅ ${title} — 승인됨, 이 채널에선 다시 묻지 않음`)
    } else {
      p.finish({ behavior: 'allow' }, `✅ ${title} — 승인됨`)
    }
  }

  private async readReaction(channelId: string, cardLogId: string): Promise<ApprovalAnswer | null> {
    try {
      const myId = await this.deps.getMyMemberId?.()
      if (!myId) return null
      const logs = await this.deps.messenger.fetchChannelLogs(channelId, POLL_FETCH_SIZE)
      const card = logs.find((l) => l.id === cardLogId)
      return card ? parseApprovalReactions(card.reactions, myId) : null
    } catch (err) {
      console.warn(`[ApprovalBroker] 반응 확인 실패 channelId=${channelId} logId=${cardLogId}:`, err)
      return null
    }
  }

  private async removeCard(channelId: string, logId: string): Promise<void> {
    try {
      await this.deps.messenger.deleteMessage(channelId, logId)
    } catch (err) {
      console.warn(`[ApprovalBroker] 승인 카드 삭제 실패 channelId=${channelId} logId=${logId}:`, err)
    }
  }

  /** 앱 종료 등 — 대기를 모두 접는다 */
  cancelAll(): void {
    for (const p of [...this.pending.values()]) p.finish(null, '')
  }

  private async sendNote(channelId: string, note: string, orgId?: string): Promise<void> {
    try {
      await this.deps.messenger.sendMessage(channelId, withPrefix(note), orgId)
    } catch (err) {
      console.warn(`[ApprovalBroker] 결과 안내 송신 실패 channelId=${channelId}:`, err)
    }
  }
}

/**
 * PreToolUse hook 응답 본문. skip-permissions 모드에서도 PreToolUse 의 deny 는 적용된다(공식 문서).
 * 결정이 없으면 {} — 도구는 그대로 실행된다.
 */
export function toHookResponse(decision: PermissionDecision | null): Record<string, unknown> {
  if (!decision) return {}
  return decision.behavior === 'allow'
    ? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: '두레이에서 승인됨' } }
    : { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: decision.message } }
}
