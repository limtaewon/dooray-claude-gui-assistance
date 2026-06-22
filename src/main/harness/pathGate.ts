/**
 * pathGate — Harness Studio 경로 화이트리스트 게이트 (순수 함수)
 *
 * 보안 목적:
 * - 악성/손상 renderer 가 임의 경로(예: ~/.ssh)를 BundleScanner 나 AI 에 넘기는 것을 막는다.
 * - "사용자가 명시 선택하지 않은 경로의 silent AI 전송" 을 차단한다.
 * - 차단이 아닌 "명시적 등록 없이는 AI 전송 불가" 원칙 구현.
 *
 * 허용 루트 (두 가지):
 * 1. ~/.claude/skills 하위 경로 — 자동 발견 경로이므로 항상 허용.
 * 2. 세션 allowlist 에 등록된 경로 — 다이얼로그 반환값 또는 drag-drop 경로를
 *    scan 시 allowlist 에 등록하고, normalize/dryrun/explain 은 등록된 경로만 허용.
 *
 * 검증 흐름:
 * 1. path.resolve 로 절대 경로 정규화.
 * 2. fs.realpath 로 심링크 해소 — 심링크를 통한 허용 루트 탈출 방지.
 * 3. 허용 루트 prefix 검사 (path.relative 가 ".." 로 시작하지 않는지).
 *
 * 참조: arch.md §8 — "dialog 또는 ~/.claude/skills 자동 발견만"
 */

import { promises as fs } from 'fs'
import * as nodePath from 'path'
import { homedir } from 'os'

// ─────────────────────────────────────────────────────────────────────────────
// 도메인 에러
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 허용되지 않은 경로를 접근하려 할 때 throw 되는 도메인 에러.
 *
 * 제약:
 * - path 필드에는 원본 경로 문자열을 포함한다 (진단 목적).
 * - 사용자에게 노출되는 메시지와 내부 식별자를 분리한다.
 */
export class HarnessPathDeniedError extends Error {
  readonly code = 'HARNESS_PATH_DENIED'
  /**
   * @param deniedPath - 거부된 원본 경로 (진단 목적, 로그 전용)
   * @param reason - 거부 사유 상세 (cliLogger/console 로만 출력. renderer 로 노출 금지)
   * @param userMessage - 사용자에게 보여줄 일반화된 메시지 (기본: 일반 문구)
   */
  constructor(
    /** 거부된 원본 경로 (진단 목적, 절대경로/허용루트 포함 — 로그 전용) */
    readonly deniedPath: string,
    /** 거부 사유 상세 (로그 전용, renderer 노출 금지) */
    readonly internalReason: string,
    /** 사용자에게 보여줄 일반화된 메시지 */
    userMessage: string = '파일 접근이 거부됐습니다. 허용된 번들 폴더 내 파일만 편집할 수 있습니다.'
  ) {
    super(userMessage)
    this.name = 'HarnessPathDeniedError'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 허용 루트 계산
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ~/.claude/skills 절대경로를 반환한다.
 * 테스트 재정의를 위해 함수로 분리.
 */
export function getSkillsRoot(): string {
  return nodePath.join(homedir(), '.claude', 'skills')
}

// ─────────────────────────────────────────────────────────────────────────────
// 핵심 검증 함수
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 주어진 경로가 허용 루트 중 하나의 하위 경로인지 검사한다.
 *
 * 심링크 해소 후 허용 루트 prefix 를 검사하므로
 * 심링크를 통한 허용 루트 탈출을 막는다.
 *
 * @param resolvedPath - realpath 로 심링크 해소된 절대 경로
 * @param allowedRoots - 허용 루트 절대 경로 배열 (realpath 적용 완료)
 * @returns 허용 여부
 */
export function isUnderAllowedRoot(resolvedPath: string, allowedRoots: string[]): boolean {
  for (const root of allowedRoots) {
    const rel = nodePath.relative(root, resolvedPath)
    // rel 이 ".." 로 시작하지 않으면 root 하위 경로 (또는 root 자체)
    if (!rel.startsWith('..') && !nodePath.isAbsolute(rel)) {
      return true
    }
  }
  return false
}

/**
 * 경로를 검증한다. 허용 루트 하위가 아니면 HarnessPathDeniedError 를 throw.
 *
 * 처리 순서:
 * 1. path.resolve 로 절대 경로 정규화.
 * 2. fs.realpath 로 심링크 해소 (심링크 탈출 방지).
 * 3. isUnderAllowedRoot 로 허용 루트 prefix 검사.
 * 4. 거부 시 HarnessPathDeniedError throw.
 *
 * @param inputPath - 검증할 경로 (절대/상대 무관)
 * @param allowedRoots - 허용 루트 절대 경로 배열 (이미 resolve 된 값)
 * @returns 심링크 해소된 절대 경로 (통과 시)
 * @throws HarnessPathDeniedError — 미허용 경로
 */
export async function assertPathAllowed(
  inputPath: string,
  allowedRoots: string[]
): Promise<string> {
  const resolved = nodePath.resolve(inputPath)

  let realResolved: string
  try {
    realResolved = await fs.realpath(resolved)
  } catch {
    // realpath 실패 = 경로 존재하지 않음 또는 접근 불가 — 보수적으로 거부
    throw new HarnessPathDeniedError(
      inputPath,
      `realpath 실패 — 경로 존재하지 않거나 접근 불가: ${resolved}`
    )
  }

  if (!isUnderAllowedRoot(realResolved, allowedRoots)) {
    throw new HarnessPathDeniedError(
      inputPath,
      `허용 루트 외부 경로: ${realResolved} (허용: ${allowedRoots.join(', ')})`
    )
  }

  return realResolved
}

// ─────────────────────────────────────────────────────────────────────────────
// 쓰기 경로 게이트 (ADR-harness-studio-edit-002)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 쓰기가 허용된 확장자 화이트리스트.
 *
 * `.md`/`.sh`/`.txt`/`VERSION` 만 허용한다.
 * 실행 파일·바이너리·임의 설정 파일 쓰기를 막아 신뢰경계를 최소화한다.
 *
 * 확장자 없는 파일은 basename 으로 직접 비교한다 (`VERSION`).
 */
const WRITABLE_EXTENSIONS = new Set(['.md', '.sh', '.txt'])
const WRITABLE_BASENAMES = new Set(['VERSION'])

/**
 * 주어진 파일 상대경로의 확장자 또는 basename 이 화이트리스트에 있는지 검사한다.
 *
 * @param relPath - 번들 루트 기준 상대경로
 * @returns 허용 여부
 */
export function isWritableExtension(relPath: string): boolean {
  const ext = nodePath.extname(relPath).toLowerCase()
  if (ext) return WRITABLE_EXTENSIONS.has(ext)
  return WRITABLE_BASENAMES.has(nodePath.basename(relPath))
}

/**
 * 번들 루트 하위 파일에 대한 쓰기 경로를 검증한다.
 *
 * 모든 조건을 통과해야 검증된 절대경로를 반환한다. 하나라도 실패하면 throw.
 *
 * 검증 단계:
 * 1. `relPath` 에 `..` 세그먼트 포함 여부 확인 — 디렉터리 탈출 차단.
 * 2. 확장자 화이트리스트 검사 (`.md`/`.sh`/`.txt`/`VERSION`).
 * 3. 대상 절대경로 계산:
 *    - 파일이 이미 존재하면 `fs.realpath` 로 심링크 해소.
 *    - 신규 파일(존재하지 않으면) 부모 디렉터리를 `fs.realpath` 로 해소.
 * 4. 해소된 경로가 bundleRoot 하위인지 검사 — 심링크 탈출 차단.
 *
 * 제약:
 * - bundleRoot 는 이미 기존 읽기 게이트(assertPathAllowed)를 통과한 realpath 절대경로여야 한다.
 * - `.sh` 는 텍스트 파일로 쓰기만 허용한다. 실행(spawn/exec)은 이 함수 바깥에서도 절대 금지.
 *
 * @param bundleRoot - 번들 루트 realpath 절대경로 (읽기 게이트 통과 완료)
 * @param relPath - 번들 루트 기준 POSIX 상대경로 (쓰려는 파일)
 * @returns 검증된 대상 절대경로 (심링크 해소 완료)
 * @throws HarnessPathDeniedError — 검증 실패 시
 */
export async function assertWritablePath(bundleRoot: string, relPath: string): Promise<string> {
  // 0. 절대경로 명시 거부 — relPath 는 번들 루트 기준 상대경로여야 한다.
  //    POSIX 절대(/로 시작) 및 Windows 드라이브(C:\, D:/ 등) 모두 거부.
  if (nodePath.isAbsolute(relPath) || /^[A-Za-z]:/.test(relPath)) {
    throw new HarnessPathDeniedError(
      relPath,
      `절대경로는 허용되지 않습니다 (상대경로만 허용): ${relPath}`,
      '허용된 번들 폴더 내 상대경로만 편집할 수 있습니다.'
    )
  }

  // 1. '..' 세그먼트 포함 거부 — 디렉터리 탈출 차단.
  //    Windows backslash (\) 경로도 처리하기 위해 먼저 슬래시로 정규화.
  //    posix.normalize 와 win32.normalize 양쪽 모두 적용해 숨겨진 '..' 탐지.
  const slashNormalized = relPath.replace(/\\/g, '/')
  const posixNorm = nodePath.posix.normalize(slashNormalized)
  const win32Norm = nodePath.win32.normalize(relPath)

  const posixSegments = posixNorm.split('/')
  const win32Segments = win32Norm.split(/[\\/]/)

  if (
    posixSegments.some((seg) => seg === '..') ||
    win32Segments.some((seg) => seg === '..')
  ) {
    throw new HarnessPathDeniedError(
      relPath,
      `경로에 '..' 세그먼트 포함 — 디렉터리 탈출 시도: ${relPath}`,
      '허용된 번들 폴더 내 파일만 편집할 수 있습니다.'
    )
  }

  // 2. 확장자 화이트리스트 검사
  if (!isWritableExtension(relPath)) {
    const ext = nodePath.extname(relPath) || '(없음)'
    throw new HarnessPathDeniedError(
      relPath,
      `허용되지 않은 확장자: ${ext} — 허용: .md/.sh/.txt/VERSION`,
      `.md/.sh/.txt/VERSION 형식의 파일만 편집할 수 있습니다.`
    )
  }

  // 3. 대상 절대경로 계산 + 심링크 해소
  const absTarget = nodePath.join(bundleRoot, relPath)
  let resolvedTarget: string

  let targetExists: boolean
  try {
    await fs.access(absTarget)
    targetExists = true
  } catch {
    targetExists = false
  }

  if (targetExists) {
    // 기존 파일 — realpath 로 심링크 해소
    try {
      resolvedTarget = await fs.realpath(absTarget)
    } catch {
      throw new HarnessPathDeniedError(
        relPath,
        `realpath 실패 — 접근 불가: ${absTarget}`,
        '파일에 접근할 수 없습니다.'
      )
    }
  } else {
    // 신규 파일 — 부모 디렉터리를 realpath 로 해소한 뒤 파일명 결합
    const parentDir = nodePath.dirname(absTarget)
    let resolvedParent: string
    try {
      resolvedParent = await fs.realpath(parentDir)
    } catch {
      throw new HarnessPathDeniedError(
        relPath,
        `부모 디렉터리 realpath 실패 — 존재하지 않거나 접근 불가: ${parentDir}`,
        '대상 디렉터리가 존재하지 않습니다.'
      )
    }
    resolvedTarget = nodePath.join(resolvedParent, nodePath.basename(absTarget))
  }

  // 4. bundleRoot 하위인지 검사 — 심링크 탈출 차단
  if (!isUnderAllowedRoot(resolvedTarget, [bundleRoot])) {
    throw new HarnessPathDeniedError(
      relPath,
      `번들 루트 외부 경로 (심링크 탈출 의심): ${resolvedTarget} (루트: ${bundleRoot})`,
      '허용된 번들 폴더 내 파일만 편집할 수 있습니다.'
    )
  }

  return resolvedTarget
}

// ─────────────────────────────────────────────────────────────────────────────
// 세션 Allowlist (HarnessService 가 소유)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 세션 단위 경로 allowlist.
 *
 * 다이얼로그 반환값 또는 drag-drop 경로를 scan 시점에 등록하고,
 * normalize/dryrun/explain 은 등록된 경로 또는 skills 하위만 허용한다.
 *
 * 제약:
 * - 세션 종료(앱 재시작) 시 초기화된다.
 * - 등록은 scan 시점에만 이루어진다 (renderer 가 직접 등록 불가).
 */
export class PathAllowlist {
  /**
   * scan 시 등록된 경로 집합 (realpath 해소된 절대 경로).
   * skills 루트 하위는 이 집합 없이도 항상 허용된다.
   */
  private readonly registered: Set<string> = new Set()

  /**
   * 경로를 allowlist 에 등록한다.
   * scan 핸들러가 다이얼로그/drop 경로를 성공적으로 처리한 후 호출한다.
   *
   * @param realPath - realpath 로 심링크 해소된 절대 경로
   */
  register(realPath: string): void {
    this.registered.add(realPath)
  }

  /**
   * 경로가 allowlist 에 등록되어 있는지 확인한다.
   *
   * @param realPath - 확인할 절대 경로
   */
  has(realPath: string): boolean {
    return this.registered.has(realPath)
  }

  /**
   * 등록된 경로 배열을 반환한다 (skills 루트 포함).
   *
   * @param skillsRoot - ~/.claude/skills 절대경로
   * @returns 허용 루트 배열 (검증 함수에 전달용)
   */
  toAllowedRoots(skillsRoot: string): string[] {
    return [skillsRoot, ...this.registered]
  }
}
