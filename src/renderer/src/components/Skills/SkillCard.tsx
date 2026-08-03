import { useState } from 'react'
import { Sparkles, Play, Pencil, Trash2, Loader2, FolderUp, MoreHorizontal } from 'lucide-react'
import type { Skill } from '../../../../shared/types/skills'
import { TimeAgo } from '../common/ds'

interface SkillCardProps {
  skill: Skill
  usageCount?: number
  uploading?: boolean
  onOpen: () => void
  onRun?: () => void
  onDelete: () => void
  /** 위키 저장소에 올리기 — wikiId 가 설정된 경우만 호출자가 props 로 전달 */
  onUploadToWiki?: () => void
  /** 다중 선택 모드일 때 true. true 이면 onOpen 대신 onToggleSelect 가 클릭 동작이 됨. */
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}

/** YAML frontmatter / 첫 단락에서 설명 추출 */
function extractDescription(content: string): string {
  if (!content) return ''
  const m = content.match(/^---\s*[\r\n]([\s\S]*?)[\r\n]---/)
  if (m) {
    const fm = m[1]
    const desc = fm.match(/description:\s*(.+)/i)
    if (desc) return desc[1].trim().replace(/^["']|["']$/g, '')
  }
  const body = m ? content.slice(m[0].length) : content
  const firstLine = body.split('\n').find((l) => l.trim() && !l.trim().startsWith('#'))
  return (firstLine || '').trim().slice(0, 80)
}

function SkillCard({
  skill, uploading, onOpen, onRun, onDelete, onUploadToWiki,
  selectable, selected, onToggleSelect
}: SkillCardProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const description = extractDescription(skill.content)

  return (
    <div
      onClick={selectable ? onToggleSelect : onOpen}
      className={`ds-card group cursor-pointer relative transition-all ${
        selectable
          ? ''
          : 'hover:border-bg-border-strong'
      }`}
      style={{
        padding: '12px 14px',
        ...(selectable && selected
          ? { boxShadow: 'var(--ring-selected)', borderColor: 'var(--ring-selected-color)' }
          : {})
      }}
    >
      {uploading && (
        <div className="absolute top-1.5 right-8 inline-flex items-center gap-1 h-5 px-1.5 rounded-[4px] text-[calc(11px_*_var(--app-font-scale,1))] font-semibold"
          style={{ background: 'var(--c-orange-bg)', color: 'var(--c-orange-fg)' }}>
          <Loader2 size={10} className="animate-spin" />
          업로드 중
        </div>
      )}
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-[6px] flex-none flex items-center justify-center bg-bg-active">
          <Sparkles size={15} className="text-brand-claude" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[calc(13px_*_var(--app-font-scale,1))] font-semibold text-text-primary truncate">{skill.name}</div>
          {description && (
            <div className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary truncate mt-0.5">{description}</div>
          )}
        </div>
        {/* MCP 로컬 카드와 같은 배치 — 자주 쓰는 둘만 아이콘으로 두고 삭제는 ⋯ 안으로.
            되돌릴 수 없는 동작이 편집 옆에 붙어 있으면 오클릭이 곧 사고가 된다. */}
        {!selectable && (
          <div className="flex items-center gap-1 flex-none">
            <button
              onClick={(e) => { e.stopPropagation(); onOpen() }}
              className="ds-btn icon"
              title="편집"
              aria-label={`${skill.name} 편집`}
            >
              <Pencil size={13} />
            </button>
            {onUploadToWiki && (
              <button
                onClick={(e) => { e.stopPropagation(); if (uploading) return; onUploadToWiki() }}
                disabled={uploading}
                className="ds-btn icon"
                title="공유에 올리기"
                aria-label={`${skill.name} 공유에 올리기`}
              >
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <FolderUp size={13} />}
              </button>
            )}
            <span className="w-px h-5 bg-bg-border mx-1" />
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o) }}
                className="ds-btn icon secondary"
                title="더 보기"
                aria-label={`${skill.name} 추가 작업`}
                aria-expanded={menuOpen}
              >
                <MoreHorizontal size={14} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }} />
                  <div className="ds-menu" style={{ top: 'calc(100% + 4px)', right: 0, minWidth: 180, zIndex: 40 }}>
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

      <div className="flex items-center gap-1 mt-2.5 pt-2 border-t border-bg-border">
        <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary">업데이트</span>
        <TimeAgo date={skill.updatedAt} />
        <div className="flex-1" />
        {onRun && (
          <button
            onClick={(e) => { e.stopPropagation(); onRun() }}
            className="flex items-center gap-1 text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary hover:text-text-primary"
          >
            <Play size={11} /> 실행
          </button>
        )}
      </div>
    </div>
  )
}

export default SkillCard
