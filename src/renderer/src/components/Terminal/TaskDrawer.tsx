import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronsRight, RefreshCw, Search, Unlink } from 'lucide-react'
import type { DoorayTask } from '@shared/types/dooray'
import type { RepoRegistryEntry, WorkspaceSettings } from '@shared/types/workspace'
import { workspaceKey } from '@shared/workspace/workspaceKey'
import { buildBranchName } from '@shared/workspace/branchName'
import { Button, Input, LoadingView, useToast } from '../common/ds'
import TaskCard from '../Workspace/TaskCard'
import TaskDetailOverlay from '../Workspace/TaskDetailOverlay'
import StartWorkModal, { type StartWorkOptions } from '../Workspace/StartWorkModal'
import { activeRunOf, findWorkspace, useWorkspaces } from '../Workspace/useWorkspaces'

/** 드래그 페이로드 — pane 의 dragover/drop 이 이 타입으로 식별한다. */
export const TASK_DRAG_MIME = 'application/x-clauday-task'

export interface TaskDragPayload {
  projectId: string
  taskId: string
  subject: string
  linked: boolean
}

type WorkflowFilter = 'mine' | 'all' | 'done'

interface TaskDrawerProps {
  onClose: () => void
}

/**
 * 터미널 우측 두레이 패널. 업무 목록에서 바로 워크스페이스(워크트리+브랜치+claude)를 시작하고,
 * 시작된 터미널은 이 뷰의 탭으로 열린다. 카드를 pane 에 끌어다 놓으면 워크트리 없이 가볍게 실행한다.
 */
function TaskDrawer({ onClose }: TaskDrawerProps): JSX.Element {
  const toast = useToast()
  const { byKey, upsert } = useWorkspaces()
  const [tasks, setTasks] = useState<DoorayTask[]>([])
  const [linked, setLinked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<WorkflowFilter>('mine')

  const [selected, setSelected] = useState<DoorayTask | null>(null)
  const [modalTask, setModalTask] = useState<DoorayTask | null>(null)
  const [repos, setRepos] = useState<RepoRegistryEntry[]>([])
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null)
  const [starting, setStarting] = useState<string | null>(null)

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
    void Promise.all([
      window.api.workspace.repos.list().catch(() => [] as RepoRegistryEntry[]),
      window.api.workspace.settings.get().catch(() => null)
    ]).then(([r, s]) => {
      setRepos(r)
      if (s) setSettings(s)
    })
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

  const repoIdFor = useCallback(
    (task: DoorayTask): string | undefined => settings?.lastStart?.repoId ?? repos[0]?.id,
    [settings?.lastStart?.repoId, repos]
  )

  /** 워크스페이스를 시작하고, main 이 만든 run 터미널을 이 뷰의 탭으로 연다. */
  const runStart = useCallback(
    async (task: DoorayTask, options: StartWorkOptions): Promise<void> => {
      setStarting(task.id)
      try {
        const result = await window.api.workspace.startTask({
          projectId: task.projectId,
          taskId: task.id,
          ...options
        })
        upsert(result.workspace)
        if (result.run.terminalSessionId) {
          window.dispatchEvent(
            new CustomEvent('adopt-terminal', {
              detail: { sessionId: result.run.terminalSessionId, name: result.run.branch, cwd: result.run.worktreePath }
            })
          )
        }
        toast[result.reused ? 'info' : 'success'](
          result.reused ? '이미 진행 중인 작업입니다' : '워크스페이스 시작됨',
          result.run.branch
        )
        for (const w of result.warnings) toast.warn('일부 단계 건너뜀', w)
      } catch (err) {
        toast.error('워크스페이스 시작 실패', err instanceof Error ? err.message : String(err))
      } finally {
        setStarting(null)
      }
    },
    [toast, upsert]
  )

  const quickStart = useCallback(
    (task: DoorayTask): void => {
      if (!settings) return
      const repoId = repoIdFor(task)
      if (!repoId) {
        toast.error('저장소가 등록되어 있지 않습니다', '설정 → 워크스페이스에서 저장소를 추가하세요')
        return
      }
      void runStart(task, {
        repoId,
        autoApprove: settings.autoApproveDefault,
        transitionDooray: settings.transitionDoorayDefault,
        commentBranch: settings.commentBranchDefault,
        fetchBeforeCreate: settings.lastStart?.fetchBeforeCreate ?? true
      })
    },
    [settings, repoIdFor, runStart, toast]
  )

  /** 워크스페이스가 이미 있으면 그 터미널 탭으로 이동, 없으면 상세 오버레이를 연다. */
  const onCardClick = useCallback(
    (task: DoorayTask): void => {
      const ws = findWorkspace(byKey, task.projectId, task.id)
      const run = activeRunOf(ws)
      if (run?.terminalSessionId) {
        window.dispatchEvent(
          new CustomEvent('adopt-terminal', {
            detail: { sessionId: run.terminalSessionId, name: run.branch, cwd: run.worktreePath }
          })
        )
        return
      }
      setSelected(task)
    },
    [byKey]
  )

  const unlink = async (task: DoorayTask): Promise<void> => {
    await window.api.workspace.taskDrop.unlink(task.projectId, task.id)
    setLinked((prev) => {
      const next = new Set(prev)
      next.delete(workspaceKey(task.projectId, task.id))
      return next
    })
  }

  const branchPreview = (task: DoorayTask): string => {
    if (!settings) return ''
    const repo = repos.find((r) => r.id === repoIdFor(task))
    return buildBranchName({
      template: settings.branchTemplate,
      projectCode: task.projectCode,
      taskNumber: task.number,
      taskId: task.id,
      subject: task.subject,
      prefix: repo?.branchPrefix
    })
  }

  return (
    <>
      <div className="w-[320px] flex-none flex flex-col min-h-0 border-l border-bg-border bg-bg-base">
        <div className="flex items-center gap-1 px-3 py-2.5 flex-none">
          <span className="text-[calc(12px_*_var(--app-font-scale,1))] font-semibold text-text-primary">두레이 업무</span>
          <Button variant="ghost" size="xs" className="ml-auto" onClick={() => void load(true)} aria-label="업무 새로고침">
            <RefreshCw size={12} />
          </Button>
          <Button variant="ghost" size="xs" onClick={onClose} aria-label="패널 닫기">
            <ChevronsRight size={13} />
          </Button>
        </div>

        <div className="px-3 pb-2.5 flex flex-col gap-2 flex-none">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="업무 검색"
              className="pl-7"
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
                className={`ds-chip ${filter === key ? 'blue' : 'neutral'} cursor-pointer`}
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
            <p className="p-4 text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-tertiary">표시할 업무가 없습니다.</p>
          ) : (
            filtered.map((task) => {
              const key = workspaceKey(task.projectId, task.id)
              const ws = byKey.get(key)
              const run = activeRunOf(ws)
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
                  branch={ws?.branch}
                  runStatus={run?.status}
                  linked={isLinked}
                  onSelect={onCardClick}
                  draggableProps={{
                    draggable: true,
                    onDragStart: (e) => {
                      e.dataTransfer.setData(TASK_DRAG_MIME, JSON.stringify(payload))
                      e.dataTransfer.effectAllowed = 'copy'
                    }
                  }}
                >
                  {isLinked && !ws && (
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
          hasWorkspace={Boolean(findWorkspace(byKey, selected.projectId, selected.id)?.activeRunId)}
          onClose={() => setSelected(null)}
          onStart={() => {
            setModalTask(selected)
            setSelected(null)
          }}
          onStartHere={() => {
            const task = selected
            setSelected(null)
            quickStart(task)
          }}
          promptText={(detail) =>
            `다음 두레이 업무를 구현해줘: ${selected.subject}\n\n${detail?.body?.content ?? ''}`.trim()
          }
        />
      )}

      {modalTask && settings && (
        <StartWorkModal
          open
          task={modalTask}
          repos={repos}
          settings={settings}
          mappedRepoId={repoIdFor(modalTask)}
          branchPreviewHint={branchPreview(modalTask)}
          busy={starting === modalTask.id}
          onClose={() => setModalTask(null)}
          onStart={(options) => {
            const task = modalTask
            setModalTask(null)
            void runStart(task, options)
          }}
        />
      )}
    </>
  )
}

export default TaskDrawer
