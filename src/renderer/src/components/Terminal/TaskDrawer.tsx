import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardList, RefreshCw, Search, Unlink } from 'lucide-react'
import type { DoorayTask } from '@shared/types/dooray'
import { workspaceKey } from '@shared/workspace/workspaceKey'
import { Button, Input, LoadingView } from '../common/ds'
import ProjectFilter from '../common/ProjectFilter'
import TaskCard from '../Workspace/TaskCard'
import TaskDetailOverlay from '../Workspace/TaskDetailOverlay'

/** 드래그 페이로드 — pane 의 dragover/drop 이 이 타입으로 식별한다. */
export const TASK_DRAG_MIME = 'application/x-clauday-task'

export interface TaskDragPayload {
  projectId: string
  taskId: string
  subject: string
  linked: boolean
}

/** 이 패널이 보여줄 프로젝트 — 두레이 뷰의 핀과 분리해 별도 키로 관리한다. */
const PROJECTS_SETTINGS_KEY = 'terminalTaskProjects'

type WorkflowFilter = 'mine' | 'all' | 'done'

interface TaskDrawerProps {
  /** 카드를 특정 pane 없이 "터미널에서 시작" 할 때 — 호스트가 활성 pane 에 실행한다 */
  onRunInTerminal?: (task: DoorayTask) => void
}

/**
 * 터미널 우측 두레이 패널. 설정에서 고른 프로젝트의 내 업무를 보여주고,
 * 카드를 pane 에 끌어다 놓으면 매핑된 저장소로 `cd` 하고 claude 를 띄운다(세션은 태스크에 매핑).
 * 워크트리 생성은 이 패널의 책임이 아니다 — '브랜치 작업' 뷰가 담당한다.
 */
function TaskDrawer({ onRunInTerminal }: TaskDrawerProps): JSX.Element {
  const [tasks, setTasks] = useState<DoorayTask[]>([])
  const [linked, setLinked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<WorkflowFilter>('mine')
  const [selected, setSelected] = useState<DoorayTask | null>(null)

  const load = useCallback(async (force = false): Promise<void> => {
    setLoading(true)
    try {
      const projectIds = ((await window.api.settings.get(PROJECTS_SETTINGS_KEY)) as string[] | null) ?? []
      const [list, links] = await Promise.all([
        // 프로젝트를 고르지 않았으면 목록을 비운다 — 수백 건을 쏟아붓지 않는다
        projectIds.length > 0 ? window.api.dooray.tasks.list(projectIds, force) : Promise.resolve([]),
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
    return tasks.filter((t) => {
      if (filter === 'done' && t.workflowClass !== 'closed') return false
      if (filter === 'mine' && t.workflowClass === 'closed') return false
      if (q && !t.subject.toLowerCase().includes(q) && !String(t.number ?? '').includes(q)) return false
      return true
    })
  }, [tasks, query, filter])

  const unlink = async (task: DoorayTask): Promise<void> => {
    await window.api.workspace.taskDrop.unlink(task.projectId, task.id)
    setLinked((prev) => {
      const next = new Set(prev)
      next.delete(workspaceKey(task.projectId, task.id))
      return next
    })
  }

  return (
    <>
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-3 pt-2.5 pb-2.5 flex flex-col gap-2 flex-none">
          <div className="flex items-center gap-1">
            <ClipboardList size={13} className="text-brand-dooray flex-none" />
            <span className="text-[calc(11.5px_*_var(--app-font-scale,1))] font-semibold text-text-primary">두레이 업무</span>
            <Button variant="ghost" size="xs" className="ml-auto" onClick={() => void load(true)} aria-label="업무 새로고침">
              <RefreshCw size={12} />
            </Button>
          </div>
          <ProjectFilter settingsKey={PROJECTS_SETTINGS_KEY} onChanged={() => void load(true)} />
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="업무 검색"
              style={{ paddingLeft: 28 }}
              aria-label="업무 검색"
            />
          </div>
          <div className="flex items-center gap-1">
            {(
              [
                ['mine', '내 업무'],
                ['all', '전체'],
                ['done', '완료']
              ] as [WorkflowFilter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`ds-chip ${filter === key ? 'selected' : 'neutral'} cursor-pointer`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto border-t border-bg-border">
          {loading ? (
            <LoadingView label="업무 불러오는 중" />
          ) : filtered.length === 0 ? (
            <p className="p-4 text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-tertiary leading-relaxed">
              {tasks.length === 0
                ? '위의 프로젝트 선택에서 작업할 두레이 프로젝트를 고르면 내 업무가 여기 표시됩니다.'
                : '조건에 맞는 업무가 없습니다.'}
            </p>
          ) : (
            filtered.map((task) => {
              const key = workspaceKey(task.projectId, task.id)
              const isLinked = linked.has(key)
              const payload: TaskDragPayload = {
                projectId: task.projectId,
                taskId: task.id,
                subject: task.subject,
                linked: isLinked
              }
              return (
                <TaskCard
                  key={task.id}
                  task={task}
                  linked={isLinked}
                  onSelect={setSelected}
                  draggableProps={{
                    draggable: true,
                    onDragStart: (e) => {
                      e.dataTransfer.setData(TASK_DRAG_MIME, JSON.stringify(payload))
                      e.dataTransfer.effectAllowed = 'copy'
                    }
                  }}
                >
                  {isLinked && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        void unlink(task)
                      }}
                      aria-label={`${task.subject} 세션 연결 해제`}
                      className="text-text-tertiary hover:text-text-primary"
                    >
                      <Unlink size={11} />
                    </button>
                  )}
                </TaskCard>
              )
            })
          )}
        </div>

        <p className="px-3 py-2 border-t border-bg-border text-[calc(9.5px_*_var(--app-font-scale,1))] text-text-tertiary flex-none">
          카드를 클릭하면 상세 · 터미널로 끌어다 놓으면 그 폴더에서 바로 시작
        </p>
      </div>

      {selected && (
        <TaskDetailOverlay
          task={selected}
          onClose={() => setSelected(null)}
          onRunInTerminal={
            onRunInTerminal
              ? () => {
                  const task = selected
                  setSelected(null)
                  onRunInTerminal(task)
                }
              : undefined
          }
          promptText={(detail) =>
            `다음 두레이 업무를 구현해줘: ${selected.subject}\n\n${detail?.body?.content ?? ''}`.trim()
          }
        />
      )}
    </>
  )
}

export default TaskDrawer
