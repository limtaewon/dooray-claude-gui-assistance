/**
 * projectProfile.test.ts — 프로젝트 프로파일 수집기 단위 테스트
 *
 * 검증 항목:
 * 1. extractKeywords: 키워드 추출 — 불용어 제거, 길이<3 제거, cap, 중복 제거.
 * 2. gatherProjectProfile: cap 정책(최대 파일 수 / 디렉터리 수 / 키워드 수).
 * 3. 매칭 파일 경로 포함 검증 (내용 X).
 * 4. graceful 실패 — 존재하지 않는 경로도 에러 없이 빈 프로파일 반환.
 * 5. 존재하는 package.json / CLAUDE.md 을 올바르게 파싱.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import { tmpdir } from 'os'
import { gatherProjectProfile, extractKeywords } from '../projectProfile'
import { toPromptText, profileSignature } from '../../../shared/types/harness-dryrun'

// ─────────────────────────────────────────────────────────────────────────────
// 임시 디렉터리 픽스처
// ─────────────────────────────────────────────────────────────────────────────

let tmpDir: string

async function mkTmp(): Promise<string> {
  const dir = path.join(tmpdir(), `proj-profile-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

async function rmTmp(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true })
  } catch { /* cleanup 실패 무시 */ }
}

beforeAll(async () => {
  tmpDir = await mkTmp()
})

afterAll(async () => {
  await rmTmp(tmpDir)
})

// ─────────────────────────────────────────────────────────────────────────────
// extractKeywords
// ─────────────────────────────────────────────────────────────────────────────

describe('extractKeywords', () => {
  it('공백/특수문자로 분리하고 길이<3 토큰을 제거한다', () => {
    const result = extractKeywords('add user authentication via OAuth')
    // 'add', 'via' 는 불용어/길이 기준 제거
    expect(result).toContain('user')
    expect(result).toContain('authentication')
    expect(result).toContain('oauth')
  })

  it('불용어를 제거한다', () => {
    const result = extractKeywords('the new feature is for the user')
    expect(result).not.toContain('the')
    expect(result).not.toContain('is')
    expect(result).not.toContain('for')
  })

  it('최대 12개 키워드 cap 을 지킨다', () => {
    const longText = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron'
    const result = extractKeywords(longText)
    expect(result.length).toBeLessThanOrEqual(12)
  })

  it('중복 토큰을 제거한다', () => {
    const result = extractKeywords('authentication authentication authentication')
    expect(result.filter((k) => k === 'authentication').length).toBe(1)
  })

  it('빈 문자열에 대해 빈 배열을 반환한다', () => {
    expect(extractKeywords('')).toEqual([])
  })

  it('소문자로 변환한다', () => {
    const result = extractKeywords('PaymentService Refund')
    expect(result).toContain('paymentservice')
    expect(result).toContain('refund')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// gatherProjectProfile — 파일시스템 통합 테스트
// ─────────────────────────────────────────────────────────────────────────────

describe('gatherProjectProfile', () => {
  it('존재하지 않는 경로도 에러 없이 빈 프로파일을 반환한다 (graceful)', async () => {
    const result = await gatherProjectProfile('/nonexistent/path/xyz', 'some task')
    expect(result).toBeDefined()
    expect(result.projectPath).toContain('nonexistent')
    expect(result.techStack.buildMarkers).toEqual([])
    expect(result.modules.topDirs).toEqual([])
    expect(result.scope.matchedFiles).toEqual([])
  })

  it('package.json 이 있으면 name + dependencyKeys 를 파싱한다', async () => {
    const projDir = path.join(tmpDir, 'pkg-test')
    await fs.mkdir(projDir, { recursive: true })
    await fs.writeFile(
      path.join(projDir, 'package.json'),
      JSON.stringify({
        name: 'my-project',
        dependencies: { react: '^18', typescript: '^5' },
        devDependencies: { vitest: '^1' },
      })
    )

    const result = await gatherProjectProfile(projDir, 'react component test')
    expect(result.techStack.packageJson?.name).toBe('my-project')
    expect(result.techStack.packageJson?.dependencyKeys).toContain('react')
    expect(result.techStack.packageJson?.dependencyKeys).toContain('typescript')
    expect(result.techStack.packageJson?.dependencyKeys).toContain('vitest')
  })

  it('CLAUDE.md 머리 ~2KB 만 읽는다', async () => {
    const projDir = path.join(tmpDir, 'claude-md-test')
    await fs.mkdir(projDir, { recursive: true })
    const content = 'A'.repeat(5000) // 5KB
    await fs.writeFile(path.join(projDir, 'CLAUDE.md'), content)

    const result = await gatherProjectProfile(projDir, 'task')
    // 2048 bytes 이하로 잘려야 함
    expect((result.techStack.claudeMdHead ?? '').length).toBeLessThanOrEqual(2048)
  })

  it('CLAUDE.md 없으면 README.md 를 읽는다', async () => {
    const projDir = path.join(tmpDir, 'readme-test')
    await fs.mkdir(projDir, { recursive: true })
    await fs.writeFile(path.join(projDir, 'README.md'), '# My Project\nThis is a test project.')

    const result = await gatherProjectProfile(projDir, 'task')
    expect(result.techStack.readmeMdHead).toContain('My Project')
    expect(result.techStack.claudeMdHead).toBeUndefined()
  })

  it('상위 디렉터리 목록을 수집한다 (node_modules 제외)', async () => {
    const projDir = path.join(tmpDir, 'dirs-test')
    await fs.mkdir(projDir, { recursive: true })
    await fs.mkdir(path.join(projDir, 'src'))
    await fs.mkdir(path.join(projDir, 'test'))
    await fs.mkdir(path.join(projDir, 'node_modules'))

    const result = await gatherProjectProfile(projDir, 'task')
    expect(result.modules.topDirs).toContain('src')
    expect(result.modules.topDirs).toContain('test')
    expect(result.modules.topDirs).not.toContain('node_modules')
  })

  it('키워드에 매칭된 파일 경로를 수집한다 (내용 안 읽음)', async () => {
    const projDir = path.join(tmpDir, 'scope-test')
    await fs.mkdir(path.join(projDir, 'src'), { recursive: true })
    // 파일 이름에 키워드가 직접 포함되도록 명명 (매칭 기준: 파일 경로 소문자에 키워드 포함)
    await fs.writeFile(path.join(projDir, 'src', 'auth-service.ts'), '')
    await fs.writeFile(path.join(projDir, 'src', 'payment-service.ts'), '')
    await fs.writeFile(path.join(projDir, 'src', 'unrelated.ts'), '')

    // 'auth' 와 'payment' 가 키워드로 추출되어 파일 경로에 매칭되어야 함
    const result = await gatherProjectProfile(projDir, 'add auth service and payment service integration')
    const allMatched = result.scope.matchedFiles.join(' ')
    // 'auth' 키워드가 'auth-service.ts' 경로에 매칭
    expect(allMatched).toContain('auth-service')
    // 'payment' 키워드가 'payment-service.ts' 경로에 매칭
    expect(allMatched).toContain('payment-service')
    // 'unrelated' 는 키워드에 없으므로 매칭 안 됨
    expect(allMatched).not.toContain('unrelated')
  })

  it('collectedAt 이 ISO 8601 형식이다', async () => {
    const result = await gatherProjectProfile(tmpDir, 'task')
    expect(result.collectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// toPromptText
// ─────────────────────────────────────────────────────────────────────────────

describe('toPromptText', () => {
  it('프로젝트 경로를 포함한다', () => {
    const profile = {
      projectPath: '/my/project',
      techStack: { buildMarkers: [] },
      modules: { topDirs: [], truncated: false },
      scope: { keywords: [], matchedFiles: [], totalMatches: 0, truncated: false },
      collectedAt: new Date().toISOString(),
    }
    const text = toPromptText(profile)
    expect(text).toContain('/my/project')
  })

  it('package.json name + 의존성 키를 포함한다', () => {
    const profile = {
      projectPath: '/proj',
      techStack: {
        buildMarkers: [],
        packageJson: { name: 'test-app', dependencyKeys: ['react', 'typescript', 'vitest'] },
      },
      modules: { topDirs: [], truncated: false },
      scope: { keywords: [], matchedFiles: [], totalMatches: 0, truncated: false },
      collectedAt: new Date().toISOString(),
    }
    const text = toPromptText(profile)
    expect(text).toContain('test-app')
    expect(text).toContain('react')
    expect(text).toContain('typescript')
  })

  it('매칭 파일 목록을 포함한다', () => {
    const profile = {
      projectPath: '/proj',
      techStack: { buildMarkers: [] },
      modules: { topDirs: [], truncated: false },
      scope: {
        keywords: ['auth'],
        matchedFiles: ['src/authService.ts', 'test/auth.test.ts'],
        totalMatches: 2,
        truncated: false,
      },
      collectedAt: new Date().toISOString(),
    }
    const text = toPromptText(profile)
    expect(text).toContain('authService.ts')
    expect(text).toContain('auth.test.ts')
  })

  it('CLAUDE.md 내용을 600자 이하로 자른다', () => {
    const profile = {
      projectPath: '/proj',
      techStack: { buildMarkers: [], claudeMdHead: 'X'.repeat(1000) },
      modules: { topDirs: [], truncated: false },
      scope: { keywords: [], matchedFiles: [], totalMatches: 0, truncated: false },
      collectedAt: new Date().toISOString(),
    }
    const text = toPromptText(profile)
    // CLAUDE.md 내용이 600자 이하로 잘려 있어야 함
    const claudeSection = text.split('CLAUDE.md 요약:')[1] ?? ''
    expect(claudeSection.length).toBeLessThanOrEqual(601) // 개행 포함
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// profileSignature — 캐시 서명
// ─────────────────────────────────────────────────────────────────────────────

describe('profileSignature', () => {
  it('같은 프로파일에서 동일 서명을 반환한다', () => {
    const profile = {
      projectPath: '/proj',
      techStack: {
        buildMarkers: [],
        packageJson: { name: 'test', dependencyKeys: ['react'] },
      },
      modules: { topDirs: ['src'], truncated: false },
      scope: { keywords: ['auth'], matchedFiles: [], totalMatches: 0, truncated: false },
      collectedAt: '2026-01-01T00:00:00.000Z',
    }
    const sig1 = profileSignature(profile)
    const sig2 = profileSignature({ ...profile, collectedAt: '2026-06-22T12:00:00.000Z' })
    // collectedAt 이 달라도 서명은 같아야 함 (내용 기반)
    expect(sig1).toBe(sig2)
  })

  it('projectPath 가 다르면 서명이 달라진다', () => {
    const base = {
      projectPath: '/proj-a',
      techStack: { buildMarkers: [] },
      modules: { topDirs: [], truncated: false },
      scope: { keywords: [], matchedFiles: [], totalMatches: 0, truncated: false },
      collectedAt: new Date().toISOString(),
    }
    const sig1 = profileSignature(base)
    const sig2 = profileSignature({ ...base, projectPath: '/proj-b' })
    expect(sig1).not.toBe(sig2)
  })

  it('의존성 키 목록이 다르면 서명이 달라진다', () => {
    const makeProfile = (deps: string[]) => ({
      projectPath: '/proj',
      techStack: { buildMarkers: [], packageJson: { name: 'app', dependencyKeys: deps } },
      modules: { topDirs: [], truncated: false },
      scope: { keywords: [], matchedFiles: [], totalMatches: 0, truncated: false },
      collectedAt: new Date().toISOString(),
    })
    const sig1 = profileSignature(makeProfile(['react']))
    const sig2 = profileSignature(makeProfile(['vue']))
    expect(sig1).not.toBe(sig2)
  })
})
