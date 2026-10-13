/**
 * 채널 대화에 평문으로 올라온 비밀값(DB 접속 정보·API 키·토큰·비밀번호)을 가린다.
 * 에이전트 프롬프트 파일(tasks/{logId}.md)에 쓰기 전에 적용 — 운영 채널 실측에서 평문 비밀값이 여러 건 나왔다(기획 §2.5).
 */

const MASK = '****'

const RULES: Array<{ re: RegExp; replace: (...m: string[]) => string }> = [
  // URL 안 계정: scheme://user:pass@host
  { re: /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s@/]+)(@)/gi, replace: (_m, a, _p, c) => `${a}${MASK}${c}` },
  // 키=값 / 키: 값 — 키 이름으로 판단. 구분자(: =)가 있을 때만 — "token 발급" 같은 대화를 가리지 않도록.
  // DB_PASSWORD= · ACCESS_TOKEN= 처럼 접두어가 붙은 환경변수형 키도 잡고, 따옴표 값은 공백까지 통째로 가린다.
  {
    re: /((?<![A-Za-z0-9])[A-Za-z0-9_.-]*?(?:password|passwd|pwd|pw|passphrase|secret|api[_-]?key|access[_-]?key|private[_-]?key|token)(?![A-Za-z])|비밀번호|비번|패스워드|암호)(\s*[:=：]\s*)(?:"([^"\n]{1,200})"|'([^'\n]{1,200})'|([^\s"',;&]{3,}))/gi,
    replace: (_m, key, sep, dq, sq) => (dq ? `${key}${sep}"${MASK}"` : sq ? `${key}${sep}'${MASK}'` : `${key}${sep}${MASK}`)
  },
  // 인증 헤더
  { re: /\b(dooray-api|Bearer|Basic)\s+[A-Za-z0-9._~+/:=-]{12,}/g, replace: (_m, scheme) => `${scheme} ${MASK}` },
  // 잘 알려진 토큰 접두어
  { re: /\b(?:ghp|gho|ghu|ghs|github_pat|glpat|xox[abpr]|sk-ant|sk|drop_pat|AKIA)[-_A-Za-z0-9]{16,}/g, replace: () => MASK },
  // 두레이 API 토큰 형식 {tenant}:{key}
  { re: /\b[a-z0-9]{12}:[A-Za-z0-9_-]{20,}\b/g, replace: () => MASK }
]

/** 텍스트 안 비밀값을 `****` 로 가린다. 몇 군데를 가렸는지도 함께 돌려준다. */
export function maskSecrets(text: string): { text: string; count: number } {
  let count = 0
  let out = text
  for (const rule of RULES) {
    out = out.replace(rule.re, (...args: unknown[]) => {
      count++
      const groups = args.slice(0, -2).map((g) => (typeof g === 'string' ? g : ''))
      return rule.replace(...groups)
    })
  }
  return { text: out, count }
}

/** 한 줄이 너무 길면(백업 INSERT 등) 앞부분만 남긴다 — 컨텍스트 낭비를 막는다. */
export function truncateLongLines(text: string, maxLineLen = 2000): string {
  return text
    .split('\n')
    .map((line) => (line.length > maxLineLen ? `${line.slice(0, maxLineLen)} …(${line.length - maxLineLen}자 생략)` : line))
    .join('\n')
}
