import { Sparkles, Download, Trash2, User, Clock } from 'lucide-react'
import type { SharedSkill } from '../../../../shared/types/shared-skills'

interface SharedSkillCardProps {
  skill: SharedSkill
  busy?: boolean
  onOpen: () => void
  onDownload: () => void
  /** 내 스킬일 때만 호출자가 전달. 공유 해제 확인은 부모에서 처리. */
  onDelete?: () => void
}

/** ISO 문자열 또는 epoch 를 상대 시간 텍스트로 포맷 */
function formatRelative(isoOrEpoch: string | number | undefined): string {
  if (!isoOrEpoch) return '방금 전'
  const ts = typeof isoOrEpoch === 'number' ? isoOrEpoch : new Date(isoOrEpoch).getTime()
  if (isNaN(ts)) return '방금 전'
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
  const updatedLabel = formatRelative(skill.updatedAt || skill.createdAt)

  return (
    <div
      onClick={onOpen}
      className="ds-card group cursor-pointer relative hover:border-clauday-blue/40 transition-colors"
      style={{ padding: '12px 14px' }}
    >
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-[6px] flex-none flex items-center justify-center bg-clauday-blue/10">
          <Sparkles size={15} className="text-clauday-blue" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] font-semibold text-text-primary truncate">{skill.name}</span>
            {skill.isMine && (
              <span className="px-1.5 py-0.5 rounded-[4px] text-[9px] font-semibold bg-clauday-blue/15 text-clauday-blue border border-clauday-blue/30 flex-none">
                내 스킬
              </span>
            )}
          </div>
          {/* description — 2줄까지 */}
          {skill.description && (
            <div className="text-[11px] text-text-secondary mt-0.5 leading-relaxed line-clamp-2">
              {skill.description}
            </div>
          )}
          {/* 작성자 + 수정 시각 */}
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-1 text-[10px] text-text-tertiary">
              <User size={10} />
              <span className="truncate max-w-[100px]">{skill.authorName || '알 수 없음'}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-text-tertiary">
              <Clock size={10} />
              <span>{updatedLabel}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center mt-2.5 pt-2 border-t border-bg-border/60 gap-2">
        <div className="flex-1" />
        {/* 내 스킬이면 공유 해제 버튼 노출 */}
        {skill.isMine && onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            disabled={busy}
            className="flex items-center gap-1 text-[11px] text-text-tertiary hover:text-red-400 disabled:opacity-40 transition-colors"
            title="공유 해제 — 공유소에서 제거"
          >
            <Trash2 size={11} /> 공유 해제
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDownload() }}
          disabled={busy}
          className="flex items-center gap-1 text-[11px] text-clauday-blue hover:text-clauday-blue/80 font-medium disabled:opacity-40 transition-colors"
        >
          <Download size={11} /> 다운로드
        </button>
      </div>
    </div>
  )
}

export default SharedSkillCard
