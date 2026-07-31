import { promises as fs } from 'fs'
import { join } from 'path'
import {
  DEFAULT_CLEANUP_PERIOD_DAYS,
  MAX_CLEANUP_PERIOD_DAYS,
  MIN_CLEANUP_PERIOD_DAYS,
  type ClaudeRetentionState
} from '../../shared/types/claude-retention'
import { claudeConfigDir } from '../utils/claudeProjects'

const SETTINGS_FILE = 'settings.json'
const CLEANUP_KEY = 'cleanupPeriodDays'

/**
 * 입력값을 설정에 넣을 수 있는 일수로 다듬는다. `null` 은 "키를 지우고 기본값을 따른다" 는 뜻.
 * 범위를 벗어나거나 정수가 아니면 예외 — 조용히 보정하면 사용자가 넣은 값과 다른 값이 저장된다.
 */
export function normalizeRetentionDays(input: number | null): number | null {
  if (input === null) return null
  if (!Number.isInteger(input)) {
    throw new Error('보관 기간은 정수(일)여야 합니다')
  }
  if (input < MIN_CLEANUP_PERIOD_DAYS || input > MAX_CLEANUP_PERIOD_DAYS) {
    throw new Error(
      `보관 기간은 ${MIN_CLEANUP_PERIOD_DAYS}~${MAX_CLEANUP_PERIOD_DAYS}일 사이여야 합니다`
    )
  }
  return input
}

/**
 * Claude Code 의 세션 보관 기간(`cleanupPeriodDays`) 을 `~/.claude/settings.json` 에서 읽고 쓴다.
 *
 * 이 파일은 hooks·permissions·model 등 사용자의 다른 설정이 함께 사는 곳이라 통째로 덮어쓰지
 * 않는다 — 파싱한 객체에서 이 키만 바꿔 다시 쓰고, 파싱에 실패하면 아무것도 쓰지 않는다.
 */
export class ClaudeRetentionService {
  private readonly settingsPath: string

  constructor(opts?: { configDir?: string }) {
    this.settingsPath = join(claudeConfigDir(opts), SETTINGS_FILE)
  }

  async get(): Promise<ClaudeRetentionState> {
    let raw: string
    try {
      raw = await fs.readFile(this.settingsPath, 'utf-8')
    } catch {
      // 파일이 아직 없는 것은 정상 — claude 가 기본값으로 돈다.
      return { days: DEFAULT_CLEANUP_PERIOD_DAYS, source: 'default', settingsPath: this.settingsPath }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[ClaudeRetention] settings.json 파싱 실패 (${this.settingsPath}):`, message)
      return {
        days: DEFAULT_CLEANUP_PERIOD_DAYS,
        source: 'unreadable',
        settingsPath: this.settingsPath,
        error: message
      }
    }

    const value = (parsed as Record<string, unknown> | null)?.[CLEANUP_KEY]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { days: value, source: 'settings', settingsPath: this.settingsPath }
    }
    return { days: DEFAULT_CLEANUP_PERIOD_DAYS, source: 'default', settingsPath: this.settingsPath }
  }

  /** `days` 가 null 이면 키를 지워 claude 기본값(30일)을 따르게 한다. */
  async set(days: number | null): Promise<ClaudeRetentionState> {
    const normalized = normalizeRetentionDays(days)

    let settings: Record<string, unknown> = {}
    let existed = false
    try {
      const raw = await fs.readFile(this.settingsPath, 'utf-8')
      existed = true
      const parsed: unknown = raw.trim() ? JSON.parse(raw) : {}
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('최상위가 객체가 아닙니다')
      }
      settings = parsed as Record<string, unknown>
    } catch (err) {
      // 파일이 없으면 새로 만든다. 있는데 못 읽으면 덮어쓰지 않는다 — 다른 설정이 통째로 날아간다.
      if (existed) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(
          `${this.settingsPath} 를 읽지 못해 저장을 멈췄습니다 (${message}). 파일을 고친 뒤 다시 시도하세요.`
        )
      }
    }

    if (normalized === null) delete settings[CLEANUP_KEY]
    else settings[CLEANUP_KEY] = normalized

    await this.writeAtomic(settings)
    return this.get()
  }

  /** 임시 파일에 쓰고 rename — 쓰다 만 settings.json 이 남으면 claude 가 아예 못 뜬다. */
  private async writeAtomic(settings: Record<string, unknown>): Promise<void> {
    const tmpPath = `${this.settingsPath}.clauday.tmp`
    const body = `${JSON.stringify(settings, null, 2)}\n`
    await fs.mkdir(join(this.settingsPath, '..'), { recursive: true })
    await fs.writeFile(tmpPath, body, 'utf-8')
    await fs.rename(tmpPath, this.settingsPath)
  }
}
