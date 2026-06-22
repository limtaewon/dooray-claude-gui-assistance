/**
 * backup.ts — Harness Studio 편집 백업 유틸리티 (ADR-harness-studio-edit-002)
 *
 * 편집 적용 직전 원본 파일을 다음 경로에 복사한다:
 *   <userData>/harness-backups/<sanitizedBundleName>/<ISO타임스탬프>/<relPath>
 *
 * 설계 목표:
 * - 백업 경로 계산은 순수 함수로 분리해 테스트 가능하게 한다.
 * - 실제 복사(fs 의존)는 `backupFiles` 함수로 격리한다.
 * - `.sh` 는 텍스트로만 복사하며 절대 실행(spawn/exec) 하지 않는다.
 *
 * 제약:
 * - bundleName 에 경로 구분자(`/`, `\`)·null 바이트가 포함되면 치환해 디렉터리 주입을 막는다.
 * - 백업 보존 정책: 초기에는 무제한 + 수동 정리(잔여 결정 §11).
 */

import { promises as fs } from 'fs'
import * as path from 'path'
import type { BackupEntry } from '../../shared/types/harness-edit'

// ─────────────────────────────────────────────
// 백업 루트 경로
// ─────────────────────────────────────────────

/**
 * 백업 루트 디렉터리 절대경로를 반환한다.
 *
 * @param userDataPath - Electron app.getPath('userData')
 * @returns `<userData>/harness-backups`
 */
export function getBackupRoot(userDataPath: string): string {
  return path.join(userDataPath, 'harness-backups')
}

// ─────────────────────────────────────────────
// 번들 이름 sanitize [순수]
// ─────────────────────────────────────────────

/**
 * 번들 이름을 백업 디렉터리명으로 사용 가능하게 sanitize 한다.
 *
 * 경로 구분자(`/`, `\`)·null 바이트·콜론·`..` 시퀀스를 `_` 로 치환한다.
 * 결과가 비어있으면 `_bundle` 을 반환한다.
 *
 * 제약: 반환값은 단일 디렉터리명이다 — 경로 분리자 없음.
 *
 * @param bundleName - 번들 루트 디렉터리 basename (예: 'reined-bmad')
 * @returns sanitize 된 디렉터리명 (예: 'reined-bmad')
 */
export function sanitizeBundleName(bundleName: string): string {
  const sanitized = bundleName
    .replace(/\.\./g, '_')     // '..' 시퀀스 치환 (경로 탈출 방지)
    .replace(/[/\\]/g, '_')    // 경로 구분자 치환
    .replace(/\0/g, '_')       // null 바이트 치환
    .replace(/:/g, '_')        // 콜론 치환 (Windows 드라이브 문자 방지)
    .trim()
  return sanitized || '_bundle'
}

// ─────────────────────────────────────────────
// 백업 디렉터리 경로 계산 [순수]
// ─────────────────────────────────────────────

/**
 * 특정 적용 시점의 백업 디렉터리 절대경로를 계산한다.
 *
 * 경로 형식: `<backupRoot>/<sanitizedBundleName>/<ISO타임스탬프>/`
 *
 * @param backupRoot - getBackupRoot() 반환값
 * @param bundleName - 번들 루트 basename
 * @param timestamp - ISO 8601 타임스탬프 (기본: 호출 시각 `new Date().toISOString()`)
 * @returns 백업 디렉터리 절대경로
 */
export function computeBackupDir(
  backupRoot: string,
  bundleName: string,
  timestamp: string = new Date().toISOString()
): string {
  // ISO 8601 에서 파일 시스템 비허용 문자 `:` 를 `-` 로 치환
  const safeTimestamp = timestamp.replace(/:/g, '-')
  return path.join(backupRoot, sanitizeBundleName(bundleName), safeTimestamp)
}

// ─────────────────────────────────────────────
// 파일 백업 실행
// ─────────────────────────────────────────────

/**
 * 번들 내 지정 파일들을 백업 디렉터리에 복사한다.
 *
 * 처리 순서:
 * 1. 백업 디렉터리 생성 (`mkdir -p`).
 * 2. 각 relPath 에 대해 원본 파일을 읽어 백업 위치에 쓴다.
 *    - 소스 파일이 존재하지 않으면 해당 파일은 건너뛴다 (신규 파일 draft 의 경우).
 * 3. 복사된 relPath 목록과 backupDir 을 반환한다.
 *
 * 제약:
 * - 파일 읽기/쓰기만 수행한다. `.sh` 를 포함해 실행(spawn/exec) 절대 없음.
 *
 * @param bundlePath - 번들 루트 절대경로
 * @param relPaths - 백업할 파일 상대경로 목록
 * @param backupDir - 백업 대상 디렉터리 절대경로 (computeBackupDir 반환값)
 * @returns 실제로 복사된 relPath 목록
 */
export async function backupFiles(
  bundlePath: string,
  relPaths: string[],
  backupDir: string
): Promise<string[]> {
  await fs.mkdir(backupDir, { recursive: true })

  const backed: string[] = []

  for (const relPath of relPaths) {
    const srcPath = path.join(bundlePath, relPath)
    const destPath = path.join(backupDir, relPath)

    // 소스 파일 존재 여부 확인
    let srcExists = false
    try {
      await fs.access(srcPath)
      srcExists = true
    } catch {
      // 신규 파일 draft 의 경우 — 백업할 원본이 없으므로 건너뜀
    }

    if (!srcExists) continue

    // 대상 디렉터리 생성 (relPath 에 하위 디렉터리가 있을 수 있음)
    const destDir = path.dirname(destPath)
    await fs.mkdir(destDir, { recursive: true })

    // 파일 복사 (텍스트/바이너리 공통 — 실행 없음)
    await fs.copyFile(srcPath, destPath)
    backed.push(relPath)
  }

  return backed
}

// ─────────────────────────────────────────────
// 백업 목록 조회
// ─────────────────────────────────────────────

/**
 * 번들에 대한 백업 항목 목록을 최신순으로 반환한다.
 *
 * `<backupRoot>/<sanitizedBundleName>/` 아래의 타임스탬프 디렉터리를 열거한다.
 * 해당 디렉터리가 없으면 빈 배열을 반환한다.
 *
 * @param backupRoot - getBackupRoot() 반환값
 * @param bundleName - 번들 루트 basename
 * @returns BackupEntry[] (최신 백업 우선 정렬)
 */
export async function listBackupEntries(
  backupRoot: string,
  bundleName: string
): Promise<BackupEntry[]> {
  const bundleBackupDir = path.join(backupRoot, sanitizeBundleName(bundleName))

  let timestampDirs: string[]
  try {
    const entries = await fs.readdir(bundleBackupDir, { withFileTypes: true })
    timestampDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch {
    // 백업 디렉터리가 없으면 빈 목록
    return []
  }

  // ISO 8601 타임스탬프 디렉터리명 (`:` → `-` 치환됨) — 내림차순 정렬
  timestampDirs.sort((a, b) => b.localeCompare(a))

  const entries: BackupEntry[] = []

  for (const tsDir of timestampDirs) {
    const backupDir = path.join(bundleBackupDir, tsDir)
    const files = await collectRelPaths(backupDir)

    // 타임스탬프 원복: '-' 로 치환된 ':' 를 복원해 ISO 8601 형식으로
    // 예: '2026-06-22T10-30-00.000Z' → '2026-06-22T10:30:00.000Z'
    // 단, 날짜의 '-' 는 그대로여야 하므로 T 이후 부분만 복원
    const createdAt = restoreIsoTimestamp(tsDir)

    entries.push({
      backupDir,
      createdAt,
      files,
    })
  }

  return entries
}

/**
 * 디렉터리 아래의 모든 파일을 상대경로(POSIX) 로 열거한다.
 * 재귀 탐색.
 */
async function collectRelPaths(baseDir: string): Promise<string[]> {
  const result: string[] = []

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(abs)
      } else if (entry.isFile()) {
        // POSIX 상대경로
        const rel = path.relative(baseDir, abs).split(path.sep).join('/')
        result.push(rel)
      }
    }
  }

  await walk(baseDir)
  return result.sort()
}

/**
 * 파일 시스템 안전 타임스탬프를 ISO 8601 형식으로 복원한다.
 *
 * `computeBackupDir` 에서 `:` → `-` 치환한 것을 역변환한다.
 * T 이후의 시간 부분(HH-mm-ss)에서만 복원한다.
 *
 * 예: '2026-06-22T10-30-00.000Z' → '2026-06-22T10:30:00.000Z'
 *
 * @param safeTimestamp - `:` 가 `-` 로 치환된 타임스탬프 디렉터리명
 * @returns ISO 8601 문자열 (복원 실패 시 입력 그대로)
 */
export function restoreIsoTimestamp(safeTimestamp: string): string {
  // 'T' 이후 부분에서 시간 구분자 '-' 를 ':' 로 복원
  // 날짜 부분의 '-' 는 그대로 유지
  const tIdx = safeTimestamp.indexOf('T')
  if (tIdx < 0) return safeTimestamp

  const datePart = safeTimestamp.slice(0, tIdx)
  const timePart = safeTimestamp.slice(tIdx + 1)

  // 시간 부분: HH-mm-ss.mmmZ 형태에서 처음 두 '-' 를 ':' 로 교체
  const restoredTime = timePart.replace(/-/g, (_, offset) => {
    // 초 미만(밀리초 구분자)은 그대로 '.' 이므로 처음 두 번만 치환
    // 단순하게: timePart 에서 첫 번째, 두 번째 '-' 만 ':' 로
    return offset < 6 ? ':' : '-'
  })

  return `${datePart}T${restoredTime}`
}

// ─────────────────────────────────────────────
// 백업에서 복원
// ─────────────────────────────────────────────

/**
 * 백업 디렉터리에서 번들로 파일을 복원한다.
 *
 * 처리 순서:
 * 1. backupDir 아래의 파일 목록을 열거한다.
 * 2. 각 파일을 번들 루트 하위로 복사한다.
 * 3. 복원된 relPath 목록을 반환한다.
 *
 * 제약:
 * - 파일 복사만 수행. 실행 절대 없음.
 * - backupDir 경로 검증은 호출자(HarnessEditService)가 담당한다.
 *
 * @param bundlePath - 번들 루트 절대경로
 * @param backupDir - 복원 원본 백업 디렉터리 절대경로
 * @returns 복원된 파일 relPath 목록
 */
export async function restoreFromBackup(
  bundlePath: string,
  backupDir: string
): Promise<string[]> {
  const relPaths = await collectRelPaths(backupDir)
  const restored: string[] = []

  for (const relPath of relPaths) {
    const srcPath = path.join(backupDir, relPath)
    const destPath = path.join(bundlePath, relPath)

    const destDir = path.dirname(destPath)
    await fs.mkdir(destDir, { recursive: true })

    await fs.copyFile(srcPath, destPath)
    restored.push(relPath)
  }

  return restored
}
