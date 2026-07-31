import {
  BarChart2,
  CalendarDays,
  Cpu,
  FolderGit2,
  Key,
  Keyboard,
  Palette,
  SlidersHorizontal,
  type LucideIcon
} from 'lucide-react'
import type { SettingsSearchTarget } from './settingsSearch'

export type SettingsSectionId =
  | 'models'
  | 'insights'
  | 'dooray'
  | 'caldav'
  | 'workspace'
  | 'keys'
  | 'appearance'
  | 'behavior'

export interface SettingsNavItem {
  id: SettingsSectionId
  label: string
  icon: LucideIcon
}

export interface SettingsNavGroup {
  id: string
  label: string
  items: SettingsNavItem[]
}

/**
 * 좌측 네비. 그룹은 "무엇을 하려는가" 기준으로 묶는다 —
 * 연결(외부 계정) / 작업(내 작업 방식) / 앱(보이는 것) / AI.
 */
export const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = [
  {
    id: 'connections',
    label: '연결',
    items: [
      { id: 'dooray', label: '두레이', icon: Key },
      { id: 'caldav', label: '캘린더', icon: CalendarDays }
    ]
  },
  {
    id: 'work',
    label: '작업',
    items: [
      { id: 'workspace', label: '워크스페이스', icon: FolderGit2 },
      { id: 'keys', label: '단축키', icon: Keyboard }
    ]
  },
  {
    id: 'ai',
    label: 'AI',
    items: [
      { id: 'models', label: '모델', icon: Cpu },
      { id: 'insights', label: '사용 인사이트', icon: BarChart2 }
    ]
  },
  {
    id: 'app',
    label: '앱',
    items: [
      { id: 'appearance', label: '외관', icon: Palette },
      { id: 'behavior', label: '동작', icon: SlidersHorizontal }
    ]
  }
]

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = SETTINGS_NAV_GROUPS.flatMap((g) => g.items)

export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = 'dooray'

/** 섹션 제목·설명 — 헤더와 검색이 같은 문구를 쓴다. */
export const SETTINGS_SECTION_META: Record<
  SettingsSectionId,
  { title: string; description: string }
> = {
  dooray: {
    title: '두레이 연결',
    description: 'API 토큰을 연결하면 업무·위키·캘린더·메신저를 앱 안에서 봅니다. 토큰은 OS 키체인에 저장됩니다.'
  },
  caldav: {
    title: '캘린더 연결',
    description: 'CalDAV 로 두레이 캘린더를 동기화합니다. 일정 조회와 생성·수정을 앱에서 바로 합니다.'
  },
  workspace: {
    title: '워크스페이스',
    description: '업무 패널에 띄울 두레이 프로젝트와, 업무를 끌어다 놓을 저장소를 관리합니다.'
  },
  keys: {
    title: '단축키',
    description: '앱의 모든 단축키를 확인하고 바꿉니다. 충돌하면 표시됩니다.'
  },
  models: {
    title: 'AI 모델',
    description: '기능별로 어떤 Claude 모델을 쓸지 정합니다. 짧은 요약은 빠른 모델, 설계는 강한 모델이 낫습니다.'
  },
  insights: {
    title: '사용 인사이트',
    description: 'Claude Code 사용량과 비용을 봅니다. 집계는 로컬 기록으로만 하며 외부로 보내지 않습니다.'
  },
  appearance: {
    title: '외관',
    description: '테마·색상·글꼴과 사이드바 구성을 정합니다.'
  },
  behavior: {
    title: '동작',
    description: '시작 화면, 터미널 렌더러, 알림 같은 앱 동작을 정합니다.'
  }
}

/**
 * 검색 카탈로그. 설정 행은 대부분 언마운트 상태라 DOM 검색이 불가능해서
 * **여기 없으면 검색에 안 걸린다.** 설정을 추가하면 이 목록에도 한 줄 추가한다.
 */
export const SETTINGS_SEARCH_TARGETS: SettingsSearchTarget[] = [
  ...SETTINGS_NAV_ITEMS.map((item) => ({
    sectionId: item.id,
    title: SETTINGS_SECTION_META[item.id].title,
    description: SETTINGS_SECTION_META[item.id].description
  })),

  { sectionId: 'dooray', title: 'API 토큰', keywords: ['token', 'api', '인증', '로그인'] },
  { sectionId: 'caldav', title: 'CalDAV 엔드포인트', keywords: ['caldav', 'calendar', '일정'] },
  { sectionId: 'dooray', title: 'Socket Mode 봇', description: '@clauday 멘션 수신', keywords: ['socket', 'bot', '멘션', 'mention', 'clauday'] },
  { sectionId: 'workspace', title: '두레이 프로젝트 선택', keywords: ['project', '핀', '고정'] },
  { sectionId: 'workspace', title: '저장소 등록', keywords: ['repo', 'repository', 'git', '폴더'] },
  { sectionId: 'keys', title: '단축키 변경', keywords: ['shortcut', 'keybinding', 'hotkey', '키'] },
  { sectionId: 'models', title: '기능별 모델', keywords: ['model', 'opus', 'sonnet', 'haiku'] },
  { sectionId: 'insights', title: '토큰 사용량', keywords: ['usage', 'token', '비용', 'cost'] },

  { sectionId: 'appearance', title: '테마', description: '밝게/어둡게', keywords: ['theme', 'dark', 'light', '다크', '라이트'] },
  { sectionId: 'appearance', title: '색상 팔레트', keywords: ['palette', 'color', '색'] },
  { sectionId: 'appearance', title: '글꼴', description: '앱 전체 글꼴과 크기', keywords: ['font', 'size', '폰트', '크기'] },
  { sectionId: 'appearance', title: '사이드바 구성', description: '메뉴 순서와 표시 여부', keywords: ['sidebar', 'menu', '메뉴', '순서'] },

  { sectionId: 'behavior', title: '시작 화면', keywords: ['startup', '시작', '첫 화면'] },
  { sectionId: 'behavior', title: '터미널 렌더러', description: 'WebGL 또는 DOM', keywords: ['renderer', 'webgl', 'gpu', '터미널'] },
  { sectionId: 'behavior', title: 'AI 추천 알림', keywords: ['notification', '알림', 'recommend'] }
]
