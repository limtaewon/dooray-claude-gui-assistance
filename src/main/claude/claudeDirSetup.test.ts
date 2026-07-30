import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeHookSettings, preApproveTrust } from './claudeDirSetup'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'claude-dir-setup-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('writeHookSettings', () => {
  it('hookConfig 없으면 .claude 디렉터리조차 만들지 않는다', () => {
    const result = writeHookSettings(dir, null)
    expect(result).toBe(false)
    expect(existsSync(join(dir, '.claude'))).toBe(false)
  })

  it('정상 기록 시 URL/시크릿 헤더/matcher 문자열이 예상대로 채워진다', () => {
    const result = writeHookSettings(dir, { port: 5678, secret: 'sec' })
    expect(result).toBe(true)
    const settingsPath = join(dir, '.claude', 'settings.local.json')
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf8'))
    expect(parsed.hooks.PostToolUse[0].matcher).toBe(
      'Edit|Write|Bash|Read|Glob|Grep|TodoWrite|WebFetch|WebSearch'
    )
    expect(parsed.hooks.PostToolUse[0].hooks[0].url).toContain('127.0.0.1:5678')
    expect(parsed.hooks.PostToolUse[0].hooks[0].url).toContain('?event=post_tool_use')
    expect(parsed.hooks.Stop[0].hooks[0].url).toContain('?event=stop')
    expect(parsed.hooks.PostToolUse[0].hooks[0].headers['X-Clauday-Secret']).toBe('sec')
    expect(parsed.hooks.Stop[0].hooks[0].headers['X-Clauday-Secret']).toBe('sec')
  })

  it('동일 내용 재호출 시 재기록하지 않는다 (멱등)', () => {
    writeHookSettings(dir, { port: 1234, secret: 's' })
    const settingsPath = join(dir, '.claude', 'settings.local.json')
    const before = readFileSync(settingsPath, 'utf8')
    const result = writeHookSettings(dir, { port: 1234, secret: 's' })
    expect(result).toBe(false)
    expect(readFileSync(settingsPath, 'utf8')).toBe(before)
  })

  it('port/secret 이 바뀌면 재기록한다', () => {
    writeHookSettings(dir, { port: 1234, secret: 's' })
    const result = writeHookSettings(dir, { port: 5555, secret: 's2' })
    expect(result).toBe(true)
    const settingsPath = join(dir, '.claude', 'settings.local.json')
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf8'))
    expect(parsed.hooks.PostToolUse[0].hooks[0].url).toContain('127.0.0.1:5555')
  })
})

describe('preApproveTrust', () => {
  it('configPath 파일이 없으면 no-config', () => {
    const configPath = join(dir, 'missing.json')
    const result = preApproveTrust(dir, { configPath })
    expect(result).toBe('no-config')
  })

  it('이미 hasTrustDialogAccepted:true 면 already-trusted (파일 불변)', () => {
    const configPath = join(dir, 'config.json')
    const before = JSON.stringify({ projects: { [dir]: { hasTrustDialogAccepted: true } } }, null, 2)
    writeFileSync(configPath, before, 'utf8')
    const result = preApproveTrust(dir, { configPath })
    expect(result).toBe('already-trusted')
    expect(readFileSync(configPath, 'utf8')).toBe(before)
  })

  it('false → true 로 기록 후 written', () => {
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ projects: {} }), 'utf8')
    const result = preApproveTrust(dir, { configPath })
    expect(result).toBe('written')
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'))
    expect(parsed.projects[dir].hasTrustDialogAccepted).toBe(true)
  })

  it('깨진 JSON 이면 failed + console.warn 호출', () => {
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, '{ not valid json', 'utf8')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = preApproveTrust(dir, { configPath })
    expect(result).toBe('failed')
    expect(warnSpy).toHaveBeenCalledWith('[AgentWorkspace] trust 사전 등록 실패 (무시):', expect.any(Error))
    warnSpy.mockRestore()
  })

  it('configPath 생략 시 기본값(CLAUDE_USER_CONFIG)을 쓰지만, 여기서는 항상 명시 주입해 실제 홈을 건드리지 않는다', () => {
    // 모든 테스트가 mkdtempSync 기반 tmp 경로만 사용 — 실제 ~/.claude.json 접근 금지
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ projects: {} }), 'utf8')
    const result = preApproveTrust(dir, { configPath })
    expect(result).toBe('written')
  })
})
