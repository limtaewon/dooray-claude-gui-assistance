import { describe, it, expect, vi, beforeEach } from 'vitest'

type Handler = (data: string) => void
let lastPty: {
  write: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  emitData: (data: string) => void
  emitExit: () => void
  pid: number
} | null = null

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => {
    let onDataCb: Handler | null = null
    let onExitCb: (() => void) | null = null
    const pty = {
      pid: Math.floor(Math.random() * 10000),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: (cb: Handler) => { onDataCb = cb },
      onExit: (cb: () => void) => { onExitCb = cb },
      emitData: (data: string) => onDataCb?.(data),
      emitExit: () => onExitCb?.()
    }
    lastPty = pty
    return pty
  })
}))

import { TerminalManager } from './TerminalManager'

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

  it('addOutputListener 등록/해제', () => {
    // listener 는 TerminalManager 내부에서 호출되진 않지만 등록 인터페이스 검증
    const m = new TerminalManager()
    const cb = vi.fn()
    const off = m.addOutputListener(cb)
    off()
    expect(typeof off).toBe('function')
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
