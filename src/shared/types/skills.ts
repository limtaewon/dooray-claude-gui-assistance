export interface Skill {
  name: string
  filename: string
  content: string
  updatedAt: number
}

export interface SkillSaveRequest {
  filename: string
  content: string
}

/** deleteMany 결과 — 실패도 조용히 삼키지 않고 건수로 보고한다 (ADR-v2-windows-fix-05 §3). */
export interface SkillDeleteManyResult {
  deleted: number
  failed: number
}
