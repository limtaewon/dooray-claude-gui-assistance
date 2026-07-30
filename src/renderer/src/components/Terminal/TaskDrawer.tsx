import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronsRight, Link2, RefreshCw, Search, Unlink } from 'lucide-react'
import type { DoorayTask } from '@shared/types/dooray'
import { workspaceKey } from '@shared/workspace/workspaceKey'
import { Button, Input, LoadingView } from '../common/ds'

/** 드래그 페이로드 — pane 의 dragover/drop 이 이 타입으로 식별한다. */
export const TASK_DRAG_MIME = 'application/x-clauday-task'

export interface TaskDragPayload {
  projectId: string
  taskId: string
  subject: string
  linked: boolean
}

interface TaskDrawerProps {
  onClose: () => void
}

/**
 * 터미널 우측 태스크 드로어. 카드를 pane 에 끌어다 놓으면 매핑된 저장소로 `cd` 하고 claude 를 띄운다.
 * 🔗 배지는 이미 세션이 연결된 태스크 — 드롭하면 `--resume` 으로 이어간다.
 */
function TaskDrawer({ onClose }: TaskDrawerProps): JSX.Element {
  const [tasks, setTasks] = useState<DoorayTask[]>([])
  const [linked, setLinked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  const load = useCallback(async (force = false): Promise<void> => {
    setLoading(true)
    try {
      const [list, links] = await Promise.all([
        window.api.dooray.tasks.list(undefined, force),
        window.api.workspace.taskDrop.linked().catch(() => [] as string[])
      ])
      setTasks(list)
      setLinked(new Set(links))
    } catch {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    // 드롭 후 매핑이 생기면 배지를 갱신한다
    const onLinked = (): void => {
      void window.api.workspace.taskDrop
        .linked()
        .then((keys) => setLinked(new Set(keys)))
        .catch(() => undefined)
    }
    window.addEventListener('task-session-linked', onLinked)
    return () => window.removeEventListener('task-session-linked', onLinked)
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tasks
    return tasks.filter((t) => t.subject.toLowerCase().includes(q) || String(t.number ?? '').includes(q))
  }, [tasks, query])

  const unlink = async (task: DoorayTask): Promise<void> => {
    await window.api.workspace.taskDrop.unlink(task.projectId, task.id)
    setLinked((prev) => {
      const next = new Set(prev)
      next.delete(workspaceKey(task.projectId, task.id))
      return next
    })
  }

  return (
    <div className="w-[280px] flex-none flex flex-col min-h-0 border-l border-bg-border bg-bg-surface">
      <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-bg-border flex-none">
        <span className="text-[calc(11.5px_*_var(--app-font-scale,1))] font-semibold text-text-primary">내 태스크</span>
        <Button variant="ghost" size="xs" className="ml-auto" onClick={() => void load(true)} aria-label="태스크 새로고침">
          <RefreshCw size={12} />
        </Button>
        <Button variant="ghost" size="xs" onClick={onClose} aria-label="드로어 닫기">
          <ChevronsRight size={13} />
        </Button>
      </div>

      <div className="p-2 border-b border-bg-border flex-none">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <Input
            size="sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="업무 검색"
            className="pl-6.5"
            aria-label="드로어 업무 검색"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-1.5">
        {loading ? (
          <LoadingView label="업무 불러오는 중" />
        ) : filtered.length === 0 ? (
          <p className="p-2 text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary">표시할 업무가 없습니다.</p>
        ) : (
          filtered.map((task) => {
            const isLinked = linked.has(workspaceKey(task.projectId, task.id))
            const payload: TaskDragPayload = {
              projectId: task.projectId,
              taskId: task.id,
              subject: task.subject,
              linked: isLinked
            }
            return (
              <div
                key={task.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(TASK_DRAG_MIME, JSON.stringify(payload))
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                className="ds-card flat cursor-grab active:cursor-grabbing hover:border-clauday-blue/40 transition-colors"
              >
                <div className="flex items-start gap-1.5">
                  {task.number !== undefined && (
                    <span className="font-mono text-[calc(10px_*_var(--app-font-scale,1))] text-clauday-blue mt-0.5">
                      {task.number}
                    </span>
                  )}
                  <span className="flex-1 text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-primary leading-snug line-clamp-2">
                    {task.subject}
                  </span>
                </div>
                {isLinked && (
                  <div className="flex items-center gap-1 mt-1.5">
                    <span className="ds-chip emerald">
                      <Link2 size={9} /> 세션 연결됨
                    </span>
                    <button
                      type="button"
                      onClick={() => void unlink(task)}
                      aria-label={`${task.subject} 세션 연결 해제`}
                      className="text-text-tertiary hover:text-text-primary"
                    >
                      <Unlink size={11} />
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <p className="px-2.5 py-1.5 border-t border-bg-border text-[calc(9.5px_*_var(--app-font-scale,1))] text-text-tertiary flex-none">
        카드를 터미널에 끌어다 놓으면 해당 폴더에서 claude 가 시작됩니다
      </p>
    </div>
  )
}

export default TaskDrawer
