import {
  BarChart3,
  Bot,
  Calendar,
  Lightbulb,
  MessageSquare,
  Radar,
  Server,
  Sparkles,
  Terminal,
  Users,
  Workflow,
  type LucideIcon
} from 'lucide-react'
import { OnboardingView, type OnboardingAction, type OnboardingStep } from '../ds'

/** 온보딩을 제공하는 메뉴. 설정/매뉴얼은 화면 자체가 설명이라 대상이 아니다. */
export type OnboardingViewId =
  | 'dooray'
  | 'monitoring'
  | 'agent'
  | 'terminal'
  | 'harness'
  | 'community'
  | 'mcp'
  | 'skills'
  | 'ai-recommend'
  | 'sessions'
  | 'usage'

interface OnboardingCopy {
  icon: LucideIcon
  title: string
  description: string
  steps: OnboardingStep[]
  hint?: string
  /** 도메인 식별색 — Claude 기능은 주황, 두레이 기능은 파랑 */
  accent?: 'claude' | 'dooray'
}

/**
 * 메뉴별 온보딩 문구. 각 뷰의 "아직 아무것도 없음" 자리를 "여기서 무엇을 할 수 있는지"로 바꾼다.
 * 문구를 한곳에 모아두면 메뉴가 늘 때 빠진 곳을 바로 알 수 있다.
 */
export const VIEW_ONBOARDING: Record<OnboardingViewId, OnboardingCopy> = {
  dooray: {
    icon: Calendar,
    accent: 'dooray',
    title: '두레이',
    description: '업무·위키·캘린더·메신저를 앱 안에서 그대로 봅니다. AI 브리핑과 보고서도 여기서 만듭니다.',
    steps: [
      { title: '설정에서 두레이 API 토큰을 연결합니다', body: '토큰은 OS 키체인에 저장되며 앱 밖으로 나가지 않습니다.' },
      { title: '자주 쓰는 프로젝트를 핀 고정합니다', body: '고정한 프로젝트의 내 업무만 모아서 봅니다.' },
      { title: '업무를 터미널로 끌어다 놓으면 작업이 시작됩니다', body: '매핑된 저장소로 이동하고 Claude 세션이 그 업무에 연결됩니다.' }
    ],
    hint: '토큰 연결 전에는 목록이 비어 있습니다'
  },
  monitoring: {
    icon: Radar,
    accent: 'dooray',
    title: '모니터링',
    description: '두레이 메신저 채널을 지켜보다가 내가 정한 조건에 걸리면 알려줍니다.',
    steps: [
      { title: '와처를 만들어 채널과 조건을 정합니다', body: '키워드·멘션·특정 발신자 등으로 거를 수 있습니다.' },
      { title: '걸린 메시지는 타임라인에 쌓입니다', body: '놓친 대화를 한 번에 훑어봅니다.' },
      { title: 'AI 요약으로 흐름만 빠르게 파악합니다' }
    ]
  },
  agent: {
    icon: Bot,
    accent: 'dooray',
    title: '에이전트',
    description: '두레이 채팅방에서 @clauday 를 부르면 Claude Code 가 그 대화 맥락으로 작업합니다.',
    steps: [
      { title: '설정에서 봇 토큰을 넣고 Socket Mode 를 켭니다' },
      { title: '채팅방에서 @clauday 로 멘션합니다', body: '최근 대화를 함께 읽어 맥락을 잡습니다.' },
      { title: '진행 상황을 여기서 실시간으로 봅니다', body: '채널마다 작업 폴더가 분리됩니다.' }
    ],
    hint: '봇이 연결되면 멘션 세션이 여기에 나타납니다'
  },
  terminal: {
    icon: Terminal,
    title: '터미널',
    description: '셸 세션을 열어 작업을 시작하세요. 업무·변경사항·히스토리·브랜치가 사이드 패널에 함께 붙습니다.',
    steps: [],
    hint: '업무 카드를 터미널로 끌어다 놓으면 그 폴더에서 바로 시작합니다'
  },
  harness: {
    icon: Workflow,
    accent: 'claude',
    title: 'Harness Studio',
    description: '에이전트 파이프라인을 그림으로 보고, 실제로 돌리기 전에 Dry-run 으로 확인합니다.',
    steps: [
      { title: '하네스 폴더를 열면 구조를 그려줍니다', body: '에이전트·스킬·워크플로의 연결을 한눈에 봅니다.' },
      { title: 'Dry-run 으로 흐름을 미리 검증합니다', body: '실제 실행 없이 어느 단계로 가는지 확인합니다.' },
      { title: 'AI 편집으로 파이프라인을 고칩니다', body: '변경은 diff 로 먼저 보여주고, 되돌릴 수 있습니다.' }
    ]
  },
  community: {
    icon: Users,
    accent: 'dooray',
    title: '커뮤니티',
    description: '팀이 만든 스킬·MCP 설정을 두레이 위키로 주고받습니다.',
    steps: [
      { title: '공유 위키를 등록합니다', body: '컨테이너 페이지는 자동으로 만들어집니다.' },
      { title: '내 스킬을 올리면 팀이 바로 받습니다' },
      { title: '받은 항목은 목록에서 켜고 끕니다', body: '끈 항목은 보관함으로 옮겨져 Claude 가 읽지 않습니다.' }
    ]
  },
  mcp: {
    icon: Server,
    accent: 'claude',
    title: 'MCP 서버',
    description: 'Claude Code 가 쓸 도구 서버를 등록하고 켜고 끕니다.',
    steps: [
      { title: '서버를 추가합니다', body: 'stdio(로컬 명령) 또는 http/sse(원격 URL) 를 고릅니다.' },
      { title: '토글로 켜고 끕니다', body: '끈 서버는 보관함으로 옮겨져 Claude 가 로드하지 않습니다.' },
      { title: '팀과 공유합니다', body: '두레이 위키를 통해 설정을 그대로 주고받습니다.' }
    ],
    hint: 'Windows 에서는 npx/uvx 명령이 자동으로 cmd /c 로 저장됩니다'
  },
  skills: {
    icon: Sparkles,
    accent: 'claude',
    title: 'Claude 스킬',
    description: 'Claude Code 가 상황에 맞게 꺼내 쓰는 스킬을 만들고 관리합니다.',
    steps: [
      { title: '스킬을 만듭니다', body: '템플릿에서 시작하거나 AI 로 초안을 뽑습니다.' },
      { title: '토글로 켜고 끕니다', body: '끈 스킬은 보관함으로 옮겨져 Claude 가 로드하지 않습니다.' },
      { title: '위키로 팀과 주고받습니다', body: '받은 스킬은 바로 목록에 들어옵니다.' }
    ]
  },
  'ai-recommend': {
    icon: Lightbulb,
    accent: 'claude',
    title: 'AI 추천',
    description: '지금 하는 일을 보고 도움이 될 스킬과 MCP 서버를 골라줍니다.',
    steps: [
      { title: '추천 받기를 누릅니다', body: '설치된 스킬·MCP 와 최근 작업을 함께 봅니다.' },
      { title: '이유를 읽고 고릅니다', body: '왜 필요한지 설명이 함께 나옵니다.' },
      { title: '바로 설치하거나 스킬 초안을 만듭니다' }
    ]
  },
  sessions: {
    icon: MessageSquare,
    accent: 'claude',
    title: 'Claude 채팅',
    description: 'Claude Code 세션을 이어서 대화합니다. 과거 세션도 그대로 다시 엽니다.',
    steps: [
      { title: '폴더를 고르면 그 폴더의 세션이 나옵니다', body: '터미널에서 만든 세션도 같이 보입니다.' },
      { title: '세션을 열면 이어서 대화합니다', body: 'claude -r 로 맥락을 그대로 복원합니다.' },
      { title: '파일을 첨부해 물어볼 수 있습니다' }
    ],
    hint: '아직 세션이 없으면 터미널에서 claude 를 한 번 실행해 보세요'
  },
  usage: {
    icon: BarChart3,
    accent: 'claude',
    title: '사용량',
    description: 'Claude Code 의 토큰 사용량과 비용을 날짜·모델·프로젝트별로 봅니다.',
    steps: [
      { title: '로컬 사용 기록을 읽어 집계합니다', body: '외부로 아무것도 보내지 않습니다.' },
      { title: '기간과 모델로 나눠 봅니다' },
      { title: 'AI 인사이트로 어디에 많이 썼는지 짚어줍니다' }
    ],
    hint: 'Claude Code 를 한 번도 쓰지 않았다면 집계할 기록이 없습니다'
  }
}

interface ViewOnboardingProps {
  view: OnboardingViewId
  /** 이 화면에서 바로 할 수 있는 동작 — 뷰마다 다르므로 호출부가 넘긴다 */
  actions?: OnboardingAction[]
  /** 좁은 패널용 축약 레이아웃 */
  compact?: boolean
  /** 레지스트리 문구를 덮어쓸 때 (예: 목록은 있는데 검색 결과만 없는 경우) */
  description?: string
}

const ACCENT_VAR: Record<'claude' | 'dooray', string> = {
  claude: 'var(--brand-claude)',
  dooray: 'var(--brand-dooray)'
}

/** 메뉴별 온보딩 화면. 문구는 `VIEW_ONBOARDING` 이 소유하고 동작만 호출부가 넘긴다. */
export function ViewOnboarding({ view, actions, compact, description }: ViewOnboardingProps): JSX.Element {
  const copy = VIEW_ONBOARDING[view]
  return (
    <OnboardingView
      icon={copy.icon}
      title={copy.title}
      description={description ?? copy.description}
      steps={copy.steps}
      actions={actions}
      hint={copy.hint}
      compact={compact}
      accent={copy.accent ? ACCENT_VAR[copy.accent] : undefined}
    />
  )
}
