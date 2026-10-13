import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApprovalBroker, describeToolRequest, parseApprovalReply, toHookResponse, type ApprovalRequest } from './ApprovalBroker'
import { CARD_COLORS } from './AgentCardBuilder'

describe('parseApprovalReply', () => {
  it.each(['승인', '허용', 'ㅇㅋ', 'ok', 'OK', 'okay', 'yes', 'Yes', 'y', '승인.', 'ok!', '  승인  ', '[Clauday] 승인'])(
    '승인: %s',
    (t) => expect(parseApprovalReply(t)).toEqual({ kind: 'allow' })
  )

  it.each(['항상 승인', '항상승인', '항상  허용', 'always', 'Always'])('항상 승인: %s', (t) =>
    expect(parseApprovalReply(t)).toEqual({ kind: 'always' })
  )

  it('거절 — 사유 없음', () => {
    expect(parseApprovalReply('거절')).toEqual({ kind: 'deny', reason: undefined })
    expect(parseApprovalReply('no')).toEqual({ kind: 'deny' })
    expect(parseApprovalReply('No.')).toEqual({ kind: 'deny' })
    expect(parseApprovalReply('n')).toEqual({ kind: 'deny' })
    expect(parseApprovalReply('거부')).toEqual({ kind: 'deny', reason: undefined })
  })

  it.each([
    ['거절 운영 DB 는 안 돼', '운영 DB 는 안 돼'],
    ['거절: 위험함', '위험함'],
    ['거절, 나중에', '나중에'],
    ['거절\n두 줄 사유', '두 줄 사유']
  ])('거절 [사유]: %s', (t, reason) => {
    expect(parseApprovalReply(t)).toEqual({ kind: 'deny', reason })
  })

  it.each([
    '승인 절차가 복잡해요',
    '승인했습니다',
    '거절당했어요',
    '거부감이 들어요',
    '이거 ok 인가요?',
    '안녕하세요',
    '',
    '   ',
    '항상 승인해줘요',
    'no problem',
    'no worries',
    'no 라고 하기엔 애매해요',
    'n번째 확인'
  ])('일반 문장은 null: %s', (t) => {
    expect(parseApprovalReply(t)).toBeNull()
  })
})

describe('describeToolRequest', () => {
  it('Bash — 명령 + 설명', () => {
    expect(describeToolRequest('Bash', { command: 'rm -rf ./tmp', description: '임시 폴더 삭제' })).toEqual({
      title: '명령 실행',
      detail: 'rm -rf ./tmp\n(임시 폴더 삭제)'
    })
  })

  it('Bash — 설명이 없으면 명령만, 400자 초과는 … 로 자른다', () => {
    expect(describeToolRequest('Bash', { command: 'ls' }).detail).toBe('ls')
    const d = describeToolRequest('Bash', { command: 'x'.repeat(500) }).detail
    expect(d).toHaveLength(400)
    expect(d.endsWith('…')).toBe(true)
  })

  it.each(['Write', 'Edit', 'MultiEdit'])('%s — 파일 경로', (tool) => {
    expect(describeToolRequest(tool, { file_path: '/a/b.ts', content: '비밀' })).toEqual({ title: '파일 수정', detail: '/a/b.ts' })
  })

  it('WebFetch — url', () => {
    expect(describeToolRequest('WebFetch', { url: 'https://a.b' })).toEqual({ title: '웹 접근', detail: 'https://a.b' })
  })

  it('MCP — "서버 · 도구" 제목과 입력 JSON', () => {
    expect(describeToolRequest('mcp__dooray-mcp__create_task', { subject: 'x' })).toEqual({
      title: 'dooray-mcp · create_task',
      detail: '{"subject":"x"}'
    })
  })

  it('기타 도구 — 이름 그대로, 빈 입력이면 detail 빈 문자열, 300자 초과는 자른다', () => {
    expect(describeToolRequest('Foo', {})).toEqual({ title: 'Foo', detail: '' })
    const d = describeToolRequest('Foo', { a: 'y'.repeat(500) }).detail
    expect(d).toHaveLength(300)
    expect(d.endsWith('…')).toBe(true)
  })

  it('문자열이 아닌 입력 값은 빈 문자열로 취급', () => {
    expect(describeToolRequest('Bash', { command: 123 }).detail).toBe('')
  })
})

describe('toHookResponse', () => {
  it('null 이면 빈 객체 (결정 안 함)', () => {
    expect(toHookResponse(null)).toEqual({})
  })

  it('allow 는 PreToolUse 형식 permissionDecision=allow', () => {
    expect(toHookResponse({ behavior: 'allow' })).toEqual({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: '두레이에서 승인됨' }
    })
    // always 여도 응답 형태는 같다 (기억은 호출 측 몫)
    expect(toHookResponse({ behavior: 'allow', always: true })).toEqual(toHookResponse({ behavior: 'allow' }))
  })

  it('deny 는 permissionDecision=deny + 사유(message)', () => {
    expect(toHookResponse({ behavior: 'deny', message: '위험해서 거절' })).toEqual({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: '위험해서 거절' }
    })
  })

  it('PermissionRequest 형식(decision 필드)은 더 이상 쓰지 않는다', () => {
    const out = JSON.stringify(toHookResponse({ behavior: 'allow' }))
    expect(out).not.toContain('PermissionRequest')
    expect(out).not.toContain('updatedPermissions')
  })
})

// ───────────────────────── ApprovalBroker.request ─────────────────────────

function makeBroker(over: { timeoutMs?: number } = {}) {
  const messenger = {
    sendCard: vi.fn().mockResolvedValue('card-1'),
    sendMessage: vi.fn().mockResolvedValue('msg-1')
  }
  const notify = vi.fn()
  const onWaiting = vi.fn()
  const broker = new ApprovalBroker({ messenger: messenger as never, notify, onWaiting, ...over })
  return { broker, messenger, notify, onWaiting }
}

const req = (over: Partial<ApprovalRequest> = {}): ApprovalRequest => ({
  channelId: 'sess-1',
  replyChannelId: 'reply-1',
  organizationId: 'org1',
  toolName: 'Bash',
  toolInput: { command: 'git push origin main' },
  ...over
})

/** request 가 카드 송신을 끝내고 대기에 들어갈 때까지 마이크로태스크를 비운다 */
const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ApprovalBroker.request — 카드 송신', () => {
  it('주황 승인 카드 + 답장 안내 필드를 회신 채널로 보낸다', async () => {
    const { broker, messenger, notify, onWaiting } = makeBroker()
    const p = broker.request(req())
    await settle()
    expect(messenger.sendCard).toHaveBeenCalledTimes(1)
    const [ch, text, cards, org] = messenger.sendCard.mock.calls[0]
    expect(ch).toBe('reply-1')
    expect(text).toBe('[Clauday] 승인이 필요합니다')
    expect(org).toBe('org1')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      title: '🟧 명령 실행 승인',
      text: 'git push origin main',
      color: CARD_COLORS.warn,
      fields: [{ title: '답장', value: '승인 · 거절 [사유] · 항상 승인', short: false }]
    })
    expect(cards[0].authorName).toContain('승인 필요')
    expect(cards[0].authorName).toContain('9분 뒤 자동 거절')
    expect(notify).toHaveBeenCalledWith({ channelId: 'reply-1', title: '@clauday 승인 필요 — 명령 실행' })
    expect(onWaiting).toHaveBeenCalledWith('sess-1', true)
    expect(broker.hasPending('reply-1')).toBe(true)
    broker.cancelAll()
    await p
  })

  it('카드의 자동 거절 시간은 timeoutMs 를 따른다', async () => {
    const { broker, messenger } = makeBroker({ timeoutMs: 3 * 60_000 })
    const p = broker.request(req())
    await settle()
    expect(messenger.sendCard.mock.calls[0][2][0].authorName).toContain('3분 뒤')
    broker.cancelAll()
    await p
  })

  it('카드 송신이 실패하면 deny — 대기하지 않고 알림·대기 표시도 없다 (위험 동작이 그냥 실행되지 않게)', async () => {
    const { broker, messenger, notify, onWaiting } = makeBroker()
    messenger.sendCard.mockRejectedValue(new Error('500'))
    const d = await broker.request(req())
    expect(d).toMatchObject({ behavior: 'deny' })
    expect((d as { message: string }).message).toContain('승인 요청을 보내지 못해')
    expect(broker.hasPending('reply-1')).toBe(false)
    expect(notify).not.toHaveBeenCalled()
    expect(onWaiting).not.toHaveBeenCalled()
    expect(messenger.sendMessage).not.toHaveBeenCalled()
  })

  it('reason 이 있으면 카드 작성자 줄에 포함', async () => {
    const { broker, messenger } = makeBroker()
    const p = broker.request(req({ reason: '원격 저장소 변경' }))
    await settle()
    expect(messenger.sendCard.mock.calls[0][2][0].authorName).toContain('승인 필요 · 원격 저장소 변경 · 9분 뒤 자동 거절')
    broker.cancelAll()
    await p
  })

  it('reason 이 없으면 작성자 줄에 사유 구간이 없다', async () => {
    const { broker, messenger } = makeBroker()
    const p = broker.request(req())
    await settle()
    expect(messenger.sendCard.mock.calls[0][2][0].authorName).toBe('Clauday · 승인 필요 · 9분 뒤 자동 거절')
    broker.cancelAll()
    await p
  })
})

describe('ApprovalBroker — 답장 판정', () => {
  it('승인 → allow, 안내 메시지 + onWaiting(false)', async () => {
    const { broker, messenger, onWaiting } = makeBroker()
    const p = broker.request(req())
    await settle()
    vi.advanceTimersByTime(18_000)
    expect(broker.onReply('reply-1', '승인')).toBe(true)
    await expect(p).resolves.toEqual({ behavior: 'allow' })
    expect(messenger.sendMessage).toHaveBeenCalledWith('reply-1', '[Clauday] ✅ 승인됨 (18초)', 'org1')
    expect(onWaiting).toHaveBeenLastCalledWith('sess-1', false)
  })

  it('항상 승인 → allow + always:true, 채널 단위 기억 안내', async () => {
    const { broker, messenger } = makeBroker()
    const p = broker.request(req())
    await settle()
    expect(broker.onReply('reply-1', '항상 승인')).toBe(true)
    const d = await p
    expect(d).toEqual({ behavior: 'allow', always: true })
    expect(d).not.toHaveProperty('updatedPermissions')
    expect(messenger.sendMessage.mock.calls[0][1]).toContain('이 채널에서 같은 요청은 앞으로 묻지 않습니다')
  })

  it('그냥 승인은 always 가 없다', async () => {
    const { broker } = makeBroker()
    const p = broker.request(req())
    await settle()
    broker.onReply('reply-1', 'ok')
    expect(await p).toEqual({ behavior: 'allow' })
  })

  it('거절 [사유] → deny, message 에 사유, 안내에도 사유', async () => {
    const { broker, messenger } = makeBroker()
    const p = broker.request(req())
    await settle()
    broker.onReply('reply-1', '거절 운영 반영은 안 돼')
    const d = await p
    expect(d).toEqual({ behavior: 'deny', message: '두레이에서 사용자가 거절했습니다: 운영 반영은 안 돼' })
    expect(messenger.sendMessage.mock.calls[0][1]).toContain('⛔ 거절됨: 운영 반영은 안 돼')
  })

  it('사유 없는 거절', async () => {
    const { broker, messenger } = makeBroker()
    const p = broker.request(req())
    await settle()
    broker.onReply('reply-1', '거절')
    await expect(p).resolves.toEqual({ behavior: 'deny', message: '두레이에서 사용자가 거절했습니다' })
    expect(messenger.sendMessage.mock.calls[0][1]).toMatch(/⛔ 거절됨 \(\d+초\)$/)
  })

  it('대기가 없으면 false', () => {
    const { broker } = makeBroker()
    expect(broker.onReply('reply-1', '승인')).toBe(false)
  })

  it('판정할 수 없는 문장은 false 이고 대기는 유지', async () => {
    const { broker, messenger } = makeBroker()
    const p = broker.request(req())
    await settle()
    expect(broker.onReply('reply-1', '승인 절차가 어떻게 되죠?')).toBe(false)
    expect(broker.hasPending('reply-1')).toBe(true)
    expect(messenger.sendMessage).not.toHaveBeenCalled()
    broker.cancelAll()
    await p
  })

  it('다른 채널의 답장은 소비하지 않는다', async () => {
    const { broker } = makeBroker()
    const p = broker.request(req())
    await settle()
    expect(broker.onReply('other', '승인')).toBe(false)
    broker.cancelAll()
    await p
  })

  it.each([
    ['승인', (b: ApprovalBroker) => b.onReply('reply-1', '승인')],
    ['거절', (b: ApprovalBroker) => b.onReply('reply-1', '거절 아직 안 돼요')],
    ['cancelAll', (b: ApprovalBroker) => b.cancelAll()]
  ])('판정(%s)이 끝나면 대기가 사라지고, 뒤늦은 "승인" 은 일반 대화로 흘린다', async (_label, end) => {
    const { broker } = makeBroker()
    const p = broker.request(req())
    await settle()
    end(broker)
    await p
    expect(broker.hasPending('reply-1')).toBe(false)
    expect(broker.onReply('reply-1', '승인')).toBe(false)
  })

  it('이미 PC 에서 처리된(aborted) 요청이면 카드를 보내지 않는다', async () => {
    const { broker, messenger } = makeBroker()
    const ac = new AbortController()
    ac.abort()
    await expect(broker.request(req({ signal: ac.signal }))).resolves.toBeNull()
    expect(messenger.sendCard).not.toHaveBeenCalled()
  })

  it('안내 메시지 송신이 실패해도 결정은 그대로', async () => {
    const { broker, messenger } = makeBroker()
    messenger.sendMessage.mockRejectedValue(new Error('net'))
    const p = broker.request(req())
    await settle()
    broker.onReply('reply-1', '승인')
    await expect(p).resolves.toEqual({ behavior: 'allow' })
  })
})

describe('ApprovalBroker — 타임아웃 / abort / 접기', () => {
  it('timeoutMs 가 지나면 deny + 안내', async () => {
    const { broker, messenger, onWaiting } = makeBroker({ timeoutMs: 1000 })
    const p = broker.request(req())
    await settle()
    await vi.advanceTimersByTimeAsync(999)
    expect(broker.hasPending('reply-1')).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    const d = await p
    expect(d).toMatchObject({ behavior: 'deny' })
    expect((d as { message: string }).message).toContain('응답이 없어 거절')
    expect(messenger.sendMessage.mock.calls[0][1]).toContain('⏰ 응답 시간이 지나 거절했습니다')
    expect(onWaiting).toHaveBeenLastCalledWith('sess-1', false)
  })

  it('기본 타임아웃은 570초 — hook timeout(600초)보다 먼저', async () => {
    const { broker } = makeBroker()
    const p = broker.request(req())
    await settle()
    await vi.advanceTimersByTimeAsync(569_999)
    expect(broker.hasPending('reply-1')).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    await expect(p).resolves.toMatchObject({ behavior: 'deny' })
  })

  it('답장이 오면 타임아웃 타이머는 정리된다 (나중에 안내가 또 가지 않음)', async () => {
    const { broker, messenger } = makeBroker({ timeoutMs: 1000 })
    const p = broker.request(req())
    await settle()
    broker.onReply('reply-1', '승인')
    await p
    await vi.advanceTimersByTimeAsync(5000)
    expect(messenger.sendMessage).toHaveBeenCalledTimes(1)
  })

  it('signal abort → null + "PC 에서 중단됨" 안내', async () => {
    const { broker, messenger, onWaiting } = makeBroker()
    const ac = new AbortController()
    const p = broker.request(req({ signal: ac.signal }))
    await settle()
    vi.advanceTimersByTime(7000)
    ac.abort()
    await expect(p).resolves.toBeNull()
    expect(messenger.sendMessage).toHaveBeenCalledWith('reply-1', '[Clauday] 🖥 PC 에서 중단됨 (7초)', 'org1')
    expect(onWaiting).toHaveBeenLastCalledWith('sess-1', false)
  })

  it('답장으로 끝난 뒤 abort 가 와도 아무 일 없다', async () => {
    const { broker, messenger } = makeBroker()
    const ac = new AbortController()
    const p = broker.request(req({ signal: ac.signal }))
    await settle()
    broker.onReply('reply-1', '승인')
    await p
    ac.abort()
    await settle()
    expect(messenger.sendMessage).toHaveBeenCalledTimes(1)
  })

  it('같은 채널에 새 request 가 오면 이전 대기를 접는다 (null, 안내 없음)', async () => {
    const { broker, messenger } = makeBroker()
    const first = broker.request(req({ toolInput: { command: 'a' } }))
    await settle()
    const second = broker.request(req({ toolInput: { command: 'b' } }))
    await expect(first).resolves.toBeNull()
    await settle()
    expect(messenger.sendMessage).not.toHaveBeenCalled()
    // 새 요청은 여전히 대기 중이고 답장으로 풀린다
    expect(broker.hasPending('reply-1')).toBe(true)
    broker.onReply('reply-1', 'ok')
    await expect(second).resolves.toEqual({ behavior: 'allow' })
  })

  it('다른 회신 채널의 대기는 서로 접지 않는다', async () => {
    const { broker } = makeBroker()
    const a = broker.request(req({ replyChannelId: 'A' }))
    const b = broker.request(req({ replyChannelId: 'B' }))
    await settle()
    expect(broker.hasPending('A')).toBe(true)
    expect(broker.hasPending('B')).toBe(true)
    broker.cancelAll()
    await Promise.all([a, b])
  })

  it('cancelAll — 모든 대기를 null 로 접고 안내는 보내지 않는다', async () => {
    const { broker, messenger, onWaiting } = makeBroker()
    const a = broker.request(req({ replyChannelId: 'A' }))
    const b = broker.request(req({ replyChannelId: 'B', channelId: 'sess-2' }))
    await settle()
    broker.cancelAll()
    await expect(Promise.all([a, b])).resolves.toEqual([null, null])
    expect(messenger.sendMessage).not.toHaveBeenCalled()
    expect(onWaiting).toHaveBeenCalledWith('sess-1', false)
    expect(onWaiting).toHaveBeenCalledWith('sess-2', false)
  })

  it('cancelAll 은 대기가 없어도 안전', () => {
    const { broker } = makeBroker()
    expect(() => broker.cancelAll()).not.toThrow()
  })
})
