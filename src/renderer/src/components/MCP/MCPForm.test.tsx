/**
 * MCPForm Windows 힌트 캡션 회귀 테스트 (ADR-v2-windows-fix-06 §4).
 *
 * 힌트는 표시 전용 — renderer 는 정규화하지 않는다. win32 이고 stdio 커맨드가
 * npx/uvx 계열(.cmd/.bat 접미 포함) 일 때만 노출된다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installMockWindowApi, resetMockWindowApi } from '../../../../../test/helpers/mockWindowApi'
import { renderWithDs } from '../../../../../test/helpers/renderWithDs'
import MCPForm from './MCPForm'

const HINT_TEXT = /Windows 에서는 npx\/uvx 명령이 자동으로/

describe('MCPForm Windows 힌트', () => {
  beforeEach(() => {
    installMockWindowApi()
  })

  afterEach(() => {
    resetMockWindowApi()
    vi.clearAllMocks()
  })

  it('darwin 에서는 command 가 npx 여도 힌트를 표시하지 않는다', async () => {
    window.api.system = { platform: 'darwin', osRelease: '23.0.0' }

    renderWithDs(<MCPForm onSave={vi.fn()} onCancel={vi.fn()} />)

    await userEvent.type(screen.getByPlaceholderText('npx'), 'npx')

    expect(screen.queryByText(HINT_TEXT)).not.toBeInTheDocument()
  })

  it('win32 + command=npx 이면 힌트를 표시한다', async () => {
    window.api.system = { platform: 'win32', osRelease: '10.0.22621' }

    renderWithDs(<MCPForm onSave={vi.fn()} onCancel={vi.fn()} />)

    await userEvent.type(screen.getByPlaceholderText('npx'), 'npx')

    expect(await screen.findByText(HINT_TEXT)).toBeInTheDocument()
  })

  it('win32 + command=node 처럼 래핑 대상이 아니면 힌트를 표시하지 않는다', async () => {
    window.api.system = { platform: 'win32', osRelease: '10.0.22621' }

    renderWithDs(<MCPForm onSave={vi.fn()} onCancel={vi.fn()} />)

    await userEvent.type(screen.getByPlaceholderText('npx'), 'node')

    expect(screen.queryByText(HINT_TEXT)).not.toBeInTheDocument()
  })

  it('win32 + command=uvx.cmd 처럼 .cmd 접미도 래핑 대상으로 판정한다', async () => {
    window.api.system = { platform: 'win32', osRelease: '10.0.22621' }

    renderWithDs(<MCPForm onSave={vi.fn()} onCancel={vi.fn()} />)

    await userEvent.type(screen.getByPlaceholderText('npx'), 'uvx.cmd')

    expect(await screen.findByText(HINT_TEXT)).toBeInTheDocument()
  })

  it('원격 전송(http)일 때는 힌트를 표시하지 않는다', async () => {
    window.api.system = { platform: 'win32', osRelease: '10.0.22621' }

    renderWithDs(<MCPForm onSave={vi.fn()} onCancel={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'http' }))

    expect(screen.queryByText(HINT_TEXT)).not.toBeInTheDocument()
  })
})
