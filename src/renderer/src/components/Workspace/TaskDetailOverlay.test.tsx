import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithDs } from '../../../../../test/helpers/renderWithDs'
import { installMockWindowApi, resetMockWindowApi } from '../../../../../test/helpers/mockWindowApi'
import TaskDetailOverlay from './TaskDetailOverlay'
import type { DoorayTask, DoorayTaskDetail } from '@shared/types/dooray'

const TASK: DoorayTask = {
  id: 'post-77',
  projectId: 'proj-9',
  projectCode: 'NEON',
  number: 6793,
  subject: '스크린샷이 붙은 업무',
  workflowClass: 'working',
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z'
}

const PNG = 'data:image/png;base64,iVBORw0KGgo='

function detailWith(content: string): DoorayTaskDetail {
  return { ...TASK, body: { mimeType: 'text/x-markdown', content } }
}

describe('TaskDetailOverlay — 첨부 이미지', () => {
  beforeEach(() => {
    installMockWindowApi()
    vi.mocked(window.api.dooray.fetchFile).mockResolvedValue(PNG)
  })

  afterEach(() => {
    resetMockWindowApi()
  })

  /**
   * 두레이 첨부는 게시글 스코프 경로로만 받을 수 있다. 컨텍스트를 안 넘기면 범용 경로로 떨어져
   * 404 → "두레이에서 보기" 링크만 남는다 (작업 패널에서 이미지가 안 나오던 원인).
   */
  it('본문 이미지를 프로젝트·게시글 컨텍스트와 함께 받아온다', async () => {
    vi.mocked(window.api.dooray.tasks.detail).mockResolvedValue(
      detailWith('진행 화면입니다\n\n![화면](/files/12345)')
    )

    renderWithDs(<TaskDetailOverlay task={TASK} onClose={() => {}} promptText={() => ''} />)

    await waitFor(() =>
      expect(window.api.dooray.fetchFile).toHaveBeenCalledWith(
        '/files/12345',
        expect.objectContaining({ projectId: 'proj-9', postId: 'post-77' })
      )
    )
    await waitFor(() => expect(screen.getByAltText('화면')).toHaveAttribute('src', PNG))
  })

  it('HTML 본문의 <img> 도 같은 경로로 받아온다 — 두레이 본문은 마크다운과 HTML 이 섞여 온다', async () => {
    vi.mocked(window.api.dooray.tasks.detail).mockResolvedValue({
      ...TASK,
      body: { mimeType: 'text/html', content: '<p>확인</p><img src="/files/777" alt="캡처">' }
    })

    renderWithDs(<TaskDetailOverlay task={TASK} onClose={() => {}} promptText={() => ''} />)

    await waitFor(() =>
      expect(window.api.dooray.fetchFile).toHaveBeenCalledWith(
        '/files/777',
        expect.objectContaining({ projectId: 'proj-9', postId: 'post-77' })
      )
    )
  })

  it('댓글에 붙은 이미지도 같은 컨텍스트를 쓴다', async () => {
    vi.mocked(window.api.dooray.tasks.detail).mockResolvedValue(detailWith('본문'))
    vi.mocked(window.api.dooray.tasks.comments).mockResolvedValue([
      {
        id: 'c1',
        body: { mimeType: 'text/x-markdown', content: '![재현](/files/999)' },
        createdAt: '2026-07-02T00:00:00Z',
        creator: { member: { id: 'm1', name: '배수한' } }
      }
    ])

    renderWithDs(<TaskDetailOverlay task={TASK} onClose={() => {}} promptText={() => ''} />)

    await waitFor(() =>
      expect(window.api.dooray.fetchFile).toHaveBeenCalledWith(
        '/files/999',
        expect.objectContaining({ projectId: 'proj-9', postId: 'post-77' })
      )
    )
  })

  it('외부 URL 이미지는 그대로 쓴다 — 인증이 필요 없다', async () => {
    vi.mocked(window.api.dooray.tasks.detail).mockResolvedValue(
      detailWith('![로고](https://example.com/logo.png)')
    )

    renderWithDs(<TaskDetailOverlay task={TASK} onClose={() => {}} promptText={() => ''} />)

    await waitFor(() =>
      expect(screen.getByAltText('로고')).toHaveAttribute('src', 'https://example.com/logo.png')
    )
    expect(window.api.dooray.fetchFile).not.toHaveBeenCalled()
  })
})
