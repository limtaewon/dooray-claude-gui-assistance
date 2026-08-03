import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('편집을 열면 원문이 그대로 들어오고, 저장하면 mimeType 을 유지한 채 보낸다', async () => {
    vi.mocked(window.api.dooray.tasks.detail).mockResolvedValue({
      ...TASK,
      body: { mimeType: 'text/html', content: '<p>원래 내용</p>' }
    })

    renderWithDs(<TaskDetailOverlay task={TASK} onClose={() => {}} promptText={() => ''} />)

    await userEvent.click(await screen.findByRole('button', { name: '본문 편집' }))
    const editor = screen.getByRole('textbox', { name: '업무 본문' })
    expect(editor).toHaveValue('<p>원래 내용</p>')

    await userEvent.clear(editor)
    await userEvent.type(editor, '<p>고친 내용</p>')
    await userEvent.click(screen.getByRole('button', { name: '두레이에 저장' }))

    // 마크다운으로 저장하면 두레이 웹에서 만든 표·체크박스가 평문으로 깨진다.
    await waitFor(() =>
      expect(window.api.dooray.tasks.updateBody).toHaveBeenCalledWith({
        projectId: 'proj-9',
        postId: 'post-77',
        subject: TASK.subject,
        body: '<p>고친 내용</p>',
        mimeType: 'text/html'
      })
    )
  })

  it('취소하면 저장하지 않고 원래 본문으로 돌아간다', async () => {
    vi.mocked(window.api.dooray.tasks.detail).mockResolvedValue(detailWith('원래 내용'))

    renderWithDs(<TaskDetailOverlay task={TASK} onClose={() => {}} promptText={() => ''} />)

    await userEvent.click(await screen.findByRole('button', { name: '본문 편집' }))
    await userEvent.type(screen.getByRole('textbox', { name: '업무 본문' }), '덧붙임')
    await userEvent.click(screen.getByRole('button', { name: '취소' }))

    expect(window.api.dooray.tasks.updateBody).not.toHaveBeenCalled()
    expect(screen.getByText('원래 내용')).toBeInTheDocument()
  })

  /** 쓰던 글이 창이 닫히며 통째로 날아가면 안 된다. */
  it('편집 중 Esc 는 창을 닫지 않고 편집만 접는다', async () => {
    const onClose = vi.fn()
    vi.mocked(window.api.dooray.tasks.detail).mockResolvedValue(detailWith('원래 내용'))

    renderWithDs(<TaskDetailOverlay task={TASK} onClose={onClose} promptText={() => ''} />)

    await userEvent.click(await screen.findByRole('button', { name: '본문 편집' }))
    await userEvent.keyboard('{Escape}')

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox', { name: '업무 본문' })).not.toBeInTheDocument()

    // 편집을 접은 뒤에는 Esc 가 다시 창을 닫는다.
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('저장에 실패하면 편집 내용을 지우지 않고 이유를 알린다', async () => {
    vi.mocked(window.api.dooray.tasks.detail).mockResolvedValue(detailWith('원래 내용'))
    vi.mocked(window.api.dooray.tasks.updateBody).mockRejectedValue(new Error('권한이 없습니다'))

    renderWithDs(<TaskDetailOverlay task={TASK} onClose={() => {}} promptText={() => ''} />)

    await userEvent.click(await screen.findByRole('button', { name: '본문 편집' }))
    await userEvent.type(screen.getByRole('textbox', { name: '업무 본문' }), ' 고침')
    await userEvent.click(screen.getByRole('button', { name: '두레이에 저장' }))

    await waitFor(() => expect(screen.getByText('본문 저장 실패')).toBeInTheDocument())
    expect(screen.getByRole('textbox', { name: '업무 본문' })).toHaveValue('원래 내용 고침')
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
