/**
 * artifactsUtils — 순수함수 단위 테스트
 */

import { describe, it, expect } from 'vitest'
import {
  persistToChipTone,
  persistLabel,
  groupArtifactsByPersist,
  buildArtifactTree,
  findRelationWarnings
} from '../views/artifactsUtils'
import type { HarnessArtifact } from '@shared/types/harness'

// ─── 테스트 픽스처 ───────────────────────────────────────────────

const makeArtifact = (overrides: Partial<HarnessArtifact> = {}): HarnessArtifact => ({
  id: 'test-artifact',
  consumers: [],
  persist: 'git',
  ...overrides
})

// ─── persistToChipTone ───────────────────────────────────────────

describe('persistToChipTone', () => {
  it('git → emerald', () => expect(persistToChipTone('git')).toBe('emerald'))
  it('ignore → neutral', () => expect(persistToChipTone('ignore')).toBe('neutral'))
  it('dooray → blue', () => expect(persistToChipTone('dooray')).toBe('blue'))
  it('unknown → orange', () => expect(persistToChipTone('unknown')).toBe('orange'))
})

// ─── persistLabel ────────────────────────────────────────────────

describe('persistLabel', () => {
  it('git → "git 커밋"', () => expect(persistLabel('git')).toBe('git 커밋'))
  it('ignore → ".gitignore"', () => expect(persistLabel('ignore')).toBe('.gitignore'))
  it('dooray → "두레이"', () => expect(persistLabel('dooray')).toBe('두레이'))
  it('unknown → "미분류"', () => expect(persistLabel('unknown')).toBe('미분류'))
})

// ─── groupArtifactsByPersist ─────────────────────────────────────

describe('groupArtifactsByPersist', () => {
  it('persist 별로 그루핑한다', () => {
    const artifacts: HarnessArtifact[] = [
      makeArtifact({ id: 'a1', persist: 'git' }),
      makeArtifact({ id: 'a2', persist: 'dooray' }),
      makeArtifact({ id: 'a3', persist: 'git' })
    ]
    const groups = groupArtifactsByPersist(artifacts)
    const gitGroup = groups.find((g) => g.persist === 'git')!
    expect(gitGroup.artifacts).toHaveLength(2)
    const doorayGroup = groups.find((g) => g.persist === 'dooray')!
    expect(doorayGroup.artifacts).toHaveLength(1)
  })

  it('순서: git → dooray → ignore → unknown', () => {
    const artifacts: HarnessArtifact[] = [
      makeArtifact({ persist: 'unknown' }),
      makeArtifact({ persist: 'dooray' }),
      makeArtifact({ persist: 'git' }),
      makeArtifact({ persist: 'ignore' })
    ]
    const groups = groupArtifactsByPersist(artifacts)
    expect(groups.map((g) => g.persist)).toEqual(['git', 'dooray', 'ignore', 'unknown'])
  })

  it('없는 분류는 그룹에서 제외', () => {
    const artifacts = [makeArtifact({ persist: 'git' })]
    const groups = groupArtifactsByPersist(artifacts)
    expect(groups).toHaveLength(1)
    expect(groups[0].persist).toBe('git')
  })

  it('빈 배열 → 빈 배열', () => {
    expect(groupArtifactsByPersist([])).toEqual([])
  })
})

// ─── buildArtifactTree ───────────────────────────────────────────

describe('buildArtifactTree', () => {
  it('location 없으면 root 노드에 들어간다', () => {
    const artifacts = [makeArtifact({ id: 'orphan', location: undefined })]
    const tree = buildArtifactTree(artifacts)
    const rootNode = tree.find((n) => n.dir === 'root')!
    expect(rootNode.artifacts).toHaveLength(1)
  })

  it('location 있으면 상위 2 디렉터리로 그루핑', () => {
    const artifacts = [
      makeArtifact({ id: 'a1', location: '.reined-bmad/docs/stories/story.md' }),
      makeArtifact({ id: 'a2', location: '.reined-bmad/docs/adr/adr.md' })
    ]
    const tree = buildArtifactTree(artifacts)
    expect(tree).toHaveLength(1) // 같은 .reined-bmad/docs 그룹
    expect(tree[0].dir).toBe('.reined-bmad/docs')
    expect(tree[0].artifacts).toHaveLength(2)
  })

  it('서로 다른 디렉터리는 별도 노드', () => {
    const artifacts = [
      makeArtifact({ id: 'a1', location: 'dir-a/file.md' }),
      makeArtifact({ id: 'a2', location: 'dir-b/file.md' })
    ]
    const tree = buildArtifactTree(artifacts)
    expect(tree).toHaveLength(2)
  })

  it('root 노드는 마지막에 위치한다', () => {
    const artifacts = [
      makeArtifact({ id: 'a', location: 'dir-a/x.md' }),
      makeArtifact({ id: 'b', location: undefined })
    ]
    const tree = buildArtifactTree(artifacts)
    expect(tree[tree.length - 1].dir).toBe('root')
  })
})

// ─── findRelationWarnings ────────────────────────────────────────

describe('findRelationWarnings', () => {
  it('producer 없으면 no-producer 경고', () => {
    const artifacts = [makeArtifact({ id: 'x', producer: undefined })]
    const warnings = findRelationWarnings(artifacts)
    expect(warnings.some((w) => w.kind === 'no-producer' && w.artifactId === 'x')).toBe(true)
  })

  it('consumers 없으면 no-consumer 경고', () => {
    const artifacts = [makeArtifact({ id: 'x', producer: 'dev', consumers: [] })]
    const warnings = findRelationWarnings(artifacts)
    expect(warnings.some((w) => w.kind === 'no-consumer' && w.artifactId === 'x')).toBe(true)
  })

  it('producer 있고 consumers 있으면 경고 없음', () => {
    const artifacts = [
      makeArtifact({ id: 'x', producer: 'dev', consumers: ['qa'] })
    ]
    const warnings = findRelationWarnings(artifacts)
    expect(warnings).toHaveLength(0)
  })

  it('빈 배열 → 빈 경고', () => {
    expect(findRelationWarnings([])).toEqual([])
  })

  it('producer 없고 consumers 없으면 두 가지 경고 모두', () => {
    const artifacts = [makeArtifact({ id: 'x', producer: undefined, consumers: [] })]
    const warnings = findRelationWarnings(artifacts)
    expect(warnings).toHaveLength(2)
  })
})
