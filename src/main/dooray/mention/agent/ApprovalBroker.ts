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

/** 카드에 보일 요청 요지 — 카드 안은 평문만 렌더된다 */
export function describeToolRequest(toolName: string, input: Record<string, unknown>): { title: string; detail: string } {
  const str = (k: string): string => (typeof input[k] === 'string' ? (input[k] as string) : '')
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
    default: {
      const mcp = /^mcp__(.+?)__(.+)$/.exec(toolName)
      const json = JSON.stringify(input)
      return { title: mcp ? `${mcp[1]} · ${mcp[2]}` : toolName, detail: clip(json === '{}' ? '' : json, 300) }
    }
  }
}

export interface ApprovalBrokerDeps {
  messenger: Pick<MessengerService, 'sendCard' | 'sendMessage'>
  /** 승인 대기를 사용자에게 알린다 (OS 알림) */
  notify?: (info: { channelId: string; title: string }) => void
  /** 진행 메시지 단계 표시 */
  onWaiting?: (channelId: string, waiting: boolean) => void
  /** 무응답 시 거절까지 — hook timeout(600초)보다 먼저 명시 거절해 "무응답 = 거절" 을 보장한다 */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 570_000

interface Pending {
  replyChannelId: string
  organizationId?: string
  finish: (decision: PermissionDecision | null, note: string) => void
}

/**
 * 두레이 승인 브로커 (기획 §5.2, A안 — 답장).
 * 위험 동작(DangerGate)의 PreToolUse hook 이 오면 승인 카드를 보내고, 같은 채널의 **내 단독 답장**을 기다려 결정을 돌려준다.
 * 입력 경로는 onReply 하나 — 후속 버튼 릴레이도 같은 자리로 넣는다.
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
      authorName: `${CARD_AUTHOR} · 승인 필요${req.reason ? ` · ${req.reason}` : ''} · ${minutes}분 뒤 자동 거절`,
      title: `🟧 ${title} 승인`,
      text: detail || undefined,
      color: CARD_COLORS.warn,
      fields: [{ title: '답장', value: '승인 · 거절 [사유] · 항상 승인', short: false }]
    }
    try {
      await this.deps.messenger.sendCard(req.replyChannelId, withPrefix('승인이 필요합니다'), [card], req.organizationId)
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
        req.signal?.removeEventListener('abort', onAbort)
        // 저장된 항목이 이 요청의 것일 때만 지운다 — 판정 뒤 같은 채널의 일반 대화("ok")를 삼키지 않도록
        if (entry && this.pending.get(req.replyChannelId) === entry) this.pending.delete(req.replyChannelId)
        this.deps.onWaiting?.(req.channelId, false)
        if (note) void this.sendNote(req.replyChannelId, note, req.organizationId)
        resolve(decision)
      }
      const elapsed = (): string => `${Math.max(1, Math.round((Date.now() - startedAt) / 1000))}초`
      const timer = setTimeout(
        () => finish({ behavior: 'deny', message: '두레이에서 승인 응답이 없어 거절했습니다. 필요하면 사용자에게 다시 확인을 요청하세요.' }, '⏰ 응답 시간이 지나 거절했습니다'),
        this.deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
      )
      const onAbort = (): void => finish(null, `🖥 PC 에서 중단됨 (${elapsed()})`)
      if (req.signal?.aborted) {
        onAbort()
        return
      }
      req.signal?.addEventListener('abort', onAbort)
      entry = {
        replyChannelId: req.replyChannelId,
        organizationId: req.organizationId,
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
    if (answer.kind === 'deny') {
      const reason = answer.reason ? `: ${answer.reason}` : ''
      p.finish({ behavior: 'deny', message: `두레이에서 사용자가 거절했습니다${reason}` }, `⛔ 거절됨${reason}`)
    } else if (answer.kind === 'always') {
      p.finish({ behavior: 'allow', always: true }, '✅ 승인됨 — 이 채널에서 같은 요청은 앞으로 묻지 않습니다')
    } else {
      p.finish({ behavior: 'allow' }, '✅ 승인됨')
    }
    return true
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
