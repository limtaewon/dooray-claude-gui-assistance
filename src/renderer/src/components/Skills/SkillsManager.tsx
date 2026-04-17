import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Save, Sparkles, Search, X } from 'lucide-react'
import SkillCard from './SkillCard'
import SkillEditor from './SkillEditor'
import SkillCreateModal from './SkillCreateModal'
import type { Skill } from '../../../../shared/types/skills'

function SkillsManager(): JSX.Element {
  const [skills, setSkills] = useState<Skill[]>([])
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')

  const loadSkills = useCallback(async () => {
    try {
      const list = await window.api.skills.list()
      setSkills(list)
    } catch (err) {
      console.error('Failed to load skills:', err)
    }
  }, [])

  useEffect(() => {
    loadSkills()
    const cleanup = window.api.onConfigChanged(() => {
      loadSkills()
    })
    return cleanup
  }, [loadSkills])

  const handleSelect = (skill: Skill): void => {
    setActiveSkill(skill)
    setEditorContent(skill.content)
    setIsDirty(false)
  }

  const handleCreated = async (skill: Skill): Promise<void> => {
    setCreating(false)
    setActiveSkill(skill)
    setEditorContent(skill.content)
    setIsDirty(false)
    await loadSkills()
  }

  const handleSave = async (): Promise<void> => {
    if (!activeSkill) return
    try {
      await window.api.skills.save({
        filename: activeSkill.filename,
        content: editorContent
      })
      setIsDirty(false)
      await loadSkills()
    } catch (err) {
      console.error('Failed to save skill:', err)
    }
  }

  const handleDelete = async (skill: Skill): Promise<void> => {
    const ok = window.confirm(`"${skill.name}" 스킬을 삭제할까요?\n삭제 후에는 복구할 수 없습니다.`)
    if (!ok) return
    try {
      await window.api.skills.delete(skill.filename)
      if (activeSkill?.filename === skill.filename) {
        setActiveSkill(null)
        setEditorContent('')
      }
      await loadSkills()
    } catch (err) {
      console.error('Failed to delete skill:', err)
    }
  }

  const filteredSkills = useMemo(() => {
    if (!search.trim()) return skills
    const q = search.toLowerCase()
    return skills.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.filename.toLowerCase().includes(q) ||
      s.content.toLowerCase().includes(q)
    )
  }, [skills, search])

  const handleEditorChange = (value: string): void => {
    setEditorContent(value)
    setIsDirty(true)
  }

  return (
    <div className="flex h-full">
      {/* Skill list sidebar */}
      <div className="w-64 bg-bg-surface border-r border-bg-border flex flex-col">
        <div className="p-3 border-b border-bg-border space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Skills</h2>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-text-tertiary">
                {search ? `${filteredSkills.length}/${skills.length}` : skills.length}
              </span>
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-gradient-to-r from-clover-orange/15 to-clover-blue/15 text-clover-blue border border-clover-blue/25 hover:from-clover-orange/25 hover:to-clover-blue/25 transition-colors"
                title="새 스킬 (AI 또는 직접)"
              >
                <Sparkles size={11} />
                <Plus size={12} />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름·내용 검색..."
              className="w-full pl-7 pr-7 py-1.5 rounded-lg text-xs bg-bg-subtle border border-bg-border text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue"
            />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary">
                <X size={11} />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredSkills.map((skill) => (
            <SkillCard
              key={skill.filename}
              skill={skill}
              isActive={activeSkill?.filename === skill.filename}
              onSelect={() => handleSelect(skill)}
              onDelete={() => handleDelete(skill)}
            />
          ))}
          {skills.length === 0 ? (
            <p className="text-xs text-text-secondary text-center py-8">
              스킬이 없습니다. 우측 상단 + 버튼을 눌러 만들어보세요.
            </p>
          ) : filteredSkills.length === 0 ? (
            <p className="text-xs text-text-tertiary text-center py-8">
              &quot;{search}&quot;에 일치하는 스킬이 없습니다
            </p>
          ) : null}
        </div>
      </div>

      {creating && (
        <SkillCreateModal onClose={() => setCreating(false)} onCreated={handleCreated} />
      )}

      {/* Editor area */}
      <div className="flex-1 flex flex-col">
        {activeSkill ? (
          <>
            <div className="flex items-center justify-between px-4 h-10 border-b border-bg-border">
              <span className="text-sm text-text-primary font-medium">{activeSkill.name}</span>
              <button
                onClick={handleSave}
                disabled={!isDirty}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs transition-colors ${
                  isDirty
                    ? 'bg-clover-blue text-white hover:bg-clover-blue/80'
                    : 'bg-bg-border text-text-secondary cursor-not-allowed'
                }`}
              >
                <Save size={12} />
                Save
              </button>
            </div>
            <div className="flex-1">
              <SkillEditor
                filename={activeSkill.filename}
                content={editorContent}
                onChange={handleEditorChange}
              />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm">
            Select a skill to edit or create a new one
          </div>
        )}
      </div>
    </div>
  )
}

export default SkillsManager
