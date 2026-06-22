/**
 * Artifacts 패널 — 순수 함수 유틸리티.
 *
 * HarnessArtifact 목록을 뷰에 맞게 가공한다.
 * 어떤 프레임워크에도 의존하지 않아 vitest 에서 직접 테스트할 수 있다.
 */

import type { HarnessArtifact } from '@shared/types/harness'

/** 산출물 persist 분류 → DS 칩 톤 매핑 */
export function persistToChipTone(
  persist: HarnessArtifact['persist']
): 'emerald' | 'blue' | 'orange' | 'neutral' {
  switch (persist) {
    case 'git':     return 'emerald'
    case 'ignore':  return 'neutral'
    case 'dooray':  return 'blue'
    case 'unknown': return 'orange'
  }
}

/** persist 분류 → 한국어 레이블 */
export function persistLabel(persist: HarnessArtifact['persist']): string {
  switch (persist) {
    case 'git':     return 'git 커밋'
    case 'ignore':  return '.gitignore'
    case 'dooray':  return '두레이'
    case 'unknown': return '미분류'
  }
}

/** 산출물을 persist 분류별로 그루핑. 순서: git → dooray → ignore → unknown */
export interface ArtifactGroup {
  persist: HarnessArtifact['persist']
  artifacts: HarnessArtifact[]
}

const PERSIST_ORDER: HarnessArtifact['persist'][] = ['git', 'dooray', 'ignore', 'unknown']

export function groupArtifactsByPersist(artifacts: HarnessArtifact[]): ArtifactGroup[] {
  const map = new Map<HarnessArtifact['persist'], HarnessArtifact[]>()

  for (const a of artifacts) {
    const arr = map.get(a.persist) ?? []
    arr.push(a)
    map.set(a.persist, arr)
  }

  return PERSIST_ORDER
    .filter((p) => map.has(p))
    .map((p) => ({ persist: p, artifacts: map.get(p)! }))
}

/**
 * 산출물 트리를 location 기반으로 계층 구조로 분류.
 *
 * location 이 없는 것은 'root' 로 묶는다.
 * 실제 디렉터리 기준으로 1단계만 분류(깊은 트리 불필요).
 */
export interface ArtifactTreeNode {
  dir: string
  artifacts: HarnessArtifact[]
}

export function buildArtifactTree(artifacts: HarnessArtifact[]): ArtifactTreeNode[] {
  const map = new Map<string, HarnessArtifact[]>()

  for (const a of artifacts) {
    let dir = 'root'
    if (a.location) {
      // location 에서 상위 1~2 세그먼트 추출.
      // 앞의 "./" 또는 "/" 만 제거하고 "." 으로 시작하는 숨김 디렉터리명은 보존한다.
      const normalized = a.location.replace(/^\.\//, '').replace(/^\//, '')
      const segments = normalized.split('/')
      dir = segments.length > 1 ? segments.slice(0, 2).join('/') : segments[0]
    }
    const arr = map.get(dir) ?? []
    arr.push(a)
    map.set(dir, arr)
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => {
      if (a === 'root') return 1
      if (b === 'root') return -1
      return a.localeCompare(b)
    })
    .map(([dir, arts]) => ({ dir, artifacts: arts }))
}

/**
 * 산출물에서 producer/consumers 관계를 요약.
 *
 * consumer 가 없는 산출물 → "소비자 없음" 경고 대상
 * producer 가 없는 산출물 → "생산자 없음" 경고 대상
 */
export interface ArtifactRelationWarning {
  artifactId: string
  kind: 'no-producer' | 'no-consumer'
}

export function findRelationWarnings(artifacts: HarnessArtifact[]): ArtifactRelationWarning[] {
  const warnings: ArtifactRelationWarning[] = []
  for (const a of artifacts) {
    if (!a.producer) {
      warnings.push({ artifactId: a.id, kind: 'no-producer' })
    }
    if (a.consumers.length === 0) {
      warnings.push({ artifactId: a.id, kind: 'no-consumer' })
    }
  }
  return warnings
}
