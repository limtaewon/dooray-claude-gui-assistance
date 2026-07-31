import { readFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { McpServerConfig } from '../../shared/types/mcp'
import { normalizeStdioCommandForWindows } from './mcpNormalize'
import { writeJsonAtomic } from '../utils/atomicWrite'

/**
 * Claude Code 는 `~/.claude.json` 의 `mcpServers` 아래 정의된 모든 MCP 를 무조건 띄운다.
 * `disabled: true` 같은 필드는 Claude Code 가 무시하므로, 진짜 비활성화하려면 키 자체를
 * `mcpServers` 밖으로 빼야 한다.
 *
 * 전략: 비활성화된 MCP 는 별도 키 `_claudayDisabledMcp` 로 이동시켜 Claude Code 의 시야에서
 * 제외한다. 다시 활성화하면 `mcpServers` 로 되돌린다. UI 의 list() 는 둘을 병합해서 반환.
 */
const DISABLED_KEY = '_claudayDisabledMcp'

interface RawClaudeJson {
  mcpServers?: Record<string, McpServerConfig>
  [DISABLED_KEY]?: Record<string, McpServerConfig>
  [k: string]: unknown
}

export class McpConfigManager {
  private configPath: string

  constructor() {
    this.configPath = join(homedir(), '.claude.json')
  }

  private async ensureDir(): Promise<void> {
    const dir = homedir()
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
  }

  private async readRaw(): Promise<RawClaudeJson> {
    try {
      const raw = await readFile(this.configPath, 'utf-8')
      return JSON.parse(raw) as RawClaudeJson
    } catch {
      return { mcpServers: {} }
    }
  }

  /**
   * `~/.claude.json` 은 claude 본체와 공유하는 파일 — tmp→rename 의 원자적 쓰기로 반쪽 쓰기를 막는다.
   * claude 본체와의 동시 편집 경합(lost update)까지는 막지 못한다 — 스코프 밖 (ADR-v2-windows-fix-06 §3).
   */
  private async writeRaw(data: RawClaudeJson): Promise<void> {
    await this.ensureDir()
    await writeJsonAtomic(this.configPath, data)
  }

  /** UI 용 병합 목록 — enabled 는 그대로, disabled 는 disabled:true 마킹해서 반환. */
  async list(): Promise<Record<string, McpServerConfig>> {
    const raw = await this.readRaw()
    const out: Record<string, McpServerConfig> = {}
    for (const [name, cfg] of Object.entries(raw.mcpServers || {})) {
      out[name] = { ...cfg, disabled: false }
    }
    for (const [name, cfg] of Object.entries(raw[DISABLED_KEY] || {})) {
      // 충돌 시 mcpServers 가 우선 (실제 활성된 것이 우선)
      if (!out[name]) out[name] = { ...cfg, disabled: true }
    }
    return out
  }

  async add(name: string, config: McpServerConfig): Promise<void> {
    const raw = await this.readRaw()
    raw.mcpServers = raw.mcpServers || {}
    raw[DISABLED_KEY] = raw[DISABLED_KEY] || {}
    // win32 의 npx/uvx 계열·.cmd/.bat stdio 커맨드를 cmd /c 로 감싼다 (ADR-v2-windows-fix-06 §1).
    const normalized = normalizeStdioCommandForWindows(config)
    if (config.disabled) {
      raw[DISABLED_KEY][name] = stripDisabled(normalized)
      delete raw.mcpServers[name]
    } else {
      raw.mcpServers[name] = stripDisabled(normalized)
      delete raw[DISABLED_KEY][name]
    }
    await this.writeRaw(raw)
  }

  /**
   * 업데이트 — disabled 상태 변화에 따라 두 섹션 간 이동.
   * Claude Code 는 `mcpServers` 밖에 있는 키는 안 본다.
   */
  async update(name: string, config: McpServerConfig): Promise<void> {
    const raw = await this.readRaw()
    raw.mcpServers = raw.mcpServers || {}
    raw[DISABLED_KEY] = raw[DISABLED_KEY] || {}
    const existsInEnabled = !!raw.mcpServers[name]
    const existsInDisabled = !!raw[DISABLED_KEY][name]
    if (!existsInEnabled && !existsInDisabled) {
      throw new Error(`MCP server "${name}" not found`)
    }
    const normalized = normalizeStdioCommandForWindows(config)
    if (config.disabled) {
      raw[DISABLED_KEY][name] = stripDisabled(normalized)
      delete raw.mcpServers[name]
    } else {
      raw.mcpServers[name] = stripDisabled(normalized)
      delete raw[DISABLED_KEY][name]
    }
    await this.writeRaw(raw)
  }

  async delete(name: string): Promise<void> {
    const raw = await this.readRaw()
    if (raw.mcpServers) delete raw.mcpServers[name]
    if (raw[DISABLED_KEY]) delete raw[DISABLED_KEY][name]
    await this.writeRaw(raw)
  }
}

/** Claude Code 가 보는 mcpServers 안에는 disabled 필드가 들어가지 않게 깨끗이 정리. */
function stripDisabled(cfg: McpServerConfig): McpServerConfig {
  const { disabled: _disabled, ...rest } = cfg
  void _disabled
  return rest as McpServerConfig
}
