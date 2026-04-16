import { readFile, writeFile, readdir, unlink, mkdir } from 'fs/promises'
import { existsSync, statSync, lstatSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { Skill, SkillSaveRequest } from '../../shared/types/skills'

export class SkillsManager {
  // Claude Code stores skills in ~/.claude/skills/{name}/SKILL.md
  private skillsDir: string

  constructor() {
    this.skillsDir = join(homedir(), '.claude', 'skills')
  }

  private async ensureDir(): Promise<void> {
    if (!existsSync(this.skillsDir)) {
      await mkdir(this.skillsDir, { recursive: true })
    }
  }

  async list(): Promise<Skill[]> {
    await this.ensureDir()
    const entries = await readdir(this.skillsDir)

    const skills: Skill[] = []
    for (const entry of entries) {
      const entryPath = join(this.skillsDir, entry)
      try {
        const stat = lstatSync(entryPath)
        // Each skill is a directory (or symlink to dir) containing SKILL.md
        if (stat.isDirectory() || stat.isSymbolicLink()) {
          const skillFile = join(entryPath, 'SKILL.md')
          if (existsSync(skillFile)) {
            const content = await readFile(skillFile, 'utf-8')
            const fileStat = statSync(skillFile)
            skills.push({
              name: entry,
              filename: entry,
              content,
              updatedAt: fileStat.mtimeMs
            })
          }
        }
      } catch {
        // skip unreadable entries
      }
    }

    return skills.sort((a, b) => a.name.localeCompare(b.name))
  }

  async read(filename: string): Promise<string> {
    const skillFile = join(this.skillsDir, filename, 'SKILL.md')
    return readFile(skillFile, 'utf-8')
  }

  async save(req: SkillSaveRequest): Promise<void> {
    const skillDir = join(this.skillsDir, req.filename)
    if (!existsSync(skillDir)) {
      await mkdir(skillDir, { recursive: true })
    }
    const skillFile = join(skillDir, 'SKILL.md')
    await writeFile(skillFile, req.content, 'utf-8')
  }

  async delete(filename: string): Promise<void> {
    const skillFile = join(this.skillsDir, filename, 'SKILL.md')
    if (existsSync(skillFile)) {
      await unlink(skillFile)
    }
  }
}
