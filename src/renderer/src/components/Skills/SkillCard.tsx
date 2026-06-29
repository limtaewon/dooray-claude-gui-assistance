import { Sparkles, Play, Pencil, Trash2, Loader2, FolderUp } from 'lucide-react'
import type { Skill } from '../../../../shared/types/skills'

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

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return '방금 전'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}일 전`
  return new Date(ts).toLocaleDateString('ko-KR')
}

function SkillCard({
  skill, uploading, onOpen, onRun, onDelete, onUploadToWiki,
  selectable, selected, onToggleSelect
}: SkillCardProps): JSX.Element {
  const description = extractDescription(skill.content)

  return (
    <div
      onClick={selectable ? onToggleSelect : onOpen}
      className={`ds-card group cursor-pointer relative transition-all ${
        selectable
          ? ''
          : 'hover:border-clauday-blue/40'
      }`}
      style={{
        padding: '12px 14px',
        ...(selectable && selected
          ? { boxShadow: '0 0 0 2px var(--accent-orange, #FB923C)', borderColor: 'var(--accent-orange, #FB923C)' }
          : {})
      }}
    >
      {uploading && (
        <div className="absolute top-1.5 right-8 inline-flex items-center gap-1 h-5 px-1.5 rounded-[4px] text-[calc(9px_*_var(--app-font-scale,1))] font-semibold"
          style={{ background: 'var(--c-orange-bg)', color: 'var(--c-orange-fg)' }}>
          <Loader2 size={10} className="animate-spin" />
          업로드 중
        </div>
      )}
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-[6px] flex-none flex items-center justify-center bg-clauday-blue/10">
          <Sparkles size={15} className="text-clauday-blue" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[calc(13px_*_var(--app-font-scale,1))] font-semibold text-text-primary truncate">{skill.name}</div>
          {description && (
            <div className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary truncate mt-0.5">{description}</div>
          )}
        </div>
        {/* MCP 카드와 동일하게 인라인 액션 아이콘을 기본 노출 (편집/공유에 올리기/삭제) */}
        {!selectable && (
          <div className="flex items-center gap-0.5 flex-none">
            <button
              onClick={(e) => { e.stopPropagation(); onOpen() }}
              className="ds-btn icon sm"
              title="편집"
            >
              <Pencil size={13} />
            </button>
            {onUploadToWiki && (
              <button
                onClick={(e) => { e.stopPropagation(); if (uploading) return; onUploadToWiki() }}
                disabled={uploading}
                className="ds-btn icon sm"
                title="공유에 올리기"
                style={{ color: 'var(--c-blue-fg)' }}
              >
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <FolderUp size={13} />}
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

      <div className="flex items-center mt-2.5 pt-2 border-t border-bg-border/60">
        <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">업데이트 {formatRelative(skill.updatedAt)}</span>
        <div className="flex-1" />
        {onRun && (
          <button
            onClick={(e) => { e.stopPropagation(); onRun() }}
            className="flex items-center gap-1 text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary hover:text-clauday-blue"
          >
            <Play size={11} /> 실행
          </button>
        )}
      </div>
    </div>
  )
}

export default SkillCard
