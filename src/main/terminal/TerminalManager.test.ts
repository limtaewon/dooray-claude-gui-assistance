import { describe, it, expect, vi, beforeEach } from 'vitest'

type Handler = (data: string) => void
type ExitInfo = { exitCode: number; signal?: number }
type ExitHandler = (info: ExitInfo) => void
let lastPty: {
  write: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  emitData: (data: string) => void
  emitExit: (info?: ExitInfo) => void
  pid: number
} | null = null

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => {
    let onDataCb: Handler | null = null
    let onExitCb: ExitHandler | null = null
    const pty = {
      pid: Math.floor(Math.random() * 10000),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: (cb: Handler) => { onDataCb = cb },
      onExit: (cb: ExitHandler) => { onExitCb = cb },
      emitData: (data: string) => onDataCb?.(data),
      emitExit: (info: ExitInfo = { exitCode: 0, signal: undefined }) => onExitCb?.(info)
    }
    lastPty = pty
    return pty
  })
}))

import { TerminalManager } from './TerminalManager'
import { IPC_CHANNELS } from '../../shared/types/ipc'

beforeEach(() => {
  lastPty = null
})

describe('TerminalManager.create', () => {
  it('새 세션 생성 후 listSessions 에 등장', () => {
    const m = new TerminalManager()
    const meta = m.create({ cwd: '/tmp' })
    expect(meta.id).toBeTruthy()
    expect(m.listSessions().map((s) => s.id)).toContain(meta.id)
  })

  it('cwd 미지정 시 homedir 사용', () => {
    const m = new TerminalManager()
    const meta = m.create({})
    expect(meta.cwd).toBeTruthy()
  })

  it('command 지정 시 name 에 반영', () => {
    const m = new TerminalManager()
    const meta = m.create({ command: 'python' })
    expect(meta.name).toBe('python')
  })

  it('기본 name = Terminal', () => {
    const m = new TerminalManager()
    const meta = m.create({})
    expect(meta.name).toBe('Terminal')
  })
})

describe('TerminalManager.input/resize/kill', () => {
  it('input → pty.write 위임', () => {
    const m = new TerminalManager()
    const { id } = m.create({})
    m.input(id, 'hello\n')
    expect(lastPty!.write).toHaveBeenCalledWith('hello\n')
  })

  it('input — 없는 id no-op', () => {
    const m = new TerminalManager()
    expect(() => m.input('nope', 'x')).not.toThrow()
  })

  it('resize — 정상 값', () => {
    const m = new TerminalManager()
    const { id } = m.create({})
    m.resize({ id, cols: 80, rows: 24 })
    expect(lastPty!.resize).toHaveBeenCalledWith(80, 24)
  })

  it('resize — 0 이하는 skip', () => {
    const m = new TerminalManager()
    const { id } = m.create({})
    m.resize({ id, cols: 0, rows: 24 })
    expect(lastPty!.resize).not.toHaveBeenCalled()
  })

  it('resize 가 throw 해도 안전', () => {
    const m = new TerminalManager()
    const { id } = m.create({})
    lastPty!.resize.mockImplementation(() => { throw new Error('fail') })
    expect(() => m.resize({ id, cols: 80, rows: 24 })).not.toThrow()
  })

  it('kill 후 listSessions 제거', () => {
    const m = new TerminalManager()
    const { id } = m.create({})
    m.kill(id)
    expect(m.listSessions()).toEqual([])
    expect(lastPty!.kill).toHaveBeenCalled()
  })

  it('kill — 없는 id no-op', () => {
    const m = new TerminalManager()
    expect(() => m.kill('nope')).not.toThrow()
  })
})

describe('TerminalManager.onData 처리', () => {
  it('output 버퍼 누적 + getOutput', () => {
    const m = new TerminalManager()
    const { id } = m.create({})
    lastPty!.emitData('hello ')
    lastPty!.emitData('world')
    expect(m.getOutput(id)).toBe('hello world')
  })

  it('mainWindow 살아있으면 IPC 전송', () => {
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } }
    const m = new TerminalManager()
    m.setMainWindow(win as never)
    m.create({})
    lastPty!.emitData('out')
    expect(send).toHaveBeenCalled()
  })

  it('destroyed mainWindow 면 IPC skip', () => {
    const send = vi.fn()
    const win = { isDestroyed: () => true, webContents: { send } }
    const m = new TerminalManager()
    m.setMainWindow(win as never)
    m.create({})
    lastPty!.emitData('out')
    expect(send).not.toHaveBeenCalled()
  })

  it('addOutputListener 가 onData 마다 (id, data) 로 호출됨 + unsubscribe 후 미호출', () => {
    const m = new TerminalManager()
    const { id } = m.create({})
    const cb = vi.fn()
    const off = m.addOutputListener(cb)

    lastPty!.emitData('chunk1')
    expect(cb).toHaveBeenCalledWith(id, 'chunk1')

    off()
    lastPty!.emitData('chunk2')
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('output listener 1개가 throw 해도 webContents.send 와 다른 listener 는 정상', () => {
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } }
    const m = new TerminalManager()
    m.setMainWindow(win as never)
    const { id } = m.create({})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const throwing = vi.fn(() => { throw new Error('boom') })
    const ok = vi.fn()
    m.addOutputListener(throwing)
    m.addOutputListener(ok)

    lastPty!.emitData('x')

    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.TERMINAL_OUTPUT, { id, data: 'x' })
    expect(ok).toHaveBeenCalledWith(id, 'x')
    expect(warnSpy).toHaveBeenCalledWith(
      '[TerminalManager] output listener 실패',
      expect.objectContaining({ sessionId: id })
    )
    warnSpy.mockRestore()
  })

  it('pty exit → session 자동 제거', () => {
    const m = new TerminalManager()
    const { id } = m.create({})
    lastPty!.emitExit()
    expect(m.listSessions().map((s) => s.id)).not.toContain(id)
  })

  it('getOutput — 없는 id 는 빈 문자열', () => {
    const m = new TerminalManager()
    expect(m.getOutput('nope')).toBe('')
  })
})

describe('TerminalManager.exportSessions / setName / dispose', () => {
  it('exportSessions 는 meta + output 반환', () => {
    const m = new TerminalManager()
    m.create({})
    lastPty!.emitData('output text')
    const exp = m.exportSessions()
    expect(exp).toHaveLength(1)
    expect(exp[0].output).toContain('output text')
  })

  it('setName — 성공 시 true + meta.name 변경', () => {
    const m = new TerminalManager()
    const { id } = m.create({})
    expect(m.setName(id, 'My Tab')).toBe(true)
    expect(m.listSessions()[0].name).toBe('My Tab')
  })

  it('setName — 없는 id 면 false', () => {
    const m = new TerminalManager()
    expect(m.setName('nope', 'X')).toBe(false)
  })

  it('dispose — 모든 세션 kill', () => {
    const m = new TerminalManager()
    m.create({})
    const p1 = lastPty!
    m.create({})
    const p2 = lastPty!
    m.dispose()
    expect(p1.kill).toHaveBeenCalled()
    expect(p2.kill).toHaveBeenCalled()
  })

  it('exportSessions — alt screen exit 이후만 출력', () => {
    const m = new TerminalManager()
    m.create({})
    // alternate screen enter then exit, then normal output
    lastPty!.emitData('\x1b[?1049hsome TUI redraw\x1b[?1049lAfter exit')
    const exp = m.exportSessions()
    expect(exp[0].output).toBe('After exit')
  })

  it('exportSessions — 마지막 미완성 ESC 자르기', () => {
    const m = new TerminalManager()
    m.create({})
    lastPty!.emitData('text\x1b[')  // incomplete CSI
    const exp = m.exportSessions()
    expect(exp[0].output).toBe('text')
  })
})

describe('TerminalManager exit 통지 (B-1)', () => {
  it('PTY 종료 → webContents.send(TERMINAL_EXIT) 1회 + addExitListener 콜백 수신', () => {
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } }
    const m = new TerminalManager()
    m.setMainWindow(win as never)
    const { id } = m.create({})
    const exitCb = vi.fn()
    m.addExitListener(exitCb)

    lastPty!.emitExit({ exitCode: 1, signal: undefined })

    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.TERMINAL_EXIT, { id, exitCode: 1, signal: null })
    expect(exitCb).toHaveBeenCalledTimes(1)
    expect(exitCb).toHaveBeenCalledWith({ id, exitCode: 1, signal: null })
  })

  it('exit listener 1개가 throw 해도 webContents.send 와 다른 listener 는 정상 (warn 로그에 sessionId 포함)', () => {
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } }
    const m = new TerminalManager()
    m.setMainWindow(win as never)
    const { id } = m.create({})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const throwing = vi.fn(() => { throw new Error('boom') })
    const ok = vi.fn()
    m.addExitListener(throwing)
    m.addExitListener(ok)

    lastPty!.emitExit({ exitCode: 0, signal: undefined })

    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.TERMINAL_EXIT, { id, exitCode: 0, signal: null })
    expect(ok).toHaveBeenCalledWith({ id, exitCode: 0, signal: null })
    expect(warnSpy).toHaveBeenCalledWith(
      '[TerminalManager] exit listener 실패',
      expect.objectContaining({ sessionId: id })
    )
    warnSpy.mockRestore()
  })

  it('signal 미제공 시 payload 가 null (undefined 아님)', () => {
    const m = new TerminalManager()
    const { id } = m.create({})
    const exitCb = vi.fn()
    m.addExitListener(exitCb)

    lastPty!.emitExit()

    expect(exitCb).toHaveBeenCalledWith({ id, exitCode: 0, signal: null })
  })

  it('kill(id) 후 exit → 통지 없음', () => {
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } }
    const m = new TerminalManager()
    m.setMainWindow(win as never)
    const { id } = m.create({})
    const exitCb = vi.fn()
    m.addExitListener(exitCb)

    m.kill(id)
    send.mockClear()
    lastPty!.emitExit({ exitCode: 0, signal: undefined })

    expect(exitCb).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalledWith(IPC_CHANNELS.TERMINAL_EXIT, expect.anything())
  })

  it('dispose() 후 각 세션 exit → 통지 없음', () => {
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } }
    const m = new TerminalManager()
    m.setMainWindow(win as never)
    m.create({})
    const p1 = lastPty!
    m.create({})
    const p2 = lastPty!
    const exitCb = vi.fn()
    m.addExitListener(exitCb)

    m.dispose()
    send.mockClear()
    p1.emitExit()
    p2.emitExit()

    expect(exitCb).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalledWith(IPC_CHANNELS.TERMINAL_EXIT, expect.anything())
  })

  it('같은 세션 emitExit 2회 → 통지 1회 (at-most-once)', () => {
    const m = new TerminalManager()
    m.create({})
    const exitCb = vi.fn()
    m.addExitListener(exitCb)

    lastPty!.emitExit({ exitCode: 0, signal: undefined })
    lastPty!.emitExit({ exitCode: 0, signal: undefined })

    expect(exitCb).toHaveBeenCalledTimes(1)
  })

  it('이미 종료된 id 에 kill() 재호출 → 억제 예약 누수 없음(새 세션 exit 이 정상 통지됨)', () => {
    const m = new TerminalManager()
    const { id } = m.create({})
    const firstPty = lastPty!

    m.kill(id)
    expect(firstPty.kill).toHaveBeenCalledTimes(1)
    m.kill(id) // 세션이 이미 사라졌으므로 재호출은 아무 것도 하지 않는다 (예약 재생성 없음)
    expect(firstPty.kill).toHaveBeenCalledTimes(1)

    const { id: id2 } = m.create({})
    const p2 = lastPty!
    const exitCb = vi.fn()
    m.addExitListener(exitCb)

    p2.emitExit({ exitCode: 2, signal: undefined })

    expect(exitCb).toHaveBeenCalledWith({ id: id2, exitCode: 2, signal: null })
  })
})

describe('TerminalManager.reorder (B-8)', () => {
  it('reorder 후 listSessions / exportSessions 순서 일치', () => {
    const m = new TerminalManager()
    const a = m.create({})
    const b = m.create({})
    const c = m.create({})

    m.reorder([c.id, a.id, b.id])

    expect(m.listSessions().map((s) => s.id)).toEqual([c.id, a.id, b.id])
    expect(m.exportSessions().map((s) => s.meta.id)).toEqual([c.id, a.id, b.id])
  })

  it('알 수 없는 id 만 요청하면 no-op + warn', () => {
    const m = new TerminalManager()
    const a = m.create({})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    m.reorder(['ghost-1', 'ghost-2'])

    expect(m.listSessions().map((s) => s.id)).toEqual([a.id])
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
