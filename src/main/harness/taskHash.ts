/**
 * Harness Studio — taskHash 계산 (순수 함수)
 *
 * taskHash = sha256(bundleHash + normalizedTaskText)
 *
 * 같은 번들 + 같은 태스크 텍스트 조합이면 동일 해시를 반환해
 * DryRunResult 캐시 키로 활용한다 (ADR-004).
 *
 * normalizeTaskText: 앞뒤 공백 제거 + 연속 공백 단일화.
 * 이 정규화를 거쳐 "   내용  " 과 "내용" 이 같은 태스크로 인식된다.
 */

import { createHash } from 'crypto'
import { CURRENT_SCHEMA_VERSION } from './HarnessCache'

/**
 * 태스크 텍스트를 정규화한다.
 * 앞뒤 공백 제거 및 연속 공백(탭·개행 포함)을 단일 스페이스로 치환.
 *
 * @param taskText - 원본 태스크 텍스트
 * @returns 정규화된 텍스트
 */
export function normalizeTaskText(taskText: string): string {
  return taskText.trim().replace(/\s+/g, ' ')
}

/**
 * bundleHash + normalizedTaskText + 선택적 컨텍스트 서명을 합쳐 SHA-256 해시를 생성한다.
 *
 * 같은 번들(bundleHash)과 같은 태스크 내용이면 동일 값을 반환해
 * Dry-run 결과를 캐시에서 즉시 재사용할 수 있다.
 *
 * projectContextSig 를 지정하면 해시에 포함되어 프로젝트 맥락이 다를 때 캐시가 분리된다.
 * profileSignature(profile) 로 생성한 서명을 사용한다.
 *
 * @param bundleHash - 번들 정규화 캐시 키 (BundleScanner 가 계산)
 * @param taskText - 태스크 설명 평문 (정규화 전 원본 가능)
 * @param projectContextSig - 프로젝트 맥락 서명 (profileSignature 반환값, optional)
 * @returns hex 형식 SHA-256 해시 문자열
 */
export function computeTaskHash(
  bundleHash: string,
  taskText: string,
  projectContextSig?: string
): string {
  const normalized = normalizeTaskText(taskText)
  // schemaVersion 을 해시에 포함 — HarnessModel/triage 스키마가 바뀌면(버전 bump)
  // 같은 번들·태스크라도 해시가 달라져 옛 DryRunResult 캐시가 자동 무효화된다.
  // (bundleHash 는 파일 내용 기반이라 스키마 로직 변경만으로는 바뀌지 않으므로 별도 필요.)
  const hash = createHash('sha256')
    .update(bundleHash)
    .update('\x00')  // 구분자 — bundleHash 와 taskText 가 이어 붙여질 때 충돌 방지
    .update(normalized)
    .update('\x00')
    .update(`schema:${CURRENT_SCHEMA_VERSION}`)
  if (projectContextSig) {
    // 맥락 서명을 포함 — 프로젝트 맥락이 다르면 캐시 분리
    hash.update('\x00').update(`ctx:${projectContextSig}`)
  }
  return hash.digest('hex')
}
