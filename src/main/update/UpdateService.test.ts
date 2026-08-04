import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { GithubRelease, UpdateStage } from '../../shared/types/update'

vi.mock('electron', () => ({
  app: { getVersion: () => '2.0.4', getPath: () => '/tmp/clauday-update-test' },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn() },
  BrowserWindow: class {}
}))

import { UpdateService } from './UpdateService'

/** 릴리즈 목록 응답 하나 — check() 가 읽는 최소 형태만 채운다. */
function releasesResponse(tag: string): { ok: true; json: () => Promise<GithubRelease[]> } {
  const release: GithubRelease = {
    tag_name: tag,
    html_url: `https://github.com/x/y/releases/tag/${tag}`,
    prerelease: false,
    draft: false,
    assets: []
  }
  return { ok: true, json: async () => [release] }
}

/**
 * stage 를 직접 세운 서비스를 만든다.
 *
 * `startPeriodicCheck` 가 건너뛰는 조건을 확인하려면 downloading/error 같은 중간 상태가
 * 필요한데, 정상 경로로 그 상태를 만들려면 다운로드 전체를 흉내내야 한다.
 */
function serviceAtStage(stage: UpdateStage): UpdateService {
  const service = new UpdateService(() => null)
  ;(service as unknown as { state: { stage: UpdateStage } }).state.stage = stage
  return service
}

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  fetchSpy = vi.fn(async () => releasesResponse('v2.0.5'))
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('UpdateService.startPeriodicCheck', () => {
  it('간격이 지나면 다시 확인한다 — 시작 때 한 번만 보면 켜둔 세션은 새 릴리즈를 영영 모른다', async () => {
    const service = new UpdateService(() => null)
    service.startPeriodicCheck(1000)

    expect(fetchSpy).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(service.getState().stage).toBe('available')
    expect(service.getState().latestVersion).toBe('2.0.5')

    service.stopPeriodicCheck()
  })

  it('여러 주기가 지나면 그만큼 확인한다', async () => {
    const service = serviceAtStage('idle')
    // 매번 같은 버전이면 up-to-date 로 남아 계속 재확인 대상이다.
    fetchSpy.mockImplementation(async () => releasesResponse('v2.0.4'))
    service.startPeriodicCheck(1000)

    await vi.advanceTimersByTimeAsync(3000)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(service.getState().stage).toBe('up-to-date')

    service.stopPeriodicCheck()
  })

  it('두 번 걸어도 타이머는 하나다 — 중복 호출이 조회를 두 배로 만들면 안 된다', async () => {
    const service = new UpdateService(() => null)
    service.startPeriodicCheck(1000)
    service.startPeriodicCheck(1000)

    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    service.stopPeriodicCheck()
  })

  it('멈추면 더 이상 확인하지 않는다', async () => {
    const service = new UpdateService(() => null)
    service.startPeriodicCheck(1000)
    service.stopPeriodicCheck()

    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('멈춘 뒤 다시 걸 수 있다 — before-quit 정리가 재시작을 막으면 안 된다', async () => {
    const service = new UpdateService(() => null)
    service.startPeriodicCheck(1000)
    service.stopPeriodicCheck()
    service.startPeriodicCheck(1000)

    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    service.stopPeriodicCheck()
  })

  // 진행 중인 상태를 확인이 덮으면 받는 중 표시나 「다시 시도」 버튼이 사라진다.
  it.each<UpdateStage>(['checking', 'downloading', 'downloaded', 'error', 'available'])(
    '%s 상태에서는 건너뛴다',
    async (stage) => {
      const service = serviceAtStage(stage)
      service.startPeriodicCheck(1000)

      await vi.advanceTimersByTimeAsync(3000)
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(service.getState().stage).toBe(stage)

      service.stopPeriodicCheck()
    }
  )

  it.each<UpdateStage>(['idle', 'up-to-date'])('%s 상태에서는 다시 확인한다', async (stage) => {
    const service = serviceAtStage(stage)
    service.startPeriodicCheck(1000)

    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    service.stopPeriodicCheck()
  })

  it('조회가 실패해도 타이머가 죽지 않는다 — 사내망 차단 한 번에 재확인이 끊기면 안 된다', async () => {
    const service = new UpdateService(() => null)
    fetchSpy.mockRejectedValueOnce(new Error('network down'))
    service.startPeriodicCheck(1000)

    await vi.advanceTimersByTimeAsync(1000)
    expect(service.getState().stage).toBe('idle')

    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(service.getState().stage).toBe('available')

    service.stopPeriodicCheck()
  })
})
