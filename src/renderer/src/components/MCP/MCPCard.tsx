import { Pencil, Trash2, Server } from 'lucide-react'
import type { McpServerConfig } from '../../../../shared/types/mcp'

interface MCPCardProps {
  name: string
  config: McpServerConfig
  onEdit: () => void
  onDelete: () => void
}

function MCPCard({ name, config, onEdit, onDelete }: MCPCardProps): JSX.Element {
  return (
    <div className="bg-bg-surface border border-bg-border rounded-lg p-4 hover:border-clover-blue/50 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-clover-blue/10 flex items-center justify-center">
            <Server size={18} className="text-clover-blue" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{name}</h3>
            <p className="text-xs text-text-secondary font-mono mt-0.5">{config.command}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 rounded hover:bg-bg-border text-text-secondary hover:text-text-primary transition-colors"
            title="편집"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded hover:bg-bg-border text-text-secondary hover:text-red-400 transition-colors"
            title="삭제"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {config.args && config.args.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {config.args.map((arg, i) => (
            <span
              key={i}
              className="px-2 py-0.5 rounded text-[10px] font-mono bg-bg-border text-text-secondary"
            >
              {arg}
            </span>
          ))}
        </div>
      )}
      {config.disabled && (
        <span className="mt-2 inline-block px-2 py-0.5 rounded text-[10px] bg-clover-orange/10 text-clover-orange">
          비활성화
        </span>
      )}
    </div>
  )
}

export default MCPCard
