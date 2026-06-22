/**
 * Skills & Blocks 패널 — 순수 함수 유틸리티.
 *
 * HarnessAgent 데이터를 뷰에 맞게 가공한다.
 * 어떤 프레임워크에도 의존하지 않아 vitest 에서 직접 테스트할 수 있다.
 */

import type { HarnessAgent, HarnessModel } from '@shared/types/harness'

/** 합리화 방어 테이블 행 — riskNote 에서 파싱 또는 단순 래핑 */
export interface RationalizationRow {
  /** 합리화 유형/패턴 설명 */
  pattern: string
  /** 해당 에이전트 ID */
  agentId: string
}

/**
 * 에이전트 목록에서 합리화 방어 테이블 행을 추출한다.
 *
 * riskNote 가 있는 에이전트만 포함.
 * 에이전트가 많으면 phaseClass 알파벳 순으로 정렬해 가독성을 높인다.
 */
export function buildRationalizationRows(agents: HarnessAgent[]): RationalizationRow[] {
  return agents
    .filter((a) => Boolean(a.riskNote))
    .sort((a, b) => (a.phaseClass ?? 'zzz').localeCompare(b.phaseClass ?? 'zzz'))
    .map((a) => ({
      pattern: a.riskNote as string,
      agentId: a.displayName || a.id
    }))
}

/**
 * blocks 재사용 매핑 — writes 경로에서 "blocks/" 패턴이 포함된 항목을 뽑아
 * 어떤 에이전트가 어떤 블록을 사용하는지 매핑 테이블로 만든다.
 *
 * 빈 배열을 반환할 수 있다(blocks 없는 번들).
 */
export interface BlockUsage {
  blockPath: string
  usedBy: string[]
}

export function buildBlockUsageMap(agents: HarnessAgent[]): BlockUsage[] {
  const map = new Map<string, string[]>()

  for (const agent of agents) {
    for (const w of [...agent.writes, ...agent.reads]) {
      if (w.toLowerCase().includes('block')) {
        const existing = map.get(w) ?? []
        existing.push(agent.displayName || agent.id)
        map.set(w, existing)
      }
    }
  }

  return Array.from(map.entries())
    .map(([blockPath, usedBy]) => ({ blockPath, usedBy: [...new Set(usedBy)] }))
    .sort((a, b) => a.blockPath.localeCompare(b.blockPath))
}

/**
 * 에이전트의 tools 배열을 카테고리별로 분류한다.
 *
 * - mcp: "mcp__" 접두어
 * - bash: "Bash" 또는 "Execute"
 * - file: "Read" / "Write" / "Edit" 계열
 * - other: 나머지
 */
export type ToolCategory = 'mcp' | 'bash' | 'file' | 'other'

export interface CategorizedTool {
  name: string
  category: ToolCategory
}

export function categorizeTools(tools: string[]): CategorizedTool[] {
  return tools.map((name) => {
    let category: ToolCategory = 'other'
    if (name.startsWith('mcp__') || name.startsWith('mcp:')) {
      category = 'mcp'
    } else if (/bash|execute|run|shell/i.test(name)) {
      category = 'bash'
    } else if (/read|write|edit|create|delete|move|copy|file/i.test(name)) {
      category = 'file'
    }
    return { name, category }
  })
}

/**
 * 모델 이름을 신호 색상 톤으로 매핑.
 * HarnessModelName → DS 칩 톤(Chip tone 타입 호환)
 */
export function modelToChipTone(
  model: HarnessAgent['model']
): 'neutral' | 'blue' | 'orange' | 'red' {
  switch (model) {
    case 'haiku':   return 'neutral'
    case 'sonnet':  return 'blue'
    case 'opus':    return 'orange'
    case 'unknown': return 'neutral'
  }
}

/**
 * 에이전트 phaseClass → 한국어 레이블 변환.
 *
 * phaseClass 가 없거나 알 수 없는 값이면 '기타' 를 반환한다.
 */
export function phaseClassLabel(phaseClass: string | undefined): string {
  const map: Record<string, string> = {
    analyst:       '분석가',
    pm:            '프로덕트 매니저',
    architect:     '아키텍트',
    sm:            '스크럼 마스터',
    dev:           '개발자',
    qa:            'QA',
    security:      '보안',
    release:       '릴리즈',
    orchestrator:  '오케스트레이터',
    other:         '기타'
  }
  return map[phaseClass ?? ''] ?? '기타'
}

/** agents 에서 agents[].signals 전체를 flatten 하여 중복 없이 정렬 반환 */
export function collectAllSignals(agents: HarnessAgent[]): string[] {
  const set = new Set<string>()
  for (const a of agents) {
    for (const s of a.signals ?? []) {
      set.add(s)
    }
  }
  return Array.from(set).sort()
}

/**
 * HarnessModel 의 warnings 중 특정 prefix 에 해당하는 것만 필터링.
 *
 * prefix 미지정 시 전체 반환.
 */
export function filterWarnings(model: HarnessModel, prefix?: string): string[] {
  if (!prefix) return model.warnings
  return model.warnings.filter((w) => w.startsWith(prefix))
}
