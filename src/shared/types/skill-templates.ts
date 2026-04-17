import type { SkillTarget } from './skill'

export interface SkillTemplate {
  id: string
  name: string
  description: string
  target: SkillTarget
  content: string
  /** 어떤 역할에 적합한지 */
  roles?: string[]
}

/**
 * 기본 제공 스킬 템플릿 (신규 유저 허들 제거용).
 * 사용자는 템플릿 선택 → 자동으로 스킬 생성 → 필요시 수정.
 */
export const SKILL_TEMPLATES: SkillTemplate[] = [
  // ===== 브리핑 =====
  {
    id: 'tpl-briefing-dev',
    name: '개발자 기본 브리핑',
    description: '긴급/PR 리뷰/빌드 실패 강조. 백엔드·프론트 개발자용',
    target: 'briefing',
    roles: ['개발자'],
    content: `## 브리핑 규칙
- 태그 #긴급 / #버그 / #핫픽스가 달린 태스크는 최우선으로 urgent에 넣어줘
- 제목에 "리뷰" / "PR" / "머지" 포함된 태스크는 focus에 우선
- 빌드 실패 / 배포 실패 / 장애 관련 키워드가 제목이나 태그에 있으면 urgent로
- 스프린트/마일스톤이 이번 주차인 태스크는 오늘 집중으로 추천
- working 상태가 3일 이상 된 태스크는 stale에 넣고 경고

## 추천 톤
- 간결하게, 개발자가 바로 행동 가능한 액션으로 제안
- "어떤 PR부터 리뷰할지", "어떤 이슈부터 파볼지" 형태로`
  },
  {
    id: 'tpl-briefing-pm',
    name: '기획자/PM 기본 브리핑',
    description: '마감 임박/리뷰 대기/승인 필요 강조',
    target: 'briefing',
    roles: ['기획자', 'PM'],
    content: `## 브리핑 규칙
- 오늘~3일 내 마감 태스크는 urgent로 필수 포함
- "승인", "검토", "피드백" 키워드가 포함된 태스크는 focus로
- CC로 멘션된 태스크 중 "리뷰 요청", "확인 바랍니다" 같은 액션 요구는 mentioned에 명확히 사유 표기
- 마일스톤이 이번 스프린트인 미시작 태스크(registered)는 착수 권고 포함

## 추천 톤
- 이해관계자 관점에서 블로커/리스크를 먼저 짚기
- "누가 언제까지 뭘 해야 하는지" 명시`
  },
  {
    id: 'tpl-briefing-lead',
    name: '팀 리드 브리핑',
    description: '팀원 멘션/리소스 분배/팀 전체 흐름 중심',
    target: 'briefing',
    roles: ['팀장', '리드'],
    content: `## 브리핑 규칙
- CC 멘션 태스크를 모두 mentioned에 포함하고 "누가 물어봤는지" 명시
- 팀원 담당 태스크 중 오래 방치된 것(7일+)을 stale에 포함하여 개입 필요 표시
- 여러 태스크가 동일 팀원에게 몰려있으면 recommendations에 재분배 제안
- 리더 의사결정이 필요한 태스크("approval", "승인 대기")는 urgent

## 추천 톤
- 팀 전체 흐름 + 개인 업무를 구분
- 팀 효율 관점의 개선 제안 포함`
  },

  // ===== 보고서 =====
  {
    id: 'tpl-report-weekly-team',
    name: '팀 주간 보고 템플릿',
    description: '진행/완료/이슈 3섹션 + 협조 요청',
    target: 'report',
    roles: ['개발자', '기획자'],
    content: `## 보고서 구조
다음 형식으로 주간 보고를 작성해:

### 📌 이번 주 완료
- 완료 태스크를 프로젝트별로 묶어 나열
- 핵심 성과 1줄 요약

### 🚧 이번 주 진행 중
- 현재 상태 + 진척률
- 블로커 있으면 명시

### ⚠️ 이슈/리스크
- 다음 주 영향 줄 만한 사항
- 의사결정 필요한 사항

### 🤝 협조 요청
- 다른 팀/개인에게 필요한 지원 명시

### 📅 다음 주 계획
- 핵심 태스크 3-5개 선정

## 추천 톤
- 간결, 정량적 (개수/수치 포함)
- 감정어 배제`
  },
  {
    id: 'tpl-report-exec',
    name: '임원 보고용',
    description: '성과 중심, 정량 지표, 리스크 요약',
    target: 'report',
    roles: ['팀장', '리드'],
    content: `## 보고서 구조
임원 대상이니 가장 위에 핵심 요약 3줄 → 세부는 bullet.

### TL;DR (3줄 이내)
- 이번주 핵심 성과
- 주요 이슈/리스크
- 다음주 집중 영역

### 성과 지표
- 완료 건수 / 진행 중 건수 / 지연 건수
- 중요 마일스톤 달성 여부

### 리스크 & 의사결정 필요 사항
- 임원 개입 필요한 사항만

### 다음 주 우선순위
- 최대 3개

## 톤
- 매우 간결
- 정량 지표 우선
- 기술 용어보다 비즈니스 임팩트로 서술`
  }
]

export function getTemplatesByTarget(target: SkillTarget): SkillTemplate[] {
  return SKILL_TEMPLATES.filter((t) => t.target === target || target === 'all')
}
