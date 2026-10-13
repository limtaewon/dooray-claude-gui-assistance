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
    inThread: false,
    maskedSecrets: 0,
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

describe('buildPromptFromContext — 글타래/첨부/인용/마스킹/회신 형식', () => {
  const base: CollectedContext = {
    channelId: 'thr1',
    channelName: '🧵 전표 문의',
    mentionLogId: 'r2',
    inThread: false,
    maskedSecrets: 0,
    messages: [{ authorName: '동료', text: '답글 본문', sentAt: '2026-05-13T09:01:00Z' }]
  }

  it('글타래면 원글 섹션 + 답글 섹션 제목, 일반 채널이면 대화 섹션', () => {
    const thread = buildPromptFromContext({
      ...base,
      inThread: true,
      threadRoot: { authorName: '요청자', text: '원글 본문입니다', sentAt: '2026-05-13T08:00:00Z' }
    })
    expect(thread).toContain('## 글타래 원글')
    expect(thread).toContain('원글 본문입니다')
    expect(thread).toContain('## 글타래 답글 (시간 오름차순)')
    expect(thread.indexOf('## 글타래 원글')).toBeLessThan(thread.indexOf('## 글타래 답글'))
    expect(thread).not.toContain('## 대화 (시간 오름차순)')

    const channel = buildPromptFromContext(base)
    expect(channel).toContain('## 대화 (시간 오름차순)')
    expect(channel).not.toContain('## 글타래 원글')
  })

  it('원글을 못 찾으면 안내 문구', () => {
    const md = buildPromptFromContext({ ...base, inThread: true, threadRoot: null })
    expect(md).toContain('원글을 찾지 못했습니다')
  })

  it('첨부: 파일명, 내려받았으면 경로와 Read 안내', () => {
    const md = buildPromptFromContext({
      ...base,
      messages: [
        { authorName: 'A', text: '', sentAt: '2026-05-13T09:00:00Z', attachment: { fileId: '1', fileName: 'err.png', localPath: 'attachments/1-err.png' } },
        { authorName: 'B', text: '엑셀 첨부', sentAt: '2026-05-13T09:01:00Z', attachment: { fileId: '2', fileName: 'a.xlsx' } }
      ]
    })
    expect(md).toContain('[첨부: err.png → `attachments/1-err.png` (Read 로 열 수 있음)]')
    expect(md).toContain('엑셀 첨부 [첨부: a.xlsx]')
    expect(md).not.toContain('a.xlsx →')
  })

  it('인용 답장은 ↪ 인용 줄을 붙인다', () => {
    const md = buildPromptFromContext({
      ...base,
      messages: [{ authorName: 'A', text: '네 맞아요', sentAt: '2026-05-13T09:00:00Z', quote: '전표 확인 부탁' }]
    })
    expect(md).toContain('↪ 인용: "전표 확인 부탁"')
    expect(md).toContain('네 맞아요')
  })

  it('글타래 답글 수 표시', () => {
    const md = buildPromptFromContext({
      ...base,
      messages: [{ authorName: 'A', text: '본문', sentAt: '2026-05-13T09:00:00Z', threadCount: 7 }]
    })
    expect(md).toContain('(글타래 답글 7개)')
  })

  it('threadCount 없으면 답글 수 문구 없음', () => {
    expect(buildPromptFromContext(base)).not.toContain('글타래 답글 ')
  })

  it('가린 비밀값이 있을 때만 마스킹 안내', () => {
    expect(buildPromptFromContext({ ...base, maskedSecrets: 3 })).toContain('비밀값 3곳은 `****` 로 가렸습니다')
    expect(buildPromptFromContext(base)).not.toContain('가렸습니다')
  })

  it('두레이 회신 형식 섹션이 항상 포함', () => {
    const md = buildPromptFromContext(base)
    expect(md).toContain('## 회신 형식 (두레이 메신저)')
    expect(md).toContain('```md')
    expect(md.indexOf('## 회신 형식')).toBeLessThan(md.indexOf('## 채널 메모리 운영'))
  })

  it('잘못된 sentAt 은 원문 그대로 표기', () => {
    const md = buildPromptFromContext({ ...base, messages: [{ authorName: 'A', text: 'x', sentAt: 'not-a-date' }] })
    expect(md).toContain('**[not-a-date] A**')
  })
})

describe('buildPromptFromContext — 회신 형식 안내 (좁은 폭)', () => {
  const ctx: CollectedContext = { channelId: 'c', channelName: '채널', mentionLogId: 'l', inThread: false, maskedSecrets: 0, messages: [] }

  it('dooray-reply / internal-systems 스킬을 가리킨다', () => {
    const md = buildPromptFromContext(ctx)
    expect(md).toContain('`dooray-reply` 스킬')
    expect(md).toContain('`internal-systems` 스킬')
  })

  it('폭이 좁다는 안내와 "제목 한 줄 + 다음 줄 설명" 목록 규칙을 포함', () => {
    const md = buildPromptFromContext(ctx)
    expect(md).toContain('메신저 폭이 좁습니다')
    expect(md).toContain('제목 한 줄 + 다음 줄 설명')
    expect(md).toContain('묻는 답이면 질문')
  })
})

