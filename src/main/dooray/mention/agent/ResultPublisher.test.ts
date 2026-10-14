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

describe('ResultPublisher.publish — 짧은 답은 진행 메시지 자리에', () => {
  it('한 조각 짧은 답 + progressLogId → 진행 메시지를 "✅ m:ss\\n본문" 으로 고쳐 쓰고 끝 (추가 송신 없음)', async () => {
    await pub.publish({ ...base, answer: '결론: 문제 없음', progressLogId: 'prog-1' })
    expect(m.updateMessage).toHaveBeenCalledTimes(1)
    expect(m.updateMessage).toHaveBeenCalledWith('c1', 'prog-1', '[Clauday] ✅ 3:12\n결론: 문제 없음')
    expect(m.sendMessage).not.toHaveBeenCalled()
    expect(m.sendCard).not.toHaveBeenCalled()
  })

  it('"✅ 완료 · ↓" 문구는 쓰지 않는다 (그 아래 본문이 따로 없으므로)', async () => {
    await pub.publish({ ...base, answer: '본문', progressLogId: 'p' })
    expect(m.updateMessage.mock.calls[0][2]).not.toContain('완료')
    expect(m.updateMessage.mock.calls[0][2]).not.toContain('↓')
  })

  it('여러 줄 답도 서식을 두레이용으로 바꿔 접두어 줄 아래에', async () => {
    await pub.publish({ ...base, answer: '## 결과\n- **성공** 3건', progressLogId: 'p' })
    expect(m.updateMessage.mock.calls[0][2]).toBe('[Clauday] ✅ 3:12\n▍결과\n• 성공 3건')
  })

  it('고쳐 쓰기가 실패하면 "완료 ↓" 표기를 시도하고 본문은 새 메시지로 보낸다 (응답을 잃지 않는다)', async () => {
    m.updateMessage.mockRejectedValueOnce(new Error('PUT 실패')).mockResolvedValue(undefined)
    await pub.publish({ ...base, answer: '본문', progressLogId: 'p' })
    expect(m.updateMessage).toHaveBeenCalledTimes(2)
    expect(m.updateMessage.mock.calls[1][2]).toBe('[Clauday] ✅ 완료 · 3:12 ↓')
    expect(m.sendMessage).toHaveBeenCalledWith('c1', '[Clauday] 본문', undefined)
  })

  it('고쳐 쓰기·완료 표기가 모두 실패해도 본문은 보낸다', async () => {
    m.updateMessage.mockRejectedValue(new Error('PUT 실패'))
    await expect(pub.publish({ ...base, answer: '본문', progressLogId: 'p' })).resolves.toBeNull()
    expect(m.sendMessage).toHaveBeenCalledTimes(1)
  })

  it('progressLogId 가 없으면 updateMessage 를 부르지 않고 새 메시지로 보낸다', async () => {
    await pub.publish({ ...base, answer: '본문', progressLogId: null })
    expect(m.updateMessage).not.toHaveBeenCalled()
    expect(m.sendMessage).toHaveBeenCalledWith('c1', '[Clauday] 본문', undefined)
  })

  it('600자를 넘는 질문 답(1500자 이하)은 긴 답이 아니므로 진행 메시지 자리에 고쳐 쓴다', async () => {
    const answer = '배경 설명입니다. '.repeat(70).trim() + '\n\n어떻게 할까요?'
    await pub.publish({ ...base, answer, progressLogId: 'p' })
    expect(m.updateMessage).toHaveBeenCalledTimes(1)
    expect(m.updateMessage.mock.calls[0][2]).toMatch(/^\[Clauday\] ✅ 3:12\n/)
    expect(m.createThreadAndSend).not.toHaveBeenCalled()
    expect(m.sendMessage).not.toHaveBeenCalled()
  })

  it('질문이어도 1500자를 넘으면 카드 + 글타래 (진행 메시지는 완료 ↓ 로 닫는다)', async () => {
    const para = '내용입니다. '.repeat(120).trim()
    const answer = [para, para, para].join('\n\n') + '\n\n어떻게 할까요?'
    await pub.publish({ ...base, answer, progressLogId: 'p' })
    expect(m.updateMessage.mock.calls[0][2]).toBe('[Clauday] ✅ 완료 · 3:12 ↓')
    expect(m.createThreadAndSend).toHaveBeenCalledTimes(1)
  })

  it('글타래 안(inThread)에서도 짧은 답은 진행 메시지 자리에', async () => {
    await pub.publish({ ...base, channelId: 'thread-9', inThread: true, answer: '짧음', progressLogId: 'p' })
    expect(m.updateMessage).toHaveBeenCalledWith('thread-9', 'p', '[Clauday] ✅ 3:12\n짧음')
    expect(m.sendMessage).not.toHaveBeenCalled()
  })
})

describe('ResultPublisher.publish — 빈 응답', () => {
  it('진행 메시지가 있으면 완료 표기만 하고 추가 송신은 없다', async () => {
    await pub.publish({ ...base, answer: '  \n', progressLogId: 'prog-1' })
    expect(m.updateMessage).toHaveBeenCalledWith('c1', 'prog-1', '[Clauday] ✅ 완료 · 3:12 ↓')
    expect(m.sendMessage).not.toHaveBeenCalled()
  })

  it('진행 메시지가 없으면 "응답 완료." 송신, updateMessage 는 없음', async () => {
    await pub.publish({ ...base, answer: '', progressLogId: null, organizationId: 'org1' })
    expect(m.sendMessage).toHaveBeenCalledWith('c1', '[Clauday] 응답 완료.', 'org1')
    expect(m.updateMessage).not.toHaveBeenCalled()
  })

  it('진행 메시지 완료 표기 실패는 throw 하지 않는다 (대체 송신도 없음)', async () => {
    m.updateMessage.mockRejectedValue(new Error('x'))
    await expect(pub.publish({ ...base, answer: '', progressLogId: 'p' })).resolves.toBeNull()
    expect(m.sendMessage).not.toHaveBeenCalled()
  })
})

describe('ResultPublisher.publish — 긴 답의 진행 메시지', () => {
  it('긴 답은 진행 메시지를 "✅ 완료 · m:ss ↓" 로 닫은 뒤 카드 + 글타래 (카드가 아래에 오므로 화살표)', async () => {
    await pub.publish({ ...base, answer: longMarkdown(), progressLogId: 'prog-1' })
    expect(m.updateMessage).toHaveBeenCalledWith('c1', 'prog-1', '[Clauday] ✅ 완료 · 3:12 ↓')
    expect(m.updateMessage.mock.invocationCallOrder[0]).toBeLessThan(m.createThreadAndSend.mock.invocationCallOrder[0])
  })

  it('진행 메시지가 없으면 긴 답에서도 updateMessage 없음', async () => {
    await pub.publish({ ...base, answer: longMarkdown(), progressLogId: null })
    expect(m.updateMessage).not.toHaveBeenCalled()
  })

  it('긴 답에서 완료 표기가 실패해도 카드·글타래는 보낸다', async () => {
    m.updateMessage.mockRejectedValue(new Error('x'))
    await pub.publish({ ...base, answer: longMarkdown(), progressLogId: 'p' })
    expect(m.createThreadAndSend).toHaveBeenCalled()
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
    await expect(pub.publish({ ...base, answer: '본문' })).resolves.toBeNull()
    expect(console.warn).toHaveBeenCalled()
  })

  it('빈 응답 송신 실패도 throw 하지 않음', async () => {
    m.sendMessage.mockRejectedValue(new Error('net'))
    await expect(pub.publish({ ...base, answer: '' })).resolves.toBeNull()
  })

  it('카드 송신 실패에도 조각 송신은 계속', async () => {
    m.sendCard.mockRejectedValue(new Error('card'))
    await expect(pub.publish({ ...base, inThread: true, answer: longMarkdown() })).resolves.toBeNull()
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
    expect(m.updateMessage.mock.calls[0][2]).toBe('[Clauday] ✅ 1:05\nx')
  })
})

describe('ResultPublisher.publish — 되묻는 답', () => {
  const ask = '어느 쪽으로 할까요?\n1) 상신\n2) 임시저장'

  it('진행 메시지에 쓴 질문 — 끝에 반응 안내 한 줄을 붙이고 그 메시지를 돌려준다', async () => {
    const asked = await pub.publish({ ...base, answer: ask, progressLogId: 'p1' })
    const text = m.updateMessage.mock.calls[0][2] as string
    expect(text.endsWith('↳ 1️⃣ 2️⃣ 반응이나 번호 답장으로 골라 주세요 (@clauday 없이)')).toBe(true)
    expect(asked).toEqual({ logId: 'p1', text, question: { kind: 'choice', options: ['상신', '임시저장'] } })
  })

  it('새 메시지로 보낸 질문은 그 메시지 logId', async () => {
    const asked = await pub.publish({ ...base, answer: '어느 저장소인가요?' })
    expect(asked?.logId).toBe('log-1')
    expect(asked?.question).toEqual({ kind: 'open' })
  })

  it('묻지 않는 답·글타래로 간 긴 답은 null', async () => {
    expect(await pub.publish({ ...base, answer: '완료했습니다.' })).toBeNull()
    expect(await pub.publish({ ...base, answer: longMarkdown() })).toBeNull()
  })
})
