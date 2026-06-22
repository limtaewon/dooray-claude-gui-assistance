/**
 * draftDiff.test.ts — draftDiff 순수 함수 단위 테스트 (M3)
 *
 * 검증 항목:
 * - sha256: 동일 내용 동일 해시, 다른 내용 다른 해시
 * - computeLineDiff: 변경/추가/삭제 줄 수
 * - computeFileDiffSummary: stale 감지, 신규 파일 감지
 * - computeDraftDiffSummary: hasStale, hasShellEdit
 */

import { describe, it, expect } from 'vitest'
import { sha256, computeLineDiff, computeFileDiffSummary, computeDraftDiffSummary } from '../draftDiff'
import type { HarnessDraft } from '../../../shared/types/harness-edit'

// ─────────────────────────────────────────────
// sha256
// ─────────────────────────────────────────────

describe('sha256', () => {
  it('동일 내용은 동일 해시', () => {
    expect(sha256('hello')).toBe(sha256('hello'))
  })

  it('다른 내용은 다른 해시', () => {
    expect(sha256('hello')).not.toBe(sha256('world'))
  })

  it('빈 문자열도 처리', () => {
    const result = sha256('')
    expect(typeof result).toBe('string')
    expect(result.length).toBe(64) // sha256 hex = 64자
  })

  it('줄바꿈 차이도 다른 해시', () => {
    expect(sha256('a\nb')).not.toBe(sha256('a\r\nb'))
  })
})

// ─────────────────────────────────────────────
// computeLineDiff
// ─────────────────────────────────────────────

describe('computeLineDiff', () => {
  it('동일 내용 — 변경/추가/삭제 0', () => {
    const result = computeLineDiff('a\nb\nc', 'a\nb\nc')
    expect(result.changedLines).toBe(0)
    expect(result.addedLines).toBe(0)
    expect(result.removedLines).toBe(0)
  })

  it('한 줄 변경', () => {
    const result = computeLineDiff('a\nb\nc', 'a\nX\nc')
    expect(result.changedLines).toBe(1)
    expect(result.addedLines).toBe(0)
    expect(result.removedLines).toBe(0)
  })

  it('줄 추가', () => {
    const result = computeLineDiff('a\nb', 'a\nb\nc')
    expect(result.addedLines).toBe(1)
    expect(result.removedLines).toBe(0)
  })

  it('줄 삭제', () => {
    const result = computeLineDiff('a\nb\nc', 'a\nb')
    expect(result.removedLines).toBe(1)
    expect(result.addedLines).toBe(0)
  })

  it('빈 base (신규 파일) — 모두 추가', () => {
    const result = computeLineDiff('', 'a\nb\nc')
    expect(result.addedLines).toBe(3)
    expect(result.changedLines).toBe(0)
    expect(result.removedLines).toBe(0)
  })

  it('빈 draft (전체 삭제) — 모두 제거', () => {
    const result = computeLineDiff('a\nb\nc', '')
    expect(result.removedLines).toBe(3)
    expect(result.addedLines).toBe(0)
  })
})

// ─────────────────────────────────────────────
// computeFileDiffSummary
// ─────────────────────────────────────────────

describe('computeFileDiffSummary', () => {
  it('stale=false — diskContent 가 baseContent 와 동일할 때', () => {
    const result = computeFileDiffSummary('a.md', 'hello', 'hello world', 'hello')
    expect(result.stale).toBe(false)
  })

  it('stale=true — diskContent 가 baseContent 와 다를 때', () => {
    const result = computeFileDiffSummary('a.md', 'original', 'new content', 'external change')
    expect(result.stale).toBe(true)
  })

  it('isNew=true — baseContent 가 빈 문자열', () => {
    const result = computeFileDiffSummary('new.md', '', '# new file', '')
    expect(result.isNew).toBe(true)
    expect(result.stale).toBe(false) // 디스크에도 없음 (빈 문자열)
  })

  it('isNew=false — baseContent 가 빈 문자열이 아닐 때', () => {
    const result = computeFileDiffSummary('existing.md', 'content', 'new content', 'content')
    expect(result.isNew).toBe(false)
  })

  it('relPath 를 그대로 반환', () => {
    const result = computeFileDiffSummary('_agents/dev.md', 'a', 'b', 'a')
    expect(result.relPath).toBe('_agents/dev.md')
  })
})

// ─────────────────────────────────────────────
// computeDraftDiffSummary
// ─────────────────────────────────────────────

describe('computeDraftDiffSummary', () => {
  const makeDraft = (edits: Record<string, { base: string; draft: string }>): HarnessDraft => ({
    bundlePath: '/bundle',
    baseBundleHash: 'abc123',
    edits: Object.fromEntries(
      Object.entries(edits).map(([relPath, { base, draft }]) => [
        relPath,
        {
          relPath,
          baseContent: base,
          draftContent: draft,
          origin: 'raw' as const,
          editedAt: new Date().toISOString(),
        },
      ])
    ),
  })

  it('stale 없는 경우 hasStale=false', () => {
    const draft = makeDraft({ '_agents/dev.md': { base: 'a', draft: 'b' } })
    const result = computeDraftDiffSummary(draft, { '_agents/dev.md': 'a' })
    expect(result.hasStale).toBe(false)
  })

  it('stale 있는 경우 hasStale=true', () => {
    const draft = makeDraft({ '_agents/dev.md': { base: 'original', draft: 'new' } })
    // 디스크는 외부 수정됨
    const result = computeDraftDiffSummary(draft, { '_agents/dev.md': 'external change' })
    expect(result.hasStale).toBe(true)
  })

  it('.sh 파일 포함 시 hasShellEdit=true', () => {
    const draft = makeDraft({ '_hooks/gate.sh': { base: '#!/bin/bash', draft: '#!/bin/bash\nexit 0' } })
    const result = computeDraftDiffSummary(draft, { '_hooks/gate.sh': '#!/bin/bash' })
    expect(result.hasShellEdit).toBe(true)
  })

  it('.sh 파일 없으면 hasShellEdit=false', () => {
    const draft = makeDraft({ '_agents/dev.md': { base: 'a', draft: 'b' } })
    const result = computeDraftDiffSummary(draft, { '_agents/dev.md': 'a' })
    expect(result.hasShellEdit).toBe(false)
  })

  it('디스크 내용 맵에 없는 파일은 빈 문자열로 처리', () => {
    const draft = makeDraft({ '_agents/new.md': { base: '', draft: '# new' } })
    const result = computeDraftDiffSummary(draft, {})
    expect(result.files[0].isNew).toBe(true)
    expect(result.hasStale).toBe(false)
  })

  it('파일 목록 개수 일치', () => {
    const draft = makeDraft({
      '_agents/a.md': { base: 'a', draft: 'b' },
      '_agents/b.md': { base: 'c', draft: 'd' },
    })
    const result = computeDraftDiffSummary(draft, {
      '_agents/a.md': 'a',
      '_agents/b.md': 'c',
    })
    expect(result.files.length).toBe(2)
  })
})
