import type { OnboardingViewId } from './viewOnboarding'

/**
 * 투어 한 단계.
 *
 * `anchor` 는 화면 요소의 `data-tour` 값이다. 그 요소를 못 찾으면 **단계를 건너뛰지 않고**
 * 화면 가운데 카드로 보여준다 — 아직 앵커를 안 붙인 화면에서도 설명은 이어져야 한다.
 */
export interface TourStep {
  /** 강조할 요소의 `data-tour` 값 */
  anchor?: string
  title: string
  body: string
}

/** 투어를 제공하는 메뉴 — 온보딩 허브의 목록과 같다. */
export type TourViewId = OnboardingViewId | 'settings'

export const TOURS: Record<TourViewId, TourStep[]> = {
  terminal: [
    {
      anchor: 'terminal-new-tab',
      title: '터미널 탭을 엽니다',
      body: '⌘T 로도 열립니다. 탭은 이름을 바꿀 수 있고(더블클릭) 끌어서 순서를 바꿉니다. 앱을 껐다 켜도 화면 내용까지 그대로 복원됩니다.'
    },
    {
      title: '한 탭을 나눠서 씁니다',
      body: '⌘D 로 오른쪽, ⌘⇧D 로 아래로 나눕니다. ⌥⌘화살표로 pane 을 옮겨 다니고 ⌘W 로 닫습니다. 경계를 끌면 비율이 바뀌고, 더블클릭하면 50/50 으로 돌아옵니다.'
    },
    {
      anchor: 'terminal-drawer-toggle',
      title: '작업 패널을 엽니다 (⌘⇧T)',
      body: '업무 · 변경사항 · 브랜치 변경 · 히스토리 · 브랜치를 터미널 옆에서 그대로 봅니다. 왼쪽 모서리를 끌어 폭을 조절합니다.'
    },
    {
      anchor: 'drawer-tab-tasks',
      title: '업무를 끌어다 놓으면 시작합니다',
      body: '업무 카드를 터미널에 놓으면 그 업무 전용 워크트리를 만들고 claude 를 띄웁니다. 이미 하던 세션이 있으면 이어갑니다. 실행 중인 터미널에 놓으면 새 탭에서 시작하니 하던 대화는 안전합니다.'
    },
    {
      anchor: 'drawer-tab-changes',
      title: '변경사항에서 커밋까지',
      body: '스테이징 · 커밋 · 푸시를 여기서 합니다. 파일을 누르면 diff 가 탭으로 열리고, diff 안에서 ∧/∨(F7)로 변경점을 넘깁니다.'
    },
    {
      anchor: 'drawer-tab-branchDiff',
      title: '브랜치 변경 — 이 브랜치가 결국 뭘 바꾸나',
      body: '기준 브랜치에서 갈라진 뒤 바꾼 파일을 커밋한 것까지 합쳐 봅니다. 워크트리에서 업무를 끝내고 확인할 때 씁니다.'
    }
  ],
  dooray: [
    {
      anchor: 'dooray-tabs',
      title: '업무 · 위키 · 캘린더 · 메신저',
      body: '두레이를 앱 안에서 그대로 봅니다. 탭을 옮겨도 각자 보던 위치가 유지됩니다.'
    },
    {
      anchor: 'dooray-project-filter',
      title: '자주 쓰는 프로젝트를 고정합니다',
      body: '고정한 프로젝트의 내 업무만 모아서 봅니다. 터미널 작업 패널의 업무 목록도 이 설정을 씁니다.'
    },
    {
      title: '업무에서 바로 작업을 시작합니다',
      body: '업무 상세의 [터미널에서 시작] 을 누르거나, 카드를 터미널로 끌어다 놓으면 그 업무 전용 워크트리에서 claude 가 시작됩니다.'
    },
    {
      title: 'AI 브리핑과 보고서',
      body: '오늘 할 일 브리핑, 주간 보고서 초안을 만들어 둡니다. 결과는 위키로 바로 올릴 수 있습니다.'
    }
  ],
  sessions: [
    {
      title: 'Claude 채팅',
      body: '터미널 없이 Claude Code 와 대화합니다. 세션은 폴더별로 남고, 지난 대화를 골라 이어갈 수 있습니다.'
    },
    {
      title: '파일을 끌어다 놓아 첨부합니다',
      body: '이미지·텍스트 파일을 대화창에 그대로 놓으면 첨부됩니다.'
    }
  ],
  mcp: [
    {
      title: 'MCP 서버 관리',
      body: 'Claude Code 가 쓰는 MCP 서버를 켜고 끕니다. 끈 항목은 설정 파일에서 보관함으로 옮겨져 실제로 로드되지 않습니다.'
    },
    {
      title: '팀과 나눕니다',
      body: '서버 설정을 두레이 위키로 공유하고, 남이 올린 것을 받아 그대로 등록할 수 있습니다.'
    }
  ],
  skills: [
    {
      title: 'Claude 스킬',
      body: '자주 쓰는 작업 절차를 스킬로 만들어 둡니다. 켜고 끄는 것은 MCP 와 같은 방식입니다.'
    },
    {
      title: 'AI 로 초안을 만듭니다',
      body: '하고 싶은 일을 문장으로 적으면 스킬 초안을 만들어 줍니다. 만든 스킬은 위키로 공유합니다.'
    }
  ],
  agent: [
    {
      title: '@clauday 봇',
      body: '두레이 메신저에서 @clauday 를 부르면 그 채널 작업 폴더에서 Claude Code 가 답합니다.'
    },
    {
      title: '채널별 작업 폴더',
      body: '채널마다 ~/Clauday-Workspaces/agent/{채널} 폴더가 생깁니다. 여기서 무엇을 했는지 이 화면에서 따라갑니다.'
    }
  ],
  monitoring: [
    {
      title: '메신저 와처',
      body: '지켜볼 채널과 조건(키워드·멘션·발신자)을 정해두면 걸린 메시지가 타임라인에 쌓입니다.'
    },
    { title: 'AI 요약', body: '쌓인 대화의 흐름만 빠르게 훑습니다.' }
  ],
  community: [
    {
      title: '커뮤니티',
      body: '팀이 만든 스킬·MCP 설정을 모아 봅니다. 마음에 드는 것을 받아 바로 씁니다.'
    }
  ],
  'ai-recommend': [
    {
      title: 'AI 추천',
      body: '지금 쓰는 도구와 최근 작업을 보고 도움이 될 만한 스킬·MCP 를 제안합니다.'
    }
  ],
  usage: [
    {
      title: '사용량',
      body: 'Claude Code 사용량을 모델·기간별로 봅니다. 한도까지 얼마나 남았는지도 여기서 확인합니다.'
    }
  ],
  harness: [
    {
      title: 'Harness Studio',
      body: '작업 방법론을 시각화하고 실제로 돌리기 전에 흐름을 확인합니다.'
    }
  ],
  settings: [
    {
      anchor: 'settings-search',
      title: '설정은 검색이 빠릅니다',
      body: '항목 이름을 몰라도 하고 싶은 말을 치면 찾아줍니다.'
    },
    {
      title: '워크스페이스 — 프로젝트별 규칙',
      body: '두레이 프로젝트마다 저장소·브랜치 이름·첫 지시 문구를 따로 정합니다. 업무 드롭이 이 규칙을 씁니다.'
    },
    {
      anchor: 'settings-back',
      title: '앱으로 돌아가기',
      body: '설정은 전체 화면으로 열립니다. 바뀐 값은 그때그때 저장되니 따로 저장 버튼은 없습니다.'
    }
  ]
}

/** 그 메뉴의 투어 단계 수 — 허브 목록에 보여준다. */
export function tourLength(view: TourViewId): number {
  return TOURS[view]?.length ?? 0
}
