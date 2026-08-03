import type { RepoRegistryEntry, WorkspaceSettings } from '@shared/types/workspace'
import { resolveProjectConfig } from '@shared/workspace/projectConfig'

/**
 * 작업 패널 업무 목록이 "왜 비었는지" 를 가른다.
 *
 * 설정을 안 끝낸 것과 정말 업무가 없는 것은 사용자가 할 일이 다른데, 화면에는 똑같이 빈 목록으로
 * 보인다 — "업무가 안 뜬다" 는 제보가 여기서 나온다. 판정을 순수 함수로 두고 문구를 그에 맞춘다.
 */
export type TaskSetupStage =
  /** 볼 프로젝트를 아직 안 골랐다 — 목록이 빌 수밖에 없다 */
  | 'no-project'
  /** 저장소를 한 번도 등록하지 않았다 — 드롭해도 워크트리를 만들 곳이 없다 */
  | 'no-repo-registered'
  /** 프로젝트는 골랐는데 그중 일부에 저장소를 안 붙였다 */
  | 'project-without-repo'
  /** 설정은 끝났다 */
  | 'ready'

export interface TaskSetupInput {
  /** 이 패널이 보여주기로 고른 두레이 프로젝트 id */
  projectIds: string[]
  settings: WorkspaceSettings | null
  repos: RepoRegistryEntry[]
}

export interface TaskSetupState {
  stage: TaskSetupStage
  /** 저장소를 안 붙인 프로젝트 id — 'project-without-repo' 일 때만 채워진다 */
  projectsWithoutRepo: string[]
}

/** 저장소가 실제로 등록돼 있는 것만 센다 — 지운 저장소 id 가 설정에 남아 있을 수 있다. */
function mappedRepoCount(
  settings: WorkspaceSettings,
  repos: RepoRegistryEntry[],
  projectId: string
): number {
  return resolveProjectConfig(settings, projectId).repoIds.filter((id) =>
    repos.some((repo) => repo.id === id)
  ).length
}

export function resolveTaskSetupState({ projectIds, settings, repos }: TaskSetupInput): TaskSetupState {
  if (projectIds.length === 0) return { stage: 'no-project', projectsWithoutRepo: [] }
  if (repos.length === 0) return { stage: 'no-repo-registered', projectsWithoutRepo: projectIds }

  const projectsWithoutRepo = settings
    ? projectIds.filter((id) => mappedRepoCount(settings, repos, id) === 0)
    : projectIds

  if (projectsWithoutRepo.length > 0) return { stage: 'project-without-repo', projectsWithoutRepo }
  return { stage: 'ready', projectsWithoutRepo: [] }
}

/** 설정을 더 해야 하는 상태인지 — 목록이 비었을 때 안내를 띄울지 판단한다. */
export function needsSetup(state: TaskSetupState): boolean {
  return state.stage !== 'ready'
}
