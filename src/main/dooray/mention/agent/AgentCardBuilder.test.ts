import { describe, it, expect } from 'vitest'
import { CARD_AUTHOR, CARD_COLORS, buildCompletionCard } from './AgentCardBuilder'

describe('buildCompletionCard', () => {
  it('제목·작성자·색·소요 필드를 채운다', () => {
    const card = buildCompletionCard({ answer: '# 장애 리포트\n원인은 DB 락입니다.', elapsedMs: 192_000 })
    expect(card.title).toBe('🟩 장애 리포트')
    expect(card.authorName).toBe(CARD_AUTHOR)
    expect(card.color).toBe(CARD_COLORS.done)
    expect(card.fields).toEqual([{ title: '소요', value: '3:12', short: true }])
    expect(card.text).toBe('원인은 DB 락입니다.')
  })

  it('detailNote 가 있으면 상세 필드를 추가한다', () => {
    const card = buildCompletionCard({ answer: '# 제목\n본문', elapsedMs: 1000, detailNote: '글타래 3개' })
    expect(card.fields).toEqual([
      { title: '소요', value: '0:01', short: true },
      { title: '상세', value: '글타래 3개', short: true }
    ])
  })

  it('헤더가 없어 첫 문장이 제목이 되면 요약에서 같은 줄을 중복 표시하지 않는다', () => {
    const card = buildCompletionCard({ answer: '배포가 끝났습니다.\n영향 범위는 없습니다.', elapsedMs: 0 })
    expect(card.title).toBe('🟩 배포가 끝났습니다.')
    expect(card.text).toBe('영향 범위는 없습니다.')
  })

  it('요약은 최대 3줄, 줄바꿈으로 잇는다', () => {
    const card = buildCompletionCard({ answer: '# T\n하나\n둘\n셋\n넷', elapsedMs: 0 })
    expect(card.text).toBe('하나\n둘\n셋')
  })

  it('요약할 본문이 없으면 text 는 undefined', () => {
    const card = buildCompletionCard({ answer: '# 제목만', elapsedMs: 0 })
    expect(card.text).toBeUndefined()
  })

  it('카드 안은 평문 — 링크·코드·굵게 기호를 벗긴다', () => {
    const card = buildCompletionCard({ answer: '# **굵은** 제목\n[문서](https://a.b) 와 `code`', elapsedMs: 0 })
    expect(card.title).toBe('🟩 굵은 제목')
    expect(card.text).toBe('문서 와 code')
  })
})
