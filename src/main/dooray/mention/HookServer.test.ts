import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { HookServer, type HookEventPayload } from './HookServer'

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
