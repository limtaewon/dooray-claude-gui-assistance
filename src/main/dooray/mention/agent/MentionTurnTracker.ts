/** 멘션 하나가 연 claude 턴 — 회신 자리와 진행 메시지를 기억한다. */
export interface MentionTurn {
  /** 트리거 멘션 메시지 logId */
  logId: string
  /** 회신할 채널 (멘션이 온 채널 — 글타래면 글타래 채널) */
  replyChannelId: string
  inThread: boolean
  organizationId?: string
  /** 진행 메시지 logId — 끝나면 완료로 고쳐 쓴다 */
  progressLogId?: string | null
  startedAt: number
  /** UserPromptSubmit 으로 이 턴의 입력이 claude 에 들어간 것을 확인했는지 */
  confirmed: boolean
}

export type StopDecision =
  /** followUp: 멘션 턴이 끝난 뒤 백그라운드 작업(하위 에이전트 등)이 이어져 나온 응답 */
  | { kind: 'mention'; turn: MentionTurn; followUp: boolean }
  | { kind: 'manual' }

/**
 * 채널 세션별 "지금 턴이 멘션에서 시작됐는가" 판정.
 *
 * TUI 에 사람이 직접 친 턴도 같은 Stop hook 을 부르므로, 그대로 두면 사적인 대화가 두레이로 나간다.
 * 멘션이 넣는 한 줄 입력에는 `tasks/{logId}.md` 가 들어 있어 UserPromptSubmit 의 prompt 로 구분한다.
 * UserPromptSubmit hook 이 없는 예전 설정이면 대기 중인 멘션 턴을 그대로 회신 대상으로 본다.
 *
 * 멘션 턴이 끝나도 그 채널은 사람이 TUI 에 직접 칠 때까지 "멘션 소유" 로 남는다 — claude 가 하위 에이전트를
 * 백그라운드로 돌려 두고 턴을 끝내면, 이어지는 위험 동작 승인과 뒤늦은 응답도 같은 두레이 자리로 가야 한다
 * (2026-10-13 실사용: 이걸 안 하면 승인이 PC 다이얼로그에만 뜨고 결과가 두레이로 안 나가 "멈춤" 으로 보였다).
 */
export class MentionTurnTracker {
  private pending = new Map<string, MentionTurn>()
  /** UserPromptSubmit 으로 사람이 직접 친 턴이라고 판정된 채널 */
  private manual = new Set<string>()
  /** 끝난 멘션 턴 — 백그라운드로 이어진 작업의 회신 자리 */
  private last = new Map<string, MentionTurn>()

  begin(channelId: string, turn: Omit<MentionTurn, 'confirmed'>): void {
    this.pending.set(channelId, { ...turn, confirmed: false })
    this.manual.delete(channelId)
    this.last.delete(channelId)
  }

  /** 진행 메시지 logId 를 나중에 채운다 (송신이 dispatch 보다 늦을 수 있어서). */
  setProgressLogId(channelId: string, progressLogId: string | null): void {
    const turn = this.pending.get(channelId)
    if (turn) turn.progressLogId = progressLogId
  }

  /** UserPromptSubmit — 이번 입력이 대기 중인 멘션의 한 줄인지 본다. 사람이 직접 친 입력이면 멘션 소유를 푼다. */
  onPromptSubmit(channelId: string, prompt: string): 'mention' | 'manual' {
    const turn = this.pending.get(channelId)
    if (turn && prompt.includes(`${turn.logId}.md`)) {
      turn.confirmed = true
      this.manual.delete(channelId)
      return 'mention'
    }
    this.manual.add(channelId)
    this.last.delete(channelId)
    return 'manual'
  }

  /** Stop — 회신할 턴이면 꺼낸다. 진행 중 턴이 없어도 끝난 멘션 턴이 남아 있으면 후속 회신으로 본다. */
  onStop(channelId: string): StopDecision {
    if (this.manual.has(channelId)) return { kind: 'manual' }
    const turn = this.pending.get(channelId)
    if (turn) {
      this.pending.delete(channelId)
      this.last.set(channelId, turn)
      return { kind: 'mention', turn, followUp: false }
    }
    const prev = this.last.get(channelId)
    if (prev) return { kind: 'mention', turn: { ...prev, progressLogId: null }, followUp: true }
    return { kind: 'manual' }
  }

  /** 멘션 처리가 claude 입력 전에 실패하면 대기 턴을 버린다 — 남겨 두면 다음 Stop 이 오회신 대상이 된다 */
  cancel(channelId: string): void {
    this.pending.delete(channelId)
  }

  /** 지금 이 채널 작업의 회신 자리 — 진행 중 턴, 없으면 백그라운드로 이어진 끝난 턴. 사람이 직접 친 턴이면 null */
  current(channelId: string): MentionTurn | null {
    if (this.manual.has(channelId)) return null
    return this.pending.get(channelId) ?? this.last.get(channelId) ?? null
  }

  has(channelId: string): boolean {
    return this.pending.has(channelId)
  }
}
