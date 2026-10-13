import { describe, it, expect, vi } from 'vitest'
import { join } from 'path'
import { MentionHookHandler, MENTION_HOOK_KIND, extractAssistantMessage } from './MentionHookHandler'
import { MentionTurnTracker } from './agent/MentionTurnTracker'
import { AlwaysAllowStore } from './agent/AlwaysAllowStore'
import type { HookRoute } from '../../hooks/ClaudeHookRouter'
import type { HookEventPayload } from './HookServer'

function memStorage(): { get: (k: string, d?: unknown) => unknown; set: (k: string, v: unknown) => void } {
  const data = new Map<string, unknown>()
  return { get: (k, d) => (data.has(k) ? data.get(k) : d), set: (k, v) => { data.set(k, v) } }
}

const AGENT_ROOT = join('/tmp', 'clauday-agent-root')

interface SessionRecord {
  organizationId?: string
  [key: string]: unknown
}

function makeDeps(opts: { session?: SessionRecord | null; readTranscript?: (p: string) => string } = {}): {
  sessions: { get: ReturnType<typeof vi.fn>; setClaudeSessionId: ReturnType<typeof vi.fn>; markIdle: ReturnType<typeof vi.fn> }
  publisher: { publish: ReturnType<typeof vi.fn> }
  turns: MentionTurnTracker
  getAgentRoot: ReturnType<typeof vi.fn>
  readTranscript: ReturnType<typeof vi.fn>
} {
  const sessions = {
    get: vi.fn(() => opts.session ?? null),
    setClaudeSessionId: vi.fn(),
    markIdle: vi.fn()
  }
  const publisher = { publish: vi.fn(async () => {}) }
  const getAgentRoot = vi.fn(() => AGENT_ROOT)
  const readTranscript = vi.fn(opts.readTranscript ?? (() => ''))
  return { sessions, publisher, turns: new MentionTurnTracker(), getAgentRoot, readTranscript }
}

function beginTurn(deps: ReturnType<typeof makeDeps>, over: Partial<{ inThread: boolean; organizationId: string; progressLogId: string }> = {}): void {
  deps.turns.begin('ch1', {
    logId: 'L1',
    replyChannelId: 'ch1',
    inThread: over.inThread ?? false,
    organizationId: over.organizationId,
    progressLogId: over.progressLogId ?? 'P1',
    startedAt: 1000
  })
}

function makeEvent(partial: Partial<HookEventPayload> & { event: string; raw?: Record<string, unknown> }): HookEventPayload {
  return { cwd: '', raw: {}, ...partial }
}

const ROUTE: HookRoute = { kind: MENTION_HOOK_KIND, id: 'ch1' }

describe('MentionHookHandler.resolve', () => {
  it('빈 cwd → null', () => {
    const deps = makeDeps()
    const handler = new MentionHookHandler(deps)
    expect(handler.resolve('')).toBeNull()
  })

  it('agentRoot 밖 → null', () => {
    const deps = makeDeps()
    const handler = new MentionHookHandler(deps)
    expect(handler.resolve('/other/path')).toBeNull()
  })

  it('agentRoot 자기 자신 → null', () => {
    const deps = makeDeps()
    const handler = new MentionHookHandler(deps)
    expect(handler.resolve(AGENT_ROOT)).toBeNull()
  })

  it('<agentRoot>/123 → { kind, id: "123" }', () => {
    const deps = makeDeps()
    const handler = new MentionHookHandler(deps)
    expect(handler.resolve(join(AGENT_ROOT, '123'))).toEqual({ kind: MENTION_HOOK_KIND, id: '123' })
  })

  it('<agentRoot>/123/tasks/x → { kind, id: "123" }', () => {
    const deps = makeDeps()
    const handler = new MentionHookHandler(deps)
    expect(handler.resolve(join(AGENT_ROOT, '123', 'tasks', 'x'))).toEqual({
      kind: MENTION_HOOK_KIND,
      id: '123'
    })
  })

  it('getAgentRoot 가 도중에 바뀌면 다음 호출에 즉시 반영된다 (thunk)', () => {
    const deps = makeDeps()
    const handler = new MentionHookHandler(deps)
    expect(handler.resolve(join(AGENT_ROOT, '123'))).toEqual({ kind: MENTION_HOOK_KIND, id: '123' })

    const otherRoot = join('/tmp', 'other-root')
    deps.getAgentRoot.mockReturnValue(otherRoot)
    expect(handler.resolve(join(otherRoot, '456'))).toEqual({ kind: MENTION_HOOK_KIND, id: '456' })
    // 이전 root 기준 경로는 더 이상 매치되지 않는다
    expect(handler.resolve(join(AGENT_ROOT, '123'))).toBeNull()
  })

  it('agentRoot 의 형제 경로는 멘션 채널이 아니다 (예전엔 prefix 매칭으로 id ".." 를 돌려줬다)', () => {
    const deps = makeDeps()
    const handler = new MentionHookHandler(deps)
    expect(handler.resolve(`${AGENT_ROOT}-sibling`)).toBeNull()
    expect(handler.resolve(join(`${AGENT_ROOT}-sibling`, '123'))).toBeNull()
  })
})

describe('MentionHookHandler.handle — 턴 출처 / stop 회신', () => {
  it('멘션 턴의 stop → publisher 에 응답·회신 자리·진행 메시지를 넘긴다', async () => {
    const deps = makeDeps()
    beginTurn(deps, { organizationId: 'org-1' })
    const handler = new MentionHookHandler(deps)
    await handler.handle(makeEvent({ event: 'user_prompt_submit', raw: { prompt: 'tasks/L1.md 파일의 채팅을 참고…' } }), ROUTE)
    await handler.handle(makeEvent({ event: 'stop', raw: { last_assistant_message: '텍스트 응답' } }), ROUTE)
    expect(deps.publisher.publish).toHaveBeenCalledWith({
      channelId: 'ch1',
      inThread: false,
      organizationId: 'org-1',
      answer: '텍스트 응답',
      startedAt: 1000,
      progressLogId: 'P1'
    })
  })

  it('TUI 에 직접 친 턴의 stop 은 두레이로 회신하지 않는다', async () => {
    const deps = makeDeps()
    const handler = new MentionHookHandler(deps)
    await handler.handle(makeEvent({ event: 'user_prompt_submit', raw: { prompt: '이 파일 좀 고쳐줘' } }), ROUTE)
    await handler.handle(makeEvent({ event: 'stop', raw: { last_assistant_message: '사적인 답' } }), ROUTE)
    expect(deps.publisher.publish).not.toHaveBeenCalled()
    expect(deps.sessions.markIdle).toHaveBeenCalledWith('ch1')
  })

  it('멘션 턴이 끝난 뒤 이어서 친 직접 입력 턴도 회신하지 않는다', async () => {
    const deps = makeDeps()
    beginTurn(deps)
    const handler = new MentionHookHandler(deps)
    await handler.handle(makeEvent({ event: 'user_prompt_submit', raw: { prompt: 'tasks/L1.md …' } }), ROUTE)
    await handler.handle(makeEvent({ event: 'stop', raw: { last_assistant_message: 'a' } }), ROUTE)
    await handler.handle(makeEvent({ event: 'user_prompt_submit', raw: { prompt: '추가로 이것도' } }), ROUTE)
    await handler.handle(makeEvent({ event: 'stop', raw: { last_assistant_message: 'b' } }), ROUTE)
    expect(deps.publisher.publish).toHaveBeenCalledTimes(1)
  })

  it('UserPromptSubmit hook 이 없는 예전 설정이면 대기 중인 멘션 턴을 회신한다', async () => {
    const deps = makeDeps()
    beginTurn(deps)
    const handler = new MentionHookHandler(deps)
    await handler.handle(makeEvent({ event: 'stop', raw: { last_assistant_message: '응답' } }), ROUTE)
    expect(deps.publisher.publish).toHaveBeenCalledTimes(1)
  })

  it('last_assistant_message: { content: [{type:"text", text}] } 형태', async () => {
    const deps = makeDeps()
    beginTurn(deps)
    const handler = new MentionHookHandler(deps)
    await handler.handle(makeEvent({ event: 'stop', raw: { last_assistant_message: { content: [{ type: 'text', text: 'hello' }] } } }), ROUTE)
    expect(deps.publisher.publish.mock.calls[0][0].answer).toBe('hello')
  })

  it('last_assistant_message: { message: { content: [...] } } 형태', async () => {
    const deps = makeDeps()
    beginTurn(deps)
    const handler = new MentionHookHandler(deps)
    await handler.handle(
      makeEvent({ event: 'stop', raw: { last_assistant_message: { message: { content: [{ type: 'text', text: 'world' }] } } } }),
      ROUTE
    )
    expect(deps.publisher.publish.mock.calls[0][0].answer).toBe('world')
  })

  it('비어 있고 transcript_path 있으면 transcript fallback 사용', async () => {
    const deps = makeDeps({ readTranscript: () => 'transcript 본문' })
    beginTurn(deps)
    const handler = new MentionHookHandler(deps)
    await handler.handle(makeEvent({ event: 'stop', raw: { transcript_path: '/tmp/x/abc-123.jsonl' } }), ROUTE)
    expect(deps.readTranscript).toHaveBeenCalledWith('/tmp/x/abc-123.jsonl')
    expect(deps.publisher.publish.mock.calls[0][0].answer).toBe('transcript 본문')
  })

  it('transcript_path 의 basename(.jsonl 제거)을 claudeSessionId 로 저장 — 직접 입력 턴이어도', async () => {
    const deps = makeDeps()
    const handler = new MentionHookHandler(deps)
    await handler.handle(makeEvent({ event: 'stop', raw: { transcript_path: '/x/y/abc-123.jsonl' } }), ROUTE)
    expect(deps.sessions.setClaudeSessionId).toHaveBeenCalledWith('ch1', 'abc-123')
  })

  it('턴에 orgId 가 없으면 세션의 organizationId 를 쓴다', async () => {
    const deps = makeDeps({ session: { organizationId: 'org-s', tabId: 't' } })
    beginTurn(deps)
    const handler = new MentionHookHandler(deps)
    await handler.handle(makeEvent({ event: 'stop', raw: {} }), ROUTE)
    expect(deps.publisher.publish.mock.calls[0][0].organizationId).toBe('org-s')
  })

  it('회신 전에 busy 를 먼저 푼다 — 송신이 실패해도 채널이 막히지 않게', async () => {
    const deps = makeDeps()
    beginTurn(deps)
    deps.publisher.publish.mockRejectedValueOnce(new Error('send 실패'))
    const handler = new MentionHookHandler(deps)
    await expect(handler.handle(makeEvent({ event: 'stop', raw: {} }), ROUTE)).rejects.toThrow('send 실패')
    expect(deps.sessions.markIdle).toHaveBeenCalledWith('ch1')
  })

  it('알 수 없는 event 이름은 아무것도 하지 않는다', async () => {
    const deps = makeDeps()
    const handler = new MentionHookHandler(deps)
    await handler.handle(makeEvent({ event: 'post_tool_use', raw: {} }), ROUTE)
    expect(deps.sessions.markIdle).not.toHaveBeenCalled()
    expect(deps.publisher.publish).not.toHaveBeenCalled()
  })
})

describe('extractAssistantMessage', () => {
  it('string 형태는 그대로(trim)', () => {
    expect(extractAssistantMessage('  텍스트 응답 ')).toBe('텍스트 응답')
  })

  it('지원하지 않는 형태는 빈 문자열', () => {
    expect(extractAssistantMessage(42)).toBe('')
    expect(extractAssistantMessage(null)).toBe('')
  })

  it('content 배열에 순수 문자열 원소가 섞여도 합쳐진다', () => {
    expect(extractAssistantMessage({ content: ['a', { type: 'text', text: 'b' }, 'c'] })).toBe('a\nb\nc')
  })

  it('content 가 문자열이면 그대로(trim) 사용', () => {
    expect(extractAssistantMessage({ content: '  평문 응답  ' })).toBe('평문 응답')
  })
})

// ───────────────────────── 위험 동작 승인(decide, PreToolUse) / 진행 / stop 순서 ─────────────────────────

describe('MentionHookHandler.decide — DangerGate + 두레이 승인', () => {
  const preEvent = (tool: string, input: Record<string, unknown>, over: Partial<HookEventPayload> = {}): HookEventPayload =>
    makeEvent({ event: 'pre_tool_use', tool_name: tool, tool_input: input, ...over })
  const PUSH = preEvent('Bash', { command: 'git push origin main' })
  const signal = (): AbortSignal => new AbortController().signal
  const ALLOW_RESPONSE = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: '두레이에서 승인됨' } }

  function setup(decision: unknown, extra: { gate?: boolean | undefined; progress?: boolean; store?: AlwaysAllowStore } = {}) {
    const deps = makeDeps()
    const approvals = { request: vi.fn(async (_req: Record<string, unknown>) => decision) }
    const progress = { onTool: vi.fn(), stop: vi.fn(async () => {}) }
    const alwaysAllow = extra.store ?? new AlwaysAllowStore(memStorage())
    const handler = new MentionHookHandler({
      ...deps,
      approvals: approvals as never,
      isGateEnabled: () => extra.gate ?? true,
      alwaysAllow,
      progress
    })
    return { deps, approvals, progress, alwaysAllow, handler }
  }

  it('위험 동작 + 멘션 턴이면 approvals.request 에 회신 자리·도구·사유(label)·signal 을 넘기고 PreToolUse 응답을 돌려준다', async () => {
    const { deps, approvals, handler } = setup({ behavior: 'allow' })
    deps.turns.begin('ch1', { logId: 'L1', replyChannelId: 'thread-9', inThread: true, organizationId: 'org-7', progressLogId: 'P1', startedAt: 1 })
    const sig = signal()
    const res = await handler.decide(PUSH, ROUTE, sig)
    expect(approvals.request).toHaveBeenCalledWith({
      channelId: 'ch1',
      replyChannelId: 'thread-9',
      organizationId: 'org-7',
      toolName: 'Bash',
      toolInput: { command: 'git push origin main' },
      reason: '원격 저장소 변경',
      signal: sig
    })
    expect(res).toEqual(ALLOW_RESPONSE)
  })

  it('deny 결정은 permissionDecision=deny + 사유', async () => {
    const { deps, handler } = setup({ behavior: 'deny', message: '거절함' })
    beginTurn(deps)
    expect(await handler.decide(PUSH, ROUTE, signal())).toEqual({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: '거절함' }
    })
  })

  it('결정이 null(PC 에서 중단·접힘)이면 빈 객체 — 도구 호출을 막지도 허용하지도 않는다', async () => {
    const { deps, handler } = setup(null)
    beginTurn(deps)
    expect(await handler.decide(PUSH, ROUTE, signal())).toEqual({})
  })

  it.each([
    ['Bash', { command: 'rm -rf build' }, '파일·폴더 삭제'],
    ['mcp__dooray-mcp__create_task', { subject: 'x' }, '두레이 쓰기'],
    ['mcp__drop__drop_publish', {}, 'Drop 게시'],
    ['mcp__mysql-nfi__execute_update', { sql: 'update t set a=1' }, 'DB 쓰기']
  ])('%s 도 위험 분류 라벨(%s)로 묻는다', async (tool, input, label) => {
    const { deps, approvals, handler } = setup({ behavior: 'allow' })
    beginTurn(deps)
    await handler.decide(preEvent(tool as string, input as Record<string, unknown>), ROUTE, signal())
    expect(approvals.request.mock.calls[0][0]).toMatchObject({ toolName: tool, reason: label })
  })

  it('위험하지 않은 도구는 null, 묻지 않는다 (진행 단계는 갱신)', async () => {
    const { deps, approvals, progress, handler } = setup({ behavior: 'allow' })
    beginTurn(deps)
    for (const [tool, input] of [
      ['Bash', { command: 'git status' }],
      ['Read', { file_path: '/a' }],
      ['mcp__dooray-mcp__get_task', { id: '1' }]
    ] as const) {
      expect(await handler.decide(preEvent(tool, { ...input }), ROUTE, signal())).toBeNull()
    }
    expect(approvals.request).not.toHaveBeenCalled()
    expect(progress.onTool).toHaveBeenCalledTimes(3)
  })

  it('자율 모드(isGateEnabled=false)면 위험 동작도 null — 하지만 진행 단계는 갱신', async () => {
    const { deps, approvals, progress, handler } = setup({ behavior: 'allow' }, { gate: false })
    beginTurn(deps)
    expect(await handler.decide(PUSH, ROUTE, signal())).toBeNull()
    expect(approvals.request).not.toHaveBeenCalled()
    expect(progress.onTool).toHaveBeenCalledWith('ch1', 'Bash')
  })

  it('isGateEnabled 가 주입되지 않으면 게이트는 꺼진 것으로 본다', async () => {
    const deps = makeDeps()
    beginTurn(deps)
    const approvals = { request: vi.fn(async () => ({ behavior: 'allow' })) }
    const handler = new MentionHookHandler({ ...deps, approvals: approvals as never })
    expect(await handler.decide(PUSH, ROUTE, signal())).toBeNull()
    expect(approvals.request).not.toHaveBeenCalled()
  })

  it('isGateEnabled 는 매번 평가한다 (설정 변경이 즉시 반영)', async () => {
    const deps = makeDeps()
    beginTurn(deps)
    let on = false
    const approvals = { request: vi.fn(async () => ({ behavior: 'allow' })) }
    const handler = new MentionHookHandler({ ...deps, approvals: approvals as never, isGateEnabled: () => on })
    expect(await handler.decide(PUSH, ROUTE, signal())).toBeNull()
    on = true
    expect(await handler.decide(PUSH, ROUTE, signal())).toEqual(ALLOW_RESPONSE)
  })

  it('approvals 가 없으면 null', async () => {
    const deps = makeDeps()
    beginTurn(deps)
    const handler = new MentionHookHandler({ ...deps, isGateEnabled: () => true })
    expect(await handler.decide(PUSH, ROUTE, signal())).toBeNull()
  })

  it('멘션 턴이 없으면 null (위험해도 묻지 않는다)', async () => {
    const { approvals, handler } = setup({ behavior: 'allow' })
    expect(await handler.decide(PUSH, ROUTE, signal())).toBeNull()
    expect(approvals.request).not.toHaveBeenCalled()
  })

  it('사람이 TUI 에 직접 친 턴(manual)이면 null', async () => {
    const { deps, approvals, handler } = setup({ behavior: 'allow' })
    beginTurn(deps)
    deps.turns.onPromptSubmit('ch1', '내가 직접 친 말')
    expect(await handler.decide(PUSH, ROUTE, signal())).toBeNull()
    expect(approvals.request).not.toHaveBeenCalled()
  })

  it('멘션 턴이 끝난 뒤 백그라운드로 이어진 위험 동작도 같은 자리로 묻는다', async () => {
    const { deps, approvals, handler } = setup({ behavior: 'allow' })
    deps.turns.begin('ch1', { logId: 'L1', replyChannelId: 'thread-3', inThread: true, progressLogId: 'P1', startedAt: 1 })
    deps.turns.onStop('ch1') // 첫 턴 종료 — 이제 last 만 남음
    expect(deps.turns.current('ch1')).not.toBeNull()
    await handler.decide(PUSH, ROUTE, signal())
    expect(approvals.request.mock.calls[0][0]).toMatchObject({ replyChannelId: 'thread-3' })
  })

  it('permission_request 등 pre_tool_use 가 아닌 이벤트는 null (더 이상 PermissionRequest 로 결정하지 않는다)', async () => {
    const { deps, approvals, progress, handler } = setup({ behavior: 'allow' })
    beginTurn(deps)
    for (const event of ['permission_request', 'stop', 'user_prompt_submit', 'post_tool_use']) {
      expect(await handler.decide(preEvent('Bash', { command: 'git push' }, { event }), ROUTE, signal())).toBeNull()
    }
    expect(approvals.request).not.toHaveBeenCalled()
    expect(progress.onTool).not.toHaveBeenCalled()
  })

  it('tool_name/tool_input 이 최상위에 없으면 raw 에서 읽는다', async () => {
    const { deps, approvals, handler } = setup({ behavior: 'allow' })
    beginTurn(deps)
    await handler.decide(makeEvent({ event: 'pre_tool_use', raw: { tool_name: 'Bash', tool_input: { command: 'gh pr merge 12' } } }), ROUTE, signal())
    expect(approvals.request.mock.calls[0][0]).toMatchObject({ toolName: 'Bash', toolInput: { command: 'gh pr merge 12' } })
  })

  it('도구 이름이 없으면 null, 진행 갱신도 하지 않는다', async () => {
    const { deps, approvals, progress, handler } = setup({ behavior: 'allow' })
    beginTurn(deps)
    expect(await handler.decide(makeEvent({ event: 'pre_tool_use' }), ROUTE, signal())).toBeNull()
    expect(progress.onTool).not.toHaveBeenCalled()
    expect(approvals.request).not.toHaveBeenCalled()
  })

  it('진행 단계 갱신은 승인 요청보다 먼저', async () => {
    const { deps, approvals, progress, handler } = setup({ behavior: 'allow' })
    beginTurn(deps)
    await handler.decide(PUSH, ROUTE, signal())
    expect(progress.onTool.mock.invocationCallOrder[0]).toBeLessThan(approvals.request.mock.invocationCallOrder[0])
  })

  it('progress 가 없어도 안전', async () => {
    const deps = makeDeps()
    beginTurn(deps)
    const approvals = { request: vi.fn(async () => ({ behavior: 'allow' })) }
    const handler = new MentionHookHandler({ ...deps, approvals: approvals as never, isGateEnabled: () => true })
    await expect(handler.decide(PUSH, ROUTE, signal())).resolves.toEqual(ALLOW_RESPONSE)
  })
})

describe('MentionHookHandler.decide — 항상 승인 기억', () => {
  const push = (cmd = 'git push origin main'): HookEventPayload => makeEvent({ event: 'pre_tool_use', tool_name: 'Bash', tool_input: { command: cmd } })
  const signal = (): AbortSignal => new AbortController().signal

  function setup(decisions: unknown[]) {
    const deps = makeDeps()
    const queue = [...decisions]
    const approvals = { request: vi.fn(async (_r: Record<string, unknown>) => queue.shift() ?? null) }
    const alwaysAllow = new AlwaysAllowStore(memStorage())
    const handler = new MentionHookHandler({ ...deps, approvals: approvals as never, isGateEnabled: () => true, alwaysAllow })
    return { deps, approvals, alwaysAllow, handler }
  }

  it('always 승인이면 서명을 기억하고, 같은 요청은 다시 묻지 않는다 (null)', async () => {
    const { deps, approvals, alwaysAllow, handler } = setup([{ behavior: 'allow', always: true }])
    beginTurn(deps)
    await handler.decide(push(), ROUTE, signal())
    expect(alwaysAllow.has('ch1', 'Bash:git push origin main')).toBe(true)
    expect(await handler.decide(push(), ROUTE, signal())).toBeNull()
    expect(approvals.request).toHaveBeenCalledTimes(1)
  })

  it('서명이 다르면 (다른 명령) 다시 묻는다', async () => {
    const { deps, approvals, handler } = setup([{ behavior: 'allow', always: true }, { behavior: 'allow' }])
    beginTurn(deps)
    await handler.decide(push('git push origin main'), ROUTE, signal())
    await handler.decide(push('git push origin feature'), ROUTE, signal())
    expect(approvals.request).toHaveBeenCalledTimes(2)
  })

  it('일반 승인·거절·null 은 기억하지 않는다', async () => {
    const { deps, approvals, alwaysAllow, handler } = setup([{ behavior: 'allow' }, { behavior: 'deny', message: 'x' }, null])
    beginTurn(deps)
    for (let i = 0; i < 3; i++) await handler.decide(push(), ROUTE, signal())
    expect(alwaysAllow.has('ch1', 'Bash:git push origin main')).toBe(false)
    expect(approvals.request).toHaveBeenCalledTimes(3)
  })

  it('기억은 채널별 — 다른 채널에서는 다시 묻는다', async () => {
    const { deps, approvals, handler } = setup([{ behavior: 'allow', always: true }, { behavior: 'allow' }])
    beginTurn(deps)
    deps.turns.begin('ch2', { logId: 'L2', replyChannelId: 'ch2', inThread: false, startedAt: 1 })
    await handler.decide(push(), ROUTE, signal())
    await handler.decide(push(), { kind: MENTION_HOOK_KIND, id: 'ch2' }, signal())
    expect(approvals.request).toHaveBeenCalledTimes(2)
  })

  it('이미 기억된 서명은 턴이 없어도 조용히 통과 (null) — 묻지 않는다', async () => {
    const { deps, approvals, alwaysAllow, handler } = setup([])
    beginTurn(deps)
    alwaysAllow.add('ch1', 'Bash:git push origin main')
    expect(await handler.decide(push(), ROUTE, signal())).toBeNull()
    expect(approvals.request).not.toHaveBeenCalled()
  })

  it('alwaysAllow 가 없으면 always 결정이어도 에러 없이 응답만 돌려준다', async () => {
    const deps = makeDeps()
    beginTurn(deps)
    const approvals = { request: vi.fn(async () => ({ behavior: 'allow', always: true })) }
    const handler = new MentionHookHandler({ ...deps, approvals: approvals as never, isGateEnabled: () => true })
    await expect(handler.decide(push(), ROUTE, signal())).resolves.toMatchObject({ hookSpecificOutput: { permissionDecision: 'allow' } })
  })
})

describe('MentionHookHandler.handle — pre_tool_use 는 decide 가 맡는다 / stop 순서', () => {
  it('handle 은 pre_tool_use 를 처리하지 않는다 (진행 갱신 이중 호출 방지)', async () => {
    const deps = makeDeps()
    const progress = { onTool: vi.fn(), stop: vi.fn(async () => {}) }
    const handler = new MentionHookHandler({ ...deps, progress })
    await handler.handle(makeEvent({ event: 'pre_tool_use', tool_name: 'Grep' }), ROUTE)
    expect(progress.onTool).not.toHaveBeenCalled()
    expect(deps.publisher.publish).not.toHaveBeenCalled()
  })

  it('멘션 턴 stop 에서 progress.stop 을 await 한 뒤에야 publish 한다', async () => {
    const deps = makeDeps()
    beginTurn(deps)
    let releaseStop!: () => void
    const progress = { onTool: vi.fn(), stop: vi.fn(() => new Promise<void>((r) => { releaseStop = r })) }
    const handler = new MentionHookHandler({ ...deps, progress })
    const done = handler.handle(makeEvent({ event: 'stop', raw: { last_assistant_message: '답' } }), ROUTE)
    await new Promise((r) => setTimeout(r, 10))
    expect(progress.stop).toHaveBeenCalledWith('ch1')
    expect(deps.publisher.publish).not.toHaveBeenCalled()
    releaseStop()
    await done
    expect(deps.publisher.publish).toHaveBeenCalledTimes(1)
    expect(progress.stop.mock.invocationCallOrder[0]).toBeLessThan(deps.publisher.publish.mock.invocationCallOrder[0])
  })

  it('후속(followUp) stop 은 progress.stop 없이 publish — 진행 메시지 logId 는 null', async () => {
    const deps = makeDeps()
    beginTurn(deps, { organizationId: 'org-1' })
    const progress = { onTool: vi.fn(), stop: vi.fn(async () => {}) }
    const handler = new MentionHookHandler({ ...deps, progress })
    await handler.handle(makeEvent({ event: 'stop', raw: { last_assistant_message: '1차 응답' } }), ROUTE)
    expect(progress.stop).toHaveBeenCalledTimes(1)
    await handler.handle(makeEvent({ event: 'stop', raw: { last_assistant_message: '백그라운드 결과' } }), ROUTE)
    expect(progress.stop).toHaveBeenCalledTimes(1)
    expect(deps.publisher.publish).toHaveBeenCalledTimes(2)
    expect(deps.publisher.publish.mock.calls[1][0]).toMatchObject({
      channelId: 'ch1',
      organizationId: 'org-1',
      answer: '백그라운드 결과',
      progressLogId: null
    })
  })

  it('사람이 친 턴(manual) 이후의 stop 은 publish 도 progress.stop 도 하지 않는다', async () => {
    const deps = makeDeps()
    beginTurn(deps)
    const progress = { onTool: vi.fn(), stop: vi.fn(async () => {}) }
    const handler = new MentionHookHandler({ ...deps, progress })
    await handler.handle(makeEvent({ event: 'stop', raw: { last_assistant_message: '1차' } }), ROUTE)
    await handler.handle(makeEvent({ event: 'user_prompt_submit', raw: { prompt: '직접 입력' } }), ROUTE)
    await handler.handle(makeEvent({ event: 'stop', raw: { last_assistant_message: '사적인 답' } }), ROUTE)
    expect(deps.publisher.publish).toHaveBeenCalledTimes(1)
    expect(progress.stop).toHaveBeenCalledTimes(1)
  })
})
