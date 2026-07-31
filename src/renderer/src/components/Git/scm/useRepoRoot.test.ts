import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useTerminalRepo } from './useRepoRoot'

const sessionCwd = vi.fn()
const repoRoot = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  sessionCwd.mockResolvedValue(null)
  repoRoot.mockResolvedValue('')
  ;(window as unknown as { api: unknown }).api = {
    terminal: { sessionCwd },
    git: { repoRoot }
  }
})

describe('useTerminalRepo', () => {
  it('세션이 없으면 아무것도 조회하지 않는다', async () => {
    const { result } = renderHook(() => useTerminalRepo({}))
    await waitFor(() => expect(result.current.resolving).toBe(false))
    expect(result.current.repoRoot).toBeNull()
    expect(sessionCwd).not.toHaveBeenCalled()
  })

  it('pid 실측 cwd 를 1순위로 쓴다 — 셸에서 cd 한 것은 이 경로로만 알 수 있다', async () => {
    sessionCwd.mockResolvedValue('/Users/me/Desktop/2NEON')
    repoRoot.mockResolvedValue('/Users/me/Desktop/2NEON\n')

    const { result } = renderHook(() =>
      useTerminalRepo({ sessionId: 'sess-1', cwd: '/Users/me' })
    )

    await waitFor(() => expect(result.current.repoRoot).toBe('/Users/me/Desktop/2NEON'))
    // 생성 시점 cwd(/Users/me)가 아니라 실측값으로 저장소를 찾아야 한다
    expect(repoRoot).toHaveBeenCalledWith('/Users/me/Desktop/2NEON')
    expect(result.current.cwd).toBe('/Users/me/Desktop/2NEON')
  })

  it('실측이 안 되면 OSC7/생성 시점 cwd 로 떨어진다 (Windows 등)', async () => {
    sessionCwd.mockResolvedValue(null)
    repoRoot.mockResolvedValue('/repo')

    const { result } = renderHook(() => useTerminalRepo({ sessionId: 'sess-1', cwd: '/repo/sub' }))

    await waitFor(() => expect(result.current.repoRoot).toBe('/repo'))
    expect(repoRoot).toHaveBeenCalledWith('/repo/sub')
  })

  it('실측이 throw 해도 폴백으로 계속 진행한다', async () => {
    sessionCwd.mockRejectedValue(new Error('probe 실패'))
    repoRoot.mockResolvedValue('/repo')

    const { result } = renderHook(() => useTerminalRepo({ sessionId: 'sess-1', cwd: '/repo' }))

    await waitFor(() => expect(result.current.repoRoot).toBe('/repo'))
  })

  it('git 저장소가 아니면 repoRoot 가 null 이고 cwd 는 남는다 — 안내 문구에 쓴다', async () => {
    sessionCwd.mockResolvedValue('/tmp/notrepo')
    repoRoot.mockRejectedValue(new Error('not a git repository'))

    const { result } = renderHook(() => useTerminalRepo({ sessionId: 'sess-1' }))

    await waitFor(() => expect(result.current.resolving).toBe(false))
    expect(result.current.repoRoot).toBeNull()
    expect(result.current.cwd).toBe('/tmp/notrepo')
  })

  it('refresh 는 cwd 를 다시 잰다 — 그 사이 cd 했을 수 있다', async () => {
    sessionCwd.mockResolvedValue('/a')
    repoRoot.mockResolvedValue('/a')
    const { result } = renderHook(() => useTerminalRepo({ sessionId: 'sess-1' }))
    await waitFor(() => expect(result.current.repoRoot).toBe('/a'))

    sessionCwd.mockResolvedValue('/b')
    repoRoot.mockResolvedValue('/b')
    act(() => result.current.refresh())

    await waitFor(() => expect(result.current.repoRoot).toBe('/b'))
    expect(sessionCwd).toHaveBeenCalledTimes(2)
  })

  it('세션이 바뀌면 새 세션으로 다시 조회한다', async () => {
    sessionCwd.mockResolvedValue('/a')
    repoRoot.mockResolvedValue('/a')
    const { result, rerender } = renderHook((props: { sessionId: string }) => useTerminalRepo(props), {
      initialProps: { sessionId: 'sess-1' }
    })
    await waitFor(() => expect(result.current.repoRoot).toBe('/a'))

    sessionCwd.mockResolvedValue('/b')
    repoRoot.mockResolvedValue('/b')
    rerender({ sessionId: 'sess-2' })

    await waitFor(() => expect(result.current.repoRoot).toBe('/b'))
    expect(sessionCwd).toHaveBeenLastCalledWith('sess-2')
  })
})
