/**
 * Claude Code MCP 설정 스키마. 전송 방식 3가지를 모두 지원한다.
 * - stdio (기본): command + args + env
 * - http / sse: url + headers
 *
 * type 이 생략된 경우 stdio 로 간주한다 (Claude Code 동일).
 */
export type McpTransport = 'stdio' | 'http' | 'sse'

export interface McpServerConfig {
  type?: McpTransport
  // stdio
  command?: string
  args?: string[]
  env?: Record<string, string>
  // http / sse
  url?: string
  headers?: Record<string, string>
  // 공통
  disabled?: boolean
}

export interface McpSettings {
  mcpServers: Record<string, McpServerConfig>
}

export interface McpServerEntry {
  name: string
  config: McpServerConfig
}

/** url 이 있거나 type 이 http/sse 면 원격 전송으로 판정. */
export function getMcpTransport(config: McpServerConfig): McpTransport {
  if (config.type === 'http' || config.type === 'sse') return config.type
  if (config.url && !config.command) return 'http'
  return 'stdio'
}
