import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Check, FolderOpen, Star, ArrowUp, ArrowDown, Zap, Settings } from 'lucide-react'
import type { DoorayProject } from '../../../../shared/types/dooray'
import SkillManager from './SkillManager'

type SettingsTab = 'projects' | 'skills'

function SettingsView(): JSX.Element {
  const [activeTab, setActiveTab] = useState<SettingsTab>('projects')

  return (
    <div className="h-full flex flex-col">
      {/* 탭 */}
      <div className="flex items-center h-10 bg-bg-surface border-b border-bg-border px-4 gap-1 flex-shrink-0">
        <button onClick={() => setActiveTab('projects')}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-all ${
            activeTab === 'projects' ? 'bg-clover-blue/10 text-clover-blue' : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
          }`}>
          <Settings size={13} /> 프로젝트 설정
        </button>
        <button onClick={() => setActiveTab('skills')}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-all ${
            activeTab === 'skills' ? 'bg-gradient-to-r from-clover-orange/20 to-clover-blue/20 text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
          }`}>
          <Zap size={13} className={activeTab === 'skills' ? 'text-clover-orange' : ''} /> AI 스킬
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'projects' && <ProjectSettings />}
        {activeTab === 'skills' && <SkillManager />}
      </div>
    </div>
  )
}

function ProjectSettings(): JSX.Element {
  const [allProjects, setAllProjects] = useState<DoorayProject[]>([])
  const [pinnedIds, setPinnedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [projects, pinned] = await Promise.all([
        window.api.dooray.projects.list(),
        window.api.settings.getProjects()
      ])
      setAllProjects(projects)
      setPinnedIds(pinned)
    } catch (err) {
      console.error('설정 로드 실패:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const toggleProject = (projectId: string): void => {
    setPinnedIds((prev) => prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId])
    setSaved(false)
  }
  const selectAll = (): void => { setPinnedIds(allProjects.map((p) => p.id)); setSaved(false) }
  const deselectAll = (): void => { setPinnedIds([]); setSaved(false) }
  const moveProject = (index: number, direction: -1 | 1): void => {
    const ni = index + direction
    if (ni < 0 || ni >= pinnedIds.length) return
    const ids = [...pinnedIds]; const [m] = ids.splice(index, 1); ids.splice(ni, 0, m)
    setPinnedIds(ids); setSaved(false)
  }
  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try { await window.api.settings.setProjects(pinnedIds); setSaved(true); setTimeout(() => setSaved(false), 2000) }
    catch {} finally { setSaving(false) }
  }

  const pinnedProjects = pinnedIds.map((id) => allProjects.find((p) => p.id === id)).filter(Boolean) as DoorayProject[]
  const unpinnedProjects = allProjects.filter((p) => !pinnedIds.includes(p.id))

  if (loading) return <div className="flex items-center justify-center h-64 text-text-secondary text-sm gap-2"><RefreshCw size={14} className="animate-spin" /> 로딩 중...</div>

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-text-primary">표시할 프로젝트</h3>
        <p className="text-[10px] text-text-tertiary mt-0.5">선택한 프로젝트만 태스크/위키/캘린더에 표시됩니다</p>
      </div>

      <div className="bg-bg-surface border border-bg-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-bg-border">
          <span className="text-[10px] text-text-tertiary">{pinnedIds.length}/{allProjects.length} 선택</span>
          <div className="flex gap-2">
            <button onClick={selectAll} className="text-[10px] text-clover-blue hover:underline">전체 선택</button>
            <button onClick={deselectAll} className="text-[10px] text-text-secondary hover:underline">전체 해제</button>
          </div>
        </div>

        {pinnedProjects.length > 0 && (
          <div className="border-b border-bg-border">
            <div className="px-4 py-1 bg-clover-blue/5"><span className="text-[10px] font-semibold text-clover-blue uppercase tracking-wide">선택됨</span></div>
            {pinnedProjects.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-1.5 hover:bg-bg-surface-hover">
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button onClick={() => moveProject(i, -1)} disabled={i === 0} className="text-text-tertiary hover:text-text-secondary disabled:opacity-20"><ArrowUp size={9} /></button>
                  <button onClick={() => moveProject(i, 1)} disabled={i === pinnedProjects.length - 1} className="text-text-tertiary hover:text-text-secondary disabled:opacity-20"><ArrowDown size={9} /></button>
                </div>
                <button onClick={() => toggleProject(p.id)} className="w-4 h-4 rounded border bg-clover-blue border-clover-blue flex items-center justify-center flex-shrink-0"><Check size={10} className="text-white" /></button>
                <FolderOpen size={13} className="text-clover-blue flex-shrink-0" />
                <span className="text-xs font-medium text-text-primary">{p.code}</span>
              </div>
            ))}
          </div>
        )}

        {unpinnedProjects.length > 0 && (
          <div>
            <div className="px-4 py-1 bg-bg-primary"><span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wide">미선택</span></div>
            {unpinnedProjects.map((p) => (
              <div key={p.id} onClick={() => toggleProject(p.id)} className="flex items-center gap-3 px-4 py-1.5 hover:bg-bg-surface-hover cursor-pointer">
                <div className="w-4 h-0 flex-shrink-0" />
                <button className="w-4 h-4 rounded border border-bg-border-light flex-shrink-0 hover:border-clover-blue" />
                <FolderOpen size={13} className="text-text-tertiary flex-shrink-0" />
                <span className="text-xs text-text-secondary">{p.code}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        {saved && <span className="flex items-center gap-1 text-xs text-emerald-400"><Check size={12} /> 저장됨</span>}
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2 rounded-lg bg-clover-blue text-white text-sm font-medium hover:bg-clover-blue/80 disabled:opacity-50">
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  )
}

export default SettingsView
