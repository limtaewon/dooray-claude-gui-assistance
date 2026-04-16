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
