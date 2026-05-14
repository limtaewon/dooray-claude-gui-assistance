import { describe, it, expect, vi, beforeEach } from 'vitest'

// keytar 모킹 — 인메모리 저장소
const keychain: Record<string, Record<string, string | null>> = {}
vi.mock('keytar', () => ({
  default: {
    setPassword: vi.fn(async (service: string, account: string, password: string) => {
      keychain[service] = keychain[service] || {}
      keychain[service][account] = password
    }),
    getPassword: vi.fn(async (service: string, account: string) =>
      (keychain[service]?.[account]) ?? null
    ),
    deletePassword: vi.fn(async (service: string, account: string) => {
      if (keychain[service]) delete keychain[service][account]
    })
  }
}))

/**
 * electron.net.request 가짜 구현 — 테스트가 응답을 큐로 주입.
 * 각 request 호출은 큐의 다음 응답을 소비.
 */
type FakeResponse = {
  statusCode: number
  body: string
  headers?: Record<string, string>
  /** redirect 만 발생 시키고 종료 */
  redirect?: string
}
const responseQueue: FakeResponse[] = []
const requestLog: Array<{ method: string; url: string; headers: Record<string, string>; body?: string }> = []

vi.mock('electron', () => ({
  net: {
    request: (opts: { method: string; url: string }) => {
      const handlers: Record<string, ((arg?: unknown) => void)[]> = {}
      const headers: Record<string, string> = {}
      let bodyBuffer: Buffer | null = null
      return {
        setHeader: (k: string, v: string) => { headers[k] = v },
        write: (data: Buffer | string) => {
          bodyBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
        },
        end: () => {
          requestLog.push({
            method: opts.method,
            url: opts.url,
            headers,
            body: bodyBuffer ? bodyBuffer.toString('utf8') : undefined
          })
          // 응답 큐에서 꺼냄
          const r = responseQueue.shift()
          if (!r) {
            queueMicrotask(() => {
              ;(handlers['error'] || []).forEach((cb) => cb(new Error('no response queued')))
            })
            return
          }
          if (r.redirect) {
            queueMicrotask(() => {
              ;(handlers['redirect'] || []).forEach((cb) =>
                (cb as (s: number, m: string, u: string) => void)(307, opts.method, r.redirect!)
              )
            })
            return
          }
          queueMicrotask(() => {
            const responseEvents: Record<string, ((arg?: unknown) => void)[]> = {}
            const fakeResponse = {
              statusCode: r.statusCode,
              headers: r.headers || {},
              on: (event: string, cb: (arg?: unknown) => void) => {
                responseEvents[event] = responseEvents[event] || []
                responseEvents[event].push(cb)
              }
            }
            ;(handlers['response'] || []).forEach((cb) => cb(fakeResponse))
            // data + end
            queueMicrotask(() => {
              ;(responseEvents['data'] || []).forEach((cb) => cb(Buffer.from(r.body, 'utf8')))
              ;(responseEvents['end'] || []).forEach((cb) => cb())
            })
          })
        },
        abort: () => {},
        on: (event: string, cb: (arg?: unknown) => void) => {
          handlers[event] = handlers[event] || []
          handlers[event].push(cb)
        }
      }
    }
  }
}))

import { DoorayClient } from './DoorayClient'

beforeEach(() => {
  for (const s of Object.keys(keychain)) delete keychain[s]
  responseQueue.length = 0
  requestLog.length = 0
})

function queueOk<T>(body: T, status = 200): void {
  responseQueue.push({ statusCode: status, body: JSON.stringify(body) })
}

describe('DoorayClient — 토큰 보관소 (keytar)', () => {
  it('setToken 후 getToken 으로 조회', async () => {
    const c = new DoorayClient()
    await c.setToken('TOKEN-XYZ')
    expect(await c.getToken()).toBe('TOKEN-XYZ')
  })

  it('deleteToken 후 null', async () => {
    const c = new DoorayClient()
    await c.setToken('T')
    await c.deleteToken()
    expect(await c.getToken()).toBeNull()
  })

  it('인메모리 캐시 → keytar 미호출', async () => {
    const c = new DoorayClient()
    await c.setToken('T')
    const keytar = (await import('keytar')).default
    const before = (keytar.getPassword as ReturnType<typeof vi.fn>).mock.calls.length
    await c.getToken()
    await c.getToken()
    expect((keytar.getPassword as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before)
  })

  it('setToken 실패 시 throw', async () => {
    const keytar = (await import('keytar')).default
    ;(keytar.setPassword as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('keychain locked'))
    const c = new DoorayClient()
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(c.setToken('T')).rejects.toThrow(/keychain/)
    errSpy.mockRestore()
  })
})

describe('DoorayClient.request', () => {
  it('토큰 없으면 throw', async () => {
    const c = new DoorayClient()
    await expect(c.request('/x')).rejects.toThrow(/토큰/)
  })

  it('성공 응답을 JSON 으로 파싱', async () => {
    const c = new DoorayClient()
    await c.setToken('T')
    queueOk({ header: { isSuccessful: true }, result: { id: '1' } })
    const r = await c.request<{ result: { id: string } }>('/path')
    expect(r.result.id).toBe('1')
    expect(requestLog[0].headers['Authorization']).toBe('dooray-api T')
    expect(requestLog[0].method).toBe('GET')
  })

  it('POST + body 전달', async () => {
    const c = new DoorayClient()
    await c.setToken('T')
    queueOk({ header: { isSuccessful: true }, result: {} })
    await c.request('/p', { method: 'POST', body: '{"a":1}' })
    expect(requestLog[0].method).toBe('POST')
    expect(requestLog[0].body).toBe('{"a":1}')
  })

  it('HTTP 4xx → 에러 메시지 추출', async () => {
    const c = new DoorayClient()
    await c.setToken('T')
    responseQueue.push({
      statusCode: 403,
      body: JSON.stringify({ header: { resultMessage: '권한 없음' } })
    })
    await expect(c.request('/forbidden')).rejects.toThrow(/권한 없음/)
  })

  it('5xx 도 오류', async () => {
    const c = new DoorayClient()
    await c.setToken('T')
    responseQueue.push({ statusCode: 500, body: 'oops' })
    await expect(c.request('/x')).rejects.toThrow(/오류 \(500\)/)
  })

  it('429 발생 시 retry 후 성공', async () => {
    const c = new DoorayClient()
    await c.setToken('T')
    responseQueue.push({
      statusCode: 429,
      body: JSON.stringify({ header: { resultMessage: 'rate limit' } })
    })
    queueOk({ result: 'OK' })
    // setTimeout 가속을 위해 fake timers — 그러나 큐 처리는 microtask 기반이라 그대로 두고 짧은 backoff 만 진행
    const p = c.request<{ result: string }>('/x')
    // backoff 는 1초 — 실제 wait 발생
    const r = await p
    expect(r.result).toBe('OK')
  }, 5000)

  it('429 retry 횟수 초과 시 throw', async () => {
    const c = new DoorayClient()
    await c.setToken('T')
    for (let i = 0; i < 5; i++) {
      responseQueue.push({ statusCode: 429, body: JSON.stringify({ header: { resultMessage: 'rate' } }) })
    }
    await expect(c.request('/x', { retryOn429: 0 })).rejects.toThrow(/\(429\)/)
  })

  it('비-JSON 응답은 파싱 오류로 throw', async () => {
    const c = new DoorayClient()
    await c.setToken('T')
    responseQueue.push({ statusCode: 200, body: '<html>not json</html>' })
    await expect(c.request('/x')).rejects.toThrow(/파싱 오류/)
  })
})

describe('DoorayClient.validateToken', () => {
  it('성공 시 valid=true + name', async () => {
    const c = new DoorayClient()
    await c.setToken('T')
    queueOk({ header: { isSuccessful: true }, result: { name: '홍길동' } })
    const r = await c.validateToken()
    expect(r).toEqual({ valid: true, name: '홍길동' })
  })

  it('실패 시 valid=false + error', async () => {
    const c = new DoorayClient()
    await c.setToken('T')
    responseQueue.push({ statusCode: 401, body: '{"header":{"resultMessage":"unauthorized"}}' })
    const r = await c.validateToken()
    expect(r.valid).toBe(false)
    expect(r.error).toBeTruthy()
  })
})

describe('DoorayClient.fetchBinary', () => {
  it('잘못된 path 면 throw', async () => {
    const c = new DoorayClient()
    await c.setToken('T')
    await expect(c.fetchBinary('' as never)).rejects.toThrow(/잘못된/)
  })

  it('토큰 없으면 throw', async () => {
    const c = new DoorayClient()
    await expect(c.fetchBinary('/files/1')).rejects.toThrow(/토큰/)
  })

  it('http 로 시작하는 URL 은 그대로', async () => {
    const c = new DoorayClient()
    await c.setToken('T')
    responseQueue.push({
      statusCode: 200,
      body: 'PNG_BINARY',
      headers: { 'content-type': 'image/png' }
    })
    const dataUrl = await c.fetchBinary('https://x/file.png')
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('/files/{id} 경로 → 후보 URL 순회', async () => {
    const c = new DoorayClient()
    await c.setToken('T')
    // 첫 후보는 404, 두 번째 성공
    responseQueue.push({ statusCode: 404, body: 'nope' })
    responseQueue.push({
      statusCode: 200,
      body: 'IMG',
      headers: { 'content-type': 'image/jpeg' }
    })
    const dataUrl = await c.fetchBinary('/files/123', { projectId: 'p1', postId: 'po1' })
    expect(dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
  })

  it('mime 이 json/html 이면 파일이 아닌 응답 에러', async () => {
    const c = new DoorayClient()
    await c.setToken('T')
    responseQueue.push({
      statusCode: 200,
      body: '{"x":1}',
      headers: { 'content-type': 'application/json' }
    })
    await expect(c.fetchBinary('https://x/f')).rejects.toThrow(/파일이 아닌/)
  })
})
