// main/renderer 양쪽에서 import 되는 순수 유틸 — fs/path/os 등 main 전용 API 를 절대 쓰지 말 것.
// Buffer 는 main 전용으로 취급해 사용하지 않는다 (renderer 에는 폴리필 없이 존재하지 않을 수 있음) —
// TextEncoder 는 브라우저/Node 양쪽 전역이라 이걸로 UTF-8 바이트 수를 센다.

const encoder = new TextEncoder()

/** 문자열의 UTF-8 바이트 길이를 센다. */
export function utf8ByteLength(s: string): number {
  return encoder.encode(s).length
}

/**
 * 문자열을 UTF-8 바이트 기준 `maxBytes` 이하로 자른다 — 뒤쪽(최신 내용)을 보존하고 앞쪽(오래된 출력)을 버린다.
 * 문자 길이 ↔ 바이트 수의 준선형 관계를 이용한 secant 보간으로 최대 4번만 후보 길이를 probe 하고,
 * 잘린 지점은 다음 개행까지 되감아 ANSI 시퀀스나 멀티바이트 문자를 반토막 내지 않는다 (ADR-v2-terminal-p2-03 §9).
 */
export function trimSerializedToBytes(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return ''
  const totalBytes = utf8ByteLength(text)
  if (totalBytes <= maxBytes) return text

  // 불변식: low 는 "suffix(글자수=low) 의 바이트수 <= maxBytes" 를 만족하는 가장 큰 값 후보,
  // high 는 초과하는 값. low=0(빈 문자열) 은 항상 만족, high=text.length 는 항상 초과(위에서 확인).
  let low = 0
  let high = text.length
  let lowBytes = 0
  let highBytes = totalBytes

  let guess = Math.round((maxBytes / totalBytes) * text.length)

  for (let i = 0; i < 4 && high - low > 1; i++) {
    guess = Math.max(low + 1, Math.min(high - 1, guess))
    const bytes = utf8ByteLength(text.slice(text.length - guess))
    if (bytes <= maxBytes) {
      low = guess
      lowBytes = bytes
    } else {
      high = guess
      highBytes = bytes
    }
    const range = highBytes - lowBytes
    if (range === 0) break
    const t = (maxBytes - lowBytes) / range
    guess = Math.round(low + t * (high - low))
  }

  let result = text.slice(text.length - low)

  // 자른 지점 앞쪽 일부가 줄 중간일 수 있으므로, 다음 개행까지 되감아 그 조각을 버린다.
  const newlineIdx = result.indexOf('\n')
  if (newlineIdx >= 0 && newlineIdx < result.length - 1) {
    result = result.slice(newlineIdx + 1)
  }

  return result
}
