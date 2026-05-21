import { describe, it, expect } from 'vitest'
import { extractUserRequest, buildPromptFromContext } from './promptBuilder'
import type { CollectedContext } from './ContextCollector'

describe('extractUserRequest', () => {
  it('맨 앞 @trigger 멘션을 제거한다', () => {
    expect(extractUserRequest('@clauday 이 내용 파악해서 알려줘', 'clauday'))
      .toBe('이 내용 파악해서 알려줘')
  })

  it('대소문자 무시', () => {
    expect(extractUserRequest('@Clauday 안녕', 'clauday')).toBe('안녕')
  })

  it('@trigger 앞 공백 흡수', () => {
    expect(extractUserRequest('   @clauday\t요청', 'clauday')).toBe('요청')
  })

  it('본문 중간의 @trigger 는 그대로 둔다', () => {
    expect(extractUserRequest('지난번 @clauday 호출 보자', 'clauday'))
      .toBe('지난번 @clauday 호출 보자')
  })

  it('정규식 메타문자가 포함된 트리거도 안전하게 escape', () => {
    expect(extractUserRequest('@bot.v2 hi', 'bot.v2')).toBe('hi')
  })

  it('멘션만 있고 본문 없으면 빈 문자열', () => {
    expect(extractUserRequest('@clauday', 'clauday')).toBe('')
  })
})

describe('buildPromptFromContext', () => {
  const baseCtx: CollectedContext = {
    channelId: 'ch-1',
    channelName: '테스트채널',
    mentionLogId: 'log-99',
    messages: [
      { authorName: '임태원', text: '리뷰 부탁드려요', sentAt: '2026-05-13T09:00:00Z' },
      { authorName: '동료', text: '확인할게요', sentAt: '2026-05-13T09:01:00Z' }
    ]
  }

  it('채널명과 메시지를 마크다운으로 포함', () => {
    const md = buildPromptFromContext(baseCtx)
    expect(md).toContain('"테스트채널"')
    expect(md).toContain('임태원')
    expect(md).toContain('리뷰 부탁드려요')
    expect(md).toContain('동료')
  })

  it('메시지 없으면 안내 문구', () => {
    const md = buildPromptFromContext({ ...baseCtx, messages: [] })
    expect(md).toContain('대화 본문을 가져오지 못했습니다')
  })

  it('CLAUDE.md 채널 메모리 운영 가이드 포함', () => {
    const md = buildPromptFromContext(baseCtx)
    expect(md).toContain('채널 메모리 운영')
    expect(md).toContain('CLAUDE.md')
  })
})
