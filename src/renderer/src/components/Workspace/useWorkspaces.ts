import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AgentRun, TaskWorkspace } from '@shared/types/workspace'
import { workspaceKey } from '@shared/workspace/workspaceKey'

/** 워크스페이스 목록 + run 갱신 push 구독. 뷰는 이 훅으로만 워크스페이스 상태를 읽는다. */
export interface WorkspacesApi {
  byKey: Map<string, TaskWorkspace>
  loading: boolean
  reload: () => Promise<void>
  /** main 이 돌려준 최신 워크스페이스를 즉시 반영 (push 를 기다리지 않는다) */
  upsert: (workspace: TaskWorkspace) => void
}

export function useWorkspaces(): WorkspacesApi {
  const [list, setList] = useState<TaskWorkspace[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async (): Promise<void> => {
    try {
      setList(await window.api.workspace.list())
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }, [])

  const upsert = useCallback((workspace: TaskWorkspace): void => {
    setList((prev) => {
      const idx = prev.findIndex((w) => w.id === workspace.id)
      if (idx === -1) return [...prev, workspace]
      const next = prev.slice()
      next[idx] = workspace
      return next
    })
  }, [])

  useEffect(() => {
    void reload()
    return window.api.workspace.onRunUpdated((payload) => {
      upsert(payload.workspace)
    })
  }, [reload, upsert])

  const byKey = useMemo(() => new Map(list.map((w) => [w.id, w])), [list])
  return { byKey, loading, reload, upsert }
}

/** 태스크에 연결된 워크스페이스를 찾는다. 없으면 undefined. */
export function findWorkspace(
  byKey: Map<string, TaskWorkspace>,
  projectId: string,
  taskId: string
): TaskWorkspace | undefined {
  return byKey.get(workspaceKey(projectId, taskId))
}

/** 워크스페이스의 활성 run. 없으면 마지막 run(이력) 을 돌려준다. */
export function activeRunOf(workspace: TaskWorkspace | undefined): AgentRun | undefined {
  if (!workspace) return undefined
  if (workspace.activeRunId) {
    const active = workspace.runs.find((r) => r.runId === workspace.activeRunId)
    if (active) return active
  }
  return workspace.runs[workspace.runs.length - 1]
}
