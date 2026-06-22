/**
 * pathGate.writable.test.ts — assertWritablePath 단위 테스트 (M3 쓰기 경로 게이트)
 *
 * 검증 항목:
 * - '..' 세그먼트 포함 경로 거부 (디렉터리 탈출 차단)
 * - 확장자 화이트리스트 (.md/.sh/.txt/VERSION 허용, 그 외 거부)
 * - bundleRoot 하위 허용
 * - 심링크 탈출 거부
 * - 신규 파일 생성 — 부모 디렉터리 realpath 검증
 * - isWritableExtension 순수 함수 케이스
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import { tmpdir } from 'os'
import { assertWritablePath, isWritableExtension, HarnessPathDeniedError } from '../pathGate'

// ─────────────────────────────────────────────
// isWritableExtension [순수]
// ─────────────────────────────────────────────

describe('isWritableExtension [순수]', () => {
  it('.md 허용', () => {
    expect(isWritableExtension('_agents/dev.md')).toBe(true)
  })

  it('.sh 허용', () => {
    expect(isWritableExtension('_hooks/gate.sh')).toBe(true)
  })

  it('.txt 허용', () => {
    expect(isWritableExtension('notes.txt')).toBe(true)
  })

  it('VERSION (확장자 없는 파일) 허용', () => {
    expect(isWritableExtension('VERSION')).toBe(true)
  })

  it('.json 거부', () => {
    expect(isWritableExtension('config.json')).toBe(false)
  })

  it('.ts 거부', () => {
    expect(isWritableExtension('script.ts')).toBe(false)
  })

  it('.py 거부', () => {
    expect(isWritableExtension('run.py')).toBe(false)
  })

  it('.sh.bak 거부 (마지막 확장자 기준)', () => {
    // .bak 는 화이트리스트에 없음
    expect(isWritableExtension('gate.sh.bak')).toBe(false)
  })

  it('대소문자 구분 없이 .MD 도 허용', () => {
    expect(isWritableExtension('README.MD')).toBe(true)
  })
})

// ─────────────────────────────────────────────
// assertWritablePath (fs 포함)
// ─────────────────────────────────────────────

describe('assertWritablePath', () => {
  let base: string
  let bundleRoot: string
  let outside: string
  let symlinkPath: string

  beforeAll(async () => {
    base = await fs.mkdtemp(path.join(tmpdir(), 'harness-writable-'))
    const rawBundleRoot = path.join(base, 'bundle')
    outside = path.join(base, 'outside')
    // mkdir 먼저 → 그 후 realpath
    await fs.mkdir(rawBundleRoot, { recursive: true })
    await fs.mkdir(outside, { recursive: true })
    bundleRoot = await fs.realpath(rawBundleRoot)
    // 번들 루트 내 기존 파일 생성
    await fs.mkdir(path.join(bundleRoot, '_agents'), { recursive: true })
    await fs.writeFile(path.join(bundleRoot, '_agents', 'dev.md'), 'hello')
    // 심링크: bundleRoot/link → outside
    symlinkPath = path.join(bundleRoot, 'escape-link')
    try {
      await fs.symlink(outside, symlinkPath, 'dir')
    } catch {
      // 심링크 미지원 환경 — 해당 케이스 skip
    }
  })

  afterAll(async () => {
    await fs.rm(base, { recursive: true, force: true })
  })

  it('bundleRoot 하위 기존 .md 파일 — 허용하고 절대경로 반환', async () => {
    const result = await assertWritablePath(bundleRoot, '_agents/dev.md')
    expect(result).toContain(bundleRoot)
    expect(result.endsWith('dev.md')).toBe(true)
  })

  it('".." 포함 relPath 거부', async () => {
    await expect(assertWritablePath(bundleRoot, '../outside/secret.md')).rejects.toBeInstanceOf(
      HarnessPathDeniedError
    )
  })

  it('"../../" 형태도 거부', async () => {
    await expect(assertWritablePath(bundleRoot, '../../etc/passwd')).rejects.toBeInstanceOf(
      HarnessPathDeniedError
    )
  })

  it('확장자 화이트리스트 외 (.json) 거부', async () => {
    await expect(assertWritablePath(bundleRoot, 'config.json')).rejects.toBeInstanceOf(
      HarnessPathDeniedError
    )
  })

  it('확장자 화이트리스트 외 (.ts) 거부', async () => {
    await expect(assertWritablePath(bundleRoot, 'script.ts')).rejects.toBeInstanceOf(
      HarnessPathDeniedError
    )
  })

  it('신규 .md 파일 (존재하지 않음) — 부모 디렉터리 검증 후 허용', async () => {
    // bundleRoot/_agents/ 는 존재, 파일은 미존재
    const result = await assertWritablePath(bundleRoot, '_agents/new-agent.md')
    expect(result).toContain('new-agent.md')
    expect(result).toContain(bundleRoot)
  })

  it('신규 파일 — 부모 디렉터리 bundleRoot 외부면 거부', async () => {
    // 부모 디렉터리가 존재하지 않는 경우 (미생성 서브 디렉터리의 외부 심링크가 있어야 하지만,
    // 일반적으로 부모 미존재 → realpath 실패 → 거부)
    await expect(
      assertWritablePath(bundleRoot, 'nonexistent-parent/new.md')
    ).rejects.toBeInstanceOf(HarnessPathDeniedError)
  })

  it('심링크 탈출 시도 거부 (realpath 후 bundleRoot 외부)', async () => {
    let linkExists = false
    try {
      await fs.lstat(symlinkPath)
      linkExists = true
    } catch {
      /* 심링크 미생성 */
    }
    if (!linkExists) return // skip

    // escape-link/secret.sh 는 실제로 outside 를 가리킴 → 거부
    await expect(
      assertWritablePath(bundleRoot, 'escape-link/secret.sh')
    ).rejects.toBeInstanceOf(HarnessPathDeniedError)
  })

  it('.sh 확장자 — 텍스트 쓰기 허용 (실행은 별개 보장)', async () => {
    // _hooks 디렉터리 생성
    await fs.mkdir(path.join(bundleRoot, '_hooks'), { recursive: true })
    await fs.writeFile(path.join(bundleRoot, '_hooks', 'gate.sh'), '#!/bin/bash')
    const result = await assertWritablePath(bundleRoot, '_hooks/gate.sh')
    expect(result.endsWith('gate.sh')).toBe(true)
  })
})

// ─────────────────────────────────────────────
// P1-3: Windows backslash '..' 및 절대경로 거부
// ─────────────────────────────────────────────

describe('assertWritablePath — Windows backslash / 절대경로 거부 (P1-3)', () => {
  let base: string
  let bundleRoot: string

  beforeAll(async () => {
    base = await fs.mkdtemp(path.join(tmpdir(), 'harness-win-'))
    const rawBundleRoot = path.join(base, 'bundle')
    await fs.mkdir(rawBundleRoot, { recursive: true })
    bundleRoot = await fs.realpath(rawBundleRoot)
    await fs.mkdir(path.join(bundleRoot, '_agents'), { recursive: true })
    await fs.writeFile(path.join(bundleRoot, '_agents', 'dev.md'), 'hello')
  })

  afterAll(async () => {
    await fs.rm(base, { recursive: true, force: true })
  })

  it('Windows backslash ".." 거부 (..\\\\..\\\\x.sh)', async () => {
    // Windows 스타일 backslash 경로로 탈출 시도 — posix normalize 만으로는 놓칠 수 있음
    await expect(
      assertWritablePath(bundleRoot, '..\\..\\x.sh')
    ).rejects.toBeInstanceOf(HarnessPathDeniedError)
  })

  it('Windows backslash 단일 ".." 거부 (..\\secret.md)', async () => {
    await expect(
      assertWritablePath(bundleRoot, '..\\secret.md')
    ).rejects.toBeInstanceOf(HarnessPathDeniedError)
  })

  it('POSIX 절대경로 거부 (/etc/passwd)', async () => {
    await expect(
      assertWritablePath(bundleRoot, '/etc/passwd')
    ).rejects.toBeInstanceOf(HarnessPathDeniedError)
  })

  it('Windows 드라이브 절대경로 거부 (C:\\\\Windows\\\\system32\\\\evil.sh)', async () => {
    await expect(
      assertWritablePath(bundleRoot, 'C:\\Windows\\system32\\evil.sh')
    ).rejects.toBeInstanceOf(HarnessPathDeniedError)
  })

  it('Windows 드라이브 절대경로 거부 소문자 (c:/evil.sh)', async () => {
    await expect(
      assertWritablePath(bundleRoot, 'c:/evil.sh')
    ).rejects.toBeInstanceOf(HarnessPathDeniedError)
  })

  it('에러 메시지가 일반화됨 — 절대경로 노출 없음 (P2-4)', async () => {
    // message 에 절대경로가 포함되지 않아야 한다
    try {
      await assertWritablePath(bundleRoot, '/etc/passwd')
    } catch (err) {
      const e = err as Error & { internalReason?: string }
      // message 는 사용자에게 노출되는 안전한 메시지여야 함
      expect(e.message).not.toContain('/etc')
      expect(e.message).not.toContain(bundleRoot)
      // internalReason 에는 상세 정보 포함 (로그용)
      // HarnessPathDeniedError 의 internalReason 확인
      expect(e.internalReason).toBeDefined()
    }
  })
})
