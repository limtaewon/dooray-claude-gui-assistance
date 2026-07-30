import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import TaskRow, { taskRowPropsAreEqual, type TaskRowProps } from './TaskRow'
import type { DoorayTask } from '../../../../shared/types/dooray'

function makeTask(overrides: Partial<DoorayTask> = {}): DoorayTask {
  return {
    id: 't1',
    projectId: 'p1',
    subject: '태스크 제목',
    workflowClass: 'working',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

function baseProps(overrides: Partial<TaskRowProps> = {}): TaskRowProps {
  return {
    task: makeTask(),
    isSelected: false,
    currentTagFilter: '전체',
    onSelect: vi.fn(),
    onToggleTag: vi.fn(),
    ...overrides
  }
}

describe('TaskRow — 렌더 스냅샷', () => {
  it('기본 렌더', () => {
    const { container } = render(<TaskRow {...baseProps()} />)
    expect(container).toMatchSnapshot()
  })

  it('isSelected=true 렌더', () => {
    const { container } = render(<TaskRow {...baseProps({ isSelected: true })} />)
    expect(container).toMatchSnapshot()
  })

  it('태그 4개 + milestone + dueDateAt 렌더 — +1 배지와 title', () => {
    const task = makeTask({
      tags: [
        { id: 'g1', name: '긴급', color: 'ff0000' },
        { id: 'g2', name: '버그', color: '00ff00' },
        { id: 'g3', name: '문서', color: '0000ff' },
        { id: 'g4', name: '기타', color: 'ffff00' }
      ],
      milestone: { name: '2026 Q1' },
      // 정오 UTC — 로컬 타임존 오프셋에 의한 날짜 경계 이동(스냅샷 flake) 방지
      dueDateAt: '2026-08-15T12:00:00Z'
    })
    const { container, getByText, getByTitle } = render(<TaskRow {...baseProps({ task })} />)
    expect(getByText('+1')).toBeInTheDocument()
    expect(getByTitle('기타')).toBeInTheDocument()
    expect(container).toMatchSnapshot()
  })
})

describe('TaskRow — 상호작용', () => {
  it('행 클릭 → onSelect(task) 1회', () => {
    const props = baseProps()
    const { container } = render(<TaskRow {...props} />)
    fireEvent.click(container.firstChild as Element)
    expect(props.onSelect).toHaveBeenCalledTimes(1)
    expect(props.onSelect).toHaveBeenCalledWith(props.task)
  })

  it('태그 칩 클릭 → onToggleTag(name) 1회, onSelect 는 미호출(stopPropagation)', () => {
    const task = makeTask({ tags: [{ id: 'g1', name: '긴급', color: 'ff0000' }] })
    const props = baseProps({ task })
    const { getByText } = render(<TaskRow {...props} />)
    fireEvent.click(getByText('긴급'))
    expect(props.onToggleTag).toHaveBeenCalledTimes(1)
    expect(props.onToggleTag).toHaveBeenCalledWith('긴급')
    expect(props.onSelect).not.toHaveBeenCalled()
  })

  it('workflowClass 없으면 registered 기본 아이콘/색으로 렌더', () => {
    const task = makeTask({ workflowClass: '' as unknown as DoorayTask['workflowClass'] })
    const { container } = render(<TaskRow {...baseProps({ task })} />)
    // registered 워크플로 시맨틱 토큰 클래스가 아이콘에 적용됨
    expect(container.innerHTML).toContain('wf-registered')
  })
})

describe('taskRowPropsAreEqual', () => {
  const base = baseProps()

  it('전부 동일하면 true', () => {
    expect(taskRowPropsAreEqual(base, { ...base })).toBe(true)
  })

  it('task.id 변경 → false', () => {
    expect(taskRowPropsAreEqual(base, { ...base, task: { ...base.task, id: 't2' } })).toBe(false)
  })

  it('task.subject 변경 → false', () => {
    expect(taskRowPropsAreEqual(base, { ...base, task: { ...base.task, subject: '다른 제목' } })).toBe(false)
  })

  it('task.workflowClass 변경 → false', () => {
    expect(taskRowPropsAreEqual(base, { ...base, task: { ...base.task, workflowClass: 'closed' } })).toBe(false)
  })

  it('task.tags 참조 변경 → false (내용 동일해도 참조 비교)', () => {
    const withTags = { ...base, task: { ...base.task, tags: [{ id: 'g1', name: 'x' }] } }
    const withOtherTagsRef = { ...withTags, task: { ...withTags.task, tags: [...withTags.task.tags!] } }
    expect(taskRowPropsAreEqual(withTags, withOtherTagsRef)).toBe(false)
  })

  it('isSelected 변경 → false', () => {
    expect(taskRowPropsAreEqual(base, { ...base, isSelected: !base.isSelected })).toBe(false)
  })

  it('currentTagFilter 변경 → false', () => {
    expect(taskRowPropsAreEqual(base, { ...base, currentTagFilter: '다른필터' })).toBe(false)
  })

  it('onSelect/onToggleTag 참조만 바뀌면 true — 현행 동작 고정(ADR-v2-workspace-p0-05)', () => {
    expect(taskRowPropsAreEqual(base, { ...base, onSelect: vi.fn(), onToggleTag: vi.fn() })).toBe(true)
  })
})
