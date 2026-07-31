// main/renderer 양쪽에서 import 되는 순수 유틸 — fs/path/os 등 main 전용 API 를 절대 쓰지 말 것 (근거: ADR-v2-utils PRD R5).

const CONTROL_CHARS_RE = /[\x00-\x1f]/g
const FORBIDDEN_CHARS_RE = /[<>:"/\\|?*]/g
const DOT_RUN_RE = /\.{2,}/g
const TRAILING_DOT_SPACE_RE = /[.\s]+$/g
const RESERVED_NAME_RE = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.[^.]*)?$/i

const DEFAULT_MAX_LENGTH = 200
const DEFAULT_FALLBACK = 'skill'

/**
 * 스킬 파일명을 Windows/POSIX 양쪽에서 안전한 형태로 정제한다.
 * 금지문자·제어문자 제거, `..` traversal 무력화, Windows 예약어 회피, 후행 점/공백 제거를 거친다. 멱등.
 */
export function sanitizeSkillFilename(name: string, opts?: { fallback?: string; maxLength?: number }): string {
  const fallback = opts?.fallback ?? DEFAULT_FALLBACK
  const maxLength = opts?.maxLength ?? DEFAULT_MAX_LENGTH

  let result = (name ?? '')
    .replace(CONTROL_CHARS_RE, '')
    .replace(FORBIDDEN_CHARS_RE, '_')
    .replace(DOT_RUN_RE, '_')
    .trim()
    .replace(TRAILING_DOT_SPACE_RE, '')

  if (result.length === 0) return fallback

  if (RESERVED_NAME_RE.test(result)) {
    const dotIdx = result.indexOf('.')
    result = dotIdx === -1 ? `${result}_` : `${result.slice(0, dotIdx)}_${result.slice(dotIdx)}`
  }

  if (result.length > maxLength) {
    const dotIdx = result.lastIndexOf('.')
    const hasExt = dotIdx > 0 && result.length - dotIdx <= 20
    if (hasExt) {
      const ext = result.slice(dotIdx)
      const base = result.slice(0, dotIdx)
      const keep = Math.max(1, maxLength - ext.length)
      result = base.slice(0, keep) + ext
    } else {
      result = result.slice(0, maxLength)
    }
    result = result.replace(TRAILING_DOT_SPACE_RE, '')
  }

  return result.length === 0 ? fallback : result
}
