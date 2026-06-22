/**
 * draftReducer.test.ts — draft 순수 리듀서 테스트
 *
 * 검증:
 * 1. createEmptyDraft: 빈 draft 초기화
 * 2. addOrUpdateEdit: 신규 추가 / 같은 파일 재편집(baseContent 유지, draftContent 갱신)
 * 3. revertEdit: 특정 파일 편집 취소 / 없는 경로 no-op
 * 4. resetDraft: 전체 초기화 (bundlePath/baseBundleHash 유지)
 * 5. markStale: stale 표시 / 없는 경로 무시
 * 6. clearAfterApply: edits 초기화 + bundleHash 갱신
 * 7. hasEdits / hasStaleEdits / editCount 유틸
 * 8. draftReducer: useReducer 호환 액션 처리
 */

import { describe, it, expect } from 'vitest'
import {
  createEmptyDraft,
  addOrUpdateEdit,
  revertEdit,
  resetDraft,
  markStale,
  clearAfterApply,
  hasEdits,
  hasStaleEdits,
  editCount,
  draftReducer,
} from '../draftReducer'
import type { DraftFileEdit } from '@shared/types/harness-edit'

// ─────────────────────────────────────────────
// 픽스처 빌더
// ─────────────────────────────────────────────

const BUNDLE_PATH = '/path/to/reined-fixture'
const BASE_HASH = 'hash-v1'

function makeEdit(
  relPath: string,
  baseContent: string,
  draftContent: string,
  origin: DraftFileEdit['origin'] = 'form',
): DraftFileEdit {
  return {
    relPath,
    baseContent,
    draftContent,
    origin,
    editedAt: '2026-06-22T00:00:00.000Z',
  }
}

// ─────────────────────────────────────────────
// createEmptyDraft
// ─────────────────────────────────────────────

describe('createEmptyDraft', () => {
  it('bundlePath / baseBundleHash 가 설정된 빈 draft 를 반환한다', () => {
    const draft = createEmptyDraft(BUNDLE_PATH, BASE_HASH)
    expect(draft.bundlePath).toBe(BUNDLE_PATH)
    expect(draft.baseBundleHash).toBe(BASE_HASH)
    expect(draft.edits).toEqual({})
  })
})

// ─────────────────────────────────────────────
// addOrUpdateEdit
// ─────────────────────────────────────────────

describe('addOrUpdateEdit', () => {
  it('새 파일 편집을 추가한다', () => {
    const draft = createEmptyDraft(BUNDLE_PATH, BASE_HASH)
    const edit = makeEdit(
      '_agents/developer.md',
      '---\nmodel: sonnet\n---\n',
      '---\nmodel: opus\n---\n',
    )
    const next = addOrUpdateEdit(draft, edit)
    expect(Object.keys(next.edits)).toHaveLength(1)
    expect(next.edits['_agents/developer.md']).toBeDefined()
    expect(next.edits['_agents/developer.md'].draftContent).toContain('opus')
  })

  it('같은 relPath 재편집 시 draftContent 를 갱신하고 baseContent 는 최초 스냅샷을 유지한다', () => {
    const draft = createEmptyDraft(BUNDLE_PATH, BASE_HASH)
    const edit1 = makeEdit(
      '_agents/developer.md',
      '---\nmodel: sonnet\n---\n',
      '---\nmodel: opus\n---\n',
    )
    const edit2 = makeEdit(
      '_agents/developer.md',
      '---\nmodel: opus\n---\n',    // 이 baseContent 는 무시됨
      '---\nmodel: haiku\n---\n',
    )

    const after1 = addOrUpdateEdit(draft, edit1)
    const after2 = addOrUpdateEdit(after1, edit2)

    // draftContent 는 최신값
    expect(after2.edits['_agents/developer.md'].draftContent).toContain('haiku')
    // baseContent 는 최초 스냅샷 유지
    expect(after2.edits['_agents/developer.md'].baseContent).toContain('sonnet')
  })

  it('여러 파일 편집을 독립적으로 추가할 수 있다', () => {
    let draft = createEmptyDraft(BUNDLE_PATH, BASE_HASH)
    draft = addOrUpdateEdit(draft, makeEdit('file1.md', 'a', 'b'))
    draft = addOrUpdateEdit(draft, makeEdit('file2.md', 'c', 'd'))
    expect(Object.keys(draft.edits)).toHaveLength(2)
    expect(draft.edits['file1.md'].draftContent).toBe('b')
    expect(draft.edits['file2.md'].draftContent).toBe('d')
  })

  it('재편집 시 origin 과 fieldPath 를 새 값으로 갱신한다', () => {
    let draft = createEmptyDraft(BUNDLE_PATH, BASE_HASH)
    draft = addOrUpdateEdit(
      draft,
      makeEdit('_agents/developer.md', 'base', 'v1', 'form'),
    )
    const edit2: DraftFileEdit = {
      relPath: '_agents/developer.md',
      baseContent: 'base',
      draftContent: 'v2',
      origin: 'raw',
      editedAt: '2026-06-22T01:00:00.000Z',
    }
    draft = addOrUpdateEdit(draft, edit2)
    expect(draft.edits['_agents/developer.md'].origin).toBe('raw')
    expect(draft.edits['_agents/developer.md'].draftContent).toBe('v2')
  })
})

// ─────────────────────────────────────────────
// revertEdit
// ─────────────────────────────────────────────

describe('revertEdit', () => {
  it('특정 파일 편집을 취소(제거)한다', () => {
    let draft = createEmptyDraft(BUNDLE_PATH, BASE_HASH)
    draft = addOrUpdateEdit(draft, makeEdit('file1.md', 'a', 'b'))
    draft = addOrUpdateEdit(draft, makeEdit('file2.md', 'c', 'd'))
    const next = revertEdit(draft, 'file1.md')
    expect(Object.keys(next.edits)).toHaveLength(1)
    expect(next.edits['file1.md']).toBeUndefined()
    expect(next.edits['file2.md']).toBeDefined()
  })

  it('없는 relPath 는 no-op(동일 draft 반환)이다', () => {
    const draft = createEmptyDraft(BUNDLE_PATH, BASE_HASH)
    const next = revertEdit(draft, 'nonexistent.md')
    expect(next).toBe(draft)
  })
})

// ─────────────────────────────────────────────
// resetDraft
// ─────────────────────────────────────────────

describe('resetDraft', () => {
  it('모든 편집을 초기화하고 bundlePath / baseBundleHash 는 유지한다', () => {
    let draft = createEmptyDraft(BUNDLE_PATH, BASE_HASH)
    draft = addOrUpdateEdit(draft, makeEdit('file1.md', 'a', 'b'))
    draft = addOrUpdateEdit(draft, makeEdit('file2.md', 'c', 'd'))
    const reset = resetDraft(draft)
    expect(reset.edits).toEqual({})
    expect(reset.bundlePath).toBe(BUNDLE_PATH)
    expect(reset.baseBundleHash).toBe(BASE_HASH)
  })
})

// ─────────────────────────────────────────────
// markStale
// ─────────────────────────────────────────────

describe('markStale', () => {
  it('지정된 파일에 stale=true 를 표시한다', () => {
    let draft = createEmptyDraft(BUNDLE_PATH, BASE_HASH)
    draft = addOrUpdateEdit(draft, makeEdit('file1.md', 'a', 'b'))
    const next = markStale(draft, ['file1.md'])
    expect((next.edits['file1.md'] as { stale?: boolean }).stale).toBe(true)
  })

  it('draft 에 없는 경로는 무시한다', () => {
    let draft = createEmptyDraft(BUNDLE_PATH, BASE_HASH)
    draft = addOrUpdateEdit(draft, makeEdit('file1.md', 'a', 'b'))
    const next = markStale(draft, ['nonexistent.md'])
    // file1.md 는 영향 없음
    expect((next.edits['file1.md'] as { stale?: boolean }).stale).toBeUndefined()
  })

  it('빈 stalePaths 는 draft 를 그대로 반환한다', () => {
    const draft = createEmptyDraft(BUNDLE_PATH, BASE_HASH)
    const next = markStale(draft, [])
    expect(next).toBe(draft)
  })

  it('여러 파일 중 일부만 stale 처리 가능하다', () => {
    let draft = createEmptyDraft(BUNDLE_PATH, BASE_HASH)
    draft = addOrUpdateEdit(draft, makeEdit('file1.md', 'a', 'b'))
    draft = addOrUpdateEdit(draft, makeEdit('file2.md', 'c', 'd'))
    const next = markStale(draft, ['file1.md'])
    expect((next.edits['file1.md'] as { stale?: boolean }).stale).toBe(true)
    expect((next.edits['file2.md'] as { stale?: boolean }).stale).toBeUndefined()
  })
})

// ─────────────────────────────────────────────
// clearAfterApply
// ─────────────────────────────────────────────

describe('clearAfterApply', () => {
  it('edits 를 비우고 bundleHash 를 새 값으로 갱신한다', () => {
    let draft = createEmptyDraft(BUNDLE_PATH, BASE_HASH)
    draft = addOrUpdateEdit(draft, makeEdit('file1.md', 'a', 'b'))
    const next = clearAfterApply(draft, 'hash-v2')
    expect(next.edits).toEqual({})
    expect(next.baseBundleHash).toBe('hash-v2')
    expect(next.bundlePath).toBe(BUNDLE_PATH)
  })
})

// ─────────────────────────────────────────────
// 유틸 함수
// ─────────────────────────────────────────────

describe('유틸 함수 (hasEdits, hasStaleEdits, editCount)', () => {
  it('hasEdits: 편집 없으면 false, 있으면 true', () => {
    let draft = createEmptyDraft(BUNDLE_PATH, BASE_HASH)
    expect(hasEdits(draft)).toBe(false)
    draft = addOrUpdateEdit(draft, makeEdit('file1.md', 'a', 'b'))
    expect(hasEdits(draft)).toBe(true)
  })

  it('hasStaleEdits: stale 없으면 false, 있으면 true', () => {
    let draft = createEmptyDraft(BUNDLE_PATH, BASE_HASH)
    draft = addOrUpdateEdit(draft, makeEdit('file1.md', 'a', 'b'))
    expect(hasStaleEdits(draft)).toBe(false)
    draft = markStale(draft, ['file1.md'])
    expect(hasStaleEdits(draft)).toBe(true)
  })

  it('editCount: 편집 건수를 반환한다', () => {
    let draft = createEmptyDraft(BUNDLE_PATH, BASE_HASH)
    expect(editCount(draft)).toBe(0)
    draft = addOrUpdateEdit(draft, makeEdit('file1.md', 'a', 'b'))
    expect(editCount(draft)).toBe(1)
    draft = addOrUpdateEdit(draft, makeEdit('file2.md', 'c', 'd'))
    expect(editCount(draft)).toBe(2)
    // 같은 파일 재편집은 카운트 증가 없음
    draft = addOrUpdateEdit(draft, makeEdit('file1.md', 'a', 'e'))
    expect(editCount(draft)).toBe(2)
  })
})

// ─────────────────────────────────────────────
// draftReducer (useReducer 호환)
// ─────────────────────────────────────────────

describe('draftReducer — useReducer 호환', () => {
  const initial = createEmptyDraft(BUNDLE_PATH, BASE_HASH)

  it('ADD_OR_UPDATE 액션이 편집을 추가한다', () => {
    const edit = makeEdit('file1.md', 'base', 'draft')
    const next = draftReducer(initial, { type: 'ADD_OR_UPDATE', edit })
    expect(editCount(next)).toBe(1)
  })

  it('REVERT 액션이 편집을 제거한다', () => {
    const edit = makeEdit('file1.md', 'base', 'draft')
    let state = draftReducer(initial, { type: 'ADD_OR_UPDATE', edit })
    state = draftReducer(state, { type: 'REVERT', relPath: 'file1.md' })
    expect(editCount(state)).toBe(0)
  })

  it('RESET 액션이 모든 편집을 초기화한다', () => {
    let state = draftReducer(initial, { type: 'ADD_OR_UPDATE', edit: makeEdit('f1.md', 'a', 'b') })
    state = draftReducer(state, { type: 'ADD_OR_UPDATE', edit: makeEdit('f2.md', 'c', 'd') })
    state = draftReducer(state, { type: 'RESET' })
    expect(editCount(state)).toBe(0)
  })

  it('MARK_STALE 액션이 stale 을 표시한다', () => {
    let state = draftReducer(initial, {
      type: 'ADD_OR_UPDATE',
      edit: makeEdit('file1.md', 'base', 'draft'),
    })
    state = draftReducer(state, { type: 'MARK_STALE', stalePaths: ['file1.md'] })
    expect(hasStaleEdits(state)).toBe(true)
  })

  it('CLEAR_AFTER_APPLY 액션이 edits 를 비우고 hash 를 갱신한다', () => {
    let state = draftReducer(initial, {
      type: 'ADD_OR_UPDATE',
      edit: makeEdit('file1.md', 'base', 'draft'),
    })
    state = draftReducer(state, { type: 'CLEAR_AFTER_APPLY', newBundleHash: 'hash-new' })
    expect(editCount(state)).toBe(0)
    expect(state.baseBundleHash).toBe('hash-new')
  })

  it('알 수 없는 액션은 state 를 그대로 반환한다', () => {
    const next = draftReducer(initial, { type: 'UNKNOWN' } as never)
    expect(next).toBe(initial)
  })
})
