export interface CloverSkill {
  id: string
  name: string
  description: string
  /** 적용 대상 탭 */
  target: 'briefing' | 'report' | 'calendar' | 'chat' | 'insights' | 'all'
  /** 활성 여부 */
  enabled: boolean
  /** 스킬 본문 (마크다운 - AI에게 전달할 규칙/프롬프트) */
  content: string
  /** MCP 도구 사용 여부 */
  useMcp?: boolean
  /** 사용할 MCP 서버 이름 */
  mcpServer?: string
  /** 자동 실행 (브리핑 등에서 자동 포함) vs 수동 실행 */
  autoApply: boolean
  createdAt: string
  updatedAt: string
}

export type SkillTarget = CloverSkill['target']

export const SKILL_TARGETS: { value: SkillTarget; label: string }[] = [
  { value: 'briefing', label: '브리핑' },
  { value: 'report', label: '보고서' },
  { value: 'calendar', label: '캘린더' },
  { value: 'chat', label: 'AI 채팅' },
  { value: 'insights', label: '인사이트' },
  { value: 'all', label: '전체' }
]
