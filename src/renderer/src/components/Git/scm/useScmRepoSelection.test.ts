import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useScmRepoSelection } from './useScmRepoSelection'

const get = vi.fn()
const set = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  get.mockResolvedValue(null)
  set.mockResolvedValue(undefined)
  ;(window as unknown as { api: unknown }).api = { settings: { get, set } }
})

describe('useScmRepoSelection', () => {
  it('기본은 터미널 자동 추종 — 고정이 없으면 넘겨받은 저장소를 그대로 쓴다', async () => {
    const { result } = renderHook(() => useScmRepoSelection('/repo-a'))
    await waitFor(() => expect(result.current.repo).toBe('/repo-a'))
    expect(result.current.pinned).toBeNull()
  })

  it('고정하면 터미널이 바뀌어도 그 저장소를 유지한다', async () => {
    const { result, rerender } = renderHook((auto: string | null) => useScmRepoSelection(auto), {
      initialProps: '/repo-a' as string | null
    })
    await waitFor(() => expect(result.current.repo).toBe('/repo-a'))

    act(() => result.current.pin('/repo-b'))
    rerender('/repo-c')

    expect(result.current.repo).toBe('/repo-b')
    expect(set).toHaveBeenCalledWith('terminalScmPinnedRepo', '/repo-b')
  })

  it('null 로 고정을 풀면 다시 터미널을 따라간다', async () => {
    const { result } = renderHook(() => useScmRepoSelection('/repo-a'))
    await waitFor(() => expect(result.current.repo).toBe('/repo-a'))

    act(() => result.current.pin('/repo-b'))
    expect(result.current.repo).toBe('/repo-b')

    act(() => result.current.pin(null))
    expect(result.current.repo).toBe('/repo-a')
    expect(set).toHaveBeenCalledWith('terminalScmPinnedRepo', null)
  })

  it('저장된 고정값을 복원한다', async () => {
    get.mockImplementation(async (key: string) => (key === 'terminalScmPinnedRepo' ? '/saved' : null))
    const { result } = renderHook(() => useScmRepoSelection('/repo-a'))
    await waitFor(() => expect(result.current.repo).toBe('/saved'))
  })

  it('본 저장소를 최근 목록 맨 앞에 쌓고 중복은 올린다', async () => {
    const { result, rerender } = renderHook((auto: string | null) => useScmRepoSelection(auto), {
      initialProps: '/a' as string | null
    })
    await waitFor(() => expect(result.current.recents).toEqual(['/a']))

    rerender('/b')
    await waitFor(() => expect(result.current.recents).toEqual(['/b', '/a']))

    rerender('/a')
    await waitFor(() => expect(result.current.recents).toEqual(['/a', '/b']))
  })

  it('뒤 슬래시 차이로 같은 저장소가 두 번 쌓이지 않는다', async () => {
    const { result, rerender } = renderHook((auto: string | null) => useScmRepoSelection(auto), {
      initialProps: '/a' as string | null
    })
    await waitFor(() => expect(result.current.recents).toEqual(['/a']))
    rerender('/a/')
    await waitFor(() => expect(result.current.recents).toEqual(['/a']))
  })

  it('최근 목록은 8개로 자른다', async () => {
    const { result, rerender } = renderHook((auto: string | null) => useScmRepoSelection(auto), {
      initialProps: '/r0' as string | null
    })
    await waitFor(() => expect(result.current.recents).toHaveLength(1))
    for (let i = 1; i < 12; i += 1) {
      rerender(`/r${i}`)
      await waitFor(() => expect(result.current.recents[0]).toBe(`/r${i}`))
    }
    expect(result.current.recents).toHaveLength(8)
  })

  it('저장소가 없으면 최근 목록을 건드리지 않는다', async () => {
    const { result } = renderHook(() => useScmRepoSelection(null))
    await waitFor(() => expect(result.current.repo).toBeNull())
    expect(set).not.toHaveBeenCalledWith('terminalScmRecentRepos', expect.anything())
  })

  it('저장된 최근 목록에서 문자열이 아닌 값은 버린다', async () => {
    get.mockImplementation(async (key: string) =>
      key === 'terminalScmRecentRepos' ? ['/a', 42, null, '/b'] : null
    )
    const { result } = renderHook(() => useScmRepoSelection(null))
    await waitFor(() => expect(result.current.recents).toEqual(['/a', '/b']))
  })
})
