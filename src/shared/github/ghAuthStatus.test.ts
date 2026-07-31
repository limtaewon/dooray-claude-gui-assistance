import { describe, it, expect } from 'vitest'
import { parseGhAuthStatus } from './ghAuthStatus'

describe('parseGhAuthStatus', () => {
  it('로그인한 계정과 스코프를 읽는다', () => {
    const accounts = parseGhAuthStatus(`github.com
  ✓ Logged in to github.com account taewon (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token scopes: 'gist', 'read:org', 'repo'`)

    expect(accounts).toEqual([
      {
        host: 'github.com',
        login: 'taewon',
        scopes: ['gist', 'read:org', 'repo'],
        active: true,
        envToken: null
      }
    ])
  })

  it('환경변수 토큰이 키체인을 가리면 알아본다 — 이때 gh auth refresh 는 조용히 무시된다', () => {
    const accounts = parseGhAuthStatus(`github.com
  ✓ Logged in to github.com account bot (GITHUB_TOKEN)
  - Active account: true`)
    expect(accounts[0].envToken).toBe('GITHUB_TOKEN')
  })

  it('여러 호스트·계정을 각각 읽는다', () => {
    const accounts = parseGhAuthStatus(`github.com
  ✓ Logged in to github.com account taewon (keyring)
  - Active account: true
  - Token scopes: 'repo'

ghe.nhn.com
  ✓ Logged in to ghe.nhn.com account taewon.lim (keyring)
  - Active account: false
  - Token scopes: 'repo', 'read:org'`)

    expect(accounts).toHaveLength(2)
    expect(accounts[1]).toMatchObject({ host: 'ghe.nhn.com', login: 'taewon.lim', active: false })
  })

  it('계정이 하나면 Active 줄이 없어도 활성으로 본다', () => {
    const accounts = parseGhAuthStatus(`github.com
  ✓ Logged in to github.com account taewon (keyring)`)
    expect(accounts[0].active).toBe(true)
  })

  it('로그인이 없으면 빈 목록', () => {
    expect(
      parseGhAuthStatus('You are not logged into any GitHub hosts. To log in, run: gh auth login')
    ).toEqual([])
  })

  it('빈 입력', () => {
    expect(parseGhAuthStatus('')).toEqual([])
  })
})
