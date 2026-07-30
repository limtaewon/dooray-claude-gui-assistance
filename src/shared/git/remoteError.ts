/**
 * git 원격 작업 에러를 사용자에게 보여줄 한 줄로 정규화한다.
 *
 * Portions ported from Orca (https://github.com/stablyai/orca) — orca@1.4.162-rc.0,
 * `src/shared/git-remote-error.ts`. Copyright (c) 2026 Lovecast Inc. — MIT License.
 * 변경: ① 서브모듈 push 실패 분기 제거(Clauday 는 재귀 push 를 하지 않는다) ② 메시지 한국어화
 *   ③ 인증 실패 여부를 별도 판정 함수로 노출(`GitRemoteOpResult.authFailed` 용).
 */

// `user:password@` 는 모든 scheme 에서 지우되, 단독 `user@` 는 HTTP(S) 에서만 — SSH 의
// `git@host` 를 지우면 URL 자체가 망가진다.
const USERPASS_URL_PATTERN = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi
const HTTPS_TOKEN_URL_PATTERN = /(https?:\/\/)[^\s/@:]+@/gi
const DIVERGENT_PULL_PATTERN =
  /Need to specify how to reconcile divergent branches|divergent branches and need to specify how to reconcile them/i
// 이 인자들은 이미 reconcile 전략을 지정한다 — 폴백이 사용자의 명시 선택을 덮으면 안 된다.
const RECONCILIATION_PULL_ARG_PATTERN = /^(--rebase|--no-rebase|--ff-only|--ff|--no-ff|--merge|-r)(=|$)/
/** `--no-rebase`(과거 기본값인 merge)는 모든 지원 git 버전에 있어 폴백으로 안전하다. */
export const MERGE_RECONCILIATION_PULL_ARGS = ['--no-rebase']

export type GitRemoteOperation = 'push' | 'pull' | 'fetch' | 'upstream'

export function stripCredentialsFromMessage(message: string): string {
  return message.replace(USERPASS_URL_PATTERN, '$1').replace(HTTPS_TOKEN_URL_PATTERN, '$1')
}

function extractTailLine(message: string): string {
  // stderr 마지막 비어있지 않은 줄이 진단 정보다. 전체를 그대로 노출하면 로컬 경로가 샌다.
  const lines = message.split(/\r?\n/)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!.trim()
    if (line.length > 0) return line
  }
  return message
}

/** git 2.27+ 는 정책이 없으면 divergent pull 을 거부한다 — 호출자가 merge 로 재시도할 수 있게 판정. */
export function isDivergentPullReconciliationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return DIVERGENT_PULL_PATTERN.test(stripCredentialsFromMessage(error.message))
}

export function pullArgsSpecifyReconciliation(pullArgs: string[]): boolean {
  return pullArgs.some((arg) => RECONCILIATION_PULL_ARG_PATTERN.test(arg))
}

/** divergent pull 거부 시 `--no-rebase` 로 1회만 재시도한다. 호출자가 전략을 지정했으면 하지 않는다. */
export async function runPullWithDivergenceFallback(
  pullArgs: string[],
  runPull: (effectiveArgs: string[]) => Promise<void>
): Promise<void> {
  try {
    await runPull(pullArgs)
  } catch (error) {
    if (!pullArgsSpecifyReconciliation(pullArgs) && isDivergentPullReconciliationError(error)) {
      await runPull([...MERGE_RECONCILIATION_PULL_ARGS, ...pullArgs])
      return
    }
    throw error
  }
}

/** 자격증명 요구/실패인지 — UI 가 "원격 자격증명 확인" 안내를 띄우는 조건. */
export function isGitAuthFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const raw = stripCredentialsFromMessage(error.message)
  return (
    raw.includes('could not read Username') ||
    raw.includes('could not read Password') ||
    raw.includes('Authentication failed') ||
    raw.includes('Permission denied (publickey') ||
    raw.includes('terminal prompts disabled')
  )
}

/** `fatal:` 접두가 있어야 인정한다 — hook 출력이 우연히 매칭돼 진짜 실패를 가리지 않게. */
const NO_UPSTREAM_PHRASE_PATTERN =
  /no upstream configured|no tracking information|HEAD does not point|Needed a single revision|ambiguous argument 'HEAD@\{u\}'/i
const FATAL_PREFIX_PATTERN = /(^|\n)fatal:/i

export function isNoUpstreamError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return FATAL_PREFIX_PATTERN.test(error.message) && NO_UPSTREAM_PHRASE_PATTERN.test(error.message)
}

export function normalizeGitErrorMessage(error: unknown, operation?: GitRemoteOperation): string {
  if (!(error instanceof Error)) return 'git 원격 작업에 실패했습니다.'

  // 아래 모든 분기가 이미 마스킹된 문자열을 보도록 맨 앞에서 자격증명을 지운다.
  const raw = stripCredentialsFromMessage(error.message)

  // non-fast-forward / fetch first 는 fetch·pull 에서도 나오므로 push 안내는 push 로 한정한다.
  if (
    (operation === 'push' || operation === undefined) &&
    (raw.includes('non-fast-forward') || raw.includes('fetch first'))
  ) {
    return '푸시 거부됨: 원격에 더 최신 커밋이 있습니다(non-fast-forward). 먼저 풀 하세요.'
  }
  if (isGitAuthFailure(error)) {
    return '인증에 실패했습니다. 원격 자격증명을 확인하세요.'
  }
  if (raw.includes('Could not resolve host') || raw.includes('Network is unreachable')) {
    return '네트워크 오류입니다. 연결 상태를 확인하세요.'
  }
  if (raw.includes('no tracking information') || raw.includes('no upstream')) {
    return '브랜치에 upstream 이 없습니다. 먼저 브랜치를 발행(-u)하세요.'
  }
  if (operation === 'pull' && DIVERGENT_PULL_PATTERN.test(raw)) {
    return (
      '갈라진 브랜치를 어떻게 합칠지 정책이 필요합니다. ' +
      'git config pull.rebase false(merge) / true(rebase) / git config pull.ff only 중 하나를 설정하세요.'
    )
  }
  if (
    raw.includes('Your local changes to the following files would be overwritten') ||
    raw.includes('Your local changes would be overwritten')
  ) {
    return '풀 하면 로컬 변경이 덮어써집니다. 먼저 커밋·스태시하거나 되돌리세요.'
  }
  if (raw.includes('untracked working tree files would be overwritten')) {
    return '풀 하면 추적되지 않은 파일이 덮어써집니다. 먼저 옮기거나 삭제하세요.'
  }

  return extractTailLine(raw)
}
