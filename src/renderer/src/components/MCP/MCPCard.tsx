import { useState } from 'react'
import { Pencil, Trash2, Server, Power, FolderUp, Globe, MoreHorizontal } from 'lucide-react'
import type { McpServerConfig } from '../../../../shared/types/mcp'
import { getMcpTransport } from '../../../../shared/types/mcp'
import ArgChips from './ArgChips'

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
  const [menuOpen, setMenuOpen] = useState(false)
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
        padding: 14,
        ...(selectable && selected
          ? { boxShadow: 'var(--ring-selected)', borderColor: 'var(--ring-selected-color)' }
          : {})
      }}
    >
      <div className="flex items-start gap-3">
        {/* MCP 는 Claude 도메인 진입점 — 대표 아이콘만 도메인색을 갖는다 */}
        <div className="w-8 h-8 rounded-[6px] flex-none flex items-center justify-center bg-bg-active">
          {isRemote
            ? <Globe size={16} className="text-brand-claude" />
            : <Server size={16} className="text-brand-claude" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[calc(13px_*_var(--app-font-scale,1))] font-semibold text-text-primary truncate">{name}</h3>
            {/* 비활성은 오류가 아니라 상태다 — red 는 실제 오류에만 남긴다 */}
            <span className={`ds-chip ${active ? 'emerald' : 'neutral'}`} style={{ flex: 'none' }}>
              <span className="dot" />
              {active ? '활성' : '비활성'}
            </span>
            <span
              className="px-1.5 py-0.5 rounded-[4px] text-[calc(11px_*_var(--app-font-scale,1))] font-mono uppercase bg-bg-surface-hover text-text-secondary border border-bg-border"
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
                  <span className="text-text-tertiary"> · 인자 {config.args.length}개</span>
                )}
              </>
            )}
          </p>
        </div>
        {!selectable && (
          /* 자주 쓰는 둘만 꺼내 두고 되돌릴 수 없는 삭제는 메뉴 안으로 내린다 —
             삭제가 전원 버튼 옆에 붙어 있으면 오클릭이 곧 사고가 된다. */
          <div className="flex items-center gap-1 flex-none">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit() }}
              className="ds-btn icon"
              title="편집"
              aria-label={`${name} 편집`}
            >
              <Pencil size={13} />
            </button>
            {onShareToWiki && (
              <button
                onClick={(e) => { e.stopPropagation(); onShareToWiki() }}
                className="ds-btn icon"
                title="공유에 올리기"
                aria-label={`${name} 공유에 올리기`}
              >
                <FolderUp size={13} />
              </button>
            )}
            <span className="w-px h-5 bg-bg-border mx-1" />
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o) }}
                className="ds-btn icon secondary"
                title="더 보기"
                aria-label={`${name} 추가 작업`}
                aria-expanded={menuOpen}
              >
                <MoreHorizontal size={14} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }} />
                  <div className="ds-menu" style={{ top: 'calc(100% + 4px)', right: 0, minWidth: 180, zIndex: 40 }}>
                    {onToggle && (
                      <div
                        className="ds-menu-item"
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onToggle() }}
                      >
                        <Power size={12} />
                        {active ? '비활성화' : '활성화'}
                      </div>
                    )}
                    <div className="ds-menu-sep" />
                    <div
                      className="ds-menu-item danger"
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete() }}
                    >
                      <Trash2 size={12} />
                      삭제…
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      {!isRemote && <ArgChips args={config.args} />}
      {isRemote && headerCount > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.keys(config.headers || {}).map((h) => (
            <span
              key={h}
              className="px-1.5 py-0.5 rounded-[4px] text-[calc(11px_*_var(--app-font-scale,1))] font-mono bg-bg-surface-hover text-text-secondary border border-bg-border"
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
