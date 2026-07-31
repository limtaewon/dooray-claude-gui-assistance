import type { ProjectOverride, WorkspaceSettings } from '../types/workspace'
import { DEFAULT_BRANCH_TEMPLATE } from './branchName'
import { DEFAULT_TASK_DROP_PROMPT } from './taskDropPrompt'

/**
 * 프로젝트 하나에 실제로 적용될 값.
 *
 * 왜 프로젝트별인가: 한 PC 에 저장소가 10여 개고 두레이 프로젝트도 여러 개다. 브랜치 규칙도
 * 첫 지시 문구도 프로젝트마다 다르다 — 전역 값 하나로 맞추려 하면 어느 쪽도 안 맞는다.
 * 대신 **비워두면 전역 기본을 따르게** 해서 프로젝트마다 전부 채울 필요는 없게 한다.
 */
export interface ResolvedProjectConfig {
  /** 이 프로젝트가 쓰는 저장소 id 들 (지정 안 했으면 빈 배열) */
  repoIds: string[]
  branchTemplate: string
  promptTemplate: string
  /** 각 값이 프로젝트 지정인지 전역 기본인지 — UI 가 '기본값 사용' 을 표시하는 근거 */
  source: { branchTemplate: 'project' | 'global'; promptTemplate: 'project' | 'global' }
}

function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    if (value !== undefined && value.trim()) return value
  }
  return undefined
}

/**
 * 프로젝트 오버라이드 + 전역 기본을 합쳐 실제 적용값을 낸다.
 *
 * 주의: 첫 지시 문구는 **빈 문자열이 '지시 안 보냄' 이라는 의미 있는 값**이다.
 * 그래서 공백 여부가 아니라 키 존재 여부로 판단한다 — 빈 값을 전역으로 되돌리면
 * "지시를 안 보내겠다" 는 선택을 무시하게 된다.
 */
export function resolveProjectConfig(
  settings: Pick<WorkspaceSettings, 'projectOverrides' | 'branchTemplate' | 'taskDropPromptTemplate'>,
  projectId: string
): ResolvedProjectConfig {
  const override: ProjectOverride = settings.projectOverrides?.[projectId] ?? {}

  const branchTemplate =
    firstNonEmpty(override.branchTemplate, settings.branchTemplate) ?? DEFAULT_BRANCH_TEMPLATE

  const hasPromptOverride = typeof override.promptTemplate === 'string'
  const promptTemplate = hasPromptOverride
    ? (override.promptTemplate as string)
    : (settings.taskDropPromptTemplate ?? DEFAULT_TASK_DROP_PROMPT)

  return {
    repoIds: override.repoIds ?? [],
    branchTemplate,
    promptTemplate,
    source: {
      branchTemplate: override.branchTemplate?.trim() ? 'project' : 'global',
      promptTemplate: hasPromptOverride ? 'project' : 'global'
    }
  }
}

/** 오버라이드를 갱신한다. 값이 비면 키를 지워 전역 기본으로 되돌린다(프롬프트 제외). */
export function withProjectOverride(
  overrides: Record<string, ProjectOverride>,
  projectId: string,
  patch: ProjectOverride
): Record<string, ProjectOverride> {
  const next: ProjectOverride = { ...(overrides[projectId] ?? {}), ...patch }

  if (next.branchTemplate !== undefined && !next.branchTemplate.trim()) delete next.branchTemplate
  if (next.repoIds && next.repoIds.length === 0) delete next.repoIds

  const result = { ...overrides }
  if (Object.keys(next).length === 0) delete result[projectId]
  else result[projectId] = next
  return result
}
