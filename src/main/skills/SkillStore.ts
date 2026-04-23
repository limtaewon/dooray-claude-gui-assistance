import { app } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync, existsSync, copyFileSync, statSync } from 'fs'
import type { CloverSkill, SkillTarget } from '../../shared/types/skill'

/**
 * 스킬 파일시스템 저장소 (.md 형식, Claude Code CLI 스킬과 동일한 구조)
 *
 * 파일 형식:
 * ---
 * name: 배치 실패 모니터링
 * description: NEON-배치모니터링 프로젝트의 실패 알림 집계
 * enabled: true
 * autoApply: true
 * ---
 * ## 규칙
 * - 배치명별 실패 횟수 집계
 * ...
 *
 * 저장 위치:
 *   ~/Library/Application Support/clover/briefing/skills/*.md
 *   ~/Library/Application Support/clover/report/skills/*.md
 */
const TARGETS: SkillTarget[] = ['briefing', 'report', 'calendar', 'wiki', 'task', 'insights', 'aiRecommend', 'all']
// 'chat'은 구버전 호환용 (스킬 파일은 남아있을 수 있으므로 읽기 위해 유지)
const LEGACY_TARGETS: string[] = ['chat']

function parseFrontmatter(raw: string): { meta: Record<string, string>; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { meta: {}, content: raw }
  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx > 0) {
      meta[line.substring(0, idx).trim()] = line.substring(idx + 1).trim()
    }
  }
  return { meta, content: match[2] }
}

function toFrontmatter(skill: CloverSkill): string {
  return `---
name: ${skill.name}
description: ${skill.description}
enabled: ${skill.enabled}
autoApply: ${skill.autoApply}
---
${skill.content}`
}

function fileToSkill(filePath: string, target: string): CloverSkill | null {
  try {
    const raw = readFileSync(filePath, 'utf-8')

    // JSON 호환 (기존 파일)
    if (raw.trimStart().startsWith('{')) {
      const skill = JSON.parse(raw) as CloverSkill
      skill.target = target as SkillTarget
      return skill
    }

    // Markdown frontmatter
    const { meta, content } = parseFrontmatter(raw)
    const fileName = filePath.split('/').pop()?.replace(/\.(md|json)$/, '') || ''
    return {
      id: fileName,
      name: meta.name || fileName,
      description: meta.description || '',
      target: target as SkillTarget,
      enabled: meta.enabled !== 'false',
      autoApply: meta.autoApply !== 'false',
      content,
      createdAt: meta.createdAt || '',
      updatedAt: meta.updatedAt || new Date().toISOString()
    }
  } catch {
    return null
  }
}

export class SkillStore {
  private baseDir: string

  constructor() {
    this.baseDir = app.getPath('userData')
    this.migrateFromLegacyPaths()
  }

  /** 구 버전(clover) 및 dev 경로에서 스킬 자동 이전 */
  private migrateFromLegacyPaths(): void {
    const legacyRoots = [
      join(homedir(), 'Library', 'Application Support', 'clover'),
      join(homedir(), 'Library', 'Application Support', 'clauday')
    ].filter((p) => p !== this.baseDir)

    for (const root of legacyRoots) {
      if (!existsSync(root)) continue
      for (const target of TARGETS) {
        const srcDir = join(root, target, 'skills')
        if (!existsSync(srcDir)) continue
        const destDir = this.targetDir(target)
        if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })

        try {
          for (const file of readdirSync(srcDir)) {
            if (!file.endsWith('.md') && !file.endsWith('.json')) continue
            const src = join(srcDir, file)
            const dest = join(destDir, file)
            // 이미 있으면 더 최근 파일 유지
            if (existsSync(dest)) {
              try {
                if (statSync(src).mtimeMs <= statSync(dest).mtimeMs) continue
              } catch { continue }
            }
            try { copyFileSync(src, dest) } catch { /* ok */ }
          }
        } catch { /* ok */ }
      }
    }
  }

  private targetDir(target: string): string {
    return join(this.baseDir, target, 'skills')
  }

  private ensureDir(target: string): void {
    const dir = this.targetDir(target)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }

  private filePath(target: string, id: string): string {
    const safeName = id.replace(/[^a-zA-Z0-9_-]/g, '_')
    return join(this.targetDir(target), `${safeName}.md`)
  }

  private readSkillsFromDir(target: string): CloverSkill[] {
    const dir = this.targetDir(target)
    if (!existsSync(dir)) return []
    const files = readdirSync(dir).filter((f) => f.endsWith('.md') || f.endsWith('.json'))
    const skills: CloverSkill[] = []
    for (const file of files) {
      const skill = fileToSkill(join(dir, file), target)
      if (skill) skills.push(skill)
    }
    return skills
  }

  /** 인메모리 캐시 (save/delete 시 무효화) */
  private skillCache = new Map<string, CloverSkill[]>()

  private readCached(target: string): CloverSkill[] {
    const cached = this.skillCache.get(target)
    if (cached) return cached
    const skills = this.readSkillsFromDir(target)
    this.skillCache.set(target, skills)
    return skills
  }

  private invalidateCache(): void {
    this.skillCache.clear()
  }

  list(): CloverSkill[] {
    const all: CloverSkill[] = []
    for (const target of TARGETS) all.push(...this.readCached(target))
    return all.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  }

  get(id: string): CloverSkill | null {
    for (const target of TARGETS) {
      // .md 먼저, .json 폴백
      for (const ext of ['.md', '.json']) {
        const safeName = id.replace(/[^a-zA-Z0-9_-]/g, '_')
        const fp = join(this.targetDir(target), `${safeName}${ext}`)
        const skill = fileToSkill(fp, target)
        if (skill) return skill
      }
    }
    return null
  }

  save(skill: CloverSkill): void {
    // 모든 target에서 이전 파일 삭제 (.md, .json 모두)
    const safeName = skill.id.replace(/[^a-zA-Z0-9_-]/g, '_')
    for (const target of TARGETS) {
      try { unlinkSync(join(this.targetDir(target), `${safeName}.md`)) } catch { /* ok */ }
      try { unlinkSync(join(this.targetDir(target), `${safeName}.json`)) } catch { /* ok */ }
    }
    // .md 형식으로 저장
    this.ensureDir(skill.target)
    writeFileSync(this.filePath(skill.target, skill.id), toFrontmatter(skill), 'utf-8')
    this.invalidateCache()
  }

  delete(id: string): void {
    const safeName = id.replace(/[^a-zA-Z0-9_-]/g, '_')
    for (const target of TARGETS) {
      try { unlinkSync(join(this.targetDir(target), `${safeName}.md`)) } catch { /* ok */ }
      try { unlinkSync(join(this.targetDir(target), `${safeName}.json`)) } catch { /* ok */ }
    }
    this.invalidateCache()
  }

  forTarget(target: string): CloverSkill[] {
    const skills = [...this.readCached(target), ...this.readCached('all')]
    return skills.filter((s) => s.enabled && s.autoApply)
  }
}
