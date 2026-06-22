/**
 * draftDiff.ts — draft ↔ 디스크 diff 요약 계산 [순수함수]
 *
 * HarnessDraft 의 각 DraftFileEdit 에 대해:
 * - baseContent ↔ draftContent 줄 수 변경량 계산 (단순 라인 카운트)
 * - 디스크 현재 내용(sha256) ↔ baseContent(sha256) 불일치 감지 (STALE 판정)
 *
 * 설계 목표:
 * - 모든 핵심 로직은 순수 함수로 분리해 vitest 에서 fs 없이 테스트 가능.
 * - sha 계산은 Node.js `crypto` 만 사용 (electron 의존 없음).
 * - STALE 판정에 사용되는 `diskContent` 는 호출자(HarnessEditService)가 읽어서 주입한다.
 *
 * 제약:
 * - 이 파일은 fs/electron 의존 없음. 모든 함수는 순수하게 인수로 받은 문자열만 처리.
 */

import { createHash } from 'crypto'
import type { HarnessDraft, DraftDiffSummary, FileDiffSummary } from '../../shared/types/harness-edit'

// ─────────────────────────────────────────────
// sha256 헬퍼 [순수]
// ─────────────────────────────────────────────

/**
 * 문자열의 sha256 hex 다이제스트를 반환한다.
 *
 * STALE 판정에서 baseContent ↔ diskContent 를 비교할 때 사용한다.
 * 빈 문자열도 정상 처리된다(신규 파일 draft 의 baseContent='').
 *
 * @param content - 해시 대상 문자열
 * @returns sha256 hex 문자열
 */
export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex')
}

// ─────────────────────────────────────────────
// 단일 파일 diff 계산 [순수]
// ─────────────────────────────────────────────

/**
 * baseContent 와 draftContent 를 비교해 변경/추가/삭제 줄 수를 계산한다.
 *
 * 알고리즘: 간단한 라인 카운트 비교 (LCS diff 아님).
 * - changedLines: min(baseLines, draftLines) 중 실제로 다른 줄 수
 * - addedLines: max(0, draftLines - baseLines)
 * - removedLines: max(0, baseLines - draftLines)
 *
 * 정밀한 diff(LCS)는 Monaco DiffEditor 가 담당하므로
 * 이 함수는 "대략적인 변경 규모" 표시 용도로만 사용한다.
 *
 * @param baseContent - 원본 파일 내용
 * @param draftContent - 제안하는 새 내용
 * @returns { changedLines, addedLines, removedLines }
 */
export function computeLineDiff(
  baseContent: string,
  draftContent: string
): { changedLines: number; addedLines: number; removedLines: number } {
  // 빈 파일도 정상 처리 (신규 파일이나 전체 삭제 draft)
  const baseLines = baseContent ? baseContent.split('\n') : []
  const draftLines = draftContent ? draftContent.split('\n') : []

  const minLen = Math.min(baseLines.length, draftLines.length)

  // 공통 구간에서 실제로 다른 줄 수 계산
  let changedLines = 0
  for (let i = 0; i < minLen; i++) {
    if (baseLines[i] !== draftLines[i]) changedLines++
  }

  const addedLines = Math.max(0, draftLines.length - baseLines.length)
  const removedLines = Math.max(0, baseLines.length - draftLines.length)

  return { changedLines, addedLines, removedLines }
}

/**
 * 단일 파일에 대한 FileDiffSummary 를 계산한다.
 *
 * @param relPath - 번들 루트 기준 상대경로
 * @param baseContent - DraftFileEdit.baseContent (draft 생성 시 스냅샷)
 * @param draftContent - DraftFileEdit.draftContent (제안하는 새 내용)
 * @param diskContent - 현재 디스크 파일 내용 (STALE 판정 기준). 파일이 없으면 빈 문자열.
 * @returns FileDiffSummary
 */
export function computeFileDiffSummary(
  relPath: string,
  baseContent: string,
  draftContent: string,
  diskContent: string
): FileDiffSummary {
  const { changedLines, addedLines, removedLines } = computeLineDiff(baseContent, draftContent)

  // STALE: 디스크 현재 sha ≠ baseContent sha → 외부 편집 감지
  const baseSha = sha256(baseContent)
  const diskSha = sha256(diskContent)
  const stale = baseSha !== diskSha

  // 신규 파일: baseContent 가 빈 문자열
  const isNew = baseContent === ''

  return {
    relPath,
    changedLines,
    addedLines,
    removedLines,
    stale,
    isNew,
  }
}

// ─────────────────────────────────────────────
// 전체 draft diff 요약 계산 [순수]
// ─────────────────────────────────────────────

/**
 * HarnessDraft 전체에 대한 DraftDiffSummary 를 계산한다.
 *
 * 호출자는 각 relPath 에 해당하는 diskContent 를 맵으로 전달한다.
 * 파일이 디스크에 없으면(신규 파일 draft) diskContent 를 빈 문자열로 주입한다.
 *
 * @param draft - 편집 세션 draft
 * @param diskContents - relPath → 현재 디스크 파일 내용 맵 (존재하지 않는 파일은 빈 문자열)
 * @returns DraftDiffSummary
 */
export function computeDraftDiffSummary(
  draft: HarnessDraft,
  diskContents: Record<string, string>
): DraftDiffSummary {
  const files: FileDiffSummary[] = []

  for (const [relPath, fileEdit] of Object.entries(draft.edits)) {
    const diskContent = diskContents[relPath] ?? ''
    const summary = computeFileDiffSummary(
      relPath,
      fileEdit.baseContent,
      fileEdit.draftContent,
      diskContent
    )
    files.push(summary)
  }

  const hasStale = files.some((f) => f.stale)
  const hasShellEdit = files.some((f) => f.relPath.endsWith('.sh'))

  return { files, hasStale, hasShellEdit }
}
