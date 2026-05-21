import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync, symlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn() }
}))

import { SkillsManager } from './SkillsManager'
import { dialog } from 'electron'
const dialogShowOpenDialog = dialog.showOpenDialog as unknown as ReturnType<typeof vi.fn>

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'skills-test-'))
  dialogShowOpenDialog.mockReset()
})
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function makeManager(): SkillsManager {
  const m = new SkillsManager()
  ;(m as unknown as { skillsDir: string }).skillsDir = tmpDir
  return m
}

function makeSkill(name: string, content: string): void {
  const dir = join(tmpDir, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf8')
}

describe('SkillsManager.list', () => {
  it('SKILL.md 가 있는 디렉토리만 수집', async () => {
    makeSkill('alpha', 'A')
    makeSkill('beta', 'B')
    mkdirSync(join(tmpDir, 'no-skill'), { recursive: true })
    const list = await makeManager().list()
    expect(list.map((s) => s.name).sort()).toEqual(['alpha', 'beta'])
  })

  it('디렉토리 없으면 ensureDir 로 생성', async () => {
    rmSync(tmpDir, { recursive: true, force: true })
    expect(await makeManager().list()).toEqual([])
    expect(existsSync(tmpDir)).toBe(true)
  })

  it('이름 알파벳 정렬', async () => {
    makeSkill('zzz', 'Z')
    makeSkill('aaa', 'A')
    makeSkill('mmm', 'M')
    const list = await makeManager().list()
    expect(list.map((s) => s.name)).toEqual(['aaa', 'mmm', 'zzz'])
  })

  it('symbolic link 디렉토리도 인식', async () => {
    makeSkill('orig', 'O')
    const target = join(tmpDir, 'orig')
    const link = join(tmpDir, 'linked')
    try { symlinkSync(target, link, 'dir') } catch { return }
    const list = await makeManager().list()
    expect(list.map((s) => s.name).sort()).toEqual(['linked', 'orig'])
  })
})

describe('SkillsManager.save / read / delete', () => {
  it('save 후 read 라운드트립', async () => {
    const m = makeManager()
    await m.save({ filename: 'foo', content: 'Skill content' })
    expect(await m.read('foo')).toBe('Skill content')
    expect(readFileSync(join(tmpDir, 'foo', 'SKILL.md'), 'utf8')).toBe('Skill content')
  })

  it('delete 존재 시 SKILL.md 제거', async () => {
    makeSkill('foo', 'X')
    await makeManager().delete('foo')
    expect(existsSync(join(tmpDir, 'foo', 'SKILL.md'))).toBe(false)
  })

  it('delete 없는 파일은 no-op', async () => {
    await expect(makeManager().delete('missing')).resolves.toBeUndefined()
  })

  it('deleteMany — 모든 항목 시도 (존재하지 않아도 no-op 처리)', async () => {
    makeSkill('a', 'a')
    makeSkill('b', 'b')
    const r = await makeManager().deleteMany(['a', 'b', 'c'])
    // delete 가 ENOENT 도 graceful 하므로 모두 성공 카운트
    expect(r.deleted).toBeGreaterThanOrEqual(2)
  })
})

describe('SkillsManager.importFromFiles', () => {
  it('취소 시 imported=0 + cancelled=true', async () => {
    dialogShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    expect(await makeManager().importFromFiles()).toEqual({ imported: 0, cancelled: true })
  })

  it('파일 0개도 cancelled 처리', async () => {
    dialogShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] })
    expect((await makeManager().importFromFiles()).cancelled).toBe(true)
  })

  it('파일 임포트 후 SKILL.md 생성', async () => {
    const src = join(tmpDir, 'my-skill.md')
    writeFileSync(src, 'imported content', 'utf8')
    dialogShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [src] })
    const r = await makeManager().importFromFiles()
    expect(r.imported).toBe(1)
    expect(readFileSync(join(tmpDir, 'my-skill', 'SKILL.md'), 'utf8')).toBe('imported content')
  })

  it('읽기 실패 파일은 skip', async () => {
    const ok = join(tmpDir, 'ok.md')
    writeFileSync(ok, 'content', 'utf8')
    dialogShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [join(tmpDir, 'missing.md'), ok] })
    const r = await makeManager().importFromFiles()
    expect(r.imported).toBe(1)
  })
})

describe('SkillsManager.exportToFolder', () => {
  it('빈 입력은 cancelled', async () => {
    expect((await makeManager().exportToFolder([])).cancelled).toBe(true)
  })

  it('취소 시 cancelled', async () => {
    dialogShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    expect((await makeManager().exportToFolder(['foo'])).cancelled).toBe(true)
  })

  it('성공 시 폴더에 .md 파일 저장', async () => {
    makeSkill('alpha', 'A-content')
    const outDir = mkdtempSync(join(tmpdir(), 'export-'))
    dialogShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [outDir] })
    const r = await makeManager().exportToFolder(['alpha'])
    expect(r.exported).toBe(1)
    expect(readFileSync(join(outDir, 'alpha.md'), 'utf8')).toBe('A-content')
    rmSync(outDir, { recursive: true, force: true })
  })

  it('존재하지 않는 스킬은 skip', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'export2-'))
    dialogShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [outDir] })
    const r = await makeManager().exportToFolder(['missing'])
    expect(r.exported).toBe(0)
    rmSync(outDir, { recursive: true, force: true })
  })
})
