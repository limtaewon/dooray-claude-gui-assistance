import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { installMockWindowApi, resetMockWindowApi } from '../../../../../test/helpers/mockWindowApi'
import ProjectTaskView from './ProjectTaskView'
import type { DoorayProject } from '../../../../shared/types/dooray'

/**
 * TaskRow/taskStyles 를 별도 파일로 추출한 뒤에도 ProjectTaskView 가 정상 조립되는지 확인하는
 * 스모크 테스트 (import 경로 회귀 + theme-changed 리스너 이중등록 탐지용, ADR-v2-workspace-p0-03).
 */
describe('ProjectTaskView — 추출 후 스모크', () => {
  beforeEach(() => {
    installMockWindowApi()
    const project: DoorayProject = { id: 'p1', code: 'PROJ' }
    vi.mocked(window.api.dooray.projects.list).mockResolvedValue([project])
    vi.mocked(window.api.dooray.tasks.list).mockResolvedValue([
      {
        id: 't1', projectId: 'p1', subject: '첫번째 태스크', workflowClass: 'working',
        createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'
      },
      {
        id: 't2', projectId: 'p1', subject: '두번째 태스크', workflowClass: 'registered',
        createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'
      }
    ])
  })

  afterEach(() => {
    resetMockWindowApi()
  })

  it('태스크 2건이 목록에 렌더된다', async () => {
    render(<ProjectTaskView />)
    await waitFor(() => expect(screen.getByText('첫번째 태스크')).toBeInTheDocument())
    expect(screen.getByText('두번째 태스크')).toBeInTheDocument()
  })
})
