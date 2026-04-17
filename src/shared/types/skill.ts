export interface CloverSkill {
  id: string
  name: string
  description: string
  /** 적용 대상 탭 */
  target: 'briefing' | 'report' | 'calendar' | 'wiki' | 'task' | 'messenger' | 'insights' | 'all'
  /** 활성 여부 */
  enabled: boolean
  /** 스킬 본문 (마크다운 - AI에게 전달할 규칙/프롬프트) */
  content: string
  /** MCP 도구 사용 여부 */
  useMcp?: boolean
  /** 사용할 MCP 서버 이름 */
  mcpServer?: string
  /** 자동 실행 (해당 target의 AI 기능 실행 시 자동 포함) vs 수동 실행 */
  autoApply: boolean
  createdAt: string
  updatedAt: string
}

export type SkillTarget = CloverSkill['target']

export const SKILL_TARGETS: { value: SkillTarget; label: string; description: string }[] = [
  { value: 'briefing', label: '브리핑', description: '매일 업무 분석 · 우선순위 추천' },
  { value: 'report', label: '보고서', description: '일간/주간 업무 보고' },
  { value: 'wiki', label: '위키', description: '교정/개선/요약/초안' },
  { value: 'calendar', label: '캘린더', description: '일정 분석 · 회의록' },
  { value: 'task', label: '태스크', description: '태스크 요약' },
  { value: 'messenger', label: '메신저', description: '메시지 작성 말투/규칙' },
  { value: 'insights', label: '인사이트', description: 'Claude Code 세션 요약' },
  { value: 'all', label: '전체', description: '모든 AI 기능에 항상 적용' }
]
