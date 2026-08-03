import { describe, it, expect } from 'vitest'
import {
  FILE_FETCH_CONCURRENCY,
  createLimiter,
  isRetriableStatus,
  retryDelayMs
} from './rateLimit'

describe('isRetriableStatus', () => {
  it('429 와 5xx 만 다시 시도한다', () => {
    expect(isRetriableStatus(429)).toBe(true)
    expect(isRetriableStatus(500)).toBe(true)
    expect(isRetriableStatus(503)).toBe(true)
  })

  it('권한·없는 파일은 다시 시도해도 같다', () => {
    expect(isRetriableStatus(403)).toBe(false)
    expect(isRetriableStatus(404)).toBe(false)
    expect(isRetriableStatus(200)).toBe(false)
  })
})

describe('retryDelayMs', () => {
  it('짧게 시작해 점점 늘린다 — 재시도가 다시 몰리면 안 된다', () => {
    expect(retryDelayMs(1)).toBe(250)
    expect(retryDelayMs(2)).toBe(500)
    expect(retryDelayMs(3)).toBe(1000)
  })

  it('Retry-After 를 주면 서버 말을 따른다', () => {
    expect(retryDelayMs(1, '2')).toBe(2000)
    expect(retryDelayMs(1, ['3'])).toBe(3000)
  })

  it('Retry-After 가 터무니없이 길면 10초로 자른다 — 앱이 멈춘 것처럼 보이면 안 된다', () => {
    expect(retryDelayMs(1, '600')).toBe(10_000)
  })

  it('Retry-After 가 숫자가 아니면 무시하고 기본 대기를 쓴다', () => {
    expect(retryDelayMs(2, 'Wed, 21 Oct 2026 07:28:00 GMT')).toBe(500)
  })
})

describe('createLimiter', () => {
  /** 수동으로 끝낼 수 있는 작업 — 동시 실행 수를 눈으로 확인하기 위한 도구. */
  function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void
    const promise = new Promise<void>((r) => { resolve = r })
    return { promise, resolve }
  }

  it('동시에 도는 작업 수가 상한을 넘지 않는다', async () => {
    const run = createLimiter(2)
    const gates = [deferred(), deferred(), deferred()]
    let active = 0
    let peak = 0

    const tasks = gates.map((gate) =>
      run(async () => {
        active++
        peak = Math.max(peak, active)
        await gate.promise
        active--
      })
    )

    await Promise.resolve()
    expect(peak).toBe(2)

    gates.forEach((g) => g.resolve())
    await Promise.all(tasks)
    expect(peak).toBe(2)
  })

  it('앞 작업이 끝나면 줄 선 작업이 들어간다', async () => {
    const run = createLimiter(1)
    const order: string[] = []
    const first = deferred()

    const a = run(async () => { order.push('a-시작'); await first.promise; order.push('a-끝') })
    const b = run(async () => { order.push('b-시작') })

    await Promise.resolve()
    expect(order).toEqual(['a-시작'])

    first.resolve()
    await Promise.all([a, b])
    expect(order).toEqual(['a-시작', 'a-끝', 'b-시작'])
  })

  it('작업이 실패해도 자리를 돌려준다 — 한 번 터지고 줄이 막히면 안 된다', async () => {
    const run = createLimiter(1)
    await expect(run(async () => { throw new Error('실패') })).rejects.toThrow('실패')
    await expect(run(async () => '다음')).resolves.toBe('다음')
  })

  it('상한 안이면 그냥 통과시킨다', async () => {
    const run = createLimiter(FILE_FETCH_CONCURRENCY)
    expect(await run(async () => 42)).toBe(42)
  })
})
