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
  constructor(
    /** 거부된 원본 경로 */
    readonly deniedPath: string,
    /** 거부 사유 (로그 전용, 사용자 노출 최소화) */
    reason: string
  ) {
    super(`경로 접근 거부: ${reason}`)
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
    throw new HarnessPathDeniedError(inputPath, `realpath 실패 — 경로 존재하지 않거나 접근 불가: ${resolved}`)
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
