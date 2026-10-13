import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MESSAGE_PREFIX, ResultPublisher, withPrefix } from './ResultPublisher'
import { MESSAGE_CHUNK_LIMIT } from './DoorayFormatter'

function makeMessenger() {
  return {
    sendMessage: vi.fn().mockResolvedValue('log-1'),
    sendCard: vi.fn().mockResolvedValue('card-1'),
    updateMessage: vi.fn().mockResolvedValue(undefined),
    createThreadAndSend: vi.fn().mockResolvedValue({ threadChannelId: 'thread-1' })
  }
}

/** 600자를 넘기고 2000자 한도로 3조각 이상 나뉘는 긴 마크다운 */
function longMarkdown(): string {
  const para = (n: number): string => `문단 ${n} ` + '내용입니다. '.repeat(60)
  return '# 긴 리포트\n\n' + Array.from({ length: 8 }, (_, i) => para(i)).join('\n\n')
}

let m: ReturnType<typeof makeMessenger>
let pub: ResultPublisher

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  m = makeMessenger()
  pub = new ResultPublisher(m as never)
})
afterEach(() => vi.restoreAllMocks())

const base = { channelId: 'c1', inThread: false, startedAt: 0, now: 192_000 }

describe('withPrefix', () => {
  it('한 줄이면 같은 줄, 여러 줄이면 접두어를 첫 줄에 따로', () => {
    expect(withPrefix('안녕')).toBe(`${MESSAGE_PREFIX} 안녕`)
    expect(withPrefix('a\nb')).toBe(`${MESSAGE_PREFIX}\na\nb`)
  })
})

describe('ResultPublisher.publish — 짧은 답', () => {
  it('본문 text 한 번, 접두어 포함, 카드/글타래 없음', async () => {
    await pub.publish({ ...base, answer: '결론: 문제 없음', organizationId: 'org1' })
    expect(m.sendMessage).toHaveBeenCalledTimes(1)
    expect(m.sendMessage).toHaveBeenCalledWith('c1', '[Clauday] 결론: 문제 없음', 'org1')
    expect(m.sendCard).not.toHaveBeenCalled()
    expect(m.createThreadAndSend).not.toHaveBeenCalled()
  })

  it('마크다운은 두레이 평문으로 바뀌어 나간다', async () => {
    await pub.publish({ ...base, answer: '## 결과\n- **성공** 3건' })
    expect(m.sendMessage.mock.calls[0][1]).toBe('[Clauday]\n▍결과\n• 성공 3건')
  })

  it('빈 응답은 "응답 완료."', async () => {
    await pub.publish({ ...base, answer: '   \n ' })
    expect(m.sendMessage).toHaveBeenCalledWith('c1', '[Clauday] 응답 완료.', undefined)
  })
})

describe('ResultPublisher.publish — 진행 메시지', () => {
  it('progressLogId 가 있으면 완료 · m:ss ↓ 로 고쳐 쓴다', async () => {
    await pub.publish({ ...base, answer: '끝', progressLogId: 'prog-1' })
    expect(m.updateMessage).toHaveBeenCalledWith('c1', 'prog-1', '[Clauday] ✅ 완료 · 3:12 ↓')
  })

  it('progressLogId 가 없으면 updateMessage 를 부르지 않는다', async () => {
    await pub.publish({ ...base, answer: '끝', progressLogId: null })
    expect(m.updateMessage).not.toHaveBeenCalled()
  })

  it('진행 메시지 수정이 실패해도 본문은 보낸다', async () => {
    m.updateMessage.mockRejectedValue(new Error('PUT 실패'))
    await expect(pub.publish({ ...base, answer: '본문', progressLogId: 'p' })).resolves.toBeUndefined()
    expect(m.sendMessage).toHaveBeenCalledTimes(1)
  })

  it('완료 갱신이 본문 송신보다 먼저', async () => {
    const order: string[] = []
    m.updateMessage.mockImplementation(async () => { order.push('update') })
    m.sendMessage.mockImplementation(async () => { order.push('send'); return 'x' })
    await pub.publish({ ...base, answer: '본문', progressLogId: 'p' })
    expect(order).toEqual(['update', 'send'])
  })
})

describe('ResultPublisher.publish — 긴 답, 채널 멘션', () => {
  it('createThreadAndSend 에 카드 원글 + 첫 조각, 나머지 조각은 글타래 채널로', async () => {
    await pub.publish({ ...base, answer: longMarkdown(), organizationId: 'org1' })
    expect(m.createThreadAndSend).toHaveBeenCalledTimes(1)
    const [channelId, root, firstChunk] = m.createThreadAndSend.mock.calls[0]
    expect(channelId).toBe('c1')
    expect(root.text).toBe(MESSAGE_PREFIX)
    expect(root.attachments).toHaveLength(1)
    expect(root.attachments[0].title).toBe('🟩 긴 리포트')
    expect(root.attachments[0].fields).toContainEqual({ title: '상세', value: expect.stringMatching(/^글타래 \d+개$/), short: true })
    expect(root.attachments[0].fields).toContainEqual({ title: '소요', value: '3:12', short: true })

    const rest = m.sendMessage.mock.calls
    expect(rest.length).toBeGreaterThanOrEqual(1)
    for (const call of rest) {
      expect(call[0]).toBe('thread-1')
      expect(call[2]).toBe('org1')
    }
    const n = rest.length + 1
    expect(firstChunk.startsWith(`(1/${n})\n`)).toBe(true)
    rest.forEach((call, i) => expect((call[1] as string).startsWith(`(${i + 2}/${n})\n`)).toBe(true))
    for (const text of [firstChunk, ...rest.map((c) => c[1] as string)]) {
      expect(text.length).toBeLessThanOrEqual(MESSAGE_CHUNK_LIMIT)
    }
    expect(m.sendCard).not.toHaveBeenCalled()
  })

  it('조각이 하나뿐이면 (i/n) 라벨을 붙이지 않는다', async () => {
    const table = '| a | b |\n|---|---|\n| 1 | 2 |'
    await pub.publish({ ...base, answer: table })
    const [, , first] = m.createThreadAndSend.mock.calls[0]
    expect(first).toBe('• 1 — b: 2')
    expect(m.sendMessage).not.toHaveBeenCalled()
  })

  it('글타래 생성이 throw 하면 같은 채널에 카드 + 전문 폴백', async () => {
    m.createThreadAndSend.mockRejectedValue(new Error('500'))
    await pub.publish({ ...base, answer: longMarkdown() })
    expect(m.sendCard).toHaveBeenCalledTimes(1)
    expect(m.sendCard.mock.calls[0][0]).toBe('c1')
    expect(m.sendCard.mock.calls[0][1]).toBe(MESSAGE_PREFIX)
    expect(m.sendMessage.mock.calls.length).toBeGreaterThanOrEqual(2)
    for (const c of m.sendMessage.mock.calls) expect(c[0]).toBe('c1')
    expect(m.sendMessage.mock.calls[0][1]).toMatch(/^\(1\/\d+\)\n/)
  })

  it('threadChannelId 가 null 이어도 같은 채널 폴백 — 첫 조각을 잃지 않는다', async () => {
    m.createThreadAndSend.mockResolvedValue({ threadChannelId: null })
    await pub.publish({ ...base, answer: longMarkdown() })
    expect(m.sendCard).toHaveBeenCalledTimes(1)
    const sentTexts = m.sendMessage.mock.calls.map((c) => c[1] as string)
    expect(sentTexts[0]).toMatch(/^\(1\/\d+\)/)
    const total = Number(/^\(1\/(\d+)\)/.exec(sentTexts[0])![1])
    expect(sentTexts).toHaveLength(total)
  })
})

describe('ResultPublisher.publish — 긴 답, 글타래 안 멘션', () => {
  it('새 글타래를 만들지 않고 sendCard 후 같은 채널에 조각', async () => {
    await pub.publish({ ...base, channelId: 'thread-9', inThread: true, answer: longMarkdown(), organizationId: 'org1' })
    expect(m.createThreadAndSend).not.toHaveBeenCalled()
    expect(m.sendCard).toHaveBeenCalledTimes(1)
    const [ch, text, cards, org] = m.sendCard.mock.calls[0]
    expect(ch).toBe('thread-9')
    expect(text).toBe(MESSAGE_PREFIX)
    expect(org).toBe('org1')
    expect(cards[0].fields).toContainEqual({ title: '상세', value: expect.stringMatching(/^아래 \d+개$/), short: true })
    expect(m.sendMessage.mock.calls.length).toBeGreaterThanOrEqual(2)
    for (const c of m.sendMessage.mock.calls) expect(c[0]).toBe('thread-9')
    // 카드가 조각보다 먼저
    expect(m.sendCard.mock.invocationCallOrder[0]).toBeLessThan(m.sendMessage.mock.invocationCallOrder[0])
  })
})

describe('ResultPublisher.publish — 송신 실패', () => {
  it('sendMessage 실패는 throw 하지 않고 warn', async () => {
    m.sendMessage.mockRejectedValue(new Error('net'))
    await expect(pub.publish({ ...base, answer: '본문' })).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalled()
  })

  it('빈 응답 송신 실패도 throw 하지 않음', async () => {
    m.sendMessage.mockRejectedValue(new Error('net'))
    await expect(pub.publish({ ...base, answer: '' })).resolves.toBeUndefined()
  })

  it('카드 송신 실패에도 조각 송신은 계속', async () => {
    m.sendCard.mockRejectedValue(new Error('card'))
    await expect(pub.publish({ ...base, inThread: true, answer: longMarkdown() })).resolves.toBeUndefined()
    expect(m.sendMessage).toHaveBeenCalled()
  })

  it('조각 하나가 실패해도 나머지는 계속 보낸다', async () => {
    m.sendMessage.mockRejectedValueOnce(new Error('first')).mockResolvedValue('ok')
    await pub.publish({ ...base, inThread: true, answer: longMarkdown() })
    expect(m.sendMessage.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('now 미지정이면 Date.now 기준 경과 시간', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(65_000)
    await pub.publish({ channelId: 'c1', inThread: false, answer: 'x', startedAt: 0, progressLogId: 'p' })
    vi.useRealTimers()
    expect(m.updateMessage.mock.calls[0][2]).toContain('1:05')
  })
})
