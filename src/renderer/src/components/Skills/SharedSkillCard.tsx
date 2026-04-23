import { Sparkles, Download, Trash2, User } from 'lucide-react'
import type { SharedSkill } from '../../../../shared/types/shared-skills'

interface SharedSkillCardProps {
  skill: SharedSkill
  busy?: boolean
  onOpen: () => void
  onDownload: () => void
  onDelete?: () => void
}

function formatRelative(iso: string): string {
  if (!iso) return '방금 전'
  const ts = new Date(iso).getTime()
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

function SharedSkillCard({ skill, busy, onOpen, onDownload, onDelete }: SharedSkillCardProps): JSX.Element {
  return (
    <div
      onClick={onOpen}
      className="ds-card group cursor-pointer relative hover:border-clover-blue/40 transition-colors"
      style={{ padding: '12px 14px' }}
    >
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-[6px] flex-none flex items-center justify-center bg-clover-blue/10">
          <Sparkles size={15} className="text-clover-blue" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-text-primary truncate">{skill.name}</div>
          <div className="flex items-center gap-1 text-[10.5px] text-text-tertiary mt-0.5">
            <User size={10} />
            <span className="truncate">{skill.authorName}{skill.isMine && ' · 나'}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center mt-2.5 pt-2 border-t border-bg-border/60 gap-2">
        <span className="text-[10px] text-text-tertiary flex-1">공유 {formatRelative(skill.updatedAt || skill.createdAt)}</span>
        {skill.isMine && onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            disabled={busy}
            className="flex items-center gap-1 text-[11px] text-text-tertiary hover:text-red-400 disabled:opacity-40"
            title="공유 해제 (위키에서 삭제)"
          >
            <Trash2 size={11} /> 공유 해제
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDownload() }}
          disabled={busy}
          className="flex items-center gap-1 text-[11px] text-clover-blue hover:text-clover-blue/80 font-medium disabled:opacity-40"
        >
          <Download size={11} /> 다운로드
        </button>
      </div>
    </div>
  )
}

export default SharedSkillCard
