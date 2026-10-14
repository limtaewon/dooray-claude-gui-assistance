import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApprovalBroker, describeToolRequest, parseApprovalReactions, parseApprovalReply, toHookResponse, type ApprovalRequest } from './ApprovalBroker'
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

  it('MCP — "서버 · 도구" 제목과 "키 · 값" 줄 상세', () => {
    expect(describeToolRequest('mcp__dooray-mcp__create_task', { subject: 'x', projectId: '123' })).toEqual({
      title: 'dooray-mcp · create_task',
      detail: 'subject · x\nprojectId · 123'
    })
  })

  it('기타 도구 — 이름 그대로, 빈 입력이면 detail 빈 문자열', () => {
    expect(describeToolRequest('Foo', {})).toEqual({ title: 'Foo', detail: '' })
    expect(describeToolRequest('Foo', { a: 1 }).detail).toBe('a · 1')
  })

  it('숫자 입력은 문자열로, 문자열이 아닌 객체·배열은 빈 값으로 취급 (Bash command)', () => {
    expect(describeToolRequest('Bash', { command: 123 }).detail).toBe('123')
    expect(describeToolRequest('Bash', { command: { a: 1 } }).detail).toBe('')
    expect(describeToolRequest('Bash', { command: ['ls'] }).detail).toBe('')
  })
})

describe('describeToolRequest — 입력 요약 (summarizeInput)', () => {
  it('값은 160자로 자르고 … 를 붙인다', () => {
    const d = describeToolRequest('Foo', { a: 'y'.repeat(500) }).detail
    expect(d).toBe(`a · ${'y'.repeat(159)}…`)
  })

  it('기술 값(idempotencyKey·sha256·confirmationFingerprint·fingerprint·sessionId·baseRevision·contentType·uploadType·token)은 숨긴다', () => {
    const d = describeToolRequest('mcp__x__op', {
      idempotencyKey: 'k', sha256: 'h', confirmationFingerprint: 'f', fingerprint: 'f2', sessionId: 's',
      baseRevision: 3, contentType: 'text/html', uploadType: 'u', token: 't', IDEMPOTENCYKEY: 'upper', subject: '보임'
    }).detail
    expect(d).toBe('subject · 보임')
  })

  it('null·undefined·빈 문자열은 줄에서 뺀다', () => {
    expect(describeToolRequest('Foo', { a: null, b: undefined, c: '', d: 0, e: false }).detail).toBe('d · 0\ne · false')
  })

  it('최대 6줄', () => {
    const input = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`k${i}`, `v${i}`]))
    const lines = describeToolRequest('Foo', input).detail.split('\n')
    expect(lines).toHaveLength(6)
    expect(lines[5]).toBe('k5 · v5')
  })

  it('객체·배열 값은 JSON 으로', () => {
    expect(describeToolRequest('Foo', { list: [1, 2], obj: { a: 1 } }).detail).toBe('list · [1,2]\nobj · {"a":1}')
  })

  it('숨길 키가 앞에 있어도 6줄 제한은 보이는 줄 기준', () => {
    const input: Record<string, unknown> = { token: 't', sessionId: 's' }
    for (let i = 0; i < 8; i++) input[`k${i}`] = i
    expect(describeToolRequest('Foo', input).detail.split('\n')).toHaveLength(6)
  })
})

describe('describeToolRequest — Drop', () => {
  const drop = (op: string, input: Record<string, unknown>) => describeToolRequest(`mcp__drop__${op}`, input)

  it('drop_publish — 새 프로젝트로 게시: 프로젝트(공개 범위) + 파일 "경로 · NKB"', () => {
    expect(drop('drop_publish', { name: '주간 리포트', visibility: 'restricted', files: [{ path: 'index.html', sizeBytes: 2048 }, { path: 'a.css', sizeBytes: 100 }] })).toEqual({
      title: 'Drop 새 프로젝트로 게시',
      detail: '프로젝트 · 주간 리포트 (restricted)\nindex.html · 2KB\na.css · 1KB'
    })
  })

  it('파일 크기는 sizeBytes, 없으면 content 길이, 둘 다 없으면 생략', () => {
    const d = drop('drop_publish', { name: 'p', files: [{ path: 'a.html', content: 'x'.repeat(3000) }, { path: 'b.html' }] }).detail
    expect(d).toBe('프로젝트 · p\na.html · 3KB\nb.html')
  })

  it('project 가 name 보다 우선, 공개 범위가 없으면 괄호 생략', () => {
    expect(drop('drop_upload', { project: 'proj', name: 'ignored', files: [{ path: 'a', sizeBytes: 1 }] }).detail).toBe('프로젝트 · proj\na · 1KB')
  })

  it('html 만 있고 프로젝트 이름이 없으면 "새 프로젝트"', () => {
    expect(drop('drop_publish', { html: '<p>x</p>', visibility: 'public' }).detail).toBe('프로젝트 · 새 프로젝트 (public)')
  })

  it.each([
    ['drop_publish', 'Drop 새 프로젝트로 게시'],
    ['drop_upload', 'Drop 파일 게시'],
    ['drop_upload_finish', 'Drop 파일 게시'],
    ['drop_commit_upload', 'Drop 파일 게시(확인 후)'],
    ['drop_delete_file', 'Drop 파일 삭제']
  ])('%s → %s', (op, title) => {
    expect(drop(op, {}).title).toBe(title)
  })

  it('drop_delete_file — 프로젝트와 파일 경로', () => {
    expect(drop('drop_delete_file', { project: 'p', path: 'old.html' }).detail).toBe('프로젝트 · p\n파일 · old.html')
  })

  it('알 수 없는 drop 도구는 이름 그대로', () => {
    expect(drop('drop_list_projects', {}).title).toBe('Drop drop_list_projects')
  })

  it('보여줄 항목이 없으면 입력 요약으로 폴백', () => {
    expect(drop('drop_publish', { note: '메모' }).detail).toBe('note · 메모')
  })

  it('files 안의 해시·키는 상세에 나오지 않는다', () => {
    const d = drop('drop_upload_finish', { project: 'p', idempotencyKey: 'SECRETKEY', files: [{ path: 'a.html', sizeBytes: 10, sha256: 'HASH' }] }).detail
    expect(d).not.toContain('HASH')
    expect(d).not.toContain('SECRETKEY')
  })
})

describe('describeToolRequest — DB SQL', () => {
  it.each(['query', 'sql', 'statement'])('%s 키가 있으면 "DB {op}" + SQL', (key) => {
    expect(describeToolRequest('mcp__mysql-nfi__execute_update', { [key]: 'UPDATE t SET a=1', idempotencyKey: 'k' })).toEqual({
      title: 'DB execute_update',
      detail: 'UPDATE t SET a=1'
    })
  })

  it('SQL 은 500자로 자른다', () => {
    const d = describeToolRequest('mcp__mysql-nfi__execute_update', { sql: 'x'.repeat(800) }).detail
    expect(d).toHaveLength(500)
    expect(d.endsWith('…')).toBe(true)
  })

  it('SQL 이 비어 있으면 일반 MCP 요약으로', () => {
    expect(describeToolRequest('mcp__mysql-nfi__execute_update', { sql: '', table: 't' })).toEqual({ title: 'mysql-nfi · execute_update', detail: 'table · t' })
  })
})

describe('parseApprovalReactions', () => {
  const r = (value: string, ...memberIds: unknown[]) => ({ value, memberIds })

  it.each(['white_check_mark', 'heavy_check_mark', 'ballot_box_with_check', '+1', 'thumbsup'])('%s → 승인', (v) => {
    expect(parseApprovalReactions([r(v, 'me')], 'me')).toEqual({ kind: 'allow' })
  })

  it.each(['x', 'negative_squared_cross_mark', 'no_entry', 'no_entry_sign', '-1', 'thumbsdown'])('%s → 거절', (v) => {
    expect(parseApprovalReactions([r(v, 'me')], 'me')).toEqual({ kind: 'deny' })
  })

  it('ok_hand → 항상 승인', () => {
    expect(parseApprovalReactions([r('ok_hand', 'me')], 'me')).toEqual({ kind: 'always' })
  })

  it('내 memberId 가 든 반응만 본다 — 다른 사람 반응은 무시', () => {
    expect(parseApprovalReactions([r('white_check_mark', 'other')], 'me')).toBeNull()
    expect(parseApprovalReactions([r('x', 'other'), r('white_check_mark', 'other', 'me')], 'me')).toEqual({ kind: 'allow' })
  })

  it('우선순위: 거절 > 항상 승인 > 승인 (누른 순서 무관)', () => {
    expect(parseApprovalReactions([r('white_check_mark', 'me'), r('x', 'me')], 'me')).toEqual({ kind: 'deny' })
    expect(parseApprovalReactions([r('x', 'me'), r('white_check_mark', 'me')], 'me')).toEqual({ kind: 'deny' })
    expect(parseApprovalReactions([r('white_check_mark', 'me'), r('ok_hand', 'me')], 'me')).toEqual({ kind: 'always' })
    expect(parseApprovalReactions([r('ok_hand', 'me'), r('x', 'me')], 'me')).toEqual({ kind: 'deny' })
  })

  it('판정과 무관한 이모지는 무시', () => {
    expect(parseApprovalReactions([r('tada', 'me'), r('heart', 'me')], 'me')).toBeNull()
    expect(parseApprovalReactions([r('tada', 'me'), r('white_check_mark', 'me')], 'me')).toEqual({ kind: 'allow' })
  })

  it('memberIds 가 숫자여도 문자열로 비교', () => {
    expect(parseApprovalReactions([r('white_check_mark', 123)], '123')).toEqual({ kind: 'allow' })
  })

  it('배열이 아니거나 비었거나 깨진 항목은 null / 무시', () => {
    expect(parseApprovalReactions(undefined, 'me')).toBeNull()
    expect(parseApprovalReactions(null, 'me')).toBeNull()
    expect(parseApprovalReactions('x', 'me')).toBeNull()
    expect(parseApprovalReactions({}, 'me')).toBeNull()
    expect(parseApprovalReactions([], 'me')).toBeNull()
    expect(parseApprovalReactions([null, 5, {}, { value: 1 }, { value: 'x' }, { value: 'x', memberIds: 'me' }], 'me')).toBeNull()
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

function makeBroker(over: { timeoutMs?: number; pollIntervalMs?: number; getMyMemberId?: () => Promise<string | null> } = {}) {
  const messenger = {
    sendCard: vi.fn().mockResolvedValue('card-1'),
    sendMessage: vi.fn().mockResolvedValue('msg-1'),
    fetchChannelLogs: vi.fn().mockResolvedValue([]),
    deleteMessage: vi.fn().mockResolvedValue(undefined)
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
    expect(text).toBe('[Clauday] 승인 필요 · 명령 실행')
    expect(org).toBe('org1')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      authorName: 'Clauday · 9분 뒤 자동 거절',
      title: '🟧 명령 실행',
      text: 'git push origin main',
      color: CARD_COLORS.warn,
      fields: [{ title: '반응을 눌러 주세요', value: '✅ 승인 · ❌ 거절 · 👌 항상 승인 (답장도 됩니다)', short: false }]
    })
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

  it('메시지 text 에는 reason(위험 분류)을, 없으면 요지(title)를 쓴다', async () => {
    const a = makeBroker()
    const pa = a.broker.request(req({ reason: '원격 저장소 변경' }))
    await settle()
    expect(a.messenger.sendCard.mock.calls[0][1]).toBe('[Clauday] 승인 필요 · 원격 저장소 변경')
    a.broker.cancelAll()
    await pa
    const b = makeBroker()
    const pb = b.broker.request(req())
    await settle()
    expect(b.messenger.sendCard.mock.calls[0][1]).toBe('[Clauday] 승인 필요 · 명령 실행')
    b.broker.cancelAll()
    await pb
  })

  it('카드 작성자 줄에는 reason 이 들어가지 않는다 (짧게)', async () => {
    const { broker, messenger } = makeBroker()
    const p = broker.request(req({ reason: '원격 저장소 변경' }))
    await settle()
    expect(messenger.sendCard.mock.calls[0][2][0].authorName).toBe('Clauday · 9분 뒤 자동 거절')
    broker.cancelAll()
    await p
  })

  it('Drop 요청은 요지 제목과 프로젝트·파일 상세를 카드에 담는다', async () => {
    const { broker, messenger } = makeBroker()
    const p = broker.request(req({ toolName: 'mcp__drop__drop_publish', toolInput: { name: '리포트', visibility: 'restricted', files: [{ path: 'index.html', sizeBytes: 4096 }] } }))
    await settle()
    expect(messenger.sendCard.mock.calls[0][2][0]).toMatchObject({ title: '🟧 Drop 새 프로젝트로 게시', text: '프로젝트 · 리포트 (restricted)\nindex.html · 4KB' })
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
    expect(messenger.sendMessage).toHaveBeenCalledWith('reply-1', '[Clauday] ✅ 명령 실행 — 승인됨 (18초)', 'org1')
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
    expect(messenger.sendMessage.mock.calls[0][1]).toMatch(/^\[Clauday\] ✅ 명령 실행 — 승인됨, 이 채널에선 다시 묻지 않음 \(\d+초\)$/)
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
    expect(messenger.sendMessage.mock.calls[0][1]).toContain('⛔ 명령 실행 — 거절됨: 운영 반영은 안 돼')
  })

  it('사유 없는 거절', async () => {
    const { broker, messenger } = makeBroker()
    const p = broker.request(req())
    await settle()
    broker.onReply('reply-1', '거절')
    await expect(p).resolves.toEqual({ behavior: 'deny', message: '두레이에서 사용자가 거절했습니다' })
    expect(messenger.sendMessage.mock.calls[0][1]).toMatch(/⛔ 명령 실행 — 거절됨 \(\d+초\)$/)
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
    expect(messenger.sendMessage.mock.calls[0][1]).toMatch(/^\[Clauday\] ⏰ 명령 실행 — 응답이 없어 거절했습니다 \(\d+초\)$/)
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
    expect(messenger.sendMessage).toHaveBeenCalledWith('reply-1', '[Clauday] 🖥 명령 실행 — PC 에서 중단됨 (7초)', 'org1')
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

// ───────────────────────── 반응 승인 / 카드 정리 ─────────────────────────

describe('ApprovalBroker — 반응 승인 (폴링)', () => {
  const POLL = 1000
  const reaction = (value: string, ...memberIds: string[]) => [{ id: 'card-1', reactions: [{ value, memberIds }] }]

  function setupPoll(over: { myId?: string | null; noGetter?: boolean } = {}) {
    const getMyMemberId = vi.fn().mockResolvedValue(over.myId === undefined ? 'me' : over.myId)
    const h = makeBroker({ pollIntervalMs: POLL, ...(over.noGetter ? {} : { getMyMemberId }) })
    return { ...h, getMyMemberId }
  }
  const tick = async (ms: number): Promise<void> => {
    await vi.advanceTimersByTimeAsync(ms)
    await vi.advanceTimersByTimeAsync(0)
  }

  it('내가 ✅ 를 누르면 승인: 카드 삭제 + 결과 한 줄 + onWaiting(false)', async () => {
    const { broker, messenger, onWaiting } = setupPoll()
    messenger.fetchChannelLogs.mockResolvedValue(reaction('white_check_mark', 'me'))
    const p = broker.request(req())
    await settle()
    await tick(POLL)
    await expect(p).resolves.toEqual({ behavior: 'allow' })
    expect(messenger.fetchChannelLogs).toHaveBeenCalledWith('reply-1', 50)
    expect(messenger.deleteMessage).toHaveBeenCalledWith('reply-1', 'card-1')
    expect(messenger.sendMessage).toHaveBeenCalledWith('reply-1', '[Clauday] ✅ 명령 실행 — 승인됨 (1초)', 'org1')
    expect(onWaiting).toHaveBeenLastCalledWith('sess-1', false)
    expect(broker.hasPending('reply-1')).toBe(false)
  })

  it('👌 는 항상 승인', async () => {
    const { broker, messenger } = setupPoll()
    messenger.fetchChannelLogs.mockResolvedValue(reaction('ok_hand', 'me'))
    const p = broker.request(req())
    await settle()
    await tick(POLL)
    await expect(p).resolves.toEqual({ behavior: 'allow', always: true })
    expect(messenger.sendMessage.mock.calls[0][1]).toMatch(/✅ 명령 실행 — 승인됨, 이 채널에선 다시 묻지 않음/)
  })

  it('❌ 는 거절: deny 메시지 + "⛔ … 거절됨" 한 줄', async () => {
    const { broker, messenger } = setupPoll()
    messenger.fetchChannelLogs.mockResolvedValue(reaction('x', 'me'))
    const p = broker.request(req())
    await settle()
    await tick(POLL)
    await expect(p).resolves.toEqual({ behavior: 'deny', message: '두레이에서 사용자가 거절했습니다' })
    expect(messenger.sendMessage.mock.calls[0][1]).toMatch(/^\[Clauday\] ⛔ 명령 실행 — 거절됨 \(\d+초\)$/)
    expect(messenger.deleteMessage).toHaveBeenCalledWith('reply-1', 'card-1')
  })

  it('다른 사람의 반응은 무시하고 계속 대기', async () => {
    const { broker, messenger } = setupPoll()
    messenger.fetchChannelLogs.mockResolvedValue(reaction('white_check_mark', 'someone-else'))
    const p = broker.request(req())
    await settle()
    await tick(POLL * 3)
    expect(messenger.fetchChannelLogs).toHaveBeenCalledTimes(3)
    expect(broker.hasPending('reply-1')).toBe(true)
    broker.cancelAll()
    await p
  })

  it('폴링은 pollIntervalMs 마다 — 그 전에는 조회하지 않는다', async () => {
    const { broker, messenger } = setupPoll()
    const p = broker.request(req())
    await settle()
    await tick(POLL - 1)
    expect(messenger.fetchChannelLogs).not.toHaveBeenCalled()
    await tick(1)
    expect(messenger.fetchChannelLogs).toHaveBeenCalledTimes(1)
    broker.cancelAll()
    await p
  })

  it('기본 폴링 주기는 3초', async () => {
    const getMyMemberId = vi.fn().mockResolvedValue('me')
    const { broker, messenger } = makeBroker({ getMyMemberId })
    const p = broker.request(req())
    await settle()
    await tick(2999)
    expect(messenger.fetchChannelLogs).not.toHaveBeenCalled()
    await tick(1)
    expect(messenger.fetchChannelLogs).toHaveBeenCalledTimes(1)
    broker.cancelAll()
    await p
  })

  it('getMyMemberId 가 없으면 조회하지 않는다 (답장으로만)', async () => {
    const { broker, messenger } = setupPoll({ noGetter: true })
    const p = broker.request(req())
    await settle()
    await tick(POLL * 5)
    expect(messenger.fetchChannelLogs).not.toHaveBeenCalled()
    broker.onReply('reply-1', '승인')
    await expect(p).resolves.toEqual({ behavior: 'allow' })
  })

  it('getMyMemberId 가 null 이면 조회하지 않는다', async () => {
    const { broker, messenger } = setupPoll({ myId: null })
    const p = broker.request(req())
    await settle()
    await tick(POLL * 3)
    expect(messenger.fetchChannelLogs).not.toHaveBeenCalled()
    broker.cancelAll()
    await p
  })

  it('조회 실패는 warn 하고 계속 — 다음 주기에 성공하면 판정', async () => {
    const { broker, messenger } = setupPoll()
    messenger.fetchChannelLogs.mockRejectedValueOnce(new Error('500')).mockResolvedValue(reaction('white_check_mark', 'me'))
    const p = broker.request(req())
    await settle()
    await tick(POLL)
    expect(console.warn).toHaveBeenCalled()
    expect(broker.hasPending('reply-1')).toBe(true)
    await tick(POLL)
    await expect(p).resolves.toEqual({ behavior: 'allow' })
  })

  it('getMyMemberId 가 throw 해도 대기는 유지', async () => {
    const getMyMemberId = vi.fn().mockRejectedValue(new Error('x'))
    const { broker, messenger } = makeBroker({ pollIntervalMs: POLL, getMyMemberId })
    const p = broker.request(req())
    await settle()
    await tick(POLL * 2)
    expect(messenger.fetchChannelLogs).not.toHaveBeenCalled()
    expect(broker.hasPending('reply-1')).toBe(true)
    broker.cancelAll()
    await p
  })

  it('카드가 최근 50개 안에 없으면 반응을 못 보고 계속 대기 (답장은 가능)', async () => {
    const { broker, messenger } = setupPoll()
    messenger.fetchChannelLogs.mockResolvedValue([{ id: 'other', reactions: [{ value: 'white_check_mark', memberIds: ['me'] }] }])
    const p = broker.request(req())
    await settle()
    await tick(POLL * 2)
    expect(broker.hasPending('reply-1')).toBe(true)
    broker.onReply('reply-1', 'ok')
    await expect(p).resolves.toEqual({ behavior: 'allow' })
  })

  it('조회가 느리면 겹쳐 호출하지 않는다', async () => {
    const { broker, messenger } = setupPoll()
    let release!: (v: unknown[]) => void
    messenger.fetchChannelLogs.mockImplementation(() => new Promise((r) => { release = r }))
    const p = broker.request(req())
    await settle()
    await tick(POLL * 4)
    expect(messenger.fetchChannelLogs).toHaveBeenCalledTimes(1)
    release([])
    await tick(0)
    await tick(POLL)
    expect(messenger.fetchChannelLogs).toHaveBeenCalledTimes(2)
    broker.cancelAll()
    release([])
    await p
  })

  it('판정이 나면 폴링을 멈춘다', async () => {
    const { broker, messenger } = setupPoll()
    const p = broker.request(req())
    await settle()
    broker.onReply('reply-1', '승인')
    await p
    await tick(POLL * 5)
    expect(messenger.fetchChannelLogs).not.toHaveBeenCalled()
  })

  it('반응으로 이미 판정한 뒤 늦게 온 답장은 소비되지 않는다', async () => {
    const { broker, messenger } = setupPoll()
    messenger.fetchChannelLogs.mockResolvedValue(reaction('white_check_mark', 'me'))
    const p = broker.request(req())
    await settle()
    await tick(POLL)
    await p
    expect(broker.onReply('reply-1', '승인')).toBe(false)
  })

  it('반응과 답장 중 먼저 온 것이 이긴다', async () => {
    const { broker, messenger } = setupPoll()
    messenger.fetchChannelLogs.mockResolvedValue(reaction('x', 'me'))
    const p = broker.request(req())
    await settle()
    broker.onReply('reply-1', '승인')
    await tick(POLL * 2)
    await expect(p).resolves.toEqual({ behavior: 'allow' })
    expect(messenger.sendMessage).toHaveBeenCalledTimes(1)
  })

  it('거절과 승인 반응이 함께 있으면 거절', async () => {
    const { broker, messenger } = setupPoll()
    messenger.fetchChannelLogs.mockResolvedValue([{ id: 'card-1', reactions: [{ value: 'white_check_mark', memberIds: ['me'] }, { value: 'x', memberIds: ['me'] }] }])
    const p = broker.request(req())
    await settle()
    await tick(POLL)
    await expect(p).resolves.toMatchObject({ behavior: 'deny' })
  })
})

describe('ApprovalBroker — 판정 뒤 카드 삭제', () => {
  it.each([
    ['답장 승인', async (b: ApprovalBroker) => { b.onReply('reply-1', '승인') }],
    ['답장 거절', async (b: ApprovalBroker) => { b.onReply('reply-1', '거절') }],
    ['타임아웃', async () => { await vi.advanceTimersByTimeAsync(1000) }],
    ['cancelAll', async (b: ApprovalBroker) => { b.cancelAll() }]
  ])('%s 후 카드를 지운다', async (_name, act) => {
    const { broker, messenger } = makeBroker({ timeoutMs: 1000 })
    const p = broker.request(req())
    await settle()
    expect(messenger.deleteMessage).not.toHaveBeenCalled()
    await act(broker)
    await p
    expect(messenger.deleteMessage).toHaveBeenCalledTimes(1)
    expect(messenger.deleteMessage).toHaveBeenCalledWith('reply-1', 'card-1')
  })

  it('abort 후에도 카드를 지우고 "PC 에서 중단됨" 한 줄', async () => {
    const { broker, messenger } = makeBroker()
    const ac = new AbortController()
    const p = broker.request(req({ signal: ac.signal }))
    await settle()
    ac.abort()
    await p
    expect(messenger.deleteMessage).toHaveBeenCalledWith('reply-1', 'card-1')
    expect(messenger.sendMessage.mock.calls[0][1]).toMatch(/🖥 명령 실행 — PC 에서 중단됨/)
  })

  it('cancelAll 은 카드는 지우지만 결과 한 줄은 보내지 않는다', async () => {
    const { broker, messenger } = makeBroker()
    const p = broker.request(req())
    await settle()
    broker.cancelAll()
    await p
    expect(messenger.deleteMessage).toHaveBeenCalledTimes(1)
    expect(messenger.sendMessage).not.toHaveBeenCalled()
  })

  it('카드 삭제가 실패해도 warn 만 하고 결정·결과 한 줄은 그대로', async () => {
    const { broker, messenger } = makeBroker()
    messenger.deleteMessage.mockRejectedValue(new Error('500'))
    const p = broker.request(req())
    await settle()
    broker.onReply('reply-1', '승인')
    await expect(p).resolves.toEqual({ behavior: 'allow' })
    await settle()
    expect(console.warn).toHaveBeenCalled()
    expect(messenger.sendMessage).toHaveBeenCalledTimes(1)
  })

  it('sendCard 가 logId 를 못 돌려주면 (null) 삭제·폴링은 하지 않고 답장으로만 판정', async () => {
    const getMyMemberId = vi.fn().mockResolvedValue('me')
    const { broker, messenger } = makeBroker({ pollIntervalMs: 1000, getMyMemberId })
    messenger.sendCard.mockResolvedValue(null)
    const p = broker.request(req())
    await settle()
    await vi.advanceTimersByTimeAsync(3000)
    expect(messenger.fetchChannelLogs).not.toHaveBeenCalled()
    broker.onReply('reply-1', '승인')
    await expect(p).resolves.toEqual({ behavior: 'allow' })
    expect(messenger.deleteMessage).not.toHaveBeenCalled()
  })

  it('카드 송신 실패(deny)에는 삭제할 카드가 없다', async () => {
    const { broker, messenger } = makeBroker()
    messenger.sendCard.mockRejectedValue(new Error('500'))
    await broker.request(req())
    expect(messenger.deleteMessage).not.toHaveBeenCalled()
  })

  it('같은 채널의 새 요청이 이전 대기를 접으면 이전 카드를 지운다 (안내 없음)', async () => {
    const { broker, messenger } = makeBroker()
    messenger.sendCard.mockResolvedValueOnce('card-old').mockResolvedValueOnce('card-new')
    const first = broker.request(req())
    await settle()
    const second = broker.request(req())
    await expect(first).resolves.toBeNull()
    await settle()
    expect(messenger.deleteMessage).toHaveBeenCalledWith('reply-1', 'card-old')
    expect(messenger.deleteMessage).not.toHaveBeenCalledWith('reply-1', 'card-new')
    expect(messenger.sendMessage).not.toHaveBeenCalled()
    broker.cancelAll()
    await second
  })

  it('이미 aborted 인 요청은 카드를 보내지도 지우지도 않는다', async () => {
    const { broker, messenger } = makeBroker()
    const ac = new AbortController()
    ac.abort()
    await broker.request(req({ signal: ac.signal }))
    expect(messenger.sendCard).not.toHaveBeenCalled()
    expect(messenger.deleteMessage).not.toHaveBeenCalled()
  })
})

