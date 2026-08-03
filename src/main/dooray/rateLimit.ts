/**
 * 두레이 파일 API 의 rate limiter 를 견디기 위한 장치.
 *
 * 두레이는 토큰 버킷을 쓴다 — 응답 헤더에 그대로 나온다:
 *   x-ratelimit-burst-capacity: 20   (순간 최대 20개)
 *   x-ratelimit-replenish-rate: 5    (초당 5개 충전)
 *
 * 업무 상세를 열면 본문·댓글의 이미지가 **한꺼번에** 요청된다. 열 장이면 스무 개가 한 번에
 * 나가 버킷을 비우고, 넘친 것부터 429 로 떨어진다. "어떤 이미지는 보이고 어떤 건 안 보이는"
 * 증상의 정체가 이것이다 — 경로도 권한도 멀쩡한데 순서상 뒤에 선 요청만 실패한다.
 *
 * 그래서 (1) 동시 요청 수를 묶고 (2) 429 는 실패가 아니라 "잠깐 기다렸다 다시" 로 다룬다.
 */

/** 동시에 날릴 파일 요청 수. 충전 속도(5/s)보다 낮게 잡아 버킷이 마르지 않게 한다. */
export const FILE_FETCH_CONCURRENCY = 3

/** 재시도 횟수 — 이 이상은 사용자를 기다리게만 한다. */
export const FILE_FETCH_MAX_RETRIES = 3

/** 재시도해도 의미가 있는 응답인가. 429(넘침)와 5xx(일시 장애)만 해당한다. */
export function isRetriableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600)
}

/**
 * 재시도 대기 시간. 버킷이 초당 5개씩 차므로 200ms 면 한 칸이 찬다 —
 * 첫 재시도를 짧게 잡아 사람이 못 느끼게 하고, 반복될수록 늘려 같이 몰리지 않게 한다.
 *
 * `Retry-After` 헤더가 오면 그 값을 우선한다(초 단위). 두레이는 지금 이 헤더를 주지 않지만,
 * 주기 시작하면 서버 말을 따르는 게 맞다.
 */
export function retryDelayMs(attempt: number, retryAfterHeader?: string | string[]): number {
  const header = Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : retryAfterHeader
  if (header) {
    const seconds = Number(header)
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 10_000)
  }
  // 250ms → 500ms → 1000ms
  return 250 * 2 ** Math.max(0, attempt - 1)
}

/**
 * 동시 실행 개수를 묶는다. 넘치는 작업은 순서대로 줄을 서고, 앞이 끝나면 하나씩 들어간다.
 *
 * 작업이 던져도 자리는 반드시 돌려준다 — 안 그러면 실패 한 번에 줄이 영영 막힌다.
 */
export function createLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0
  const waiting: Array<() => void> = []

  const release = (): void => {
    active--
    waiting.shift()?.()
  }

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve))
    active++
    try {
      return await task()
    } finally {
      release()
    }
  }
}
