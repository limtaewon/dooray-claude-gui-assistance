import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { McpServerConfig, McpTransport } from '../../../../shared/types/mcp'
import { getMcpTransport } from '../../../../shared/types/mcp'

interface MCPFormProps {
  editName?: string
  editConfig?: McpServerConfig
  onSave: (name: string, config: McpServerConfig) => void
  onCancel: () => void
}

function headersToText(h?: Record<string, string>): string {
  if (!h) return ''
  return Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\n')
}

function envToText(e?: Record<string, string>): string {
  if (!e) return ''
  return Object.entries(e).map(([k, v]) => `${k}=${v}`).join('\n')
}

function MCPForm({ editName, editConfig, onSave, onCancel }: MCPFormProps): JSX.Element {
  const initialTransport: McpTransport = editConfig ? getMcpTransport(editConfig) : 'stdio'

  const [name, setName] = useState(editName || '')
  const [transport, setTransport] = useState<McpTransport>(initialTransport)
  const [command, setCommand] = useState(editConfig?.command || '')
  const [argsText, setArgsText] = useState(editConfig?.args?.join('\n') || '')
  const [envText, setEnvText] = useState(envToText(editConfig?.env))
  const [url, setUrl] = useState(editConfig?.url || '')
  const [headersText, setHeadersText] = useState(headersToText(editConfig?.headers))

  const isEdit = !!editName
  const isRemote = transport === 'http' || transport === 'sse'

  useEffect(() => {
    if (editName) setName(editName)
    if (editConfig) {
      setTransport(getMcpTransport(editConfig))
      setCommand(editConfig.command || '')
      setArgsText(editConfig.args?.join('\n') || '')
      setEnvText(envToText(editConfig.env))
      setUrl(editConfig.url || '')
      setHeadersText(headersToText(editConfig.headers))
    }
  }, [editName, editConfig])

  const handleSubmit = (): void => {
    if (!name.trim()) return

    if (isRemote) {
      if (!url.trim()) return
      const headers: Record<string, string> = {}
      headersText
        .split('\n').map((l) => l.trim()).filter((l) => l)
        .forEach((line) => {
          const colonIdx = line.indexOf(':')
          if (colonIdx > 0) headers[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim()
        })
      const config: McpServerConfig = {
        type: transport,
        url: url.trim(),
        ...(Object.keys(headers).length > 0 ? { headers } : {})
      }
      onSave(name.trim(), config)
      return
    }

    if (!command.trim()) return
    const args = argsText.split('\n').map((a) => a.trim()).filter((a) => a)
    const env: Record<string, string> = {}
    envText
      .split('\n').map((l) => l.trim()).filter((l) => l)
      .forEach((line) => {
        const eqIdx = line.indexOf('=')
        if (eqIdx > 0) env[line.slice(0, eqIdx)] = line.slice(eqIdx + 1)
      })

    const config: McpServerConfig = {
      command: command.trim(),
      ...(args.length > 0 ? { args } : {}),
      ...(Object.keys(env).length > 0 ? { env } : {})
    }

    onSave(name.trim(), config)
  }

  return (
    <div className="bg-bg-surface border border-bg-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-primary">
          {isEdit ? 'MCP 서버 편집' : 'MCP 서버 추가'}
        </h3>
        <button
          onClick={onCancel}
          className="p-1 rounded hover:bg-bg-border text-text-secondary hover:text-text-primary"
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-text-secondary mb-1">이름</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isEdit}
            placeholder="my-server"
            className="w-full px-3 py-2 bg-bg-primary border border-bg-border rounded text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-clauday-blue disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">전송 방식</label>
          <div className="flex gap-1.5">
            {(['stdio', 'http', 'sse'] as McpTransport[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTransport(t)}
                className={`px-3 py-1.5 rounded text-xs font-mono uppercase border transition-colors ${
                  transport === t
                    ? 'bg-clauday-blue text-white border-clauday-blue'
                    : 'bg-bg-primary text-text-secondary border-bg-border hover:text-text-primary'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {isRemote ? (
          <>
            <div>
              <label className="block text-xs text-text-secondary mb-1">URL</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/mcp"
                className="w-full px-3 py-2 bg-bg-primary border border-bg-border rounded text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-clauday-blue font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">
                헤더 (KEY: VALUE, 한 줄에 하나씩)
              </label>
              <textarea
                value={headersText}
                onChange={(e) => setHeadersText(e.target.value)}
                placeholder="Authorization: Bearer xxx"
                rows={3}
                className="w-full px-3 py-2 bg-bg-primary border border-bg-border rounded text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-clauday-blue font-mono resize-none"
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-xs text-text-secondary mb-1">커맨드</label>
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="npx"
                className="w-full px-3 py-2 bg-bg-primary border border-bg-border rounded text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-clauday-blue font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">인수 (한 줄에 하나씩)</label>
              <textarea
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
                placeholder={'-y\n@modelcontextprotocol/server-name'}
                rows={3}
                className="w-full px-3 py-2 bg-bg-primary border border-bg-border rounded text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-clauday-blue font-mono resize-none"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">
                환경 변수 (KEY=VALUE, 한 줄에 하나씩)
              </label>
              <textarea
                value={envText}
                onChange={(e) => setEnvText(e.target.value)}
                placeholder="API_KEY=xxx"
                rows={2}
                className="w-full px-3 py-2 bg-bg-primary border border-bg-border rounded text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-clauday-blue font-mono resize-none"
              />
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded text-sm text-text-secondary hover:text-text-primary hover:bg-bg-border transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-1.5 rounded text-sm bg-clauday-blue text-white hover:bg-clauday-blue/80 transition-colors"
          >
            {isEdit ? '수정' : '추가'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default MCPForm
