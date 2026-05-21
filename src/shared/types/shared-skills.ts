/** 두레이 커뮤니티 프로젝트에 저장된 공유 스킬 한 건 */
export interface SharedSkill {
  /** 두레이 task id */
  postId: string
  /** 공유 시점에 부여한 filename (다운로드 시 사용) */
  filename: string
  /** 표시명 (기본: filename 에서 .md 제거) */
  name: string
  /** 스킬 본문 (frontmatter + 마크다운) — 목록 조회 시에는 비어있을 수 있음 */
  content: string
  /** frontmatter 의 description 필드 — list 단계에서 카드에 노출용. 본문 fetch 없이 보이도록 list 시점에 미리 추출. */
  description?: string
  /** 공유자 */
  authorName: string
  authorId?: string
  /** 공유 시각 */
  createdAt: string
  updatedAt: string
  /** 내가 올린 것인지 */
  isMine: boolean
}

export interface SharedSkillUploadRequest {
  filename: string
  name: string
  content: string
}
