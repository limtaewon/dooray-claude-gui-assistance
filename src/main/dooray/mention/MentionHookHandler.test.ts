import { describe, it, expect, vi } from 'vitest'
import { join } from 'path'
import {
  MentionHookHandler,
  MENTION_HOOK_KIND,
  composeStopMessage,
  extractAssistantMessage,
  formatToolDetail
} from './MentionHookHandler'
import type { HookRoute } from '../../hooks/ClaudeHookRouter'
import type { HookEventPayload } from './HookServer'

const AGENT_ROOT = join('/tmp', 'clauday-agent-root')

interface SessionRecord {
  organizationId?: string
  [key: string]: unknown
}

function makeDeps(opts: { session?: SessionRecord | null; readTranscript?: (p: string) => string } = {}): {
  sessions: { get: ReturnType<typeof vi.fn>; setClaudeSessionId: ReturnType<typeof vi.fn>; markIdle: ReturnType<typeof vi.fn> }
  responder: { send: ReturnType<typeof vi.fn> }
  getAgentRoot: ReturnType<typeof vi.fn>
  readTranscript: ReturnType<typeof vi.fn>
} {
  const sessions = {
    get: vi.fn(() => opts.session ?? null),
    setClaudeSessionId: vi.fn(),
    markIdle: vi.fn()
  }
  const responder = { send: vi.fn(async () => {}) }
  const getAgentRoot = vi.fn(() => AGENT_ROOT)
  const readTranscript = vi.fn(opts.readTranscript ?? (() => ''))
  return { sessions, responder, getAgentRoot, readTranscript }
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

  it('agentRoot 의 형제 경로(prefix 매칭 오류) → 현행 동작 고정 (ADR-v2-workspace-p0-05) — 개선은 후속', () => {
    const deps = makeDeps()
    const handler = new MentionHookHandler(deps)
    // `<agentRoot>-sibling` 은 agentRoot 하위가 아닌데도 startsWith 매칭에 걸려
    // path.relative 결과가 '..' 로 나온다. 발견된 기존 결함 — 이번 트랙에서 수정하지 않는다.
    const sibling = `${AGENT_ROOT}-sibling`
    expect(handler.resolve(sibling)).toEqual({ kind: MENTION_HOOK_KIND, id: '..' })
  })
})

describe('MentionHookHandler.handle — post_tool_use / stop', () => {
  it('도구 3건 누적 후 stop → 본문에 — 사용 도구: 요약 포함', async () => {
    const deps = makeDeps()
    const handler = new MentionHookHandler(deps)
    await handler.handle(
      makeEvent({ event: 'post_tool_use', tool_name: 'Read', tool_input: { file_path: '/x/a.ts' } }),
      ROUTE
    )
    await handler.handle(
      makeEvent({ event: 'post_tool_use', tool_name: 'Bash', tool_input: { command: 'ls -la' } }),
      ROUTE
    )
    await handler.handle(
      makeEvent({ event: 'post_tool_use', tool_name: 'Grep', tool_input: { pattern: 'TODO' } }),
      ROUTE
    )
    await handler.handle(makeEvent({ event: 'stop', raw: {} }), ROUTE)

    const body = deps.responder.send.mock.calls[0][1] as string
    expect(body).toContain('— 사용 도구: Read(a.ts), Bash(ls -la), Grep(TODO)')
  })

  it('도구 9건 누적 → 앞 8건 + 외 1건', async () => {
    const deps = makeDeps()
    const handler = new MentionHookHandler(deps)
    for (let i = 0; i < 9; i++) {
      await handler.handle(
        makeEvent({ event: 'post_tool_use', tool_name: 'Bash', tool_input: { command: `cmd-${i}` } }),
        ROUTE
      )
    }
    await handler.handle(makeEvent({ event: 'stop', raw: {} }), ROUTE)

    const body = deps.responder.send.mock.calls[0][1] as string
    expect(body).toContain('외 1건')
    expect(body.match(/cmd-/g)?.length).toBe(8)
  })

  it('stop 2회 연속 → 2회차 본문에는 도구 라인이 없다 (버퍼 비움)', async () => {
    const deps = makeDeps()
    const handler = new MentionHookHandler(deps)
    await handler.handle(
      makeEvent({ event: 'post_tool_use', tool_name: 'Bash', tool_input: { command: 'echo hi' } }),
      ROUTE
    )
    await handler.handle(makeEvent({ event: 'stop', raw: {} }), ROUTE)
    await handler.handle(makeEvent({ event: 'stop', raw: {} }), ROUTE)

    const secondBody = deps.responder.send.mock.calls[1][1] as string
    expect(secondBody).not.toContain('— 사용 도구:')
  })

  it('last_assistant_message: string 형태', async () => {
    const deps = makeDeps()
    const handler = new MentionHookHandler(deps)
    await handler.handle(makeEvent({ event: 'stop', raw: { last_assistant_message: '텍스트 응답' } }), ROUTE)
    expect(deps.responder.send.mock.calls[0][1]).toBe('텍스트 응답')
  })

  it('last_assistant_message: { content: [{type:"text", text}] } 형태', async () => {
    const deps = makeDeps()
    const handler = new MentionHookHandler(deps)
    await handler.handle(
      makeEvent({
        event: 'stop',
        raw: { last_assistant_message: { content: [{ type: 'text', text: 'hello' }] } }
      }),
      ROUTE
    )
    expect(deps.responder.send.mock.calls[0][1]).toBe('hello')
  })

  it('last_assistant_message: { message: { content: [...] } } 형태', async () => {
    const deps = makeDeps()
    const handler = new MentionHookHandler(deps)
    await handler.handle(
      makeEvent({
        event: 'stop',
        raw: { last_assistant_message: { message: { content: [{ type: 'text', text: 'world' }] } } }
      }),
      ROUTE
    )
    expect(deps.responder.send.mock.calls[0][1]).toBe('world')
  })

  it('비어 있고 transcript_path 있으면 transcript fallback 사용', async () => {
    const deps = makeDeps({ readTranscript: () => 'transcript 본문' })
    const handler = new MentionHookHandler(deps)
    await handler.handle(
      makeEvent({ event: 'stop', raw: { transcript_path: '/tmp/x/abc-123.jsonl' } }),
      ROUTE
    )
    expect(deps.readTranscript).toHaveBeenCalledWith('/tmp/x/abc-123.jsonl')
    expect(deps.responder.send.mock.calls[0][1]).toBe('transcript 본문')
  })

  it('응답 텍스트가 전혀 없으면 "응답 완료."', async () => {
    const deps = makeDeps()
    const handler = new MentionHookHandler(deps)
    await handler.handle(makeEvent({ event: 'stop', raw: {} }), ROUTE)
    expect(deps.responder.send.mock.calls[0][1]).toBe('응답 완료.')
  })

  it('transcript_path 의 basename(.jsonl 제거)을 claudeSessionId 로 저장', async () => {
    const deps = makeDeps()
    const handler = new MentionHookHandler(deps)
    await handler.handle(
      makeEvent({ event: 'stop', raw: { transcript_path: '/x/y/abc-123.jsonl' } }),
      ROUTE
    )
    expect(deps.sessions.setClaudeSessionId).toHaveBeenCalledWith('ch1', 'abc-123')
  })

  it('orgId 는 sessions.get()?.organizationId, 세션 있으면 그 값 사용', async () => {
    const deps = makeDeps({ session: { organizationId: 'org-1', tabId: 't' } })
    const handler = new MentionHookHandler(deps)
    await handler.handle(makeEvent({ event: 'stop', raw: {} }), ROUTE)
    expect(deps.responder.send).toHaveBeenCalledWith('ch1', expect.any(String), 'org-1')
  })

  it('orgId 는 세션이 없으면 undefined', async () => {
    const deps = makeDeps({ session: null })
    const handler = new MentionHookHandler(deps)
    await handler.handle(makeEvent({ event: 'stop', raw: {} }), ROUTE)
    expect(deps.responder.send).toHaveBeenCalledWith('ch1', expect.any(String), undefined)
  })

  it('호출 순서: send 이후 markIdle', async () => {
    const deps = makeDeps()
    const handler = new MentionHookHandler(deps)
    await handler.handle(makeEvent({ event: 'stop', raw: {} }), ROUTE)

    const sendOrder = deps.responder.send.mock.invocationCallOrder[0]
    const markIdleOrder = deps.sessions.markIdle.mock.invocationCallOrder[0]
    expect(sendOrder).toBeLessThan(markIdleOrder)
  })

  it('send 가 reject 하면 markIdle 은 호출되지 않고 handle 도 reject 한다 (현행 동작 고정 — ADR-v2-workspace-p0-05, 개선은 후속)', async () => {
    const deps = makeDeps()
    deps.responder.send.mockRejectedValueOnce(new Error('send 실패'))
    const handler = new MentionHookHandler(deps)

    await expect(handler.handle(makeEvent({ event: 'stop', raw: {} }), ROUTE)).rejects.toThrow('send 실패')
    expect(deps.sessions.markIdle).not.toHaveBeenCalled()
  })

  it('알 수 없는 event 이름은 아무것도 하지 않는다', async () => {
    const deps = makeDeps()
    const handler = new MentionHookHandler(deps)
    await handler.handle(makeEvent({ event: 'pre_tool_use', raw: {} }), ROUTE)
    expect(deps.sessions.get).not.toHaveBeenCalled()
    expect(deps.responder.send).not.toHaveBeenCalled()
  })
})

describe('composeStopMessage / extractAssistantMessage / formatToolDetail', () => {
  it('composeStopMessage — 도구 없으면 본문만', () => {
    expect(composeStopMessage('안녕', [])).toBe('안녕')
  })

  it('extractAssistantMessage — 지원하지 않는 형태는 빈 문자열', () => {
    expect(extractAssistantMessage(42)).toBe('')
    expect(extractAssistantMessage(null)).toBe('')
  })

  it('extractAssistantMessage — content 배열에 순수 문자열 원소가 섞여도 합쳐진다', () => {
    expect(extractAssistantMessage({ content: ['a', { type: 'text', text: 'b' }, 'c'] })).toBe('a\nb\nc')
  })

  it('extractAssistantMessage — content 가 문자열이면 그대로(trim) 사용', () => {
    expect(extractAssistantMessage({ content: '  평문 응답  ' })).toBe('평문 응답')
  })

  it('formatToolDetail — tool/input 없으면 빈 문자열', () => {
    expect(formatToolDetail(undefined, undefined)).toBe('')
    expect(formatToolDetail('Read', undefined)).toBe('')
  })

  it('formatToolDetail — 알 수 없는 tool 은 빈 문자열', () => {
    expect(formatToolDetail('UnknownTool', { foo: 'bar' })).toBe('')
  })
})
