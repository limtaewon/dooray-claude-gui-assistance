import { useState, useEffect, useCallback } from 'react'
import { Zap, ToggleLeft, ToggleRight, Plus, Trash2, Edit3, Save, Sparkles, Loader2 } from 'lucide-react'
import type { CloverSkill, SkillTarget } from '../../../../shared/types/skill'

interface SkillQuickToggleProps {
  target: SkillTarget
}

type Mode = 'list' | 'edit' | 'ai-generate'

function SkillQuickToggle({ target }: SkillQuickToggleProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [skills, setSkills] = useState<CloverSkill[]>([])
  const [mode, setMode] = useState<Mode>('list')
  const [editing, setEditing] = useState<CloverSkill | null>(null)

  // AI 생성
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  const load = useCallback(async () => {
    const all = await window.api.cloverSkills.list()
    setSkills(all.filter((s) => s.target === target || s.target === 'all'))
  }, [target])

  // 마운트 시 바로 로드 (버튼에 개수 표시용)
  useEffect(() => { load() }, [load])
  // 팝오버 열 때도 갱신
  useEffect(() => { if (open) load() }, [open, load])

  const close = (): void => { setOpen(false); setMode('list'); setEditing(null); setAiPrompt('') }

  const toggle = async (skill: CloverSkill): Promise<void> => {
    skill.enabled = !skill.enabled
    skill.updatedAt = new Date().toISOString()
    await window.api.cloverSkills.save(skill)
    load()
  }

  const deleteSkill = async (id: string): Promise<void> => {
    await window.api.cloverSkills.delete(id)
    load()
  }

  const startEdit = (skill?: CloverSkill): void => {
    setEditing(skill || {
      id: `skill-${Date.now()}`, name: '', description: '', target,
      enabled: true, content: '', autoApply: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    })
    setMode('edit')
  }

  const saveSkill = async (): Promise<void> => {
    if (!editing || !editing.name.trim()) return
    editing.updatedAt = new Date().toISOString()
    await window.api.cloverSkills.save(editing)
    setEditing(null)
    setMode('list')
    load()
  }

  const handleAiGenerate = async (): Promise<void> => {
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    try {
      const result = await window.api.ai.generateSkill(aiPrompt.trim(), target)
      setEditing({
        id: `skill-${Date.now()}`, name: result.name, description: result.description,
        target, enabled: true, content: result.content, autoApply: true,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      })
      setMode('edit')
      setAiPrompt('')
    } catch (err) {
      console.error('스킬 생성 실패:', err)
    } finally {
      setAiLoading(false)
    }
  }

  const activeCount = skills.filter((s) => s.enabled).length

  return (
    <div className="relative">
      <button onClick={() => open ? close() : setOpen(true)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
          activeCount > 0
            ? 'bg-amber-500/15 border-amber-400/40 text-amber-300 hover:bg-amber-500/25'
            : 'bg-bg-surface border-bg-border text-text-secondary hover:text-text-primary hover:border-bg-border-light'
        }`}>
        <Zap size={12} className={activeCount > 0 ? 'text-amber-400' : ''} />
        스킬{activeCount > 0 ? ` ${activeCount}` : ''}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={close} />
          <div className="absolute right-0 top-full mt-1.5 w-[420px] bg-[#151c2c] border border-[#2d3a52] rounded-xl shadow-2xl z-40 overflow-hidden">

            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2d3a52] bg-[#1a2238]">
              <span className="text-xs font-semibold text-gray-100 flex items-center gap-1.5">
                <Zap size={12} className="text-amber-400" /> AI 스킬
              </span>
              <div className="flex gap-1">
                <button onClick={() => { setMode('ai-generate'); setEditing(null) }}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                    mode === 'ai-generate' ? 'bg-gradient-to-r from-orange-500/30 to-blue-500/30 text-orange-300' : 'bg-[#253050] text-blue-300 hover:bg-[#2a3860]'
                  }`}>
                  <Sparkles size={10} /> AI로 생성
                </button>
                <button onClick={() => startEdit()}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#253050] text-blue-300 text-[10px] font-medium hover:bg-[#2a3860]">
                  <Plus size={10} /> 직접 작성
                </button>
              </div>
            </div>

            {/* AI 스킬 생성 모드 */}
            {mode === 'ai-generate' && (
              <div className="p-4 border-b border-[#2d3a52] bg-gradient-to-b from-[#1a2040] to-[#151c2c]">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles size={13} className="text-orange-400" />
                  <span className="text-[11px] font-semibold text-orange-300">AI 스킬 생성기</span>
                </div>
                <p className="text-[10px] text-gray-400 mb-3">
                  원하는 기능을 자연어로 설명하면 AI가 스킬을 만들어줍니다
                </p>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="예: 배포 프로젝트에서 마일스톤이 현재 주차인데 NEON에 내 태스크가 없으면 알려줘"
                  rows={3}
                  autoFocus
                  className="w-full px-3 py-2 bg-[#0d1320] border border-[#2d3a52] rounded-lg text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-400 resize-none mb-2"
                />
                <div className="flex justify-between items-center">
                  <button onClick={() => setMode('list')} className="text-[10px] text-gray-500 hover:text-gray-300">취소</button>
                  <button onClick={handleAiGenerate} disabled={!aiPrompt.trim() || aiLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-orange-500 to-blue-500 text-white text-[11px] font-medium hover:opacity-90 disabled:opacity-40">
                    {aiLoading ? <><Loader2 size={11} className="animate-spin" /> 생성 중...</> : <><Sparkles size={11} /> 스킬 생성</>}
                  </button>
                </div>
              </div>
            )}

            {/* 편집 모드 */}
            {mode === 'edit' && editing && (
              <div className="p-3 border-b border-[#2d3a52] bg-[#1a2238]">
                <input type="text" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="스킬 이름" autoFocus
                  className="w-full px-2.5 py-1.5 bg-[#0d1320] border border-[#2d3a52] rounded-md text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-400 mb-2" />
                <input type="text" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="설명 (선택)"
                  className="w-full px-2.5 py-1.5 bg-[#0d1320] border border-[#2d3a52] rounded-md text-xs text-gray-300 placeholder-gray-500 focus:outline-none focus:border-blue-400 mb-2" />
                <textarea value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                  placeholder={"## 규칙\n- 조건과 동작\n\n## 출력 형식\n- 결과 형태"}
                  rows={8}
                  className="w-full px-2.5 py-1.5 bg-[#0d1320] border border-[#2d3a52] rounded-md text-xs text-gray-300 placeholder-gray-500 font-mono focus:outline-none focus:border-blue-400 resize-y mb-2" />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-[10px] text-gray-400">
                    <input type="checkbox" checked={editing.autoApply} onChange={(e) => setEditing({ ...editing, autoApply: e.target.checked })} className="accent-blue-500" />
                    자동 적용
                  </label>
                  <div className="flex gap-1.5">
                    <button onClick={() => { setEditing(null); setMode('list') }} className="px-2.5 py-1 rounded-md text-[10px] text-gray-400 hover:text-gray-200 border border-[#2d3a52]">취소</button>
                    <button onClick={saveSkill} disabled={!editing.name.trim()}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-500 text-white text-[10px] font-medium hover:bg-blue-600 disabled:opacity-40">
                      <Save size={10} /> 저장
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 스킬 목록 */}
            <div className="max-h-52 overflow-y-auto">
              {skills.length === 0 && mode === 'list' ? (
                <div className="px-4 py-6 text-center">
                  <Zap size={24} className="text-gray-600 mx-auto mb-2" />
                  <p className="text-[11px] text-gray-400 mb-1">등록된 스킬이 없습니다</p>
                  <button onClick={() => setMode('ai-generate')} className="text-[10px] text-orange-400 hover:underline">
                    AI로 스킬 만들기
                  </button>
                </div>
              ) : (
                skills.map((skill) => (
                  <div key={skill.id}
                    className={`flex items-center gap-2.5 px-4 py-2.5 border-b border-[#1e2a42] last:border-0 transition-colors ${
                      skill.enabled ? 'hover:bg-[#1a2540]' : 'opacity-40 hover:bg-[#1a2540]'
                    }`}>
                    <button onClick={() => toggle(skill)} className="flex-shrink-0">
                      {skill.enabled ? <ToggleRight size={20} className="text-emerald-400" /> : <ToggleLeft size={20} className="text-gray-600" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-gray-100 truncate">{skill.name}</p>
                      {skill.description && <p className="text-[9px] text-gray-500 truncate">{skill.description}</p>}
                    </div>
                    <button onClick={() => startEdit(skill)} className="p-1 rounded text-gray-500 hover:text-gray-300"><Edit3 size={11} /></button>
                    <button onClick={() => deleteSkill(skill.id)} className="p-1 rounded text-gray-500 hover:text-red-400"><Trash2 size={11} /></button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default SkillQuickToggle
