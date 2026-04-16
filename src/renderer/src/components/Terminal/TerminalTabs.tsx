import { Plus, X } from 'lucide-react'
import type { TerminalSession } from '../../../../shared/types/terminal'

interface TerminalTabsProps {
  sessions: TerminalSession[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onClose: (id: string) => void
}

function TerminalTabs({
  sessions,
  activeId,
  onSelect,
  onCreate,
  onClose
}: TerminalTabsProps): JSX.Element {
  return (
    <div className="flex items-center h-9 bg-bg-surface border-b border-bg-border px-2 gap-1 overflow-x-auto">
      {sessions.map((session) => (
        <div
          key={session.id}
          onClick={() => onSelect(session.id)}
          className={`flex items-center gap-1.5 px-3 h-7 rounded text-xs cursor-pointer transition-colors group ${
            activeId === session.id
              ? 'bg-clover-blue text-white'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-border'
          }`}
        >
          <span className="font-mono truncate max-w-[120px]">{session.name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClose(session.id)
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-clover-orange"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        onClick={onCreate}
        className="w-7 h-7 rounded flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-border transition-colors"
        title="New Terminal"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}

export default TerminalTabs
