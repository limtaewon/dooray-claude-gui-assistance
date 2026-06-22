/**
 * backup.test.ts — backup 유틸리티 단위 테스트 (M3)
 *
 * 검증 항목 [순수]:
 * - sanitizeBundleName: '/', '\', '..', null 바이트, 콜론 치환
 * - computeBackupDir: 경로 계산 정확성, ':' → '-' 치환
 * - restoreIsoTimestamp: 역변환 정확성
 *
 * 검증 항목 [fs]:
 * - backupFiles: 파일 복사, 신규 파일 스킵, 하위 디렉터리 포함
 * - listBackupEntries: 최신순 정렬, 빈 결과
 * - restoreFromBackup: 복원 정확성
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import { tmpdir } from 'os'
import {
  sanitizeBundleName,
  computeBackupDir,
  restoreIsoTimestamp,
  backupFiles,
  listBackupEntries,
  restoreFromBackup,
  getBackupRoot,
} from '../backup'

// ─────────────────────────────────────────────
// 순수 함수 테스트
// ─────────────────────────────────────────────

describe('sanitizeBundleName [순수]', () => {
  it('정상 번들 이름은 그대로 반환', () => {
    expect(sanitizeBundleName('reined-bmad')).toBe('reined-bmad')
  })

  it('/ 를 _ 로 치환', () => {
    expect(sanitizeBundleName('path/to/bundle')).toBe('path_to_bundle')
  })

  it('\\ 를 _ 로 치환', () => {
    expect(sanitizeBundleName('path\\to\\bundle')).toBe('path_to_bundle')
  })

  it('".." 을 _ 로 치환', () => {
    expect(sanitizeBundleName('../evil')).toBe('__evil')
  })

  it('null 바이트를 _ 로 치환', () => {
    expect(sanitizeBundleName('abc\0def')).toBe('abc_def')
  })

  it(': 를 _ 로 치환', () => {
    expect(sanitizeBundleName('C:bundle')).toBe('C_bundle')
  })

  it('비어있으면 _bundle 반환', () => {
    expect(sanitizeBundleName('')).toBe('_bundle')
  })

  it('공백만 있으면 _bundle 반환', () => {
    expect(sanitizeBundleName('   ')).toBe('_bundle')
  })
})

describe('computeBackupDir [순수]', () => {
  it('경로 구조 올바름', () => {
    const result = computeBackupDir('/userData/harness-backups', 'my-bundle', '2026-06-22T10:30:00.000Z')
    expect(result).toContain('my-bundle')
    expect(result).toContain('harness-backups')
    // ':' 가 '-' 로 치환됐는지 확인
    expect(result).not.toContain(':')
    expect(result).toContain('2026-06-22T10-30-00.000Z')
  })

  it('타임스탬프 미지정 시 현재 시각 사용 (결과 반환)', () => {
    const result = computeBackupDir('/userData/harness-backups', 'my-bundle')
    expect(result).toContain('my-bundle')
    expect(result.length).toBeGreaterThan(20)
  })

  it('bundleName 에 / 포함 시 sanitize 됨', () => {
    const result = computeBackupDir('/root', 'bad/name', '2026-01-01T00:00:00.000Z')
    expect(result).not.toContain('bad/name')
    expect(result).toContain('bad_name')
  })
})

describe('restoreIsoTimestamp [순수]', () => {
  it('T 이후 첫 두 - 를 : 로 복원', () => {
    const result = restoreIsoTimestamp('2026-06-22T10-30-00.000Z')
    expect(result).toBe('2026-06-22T10:30:00.000Z')
  })

  it('T 없는 문자열은 그대로 반환', () => {
    const result = restoreIsoTimestamp('20260622')
    expect(result).toBe('20260622')
  })
})

// ─────────────────────────────────────────────
// fs 의존 테스트
// ─────────────────────────────────────────────

describe('backupFiles', () => {
  let base: string
  let bundlePath: string
  let backupDir: string

  beforeAll(async () => {
    base = await fs.mkdtemp(path.join(tmpdir(), 'harness-backup-'))
    bundlePath = path.join(base, 'bundle')
    backupDir = path.join(base, 'backup', '2026-01-01T00-00-00.000Z')
    await fs.mkdir(path.join(bundlePath, '_agents'), { recursive: true })
    await fs.mkdir(path.join(bundlePath, '_hooks'), { recursive: true })
    await fs.writeFile(path.join(bundlePath, '_agents', 'dev.md'), '# dev agent')
    await fs.writeFile(path.join(bundlePath, '_hooks', 'gate.sh'), '#!/bin/bash\nexit 0')
  })

  afterAll(async () => {
    await fs.rm(base, { recursive: true, force: true })
  })

  it('존재하는 파일을 backupDir 에 복사', async () => {
    const backed = await backupFiles(bundlePath, ['_agents/dev.md', '_hooks/gate.sh'], backupDir)
    expect(backed).toContain('_agents/dev.md')
    expect(backed).toContain('_hooks/gate.sh')

    const devContent = await fs.readFile(path.join(backupDir, '_agents', 'dev.md'), 'utf-8')
    expect(devContent).toBe('# dev agent')

    const shContent = await fs.readFile(path.join(backupDir, '_hooks', 'gate.sh'), 'utf-8')
    expect(shContent).toBe('#!/bin/bash\nexit 0')
  })

  it('존재하지 않는 파일 (신규 draft)은 건너뜀', async () => {
    const backed = await backupFiles(
      bundlePath,
      ['_agents/dev.md', '_agents/nonexistent.md'],
      path.join(base, 'backup2')
    )
    expect(backed).toContain('_agents/dev.md')
    expect(backed).not.toContain('_agents/nonexistent.md')
  })
})

describe('listBackupEntries', () => {
  let base: string
  let backupRoot: string
  const bundleName = 'test-bundle'

  beforeAll(async () => {
    base = await fs.mkdtemp(path.join(tmpdir(), 'harness-list-'))
    backupRoot = path.join(base, 'harness-backups')
    const bundleBackupDir = path.join(backupRoot, bundleName)

    // 두 개의 타임스탬프 디렉터리 생성
    const ts1 = '2026-06-22T10-00-00.000Z'
    const ts2 = '2026-06-22T11-00-00.000Z'
    await fs.mkdir(path.join(bundleBackupDir, ts1, '_agents'), { recursive: true })
    await fs.mkdir(path.join(bundleBackupDir, ts2, '_agents'), { recursive: true })
    await fs.writeFile(path.join(bundleBackupDir, ts1, '_agents', 'dev.md'), 'v1')
    await fs.writeFile(path.join(bundleBackupDir, ts2, '_agents', 'dev.md'), 'v2')
  })

  afterAll(async () => {
    await fs.rm(base, { recursive: true, force: true })
  })

  it('최신 백업 우선 정렬 반환', async () => {
    const entries = await listBackupEntries(backupRoot, bundleName)
    expect(entries.length).toBe(2)
    // 최신(ts2) 먼저
    expect(entries[0].createdAt.includes('11')).toBe(true)
    expect(entries[1].createdAt.includes('10')).toBe(true)
  })

  it('파일 목록 포함', async () => {
    const entries = await listBackupEntries(backupRoot, bundleName)
    expect(entries[0].files).toContain('_agents/dev.md')
  })

  it('백업 디렉터리 없으면 빈 배열', async () => {
    const entries = await listBackupEntries(backupRoot, 'no-such-bundle')
    expect(entries).toEqual([])
  })
})

describe('restoreFromBackup', () => {
  let base: string
  let bundlePath: string
  let backupDir: string

  beforeAll(async () => {
    base = await fs.mkdtemp(path.join(tmpdir(), 'harness-restore-'))
    bundlePath = path.join(base, 'bundle')
    backupDir = path.join(base, 'backup')
    await fs.mkdir(path.join(bundlePath, '_agents'), { recursive: true })
    await fs.mkdir(path.join(backupDir, '_agents'), { recursive: true })
    // 원본: modified
    await fs.writeFile(path.join(bundlePath, '_agents', 'dev.md'), '# modified')
    // 백업: original
    await fs.writeFile(path.join(backupDir, '_agents', 'dev.md'), '# original')
  })

  afterAll(async () => {
    await fs.rm(base, { recursive: true, force: true })
  })

  it('백업 파일을 번들 경로로 복원', async () => {
    const restored = await restoreFromBackup(bundlePath, backupDir)
    expect(restored).toContain('_agents/dev.md')

    const content = await fs.readFile(path.join(bundlePath, '_agents', 'dev.md'), 'utf-8')
    expect(content).toBe('# original')
  })
})

describe('getBackupRoot [순수]', () => {
  it('userDataPath 하위 harness-backups 반환', () => {
    const result = getBackupRoot('/user/data')
    expect(result).toBe(path.join('/user/data', 'harness-backups'))
  })
})
