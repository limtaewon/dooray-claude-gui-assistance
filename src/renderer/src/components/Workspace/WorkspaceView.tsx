import { useCallback, useEffect, useMemo, useState } from 'react'
import { FolderGit2, KanbanSquare, PanelRightClose, PanelRightOpen, RefreshCw, Search } from 'lucide-react'
import type { DoorayTask } from '@shared/types/dooray'
import type { RepoRegistryEntry, TaskWorkspace, WorkspaceSettings } from '@shared/types/workspace'
import { buildBranchName } from '@shared/workspace/branchName'
import TaskRow from '../Dooray/TaskRow'
import TaskDetailPanel from '../Dooray/TaskDetailPanel'
import { Button, EmptyView, Input, LoadingView, useToast } from '../common/ds'
import StartWorkButton from './StartWorkButton'
import StartWorkModal, { type StartWorkOptions } from './StartWorkModal'
import WorkspacePanel from './WorkspacePanel'
import TaskSidePanel from './TaskSidePanel'
import { activeRunOf, findWorkspace, useWorkspaces } from './useWorkspaces'
import { runStatusDotClass } from './runStatus'

interface WorkspaceViewProps {
  active: boolean
}

type WorkflowFilter = 'all' | 'working' | 'registered'

/**
 * 통합 워크스페이스 뷰 — 두레이 태스크에서 워크트리+브랜치+claude 터미널까지 한 화면에서 시작한다.
 * 여러 태스크(브랜치)를 동시에 굴리고 좌측 목록에서 전환하는 것이 기본 사용 방식이다.
 */
function WorkspaceView({ active }: WorkspaceViewProps): JSX.Element {
  const toast = useToast()
  const { byKey, reload: reloadWorkspaces, upsert } = useWorkspaces()

  const [tasks, setTasks] = useState<DoorayTask[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [wfFilter, setWfFilter] = useState<WorkflowFilter>('all')
  const [selected, setSelected] = useState<DoorayTask | null>(null)
  const [sideOpen, setSideOpen] = useState(true)

  const [repos, setRepos] = useState<RepoRegistryEntry[]>([])
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null)
  const [projectRepoMap, setProjectRepoMap] = useState<Record<string, string>>({})
  const [modalOpen, setModalOpen] = useState(false)
  const [starting, setStarting] = useState<string | null>(null)

  const loadTasks = useCallback(async (force = false): Promise<void> => {
    setTasksLoading(true)
    try {
      setTasks(await window.api.dooray.tasks.list(undefined, force))
    } catch {
      setTasks([])
    } finally {
      setTasksLoading(false)
    }
  }, [])

  const loadConfig = useCallback(async (): Promise<void> => {
    const [r, s] = await Promise.all([
      window.api.workspace.repos.list().catch(() => [] as RepoRegistryEntry[]),
      window.api.workspace.settings.get().catch(() => null)
    ])
    setRepos(r)
    if (s) setSettings(s)
  }, [])

  useEffect(() => {
    void loadTasks()
    void loadConfig()
  }, [loadTasks, loadConfig])

  // 다른 화면(설정)에서 저장소를 추가했을 수 있으므로 뷰 재진입 시 갱신
  useEffect(() => {
    if (active) void loadConfig()
  }, [active, loadConfig])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tasks.filter((t) => {
      if (wfFilter === 'working' && t.workflowClass !== 'working') return false
      if (wfFilter === 'registered' && t.workflowClass !== 'registered') return false
      if (q && !t.subject.toLowerCase().includes(q) && !String(t.number ?? '').includes(q)) return false
      return true
    })
  }, [tasks, query, wfFilter])

  const workspace = selected ? findWorkspace(byKey, selected.projectId, selected.id) : undefined
  const run = activeRunOf(workspace)
  const liveCount = useMemo(
    () => [...byKey.values()].filter((w) => w.status === 'active' && w.activeRunId).length,
    [byKey]
  )

  const repoIdFor = useCallback(
    (task: DoorayTask): string | undefined => projectRepoMap[task.projectId] ?? settings?.lastStart?.repoId ?? repos[0]?.id,
    [projectRepoMap, settings?.lastStart?.repoId, repos]
  )

  const startSummary = useMemo(() => {
    if (!selected || !settings) return ''
    const repo = repos.find((r) => r.id === repoIdFor(selected))
    if (!repo) return '저장소 미등록 — 설정에서 추가하세요'
    const branch = buildBranchName({
      template: settings.branchTemplate,
      projectCode: selected.projectCode,
      taskNumber: selected.number,
      taskId: selected.id,
      subject: selected.subject,
      prefix: repo.branchPrefix
    })
    const base = repo.defaultBaseBranch || settings.defaultBaseBranch || 'HEAD'
    return `${repo.name} · ${base} · ${branch} · 에이전트 1`
  }, [selected, settings, repos, repoIdFor])

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
        if (options.rememberRepoForProject && options.repoId) {
          setProjectRepoMap((prev) => ({ ...prev, [task.projectId]: options.repoId as string }))
        }
        if (result.reused) {
          toast.info('이미 진행 중인 작업입니다', result.run.branch)
        } else {
          toast.success('작업 시작됨', result.run.branch)
        }
        for (const w of result.warnings) toast.warn('일부 단계 건너뜀', w)
      } catch (err) {
        toast.error('작업 시작 실패', err instanceof Error ? err.message : String(err))
      } finally {
        setStarting(null)
      }
    },
    [toast, upsert]
  )

  const quickStart = useCallback(
    (task: DoorayTask, overrides: StartWorkOptions = {}): void => {
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
        fetchBeforeCreate: settings.lastStart?.fetchBeforeCreate ?? true,
        ...overrides
      })
    },
    [settings, repoIdFor, runStart, toast]
  )

  const onResume = useCallback(async (): Promise<void> => {
    if (!run) return
    try {
      const result = await window.api.workspace.run.resume({ runId: run.runId })
      upsert(result.workspace)
      for (const w of result.warnings) toast.warn('재연결 경고', w)
    } catch (err) {
      toast.error('재연결 실패', err instanceof Error ? err.message : String(err))
    }
  }, [run, toast, upsert])

  const onAdopt = useCallback(async (): Promise<void> => {
    if (!run) return
    try {
      upsert((await window.api.workspace.run.adopt(run.runId)).workspace)
      toast.success('채택됨', run.branch)
    } catch (err) {
      toast.error('채택 실패', err instanceof Error ? err.message : String(err))
    }
  }, [run, toast, upsert])

  const onCleanup = useCallback(async (): Promise<void> => {
    if (!run) return
    const ok = window.confirm(`${run.branch} 워크트리를 정리할까요?\n미커밋 변경이 있으면 함께 사라집니다.`)
    if (!ok) return
    try {
      const result = await window.api.workspace.run.cleanup({ runId: run.runId, force: true })
      upsert(result.workspace)
      for (const w of result.warnings) toast.warn('정리 경고', w)
      toast.success('정리 완료')
      void reloadWorkspaces()
    } catch (err) {
      toast.error('정리 실패', err instanceof Error ? err.message : String(err))
    }
  }, [run, toast, upsert, reloadWorkspaces])

  const renderCenter = (): JSX.Element => {
    if (!selected) {
      return (
        <EmptyView
          icon={KanbanSquare}
          title="태스크를 선택하세요"
          body="왼쪽에서 두레이 업무를 고르면 워크트리와 브랜치를 만들어 바로 작업을 시작할 수 있습니다."
        />
      )
    }
    if (workspace && run && workspace.status !== 'archived') {
      return (
        <WorkspacePanel
          workspace={workspace}
          run={run}
          isVisible={active}
          onResume={() => void onResume()}
          onAdopt={() => void onAdopt()}
          onCleanup={() => void onCleanup()}
        />
      )
    }
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-start justify-end gap-2 px-4 py-2.5 border-b border-bg-border flex-none">
          <StartWorkButton
            summary={startSummary}
            busy={starting === selected.id}
            busyLabel="워크트리 생성 중…"
            disabled={!settings}
            onQuickStart={() => quickStart(selected)}
            onConfigure={() => setModalOpen(true)}
            onTerminalOnly={() => quickStart(selected, { prompt: undefined })}
          />
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <TaskDetailPanel task={selected} onClose={() => setSelected(null)} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[300px] flex-none flex flex-col min-h-0 border-r border-bg-border">
        <div className="p-2.5 border-b border-bg-border flex flex-col gap-2 flex-none">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <Input
                size="sm"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="업무 검색"
                className="pl-7"
                aria-label="업무 검색"
              />
            </div>
            <Button variant="ghost" size="sm" onClick={() => void loadTasks(true)} aria-label="새로고침">
              <RefreshCw size={13} />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            {(
              [
                ['all', '전체'],
                ['working', '진행중'],
                ['registered', '등록됨']
              ] as [WorkflowFilter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setWfFilter(key)}
                className={`ds-chip ${wfFilter === key ? 'blue' : 'neutral'} cursor-pointer`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {tasksLoading ? (
            <LoadingView label="내 업무를 불러오는 중" />
          ) : filtered.length === 0 ? (
            <EmptyView icon={KanbanSquare} title="표시할 업무가 없습니다" />
          ) : (
            filtered.map((task) => {
              const ws = findWorkspace(byKey, task.projectId, task.id)
              const wsRun = activeRunOf(ws)
              return (
                <div key={task.id} className="relative">
                  <TaskRow
                    task={task}
                    isSelected={selected?.id === task.id}
                    currentTagFilter=""
                    onSelect={setSelected}
                    onToggleTag={() => undefined}
                  />
                  {ws && wsRun && (
                    <div className="flex items-center gap-1.5 px-4 pb-2 -mt-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-none ${runStatusDotClass(wsRun.status)}`} />
                      <span className="font-mono text-[calc(9.5px_*_var(--app-font-scale,1))] text-text-tertiary truncate">
                        {ws.branch}
                      </span>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="px-3 py-1.5 border-t border-bg-border text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary flex-none">
          작업 중 {liveCount} · 업무 {filtered.length}
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-bg-border flex-none">
          <FolderGit2 size={14} className="text-clauday-blue" />
          <span className="text-[calc(12px_*_var(--app-font-scale,1))] font-medium text-text-primary">워크스페이스</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setSideOpen((v) => !v)}
            disabled={!selected}
          >
            {sideOpen ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />} 업무 상세
          </Button>
        </div>
        <div className="flex-1 min-h-0">{renderCenter()}</div>
      </div>

      {sideOpen && selected && (
        <div className="w-[340px] flex-none min-h-0">
          <TaskSidePanel task={selected} run={run} onClose={() => setSideOpen(false)} />
        </div>
      )}

      {selected && settings && (
        <StartWorkModal
          open={modalOpen}
          task={selected}
          repos={repos}
          settings={settings}
          mappedRepoId={repoIdFor(selected)}
          onClose={() => setModalOpen(false)}
          onStart={(options) => {
            setModalOpen(false)
            void runStart(selected, options)
          }}
        />
      )}
    </div>
  )
}

export default WorkspaceView
