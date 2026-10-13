import type { MessengerAttachment } from '../../MessengerService'
import { extractSummaryLines, extractTitle, formatElapsed, plainText } from './DoorayFormatter'

/** 봇 메시지가 내 이름으로 올라가도 사람 발언과 구분되도록 카드 작성자 줄에 쓴다. */
export const CARD_AUTHOR = 'Clauday'

export const CARD_COLORS = {
  done: '#2E7D32',
  warn: '#E65100',
  info: '#1565C0',
  muted: '#9E9E9E'
} as const

export interface CompletionCardInput {
  /** 에이전트의 마지막 응답(마크다운) */
  answer: string
  elapsedMs: number
  /** 상세가 글타래로 간다면 그 안내 문구 (예: "글타래 3개") */
  detailNote?: string
}

/** 완료 카드 — 제목·요약 3줄·소요 시간. 카드 안은 평문만 렌더되므로 링크·코드 기호를 벗긴다. */
export function buildCompletionCard(input: CompletionCardInput): MessengerAttachment {
  const title = extractTitle(input.answer)
  const summary = extractSummaryLines(input.answer)
    .filter((l) => plainText(l) !== title)
    .join('\n')
  const fields: NonNullable<MessengerAttachment['fields']> = [
    { title: '소요', value: formatElapsed(input.elapsedMs), short: true }
  ]
  if (input.detailNote) fields.push({ title: '상세', value: input.detailNote, short: true })
  return {
    authorName: CARD_AUTHOR,
    title: `🟩 ${title}`,
    text: summary || undefined,
    color: CARD_COLORS.done,
    fields
  }
}
