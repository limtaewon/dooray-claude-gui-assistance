import type { GitHubAccount } from '../types/github'

/**
 * `gh auth status` 출력 파서.
 *
 * Portions ported from Orca (https://github.com/stablyai/orca) — `src/main/github/auth-diagnose.ts`.
 * Copyright (c) 2026 Lovecast Inc. — MIT License.
 * 변경: Orca 의 필수 스코프 판정·GHES 진단 분기를 걷어내고 계정 목록 파싱만 남겼다.
 *
 * gh 는 자유 형식 텍스트를 뱉지만 라벨(`Logged in to`, `Token scopes:`)은 버전 간 안정적이다.
 * 버전에 따라 stdout/stderr 를 오가므로 호출부가 둘을 합쳐서 넘긴다.
 *
 *   github.com
 *     ✓ Logged in to github.com account taewon (keyring)
 *     - Active account: true
 *     - Token scopes: 'gist', 'read:org', 'repo'
 */
export function parseGhAuthStatus(text: string): GitHubAccount[] {
  const accounts: GitHubAccount[] = []
  let currentHost: string | null = null
  let current: GitHubAccount | null = null

  const push = (): void => {
    if (current) accounts.push(current)
    current = null
  }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '')

    // 들여쓰기 없는 호스트 헤더. 사내 GHES 는 단일 라벨(`github`)일 수 있다.
    const hostMatch = line.match(/^([a-z0-9][a-z0-9.-]*(?::\d+)?)\s*:?\s*$/i)
    if (hostMatch && !/^logged\b/i.test(line)) {
      currentHost = hostMatch[1]
      continue
    }

    const loggedIn = line.match(/Logged in to (\S+) account (\S+)(?:\s+\(([^)]+)\))?/i)
    if (loggedIn) {
      push()
      // 헤더를 놓쳐도 이 줄에 호스트가 있다 — 한 줄 못 읽어 계정 전체가 사라지지 않게.
      const source = (loggedIn[3] ?? '').trim()
      current = {
        host: loggedIn[1] || currentHost || 'github.com',
        login: loggedIn[2],
        scopes: [],
        active: false,
        envToken: source === 'GITHUB_TOKEN' || source === 'GH_TOKEN' ? source : null
      }
      continue
    }

    if (!current) continue

    const active = line.match(/Active account:\s*(true|false)/i)
    if (active) {
      current.active = active[1].toLowerCase() === 'true'
      continue
    }

    const scopes = line.match(/Token scopes:\s*(.+)$/i)
    if (scopes) {
      current.scopes = scopes[1]
        .split(',')
        .map((scope) => scope.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
    }
  }

  push()
  // 계정이 하나뿐이면 gh 가 Active 줄을 생략하기도 한다 — 그것을 활성으로 본다.
  if (accounts.length === 1 && !accounts[0].active) accounts[0].active = true
  return accounts
}
