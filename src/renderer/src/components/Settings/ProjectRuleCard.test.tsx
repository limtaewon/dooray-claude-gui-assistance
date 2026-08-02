import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithDs } from '../../../../../test/helpers/renderWithDs'
import ProjectRuleCard from './ProjectRuleCard'
import type { DoorayProject } from '@shared/types/dooray'
import type { RepoRegistryEntry } from '@shared/types/workspace'
import type { ResolvedProjectConfig } from '@shared/workspace/projectConfig'

const PROJECT = { id: 'p1', code: 'NEON', description: '네온' } as DoorayProject

const REPOS: RepoRegistryEntry[] = [
  { id: 'r1', path: '/Users/me/Desktop/2NEON', name: '2NEON' },
  { id: 'r2', path: '/Users/me/Desktop/neon-ai', name: 'neon-ai' },
  { id: 'r3', path: '/Users/me/work/other', name: 'other' }
]

function config(repoIds: string[]): ResolvedProjectConfig {
  return {
    repoIds,
    branchTemplate: 'feature/{projectCode}-{taskNumber}',
    promptTemplate: '다음 두레이 업무를 진행합니다: {ref} {title}',
    source: { branchTemplate: 'global', promptTemplate: 'global' }
  }
}

describe('ProjectRuleCard — 저장소', () => {
  it('넣은 저장소만 목록에 나오고 경로가 함께 보인다 — 이름만으로는 어느 폴더인지 갈리지 않는다', () => {
    renderWithDs(
      <ProjectRuleCard project={PROJECT} repos={REPOS} config={config(['r1'])} onChange={() => {}} />
    )

    expect(screen.getByText('2NEON')).toBeInTheDocument()
    expect(screen.getByText('/Users/me/Desktop/2NEON')).toBeInTheDocument()
    // 안 넣은 저장소는 목록에 없다 (등록된 전부를 늘어놓지 않는다)
    expect(screen.queryByText('neon-ai')).not.toBeInTheDocument()
  })

  it('추가 버튼은 아직 안 넣은 저장소만 보여준다', async () => {
    renderWithDs(
      <ProjectRuleCard project={PROJECT} repos={REPOS} config={config(['r1'])} onChange={() => {}} />
    )

    await userEvent.click(screen.getByRole('button', { name: 'NEON 저장소 추가' }))

    expect(screen.getByText('neon-ai')).toBeInTheDocument()
    expect(screen.getByText('other')).toBeInTheDocument()
    // 이미 넣은 것은 후보에 없다 — 목록의 행 하나뿐
    expect(screen.getAllByText('2NEON')).toHaveLength(1)
  })

  it('고르면 기존 목록에 더해진다', async () => {
    const onChange = vi.fn()
    renderWithDs(
      <ProjectRuleCard project={PROJECT} repos={REPOS} config={config(['r1'])} onChange={onChange} />
    )

    await userEvent.click(screen.getByRole('button', { name: 'NEON 저장소 추가' }))
    await userEvent.click(screen.getByText('neon-ai'))

    expect(onChange).toHaveBeenCalledWith({ repoIds: ['r1', 'r2'] })
  })

  it('× 로 그 저장소만 뺀다', async () => {
    const onChange = vi.fn()
    renderWithDs(
      <ProjectRuleCard
        project={PROJECT}
        repos={REPOS}
        config={config(['r1', 'r2'])}
        onChange={onChange}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: '2NEON 빼기' }))

    expect(onChange).toHaveBeenCalledWith({ repoIds: ['r2'] })
  })

  it('다 넣었으면 추가 버튼 대신 그 사실을 알린다', () => {
    renderWithDs(
      <ProjectRuleCard
        project={PROJECT}
        repos={REPOS}
        config={config(['r1', 'r2', 'r3'])}
        onChange={() => {}}
      />
    )

    expect(screen.queryByRole('button', { name: 'NEON 저장소 추가' })).not.toBeInTheDocument()
    expect(screen.getByText('등록된 저장소를 모두 넣었습니다.')).toBeInTheDocument()
  })

  it('등록된 저장소가 없으면 먼저 등록하라고 안내한다', () => {
    renderWithDs(
      <ProjectRuleCard project={PROJECT} repos={[]} config={config([])} onChange={() => {}} />
    )

    expect(screen.getByText(/폴더를 먼저 등록하세요/)).toBeInTheDocument()
  })
})

/**
 * 미리보기가 실제 치환과 다르면 "설정은 했는데 안 먹는다" 로 읽힌다.
 * 미리보기에서 값을 안 넘긴 토큰은 빈칸으로 그려지므로, 실제 경로가 채우는 값은 여기서도 채운다.
 */
describe('ProjectRuleCard — 미리보기가 실제 치환과 같다', () => {
  function configWith(patch: Partial<ResolvedProjectConfig>): ResolvedProjectConfig {
    return { ...config([]), ...patch }
  }

  it('{subject} 가 브랜치 미리보기에 반영된다', () => {
    renderWithDs(
      <ProjectRuleCard
        project={PROJECT}
        repos={REPOS}
        config={configWith({ branchTemplate: 'feature/{taskNumber}-{subject}' })}
        onChange={() => {}}
      />
    )

    // 한글은 git ref 로 못 써 `-` 로 접히지만, 영문 부분은 남아야 한다.
    expect(screen.getByText(/feature\/6793-AI/)).toBeInTheDocument()
  })

  it('{prefix} 는 이 프로젝트에 넣은 저장소의 값을 쓴다', () => {
    const repos: RepoRegistryEntry[] = [
      { id: 'r1', path: '/Users/me/Desktop/2NEON', name: '2NEON', branchPrefix: 'team-a' }
    ]
    renderWithDs(
      <ProjectRuleCard
        project={PROJECT}
        repos={repos}
        config={configWith({ repoIds: ['r1'], branchTemplate: '{prefix}/{taskNumber}' })}
        onChange={() => {}}
      />
    )

    expect(screen.getByText('team-a/6793')).toBeInTheDocument()
  })

  it('{url} 과 {body} 도 첫 지시 미리보기에 나온다', () => {
    renderWithDs(
      <ProjectRuleCard
        project={PROJECT}
        repos={REPOS}
        config={configWith({ promptTemplate: '{url} / {body}' })}
        onChange={() => {}}
      />
    )

    expect(screen.getByText(/nhnent\.dooray\.com\/project\/posts/)).toBeInTheDocument()
    expect(screen.getByText(/업무 본문이 여기 들어갑니다/)).toBeInTheDocument()
  })
})

describe('ProjectRuleCard — 토큰 칩', () => {
  function stubClipboard(writeText: () => Promise<void>): void {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true
    })
  }

  it('브랜치 토큰을 누르면 그 토큰이 클립보드로 간다 — 손으로 옮겨 적다 오타 내지 않게', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)

    renderWithDs(
      <ProjectRuleCard project={PROJECT} repos={REPOS} config={config([])} onChange={() => {}} />
    )

    await userEvent.click(screen.getByRole('button', { name: '{taskNumber} 복사' }))

    expect(writeText).toHaveBeenCalledWith('{taskNumber}')
  })

  it('첫 지시 문구 토큰도 같은 방식으로 복사된다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)

    renderWithDs(
      <ProjectRuleCard project={PROJECT} repos={REPOS} config={config([])} onChange={() => {}} />
    )

    await userEvent.click(screen.getByRole('button', { name: '{title} 복사' }))

    expect(writeText).toHaveBeenCalledWith('{title}')
  })

  it('복사가 막힌 환경이면 경고만 남기고 화면은 그대로 둔다', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    stubClipboard(writeText)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderWithDs(
      <ProjectRuleCard project={PROJECT} repos={REPOS} config={config([])} onChange={() => {}} />
    )

    await userEvent.click(screen.getByRole('button', { name: '{taskId6} 복사' }))

    expect(warn).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '{taskId6} 복사' })).toBeInTheDocument()
    warn.mockRestore()
  })
})
