import type { MessengerService } from '../../MessengerService'
import { endsWithQuestion } from './DoorayFormatter'

/**
 * 에이전트가 되물은 회신.
 *  - choice: 번호 선택지(1) … 2) …) — 숫자 반응·번호 답장
 *  - confirm: 진행해도 되는지 — ✅/❌ 반응·예/아니오 답장
 *  - open: 그 밖의 질문 — 답장만
 */
export type AgentQuestion =
  | { kind: 'choice'; options: string[] }
  | { kind: 'confirm' }
  | { kind: 'open' }

const OPTION_LINE = /^\s*(?:\*\*)?([1-9])(?:\*\*)?[).](?:\*\*)?\s+(.+?)\s*$/
/** 선택지 사이에 끼어도 되는 줄 수 */
const OPTION_GAP_LINES = 3
const CHOICE_CUE = /(중\s*하나|골라|고르|선택|답\s*(?:해\s*)?주세요|어느|어떤\s*(?:걸|것|쪽|방식)|할까요|원하시)/
const CONFIRM_CUE = /(해도\s*될까요|할까요|진행할까요|올릴까요|보낼까요|될지\s*확인|괜찮을까요|맞을까요|진행해도\s*될|승인해\s*주)/

/** 회신이 사용자에게 묻는 것인지, 묻는다면 어떻게 답할 수 있는지. 묻지 않으면 null. */
export function detectQuestion(markdown: string): AgentQuestion | null {
  const lines = markdown.split('\n')
  let best: { start: number; end: number; options: string[] } | null = null
  for (let i = 0; i < lines.length; i++) {
    const first = OPTION_LINE.exec(lines[i])
    if (!first || first[1] !== '1') continue
    const options = [first[2]]
    let end = i
    // 선택지 사이의 빈 줄·설명 줄(제목 한 줄 + 다음 줄 설명)은 건너뛴다
    for (let j = i + 1; j < lines.length && j - end <= OPTION_GAP_LINES + 1; j++) {
      const m = OPTION_LINE.exec(lines[j])
      if (!m) continue
      if (Number(m[1]) !== options.length + 1) break
      options.push(m[2])
      end = j
    }
    if (options.length >= 2) best = { start: i, end, options }
    i = end
  }
  if (best) {
    // 단계 설명 같은 번호 목록은 선택지가 아니다 — 앞뒤에 고르라는 말이 있어야 한다
    const around = [...lines.slice(Math.max(0, best.start - 2), best.start), ...lines.slice(best.end + 1, best.end + 3)].join('\n')
    if (CHOICE_CUE.test(around)) return { kind: 'choice', options: best.options.map(cleanOption) }
  }
  if (CONFIRM_CUE.test(markdown)) return { kind: 'confirm' }
  return endsWithQuestion(markdown) ? { kind: 'open' } : null
}

function cleanOption(text: string): string {
  return text.replace(/\*\*|`/g, '').trim()
}

const KEYCAPS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣']

/** 회신 끝에 붙이는 답하는 법 한 줄 */
export function questionHint(q: AgentQuestion): string {
  if (q.kind === 'choice') return `↳ ${KEYCAPS.slice(0, q.options.length).join(' ')} 반응이나 번호 답장으로 골라 주세요 (@clauday 없이)`
  if (q.kind === 'confirm') return '↳ ✅ 진행 · ❌ 취소 반응이나 답장으로 답해 주세요 (@clauday 없이)'
  return '↳ @clauday 없이 답장해도 이어서 받습니다'
}

const NUMBER_NAMES = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const YES_REACTIONS = new Set(['white_check_mark', 'heavy_check_mark', 'ballot_box_with_check', '+1', 'thumbsup', 'ok_hand', 'o', 'ok'])
const NO_REACTIONS = new Set(['x', 'negative_squared_cross_mark', 'no_entry', 'no_entry_sign', '-1', 'thumbsdown'])

/** 반응 이름 → 번호(1~9). 두레이 이름 규칙이 확인되지 않아 흔한 표기를 모두 받는다 */
function reactionNumber(value: string): number | null {
  const v = value.toLowerCase()
  const byName = NUMBER_NAMES.indexOf(v.replace(/^(keycap_|digit_)/, ''))
  if (byName >= 0) return byName + 1
  const digit = /^(?:keycap_|digit_)?([1-9])$/.exec(v)
  return digit ? Number(digit[1]) : null
}

export type QuestionAnswer = { kind: 'option'; index: number } | { kind: 'yes' } | { kind: 'no' } | { kind: 'text'; text: string }

/** 질문 메시지에 내가 누른 반응 → 답. 거절(❌)이 하나라도 있으면 거절이 이긴다 */
export function parseQuestionReactions(reactions: unknown, myMemberId: string, q: AgentQuestion): QuestionAnswer | null {
  if (q.kind === 'open' || !Array.isArray(reactions)) return null
  const mine = reactions
    .filter((r): r is { value: string; memberIds?: unknown } => !!r && typeof (r as { value?: unknown }).value === 'string')
    .filter((r) => Array.isArray(r.memberIds) && (r.memberIds as unknown[]).map(String).includes(myMemberId))
    .map((r) => r.value)
  if (mine.some((v) => NO_REACTIONS.has(v))) return { kind: 'no' }
  if (q.kind === 'choice') {
    const n = mine.map(reactionNumber).find((x): x is number => x !== null && x <= q.options.length)
    return n ? { kind: 'option', index: n } : null
  }
  return mine.some((v) => YES_REACTIONS.has(v)) ? { kind: 'yes' } : null
}

/**
 * 내 답장 → 답. 번호·예/아니오처럼 읽히는 짧은 답은 언제든, 그 밖의 문장은 질문 직후(freeText)에만 받는다
 * — 시간이 지나 같은 채널에서 다른 사람과 나누는 말을 답으로 삼키지 않도록.
 */
export function parseQuestionReply(text: string, q: AgentQuestion, freeText: boolean): QuestionAnswer | null {
  const t = text.trim()
  // Clauday 가 내 토큰으로 보낸 메시지도 내 메시지로 온다
  if (!t || t.startsWith('[Clauday]')) return null
  if (q.kind === 'choice') {
    const m = /^([1-9])\s*번?\s*[).,:]?(?:\s+([\s\S]+))?$/.exec(t)
    if (m && Number(m[1]) <= q.options.length) {
      return m[2] ? { kind: 'text', text: `${m[1]}) ${q.options[Number(m[1]) - 1]} — 이걸로 진행해 주세요. ${m[2].trim()}` } : { kind: 'option', index: Number(m[1]) }
    }
  }
  if (q.kind !== 'open') {
    if (/^(네|넵|예|응|ㅇㅇ|ㅇㅋ|좋아요?|진행(?:해\s*줘|해\s*주세요)?|ok|okay|yes|y)[.!]?$/i.test(t)) return { kind: 'yes' }
    if (/^(아니요?|아뇨|ㄴㄴ|취소|중단|멈춰|no|n)[.!]?$/i.test(t)) return { kind: 'no' }
  }
  return freeText ? { kind: 'text', text: t } : null
}

/** 답 → claude 에 넣을 요청 문장 */
export function answerToRequest(answer: QuestionAnswer, q: AgentQuestion): string {
  switch (answer.kind) {
    case 'option':
      return q.kind === 'choice' ? `${answer.index}) ${q.options[answer.index - 1]} — 이걸로 진행해 주세요.` : `${answer.index}번으로 진행해 주세요.`
    case 'yes':
      return '네, 그대로 진행해 주세요.'
    case 'no':
      return q.kind === 'choice' ? '아니요, 어느 것도 하지 말고 멈춰 주세요.' : '아니요, 진행하지 말고 멈춰 주세요.'
    case 'text':
      return answer.text
  }
}

/** 질문 뒤 이 시간 안의 내 메시지는 문장이어도 답으로 본다 */
const FREE_TEXT_WINDOW_MS = 10 * 60 * 1000
/** 이 시간이 지나면 반응·답장을 더 기다리지 않는다 */
const WATCH_MS = 2 * 60 * 60 * 1000
/** 처음 몇 분은 자주, 그 뒤는 드물게 반응을 본다 */
const FAST_POLL_MS = 3_000
const FAST_PHASE_MS = 5 * 60 * 1000
const SLOW_POLL_MS = 15_000
const POLL_FETCH_SIZE = 50

/** 질문이 나온 멘션 턴의 자리 — 답을 다음 턴으로 넣을 때 그대로 이어 쓴다 */
export interface QuestionOrigin {
  /** 세션 채널(작업 폴더 기준) */
  channelId: string
  /** 질문 메시지가 있는 채널 */
  replyChannelId: string
  questionLogId: string
  /** 질문 메시지 원문 — 답을 받으면 안내 줄을 고른 값으로 바꿔 쓴다 */
  questionText: string
  question: AgentQuestion
  organizationId?: string
  inThread: boolean
  parentChannelId?: string
  channelDisplayName?: string
}

export interface ReceivedAnswer {
  origin: QuestionOrigin
  /** 답 메시지 logId — 반응이면 질문 메시지 logId */
  logId: string
  /** claude 에 넣을 요청 문장 */
  request: string
}

export interface QuestionWatcherDeps {
  messenger: Pick<MessengerService, 'fetchChannelLogs' | 'updateMessage'>
  getMyMemberId: () => Promise<string | null>
  /** 받은 답을 다음 멘션 턴으로 넣는다 */
  onAnswer: (answer: ReceivedAnswer) => void
  now?: () => number
}

interface Watching {
  origin: QuestionOrigin
  askedAt: number
  timer: ReturnType<typeof setTimeout> | null
}

/**
 * 에이전트가 되물은 회신에 `@clauday` 없이 답하게 한다 (plan 6-1).
 * 질문 메시지에 내가 누른 숫자·✅❌ 반응을 주기적으로 보고, 같은 채널의 내 단독 답장도 받는다. 채널당 마지막 질문 하나만 기다린다.
 */
export class QuestionWatcher {
  private watching = new Map<string, Watching>()

  constructor(private deps: QuestionWatcherDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  isWatching(replyChannelId: string): boolean {
    return this.watching.has(replyChannelId)
  }

  watch(origin: QuestionOrigin): void {
    this.clear(origin.replyChannelId)
    const w: Watching = { origin, askedAt: this.now(), timer: null }
    this.watching.set(origin.replyChannelId, w)
    console.log(`[QuestionWatcher] 답 대기 channelId=${origin.replyChannelId} logId=${origin.questionLogId} kind=${origin.question.kind}`)
    if (origin.question.kind !== 'open') this.schedule(w)
  }

  /** 새 멘션이 오거나 답을 받으면 기다림을 접는다 */
  clear(replyChannelId: string): void {
    const w = this.watching.get(replyChannelId)
    if (!w) return
    if (w.timer) clearTimeout(w.timer)
    this.watching.delete(replyChannelId)
  }

  cancelAll(): void {
    for (const id of [...this.watching.keys()]) this.clear(id)
  }

  /** 채널에 온 내 메시지 — 기다리던 답이면 처리하고 true(소비됨). */
  onReply(replyChannelId: string, text: string, logId: string): boolean {
    const w = this.watching.get(replyChannelId)
    if (!w) return false
    const freeText = this.now() - w.askedAt <= FREE_TEXT_WINDOW_MS
    const answer = parseQuestionReply(text, w.origin.question, freeText)
    if (!answer) return false
    this.accept(w, answer, logId)
    return true
  }

  private schedule(w: Watching): void {
    const age = this.now() - w.askedAt
    if (age >= WATCH_MS) {
      console.log(`[QuestionWatcher] 답 대기 만료 channelId=${w.origin.replyChannelId} logId=${w.origin.questionLogId}`)
      this.clear(w.origin.replyChannelId)
      return
    }
    w.timer = setTimeout(() => void this.poll(w), age < FAST_PHASE_MS ? FAST_POLL_MS : SLOW_POLL_MS)
  }

  private async poll(w: Watching): Promise<void> {
    if (this.watching.get(w.origin.replyChannelId) !== w) return
    const answer = await this.readReaction(w)
    if (this.watching.get(w.origin.replyChannelId) !== w) return
    if (answer) this.accept(w, answer, w.origin.questionLogId)
    else this.schedule(w)
  }

  private async readReaction(w: Watching): Promise<QuestionAnswer | null> {
    const { replyChannelId, questionLogId, question } = w.origin
    try {
      const myId = await this.deps.getMyMemberId()
      if (!myId) return null
      const logs = await this.deps.messenger.fetchChannelLogs(replyChannelId, POLL_FETCH_SIZE)
      const msg = logs.find((l) => l.id === questionLogId)
      if (!msg) return null
      const answer = parseQuestionReactions(msg.reactions, myId, question)
      if (!answer && Array.isArray(msg.reactions) && msg.reactions.length > 0) {
        // 두레이 반응 이름 규칙 확인용 — 숫자 반응을 못 읽으면 여기 값으로 매핑을 보강한다
        const values = (msg.reactions as Array<{ value?: unknown }>).map((r) => String(r.value)).join(',')
        console.log(`[QuestionWatcher] 판정 안 된 반응 channelId=${replyChannelId} logId=${questionLogId} values=${values}`)
      }
      return answer
    } catch (err) {
      console.warn(`[QuestionWatcher] 반응 확인 실패 channelId=${replyChannelId} logId=${questionLogId}:`, err)
      return null
    }
  }

  private accept(w: Watching, answer: QuestionAnswer, logId: string): void {
    this.clear(w.origin.replyChannelId)
    const request = answerToRequest(answer, w.origin.question)
    console.log(`[QuestionWatcher] 답 받음 channelId=${w.origin.replyChannelId} logId=${logId} kind=${answer.kind}`)
    void this.markAnswered(w.origin, answer)
    this.deps.onAnswer({ origin: w.origin, logId, request })
  }

  /** 질문 메시지의 안내 줄을 고른 값으로 바꾼다 — 나중에 봐도 무엇을 골랐는지 남게 */
  private async markAnswered(origin: QuestionOrigin, answer: QuestionAnswer): Promise<void> {
    const picked =
      answer.kind === 'option' ? `↳ ${KEYCAPS[answer.index - 1]} 선택됨` : answer.kind === 'yes' ? '↳ ✅ 진행' : answer.kind === 'no' ? '↳ ❌ 취소' : '↳ 답장 받음'
    const hint = questionHint(origin.question)
    const text = origin.questionText.includes(hint) ? origin.questionText.replace(hint, picked) : `${origin.questionText}\n\n${picked}`
    try {
      await this.deps.messenger.updateMessage(origin.replyChannelId, origin.questionLogId, text)
    } catch (err) {
      console.warn(`[QuestionWatcher] 질문 메시지 갱신 실패 channelId=${origin.replyChannelId} logId=${origin.questionLogId}:`, err)
    }
  }
}
