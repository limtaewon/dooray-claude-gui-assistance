import { memo } from 'react'
import { Play } from 'lucide-react'
import type { DoorayTask } from '@shared/types/dooray'
import type { AgentRunStatus, TaskSessionLink } from '@shared/types/workspace'
import { getWorkflowName, tagStyle } from '../Dooray/taskStyles'
import { runStatusDotClass } from './runStatus'

/** 카드에 그대로 보여줄 태그 수 — 넘치면 `+N` 으로 접는다(좁은 패널에서 줄이 터진다). */
const MAX_VISIBLE_TAGS = 3

export interface TaskCardProps {
  task: DoorayTask
  selected?: boolean
  /** 워크스페이스가 있으면 브랜치명 + run 상태를 하단에 붙인다 */
  branch?: string
  runStatus?: AgentRunStatus
  /**
   * 이 업무가 폴더별로 쓰던 claude 세션 (최근 사용순).
   * 한 업무가 여러 저장소에 걸치므로 배지도 폴더마다 하나씩 붙는다.
   */
  sessions?: TaskSessionLink[]
  /** 저장소 배지를 눌렀을 때 — 그 폴더의 세션을 이어서 연다 */
  onResumeSession?: (link: TaskSessionLink) => void
  onSelect?: (task: DoorayTask) => void
  /** 지난번에 본 뒤로 댓글·상태가 바뀐 업무 — 점으로 알린다 */
  changed?: boolean
  /**
   * 태그 칩을 눌렀을 때 — 그 태그로 목록을 좁힌다.
   * 주면 태그를 그리고, 안 주면 그리지 않는다(태그 필터가 없는 화면에서 누를 데가 생기면 안 된다).
   */
  onToggleTag?: (tagName: string) => void
  /** 지금 걸려 있는 태그 — 눌린 상태로 보인다 */
  activeTags?: string[]
  /** 드래그 가능 카드로 만들 때 */
  draggableProps?: {
    draggable: true
    onDragStart: (e: React.DragEvent) => void
  }
  children?: React.ReactNode
}

function basename(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() || path
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
  sessions,
  onResumeSession,
  onSelect,
  changed = false,
  onToggleTag,
  activeTags,
  draggableProps,
  children
}: TaskCardProps): JSX.Element {
  const ref = task.projectCode ? `${task.projectCode}/${task.number ?? ''}` : String(task.number ?? '')
  const tags = onToggleTag ? (task.tags ?? []) : []
  const visibleTags = tags.slice(0, MAX_VISIBLE_TAGS)
  const hiddenTags = tags.slice(MAX_VISIBLE_TAGS)
  return (
    <div
      {...draggableProps}
      onClick={onSelect ? () => onSelect(task) : undefined}
      // content-visibility: 뷰포트 밖 렌더 스킵 (긴 목록에서 브라우저 내장 가상화)
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 92px' }}
      className={`px-4 py-3 border-b border-bg-border cursor-pointer transition-colors ${
        selected ? 'bg-bg-active' : 'hover:bg-bg-hover'
      }`}
    >
      {(ref || changed) && (
        <div className="flex items-center gap-1.5 mb-1">
          {/* 점 하나로 "지난번 이후 뭔가 있었다" 만 알린다 — 무엇이 바뀌었는지는 열어야 안다. */}
          {changed && (
            <span
              role="img"
              aria-label="지난번에 본 뒤 변경됨"
              title="지난번에 본 뒤 댓글이나 상태가 바뀌었습니다"
              className="flex-none w-1.5 h-1.5 rounded-full bg-c-blue-solid"
            />
          )}
          {ref && (
            <span className="font-mono text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary">{ref}</span>
          )}
        </div>
      )}
      <div className="text-[calc(13px_*_var(--app-font-scale,1))] text-text-primary leading-snug line-clamp-2">
        {task.subject}
      </div>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className={`ds-chip ${workflowChipClass(task)}`}>{getWorkflowName(task)}</span>
        {branch && runStatus && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary">
            <span className={`w-1.5 h-1.5 rounded-full flex-none ${runStatusDotClass(runStatus)}`} />
            {branch}
          </span>
        )}
        {/* 태그는 눌러서 바로 목록을 좁힌다 — 상세 검색 팝오버까지 가지 않아도 되는 지름길. */}
        {visibleTags.map((tag) => {
          const name = tag.name || tag.id
          const active = activeTags?.includes(name) ?? false
          return (
            <button
              key={tag.id}
              type="button"
              aria-pressed={active}
              // 칩 글자는 태그 이름뿐이라 그것만으로는 "누르면 무슨 일이 나는지" 가 안 읽힌다.
              aria-label={active ? `태그 ${name} 필터 빼기` : `태그 ${name} 로 좁히기`}
              title={active ? `태그 ${name} 필터 빼기` : `태그 ${name} 로 좁히기`}
              onClick={(e) => {
                e.stopPropagation()
                onToggleTag?.(name)
              }}
              // 색 없는 태그(두레이 기본 흰색)는 tagStyle 이 빈 값을 준다 — 무채색 기본을
              // 깔아두지 않으면 브라우저 기본 테두리가 드러난다. 인라인 style 이 이겨서 색 있는
              // 태그는 그대로 자기 색을 쓴다.
              style={tagStyle(tag.color)}
              className={`inline-flex items-center max-w-[120px] px-1.5 py-0.5 rounded-full border cursor-pointer text-[calc(11px_*_var(--app-font-scale,1))] bg-bg-surface border-bg-border text-text-secondary ${
                active ? 'ring-1 ring-bg-border-strong' : ''
              }`}
            >
              <span className="truncate">{name}</span>
            </button>
          )
        })}
        {hiddenTags.length > 0 && (
          <span
            title={hiddenTags.map((t) => t.name || t.id).join(', ')}
            className="px-1.5 py-0.5 rounded-full bg-bg-surface border border-bg-border text-text-tertiary text-[calc(11px_*_var(--app-font-scale,1))]"
          >
            +{hiddenTags.length}
          </span>
        )}
        {!branch &&
          sessions?.map((link) => (
            <button
              key={link.cwd}
              type="button"
              title={`${link.cwd} — 이 폴더의 세션 이어가기`}
              onClick={(e) => {
                e.stopPropagation()
                onResumeSession?.(link)
              }}
              className="ds-chip emerald cursor-pointer max-w-[120px]"
            >
              <Play size={8} className="flex-none" />
              <span className="truncate">{link.repoName ?? basename(link.cwd)}</span>
            </button>
          ))}
        {children}
      </div>
    </div>
  )
})

export default TaskCard
