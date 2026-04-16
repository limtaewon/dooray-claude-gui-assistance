import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { McpSettings, McpServerConfig } from '../../shared/types/mcp'

export class McpConfigManager {
  private configPath: string

  constructor() {
    // Claude Code stores MCP servers in ~/.claude.json (not ~/.claude/settings.json)
    this.configPath = join(homedir(), '.claude.json')
  }

  private async ensureDir(): Promise<void> {
    const dir = homedir()
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }
  }

  private async readSettings(): Promise<McpSettings> {
    try {
      const raw = await readFile(this.configPath, 'utf-8')
      const parsed = JSON.parse(raw)
      return {
        mcpServers: parsed.mcpServers || {},
        ...parsed
      }
    } catch {
      return { mcpServers: {} }
    }
  }

  private async writeSettings(settings: McpSettings): Promise<void> {
    await this.ensureDir()
    await writeFile(this.configPath, JSON.stringify(settings, null, 2), 'utf-8')
  }

  async list(): Promise<Record<string, McpServerConfig>> {
    const settings = await this.readSettings()
    return settings.mcpServers
  }

  async add(name: string, config: McpServerConfig): Promise<void> {
    const settings = await this.readSettings()
    settings.mcpServers[name] = config
    await this.writeSettings(settings)
  }

  async update(name: string, config: McpServerConfig): Promise<void> {
    const settings = await this.readSettings()
    if (!settings.mcpServers[name]) {
      throw new Error(`MCP server "${name}" not found`)
    }
    settings.mcpServers[name] = config
    await this.writeSettings(settings)
  }

  async delete(name: string): Promise<void> {
    const settings = await this.readSettings()
    delete settings.mcpServers[name]
    await this.writeSettings(settings)
  }
}
