import { Pencil, Trash2, Server, Power } from 'lucide-react'
import type { McpServerConfig } from '../../../../shared/types/mcp'

interface MCPCardProps {
  name: string
  config: McpServerConfig
  onEdit: () => void
  onDelete: () => void
  onToggle?: () => void
}

function MCPCard({ name, config, onEdit, onDelete, onToggle }: MCPCardProps): JSX.Element {
  const active = !config.disabled
  return (
    <div className="ds-card" style={{ padding: 12 }}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-[6px] flex-none flex items-center justify-center bg-clover-blue/10">
          <Server size={16} className="text-clover-blue" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[13px] font-semibold text-text-primary truncate">{name}</h3>
            <span
              className={`ds-chip ${active ? 'emerald' : 'red'}`}
              style={{ flex: 'none' }}
            >
              <span className="dot" />
              {active ? '활성' : '비활성'}
            </span>
          </div>
          <p className="text-[11px] text-text-secondary font-mono mt-0.5 truncate">
            {config.command}
            {config.args && config.args.length > 0 && (
              <span className="text-text-tertiary"> · {config.args.length}개 인자</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-0.5 flex-none">
          <button
            onClick={onEdit}
            className="ds-btn icon sm"
            title="편집"
          >
            <Pencil size={13} />
          </button>
          {onToggle && (
            <button
              onClick={onToggle}
              className="ds-btn icon sm"
              title={active ? '비활성화' : '활성화'}
              style={{ color: active ? '#22C55E' : undefined }}
            >
              <Power size={13} />
            </button>
          )}
          <button
            onClick={onDelete}
            className="ds-btn icon sm"
            title="삭제"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {config.args && config.args.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {config.args.map((arg, i) => (
            <span
              key={i}
              className="px-1.5 py-0.5 rounded-[4px] text-[10px] font-mono bg-bg-surface-hover text-text-secondary border border-bg-border"
            >
              {arg}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default MCPCard
