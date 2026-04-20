import { FileText, Pencil, Trash2 } from 'lucide-react'
import type { Skill } from '../../../../shared/types/skills'

interface SkillCardProps {
  skill: Skill
  isActive: boolean
  usageCount?: number
  onSelect: () => void
  onDelete: () => void
}

function SkillCard({ skill, isActive, usageCount = 0, onSelect, onDelete }: SkillCardProps): JSX.Element {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors group ${
        isActive
          ? 'bg-clover-blue/10 border border-clover-blue/50'
          : 'hover:bg-bg-border border border-transparent'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <FileText size={16} className={isActive ? 'text-clover-blue' : 'text-text-secondary'} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{skill.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[10px] text-text-secondary">
              {new Date(skill.updatedAt).toLocaleDateString()}
            </p>
            {usageCount > 0 && (
              <span className="text-[9px] text-clover-blue/70 font-medium">{usageCount}회</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onSelect()
          }}
          className="p-1 rounded hover:bg-bg-surface text-text-secondary hover:text-clover-blue"
          title="Edit"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="p-1 rounded hover:bg-bg-surface text-text-secondary hover:text-red-400"
          title="Delete"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

export default SkillCard
