/**
 * bundleDetect.test.ts — detectBundleKind 단위 테스트
 *
 * 검증:
 * - 4가지 kind 올바른 감지 (bundle / overlay / partial-skill / task)
 * - 경계 케이스 / 오판 방지
 * - mergeKind 우선순위
 */

import { describe, it, expect } from 'vitest'
import { detectBundleKind, mergeKind } from '../bundleDetect'
import type { BundleSignals } from '../bundleDetect'

// ─────────────────────────────────────────────
// bundle
// ─────────────────────────────────────────────

describe('detectBundleKind — bundle', () => {
  it('_core/ + _agents/ 있으면 bundle 이다 (reined 스타일)', () => {
    const signals: BundleSignals = {
      filePaths: [
        '_core/concepts.md',
        '_core/triage.md',
        '_agents/reined-bmad-developer.md',
        '_agents/reined-bmad-qa.md',
        '_hooks/gate.sh',
        '_templates/story.md',
      ],
    }
    expect(detectBundleKind(signals)).toBe('bundle')
  })

  it('_core/ + SKILL.md ≥2개 있으면 bundle 이다 (neon 스타일, _agents 없음)', () => {
    const signals: BundleSignals = {
      filePaths: [
        '_core/concepts.md',
        'developer/SKILL.md',
        'qa/SKILL.md',
        '_hooks/neon-gate-check.sh',
        'blocks/pipeline.sh',
      ],
    }
    expect(detectBundleKind(signals)).toBe('bundle')
  })

  it('_core/ + SKILL.md 1개는 bundle 아님 (partial-skill 로 내려간다)', () => {
    const signals: BundleSignals = {
      filePaths: [
        '_core/concepts.md',
        'developer/SKILL.md',
      ],
    }
    // _core 있고 SKILL.md 1개 → _agents 없으므로 bundle 조건 미충족 → partial-skill 또는 그 이상
    const kind = detectBundleKind(signals)
    // _core 있어도 SKILL.md 1개면 bundle 불충족. partial-skill 또는 overlay
    expect(['partial-skill', 'overlay', 'task']).toContain(kind)
    expect(kind).not.toBe('bundle')
  })

  it('_core/ 없으면 _agents/ 있어도 bundle 이 아니다', () => {
    const signals: BundleSignals = {
      filePaths: [
        '_agents/developer.md',
        '_agents/qa.md',
      ],
    }
    const kind = detectBundleKind(signals)
    expect(kind).not.toBe('bundle')
  })
})

// ─────────────────────────────────────────────
// overlay
// ─────────────────────────────────────────────

describe('detectBundleKind — overlay', () => {
  it('_overlays/ 디렉터리가 있으면 overlay 이다', () => {
    const signals: BundleSignals = {
      filePaths: [
        '_overlays/my-overlay.md',
        'config.md',
      ],
    }
    expect(detectBundleKind(signals)).toBe('overlay')
  })

  it('config.md frontmatter 에 stack/domains 키가 있으면 overlay 이다', () => {
    const signals: BundleSignals = {
      filePaths: ['config.md'],
      configFrontmatterRaw: 'stack: NestJS + TypeORM\ndomains:\n  - backend\n',
    }
    expect(detectBundleKind(signals)).toBe('overlay')
  })

  it('config.md frontmatter 에 model-overrides 가 있으면 overlay 이다', () => {
    const signals: BundleSignals = {
      filePaths: ['config.md'],
      configFrontmatterRaw: 'model-overrides:\n  developer: opus\n',
    }
    expect(detectBundleKind(signals)).toBe('overlay')
  })

  it('overlay 신호가 있어도 bundle 조건 충족 시 bundle 이 우선이다', () => {
    const signals: BundleSignals = {
      filePaths: [
        '_core/concepts.md',
        '_agents/developer.md',
        '_agents/qa.md',
        '_overlays/my-overlay.md',
      ],
    }
    // bundle 이 overlay 보다 우선
    expect(detectBundleKind(signals)).toBe('bundle')
  })
})

// ─────────────────────────────────────────────
// partial-skill
// ─────────────────────────────────────────────

describe('detectBundleKind — partial-skill', () => {
  it('SKILL.md 단일 파일이면 partial-skill 이다', () => {
    const signals: BundleSignals = {
      filePaths: ['SKILL.md'],
    }
    expect(detectBundleKind(signals)).toBe('partial-skill')
  })

  it('하위 경로 SKILL.md 도 partial-skill 이다 (bundle 조건 미충족 시)', () => {
    const signals: BundleSignals = {
      filePaths: ['reviewer/SKILL.md'],
    }
    expect(detectBundleKind(signals)).toBe('partial-skill')
  })

  it('루트 .md 파일 1개면 partial-skill 이다', () => {
    const signals: BundleSignals = {
      filePaths: ['my-skill.md'],
    }
    expect(detectBundleKind(signals)).toBe('partial-skill')
  })
})

// ─────────────────────────────────────────────
// task
// ─────────────────────────────────────────────

describe('detectBundleKind — task', () => {
  it('빈 파일 목록은 task 이다', () => {
    const signals: BundleSignals = { filePaths: [] }
    expect(detectBundleKind(signals)).toBe('task')
  })

  it('비 .md, 비 .sh 파일만 있으면 task 이다', () => {
    const signals: BundleSignals = {
      filePaths: ['data.json', 'readme.txt'],
    }
    // 위 파일들은 어떤 kind 신호도 없음 → task
    // 단, .txt/.json 은 SKILL.md/루트md 조건에 해당 안 함
    expect(detectBundleKind(signals)).toBe('task')
  })
})

// ─────────────────────────────────────────────
// mergeKind
// ─────────────────────────────────────────────

describe('mergeKind — 우선순위 (bundle > overlay > partial-skill > task)', () => {
  it('bundle 은 모든 kind 보다 우선이다', () => {
    expect(mergeKind('bundle', 'overlay')).toBe('bundle')
    expect(mergeKind('bundle', 'partial-skill')).toBe('bundle')
    expect(mergeKind('bundle', 'task')).toBe('bundle')
    expect(mergeKind('overlay', 'bundle')).toBe('bundle')
  })

  it('overlay 는 partial-skill, task 보다 우선이다', () => {
    expect(mergeKind('overlay', 'partial-skill')).toBe('overlay')
    expect(mergeKind('overlay', 'task')).toBe('overlay')
    expect(mergeKind('partial-skill', 'overlay')).toBe('overlay')
  })

  it('partial-skill 은 task 보다 우선이다', () => {
    expect(mergeKind('partial-skill', 'task')).toBe('partial-skill')
    expect(mergeKind('task', 'partial-skill')).toBe('partial-skill')
  })

  it('동일한 kind 는 그대로 반환한다', () => {
    expect(mergeKind('bundle', 'bundle')).toBe('bundle')
    expect(mergeKind('task', 'task')).toBe('task')
  })
})
