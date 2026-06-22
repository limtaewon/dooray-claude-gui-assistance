/**
 * pathGate 테스트 — 경로 화이트리스트 게이트(C1 보안 수정 회귀 방지)
 *
 * 핵심 검증:
 * - skills 하위 경로는 등록 없이도 허용
 * - 미등록 임의 경로는 거부 (silent AI 전송 차단)
 * - 심링크로 허용 루트를 탈출하는 경로 거부 (realpath 해소)
 * - PathAllowlist 등록 후 허용
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import { tmpdir } from 'os'
import {
  isUnderAllowedRoot,
  assertPathAllowed,
  PathAllowlist,
  HarnessPathDeniedError
} from '../pathGate'

describe('isUnderAllowedRoot (순수)', () => {
  const root = path.resolve('/tmp/allowed-root')

  it('루트 하위 경로는 허용', () => {
    expect(isUnderAllowedRoot(path.join(root, 'bundle'), [root])).toBe(true)
  })

  it('루트 자기 자신도 허용', () => {
    expect(isUnderAllowedRoot(root, [root])).toBe(true)
  })

  it('루트 외부 경로는 거부', () => {
    expect(isUnderAllowedRoot('/tmp/other/secret', [root])).toBe(false)
  })

  it('".." 탈출 시도는 거부 (prefix 문자열 일치만으로 통과 안 됨)', () => {
    // "/tmp/allowed-root-evil" 은 "/tmp/allowed-root" 의 하위가 아님
    expect(isUnderAllowedRoot('/tmp/allowed-root-evil/x', [root])).toBe(false)
  })

  it('허용 루트 여러 개 중 하나라도 하위면 허용', () => {
    expect(isUnderAllowedRoot('/tmp/b/x', ['/tmp/a', '/tmp/b'])).toBe(true)
  })
})

describe('assertPathAllowed (실제 fs/realpath)', () => {
  let base: string
  let skillsRoot: string
  let bundleUnderSkills: string
  let outsideDir: string
  let symlinkEscape: string

  beforeAll(async () => {
    base = await fs.mkdtemp(path.join(tmpdir(), 'harness-pathgate-'))
    skillsRoot = path.join(base, 'skills')
    bundleUnderSkills = path.join(skillsRoot, 'reined-bmad')
    outsideDir = path.join(base, 'outside', 'secret')
    await fs.mkdir(bundleUnderSkills, { recursive: true })
    await fs.mkdir(outsideDir, { recursive: true })
    // allowedRoots 계약: realpath 적용 완료된 값을 전달해야 한다.
    // tmpdir 이 심링크인 환경(macOS /var→/private/var)을 고려해 skillsRoot 도 realpath 로 정규화.
    skillsRoot = await fs.realpath(skillsRoot)

    // 심링크: skills 하위에 outside 를 가리키는 링크 → realpath 로 탈출 탐지돼야 함
    symlinkEscape = path.join(skillsRoot, 'escape-link')
    try {
      await fs.symlink(outsideDir, symlinkEscape, 'dir')
    } catch {
      // 심링크 생성 불가 환경 — 해당 케이스는 런타임에 skip
    }
  })

  afterAll(async () => {
    await fs.rm(base, { recursive: true, force: true })
  })

  it('skills 하위 경로는 허용하고 realpath 를 반환', async () => {
    const resolved = await assertPathAllowed(bundleUnderSkills, [skillsRoot])
    expect(resolved).toBe(await fs.realpath(bundleUnderSkills))
  })

  it('미등록 외부 경로는 HarnessPathDeniedError', async () => {
    await expect(assertPathAllowed(outsideDir, [skillsRoot])).rejects.toBeInstanceOf(
      HarnessPathDeniedError
    )
  })

  it('존재하지 않는 경로는 거부 (realpath 실패)', async () => {
    await expect(
      assertPathAllowed(path.join(skillsRoot, 'no-such'), [skillsRoot])
    ).rejects.toBeInstanceOf(HarnessPathDeniedError)
  })

  it('심링크로 허용 루트를 탈출하면 거부 (realpath 해소 후 검사)', async () => {
    // 심링크 자체는 skillsRoot 하위지만 realpath 는 outside 를 가리킴 → 거부
    let linkExists = false
    try {
      await fs.lstat(symlinkEscape)
      linkExists = true
    } catch {
      /* 심링크 미생성 환경 */
    }
    if (!linkExists) return // skip
    await expect(assertPathAllowed(symlinkEscape, [skillsRoot])).rejects.toBeInstanceOf(
      HarnessPathDeniedError
    )
  })

  it('등록된(allowlist) 외부 경로는 허용', async () => {
    const realOutside = await fs.realpath(outsideDir)
    const resolved = await assertPathAllowed(outsideDir, [skillsRoot, realOutside])
    expect(resolved).toBe(realOutside)
  })
})

describe('PathAllowlist', () => {
  it('register 후 has 가 true', () => {
    const al = new PathAllowlist()
    expect(al.has('/x/y')).toBe(false)
    al.register('/x/y')
    expect(al.has('/x/y')).toBe(true)
  })

  it('toAllowedRoots 는 skillsRoot + 등록 경로를 합쳐 반환', () => {
    const al = new PathAllowlist()
    al.register('/a')
    al.register('/b')
    const roots = al.toAllowedRoots('/skills')
    expect(roots).toContain('/skills')
    expect(roots).toContain('/a')
    expect(roots).toContain('/b')
    expect(roots[0]).toBe('/skills')
  })
})
