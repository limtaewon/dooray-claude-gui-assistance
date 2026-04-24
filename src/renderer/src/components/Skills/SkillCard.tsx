import { Sparkles, Play, MoreHorizontal, Pencil, Trash2, Upload, Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { Skill } from '../../../../shared/types/skills'

interface SkillCardProps {
  skill: Skill
  usageCount?: number
  uploading?: boolean
  onOpen: () => void
  onRun?: () => void
  onDelete: () => void
  onShare?: () => void
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

function SkillCard({ skill, uploading, onOpen, onRun, onDelete, onShare }: SkillCardProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const description = extractDescription(skill.content)

  return (
    <div
      onClick={onOpen}
      className="ds-card group cursor-pointer relative hover:border-clover-blue/40 transition-colors"
      style={{ padding: '12px 14px' }}
    >
      {uploading && (
        <div className="absolute top-1.5 right-8 inline-flex items-center gap-1 h-5 px-1.5 rounded-[4px] text-[9px] font-semibold"
          style={{ background: 'rgba(234,88,12,0.15)', color: '#FB923C' }}>
          <Loader2 size={10} className="animate-spin" />
          업로드 중
        </div>
      )}
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-[6px] flex-none flex items-center justify-center bg-clover-blue/10">
          <Sparkles size={15} className="text-clover-blue" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-text-primary truncate">{skill.name}</div>
          {description && (
            <div className="text-[11px] text-text-secondary truncate mt-0.5">{description}</div>
          )}
        </div>
        <div className="relative flex-none">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
            className="ds-btn icon sm opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="메뉴"
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }} />
              <div className="ds-menu absolute right-0 top-full mt-1 z-40" style={{ minWidth: 160 }}>
                <div className="ds-menu-item" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onOpen() }}>
                  <Pencil size={12} /> 편집
                </div>
                {onShare && (
                  <div
                    className={`ds-menu-item ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
                    onClick={(e) => { e.stopPropagation(); if (uploading) return; setMenuOpen(false); onShare() }}
                  >
                    {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                    {uploading ? '업로드 중...' : '공유 업로드'}
                  </div>
                )}
                <div className="ds-menu-item" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete() }}>
                  <Trash2 size={12} /> 삭제
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center mt-2.5 pt-2 border-t border-bg-border/60">
        <span className="text-[10px] text-text-tertiary">업데이트 {formatRelative(skill.updatedAt)}</span>
        <div className="flex-1" />
        {onRun && (
          <button
            onClick={(e) => { e.stopPropagation(); onRun() }}
            className="flex items-center gap-1 text-[11px] text-text-secondary hover:text-clover-blue"
          >
            <Play size={11} /> 실행
          </button>
        )}
      </div>
    </div>
  )
}

export default SkillCard
