import { memo } from 'react'
import type { DoorayTask } from '@shared/types/dooray'
import type { AgentRunStatus } from '@shared/types/workspace'
import { getWorkflowName } from '../Dooray/taskStyles'
import { runStatusDotClass } from './runStatus'

export interface TaskCardProps {
  task: DoorayTask
  selected?: boolean
  /** 워크스페이스가 있으면 브랜치명 + run 상태를 하단에 붙인다 */
  branch?: string
  runStatus?: AgentRunStatus
  /** 세션만 연결된 경우(터미널 드로어) */
  linked?: boolean
  onSelect?: (task: DoorayTask) => void
  /** 드래그 가능 카드로 만들 때 */
  draggableProps?: {
    draggable: true
    onDragStart: (e: React.DragEvent) => void
  }
  children?: React.ReactNode
}

/** 워크플로우 상태 → 칩 색. 두레이 상태명이 자유 문자열이라 class 로만 판정한다. */
function workflowChipClass(task: DoorayTask): string {
  switch (task.workflowClass) {
    case 'working':
      return 'blue'
    case 'closed':
      return 'emerald'
    case 'backlog':
      return 'neutral'
    default:
      return 'neutral'
  }
}

/**
 * 두레이 업무 카드 — `프로젝트/번호` → 제목 → 상태 3단 위계.
 * 워크스페이스 목록과 터미널 태스크 드로어가 공유한다.
 */
const TaskCard = memo(function TaskCard({
  task,
  selected = false,
  branch,
  runStatus,
  linked = false,
  onSelect,
  draggableProps,
  children
}: TaskCardProps): JSX.Element {
  const ref = task.projectCode ? `${task.projectCode}/${task.number ?? ''}` : String(task.number ?? '')
  return (
    <div
      {...draggableProps}
      onClick={onSelect ? () => onSelect(task) : undefined}
      // content-visibility: 뷰포트 밖 렌더 스킵 (긴 목록에서 브라우저 내장 가상화)
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 92px' }}
      className={`px-4 py-3 border-b border-bg-border cursor-pointer transition-colors ${
        selected ? 'bg-bg-surface-hover' : 'hover:bg-bg-surface'
      }`}
    >
      {ref && (
        <div className="font-mono text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary mb-1">{ref}</div>
      )}
      <div className="text-[calc(13px_*_var(--app-font-scale,1))] text-text-primary leading-snug line-clamp-2">
        {task.subject}
      </div>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className={`ds-chip ${workflowChipClass(task)}`}>{getWorkflowName(task)}</span>
        {branch && runStatus && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">
            <span className={`w-1.5 h-1.5 rounded-full flex-none ${runStatusDotClass(runStatus)}`} />
            {branch}
          </span>
        )}
        {linked && !branch && <span className="ds-chip emerald">세션 연결됨</span>}
        {children}
      </div>
    </div>
  )
})

export default TaskCard
