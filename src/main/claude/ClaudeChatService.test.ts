import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

type FakeProc = EventEmitter & {
  stdout: EventEmitter
  stderr: EventEmitter
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; destroyed: boolean }
  kill: ReturnType<typeof vi.fn>
  killed: boolean
  exitCode: number | null
}

let lastProc: FakeProc | null = null

vi.mock('child_process', () => {
  const spawn = vi.fn(() => {
    const proc = new EventEmitter() as FakeProc
    Object.assign(proc, {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      stdin: { write: vi.fn(), end: vi.fn(), destroyed: false },
      kill: vi.fn(),
      killed: false,
      exitCode: null
    })
    lastProc = proc
    return proc
  })
  const out = {
    spawn,
    execFile: vi.fn(),
    execFileSync: vi.fn(),
    exec: vi.fn(),
    fork: vi.fn()
  }
  return { ...out, default: out }
})

const winSend = vi.fn()
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: winSend } }] }
}))

import { ClaudeChatService } from './ClaudeChatService'

beforeEach(() => {
  winSend.mockReset()
  lastProc = null
})

function emitLine(obj: unknown): void {
  lastProc?.stdout.emit('data', Buffer.from(JSON.stringify(obj) + '\n', 'utf8'))
}

/** send 후 즉시 result 이벤트 인젝션 (polling resolve 보장 — testTimeout 회피) */
function sendAndComplete(svc: ClaudeChatService, req: { chatId: string; prompt: string; cwd?: string; sessionId?: string }): void {
  svc.send(req as never)
  // 즉시 result 송신 → sessionIdPromise resolve
  emitLine({ type: 'result', session_id: 'auto-sid', duration_ms: 0, total_cost_usd: 0, is_error: false })
}

describe('ClaudeChatService.send / startSession', () => {
  it('처음 호출 시 spawn + stdin user 메시지', () => {
    const svc = new ClaudeChatService('/usr/bin/claude')
    sendAndComplete(svc, { chatId: 'c1', prompt: '안녕', cwd: '/tmp' })
    expect(lastProc).not.toBeNull()
    const writeCall = (lastProc!.stdin.write as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const sent = JSON.parse(writeCall.trim())
    expect(sent.type).toBe('user')
    expect(sent.message.content[0].text).toBe('안녕')
    svc.cancel('c1')
  })

  it('resume sessionId 전달 시 --resume 인자 포함', async () => {
    const { spawn } = await import('child_process')
    const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>
    spawnMock.mockClear()
    const svc = new ClaudeChatService('/usr/bin/claude')
    sendAndComplete(svc, { chatId: 'c1', prompt: 'hi', cwd: '/tmp', sessionId: 'sess-1' })
    const args = spawnMock.mock.calls[0][1] as string[]
    expect(args).toContain('--resume')
    expect(args).toContain('sess-1')
    svc.cancel('c1')
  })

  it('두 번째 send 는 동일 프로세스 재사용', async () => {
    const { spawn } = await import('child_process')
    const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>
    spawnMock.mockClear()
    const svc = new ClaudeChatService('/usr/bin/claude')
    sendAndComplete(svc, { chatId: 'c1', prompt: 'a', cwd: '/tmp' })
    sendAndComplete(svc, { chatId: 'c1', prompt: 'b', cwd: '/tmp' })
    expect(spawnMock).toHaveBeenCalledTimes(1)
    svc.cancel('c1')
  })

  it('cwd 변경 시 재시작', async () => {
    const { spawn } = await import('child_process')
    const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>
    spawnMock.mockClear()
    const svc = new ClaudeChatService('/usr/bin/claude')
    sendAndComplete(svc, { chatId: 'c1', prompt: 'a', cwd: '/tmp/a' })
    sendAndComplete(svc, { chatId: 'c1', prompt: 'b', cwd: '/tmp/b' })
    expect(spawnMock).toHaveBeenCalledTimes(2)
    svc.cancel('c1')
  })
})

describe('ClaudeChatService.handleJsonLine', () => {
  it('stream_event text_delta → assistant_text', () => {
    const svc = new ClaudeChatService('/usr/bin/claude')
    sendAndComplete(svc, { chatId: 'c1', prompt: '안녕' })
    emitLine({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '응' } } })
    const calls = winSend.mock.calls.map((c) => c[1])
    expect(calls.some((e) => e.type === 'assistant_text' && e.delta === '응')).toBe(true)
    svc.cancel('c1')
  })

  it('tool_use → tool_use 이벤트', () => {
    const svc = new ClaudeChatService('/usr/bin/claude')
    sendAndComplete(svc, { chatId: 'c1', prompt: 'x' })
    emitLine({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't-1', name: 'Bash', input: { cmd: 'ls' } }] } })
    const ev = winSend.mock.calls.map((c) => c[1]).find((e) => e.type === 'tool_use')
    expect(ev?.name).toBe('Bash')
    expect(ev?.toolId).toBe('t-1')
    svc.cancel('c1')
  })

  it('tool_result string content', () => {
    const svc = new ClaudeChatService('/usr/bin/claude')
    sendAndComplete(svc, { chatId: 'c1', prompt: 'x' })
    emitLine({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't-1', content: 'OUTPUT' }] } })
    const ev = winSend.mock.calls.map((c) => c[1]).find((e) => e.type === 'tool_result')
    expect(ev?.content).toBe('OUTPUT')
    svc.cancel('c1')
  })

  it('tool_result array content → text 합침', () => {
    const svc = new ClaudeChatService('/usr/bin/claude')
    sendAndComplete(svc, { chatId: 'c1', prompt: 'x' })
    emitLine({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't', is_error: true, content: [{ text: 'A' }, { text: 'B' }] }] } })
    const ev = winSend.mock.calls.map((c) => c[1]).find((e) => e.type === 'tool_result' && e.isError === true)
    expect(ev?.content).toBe('A\nB')
    svc.cancel('c1')
  })

  it('result → sessionId/duration/cost', () => {
    const svc = new ClaudeChatService('/usr/bin/claude')
    svc.send({ chatId: 'c1', prompt: 'x' } as never)
    emitLine({ type: 'result', session_id: 'sess-9', duration_ms: 1200, total_cost_usd: 0.01, is_error: false, usage: { input_tokens: 10 } })
    const ev = winSend.mock.calls.map((c) => c[1]).find((e) => e.type === 'result')
    expect(ev?.sessionId).toBe('sess-9')
    expect(ev?.durationMs).toBe(1200)
    expect(ev?.costUsd).toBe(0.01)
    expect(ev?.inputTokens).toBe(10)
    svc.cancel('c1')
  })

  it('assistant.usage 즉시 usage 이벤트', () => {
    const svc = new ClaudeChatService('/usr/bin/claude')
    sendAndComplete(svc, { chatId: 'c1', prompt: 'x' })
    emitLine({ type: 'assistant', message: { content: [], usage: { input_tokens: 5, output_tokens: 3 } } })
    const ev = winSend.mock.calls.map((c) => c[1]).find((e) => e.type === 'usage')
    expect(ev?.inputTokens).toBe(5)
    expect(ev?.outputTokens).toBe(3)
    svc.cancel('c1')
  })

  it('non-JSON 라인 무시', () => {
    const svc = new ClaudeChatService('/usr/bin/claude')
    sendAndComplete(svc, { chatId: 'c1', prompt: 'x' })
    expect(() => lastProc!.stdout.emit('data', Buffer.from('garbage\n', 'utf8'))).not.toThrow()
    svc.cancel('c1')
  })
})

describe('ClaudeChatService — 에러/종료', () => {
  it('proc error → error 이벤트', () => {
    const svc = new ClaudeChatService('/usr/bin/claude')
    sendAndComplete(svc, { chatId: 'c1', prompt: 'x' })
    lastProc!.emit('error', new Error('spawn failed'))
    const ev = winSend.mock.calls.map((c) => c[1]).find((e) => e.type === 'error')
    expect(ev?.message).toContain('spawn failed')
  })

  it('비정상 종료 + result 전송 안된 경우 error', () => {
    const svc = new ClaudeChatService('/usr/bin/claude')
    svc.send({ chatId: 'c1', prompt: 'x' } as never)
    lastProc!.stderr.emit('data', Buffer.from('stderr msg', 'utf8'))
    lastProc!.emit('close', 1)
    const ev = winSend.mock.calls.map((c) => c[1]).find((e) => e.type === 'error')
    expect(ev?.message).toContain('stderr msg')
  })

  it('정상 종료 (code=0) 는 error 없음', () => {
    const svc = new ClaudeChatService('/usr/bin/claude')
    sendAndComplete(svc, { chatId: 'c1', prompt: 'x' })
    lastProc!.emit('close', 0)
    const ev = winSend.mock.calls.map((c) => c[1]).find((e) => e.type === 'error')
    expect(ev).toBeUndefined()
  })

  it('cancel — stdin.end + kill', () => {
    const svc = new ClaudeChatService('/usr/bin/claude')
    sendAndComplete(svc, { chatId: 'c1', prompt: 'x' })
    svc.cancel('c1')
    expect(lastProc!.stdin.end).toHaveBeenCalled()
    expect(lastProc!.kill).toHaveBeenCalled()
  })

  it('cancel 없는 chatId no-op', () => {
    const svc = new ClaudeChatService('/usr/bin/claude')
    expect(() => svc.cancel('nope')).not.toThrow()
  })

  it('dispose 는 모든 세션 종료', () => {
    const svc = new ClaudeChatService('/usr/bin/claude')
    sendAndComplete(svc, { chatId: 'a', prompt: 'x' })
    const procA = lastProc!
    sendAndComplete(svc, { chatId: 'b', prompt: 'y' })
    const procB = lastProc!
    svc.dispose()
    expect(procA.kill).toHaveBeenCalled()
    expect(procB.kill).toHaveBeenCalled()
  })
})
