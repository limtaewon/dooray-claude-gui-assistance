import { describe, it, expect } from 'vitest'
import { parseVersion, compareVersions, isNewerVersion, pickLatestStable, pickAssetForPlatform } from './version'
import type { GithubRelease } from '../../shared/types/update'

function release(over: Partial<GithubRelease> & { tag_name: string }): GithubRelease {
  return {
    html_url: `https://github.com/x/y/releases/tag/${over.tag_name}`,
    prerelease: false,
    draft: false,
    assets: [],
    ...over
  }
}

describe('parseVersion', () => {
  it('v 접두어가 있든 없든 같게 읽는다', () => {
    expect(parseVersion('v2.0.4')).toEqual({ major: 2, minor: 0, patch: 4, prerelease: null })
    expect(parseVersion('2.0.4')).toEqual({ major: 2, minor: 0, patch: 4, prerelease: null })
  })

  it('prerelease 를 분리한다', () => {
    expect(parseVersion('2.1.0-beta.1')?.prerelease).toBe('beta.1')
  })

  it('형식이 아니면 null', () => {
    expect(parseVersion('latest')).toBeNull()
    expect(parseVersion('2.0')).toBeNull()
    expect(parseVersion('')).toBeNull()
  })
})

describe('compareVersions', () => {
  it('major · minor · patch 순으로 비교한다', () => {
    expect(compareVersions('3.0.0', '2.9.9')).toBeGreaterThan(0)
    expect(compareVersions('2.1.0', '2.0.9')).toBeGreaterThan(0)
    expect(compareVersions('2.0.4', '2.0.3')).toBeGreaterThan(0)
    expect(compareVersions('2.0.3', '2.0.3')).toBe(0)
  })

  it('10 을 문자열이 아니라 숫자로 비교한다', () => {
    // 문자열 비교였다면 '2.0.10' < '2.0.9' 로 뒤집힌다
    expect(compareVersions('2.0.10', '2.0.9')).toBeGreaterThan(0)
  })

  it('정식 릴리즈가 prerelease 보다 높다', () => {
    expect(compareVersions('2.1.0', '2.1.0-beta.1')).toBeGreaterThan(0)
    expect(compareVersions('2.1.0-beta.1', '2.1.0')).toBeLessThan(0)
  })
})

describe('isNewerVersion', () => {
  it('더 높은 버전만 true', () => {
    expect(isNewerVersion('2.0.4', '2.0.3')).toBe(true)
    expect(isNewerVersion('2.0.3', '2.0.3')).toBe(false)
    expect(isNewerVersion('2.0.2', '2.0.3')).toBe(false)
  })

  it('파싱 못 하면 업데이트 없음으로 본다 (잘못된 태그로 알림을 띄우지 않는다)', () => {
    expect(isNewerVersion('nightly', '2.0.3')).toBe(false)
    expect(isNewerVersion('2.0.4', 'unknown')).toBe(false)
  })
})

describe('pickLatestStable', () => {
  it('draft 와 prerelease 를 건너뛴다', () => {
    const picked = pickLatestStable([
      release({ tag_name: 'v2.2.0', draft: true }),
      release({ tag_name: 'v2.1.0', prerelease: true }),
      release({ tag_name: 'v2.0.4' })
    ])
    expect(picked?.tag_name).toBe('v2.0.4')
  })

  it('목록 순서와 무관하게 가장 높은 버전을 고른다', () => {
    const picked = pickLatestStable([
      release({ tag_name: 'v2.0.3' }),
      release({ tag_name: 'v2.0.10' }),
      release({ tag_name: 'v2.0.9' })
    ])
    expect(picked?.tag_name).toBe('v2.0.10')
  })

  it('쓸 수 있는 릴리즈가 없으면 null', () => {
    expect(pickLatestStable([])).toBeNull()
    expect(pickLatestStable([release({ tag_name: 'nightly' })])).toBeNull()
  })
})

describe('pickAssetForPlatform', () => {
  const withAssets = release({
    tag_name: 'v2.0.4',
    assets: [
      { name: 'Clauday-2.0.4-arm64.dmg', browser_download_url: 'https://x/arm64.dmg', size: 1 },
      { name: 'Clauday-2.0.4-x64.dmg', browser_download_url: 'https://x/x64.dmg', size: 1 },
      { name: 'Clauday-Setup-2.0.4.exe', browser_download_url: 'https://x/setup.exe', size: 1 },
      { name: 'latest.yml', browser_download_url: 'https://x/latest.yml', size: 1 }
    ]
  })

  it('macOS 는 아키텍처에 맞는 dmg 를 고른다', () => {
    expect(pickAssetForPlatform(withAssets, 'darwin', 'arm64')?.url).toBe('https://x/arm64.dmg')
    expect(pickAssetForPlatform(withAssets, 'darwin', 'x64')?.url).toBe('https://x/x64.dmg')
  })

  it('Windows 는 exe 를 고른다', () => {
    expect(pickAssetForPlatform(withAssets, 'win32', 'x64')?.name).toBe('Clauday-Setup-2.0.4.exe')
  })

  it('아키텍처 표기가 없으면 첫 후보를 쓴다', () => {
    const single = release({
      tag_name: 'v2.0.4',
      assets: [{ name: 'Clauday.dmg', browser_download_url: 'https://x/a.dmg', size: 1 }]
    })
    expect(pickAssetForPlatform(single, 'darwin', 'arm64')?.url).toBe('https://x/a.dmg')
  })

  it('맞는 파일이 없으면 null', () => {
    expect(pickAssetForPlatform(release({ tag_name: 'v2.0.4' }), 'darwin', 'arm64')).toBeNull()
    expect(pickAssetForPlatform(withAssets, 'linux', 'x64')).toBeNull()
  })
})
