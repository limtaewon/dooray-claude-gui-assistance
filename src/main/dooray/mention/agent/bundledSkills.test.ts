import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { BUNDLED_SKILLS } from './bundledSkills'
import { syncBundledSkills } from '../AgentWorkspaceManager'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'bundled-skills-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const skillPath = (name: string): string => join(dir, '.claude', 'skills', name, 'SKILL.md')

describe('BUNDLED_SKILLS', () => {
  it('각 스킬은 name 이 일치하는 frontmatter 와 description 을 가진다', () => {
    for (const s of BUNDLED_SKILLS) {
      expect(s.content.startsWith('---\n')).toBe(true)
      expect(s.content).toMatch(new RegExp(`^name: ${s.name}$`, 'm'))
      expect(s.content).toMatch(/^description: .{20,}$/m)
    }
  })

  it('사용 정책(특정 프로젝트·공개 범위 고정)을 담지 않는다 — 개인 스킬 몫', () => {
    const systems = BUNDLED_SKILLS.find((s) => s.name === 'internal-systems')!.content
    expect(systems).toContain('개인 스킬')
    expect(systems).not.toMatch(/재무서비스개발팀/)
  })
})

describe('syncBundledSkills', () => {
  it('없으면 만든다', () => {
    syncBundledSkills(dir, BUNDLED_SKILLS)
    for (const s of BUNDLED_SKILLS) expect(readFileSync(skillPath(s.name), 'utf8')).toBe(s.content)
  })

  it('내용이 다르면 원문으로 덮어쓴다 — 앱 업데이트가 곧 스킬 업데이트', () => {
    mkdirSync(join(dir, '.claude', 'skills', 'dooray-reply'), { recursive: true })
    writeFileSync(skillPath('dooray-reply'), 'old', 'utf8')
    syncBundledSkills(dir, BUNDLED_SKILLS)
    expect(readFileSync(skillPath('dooray-reply'), 'utf8')).toBe(BUNDLED_SKILLS[0].content)
  })

  it('같으면 쓰지 않는다', () => {
    syncBundledSkills(dir, BUNDLED_SKILLS)
    const before = statSync(skillPath('dooray-reply')).mtimeMs
    syncBundledSkills(dir, BUNDLED_SKILLS)
    expect(statSync(skillPath('dooray-reply')).mtimeMs).toBe(before)
  })
})

describe('dooray-reply 스킬 — 좁은 메신저 폭 쓰는 법', () => {
  const content = BUNDLED_SKILLS.find((b) => b.name === 'dooray-reply')!.content

  it('"쓰는 법" 번호 항목이 9개이고 1부터 순서대로 이어진다', () => {
    const section = content.split('## 쓰는 법')[1].split(/\n## /)[0]
    const nums = [...section.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]))
    expect(nums).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('결론 먼저·한 줄 한 정보·"제목 + 설명" 목록 규칙을 담는다', () => {
    expect(content).toContain('첫 1~2줄에 결론')
    expect(content).toContain('한 줄에 정보 하나')
    expect(content).toContain('제목 한 줄 + 다음 줄 설명')
  })

  it('"## 짧게" 섹션이 3줄로 있고 "쓰는 법" 뒤, "쓰지 않는 것" 앞에 온다', () => {
    const idx = (h: string): number => content.indexOf(h)
    expect(idx('## 짧게')).toBeGreaterThan(idx('## 쓰는 법'))
    expect(idx('## 짧게')).toBeLessThan(idx('## 쓰지 않는 것'))
    const section = content.split('## 짧게')[1].split(/\n## /)[0]
    const bullets = section.split('\n').filter((l) => l.startsWith('- '))
    expect(bullets).toHaveLength(3)
  })

  it('짧게 섹션: 화면 한 장, 위험 동작은 Clauday 가 반응으로 받으니 다시 묻지 않기, 이미 답한 조건 재확인 금지', () => {
    const section = content.split('## 짧게')[1].split(/\n## /)[0]
    expect(section).toContain('화면 한 장')
    expect(section).toContain('반응 승인')
    expect(section).toContain('다시 확인하지 않는다')
  })
})

