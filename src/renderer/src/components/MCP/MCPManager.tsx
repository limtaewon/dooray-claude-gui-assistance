import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, RefreshCw, Server } from 'lucide-react'
import MCPCard from './MCPCard'
import MCPForm from './MCPForm'
import type { McpServerConfig } from '../../../../shared/types/mcp'
import { Button, EmptyView, LoadingView } from '../common/ds'

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
    if (!window.confirm(`"${name}" MCP 서버를 삭제할까요?\n설정 파일에서 제거되며 복구할 수 없습니다.`)) return
    try {
      await window.api.mcp.delete(name)
      await loadServers()
    } catch (err) {
      console.error('MCP 서버 삭제 실패:', err)
    }
  }

  const entries = useMemo(() => Object.entries(servers), [servers])
  const activeCount = useMemo(() => entries.filter(([, c]) => !c.disabled).length, [entries])

  const handleToggle = async (name: string, config: McpServerConfig): Promise<void> => {
    try {
      await window.api.mcp.update(name, { ...config, disabled: !config.disabled })
      await loadServers()
    } catch (err) {
      console.error('MCP 서버 토글 실패:', err)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 py-4 space-y-4">
        {/* DS PageHeader */}
        <div className="flex items-center gap-3">
          <Server size={18} className="text-clover-blue" />
          <h2 className="text-[14px] font-semibold text-text-primary">MCP 서버</h2>
          <span className="text-[11px] text-text-tertiary">
            · {entries.length}개 · 활성 {activeCount}
          </span>
          <div className="flex-1" />
          <Button variant="primary" onClick={loadServers} leftIcon={<RefreshCw size={12} />} title="새로고침">
            새로고침
          </Button>
          <Button variant="primary" onClick={() => setFormState({ mode: 'add' })} leftIcon={<Plus size={12} />}>
            서버 추가
          </Button>
        </div>

        {formState.mode !== 'closed' && (
          <MCPForm
            editName={formState.mode === 'edit' ? formState.name : undefined}
            editConfig={formState.mode === 'edit' ? formState.config : undefined}
            onSave={handleSave}
            onCancel={() => setFormState({ mode: 'closed' })}
          />
        )}

        {loading ? (
          <LoadingView label="MCP 서버 목록을 불러오는 중..." />
        ) : entries.length === 0 ? (
          <EmptyView
            icon={Server}
            title="등록된 MCP 서버가 없습니다"
            body="'서버 추가' 버튼을 눌러 시작하세요"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {entries.map(([name, config]) => (
              <MCPCard
                key={name}
                name={name}
                config={config}
                onEdit={() => setFormState({ mode: 'edit', name, config })}
                onDelete={() => handleDelete(name)}
                onToggle={() => handleToggle(name, config)}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 text-[11px] text-text-tertiary pt-1">
          <span>💡</span>
          <span>
            설정은 <span className="font-mono text-text-secondary">~/.claude.json</span>에 저장됩니다. 새로고침으로 외부 변경 반영.
          </span>
        </div>
      </div>
    </div>
  )
}

export default MCPManager
