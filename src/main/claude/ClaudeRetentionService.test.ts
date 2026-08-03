import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ClaudeRetentionService, normalizeRetentionDays } from './ClaudeRetentionService'

let configDir: string

function service(): ClaudeRetentionService {
  return new ClaudeRetentionService({ configDir })
}

function settingsPath(): string {
  return join(configDir, 'settings.json')
}

async function writeSettings(body: string): Promise<void> {
  await fs.writeFile(settingsPath(), body, 'utf-8')
}

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'clauday-retention-'))
})

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true })
})

describe('normalizeRetentionDays', () => {
  it('null 은 "기본값을 따른다" 는 뜻으로 그대로 통과한다', () => {
    expect(normalizeRetentionDays(null)).toBeNull()
  })

  it('정수가 아니면 거절한다', () => {
    expect(() => normalizeRetentionDays(30.5)).toThrow(/정수/)
  })

  it('0 일과 범위를 넘는 값은 거절한다 — 0 은 즉시 삭제다', () => {
    expect(() => normalizeRetentionDays(0)).toThrow(/사이/)
    expect(() => normalizeRetentionDays(3651)).toThrow(/사이/)
  })

  it('경계값은 통과한다', () => {
    expect(normalizeRetentionDays(1)).toBe(1)
    expect(normalizeRetentionDays(3650)).toBe(3650)
  })
})

describe('ClaudeRetentionService.get', () => {
  it('설정 파일이 없으면 claude 기본값 30일', async () => {
    const state = await service().get()
    expect(state).toMatchObject({ days: 30, source: 'default' })
  })

  it('값이 있으면 그 값과 출처를 알린다', async () => {
    await writeSettings(JSON.stringify({ cleanupPeriodDays: 180, model: 'opus' }))
    expect(await service().get()).toMatchObject({ days: 180, source: 'settings' })
  })

  it('키가 없으면 기본값으로 떨어진다', async () => {
    await writeSettings(JSON.stringify({ model: 'opus' }))
    expect(await service().get()).toMatchObject({ days: 30, source: 'default' })
  })

  it('깨진 JSON 은 unreadable 로 알린다 — 이 상태로 저장하면 남의 설정이 날아간다', async () => {
    await writeSettings('{ "model": "opus", ')
    const state = await service().get()
    expect(state.source).toBe('unreadable')
    expect(state.error).toBeTruthy()
  })
})

describe('ClaudeRetentionService.set', () => {
  it('다른 설정을 건드리지 않고 이 키만 바꾼다', async () => {
    const original = {
      env: { ENABLE_TOOL_SEARCH: 'true' },
      permissions: { deny: ['Read(.env)'] },
      model: 'opus',
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] }
    }
    await writeSettings(JSON.stringify(original, null, 2))

    const state = await service().set(365)

    expect(state).toMatchObject({ days: 365, source: 'settings' })
    const after = JSON.parse(await fs.readFile(settingsPath(), 'utf-8'))
    expect(after).toEqual({ ...original, cleanupPeriodDays: 365 })
  })

  it('설정 파일이 없으면 새로 만든다', async () => {
    await service().set(90)

    const after = JSON.parse(await fs.readFile(settingsPath(), 'utf-8'))
    expect(after).toEqual({ cleanupPeriodDays: 90 })
  })

  it('null 을 주면 키를 지워 기본값으로 되돌린다', async () => {
    await writeSettings(JSON.stringify({ cleanupPeriodDays: 365, model: 'opus' }))

    const state = await service().set(null)

    expect(state).toMatchObject({ days: 30, source: 'default' })
    const after = JSON.parse(await fs.readFile(settingsPath(), 'utf-8'))
    expect(after).toEqual({ model: 'opus' })
  })

  it('읽을 수 없는 설정 파일은 손대지 않는다', async () => {
    const broken = '{ "model": "opus", '
    await writeSettings(broken)

    await expect(service().set(90)).rejects.toThrow(/읽지 못해/)
    expect(await fs.readFile(settingsPath(), 'utf-8')).toBe(broken)
  })

  it('범위를 벗어난 값은 저장 전에 막는다', async () => {
    await writeSettings(JSON.stringify({ model: 'opus' }))

    await expect(service().set(0)).rejects.toThrow(/사이/)
    expect(JSON.parse(await fs.readFile(settingsPath(), 'utf-8'))).toEqual({ model: 'opus' })
  })

  it('임시 파일을 남기지 않는다', async () => {
    await service().set(60)
    const files = await fs.readdir(configDir)
    expect(files).toEqual(['settings.json'])
  })
})
