import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs'
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

describe('writeHookSettings — trackPrompts', () => {
  const read = (): { hooks: Record<string, Array<{ hooks: Array<{ url: string; headers: Record<string, string> }> }>> } =>
    JSON.parse(readFileSync(join(dir, '.claude', 'settings.local.json'), 'utf8'))

  it('trackPrompts 없으면 UserPromptSubmit hook 이 없다', () => {
    writeHookSettings(dir, { port: 5678, secret: 'sec' })
    expect(read().hooks.UserPromptSubmit).toBeUndefined()
    expect(Object.keys(read().hooks).sort()).toEqual(['PostToolUse', 'Stop'])
  })

  it('trackPrompts:false 도 미포함', () => {
    writeHookSettings(dir, { port: 5678, secret: 'sec' }, { trackPrompts: false })
    expect(read().hooks.UserPromptSubmit).toBeUndefined()
  })

  it('trackPrompts:true 면 UserPromptSubmit hook 이 loopback URL·시크릿 헤더와 함께 포함', () => {
    writeHookSettings(dir, { port: 5678, secret: 'sec' }, { trackPrompts: true })
    const h = read().hooks
    expect(h.UserPromptSubmit).toHaveLength(1)
    expect(h.UserPromptSubmit[0].hooks[0].url).toBe('http://127.0.0.1:5678/clauday-hook?event=user_prompt_submit')
    expect(h.UserPromptSubmit[0].hooks[0].headers['X-Clauday-Secret']).toBe('sec')
    // 기존 hook 은 그대로
    expect(h.Stop[0].hooks[0].url).toContain('?event=stop')
    expect(h.PostToolUse).toBeDefined()
  })

  it('옵션이 바뀌면 재기록(true) 하고, 같은 옵션 재호출은 멱등(false)', () => {
    expect(writeHookSettings(dir, { port: 1, secret: 's' })).toBe(true)
    expect(writeHookSettings(dir, { port: 1, secret: 's' }, { trackPrompts: true })).toBe(true)
    expect(writeHookSettings(dir, { port: 1, secret: 's' }, { trackPrompts: true })).toBe(false)
    expect(writeHookSettings(dir, { port: 1, secret: 's' })).toBe(true)
    expect(read().hooks.UserPromptSubmit).toBeUndefined()
  })

  it('hookConfig 가 null 이면 trackPrompts 여도 아무것도 쓰지 않는다', () => {
    expect(writeHookSettings(dir, null, { trackPrompts: true })).toBe(false)
    expect(existsSync(join(dir, '.claude'))).toBe(false)
  })
})

// ───────────────────────── PreToolUse / PermissionRequest / permissions ─────────────────────────

describe('writeHookSettings — trackPrompts 의 PreToolUse', () => {
  type Settings = {
    hooks: Record<string, Array<{ hooks: Array<{ url: string; timeout?: number; headers: Record<string, string> }> }>>
    permissions?: { allow?: string[]; deny?: string[]; ask?: string[]; [k: string]: unknown }
    [k: string]: unknown
  }
  const settingsPath = (): string => join(dir, '.claude', 'settings.local.json')
  const read = (): Settings => JSON.parse(readFileSync(settingsPath(), 'utf8'))
  const cfg = { port: 4321, secret: 'sec' }

  it('trackPrompts 면 PreToolUse 가 pre_tool_use 이벤트로 라우팅된다', () => {
    writeHookSettings(dir, cfg, { trackPrompts: true })
    const h = read().hooks
    expect(h.PreToolUse[0].hooks[0].url).toBe('http://127.0.0.1:4321/clauday-hook?event=pre_tool_use')
    expect(h.PreToolUse[0].hooks[0].headers['X-Clauday-Secret']).toBe('sec')
    // DangerGate 가 두레이 답장을 기다리는 동안 hook 이 먼저 끊기지 않게
    expect(h.PreToolUse[0].hooks[0].timeout).toBe(600)
    expect(h.UserPromptSubmit[0].hooks[0].url).toContain('event=user_prompt_submit')
  })

  it('trackPrompts 가 없으면 PreToolUse 도 없다', () => {
    writeHookSettings(dir, cfg)
    expect(read().hooks.PreToolUse).toBeUndefined()
    expect(read().hooks.PermissionRequest).toBeUndefined()
  })
})

describe('writeHookSettings — permissions 정리 (D11: 권한 확인 없이 실행, 위험 동작만 PreToolUse 로)', () => {
  type Settings = {
    hooks: Record<string, Array<{ hooks: Array<{ url: string; timeout?: number }> }>>
    permissions?: { allow?: string[]; deny?: string[]; ask?: string[]; [k: string]: unknown }
    [k: string]: unknown
  }
  const settingsPath = (): string => join(dir, '.claude', 'settings.local.json')
  const read = (): Settings => JSON.parse(readFileSync(settingsPath(), 'utf8'))
  const cfg = { port: 4321, secret: 'sec' }
  const opts = { trackPrompts: true }
  const seed = (json: unknown): void => {
    mkdirSync(join(dir, '.claude'), { recursive: true })
    writeFileSync(settingsPath(), typeof json === 'string' ? json : JSON.stringify(json), 'utf8')
  }

  it('PermissionRequest hook 은 쓰지 않는다', () => {
    writeHookSettings(dir, cfg, opts)
    expect(read().hooks.PermissionRequest).toBeUndefined()
  })

  it('permissions 가 없던 파일에는 permissions 를 만들지 않는다', () => {
    writeHookSettings(dir, cfg, opts)
    expect(read().permissions).toBeUndefined()
  })

  it('예전 빌드가 넣은 ask 는 제거하고 allow·deny 는 그대로 둔다', () => {
    seed({ permissions: { allow: ['Bash(git push origin main)', 'Read'], deny: ['Bash(rm -rf /)'], ask: ['Bash(git push *)'] } })
    writeHookSettings(dir, cfg, opts)
    const p = read().permissions!
    expect(p.ask).toBeUndefined()
    expect(p.allow).toEqual(['Bash(git push origin main)', 'Read'])
    expect(p.deny).toEqual(['Bash(rm -rf /)'])
  })

  it('ask 만 있던 permissions 는 키 자체가 사라진다', () => {
    seed({ permissions: { ask: ['Old(rule)'] } })
    writeHookSettings(dir, cfg, opts)
    expect(read().permissions).toBeUndefined()
  })

  it('permissions 의 다른 키(defaultMode 등)와 최상위 다른 키는 보존', () => {
    seed({ model: 'opus', env: { A: '1' }, permissions: { defaultMode: 'acceptEdits', additionalDirectories: ['/x'], ask: ['X'] } })
    writeHookSettings(dir, cfg, opts)
    const s = read()
    expect(s.model).toBe('opus')
    expect(s.env).toEqual({ A: '1' })
    expect(s.permissions).toEqual({ defaultMode: 'acceptEdits', additionalDirectories: ['/x'] })
  })

  it('예전 PermissionRequest hook 이 남아 있던 파일도 hooks 를 새로 써서 제거', () => {
    seed({ hooks: { PermissionRequest: [{ hooks: [{ type: 'http', url: 'http://127.0.0.1:1/old' }] }] } })
    writeHookSettings(dir, cfg, opts)
    expect(read().hooks.PermissionRequest).toBeUndefined()
    expect(JSON.stringify(read().hooks)).not.toContain('127.0.0.1:1/old')
  })

  it('permissions 가 객체가 아니면 (문자열 등) 버린다', () => {
    seed({ permissions: 'oops' })
    expect(() => writeHookSettings(dir, cfg, opts)).not.toThrow()
    expect(read().permissions).toBeUndefined()
  })

  it('기존 파일이 깨진 JSON 이면 경고하고 새로 쓴다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    seed('{ not json')
    expect(writeHookSettings(dir, cfg, opts)).toBe(true)
    expect(read().hooks.PreToolUse).toBeDefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('JSON 이지만 객체가 아니면 (배열 등)도 새로 쓴다', () => {
    seed('[]')
    expect(() => writeHookSettings(dir, cfg, opts)).not.toThrow()
    expect(read().hooks.Stop).toBeDefined()
  })

  it('변경이 없으면 false, 파일을 다시 쓰지 않는다 (ask 정리 후에도 멱등)', () => {
    seed({ permissions: { ask: ['Old'], allow: ['Read'] } })
    expect(writeHookSettings(dir, cfg, opts)).toBe(true)
    const before = readFileSync(settingsPath(), 'utf8')
    expect(writeHookSettings(dir, cfg, opts)).toBe(false)
    expect(readFileSync(settingsPath(), 'utf8')).toBe(before)
  })

  it('trackPrompts 를 끄면 PreToolUse·UserPromptSubmit 이 빠지고 true', () => {
    writeHookSettings(dir, cfg, opts)
    expect(writeHookSettings(dir, cfg)).toBe(true)
    expect(read().hooks.PreToolUse).toBeUndefined()
    expect(read().hooks.UserPromptSubmit).toBeUndefined()
  })
})
