import { FileDiff, FolderGit2, GitBranch, History, Terminal as TerminalIcon } from 'lucide-react'
import { LoadingView, OnboardingView } from '../../common/ds'

type RepoTab = 'changes' | 'history' | 'branches'

const TAB_COPY: Record<RepoTab, { icon: typeof FileDiff; title: string; description: string; steps: { title: string; body: string }[] }> = {
  changes: {
    icon: FileDiff,
    title: '변경사항',
    description: '작업 트리의 변경을 보고 스테이징·커밋·푸시까지 여기서 처리합니다.',
    steps: [
      { title: '파일을 클릭하면 diff 가 열립니다', body: '좌우 비교 뷰로 바뀐 줄을 확인합니다.' },
      { title: '행에 마우스를 올리면 올리기/내리기/되돌리기', body: '섹션 헤더에서는 전체를 한 번에 처리합니다.' },
      { title: '터미널에서 git 을 써도 반영됩니다', body: '명령이 끝나면 목록을 다시 읽습니다.' }
    ]
  },
  history: {
    icon: History,
    title: '히스토리',
    description: '커밋 그래프로 브랜치가 갈라지고 합쳐진 흐름을 봅니다.',
    steps: [
      { title: '커밋을 펼치면 변경 파일이 나옵니다', body: '파일을 클릭하면 그 커밋의 diff 가 열립니다.' },
      { title: '모든 브랜치 토글', body: '현재 브랜치만 볼지, 전체 그래프를 볼지 고릅니다.' },
      { title: '더 보기로 이어서 불러옵니다', body: '50개씩 누적되며 그래프도 함께 이어집니다.' }
    ]
  },
  branches: {
    icon: GitBranch,
    title: '브랜치',
    description: '브랜치 전환·생성, 워크트리, 스태시를 관리합니다.',
    steps: [
      { title: '워크트리를 만들면 새 터미널이 열립니다', body: '브랜치마다 폴더가 분리돼 동시에 작업할 수 있습니다.' },
      { title: '워크트리를 클릭하면 그 폴더의 터미널', body: '탭을 오가며 여러 브랜치를 병렬로 진행합니다.' },
      { title: '스태시로 지금 변경을 잠시 치웁니다', body: '추적되지 않은 파일도 함께 보관합니다.' }
    ]
  }
}

interface DrawerRepoEmptyStateProps {
  tab: RepoTab | 'tasks'
  cwd?: string
  resolving: boolean
}

/** 현재 터미널이 git 저장소가 아닐 때의 안내 — 탭마다 무엇을 할 수 있는지 먼저 알린다. */
function DrawerRepoEmptyState({ tab, cwd, resolving }: DrawerRepoEmptyStateProps): JSX.Element {
  if (resolving) return <LoadingView label="저장소 확인 중" />
  if (tab === 'tasks') return <LoadingView label="불러오는 중" />

  const copy = TAB_COPY[tab]

  return (
    <OnboardingView
      compact
      icon={copy.icon}
      title={copy.title}
      description={copy.description}
      steps={copy.steps}
      hint={
        cwd ? (
          <>
            <FolderGit2 size={10} className="inline mr-1 -mt-0.5" />
            지금 터미널({cwd.split('/').pop()})은 git 저장소가 아닙니다 — 저장소 폴더로 이동하면 여기가 채워집니다
          </>
        ) : (
          <>
            <TerminalIcon size={10} className="inline mr-1 -mt-0.5" />
            터미널을 열고 git 저장소로 이동하면 여기가 채워집니다
          </>
        )
      }
    />
  )
}

export default DrawerRepoEmptyState
