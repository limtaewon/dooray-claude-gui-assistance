export interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  disabled?: boolean
}

export interface McpSettings {
  mcpServers: Record<string, McpServerConfig>
}

export interface McpServerEntry {
  name: string
  config: McpServerConfig
}
