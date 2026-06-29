import { Pencil, Trash2, Server, Power, FolderUp, Globe } from 'lucide-react'
import type { McpServerConfig } from '../../../../shared/types/mcp'
import { getMcpTransport } from '../../../../shared/types/mcp'

interface MCPCardProps {
  name: string
  config: McpServerConfig
  onEdit: () => void
  onDelete: () => void
  onToggle?: () => void
  /** 공유 위키에 올리기 — 등록된 위키가 있을 때만 호출자가 전달 */
  onShareToWiki?: () => void
  /** 다중 선택 모드일 때 true. true 이면 카드 클릭 = onToggleSelect */
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}

function MCPCard({
  name, config, onEdit, onDelete, onToggle, onShareToWiki,
  selectable, selected, onToggleSelect
}: MCPCardProps): JSX.Element {
  const active = !config.disabled
  const transport = getMcpTransport(config)
  const isRemote = transport === 'http' || transport === 'sse'
  const headerCount = config.headers ? Object.keys(config.headers).length : 0
  const handleCardClick = (): void => {
    if (selectable) onToggleSelect?.()
  }
  return (
    <div
      onClick={handleCardClick}
      className={`ds-card transition-all ${selectable ? 'cursor-pointer' : ''}`}
      style={{
        padding: 12,
        ...(selectable && selected
          ? { boxShadow: '0 0 0 2px var(--accent-orange, #FB923C)', borderColor: 'var(--accent-orange, #FB923C)' }
          : {})
      }}
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-[6px] flex-none flex items-center justify-center bg-clauday-blue/10">
          {isRemote
            ? <Globe size={16} className="text-clauday-blue" />
            : <Server size={16} className="text-clauday-blue" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[calc(13px_*_var(--app-font-scale,1))] font-semibold text-text-primary truncate">{name}</h3>
            <span
              className={`ds-chip ${active ? 'emerald' : 'red'}`}
              style={{ flex: 'none' }}
            >
              <span className="dot" />
              {active ? '활성' : '비활성'}
            </span>
            <span
              className="px-1.5 py-0.5 rounded-[4px] text-[calc(9px_*_var(--app-font-scale,1))] font-mono uppercase bg-bg-surface-hover text-text-tertiary border border-bg-border"
              style={{ flex: 'none' }}
            >
              {transport}
            </span>
          </div>
          <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary font-mono mt-0.5 truncate">
            {isRemote ? (
              <>
                {config.url || <span className="text-text-tertiary">URL 없음</span>}
                {headerCount > 0 && (
                  <span className="text-text-tertiary"> · 헤더 {headerCount}개</span>
                )}
              </>
            ) : (
              <>
                {config.command || <span className="text-text-tertiary">커맨드 없음</span>}
                {config.args && config.args.length > 0 && (
                  <span className="text-text-tertiary"> · {config.args.length}개 인자</span>
                )}
              </>
            )}
          </p>
        </div>
        {!selectable && (
          <div className="flex items-center gap-0.5 flex-none">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit() }}
              className="ds-btn icon sm"
              title="편집"
            >
              <Pencil size={13} />
            </button>
            {onShareToWiki && (
              <button
                onClick={(e) => { e.stopPropagation(); onShareToWiki() }}
                className="ds-btn icon sm"
                title="공유에 올리기"
                style={{ color: 'var(--c-blue-fg)' }}
              >
                <FolderUp size={13} />
              </button>
            )}
            {onToggle && (
              <button
                onClick={(e) => { e.stopPropagation(); onToggle() }}
                className="ds-btn icon sm"
                title={active ? '비활성화' : '활성화'}
                style={{ color: active ? 'var(--c-emerald-solid)' : undefined }}
              >
                <Power size={13} />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="ds-btn icon sm"
              title="삭제"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>
      {!isRemote && config.args && config.args.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {config.args.map((arg, i) => (
            <span
              key={i}
              className="px-1.5 py-0.5 rounded-[4px] text-[calc(10px_*_var(--app-font-scale,1))] font-mono bg-bg-surface-hover text-text-secondary border border-bg-border"
            >
              {arg}
            </span>
          ))}
        </div>
      )}
      {isRemote && headerCount > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {Object.keys(config.headers || {}).map((h) => (
            <span
              key={h}
              className="px-1.5 py-0.5 rounded-[4px] text-[calc(10px_*_var(--app-font-scale,1))] font-mono bg-bg-surface-hover text-text-secondary border border-bg-border"
            >
              {h}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default MCPCard
