/**
 * draftReducer.ts — HarnessDraft in-memory 누적 리듀서
 *
 * HarnessDraft 를 React useReducer 또는 plain 함수 체이닝으로 관리하기 위한
 * 순수 함수 모음. 모든 함수는 불변(immutable) 방식으로 새 draft 를 반환한다.
 *
 * 설계 근거 (arch.md §1.3):
 * - 한 파일(relPath)에 대한 편집은 항상 최신 1건만 유지.
 * - baseContent(최초 스냅샷)는 불변. 재편집 시 draftContent 만 갱신.
 * - 되돌리기(revert)는 해당 relPath 항목을 edits 에서 제거.
 * - 충돌(stale): baseContent sha256 ≠ 현재 디스크 sha 를 main 이 감지하면
 *   renderer 가 이 플래그를 draft 에 표시 — UI 가 적용 버튼을 비활성화하는 데 사용.
 *
 * 제약:
 * - 이 파일은 순수 함수만 담는다. electron / Node fs / React / crypto 의존 금지.
 * - editedAt(ISO 8601 생성)은 주입 가능한 파라미터(테스트에서 고정값 사용).
 * - HarnessDraft 타입은 src/shared/types/harness-edit.ts 에서 import.
 */

import type { HarnessDraft, DraftFileEdit } from '@shared/types/harness-edit'

// ─────────────────────────────────────────────
// 액션 타입 (useReducer 호환)
// ─────────────────────────────────────────────

/** draft 에 단일 파일 편집을 추가하거나 갱신한다 */
export interface AddOrUpdateAction {
  type: 'ADD_OR_UPDATE'
  /** 추가/갱신할 편집 데이터. relPath 가 키로 사용된다 */
  edit: DraftFileEdit
}

/** 특정 relPath 편집을 취소(제거)한다 */
export interface RevertAction {
  type: 'REVERT'
  relPath: string
}

/** 모든 편집을 초기화한다 */
export interface ResetAction {
  type: 'RESET'
}

/**
 * main 이 STALE 감지 결과를 renderer 에 반환했을 때
 * 해당 파일의 충돌 상태를 draft 에 표시한다.
 * UI 가 "외부 변경 충돌" 배지를 표시하고 적용 버튼을 비활성화한다.
 */
export interface MarkStaleAction {
  type: 'MARK_STALE'
  /** 충돌 상태로 표시할 파일 상대경로 목록 */
  stalePaths: string[]
}

/** 드래프트 적용 성공 후 edits 를 비운다 (bundleHash 는 새 값으로 갱신) */
export interface ClearAfterApplyAction {
  type: 'CLEAR_AFTER_APPLY'
  /** 적용 후 재스캔으로 갱신된 새 bundleHash */
  newBundleHash: string
}

export type DraftAction =
  | AddOrUpdateAction
  | RevertAction
  | ResetAction
  | MarkStaleAction
  | ClearAfterApplyAction

// ─────────────────────────────────────────────
// 충돌 표시를 위한 확장 내부 타입
// ─────────────────────────────────────────────

/**
 * DraftFileEdit 에 stale 플래그를 추가한 내부 확장.
 * HarnessDraft.edits 에 저장되는 실제 런타임 타입.
 * DraftFileEdit 를 그대로 확장하므로 IPC 전송 전 stale 필드를 제거하지 않아도 된다
 * (main 이 stale 여부를 독립적으로 검증하므로).
 */
export interface DraftFileEditWithStale extends DraftFileEdit {
  /**
   * main 의 HARNESS_DIFF_DRAFT 가 반환한 stale 감지 결과.
   * true 이면 이 파일은 외부에서 변경됐으므로 적용(apply) 불가.
   */
  stale?: boolean
}

// ─────────────────────────────────────────────
// 핵심 순수 함수
// ─────────────────────────────────────────────

/**
 * 빈 HarnessDraft 를 생성한다.
 *
 * @param bundlePath  대상 번들 루트 절대경로
 * @param baseBundleHash  현재 bundleHash (HARNESS_SCAN/HARNESS_NORMALIZE 응답에서 가져옴)
 */
export function createEmptyDraft(bundlePath: string, baseBundleHash: string): HarnessDraft {
  return {
    bundlePath,
    baseBundleHash,
    edits: {},
  }
}

/**
 * DraftFileEdit 를 draft 에 추가하거나 같은 relPath 의 기존 편집을 갱신한다.
 *
 * 규칙:
 * - relPath 가 처음 등장 → baseContent 와 함께 신규 추가.
 * - relPath 가 이미 있음 → draftContent / origin / fieldPath / aiCommand / editedAt 갱신.
 *   baseContent 는 최초 스냅샷을 유지한다(충돌 감지 기준 불변).
 *
 * @param draft   현재 draft (변경하지 않음)
 * @param edit    새 편집 데이터
 * @returns       새 draft
 */
export function addOrUpdateEdit(draft: HarnessDraft, edit: DraftFileEdit): HarnessDraft {
  const existing = draft.edits[edit.relPath]
  const newEdit: DraftFileEditWithStale = existing
    ? {
        // baseContent 는 최초 스냅샷 유지
        ...edit,
        baseContent: existing.baseContent,
        stale: undefined, // 재편집 시 stale 플래그 초기화
      }
    : { ...edit, stale: undefined }

  return {
    ...draft,
    edits: {
      ...draft.edits,
      [edit.relPath]: newEdit,
    },
  }
}

/**
 * 특정 relPath 의 편집을 취소(되돌리기)한다.
 * relPath 가 draft 에 없으면 draft 를 그대로 반환(no-op).
 *
 * @param draft   현재 draft
 * @param relPath 취소할 파일 상대경로
 * @returns       해당 편집이 제거된 새 draft
 */
export function revertEdit(draft: HarnessDraft, relPath: string): HarnessDraft {
  if (!(relPath in draft.edits)) return draft
  const { [relPath]: _removed, ...rest } = draft.edits
  return { ...draft, edits: rest }
}

/**
 * draft 의 모든 편집을 초기화한다.
 * bundlePath / baseBundleHash 는 유지한다.
 *
 * @param draft 현재 draft
 * @returns     edits 가 비어있는 새 draft
 */
export function resetDraft(draft: HarnessDraft): HarnessDraft {
  return { ...draft, edits: {} }
}

/**
 * 특정 파일들에 충돌(stale) 플래그를 표시한다.
 *
 * main 의 HARNESS_DIFF_DRAFT 응답에서 stale=true 인 파일 목록을 받아
 * draft 에 반영한다. 해당 파일의 DraftFileEdit.stale 을 true 로 설정한다.
 * draft 에 없는 relPath 는 무시한다.
 *
 * @param draft      현재 draft
 * @param stalePaths stale 로 표시할 파일 상대경로 배열
 * @returns          stale 필드가 업데이트된 새 draft
 */
export function markStale(draft: HarnessDraft, stalePaths: string[]): HarnessDraft {
  if (stalePaths.length === 0) return draft
  const newEdits = { ...draft.edits }
  for (const rp of stalePaths) {
    if (rp in newEdits) {
      newEdits[rp] = { ...(newEdits[rp] as DraftFileEditWithStale), stale: true }
    }
  }
  return { ...draft, edits: newEdits }
}

/**
 * 적용 성공 후 편집 목록을 비우고 bundleHash 를 갱신한다.
 *
 * @param draft         현재 draft
 * @param newBundleHash 재스캔으로 갱신된 새 bundleHash
 * @returns             edits={} + 새 bundleHash 로 갱신된 draft
 */
export function clearAfterApply(draft: HarnessDraft, newBundleHash: string): HarnessDraft {
  return {
    ...draft,
    baseBundleHash: newBundleHash,
    edits: {},
  }
}

/**
 * draft 에 충돌 파일이 1건 이상 있는지 여부를 반환한다.
 * ApplyDialog 에서 적용 버튼 비활성화 조건으로 사용한다.
 */
export function hasStaleEdits(draft: HarnessDraft): boolean {
  return Object.values(draft.edits).some((e) => (e as DraftFileEditWithStale).stale === true)
}

/**
 * draft 에 편집이 1건 이상 있는지 여부를 반환한다.
 * HarnessStudioView 헤더의 "변경 N개" 배지 표시 조건.
 */
export function hasEdits(draft: HarnessDraft): boolean {
  return Object.keys(draft.edits).length > 0
}

/**
 * draft 의 편집 건수를 반환한다.
 */
export function editCount(draft: HarnessDraft): number {
  return Object.keys(draft.edits).length
}

// ─────────────────────────────────────────────
// useReducer 호환 리듀서
// ─────────────────────────────────────────────

/**
 * React useReducer 에 바로 전달할 수 있는 순수 리듀서 함수.
 *
 * 사용 예:
 * ```tsx
 * const [draft, dispatch] = useReducer(draftReducer, createEmptyDraft(bundlePath, hash))
 * dispatch({ type: 'ADD_OR_UPDATE', edit: { ... } })
 * ```
 *
 * @param state  현재 draft
 * @param action 액션
 * @returns      새 draft
 */
export function draftReducer(state: HarnessDraft, action: DraftAction): HarnessDraft {
  switch (action.type) {
    case 'ADD_OR_UPDATE':
      return addOrUpdateEdit(state, action.edit)
    case 'REVERT':
      return revertEdit(state, action.relPath)
    case 'RESET':
      return resetDraft(state)
    case 'MARK_STALE':
      return markStale(state, action.stalePaths)
    case 'CLEAR_AFTER_APPLY':
      return clearAfterApply(state, action.newBundleHash)
    default:
      return state
  }
}
