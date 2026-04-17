import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import MCPCard from './MCPCard'
import MCPForm from './MCPForm'
import type { McpServerConfig } from '../../../../shared/types/mcp'

type FormState =
  | { mode: 'closed' }
  | { mode: 'add' }
  | { mode: 'edit'; name: string; config: McpServerConfig }

function MCPManager(): JSX.Element {
  const [servers, setServers] = useState<Record<string, McpServerConfig>>({})
  const [formState, setFormState] = useState<FormState>({ mode: 'closed' })
  const [loading, setLoading] = useState(true)

  const loadServers = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.api.mcp.list()
      setServers(list)
    } catch (err) {
      console.error('MCP 서버 목록 로드 실패:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadServers()
    const cleanup = window.api.onConfigChanged(() => loadServers())
    return cleanup
  }, [loadServers])

  const handleSave = async (name: string, config: McpServerConfig): Promise<void> => {
    try {
      if (formState.mode === 'edit') {
        await window.api.mcp.update(name, config)
      } else {
        await window.api.mcp.add(name, config)
      }
      setFormState({ mode: 'closed' })
      await loadServers()
    } catch (err) {
      console.error('MCP 서버 저장 실패:', err)
    }
  }

  const handleDelete = async (name: string): Promise<void> => {
    try {
      await window.api.mcp.delete(name)
      await loadServers()
    } catch (err) {
      console.error('MCP 서버 삭제 실패:', err)
    }
  }

  const entries = useMemo(() => Object.entries(servers), [servers])

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">MCP 서버</h2>
          <p className="text-xs text-text-secondary mt-1">
            Model Context Protocol 서버 설정 관리
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadServers}
            className="p-2 rounded-lg hover:bg-bg-border text-text-secondary hover:text-text-primary transition-colors"
            title="새로 고침"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setFormState({ mode: 'add' })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-clover-blue text-white text-sm hover:bg-clover-blue/80 transition-colors"
          >
            <Plus size={14} />
            서버 추가
          </button>
        </div>
      </div>

      {formState.mode !== 'closed' && (
        <div className="mb-4">
          <MCPForm
            editName={formState.mode === 'edit' ? formState.name : undefined}
            editConfig={formState.mode === 'edit' ? formState.config : undefined}
            onSave={handleSave}
            onCancel={() => setFormState({ mode: 'closed' })}
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40 text-text-secondary text-sm">
          불러오는 중...
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-text-secondary text-sm">
          <p>등록된 MCP 서버가 없습니다.</p>
          <p className="text-xs mt-1">&apos;서버 추가&apos; 버튼을 눌러 시작하세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {entries.map(([name, config]) => (
            <MCPCard
              key={name}
              name={name}
              config={config}
              onEdit={() => setFormState({ mode: 'edit', name, config })}
              onDelete={() => handleDelete(name)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default MCPManager
