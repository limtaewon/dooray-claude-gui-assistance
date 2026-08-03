import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithDs } from '../../../../../test/helpers/renderWithDs'
import TaskFilterMenu from './TaskFilterMenu'
import { EMPTY_TASK_FILTER, type TaskFacets, type TaskFilterState } from './taskFilter'

const FACETS: TaskFacets = {
  workflows: [
    { value: '진행중', count: 3 },
    { value: '접수', count: 1 }
  ],
  tags: [{ value: '긴급', count: 2 }],
  milestones: [{ value: '1차 오픈', count: 2 }]
}

const EMPTY_FACETS: TaskFacets = { workflows: [], tags: [], milestones: [] }

function open(facets: TaskFacets, state: TaskFilterState = EMPTY_TASK_FILTER): {
  onChange: ReturnType<typeof vi.fn>
} {
  const onChange = vi.fn()
  renderWithDs(<TaskFilterMenu facets={facets} state={state} onChange={onChange} />)
  return { onChange }
}

describe('TaskFilterMenu', () => {
  it('열면 축마다 고를 수 있는 값과 건수가 나온다', async () => {
    open(FACETS)

    await userEvent.click(screen.getByRole('button', { name: '상세 검색' }))

    expect(screen.getByText('상태')).toBeInTheDocument()
    expect(screen.getByText('태그')).toBeInTheDocument()
    expect(screen.getByText('단계')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /진행중/ })).toHaveAttribute('aria-checked', 'false')
  })

  it('값을 고르면 그 축에만 더해진다', async () => {
    const { onChange } = open(FACETS, { ...EMPTY_TASK_FILTER, tags: ['긴급'] })

    await userEvent.click(screen.getByRole('button', { name: '상세 검색' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /진행중/ }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ workflows: ['진행중'], tags: ['긴급'] })
    )
  })

  it('이미 고른 값을 다시 누르면 빠진다', async () => {
    const { onChange } = open(FACETS, { ...EMPTY_TASK_FILTER, workflows: ['진행중'] })

    await userEvent.click(screen.getByRole('button', { name: '상세 검색' }))
    expect(screen.getByRole('checkbox', { name: /진행중/ })).toHaveAttribute('aria-checked', 'true')

    await userEvent.click(screen.getByRole('checkbox', { name: /진행중/ }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ workflows: [] }))
  })

  it('지우기는 상세 필터만 비우고 갈래·검색어는 남긴다', async () => {
    const { onChange } = open(FACETS, {
      scope: 'all',
      query: '결제',
      workflows: ['진행중'],
      tags: ['긴급'],
      milestones: []
    })

    await userEvent.click(screen.getByRole('button', { name: '상세 검색' }))
    await userEvent.click(screen.getByRole('button', { name: '상세 검색 지우기' }))

    expect(onChange).toHaveBeenCalledWith({
      scope: 'all',
      query: '결제',
      workflows: [],
      tags: [],
      milestones: []
    })
  })

  it('걸린 개수를 버튼에 배지로 알린다', () => {
    open(FACETS, { ...EMPTY_TASK_FILTER, workflows: ['진행중'], tags: ['긴급'] })

    expect(screen.getByRole('button', { name: '상세 검색' })).toHaveTextContent('2')
  })

  it('후보가 하나도 없으면 그 사실을 알리고 지우기도 감춘다', async () => {
    open(EMPTY_FACETS)

    await userEvent.click(screen.getByRole('button', { name: '상세 검색' }))

    expect(screen.getByText(/좁힐 수 있는 상태 · 태그 · 단계가 아직 없습니다/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '상세 검색 지우기' })).not.toBeInTheDocument()
  })

  it('Esc 로 닫힌다', async () => {
    open(FACETS)

    await userEvent.click(screen.getByRole('button', { name: '상세 검색' }))
    expect(screen.getByRole('dialog', { name: '상세 검색' })).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '상세 검색' })).not.toBeInTheDocument()
  })
})
