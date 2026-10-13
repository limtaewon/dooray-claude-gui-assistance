import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { request as httpRequest } from 'http'
import { HookServer, DECISION_EVENTS, type HookEventPayload } from './HookServer'

async function post(port: number, path: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })
  const text = await res.text()
  return { status: res.status, body: text }
}

let server: HookServer

beforeEach(async () => {
  server = new HookServer()
})
afterEach(() => {
  server.stop()
})

describe('HookServer', () => {
  it('start() 후 port/secret 반환', async () => {
    const info = await server.start()
    expect(info.port).toBeGreaterThan(0)
    expect(info.secret.length).toBeGreaterThan(10)
    expect(server.getPort()).toBe(info.port)
    expect(server.getSecret()).toBe(info.secret)
  })

  it('start() 중복 호출 안전 (같은 값)', async () => {
    const a = await server.start()
    const b = await server.start()
    expect(a.port).toBe(b.port)
    expect(a.secret).toBe(b.secret)
  })

  it('비-POST 요청은 405', async () => {
    const { port } = await server.start()
    const res = await fetch(`http://127.0.0.1:${port}/clauday-hook`, { method: 'GET' })
    expect(res.status).toBe(405)
  })

  it('secret 헤더 누락/오류는 401', async () => {
    const { port } = await server.start()
    const r1 = await post(port, '/clauday-hook?event=stop', {})
    expect(r1.status).toBe(401)
    const r2 = await post(port, '/clauday-hook?event=stop', {}, { 'X-Clauday-Secret': 'wrong' })
    expect(r2.status).toBe(401)
  })

  it('올바른 secret 으로 호출 시 200 + handler 호출', async () => {
    const { port, secret } = await server.start()
    const seen: HookEventPayload[] = []
    server.setHandler((ev) => { seen.push(ev) })
    const res = await post(port, '/clauday-hook?event=stop', { cwd: '/abc', tool_name: 'Bash' }, { 'X-Clauday-Secret': secret })
    expect(res.status).toBe(200)
    // 핸들러는 비동기 — 잠깐 대기
    await new Promise((r) => setTimeout(r, 20))
    expect(seen).toHaveLength(1)
    expect(seen[0].event).toBe('stop')
    expect(seen[0].cwd).toBe('/abc')
    expect(seen[0].tool_name).toBe('Bash')
    expect(seen[0].raw.cwd).toBe('/abc')
  })

  it('잘못된 JSON body 도 200 응답 (raw 만 빈 객체)', async () => {
    const { port, secret } = await server.start()
    const seen: HookEventPayload[] = []
    server.setHandler((ev) => { seen.push(ev) })
    const res = await post(port, '/clauday-hook?event=x', 'not json', { 'X-Clauday-Secret': secret })
    expect(res.status).toBe(200)
    await new Promise((r) => setTimeout(r, 20))
    expect(seen[0].cwd).toBe('')
  })

  it('handler 에러도 응답 200 으로 마감', async () => {
    const { port, secret } = await server.start()
    server.setHandler(() => { throw new Error('boom') })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await post(port, '/clauday-hook?event=x', { cwd: '/' }, { 'X-Clauday-Secret': secret })
    expect(res.status).toBe(200)
    await new Promise((r) => setTimeout(r, 20))
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('event query 가 없으면 ev.event=""', async () => {
    const { port, secret } = await server.start()
    let seen: HookEventPayload | undefined
    server.setHandler((ev) => { seen = ev })
    await post(port, '/clauday-hook', { cwd: '/x' }, { 'X-Clauday-Secret': secret })
    await new Promise((r) => setTimeout(r, 20))
    expect(seen?.event).toBe('')
  })

  it('stop() 후 더 이상 응답하지 않음', async () => {
    const { port } = await server.start()
    server.stop()
    await expect(fetch(`http://127.0.0.1:${port}/clauday-hook`)).rejects.toThrow()
  })
})

// ───────────────────────── permission_request 결정 ─────────────────────────

describe('HookServer — decider (pre_tool_use)', () => {
  const PERM = '/clauday-hook?event=pre_tool_use'

  it('DECISION_EVENTS 는 pre_tool_use 만 (permission_request 는 더 이상 결정하지 않는다)', () => {
    expect([...DECISION_EVENTS]).toEqual(['pre_tool_use'])
  })

  it('decider 결과를 응답 본문(JSON)으로 돌려주고, 이벤트 payload 를 넘긴다', async () => {
    const { port, secret } = await server.start()
    const decision = { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } }
    const decider = vi.fn(async () => decision)
    const handler = vi.fn()
    server.setDecider(decider)
    server.setHandler(handler)
    const res = await post(port, PERM, { cwd: '/ws/c1', tool_name: 'Bash', tool_input: { command: 'ls' } }, { 'X-Clauday-Secret': secret })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual(decision)
    expect(decider).toHaveBeenCalledTimes(1)
    const [ev, signal] = decider.mock.calls[0] as unknown as [HookEventPayload, AbortSignal]
    expect(ev).toMatchObject({ event: 'pre_tool_use', cwd: '/ws/c1', tool_name: 'Bash', tool_input: { command: 'ls' } })
    expect(signal.aborted).toBe(false)
    // 결정형 이벤트는 일반 handler 로 가지 않는다
    await new Promise((r) => setTimeout(r, 20))
    expect(handler).not.toHaveBeenCalled()
  })

  it('decider 가 오래 걸리면 그동안 응답을 보류한다', async () => {
    const { port, secret } = await server.start()
    let release!: (v: Record<string, unknown>) => void
    server.setDecider(() => new Promise((r) => { release = r }))
    let done = false
    const pending = post(port, PERM, { cwd: '/x' }, { 'X-Clauday-Secret': secret }).then((r) => { done = true; return r })
    await new Promise((r) => setTimeout(r, 50))
    expect(done).toBe(false)
    release({ ok: 1 })
    expect(JSON.parse((await pending).body)).toEqual({ ok: 1 })
  })

  it('decider 가 null 을 주면 빈 객체 (결정 안 함)', async () => {
    const { port, secret } = await server.start()
    server.setDecider(async () => null)
    const res = await post(port, PERM, { cwd: '/x' }, { 'X-Clauday-Secret': secret })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual({})
  })

  it('decider 가 throw 해도 200 {} 로 마감', async () => {
    const { port, secret } = await server.start()
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    server.setDecider(async () => { throw new Error('boom') })
    const res = await post(port, PERM, { cwd: '/x' }, { 'X-Clauday-Secret': secret })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual({})
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('decider 대기 중 클라이언트가 연결을 끊으면 signal 이 abort 된다', async () => {
    const { port, secret } = await server.start()
    let captured: AbortSignal | undefined
    const started = vi.fn()
    server.setDecider((_ev, signal) => {
      captured = signal
      started()
      return new Promise((resolve) => signal.addEventListener('abort', () => resolve(null)))
    })
    const body = JSON.stringify({ cwd: '/x', tool_name: 'Bash' })
    const req = httpRequest({
      host: '127.0.0.1', port, path: PERM, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-Clauday-Secret': secret }
    })
    req.on('error', () => {})
    req.end(body)
    await vi.waitFor(() => expect(started).toHaveBeenCalled())
    expect(captured!.aborted).toBe(false)
    req.destroy()
    await vi.waitFor(() => expect(captured!.aborted).toBe(true))
  })

  it('정상 응답이 나간 뒤에는 abort 하지 않는다', async () => {
    const { port, secret } = await server.start()
    let captured: AbortSignal | undefined
    server.setDecider(async (_ev, signal) => { captured = signal; return {} })
    await post(port, PERM, { cwd: '/x' }, { 'X-Clauday-Secret': secret })
    await new Promise((r) => setTimeout(r, 30))
    expect(captured!.aborted).toBe(false)
  })

  it('다른 이벤트는 decider 를 거치지 않고 즉시 {} + handler 호출', async () => {
    const { port, secret } = await server.start()
    const decider = vi.fn(async () => ({ never: true }))
    const seen: HookEventPayload[] = []
    server.setDecider(decider)
    server.setHandler((ev) => { seen.push(ev) })
    for (const event of ['stop', 'permission_request', 'user_prompt_submit', 'post_tool_use']) {
      const res = await post(port, `/clauday-hook?event=${event}`, { cwd: '/x' }, { 'X-Clauday-Secret': secret })
      expect(res.status).toBe(200)
      expect(res.body).toBe('{}')
    }
    await new Promise((r) => setTimeout(r, 30))
    expect(decider).not.toHaveBeenCalled()
    expect(seen.map((e) => e.event)).toEqual(['stop', 'permission_request', 'user_prompt_submit', 'post_tool_use'])
  })

  it('decider 미설정이면 pre_tool_use 도 기존 동작 (즉시 {} + handler)', async () => {
    const { port, secret } = await server.start()
    const seen: HookEventPayload[] = []
    server.setHandler((ev) => { seen.push(ev) })
    const res = await post(port, PERM, { cwd: '/x' }, { 'X-Clauday-Secret': secret })
    expect(res.status).toBe(200)
    expect(res.body).toBe('{}')
    await new Promise((r) => setTimeout(r, 30))
    expect(seen.map((e) => e.event)).toEqual(['pre_tool_use'])
  })

  it('시크릿이 틀리면 pre_tool_use 도 401, decider 호출 없음', async () => {
    const { port } = await server.start()
    const decider = vi.fn(async () => ({}))
    server.setDecider(decider)
    const r1 = await post(port, PERM, { cwd: '/x' })
    const r2 = await post(port, PERM, { cwd: '/x' }, { 'X-Clauday-Secret': 'wrong' })
    expect(r1.status).toBe(401)
    expect(r2.status).toBe(401)
    expect(decider).not.toHaveBeenCalled()
  })
})
