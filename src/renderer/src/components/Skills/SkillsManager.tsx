import { useState, useEffect, useCallback } from 'react'
import { Plus, Save } from 'lucide-react'
import SkillCard from './SkillCard'
import SkillEditor from './SkillEditor'
import type { Skill } from '../../../../shared/types/skills'

function SkillsManager(): JSX.Element {
  const [skills, setSkills] = useState<Skill[]>([])
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)

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

  const handleCreate = (): void => {
    const name = prompt('Skill name (without .md):')
    if (!name?.trim()) return
    const newSkill: Skill = {
      name: name.trim(),
      filename: `${name.trim()}.md`,
      content: `# ${name.trim()}\n\nDescribe your skill here.\n`,
      updatedAt: Date.now()
    }
    setActiveSkill(newSkill)
    setEditorContent(newSkill.content)
    setIsDirty(true)
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

  const handleEditorChange = (value: string): void => {
    setEditorContent(value)
    setIsDirty(true)
  }

  return (
    <div className="flex h-full">
      {/* Skill list sidebar */}
      <div className="w-64 bg-bg-surface border-r border-bg-border flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-bg-border">
          <h2 className="text-sm font-semibold text-text-primary">Skills</h2>
          <button
            onClick={handleCreate}
            className="p-1.5 rounded hover:bg-bg-border text-text-secondary hover:text-clover-blue transition-colors"
            title="New Skill"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {skills.map((skill) => (
            <SkillCard
              key={skill.filename}
              skill={skill}
              isActive={activeSkill?.filename === skill.filename}
              onSelect={() => handleSelect(skill)}
              onDelete={() => handleDelete(skill)}
            />
          ))}
          {skills.length === 0 && (
            <p className="text-xs text-text-secondary text-center py-8">
              No skills found. Click + to create one.
            </p>
          )}
        </div>
      </div>

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
