import { describe, it, expect, vi, beforeEach } from 'vitest'

type Listener = (event: string, path: string) => void
type ErrorListener = (error: unknown) => void
let watchInstances: Array<{
  closeCalled: boolean
  emit: (event: string, path: string) => void
  emitError: (error: unknown) => void
  pathsWatched: unknown
}> = []

vi.mock('chokidar', () => ({
  default: {
    watch: (paths: unknown) => {
      const handlers: Listener[] = []
      const errorHandlers: ErrorListener[] = []
      const inst = {
        closeCalled: false,
        pathsWatched: paths,
        on: (event: string, cb: Listener | ErrorListener) => {
          if (event === 'all') handlers.push(cb as Listener)
          else if (event === 'error') errorHandlers.push(cb as ErrorListener)
        },
        close: () => { inst.closeCalled = true },
        emit: (event: string, path: string) => handlers.forEach((h) => h(event, path)),
        emitError: (error: unknown) => errorHandlers.forEach((h) => h(error))
      }
      watchInstances.push(inst)
      return inst
    }
  }
}))

const { mkdirSyncMock } = vi.hoisted(() => ({ mkdirSyncMock: vi.fn() }))
vi.mock('fs', () => ({
  mkdirSync: mkdirSyncMock,
  default: { mkdirSync: mkdirSyncMock }
}))

import { ConfigWatcher } from './ConfigWatcher'

beforeEach(() => {
  watchInstances = []
  mkdirSyncMock.mockReset()
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

  it('start 는 watch 전에 skills/commands 디렉토리를 선생성한다 (신규 사용자 감지 결함 수복, ADR-v2-windows-fix-05 §4)', () => {
    const w = new ConfigWatcher()
    w.start()
    const createdPaths = mkdirSyncMock.mock.calls.map((c) => String(c[0]).replace(/\\/g, '/'))
    expect(createdPaths.some((p) => p.endsWith('.claude/skills'))).toBe(true)
    expect(createdPaths.some((p) => p.endsWith('.claude/commands'))).toBe(true)
    // settings.json 은 파일이므로 선생성하지 않는다 — 남의 설정 파일을 우리가 만들면 안 된다.
    expect(createdPaths.some((p) => p.endsWith('settings.json'))).toBe(false)
    for (const call of mkdirSyncMock.mock.calls) {
      expect(call[1]).toEqual({ recursive: true })
    }
  })

  it('mkdirSync 실패해도 warn 만 하고 watch 는 계속 진행된다', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mkdirSyncMock.mockImplementationOnce(() => { throw new Error('EACCES') })
    const w = new ConfigWatcher()
    expect(() => w.start()).not.toThrow()
    expect(watchInstances).toHaveLength(1)
    expect(warnSpy).toHaveBeenCalledWith('[ConfigWatcher] 디렉토리 생성 실패', expect.objectContaining({ dir: expect.any(String) }))
    warnSpy.mockRestore()
  })

  it('watcher error 이벤트를 구독해 warn 로그를 남긴다', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const w = new ConfigWatcher()
    w.start()
    watchInstances[0].emitError(new Error('permission denied'))
    expect(warnSpy).toHaveBeenCalledWith('[ConfigWatcher] watch 오류', expect.any(Error))
    warnSpy.mockRestore()
  })
})
