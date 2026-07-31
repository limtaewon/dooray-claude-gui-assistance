/**
 * SkillsManager 위키 다운로드 파일명 정제 + deleteMany 부분 실패 안내 회귀 테스트.
 *
 * ADR-v2-windows-fix-05 §1: 위키 제목이 Windows 금지문자를 포함해도 저장 전 renderer 가
 * sanitizeSkillFilename 으로 미리 정제해 window.api.skills.save 에 넘긴다 — main 만 정제하면
 * UI 가 실제 저장된 이름과 다른 것을 보여주게 되므로, 정제됐을 때는 토스트로 실제 저장명을 안내한다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installMockWindowApi, resetMockWindowApi } from '../../../../../test/helpers/mockWindowApi'
import { renderWithDs } from '../../../../../test/helpers/renderWithDs'
import { sanitizeSkillFilename } from '@shared/utils/filename'
import SkillsManager from './SkillsManager'

describe('SkillsManager (integration)', () => {
  beforeEach(() => {
    installMockWindowApi()
  })

  afterEach(() => {
    resetMockWindowApi()
    vi.restoreAllMocks()
  })

  it('위키 제목에 Windows 금지문자가 있으면 정제된 filename 으로 skills.save 를 호출하고 토스트로 안내한다', async () => {
    const wikiName = 'Q&A: 정리/노트'
    const expectedFilename = sanitizeSkillFilename(wikiName)
    expect(expectedFilename).not.toBe(wikiName)

    vi.mocked(window.api.dooray.wiki.storageList).mockResolvedValue([
      { pageId: 'p1', name: wikiName, content: '# body', updatedAt: Date.now() }
    ])

    renderWithDs(<SkillsManager />)

    await userEvent.click(await screen.findByRole('button', { name: '공유' }))
    await screen.findByText(wikiName)

    await userEvent.click(screen.getByRole('button', { name: /내려받기/ }))

    await waitFor(() => {
      expect(window.api.skills.save).toHaveBeenCalledWith({ filename: expectedFilename, content: '# body' })
    })
    await screen.findByText(new RegExp(`파일명이 "${expectedFilename}" 으로 저장됐습니다`))
  })

  it('위키 제목이 그대로 안전하면 파일명 변경 안내 없이 저장된다', async () => {
    vi.mocked(window.api.dooray.wiki.storageList).mockResolvedValue([
      { pageId: 'p1', name: 'safe-name', content: '# body', updatedAt: Date.now() }
    ])

    renderWithDs(<SkillsManager />)

    await userEvent.click(await screen.findByRole('button', { name: '공유' }))
    await screen.findByText('safe-name')

    await userEvent.click(screen.getByRole('button', { name: /내려받기/ }))

    await waitFor(() => {
      expect(window.api.skills.save).toHaveBeenCalledWith({ filename: 'safe-name', content: '# body' })
    })
    expect(screen.queryByText(/으로 저장됐습니다/)).not.toBeInTheDocument()
  })

  it('위키 다중 선택 내려받기도 항목별로 정제된 filename 을 사용한다', async () => {
    const wikiName = 'Q&A: 정리'
    const expectedFilename = sanitizeSkillFilename(wikiName)

    vi.mocked(window.api.dooray.wiki.storageList).mockResolvedValue([
      { pageId: 'p1', name: wikiName, content: 'a', updatedAt: Date.now() },
      { pageId: 'p2', name: 'safe-name', content: 'b', updatedAt: Date.now() }
    ])

    renderWithDs(<SkillsManager />)

    await userEvent.click(await screen.findByRole('button', { name: '공유' }))
    await screen.findByText(wikiName)
    await screen.findByText('safe-name')

    await userEvent.click(screen.getByRole('button', { name: /^선택$/ }))
    await userEvent.click(screen.getByText(wikiName))
    await userEvent.click(screen.getByText('safe-name'))

    await userEvent.click(screen.getByRole('button', { name: '내려받기' }))

    await waitFor(() => {
      expect(window.api.skills.save).toHaveBeenCalledWith({ filename: expectedFilename, content: 'a' })
      expect(window.api.skills.save).toHaveBeenCalledWith({ filename: 'safe-name', content: 'b' })
    })
    await screen.findByText(/1개는 Windows 호환을 위해 파일명이 변경됐습니다/)
  })

  it('스킬 다중 삭제가 부분 실패하면 성공/실패 건수를 각각 토스트로 안내한다', async () => {
    vi.mocked(window.api.skills.list).mockResolvedValue([
      { name: 'my-skill', filename: 'my-skill', content: '', updatedAt: Date.now() }
    ])
    vi.mocked(window.api.skills.deleteMany).mockResolvedValue({ deleted: 1, failed: 1 })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderWithDs(<SkillsManager />)

    await screen.findByText('my-skill')

    await userEvent.click(screen.getByRole('button', { name: /^선택$/ }))
    await userEvent.click(screen.getByText('my-skill'))
    await userEvent.click(screen.getByRole('button', { name: '삭제' }))

    await waitFor(() => {
      expect(window.api.skills.deleteMany).toHaveBeenCalledWith(['my-skill'])
    })
    await screen.findByText('1개 삭제됨')
    await screen.findByText('1개 삭제 실패')
  })
})
