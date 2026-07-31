import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardList, RefreshCw, Search, X } from 'lucide-react'
import type { DoorayTask } from '@shared/types/dooray'
import type { TaskSessionLink } from '@shared/types/workspace'
import { workspaceKey } from '@shared/workspace/workspaceKey'
import { Button, Input, LoadingView } from '../common/ds'
import ProjectFilter from '../common/ProjectFilter'
import TaskCard from '../Workspace/TaskCard'
import TaskDetailOverlay from '../Workspace/TaskDetailOverlay'
import TaskFilterMenu from './TaskFilterMenu'
import {
  EMPTY_TASK_FILTER,
  TASK_FACET_LABELS,
  activeFilterChips,
  clearDetailFilters,
  collectFacets,
  filterTasks,
  scopedTasks,
  toggleFilterFacet,
  type TaskFilterState,
  type TaskScope
} from './taskFilter'

/** 드래그 페이로드 — pane 의 dragover/drop 이 이 타입으로 식별한다. */
export const TASK_DRAG_MIME = 'application/x-clauday-task'

export interface TaskDragPayload {
  projectId: string
  taskId: string
  subject: string
  /** 첫 지시 템플릿의 `{number}` `{project}` `{ref}` 치환용 */
  number?: number
  projectCode?: string
  linked: boolean
}

/** 이 패널이 보여줄 프로젝트 — 두레이 뷰의 핀과 분리해 별도 키로 관리한다. */
const PROJECTS_SETTINGS_KEY = 'terminalTaskProjects'

const SCOPE_TABS: [TaskScope, string][] = [
  ['mine', '내 업무'],
  ['all', '전체'],
  ['done', '완료']
]

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
  /** `projectId:taskId` → 폴더별 세션. 한 업무가 여러 저장소에 걸칠 수 있다. */
  const [links, setLinks] = useState<Record<string, TaskSessionLink[]>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<TaskFilterState>(EMPTY_TASK_FILTER)
  const [selected, setSelected] = useState<DoorayTask | null>(null)

  const load = useCallback(async (force = false): Promise<void> => {
    setLoading(true)
    try {
      const projectIds = ((await window.api.settings.get(PROJECTS_SETTINGS_KEY)) as string[] | null) ?? []
      const [list, linkMap] = await Promise.all([
        // 프로젝트를 고르지 않았으면 목록을 비운다 — 수백 건을 쏟아붓지 않는다
        projectIds.length > 0 ? window.api.dooray.tasks.list(projectIds, force) : Promise.resolve([]),
        window.api.workspace.taskDrop.linked().catch(() => ({}) as Record<string, TaskSessionLink[]>)
      ])
      setTasks(list)
      setLinks(linkMap)
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
        .then(setLinks)
        .catch(() => undefined)
    }
    window.addEventListener('task-session-linked', onLinked)
    // main 이 세션을 찾아 연결하면 그 즉시 배지를 붙인다.
    const offPush = window.api.workspace.taskDrop.onLinked(onLinked)
    return () => {
      window.removeEventListener('task-session-linked', onLinked)
      offPush()
    }
  }, [load])

  const filtered = useMemo(() => filterTasks(tasks, filter), [tasks, filter])

  // 고를 수 있는 값은 갈래·검색어까지 좁힌 목록에서 뽑는다 — 지금 화면에 없는 값을 권하지 않는다.
  const facets = useMemo(
    () => collectFacets(scopedTasks(tasks, filter), filter),
    [tasks, filter]
  )
  const chips = activeFilterChips(filter)

  /** 저장소 배지 클릭 — 그 폴더의 세션을 새 터미널 탭에서 이어간다. */
  const resumeSession = (task: DoorayTask, link: TaskSessionLink): void => {
    void window.api.workspace.taskDrop.touch(task.projectId, task.id, link.cwd)
    window.dispatchEvent(
      new CustomEvent('create-terminal', {
        detail: { cwd: link.cwd, initialCommand: `claude --resume ${link.claudeSessionId}` }
      })
    )
  }

  return (
    <>
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-3 pt-2.5 pb-2.5 flex flex-col gap-2 flex-none">
          <div className="flex items-center gap-1">
            <ClipboardList size={13} className="text-brand-dooray flex-none" />
            <span className="text-[calc(11.5px_*_var(--app-font-scale,1))] font-semibold text-text-primary">두레이 업무</span>
            {/* 프로젝트 선택은 자기 줄을 차지할 만큼 자주 쓰지 않는다 — 헤더 아이콘으로 접어둔다. */}
            <div className="ml-auto flex items-center gap-0.5 flex-none">
              <ProjectFilter settingsKey={PROJECTS_SETTINGS_KEY} readOnly showSettingsLink onChanged={() => void load(true)} />
              <Button variant="ghost" size="xs" onClick={() => void load(true)} aria-label="업무 새로고침">
                <RefreshCw size={12} />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="relative flex-1 min-w-0">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <Input
                value={filter.query}
                onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
                placeholder="업무 검색"
                style={{ paddingLeft: 28 }}
                aria-label="업무 검색"
              />
            </div>
            <TaskFilterMenu facets={facets} state={filter} onChange={setFilter} />
          </div>
          <div className="flex items-center gap-1">
            {SCOPE_TABS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter((f) => ({ ...f, scope: key }))}
                className={`ds-chip ${filter.scope === key ? 'selected' : 'neutral'} cursor-pointer`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* 걸린 상세 필터는 밖에 내놓는다 — 접어두면 "왜 안 보이지" 가 된다. */}
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {chips.map((chip) => (
                <button
                  key={`${chip.key}:${chip.value}`}
                  type="button"
                  onClick={() => setFilter((f) => toggleFilterFacet(f, chip.key, chip.value))}
                  title={`${TASK_FACET_LABELS[chip.key]} · ${chip.value} 빼기`}
                  aria-label={`${TASK_FACET_LABELS[chip.key]} ${chip.value} 필터 빼기`}
                  className="ds-chip selected cursor-pointer max-w-full"
                >
                  <span className="min-w-0 truncate">{chip.value}</span>
                  <X size={9} className="flex-none" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto border-t border-bg-border">
          {loading ? (
            <LoadingView label="업무 불러오는 중" />
          ) : filtered.length === 0 ? (
            <div className="p-4 flex flex-col items-start gap-2">
              <p className="text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-tertiary leading-relaxed">
                {tasks.length === 0
                  ? '위의 프로젝트 선택에서 작업할 두레이 프로젝트를 고르면 내 업무가 여기 표시됩니다.'
                  : chips.length > 0
                    ? '상세 검색까지 걸린 조건에 맞는 업무가 없습니다.'
                    : '조건에 맞는 업무가 없습니다.'}
              </p>
              {tasks.length > 0 && chips.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilter((f) => clearDetailFilters(f))}
                  className="text-[calc(11px_*_var(--app-font-scale,1))] text-link hover:underline"
                >
                  상세 검색 지우기
                </button>
              )}
            </div>
          ) : (
            filtered.map((task) => {
              const key = workspaceKey(task.projectId, task.id)
              const taskLinks = links[key] ?? []
              const isLinked = taskLinks.length > 0
              const payload: TaskDragPayload = {
                projectId: task.projectId,
                taskId: task.id,
                subject: task.subject,
                number: task.number,
                projectCode: task.projectCode,
                linked: isLinked
              }
              return (
                <TaskCard
                  key={task.id}
                  task={task}
                  sessions={taskLinks}
                  onResumeSession={(link) => resumeSession(task, link)}
                  onSelect={setSelected}
                  draggableProps={{
                    draggable: true,
                    onDragStart: (e) => {
                      e.dataTransfer.setData(TASK_DRAG_MIME, JSON.stringify(payload))
                      e.dataTransfer.effectAllowed = 'copy'
                    }
                  }}
                >
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
