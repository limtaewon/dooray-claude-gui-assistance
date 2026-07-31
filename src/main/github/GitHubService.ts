import { net } from 'electron'
import keytar from 'keytar'
import type { GitHubAccount, GitHubStatus } from '../../shared/types/github'

const SERVICE_NAME = 'clauday'
const ACCOUNT_NAME = 'github-token'
const DEFAULT_API_BASE = 'https://api.github.com'

export interface GitHubServiceOptions {
  /** GitHub Enterprise 를 쓰는 경우의 API 베이스 (기본 github.com) */
  apiBaseUrl?: string
  /** 테스트 주입용 — 기본은 electron net */
  fetchJson?: (url: string, token: string) => Promise<{ status: number; body: unknown }>
}

/**
 * GitHub 개인 액세스 토큰 보관 + 계정 확인.
 *
 * 토큰은 OS 키체인에만 둔다(두레이 토큰과 같은 방식) — 설정 파일에 남기면 백업·동기화로 새어나간다.
 * 토큰 자체는 렌더러로 돌려주지 않고 **연결 여부와 계정 정보만** 준다.
 */
export class GitHubService {
  private token: string | null = null
  private cachedAccount: GitHubAccount | null = null

  constructor(private options: GitHubServiceOptions = {}) {}

  private get apiBase(): string {
    return this.options.apiBaseUrl ?? DEFAULT_API_BASE
  }

  async getToken(): Promise<string | null> {
    if (this.token) return this.token
    try {
      this.token = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME)
    } catch (err) {
      console.warn('[GitHub] 키체인 읽기 실패:', err)
    }
    return this.token
  }

  /** 토큰 저장 — 저장 전에 유효성을 확인해서 잘못된 값을 눌러 담지 않는다. */
  async connect(token: string): Promise<GitHubStatus> {
    const trimmed = token.trim()
    if (!trimmed) return { connected: false, error: '토큰이 비어 있습니다' }

    const result = await this.fetchAccount(trimmed)
    if (!result.account) return { connected: false, error: result.error }

    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, trimmed)
    this.token = trimmed
    this.cachedAccount = result.account
    return { connected: true, account: result.account }
  }

  async disconnect(): Promise<void> {
    try {
      await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME)
    } catch (err) {
      console.warn('[GitHub] 키체인 삭제 실패:', err)
    }
    this.token = null
    this.cachedAccount = null
  }

  /** 지금 연결 상태. `refresh` 면 캐시를 무시하고 다시 물어본다. */
  async status(refresh = false): Promise<GitHubStatus> {
    const token = await this.getToken()
    if (!token) return { connected: false }
    if (!refresh && this.cachedAccount) return { connected: true, account: this.cachedAccount }

    const result = await this.fetchAccount(token)
    if (!result.account) {
      // 토큰은 있는데 거절당했다 — 만료·회수됐을 수 있으니 그대로 알린다(조용히 지우지 않는다).
      return { connected: false, error: result.error, hasStoredToken: true }
    }
    this.cachedAccount = result.account
    return { connected: true, account: result.account }
  }

  private async fetchAccount(token: string): Promise<{ account?: GitHubAccount; error?: string }> {
    try {
      const { status, body } = await (this.options.fetchJson ?? this.requestJson.bind(this))(
        `${this.apiBase}/user`,
        token
      )
      if (status === 401) return { error: '토큰이 유효하지 않습니다 (401)' }
      if (status === 403) return { error: '접근이 거부되었습니다 — 토큰 권한을 확인하세요 (403)' }
      if (status < 200 || status >= 300) return { error: `GitHub 응답 오류 (${status})` }

      const user = body as { login?: string; name?: string; avatar_url?: string; html_url?: string }
      if (!user?.login) return { error: '계정 정보를 읽지 못했습니다' }
      return {
        account: {
          login: user.login,
          name: user.name ?? null,
          avatarUrl: user.avatar_url ?? null,
          profileUrl: user.html_url ?? `https://github.com/${user.login}`
        }
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }

  private requestJson(url: string, token: string): Promise<{ status: number; body: unknown }> {
    return new Promise((resolve, reject) => {
      const request = net.request({ method: 'GET', url })
      request.setHeader('Authorization', `Bearer ${token}`)
      request.setHeader('Accept', 'application/vnd.github+json')
      request.setHeader('User-Agent', 'Clauday')
      request.on('response', (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let body: unknown = null
          try {
            body = text ? JSON.parse(text) : null
          } catch {
            body = null
          }
          resolve({ status: response.statusCode, body })
        })
      })
      request.on('error', reject)
      request.end()
    })
  }
}
