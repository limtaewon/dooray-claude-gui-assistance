import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
import { AgentWorkspaceManager, type ClaudeDirSetupDeps } from './AgentWorkspaceManager'
import { writeHookSettings, type TrustResult } from '../../claude/claudeDirSetup'

let root: string

// preApproveTrust 는 실제 ~/.claude.json 을 읽고 쓰므로 테스트에서는 항상 스텁으로 대체한다.
// writeHookSettings 는 홈을 건드리지 않으므로(tmp root 하위에만 기록) 실물을 그대로 주입해
// 기존 단언(파일 내용/멱등)을 유지한다.
const testDeps: ClaudeDirSetupDeps = {
  preApproveTrust: vi.fn((): TrustResult => 'no-config'),
  writeHookSettings
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ws-test-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('AgentWorkspaceManager.ensureChannel', () => {
  it('채널 디렉토리 + tasks/ + CLAUDE.md 생성', () => {
    const m = new AgentWorkspaceManager(root, testDeps)
    const ws = m.ensureChannel('123', '채널A')
    expect(existsSync(ws.channelDir)).toBe(true)
    expect(existsSync(ws.tasksDir)).toBe(true)
    expect(existsSync(ws.claudeMdPath)).toBe(true)
    const md = readFileSync(ws.claudeMdPath, 'utf8')
    expect(md).toContain('Channel Memory: 채널A')
    expect(md).toContain('Dooray channel id: 123')
  })

  it('이미 있으면 CLAUDE.md 덮어쓰지 않는다', () => {
    const m = new AgentWorkspaceManager(root, testDeps)
    const ws = m.ensureChannel('123')
    writeFileSync(ws.claudeMdPath, '## 메모\n- 기억해둔 내용', 'utf8')
    m.ensureChannel('123')
    expect(readFileSync(ws.claudeMdPath, 'utf8')).toContain('기억해둔 내용')
  })

  it('channelId 의 OS 금지문자(슬래시 등)를 sanitize 한다', () => {
    const m = new AgentWorkspaceManager(root, testDeps)
    const ws = m.ensureChannel('abc/xyz')
    // 슬래시는 _ 로 치환 — 경로 traversal 방지
    expect(ws.channelDir).not.toContain('abc/xyz')
    expect(ws.channelDir.endsWith('abc_xyz')).toBe(true)
  })

  it('getAgentRoot 는 root/agent', () => {
    const m = new AgentWorkspaceManager(root)
    expect(m.getAgentRoot()).toBe(join(root, 'agent'))
  })

  it('setRoot 로 root 변경', () => {
    const m = new AgentWorkspaceManager(root)
    m.setRoot('/tmp/other')
    expect(m.getRoot()).toBe('/tmp/other')
  })

  it('setRoot("") 은 DEFAULT_ROOT 로 폴백 (homedir 기반)', () => {
    const m = new AgentWorkspaceManager(root)
    m.setRoot('')
    expect(m.getRoot()).toBe(join(homedir(), 'Clauday-Workspaces'))
  })
})

describe('AgentWorkspaceManager.writeTaskPrompt', () => {
  it('tasks/{logId}.md 저장 후 상대경로 반환', () => {
    const m = new AgentWorkspaceManager(root, testDeps)
    const rel = m.writeTaskPrompt('ch1', 'log-42', '# 프롬프트\n본문')
    expect(rel).toBe(join('tasks', 'log-42.md'))
    const fullPath = join(root, 'agent', 'ch1', 'tasks', 'log-42.md')
    expect(existsSync(fullPath)).toBe(true)
    expect(readFileSync(fullPath, 'utf8')).toBe('# 프롬프트\n본문')
  })
})

describe('AgentWorkspaceManager.setHookConfig', () => {
  it('hookConfig 설정 후 ensureChannel 시 .claude/settings.local.json 작성', () => {
    const m = new AgentWorkspaceManager(root, testDeps)
    m.setHookConfig({ port: 5678, secret: 'sec' })
    const ws = m.ensureChannel('ch1')
    const settingsPath = join(ws.channelDir, '.claude', 'settings.local.json')
    expect(existsSync(settingsPath)).toBe(true)
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf8'))
    expect(parsed.hooks.PostToolUse[0].hooks[0].url).toContain('127.0.0.1:5678')
    expect(parsed.hooks.PostToolUse[0].hooks[0].headers['X-Clauday-Secret']).toBe('sec')
    expect(parsed.hooks.Stop[0].hooks[0].url).toContain('event=stop')
  })

  it('동일 settings 라면 다시 쓰지 않는다 (멱등)', () => {
    const m = new AgentWorkspaceManager(root, testDeps)
    m.setHookConfig({ port: 1234, secret: 's' })
    m.ensureChannel('ch1')
    const path = join(root, 'agent', 'ch1', '.claude', 'settings.local.json')
    const before = readFileSync(path, 'utf8')
    m.ensureChannel('ch1')
    const after = readFileSync(path, 'utf8')
    expect(after).toBe(before)
  })

  it('hookConfig 없으면 settings 안 만든다', () => {
    const m = new AgentWorkspaceManager(root, testDeps)
    const ws = m.ensureChannel('ch1')
    expect(existsSync(join(ws.channelDir, '.claude', 'settings.local.json'))).toBe(false)
  })

  it('null 로 hookConfig 해제 가능', () => {
    const m = new AgentWorkspaceManager(root, testDeps)
    m.setHookConfig({ port: 1, secret: 's' })
    m.setHookConfig(null)
    const ws = m.ensureChannel('ch1')
    expect(existsSync(join(ws.channelDir, '.claude', 'settings.local.json'))).toBe(false)
  })
})

describe('AgentWorkspaceManager.ensureChannel — hook 설정 호출', () => {
  it('writeHookSettings 를 { trackPrompts: true } 로만 부른다 (승인 정책·permissions 옵션 없음)', () => {
    const writeHook = vi.fn(() => false)
    const m = new AgentWorkspaceManager(root, { preApproveTrust: vi.fn((): TrustResult => 'no-config'), writeHookSettings: writeHook })
    m.setHookConfig({ port: 1111, secret: 'sec' })
    const ws = m.ensureChannel('ch1')
    expect(writeHook).toHaveBeenCalledWith(ws.channelDir, { port: 1111, secret: 'sec' }, { trackPrompts: true })
  })

  it('hookConfig 가 없으면 null 로 넘긴다', () => {
    const writeHook = vi.fn(() => false)
    const m = new AgentWorkspaceManager(root, { preApproveTrust: vi.fn((): TrustResult => 'no-config'), writeHookSettings: writeHook })
    const ws = m.ensureChannel('ch1')
    expect(writeHook).toHaveBeenCalledWith(ws.channelDir, null, { trackPrompts: true })
  })

  it('setApprovalMode 는 더 이상 없다', () => {
    expect((new AgentWorkspaceManager(root, testDeps) as unknown as Record<string, unknown>).setApprovalMode).toBeUndefined()
  })

  it('실제 settings 파일에 UserPromptSubmit hook 이 들어간다', () => {
    const m = new AgentWorkspaceManager(root, testDeps)
    m.setHookConfig({ port: 2222, secret: 's' })
    const ws = m.ensureChannel('ch1')
    const parsed = JSON.parse(readFileSync(join(ws.channelDir, '.claude', 'settings.local.json'), 'utf8'))
    expect(parsed.hooks.UserPromptSubmit[0].hooks[0].url).toContain('event=user_prompt_submit')
  })

  it('writeTaskPrompt 도 ensureChannel 을 거쳐 hook 설정이 갱신된다', () => {
    const writeHook = vi.fn(() => false)
    const m = new AgentWorkspaceManager(root, { preApproveTrust: vi.fn((): TrustResult => 'no-config'), writeHookSettings: writeHook })
    m.writeTaskPrompt('ch1', 'log1', 'x')
    expect(writeHook).toHaveBeenCalledTimes(1)
  })
})

describe('AgentWorkspaceManager.saveAttachment', () => {
  it('attachments/{fileId}-{파일명} 에 저장하고 채널 폴더 기준 상대경로를 반환', () => {
    const m = new AgentWorkspaceManager(root, testDeps)
    const rel = m.saveAttachment('ch1', 'f123', 'err.png', Buffer.from('PNG'))
    expect(rel).toBe(join('attachments', 'f123-err.png'))
    expect(readFileSync(join(root, 'agent', 'ch1', rel)).toString()).toBe('PNG')
  })

  it('한글 파일명은 살린다', () => {
    const m = new AgentWorkspaceManager(root, testDeps)
    const rel = m.saveAttachment('ch1', 'f1', '장애 화면.png', Buffer.from('x'))
    expect(rel).toBe(join('attachments', 'f1-장애 화면.png'))
    expect(existsSync(join(root, 'agent', 'ch1', rel))).toBe(true)
  })

  it('경로 구분자·OS 금지문자·제어문자를 _ 로 바꿔 경로 이탈을 막는다', () => {
    const m = new AgentWorkspaceManager(root, testDeps)
    const rel = m.saveAttachment('ch1', 'f1', '../../etc/pa:ss*wd?"<>|\x01\x1f.png', Buffer.from('x'))
    expect(rel).not.toMatch(/\.\.[/\\]/)
    expect(rel.split(/[/\\]/)).toHaveLength(2)
    expect(rel).not.toMatch(/[:*?"<>|\x00-\x1f]/)
    expect(existsSync(join(root, 'agent', 'ch1', rel))).toBe(true)
    expect(existsSync(join(root, 'etc'))).toBe(false)
  })

  it('백슬래시 구분자도 치환', () => {
    const m = new AgentWorkspaceManager(root, testDeps)
    const rel = m.saveAttachment('ch1', 'f1', 'a\\b\\c.txt', Buffer.from('x'))
    expect(rel).toBe(join('attachments', 'f1-a_b_c.txt'))
  })

  it('선행 점은 _ 로 (숨김 파일/.. 방지), 빈 이름은 file', () => {
    const m = new AgentWorkspaceManager(root, testDeps)
    expect(m.saveAttachment('ch1', 'f1', '.bashrc', Buffer.from('x'))).toBe(join('attachments', 'f1-_bashrc'))
    expect(m.saveAttachment('ch1', 'f2', '   ', Buffer.from('x'))).toBe(join('attachments', 'f2-file'))
  })

  it('파일명은 120자로 제한', () => {
    const m = new AgentWorkspaceManager(root, testDeps)
    const rel = m.saveAttachment('ch1', 'f1', 'a'.repeat(300) + '.png', Buffer.from('x'))
    expect(rel.length).toBeLessThanOrEqual('attachments/'.length + 'f1-'.length + 120)
  })

  it('fileId·channelId 의 금지문자도 정리', () => {
    const m = new AgentWorkspaceManager(root, testDeps)
    const rel = m.saveAttachment('ch/1', '../f', 'a.png', Buffer.from('x'))
    expect(rel).toBe(join('attachments', '.._f-a.png'))
    expect(existsSync(join(root, 'agent', 'ch_1', rel))).toBe(true)
  })

  it('같은 fileId+이름이면 덮어쓴다', () => {
    const m = new AgentWorkspaceManager(root, testDeps)
    m.saveAttachment('ch1', 'f1', 'a.png', Buffer.from('old'))
    const rel = m.saveAttachment('ch1', 'f1', 'a.png', Buffer.from('new'))
    expect(readFileSync(join(root, 'agent', 'ch1', rel)).toString()).toBe('new')
  })
})
