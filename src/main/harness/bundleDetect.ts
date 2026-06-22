/**
 * bundleDetect.ts — 번들 kind 감지 (순수 함수)
 *
 * 파일 경로 목록(상대경로)과 frontmatter 정보를 분석하여 번들 종류를 판정한다.
 * 실제 파일 시스템 접근 없음 — 경로 문자열만 분석한다.
 *
 * kind 판정 기준 (ADR-harness-studio-002 §결정, arch.md §0 실측):
 * - 'bundle': _core/ 존재 AND (_agents/ 존재 OR SKILL.md 가 ≥2개)
 * - 'overlay': config.md frontmatter 에 overlay 신호 OR _overlays/ 존재
 * - 'partial-skill': SKILL.md 1개 OR frontmatter name 있음 (bundle/overlay 에 해당 안 될 때)
 * - 'task': 위 어디에도 해당 안 함
 *
 * 우선순위: bundle > overlay > partial-skill > task
 * 보수적 상위 kind 우선 — 오판 시 사용자가 ScanStep 에서 수동 교정 가능.
 *
 * 제약: 이 파일은 순수 함수만 담는다. fs / electron 의존 금지.
 */

import type { HarnessMeta } from '../../shared/types/harness'

/** kind 감지에 사용되는 파일 신호 요약 */
export interface BundleSignals {
  /** 번들 루트 기준 상대경로 목록 (파일만, 디렉터리 경로 불포함) */
  filePaths: string[]
  /**
   * config.md 가 존재할 경우 그 frontmatter 원문.
   * overlay 판정에 사용된다.
   */
  configFrontmatterRaw?: string
}

/** bundle kind 판정 우선순위 — 숫자 낮을수록 우선 */
const KIND_PRIORITY: Record<HarnessMeta['kind'], number> = {
  bundle: 0,
  overlay: 1,
  'partial-skill': 2,
  task: 3,
}

/**
 * 경로 목록에서 특정 패턴에 해당하는 경로가 존재하는지 확인한다.
 *
 * @param paths 상대경로 배열
 * @param pattern 매칭 패턴 (문자열 포함 검사 또는 정규식)
 */
function hasPath(paths: string[], pattern: string | RegExp): boolean {
  if (typeof pattern === 'string') {
    return paths.some((p) => p === pattern || p.startsWith(pattern + '/') || p.includes('/' + pattern + '/') || p.startsWith(pattern))
  }
  return paths.some((p) => pattern.test(p))
}

/**
 * 경로 목록에서 특정 조건을 만족하는 경로 수를 반환한다.
 *
 * @param paths 상대경로 배열
 * @param test 경로 테스트 함수
 */
function countPaths(paths: string[], test: (p: string) => boolean): number {
  return paths.filter(test).length
}

/**
 * bundle kind 판정.
 * 조건: _core/ 하위 파일 존재 AND (_agents/ 하위 파일 존재 OR SKILL.md 가 2개 이상)
 *
 * neon-bmad 처럼 _agents/ 없이 <role>/SKILL.md 만 있어도 ≥2개이면 bundle 로 판정한다.
 */
function isBundle(paths: string[]): boolean {
  const hasCoreDir = hasPath(paths, /^_core\//)
  if (!hasCoreDir) return false

  const hasAgentsDir = hasPath(paths, /^_agents\//)
  if (hasAgentsDir) return true

  // _agents/ 없으면 SKILL.md 파일이 2개 이상인지 확인 (neon-bmad 스타일)
  const skillMdCount = countPaths(paths, (p) => p.endsWith('/SKILL.md') || p === 'SKILL.md')
  return skillMdCount >= 2
}

/**
 * overlay kind 판정.
 * 조건: _overlays/ 하위 파일 존재 OR config.md frontmatter 에 overlay 신호(stack/domains 키)
 *
 * overlay 는 번들 위에 쌓는 커스터마이징 레이어이므로 _core/ 없이 config.md 위주 구조다.
 */
function isOverlay(paths: string[], configFrontmatterRaw?: string): boolean {
  if (hasPath(paths, /^_overlays\//)) return true

  // config.md 가 있고 frontmatter 에 overlay 특화 키(stack/domains/model-overrides)가 있으면 overlay
  if (configFrontmatterRaw) {
    const overlaySignals = /^(stack|domains|model-overrides|disabled-agents)\s*:/m
    if (overlaySignals.test(configFrontmatterRaw)) return true
  }

  return false
}

/**
 * partial-skill kind 판정.
 * 조건: SKILL.md 가 1개 이상 존재 OR frontmatter name 이 있는 .md 파일 존재
 *
 * bundle/overlay 에 해당하지 않을 때만 호출된다.
 */
function isPartialSkill(paths: string[]): boolean {
  // 루트 SKILL.md 또는 하위 경로 SKILL.md
  const hasSkillMd = hasPath(paths, /SKILL\.md$/)
  if (hasSkillMd) return true

  // 루트 레벨 .md 파일 중 역할 카드/frontmatter 있을 가능성 (단독 스킬 파일)
  const rootMdCount = countPaths(paths, (p) => !p.includes('/') && p.endsWith('.md'))
  return rootMdCount >= 1
}

/**
 * 파일 경로 목록과 config.md frontmatter 를 분석하여 번들 kind 를 반환한다.
 *
 * 우선순위: bundle > overlay > partial-skill > task
 * bundle 이 가장 강한 신호이며, 조건 충족 시 다른 신호보다 우선된다.
 *
 * @param signals 감지 신호 (파일 경로 목록 + 선택적 config frontmatter)
 * @returns 감지된 kind
 */
export function detectBundleKind(signals: BundleSignals): HarnessMeta['kind'] {
  const { filePaths, configFrontmatterRaw } = signals

  if (isBundle(filePaths)) return 'bundle'
  if (isOverlay(filePaths, configFrontmatterRaw)) return 'overlay'
  if (isPartialSkill(filePaths)) return 'partial-skill'
  return 'task'
}

/**
 * 두 kind 중 우선순위가 높은 쪽을 반환한다.
 * 여러 단계에서 kind 를 합성할 때 사용한다.
 *
 * @param a 첫 번째 kind
 * @param b 두 번째 kind
 */
export function mergeKind(a: HarnessMeta['kind'], b: HarnessMeta['kind']): HarnessMeta['kind'] {
  return KIND_PRIORITY[a] <= KIND_PRIORITY[b] ? a : b
}
