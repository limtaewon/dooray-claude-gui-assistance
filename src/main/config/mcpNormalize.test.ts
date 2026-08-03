import { describe, it, expect } from 'vitest'
import { normalizeStdioCommandForWindows } from './mcpNormalize'
import type { McpServerConfig } from '../../shared/types/mcp'

describe('normalizeStdioCommandForWindows — ADR-v2-windows-fix-06 §1', () => {
  it('darwin 은 무변환 — npx 커맨드도 그대로', () => {
    const config: McpServerConfig = { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] }
    const result = normalizeStdioCommandForWindows(config, { platform: 'darwin' })
    expect(result).toEqual(config)
  })

  it('win32 + npx → cmd /c 로 래핑', () => {
    const config: McpServerConfig = { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', 'C:\\work'] }
    const result = normalizeStdioCommandForWindows(config, { platform: 'win32' })
    expect(result.command).toBe('cmd')
    expect(result.args).toEqual(['/c', 'npx', '-y', '@modelcontextprotocol/server-filesystem', 'C:\\work'])
  })

  it('win32 + uvx → cmd /c 로 래핑 (대소문자 무시)', () => {
    const config: McpServerConfig = { command: 'UVX', args: ['tool'] }
    const result = normalizeStdioCommandForWindows(config, { platform: 'win32' })
    expect(result.command).toBe('cmd')
    expect(result.args).toEqual(['/c', 'UVX', 'tool'])
  })

  it('win32 + .cmd 접미 커맨드 → 래핑', () => {
    const config: McpServerConfig = { command: 'my-server.cmd', args: [] }
    const result = normalizeStdioCommandForWindows(config, { platform: 'win32' })
    expect(result.command).toBe('cmd')
    expect(result.args).toEqual(['/c', 'my-server.cmd'])
  })

  it('win32 + .bat 접미 커맨드 → 래핑', () => {
    const config: McpServerConfig = { command: 'run.bat' }
    const result = normalizeStdioCommandForWindows(config, { platform: 'win32' })
    expect(result.command).toBe('cmd')
    expect(result.args).toEqual(['/c', 'run.bat'])
  })

  it('멱등 — 이미 cmd /c 로 감싼 입력은 두 번 감싸지 않는다', () => {
    const config: McpServerConfig = { command: 'cmd', args: ['/c', 'npx', '-y', 'server'] }
    const result = normalizeStdioCommandForWindows(config, { platform: 'win32' })
    expect(result).toEqual(config)
  })

  it('멱등 — cmd.exe + 대문자 /C 도 이미 감싼 것으로 판정', () => {
    const config: McpServerConfig = { command: 'cmd.exe', args: ['/C', 'npx', 'server'] }
    const result = normalizeStdioCommandForWindows(config, { platform: 'win32' })
    expect(result).toEqual(config)
  })

  it('node 절대경로 실행 파일은 래핑하지 않는다', () => {
    const config: McpServerConfig = { command: 'node', args: ['server.js'] }
    const result = normalizeStdioCommandForWindows(config, { platform: 'win32' })
    expect(result).toEqual(config)
  })

  it('절대경로 .exe 커맨드도 래핑하지 않는다', () => {
    const config: McpServerConfig = { command: 'C:\\tools\\server.exe', args: [] }
    const result = normalizeStdioCommandForWindows(config, { platform: 'win32' })
    expect(result).toEqual(config)
  })

  it('http 전송 설정은 win32 여도 손대지 않는다', () => {
    const config: McpServerConfig = { type: 'http', url: 'https://example.com/mcp' }
    const result = normalizeStdioCommandForWindows(config, { platform: 'win32' })
    expect(result).toEqual(config)
  })

  it('sse 전송 설정도 손대지 않는다', () => {
    const config: McpServerConfig = { type: 'sse', url: 'https://example.com/sse' }
    const result = normalizeStdioCommandForWindows(config, { platform: 'win32' })
    expect(result).toEqual(config)
  })

  it('command 가 없는 입력은 그대로 반환 (throw 없음)', () => {
    const config: McpServerConfig = { args: ['x'] }
    const result = normalizeStdioCommandForWindows(config, { platform: 'win32' })
    expect(result).toEqual(config)
  })

  it('args 가 없는 npx 커맨드도 래핑되고 args 는 ["/c","npx"] 가 된다', () => {
    const config: McpServerConfig = { command: 'npx' }
    const result = normalizeStdioCommandForWindows(config, { platform: 'win32' })
    expect(result.command).toBe('cmd')
    expect(result.args).toEqual(['/c', 'npx'])
  })

  it('env 등 나머지 필드는 그대로 보존된다', () => {
    const config: McpServerConfig = { command: 'npx', args: ['-y', 'server'], env: { FOO: 'bar' }, disabled: true }
    const result = normalizeStdioCommandForWindows(config, { platform: 'win32' })
    expect(result.env).toEqual({ FOO: 'bar' })
    expect(result.disabled).toBe(true)
  })

  it('platform 미지정이면 process.platform 을 따른다', () => {
    const config: McpServerConfig = { command: 'npx', args: [] }
    const result = normalizeStdioCommandForWindows(config)
    // CI 는 macOS 와 Windows 양쪽에서 돈다 — 호스트에 맞는 결과를 기대한다.
    if (process.platform === 'win32') {
      expect(result).toEqual({ command: 'cmd', args: ['/c', 'npx'] })
    } else {
      expect(result).toEqual(config)
    }
  })
})
