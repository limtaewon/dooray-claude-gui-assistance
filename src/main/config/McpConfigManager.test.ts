import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { McpConfigManager } from './McpConfigManager'

let tmpHome: string

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'mcp-home-'))
})
afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true })
})

/** configPath 를 임시 경로로 패치한 매니저 인스턴스 */
function makeManager(): McpConfigManager {
  const m = new McpConfigManager()
  ;(m as unknown as { configPath: string }).configPath = join(tmpHome, '.claude.json')
  return m
}

function readConfig(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(tmpHome, '.claude.json'), 'utf8'))
}

describe('McpConfigManager.list', () => {
  it('파일 없으면 빈 객체', async () => {
    expect(await makeManager().list()).toEqual({})
  })

  it('mcpServers 와 _claudayDisabledMcp 병합 + disabled 마킹', async () => {
    writeFileSync(join(tmpHome, '.claude.json'), JSON.stringify({
      mcpServers: { active: { command: 'a' } },
      _claudayDisabledMcp: { off: { command: 'b' } }
    }))
    const all = await makeManager().list()
    expect(all.active.disabled).toBe(false)
    expect(all.off.disabled).toBe(true)
  })

  it('JSON 손상 파일은 빈 객체 폴백', async () => {
    writeFileSync(join(tmpHome, '.claude.json'), 'not-json')
    expect(await makeManager().list()).toEqual({})
  })

  it('mcpServers 와 disabled 둘 다에 있으면 mcpServers 가 우선 (활성 우선)', async () => {
    writeFileSync(join(tmpHome, '.claude.json'), JSON.stringify({
      mcpServers: { dup: { command: 'active' } },
      _claudayDisabledMcp: { dup: { command: 'inactive' } }
    }))
    const all = await makeManager().list()
    expect(all.dup.disabled).toBe(false)
  })
})

describe('McpConfigManager.add', () => {
  it('disabled=false 면 mcpServers 에 저장', async () => {
    await makeManager().add('foo', { command: 'cmd', args: [] } as never)
    expect(readConfig().mcpServers).toEqual({ foo: { command: 'cmd', args: [] } })
  })

  it('disabled=true 면 _claudayDisabledMcp 에 저장 + disabled 필드 제거', async () => {
    await makeManager().add('bar', { command: 'cmd', disabled: true } as never)
    const cfg = readConfig() as Record<string, Record<string, unknown>>
    expect((cfg._claudayDisabledMcp as Record<string, unknown>).bar).toEqual({ command: 'cmd' })
    expect(cfg.mcpServers).toEqual({})
  })

  it('재추가 시 양쪽에서 중복 제거', async () => {
    const m = makeManager()
    await m.add('foo', { command: 'a' } as never)
    await m.add('foo', { command: 'b', disabled: true } as never)
    const cfg = readConfig() as Record<string, Record<string, Record<string, unknown>>>
    expect(cfg.mcpServers).toEqual({})
    expect(cfg._claudayDisabledMcp.foo).toBeTruthy()
  })
})

describe('McpConfigManager.update', () => {
  it('존재하지 않으면 throw', async () => {
    writeFileSync(join(tmpHome, '.claude.json'), JSON.stringify({ mcpServers: {} }))
    await expect(makeManager().update('nope', { command: 'x' } as never)).rejects.toThrow(/not found/)
  })

  it('enable → disable 전환', async () => {
    writeFileSync(join(tmpHome, '.claude.json'), JSON.stringify({
      mcpServers: { foo: { command: 'a' } }
    }))
    await makeManager().update('foo', { command: 'a', disabled: true } as never)
    const cfg = readConfig() as Record<string, Record<string, unknown>>
    expect(cfg.mcpServers).toEqual({})
    expect(cfg._claudayDisabledMcp).toHaveProperty('foo')
  })

  it('disable → enable 전환', async () => {
    writeFileSync(join(tmpHome, '.claude.json'), JSON.stringify({
      _claudayDisabledMcp: { foo: { command: 'a' } }
    }))
    await makeManager().update('foo', { command: 'a' } as never)
    const cfg = readConfig() as Record<string, Record<string, unknown>>
    expect(cfg.mcpServers).toHaveProperty('foo')
    expect(cfg._claudayDisabledMcp).toEqual({})
  })
})

describe('McpConfigManager.delete', () => {
  it('양쪽에서 모두 삭제', async () => {
    writeFileSync(join(tmpHome, '.claude.json'), JSON.stringify({
      mcpServers: { foo: { command: 'a' } },
      _claudayDisabledMcp: { foo: { command: 'b' } }
    }))
    await makeManager().delete('foo')
    const cfg = readConfig()
    expect((cfg.mcpServers as Record<string, unknown>).foo).toBeUndefined()
    expect((cfg._claudayDisabledMcp as Record<string, unknown>).foo).toBeUndefined()
  })

  it('없는 키 삭제는 no-op (파일 생성)', async () => {
    await expect(makeManager().delete('missing')).resolves.toBeUndefined()
    expect(existsSync(join(tmpHome, '.claude.json'))).toBe(true)
  })
})
