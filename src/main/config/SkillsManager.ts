import { readFile, writeFile, readdir, unlink, mkdir, lstat, rm } from 'fs/promises'
import { existsSync, statSync, lstatSync } from 'fs'
import { basename, join, resolve, sep } from 'path'
import { homedir } from 'os'
import { dialog } from 'electron'
import type { Skill, SkillSaveRequest, SkillDeleteManyResult } from '../../shared/types/skills'
import { sanitizeSkillFilename } from '../../shared/utils/filename'

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

  /**
   * filename 이 skillsDir 하위 경로임을 보장한다 (traversal 봉쇄). 이름은 변형하지 않는다 —
   * 정규화(sanitize)와 목적이 다르다: 이건 파일시스템 경계, sanitize 는 Windows 호환 (ADR-v2-windows-fix-05 §2).
   */
  private resolveSkillDir(filename: string): string {
    const root = resolve(this.skillsDir)
    const dir = resolve(root, filename)
    if (dir !== root && !dir.startsWith(root + sep)) throw new Error('잘못된 스킬 이름')
    if (dir === root) throw new Error('잘못된 스킬 이름')
    return dir
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

  /** 이름을 변형하지 않는다 — 정제 전(레거시) 이름으로 만들어진 스킬도 계속 읽을 수 있어야 한다. */
  async read(filename: string): Promise<string> {
    const skillDir = this.resolveSkillDir(filename)
    return readFile(join(skillDir, 'SKILL.md'), 'utf-8')
  }

  /** 최종 권위 — 어떤 경로로 들어온 이름이든 여기서 Windows 호환 형태로 정제된다. */
  async save(req: SkillSaveRequest): Promise<void> {
    const sanitized = sanitizeSkillFilename(req.filename)
    if (sanitized !== req.filename) {
      console.warn(`[SkillsManager] 파일명 정제 filename=${req.filename} sanitized=${sanitized}`)
    }
    // sanitize 후에도 봉쇄 검증을 한 번 더 통과시킨다 (이중 방어 — sanitize 규칙에 구멍이 나도 경계는 지켜진다).
    const skillDir = this.resolveSkillDir(sanitized)
    if (!existsSync(skillDir)) {
      await mkdir(skillDir, { recursive: true })
    }
    const skillFile = join(skillDir, 'SKILL.md')
    await writeFile(skillFile, req.content, 'utf-8')
  }

  /**
   * 이름을 변형하지 않는다 (레거시 호환). 심볼릭 링크면 링크만 제거하고(공유 원본 보존),
   * 실디렉터리면 재귀 삭제해 디렉터리 잔존을 막는다 (ADR-v2-windows-fix-05 §3).
   */
  async delete(filename: string): Promise<void> {
    const skillDir = this.resolveSkillDir(filename)
    let stat
    try {
      stat = await lstat(skillDir)
    } catch {
      return // 존재하지 않음 — no-op (throw 안 함, 현행과 동일)
    }
    if (stat.isSymbolicLink()) {
      await unlink(skillDir)
    } else {
      await rm(skillDir, { recursive: true, force: true })
    }
  }

  /** 다중 삭제 — 항목별 best-effort 지만 실패를 조용히 삼키지 않는다 (건수 집계 + warn). */
  async deleteMany(filenames: string[]): Promise<SkillDeleteManyResult> {
    let deleted = 0
    let failed = 0
    for (const filename of filenames) {
      try {
        await this.delete(filename)
        deleted++
      } catch (err) {
        failed++
        console.warn(`[SkillsManager] 삭제 실패 filename=${filename}`, err)
      }
    }
    return { deleted, failed }
  }

  /** 사용자가 선택한 .md 파일들을 임포트. 파일명 기준으로 디렉토리를 만들어 SKILL.md 로 저장. */
  async importFromFiles(): Promise<{ imported: number; cancelled: boolean }> {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      title: '스킬 가져오기 (.md 파일 다중 선택)',
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { imported: 0, cancelled: true }
    }
    let imported = 0
    for (const path of result.filePaths) {
      try {
        const content = await readFile(path, 'utf-8')
        // 디렉토리 이름은 파일명에서 확장자만 제거. SKILL.md 로 저장.
        const base = basename(path).replace(/\.(md|markdown)$/i, '')
        await this.save({ filename: base, content })
        imported++
      } catch { /* skip unreadable */ }
    }
    return { imported, cancelled: false }
  }

  /** 지정한 스킬들을 사용자 선택 폴더에 .md 로 내보냄. 디렉토리/SKILL.md 가 아닌 평탄한 형태. */
  async exportToFolder(filenames: string[]): Promise<{ exported: number; cancelled: boolean; folder?: string }> {
    if (filenames.length === 0) return { exported: 0, cancelled: true }
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '스킬 내보낼 폴더 선택'
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { exported: 0, cancelled: true }
    }
    const folder = result.filePaths[0]
    let exported = 0
    for (const filename of filenames) {
      try {
        const content = await this.read(filename)
        // 내보낼 파일명도 Windows 금지문자를 정제 — 사용자가 고른 폴더가 어느 OS 든 안전하게 쓰기 위함.
        const exportName = sanitizeSkillFilename(filename)
        await writeFile(join(folder, `${exportName}.md`), content, 'utf-8')
        exported++
      } catch { /* skip */ }
    }
    return { exported, cancelled: false, folder }
  }
}
