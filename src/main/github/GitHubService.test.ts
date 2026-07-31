import { describe, it, expect, vi } from 'vitest'
import { GitHubService, type GhRunResult } from './GitHubService'

const LOGGED_IN = `github.com
  ✓ Logged in to github.com account taewon (keyring)
  - Active account: true
  - Token scopes: 'gist', 'read:org', 'repo'`

function service(responses: Record<string, GhRunResult>) {
  const runGh = vi.fn(async (args: string[]) => {
    const key = args.join(' ')
    return responses[key] ?? { ok: false, output: '' }
  })
  return { svc: new GitHubService({ runGh }), runGh }
}

describe('GitHubService.status', () => {
  it('gh 가 없으면 설치 안 됨 — 오류가 아니라 상태다', async () => {
    const { svc, runGh } = service({})

    expect(await svc.status()).toEqual({ state: 'not-installed', accounts: [] })
    // 설치가 안 됐으면 auth 는 물어볼 필요도 없다
    expect(runGh).toHaveBeenCalledTimes(1)
  })

  it('설치됐지만 로그인 전이면 not-authenticated', async () => {
    const { svc } = service({
      '--version': { ok: true, output: 'gh version 2.62.0' },
      'auth status': { ok: false, output: 'You are not logged into any GitHub hosts.' }
    })

    expect(await svc.status()).toMatchObject({ state: 'not-authenticated', accounts: [] })
  })

  it('로그인돼 있으면 계정과 스코프를 준다', async () => {
    const { svc } = service({
      '--version': { ok: true, output: 'gh version 2.62.0 (2026-01-01)' },
      'auth status': { ok: true, output: LOGGED_IN }
    })

    const status = await svc.status()

    expect(status.state).toBe('connected')
    expect(status.accounts[0]).toMatchObject({ host: 'github.com', login: 'taewon', active: true })
    expect(status.version).toBe('gh version 2.62.0 (2026-01-01)')
  })

  it('gh 가 0이 아닌 코드로 끝나도 계정이 보이면 연결로 본다 — 호스트 하나가 실패해도 전체를 죽이지 않는다', async () => {
    const { svc } = service({
      '--version': { ok: true, output: 'gh version 2.62.0' },
      'auth status': { ok: false, output: LOGGED_IN }
    })

    expect((await svc.status()).state).toBe('connected')
  })

  it('두 번째부터는 캐시 — 화면을 열 때마다 프로세스를 띄우지 않는다', async () => {
    const { svc, runGh } = service({
      '--version': { ok: true, output: 'gh version 2' },
      'auth status': { ok: true, output: LOGGED_IN }
    })

    await svc.status()
    await svc.status()

    expect(runGh).toHaveBeenCalledTimes(2)
  })

  it('refresh 면 다시 확인한다', async () => {
    const { svc, runGh } = service({
      '--version': { ok: true, output: 'gh version 2' },
      'auth status': { ok: true, output: LOGGED_IN }
    })

    await svc.status()
    await svc.status(true)

    expect(runGh).toHaveBeenCalledTimes(4)
  })
})
