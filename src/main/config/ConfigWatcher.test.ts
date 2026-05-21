import { describe, it, expect, vi, beforeEach } from 'vitest'

type Listener = (event: string, path: string) => void
let watchInstances: Array<{ closeCalled: boolean; emit: (event: string, path: string) => void; pathsWatched: unknown }> = []

vi.mock('chokidar', () => ({
  default: {
    watch: (paths: unknown) => {
      const handlers: Listener[] = []
      const inst = {
        closeCalled: false,
        pathsWatched: paths,
        on: (event: string, cb: Listener) => {
          if (event === 'all') handlers.push(cb)
        },
        close: () => { inst.closeCalled = true },
        emit: (event: string, path: string) => handlers.forEach((h) => h(event, path))
      }
      watchInstances.push(inst)
      return inst
    }
  }
}))

import { ConfigWatcher } from './ConfigWatcher'

beforeEach(() => {
  watchInstances = []
})

describe('ConfigWatcher', () => {
  it('start 시 ~/.claude 의 settings/commands/skills 감시', () => {
    const w = new ConfigWatcher()
    w.start()
    expect(watchInstances).toHaveLength(1)
    // Windows 호환 — 경로 구분자(\, /) 차이로 endsWith 매칭 깨지는 문제 회피.
    const paths = (watchInstances[0].pathsWatched as string[]).map((p) => p.replace(/\\/g, '/'))
    expect(paths.some((p) => p.endsWith('.claude/settings.json'))).toBe(true)
    expect(paths.some((p) => p.endsWith('commands'))).toBe(true)
    expect(paths.some((p) => p.endsWith('skills'))).toBe(true)
  })

  it('파일 변경 시 IPC 전송', () => {
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } }
    const w = new ConfigWatcher()
    w.setMainWindow(win as never)
    w.start()
    watchInstances[0].emit('change', '/path/to/skills/foo')
    expect(send).toHaveBeenCalled()
    const [channel, payload] = send.mock.calls[0]
    expect(channel).toBeTruthy()
    expect(payload).toEqual({ event: 'change', path: '/path/to/skills/foo' })
  })

  it('mainWindow destroyed 면 IPC skip', () => {
    const send = vi.fn()
    const win = { isDestroyed: () => true, webContents: { send } }
    const w = new ConfigWatcher()
    w.setMainWindow(win as never)
    w.start()
    watchInstances[0].emit('change', '/x')
    expect(send).not.toHaveBeenCalled()
  })

  it('mainWindow 미설정이면 안전 no-op', () => {
    const w = new ConfigWatcher()
    w.start()
    expect(() => watchInstances[0].emit('change', '/x')).not.toThrow()
  })

  it('stop 시 chokidar close', () => {
    const w = new ConfigWatcher()
    w.start()
    w.stop()
    expect(watchInstances[0].closeCalled).toBe(true)
  })

  it('stop 중복 호출 안전', () => {
    const w = new ConfigWatcher()
    w.start()
    w.stop()
    expect(() => w.stop()).not.toThrow()
  })
})
