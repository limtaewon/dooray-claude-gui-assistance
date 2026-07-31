/**
 * git ref 로 안전한 이름인지 검증한다. 커맨드 인젝션 방지 규칙 + git ref 문법 규칙의 합집합.
 * `GitService.assertSafeRef`(얇은 래퍼)와 `branchName.ts` 생성기가 공유하는 단일 규칙 — ADR-v2-workspace-p1-02.
 */
export function isSafeGitRef(ref: string): boolean {
  if (!ref) return false

  // 커맨드 인젝션 방지 (기존 GitService.assertSafeRef 규칙 — 변경 금지)
  if (ref.startsWith('-')) return false
  if (ref.includes('..')) return false
  if (/[;|&$`\n\r]/.test(ref)) return false

  // git ref 문법 (check-ref-format 서브셋)
  if (/[\s\x00-\x1f\x7f]/.test(ref)) return false // 공백·제어문자
  if (/[~^:?*[\\]/.test(ref)) return false
  if (ref.includes('//')) return false
  if (ref.startsWith('/') || ref.endsWith('/')) return false
  if (ref.endsWith('.')) return false
  if (ref.endsWith('.lock')) return false
  if (ref.includes('@{')) return false
  if (ref === '@') return false

  return true
}
