import type { WorkspaceKey } from '../types/workspace'

/** projectId 와 taskId 를 합성해 워크스페이스 키를 만든다. */
export function workspaceKey(projectId: string, taskId: string): WorkspaceKey {
  return `${projectId}:${taskId}`
}

/** 합성키를 projectId/taskId 로 분해한다. 두레이 id 엔 `:` 이 없으므로 첫 `:` 기준으로 split. */
export function parseWorkspaceKey(key: WorkspaceKey): { projectId: string; taskId: string } {
  const idx = key.indexOf(':')
  if (idx === -1) return { projectId: key, taskId: '' }
  return { projectId: key.slice(0, idx), taskId: key.slice(idx + 1) }
}
