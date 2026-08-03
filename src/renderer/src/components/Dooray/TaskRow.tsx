import { memo } from 'react'
import { Circle, ChevronRight } from 'lucide-react'
import type { DoorayTask } from '../../../../shared/types/dooray'
import { WORKFLOW_ICONS, WORKFLOW_COLORS, WORKFLOW_BG_COLORS, getWorkflowName, tagStyle } from './taskStyles'

/** 메모이즈된 태스크 로우 (참조 바뀔 때만 재렌더) */
export interface TaskRowProps {
  task: DoorayTask
  isSelected: boolean
  currentTagFilter: string
  onSelect: (task: DoorayTask) => void
  onToggleTag: (tagKey: string) => void
}

/** TaskRow memo 비교 함수 — 원본 인라인 comparator 승격 (ADR-v2-workspace-p0-03). 조건식 6줄은 원본과 동일. */
export function taskRowPropsAreEqual(prev: TaskRowProps, next: TaskRowProps): boolean {
  return (
    prev.task.id === next.task.id &&
    prev.task.subject === next.task.subject &&
    prev.task.workflowClass === next.task.workflowClass &&
    prev.task.tags === next.task.tags &&
    prev.isSelected === next.isSelected &&
    prev.currentTagFilter === next.currentTagFilter
  )
}

const TaskRow = memo(function TaskRow({ task, isSelected, currentTagFilter, onSelect, onToggleTag }: TaskRowProps): JSX.Element {
  const wf = task.workflowClass || 'registered'
  const Icon = WORKFLOW_ICONS[wf] || Circle
  const color = WORKFLOW_COLORS[wf]
  const wfName = getWorkflowName(task)
  return (
    <div
      onClick={() => onSelect(task)}
      // content-visibility: 뷰포트 밖에 있을 때 렌더 스킵 (브라우저 내장 가상화)
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 60px' }}
      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
        isSelected ? 'bg-bg-active' : 'hover:bg-bg-surface-hover'
      }`}
    >
      <Icon size={14} className={`flex-shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-text-primary truncate">{task.subject}</p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className={`text-[calc(11px_*_var(--app-font-scale,1))] px-1.5 py-0.5 rounded-full ${WORKFLOW_BG_COLORS[wf] || 'bg-gray-500/10 text-gray-400'}`}>
            {wfName}
          </span>
          {task.tags && task.tags.length > 0 && (() => {
            const MAX_VISIBLE = 3
            const visible = task.tags.slice(0, MAX_VISIBLE)
            const hidden = task.tags.length - MAX_VISIBLE
            return (
              <>
                {visible.map((tag) => (
                  <span
                    key={tag.id}
                    className="text-[calc(11px_*_var(--app-font-scale,1))] px-1.5 py-0.5 rounded-full border"
                    style={tagStyle(tag.color)}
                    onClick={(e) => { e.stopPropagation(); onToggleTag(tag.name || tag.id) }}
                  >
                    {tag.name || tag.id}
                  </span>
                ))}
                {hidden > 0 && (
                  <span
                    className="text-[calc(11px_*_var(--app-font-scale,1))] px-1.5 py-0.5 rounded-full bg-bg-surface border border-bg-border text-text-tertiary cursor-default"
                    title={task.tags.slice(MAX_VISIBLE).map((t) => t.name || t.id).join(', ')}
                  >
                    +{hidden}
                  </span>
                )}
              </>
            )
          })()}
          {task.milestone?.name && (
            <span className="text-[calc(11px_*_var(--app-font-scale,1))] px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400">
              {task.milestone.name}
            </span>
          )}
          {task.dueDateAt && (
            <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary">
              마감 {new Date(task.dueDateAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={12} className="text-text-tertiary flex-shrink-0" />
    </div>
  )
}, taskRowPropsAreEqual)

export { TaskRow }
export default TaskRow
