import { describe, it, expect, vi, beforeEach } from 'vitest'

const keytarStore = new Map<string, string>()

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(async (service: string, account: string) => keytarStore.get(`${service}:${account}`) ?? null),
    setPassword: vi.fn(async (service: string, account: string, password: string) => {
      keytarStore.set(`${service}:${account}`, password)
    }),
    deletePassword: vi.fn(async (service: string, account: string) => {
      keytarStore.delete(`${service}:${account}`)
    })
  }
}))

vi.mock('electron', () => ({ net: { request: vi.fn() } }))

const { GitHubService } = await import('./GitHubService')

const USER = { login: 'taewon', name: '임태원', avatar_url: 'https://a', html_url: 'https://github.com/taewon' }

function service(response: { status: number; body: unknown } | Error) {
  const fetchJson = vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  })
  return { svc: new GitHubService({ fetchJson }), fetchJson }
}

beforeEach(() => {
  keytarStore.clear()
  vi.clearAllMocks()
})

describe('GitHubService.connect', () => {
  it('유효한 토큰이면 계정을 돌려주고 키체인에 저장한다', async () => {
    const { svc } = service({ status: 200, body: USER })

    const status = await svc.connect('ghp_abc')

    expect(status).toEqual({
      connected: true,
      account: {
        login: 'taewon',
        name: '임태원',
        avatarUrl: 'https://a',
        profileUrl: 'https://github.com/taewon'
      }
    })
    expect(await svc.getToken()).toBe('ghp_abc')
  })

  it('401 이면 저장하지 않는다 — 잘못된 값을 눌러 담지 않는다', async () => {
    const { svc } = service({ status: 401, body: {} })

    const status = await svc.connect('ghp_bad')

    expect(status.connected).toBe(false)
    expect(status.error).toContain('401')
    expect(await svc.getToken()).toBeNull()
  })

  it('403 은 권한 문제라고 알린다', async () => {
    const { svc } = service({ status: 403, body: {} })
    expect((await svc.connect('t')).error).toContain('403')
  })

  it('네트워크 실패도 이유를 준다', async () => {
    const { svc } = service(new Error('getaddrinfo ENOTFOUND'))
    expect((await svc.connect('t')).error).toContain('ENOTFOUND')
  })

  it('빈 토큰은 요청조차 하지 않는다', async () => {
    const { svc, fetchJson } = service({ status: 200, body: USER })
    expect((await svc.connect('   ')).connected).toBe(false)
    expect(fetchJson).not.toHaveBeenCalled()
  })
})

describe('GitHubService.status', () => {
  it('토큰이 없으면 연결 안 됨', async () => {
    const { svc } = service({ status: 200, body: USER })
    expect(await svc.status()).toEqual({ connected: false })
  })

  it('두 번째부터는 캐시를 쓴다 — 화면을 열 때마다 GitHub 을 때리지 않는다', async () => {
    const { svc, fetchJson } = service({ status: 200, body: USER })
    await svc.connect('t')

    await svc.status()
    await svc.status()

    expect(fetchJson).toHaveBeenCalledTimes(1)
  })

  it('refresh 면 다시 물어본다', async () => {
    const { svc, fetchJson } = service({ status: 200, body: USER })
    await svc.connect('t')

    await svc.status(true)

    expect(fetchJson).toHaveBeenCalledTimes(2)
  })

  it('저장된 토큰이 거절당하면 그 사실을 알린다 — 조용히 지우지 않는다', async () => {
    keytarStore.set('clauday:github-token', 'expired')
    const { svc } = service({ status: 401, body: {} })

    const status = await svc.status()

    expect(status).toMatchObject({ connected: false, hasStoredToken: true })
    expect(await svc.getToken()).toBe('expired')
  })
})

describe('GitHubService.disconnect', () => {
  it('키체인에서 지운다', async () => {
    const { svc } = service({ status: 200, body: USER })
    await svc.connect('t')

    await svc.disconnect()

    expect(await svc.getToken()).toBeNull()
    expect(await svc.status()).toEqual({ connected: false })
  })
})
