/**
 * bundleHash.ts — 번들 내용 기반 SHA-256 해시 계산 (순수 함수)
 *
 * bundleHash = SHA-256(정렬된 [상대경로 + mtimeMs + size] 목록 + frontmatter 내용들의 연결)
 *
 * - 파일 추가/수정/삭제 시 해시가 변경되어 캐시를 자동 무효화한다.
 * - 파일 순서에 무관하게 안정적인 해시를 생성한다 (상대경로 기준 정렬).
 * - frontmatter 내용 변경(모델/도구 수정 등)도 즉시 반영된다.
 *
 * ADR-harness-studio-004 (캐시 전략) 참조.
 *
 * 제약: Node.js 내장 crypto 모듈만 사용. 외부 의존 금지.
 */

import { createHash } from 'crypto'

/** 해시 계산에 포함할 파일 엔트리 */
export interface FileHashEntry {
  /** 번들 루트 기준 상대경로 (예: '_agents/reined-bmad-developer.md') */
  relativePath: string
  /** 파일 수정 시각 (ms) */
  mtimeMs: number
  /** 파일 바이트 크기 */
  size: number
  /**
   * frontmatter 원문 — frontmatter 내용 변경 즉시 무효화하기 위해 포함.
   * 없으면 빈 문자열.
   */
  frontmatterRaw: string
}

/**
 * 파일 엔트리 목록으로부터 번들 해시를 계산하여 hex 문자열로 반환한다.
 *
 * 정렬 기준: relativePath 사전 순(locale 무관, byte 순) — 순서 무관 안정.
 * 입력 배열을 변경하지 않는다(새 배열로 정렬).
 *
 * @param entries 번들 내 파일 엔트리 목록 (순서 무관)
 */
export function computeBundleHash(entries: FileHashEntry[]): string {
  // 상대경로 기준 사전순 정렬 — 파일 나열 순서와 무관하게 동일 해시 보장
  const sorted = [...entries].sort((a, b) => {
    if (a.relativePath < b.relativePath) return -1
    if (a.relativePath > b.relativePath) return 1
    return 0
  })

  const hash = createHash('sha256')

  for (const entry of sorted) {
    // 각 파일을 구분자(\0)로 분리하여 연결 — 경계 충돌 방지
    hash.update(entry.relativePath)
    hash.update('\0')
    hash.update(String(entry.mtimeMs))
    hash.update('\0')
    hash.update(String(entry.size))
    hash.update('\0')
    hash.update(entry.frontmatterRaw)
    hash.update('\0\0') // 파일 간 구분자 (이중)
  }

  return hash.digest('hex')
}

// taskHash 계산은 taskHash.ts 로 일원화됨 (schemaVersion 포함, ADR-004).
// 이 파일에서의 computeTaskHash 중복 export 는 제거함 — import 는 './taskHash' 를 사용할 것.
