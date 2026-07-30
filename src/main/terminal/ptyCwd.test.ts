import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const execFileMock = vi.fn()
vi.mock('child_process', () => {
  const execFile = (...args: unknown[]): void => {
    ;(execFileMock as (...a: unknown[]) => void)(...args)
  }
  return { execFile, default: { execFile } }
})

const readlinkMock = vi.fn()
vi.mock('fs/promises', () => {
  const readlink = (...args: unknown[]): unknown => readlinkMock(...args)
  return { readlink, default: { readlink } }
})

import { probePtyCwd, __resetPtyCwdCacheForTest } from './ptyCwd'

describe('probePtyCwd', () => {
  beforeEach(() => {
    __resetPtyCwdCacheForTest()
    execFileMock.mockReset()
    readlinkMock.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('darwin — lsof 출력을 파싱해 cwd 를 돌려준다', async () => {
    execFileMock.mockImplementation((_cmd: string, _args: string[], cb: (e: Error | null, out: string) => void) => {
      cb(null, 'p1234\nn/Users/nhn/project\n')
    })
    const result = await probePtyCwd(1234, { platform: 'darwin' })
    expect(result).toBe('/Users/nhn/project')
    expect(execFileMock).toHaveBeenCalledWith('lsof', ['-a', '-d', 'cwd', '-p', '1234', '-Fn'], expect.any(Function))
  })

  it('linux — /proc/<pid>/cwd 를 읽는다', async () => {
    readlinkMock.mockResolvedValue('/home/user/project')
    const result = await probePtyCwd(5678, { platform: 'linux' })
    expect(result).toBe('/home/user/project')
    expect(readlinkMock).toHaveBeenCalledWith('/proc/5678/cwd')
  })

  it('win32 — 미지원, probe 자체를 호출하지 않고 항상 null', async () => {
    const result = await probePtyCwd(999, { platform: 'win32' })
    expect(result).toBeNull()
    expect(execFileMock).not.toHaveBeenCalled()
    expect(readlinkMock).not.toHaveBeenCalled()
  })

  it('darwin 실패 → null + warn 1회', async () => {
    execFileMock.mockImplementation((_cmd: string, _args: string[], cb: (e: Error | null, out: string) => void) => {
      cb(new Error('permission denied'), '')
    })
    const result = await probePtyCwd(1, { platform: 'darwin' })
    expect(result).toBeNull()
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it('linux 실패 → null + warn 1회', async () => {
    readlinkMock.mockRejectedValue(new Error('ENOENT'))
    const result = await probePtyCwd(2, { platform: 'linux' })
    expect(result).toBeNull()
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it('TTL 캐시 히트 — 만료 전 재조회는 probe 를 다시 부르지 않는다', async () => {
    let now = 1000
    execFileMock.mockImplementation((_cmd: string, _args: string[], cb: (e: null, out: string) => void) =>
      cb(null, 'n/cached\n')
    )
    const nowFn = (): number => now

    await probePtyCwd(1, { platform: 'darwin', now: nowFn })
    expect(execFileMock).toHaveBeenCalledTimes(1)

    now += 1000 // TTL(3000ms) 이내
    const cached = await probePtyCwd(1, { platform: 'darwin', now: nowFn })
    expect(cached).toBe('/cached')
    expect(execFileMock).toHaveBeenCalledTimes(1)

    now += 3000 // TTL 만료
    await probePtyCwd(1, { platform: 'darwin', now: nowFn })
    expect(execFileMock).toHaveBeenCalledTimes(2)
  })

  it('단일 비행 — 같은 pid 동시 요청은 probe 를 한 번만 호출한다', async () => {
    execFileMock.mockImplementation((_cmd: string, _args: string[], cb: (e: null, out: string) => void) =>
      cb(null, 'n/concurrent\n')
    )
    const [r1, r2] = await Promise.all([
      probePtyCwd(42, { platform: 'darwin' }),
      probePtyCwd(42, { platform: 'darwin' })
    ])
    expect(r1).toBe('/concurrent')
    expect(r2).toBe('/concurrent')
    expect(execFileMock).toHaveBeenCalledTimes(1)
  })
})
