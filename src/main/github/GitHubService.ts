import { execFile } from 'child_process'
import type { GitHubStatus } from '../../shared/types/github'
import { parseGhAuthStatus } from '../../shared/github/ghAuthStatus'
import { claudeExtraPaths, mergePathIntoEnv } from '../utils/env'

export interface GhRunResult {
  ok: boolean
  /** stdout + stderr — gh 는 버전에 따라 둘을 오간다 */
  output: string
}

export interface GitHubServiceOptions {
  /** 테스트 주입용 — 기본은 실제 `gh` 실행 */
  runGh?: (args: string[]) => Promise<GhRunResult>
}

const GH_TIMEOUT_MS = 5000

/**
 * GitHub 연동 상태 — **`gh` CLI 를 그대로 본다.** 앱은 토큰을 받지도 보관하지도 않는다.
 *
 * 이미 `gh auth login` 한 사람에게 PAT 를 또 만들라고 하면 같은 일을 두 번 시키는 것이고,
 * 앱이 토큰을 따로 들고 있으면 만료·회수 관리 대상이 하나 더 생긴다. Orca 도 같은 판단이다.
 */
export class GitHubService {
  private cached: GitHubStatus | null = null

  constructor(private options: GitHubServiceOptions = {}) {}

  async status(refresh = false): Promise<GitHubStatus> {
    if (!refresh && this.cached) return this.cached

    const version = await this.run(['--version'])
    if (!version.ok) {
      // gh 가 없다 — 설치 안내를 보여줘야 하므로 오류가 아니라 상태로 다룬다.
      this.cached = { state: 'not-installed', accounts: [] }
      return this.cached
    }

    const auth = await this.run(['auth', 'status'])
    const accounts = parseGhAuthStatus(auth.output)
    this.cached = {
      // gh 는 로그인이 없으면 1로 끝나지만, 출력에 계정이 보이면 그쪽을 믿는다
      // (일부 버전은 호스트 하나가 실패해도 전체를 실패로 끝낸다).
      state: accounts.length > 0 ? 'connected' : 'not-authenticated',
      accounts,
      version: version.output.split('\n')[0]?.trim()
    }
    return this.cached
  }

  private run(args: string[]): Promise<GhRunResult> {
    if (this.options.runGh) return this.options.runGh(args)
    return new Promise((resolve) => {
      // Electron 은 로그인 셸 PATH 를 물려받지 못해 gh 를 못 찾는 일이 흔하다.
      const env = mergePathIntoEnv(process.env, claudeExtraPaths())
      execFile('gh', args, { env, timeout: GH_TIMEOUT_MS }, (err, stdout, stderr) => {
        const output = `${stdout ?? ''}\n${stderr ?? ''}`
        resolve({ ok: !err, output })
      })
    })
  }
}
