import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, mkdirSync, existsSync, symlinkSync } from 'fs'
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
    expect(r.failed).toBe(0)
  })

  it('deleteMany — 일부 실패는 failed 로 집계 (조용히 삼키지 않는다)', async () => {
    makeSkill('ok', 'x')
    const m = makeManager()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // traversal 이름은 resolveSkillDir 에서 throw → deleteMany 가 failed 로 집계해야 함
    const r = await m.deleteMany(['ok', '../../evil'])
    expect(r.deleted).toBe(1)
    expect(r.failed).toBe(1)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('delete 후 디렉토리 자체가 남지 않는다 (SKILL.md 만 지우던 결함 수복, ADR-v2-windows-fix-05 §3)', async () => {
    makeSkill('foo', 'X')
    writeFileSync(join(tmpDir, 'foo', 'notes.txt'), '보조 파일', 'utf8')
    await makeManager().delete('foo')
    expect(existsSync(join(tmpDir, 'foo'))).toBe(false)
  })

  it('delete — 심볼릭 링크는 링크만 지우고 대상 디렉토리는 보존한다', async () => {
    makeSkill('orig', 'O')
    const target = join(tmpDir, 'orig')
    const link = join(tmpDir, 'linked')
    try { symlinkSync(target, link, 'dir') } catch { return }
    await makeManager().delete('linked')
    expect(existsSync(link)).toBe(false)
    expect(existsSync(join(target, 'SKILL.md'))).toBe(true)
  })

  it('save — Windows 금지문자가 포함된 이름은 정제된 디렉토리명으로 저장된다', async () => {
    const m = makeManager()
    await m.save({ filename: 'Q&A: 정리', content: '내용' })
    expect(existsSync(join(tmpDir, 'Q&A_ 정리', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(tmpDir, 'Q&A: 정리'))).toBe(false)
  })

  it('save 는 traversal 이름을 sanitize 로 무력화해 skillsDir 밖에 아무것도 만들지 않는다', async () => {
    const m = makeManager()
    const outside = join(tmpDir, '..', 'evil-skillsmanager-test')
    // save 는 sanitize 가 먼저 이름을 안전하게 바꾸므로 throw 하지 않는다 — 그래도 결과는 skillsDir 안에만 생긴다.
    await expect(m.save({ filename: '../../evil-skillsmanager-test/x', content: 'X' })).resolves.toBeUndefined()
    expect(existsSync(outside)).toBe(false)
    const created = readdirSync(tmpDir)
    expect(created.some((name) => name.includes('..') || name.includes('/'))).toBe(false)
  })

  it('read/delete 는 정제하지 않으므로 traversal 이름이 그대로 오면 봉쇄 검증에서 throw 한다', async () => {
    const m = makeManager()
    const outside = join(tmpDir, '..', 'evil-skillsmanager-test')
    await expect(m.read('../../evil-skillsmanager-test/x')).rejects.toThrow()
    await expect(m.delete('../../evil-skillsmanager-test/x')).rejects.toThrow()
    expect(existsSync(outside)).toBe(false)
  })

  it('read/delete 는 정제 전(레거시) 이름 그대로 만든 디렉토리에 접근할 수 있다 (봉쇄 검증만, 이름 변형 없음)', async () => {
    // mac/Linux 에서는 'Q&A: 정리' 같은 디렉토리가 실제로 존재할 수 있다 — read/delete 가 이를 변형하면 ENOENT.
    makeSkill('Q&A: 정리', '레거시 내용')
    const m = makeManager()
    expect(await m.read('Q&A: 정리')).toBe('레거시 내용')
    await expect(m.delete('Q&A: 정리')).resolves.toBeUndefined()
    expect(existsSync(join(tmpDir, 'Q&A: 정리'))).toBe(false)
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
