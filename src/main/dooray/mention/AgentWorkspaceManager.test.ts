import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
import { AgentWorkspaceManager } from './AgentWorkspaceManager'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ws-test-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('AgentWorkspaceManager.ensureChannel', () => {
  it('채널 디렉토리 + tasks/ + CLAUDE.md 생성', () => {
    const m = new AgentWorkspaceManager(root)
    const ws = m.ensureChannel('123', '채널A')
    expect(existsSync(ws.channelDir)).toBe(true)
    expect(existsSync(ws.tasksDir)).toBe(true)
    expect(existsSync(ws.claudeMdPath)).toBe(true)
    const md = readFileSync(ws.claudeMdPath, 'utf8')
    expect(md).toContain('Channel Memory: 채널A')
    expect(md).toContain('Dooray channel id: 123')
  })

  it('이미 있으면 CLAUDE.md 덮어쓰지 않는다', () => {
    const m = new AgentWorkspaceManager(root)
    const ws = m.ensureChannel('123')
    writeFileSync(ws.claudeMdPath, '## 메모\n- 기억해둔 내용', 'utf8')
    m.ensureChannel('123')
    expect(readFileSync(ws.claudeMdPath, 'utf8')).toContain('기억해둔 내용')
  })

  it('channelId 의 OS 금지문자(슬래시 등)를 sanitize 한다', () => {
    const m = new AgentWorkspaceManager(root)
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
    const m = new AgentWorkspaceManager(root)
    const rel = m.writeTaskPrompt('ch1', 'log-42', '# 프롬프트\n본문')
    expect(rel).toBe(join('tasks', 'log-42.md'))
    const fullPath = join(root, 'agent', 'ch1', 'tasks', 'log-42.md')
    expect(existsSync(fullPath)).toBe(true)
    expect(readFileSync(fullPath, 'utf8')).toBe('# 프롬프트\n본문')
  })
})

describe('AgentWorkspaceManager.setHookConfig', () => {
  it('hookConfig 설정 후 ensureChannel 시 .claude/settings.local.json 작성', () => {
    const m = new AgentWorkspaceManager(root)
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
    const m = new AgentWorkspaceManager(root)
    m.setHookConfig({ port: 1234, secret: 's' })
    m.ensureChannel('ch1')
    const path = join(root, 'agent', 'ch1', '.claude', 'settings.local.json')
    const before = readFileSync(path, 'utf8')
    m.ensureChannel('ch1')
    const after = readFileSync(path, 'utf8')
    expect(after).toBe(before)
  })

  it('hookConfig 없으면 settings 안 만든다', () => {
    const m = new AgentWorkspaceManager(root)
    const ws = m.ensureChannel('ch1')
    expect(existsSync(join(ws.channelDir, '.claude', 'settings.local.json'))).toBe(false)
  })

  it('null 로 hookConfig 해제 가능', () => {
    const m = new AgentWorkspaceManager(root)
    m.setHookConfig({ port: 1, secret: 's' })
    m.setHookConfig(null)
    const ws = m.ensureChannel('ch1')
    expect(existsSync(join(ws.channelDir, '.claude', 'settings.local.json'))).toBe(false)
  })
})
