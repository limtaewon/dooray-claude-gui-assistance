import { useState, useEffect, useCallback } from 'react'
import {
  Zap, ToggleLeft, ToggleRight, Plus, Trash2, Edit3, Save, Sparkles, Loader2,
  FileText, Eye, Upload, Download, LayoutTemplate
} from 'lucide-react'
import type { CloverSkill, SkillTarget } from '../../../../shared/types/skill'
import { SKILL_TEMPLATES, type SkillTemplate } from '../../../../shared/types/skill-templates'

interface SkillQuickToggleProps {
  target: SkillTarget
}

type Mode = 'list' | 'edit' | 'ai-generate' | 'template' | 'preview'

function SkillQuickToggle({ target }: SkillQuickToggleProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [skills, setSkills] = useState<CloverSkill[]>([])
  const [mode, setMode] = useState<Mode>('list')
  const [editing, setEditing] = useState<CloverSkill | null>(null)

  // AI 생성
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [mcpServers, setMcpServers] = useState<string[]>([])
  const [selectedMcp, setSelectedMcp] = useState<Set<string>>(new Set())

  // MCP 서버 목록 로드 (AI 생성 모드 진입 시)
  useEffect(() => {
    if (mode !== 'ai-generate') return
    window.api.mcp.list()
      .then((servers) => setMcpServers(Object.keys(servers || {})))
      .catch(() => setMcpServers([]))
  }, [mode])

  const toggleMcp = (name: string): void => {
    setSelectedMcp((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const load = useCallback(async () => {
    const all = await window.api.cloverSkills.list()
    setSkills(all.filter((s) => s.target === target || s.target === 'all'))
  }, [target])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (open) load() }, [open, load])

  const close = (): void => {
    setOpen(false); setMode('list'); setEditing(null); setAiPrompt('')
  }

  const toggle = async (skill: CloverSkill): Promise<void> => {
    skill.enabled = !skill.enabled
    skill.updatedAt = new Date().toISOString()
    await window.api.cloverSkills.save(skill)
    window.api.analytics.track('skill.toggle', { meta: { target: skill.target, enabled: skill.enabled } })
    load()
  }

  const deleteSkill = async (id: string): Promise<void> => {
    const s = skills.find((x) => x.id === id)
    const label = s?.name || '이 스킬'
    if (!window.confirm(`"${label}" 스킬을 삭제할까요?\n삭제 후에는 복구할 수 없습니다.`)) return
    await window.api.cloverSkills.delete(id)
    window.api.analytics.track('skill.delete', { meta: { target } })
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

  const applyTemplate = (tpl: SkillTemplate): void => {
    setEditing({
      id: `skill-${Date.now()}`,
      name: tpl.name,
      description: tpl.description,
      target: tpl.target,
      enabled: true,
      content: tpl.content,
      autoApply: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    window.api.analytics.track('skill.template.apply', { meta: { target: tpl.target, templateId: tpl.id } })
    setMode('edit')
  }

  const saveSkill = async (): Promise<void> => {
    if (!editing || !editing.name.trim()) return
    const isNew = !skills.some((s) => s.id === editing.id)
    editing.updatedAt = new Date().toISOString()
    await window.api.cloverSkills.save(editing)
    window.api.analytics.track(isNew ? 'skill.create' : 'skill.update', { meta: { target: editing.target, source: 'manual' } })
    setEditing(null)
    setMode('list')
    load()
  }

  const handleAiGenerate = async (): Promise<void> => {
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    const mcpList = Array.from(selectedMcp)
    window.api.analytics.track('ai.skill.generate', { meta: { target, mcpCount: mcpList.length } })
    try {
      const result = await window.api.ai.generateSkill(aiPrompt.trim(), target, undefined, mcpList)
      setEditing({
        id: `skill-${Date.now()}`, name: result.name, description: result.description,
        target, enabled: true, content: result.content, autoApply: true,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      })
      window.api.analytics.track('skill.create', { meta: { target, source: 'ai' } })
      setMode('edit')
      setAiPrompt('')
      setSelectedMcp(new Set())
    } catch (err) {
      console.error('스킬 생성 실패:', err)
      alert(`스킬 생성 실패: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setAiLoading(false)
    }
  }

  // Export: JSON 파일로 다운로드
  const exportSkills = (): void => {
    const data = JSON.stringify(skills, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clauday-skills-${target}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    window.api.analytics.track('skill.export', { meta: { target, count: skills.length } })
  }

  // Import: JSON 파일 업로드
  const importSkills = async (file: File): Promise<void> => {
    try {
      const text = await file.text()
      const list = JSON.parse(text) as CloverSkill[]
      if (!Array.isArray(list)) throw new Error('배열 형식이 아님')
      for (const s of list) {
        const skill: CloverSkill = {
          ...s,
          id: `skill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          target: s.target || target,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        await window.api.cloverSkills.save(skill)
      }
      window.api.analytics.track('skill.import', { meta: { target, count: list.length } })
      load()
    } catch (err) {
      alert(`스킬 가져오기 실패: ${err instanceof Error ? err.message : ''}`)
    }
  }

  const activeCount = skills.filter((s) => s.enabled).length
  const templates = SKILL_TEMPLATES.filter((t) => t.target === target)

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
          <div className="absolute right-0 top-full mt-1.5 w-[460px] bg-bg-surface border border-bg-border rounded-xl shadow-2xl z-40 overflow-hidden">

            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-bg-border bg-bg-surface-hover">
              <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                <Zap size={12} className="text-amber-400" /> AI 스킬 <span className="text-[10px] text-text-tertiary">· {target}</span>
              </span>
              <div className="flex gap-1">
                {templates.length > 0 && (
                  <button onClick={() => setMode('template')}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                      mode === 'template' ? 'bg-emerald-500/30 text-emerald-300' : 'bg-bg-surface-hover text-emerald-300 hover:bg-bg-border'
                    }`} title="기본 템플릿에서 시작">
                    <LayoutTemplate size={10} /> 템플릿
                  </button>
                )}
                <button onClick={() => { setMode('ai-generate'); setEditing(null) }}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                    mode === 'ai-generate' ? 'bg-gradient-to-r from-orange-500/30 to-blue-500/30 text-clover-orange' : 'bg-bg-surface-hover text-clover-blue hover:bg-bg-border'
                  }`}>
                  <Sparkles size={10} /> AI 생성
                </button>
                <button onClick={() => startEdit()}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-bg-surface-hover text-clover-blue text-[10px] font-medium hover:bg-bg-border">
                  <Plus size={10} /> 직접
                </button>
              </div>
            </div>

            {/* 서브 툴바 (미리보기 / import / export) */}
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-bg-border bg-bg-primary">
              <button onClick={() => setMode('preview')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
                  mode === 'preview' ? 'bg-bg-surface-hover text-clover-blue' : 'text-text-tertiary hover:text-text-secondary'
                }`}>
                <Eye size={10} /> 미리보기
              </button>
              <button onClick={exportSkills} disabled={skills.length === 0}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-text-tertiary hover:text-text-secondary disabled:opacity-40">
                <Download size={10} /> 내보내기
              </button>
              <label className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-text-tertiary hover:text-text-secondary cursor-pointer">
                <Upload size={10} /> 가져오기
                <input type="file" accept="application/json" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) importSkills(f); e.target.value = '' }} />
              </label>
              <span className="ml-auto text-[9px] text-text-tertiary">총 {skills.length}개 · {activeCount} 활성</span>
            </div>

            {/* 템플릿 모드 */}
            {mode === 'template' && (
              <div className="max-h-64 overflow-y-auto">
                <div className="px-4 py-2 bg-emerald-500/5 border-b border-bg-border">
                  <p className="text-[10px] text-emerald-300 flex items-center gap-1">
                    <LayoutTemplate size={10} /> 템플릿을 선택하면 내용이 미리 채워집니다. 저장 전 수정 가능.
                  </p>
                </div>
                {templates.map((tpl) => (
                  <button key={tpl.id} onClick={() => applyTemplate(tpl)}
                    className="w-full text-left px-4 py-2.5 border-b border-bg-border last:border-0 hover:bg-bg-surface-hover transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-text-primary">{tpl.name}</p>
                        <p className="text-[10px] text-text-secondary mt-0.5">{tpl.description}</p>
                        {tpl.roles && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {tpl.roles.map((r) => (
                              <span key={r} className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">{r}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <Plus size={11} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                    </div>
                  </button>
                ))}
                {templates.length === 0 && (
                  <div className="px-4 py-6 text-center text-[10px] text-text-tertiary">이 영역에는 템플릿이 준비되지 않았습니다</div>
                )}
              </div>
            )}

            {/* 미리보기 모드 */}
            {mode === 'preview' && (
              <div className="max-h-64 overflow-y-auto p-3 bg-bg-primary">
                <div className="flex items-center gap-1 mb-2">
                  <Eye size={11} className="text-clover-blue" />
                  <span className="text-[10px] font-semibold text-clover-blue">AI에게 전달되는 system prompt</span>
                </div>
                {activeCount === 0 ? (
                  <p className="text-[10px] text-text-tertiary">활성화된 스킬이 없어 기본 프롬프트만 전달됩니다.</p>
                ) : (
                  <pre className="text-[10px] text-text-secondary font-mono whitespace-pre-wrap leading-relaxed">
[기본 규칙]{'\n'}
(해당 기능 기본 system prompt){'\n\n'}
---{'\n\n'}
[사용자 정의 규칙 — 반드시 준수]
{skills.filter((s) => s.enabled).map((s) => `\n### ${s.name}\n${s.content}`).join('\n\n')}
                  </pre>
                )}
                <button onClick={() => setMode('list')} className="mt-3 text-[10px] text-clover-blue hover:underline">← 목록으로</button>
              </div>
            )}

            {/* AI 스킬 생성 모드 */}
            {mode === 'ai-generate' && (
              <div className="p-4 border-b border-bg-border bg-gradient-to-b from-bg-surface-hover to-bg-surface">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles size={13} className="text-clover-orange" />
                  <span className="text-[11px] font-semibold text-clover-orange">AI 스킬 생성기</span>
                </div>
                <p className="text-[10px] text-text-secondary mb-3">
                  원하는 기능을 자연어로 설명하면 AI가 스킬을 만들어줍니다
                </p>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="예: 임태원과 FI 휴가 캘린더 일정만 브리핑해줘 (dooray-mcp 체크 → AI가 ID 조회해서 박아넣음)"
                  rows={3}
                  autoFocus
                  className="w-full px-3 py-2 bg-bg-primary border border-bg-border rounded-lg text-xs text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue resize-none mb-3"
                />

                {/* MCP 선택 — 스킬 생성 중 실시간 데이터 조회용 */}
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] font-semibold text-text-secondary">MCP 서버 활용 (선택)</span>
                    <span className="text-[9px] text-text-tertiary">선택한 MCP로 실제 ID·값을 조회해 스킬에 박아넣습니다</span>
                  </div>
                  {mcpServers.length === 0 ? (
                    <div className="px-2 py-1.5 rounded bg-bg-primary border border-bg-border text-[10px] text-text-tertiary">
                      등록된 MCP 서버가 없습니다 (MCP 탭에서 추가 가능)
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {mcpServers.map((name) => {
                        const checked = selectedMcp.has(name)
                        return (
                          <button key={name} onClick={() => toggleMcp(name)}
                            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border transition-colors ${
                              checked
                                ? 'bg-clover-blue/15 border-clover-blue/40 text-clover-blue font-medium'
                                : 'bg-bg-primary border-bg-border text-text-secondary hover:text-text-primary hover:border-bg-border-light'
                            }`}>
                            <span className={`w-3 h-3 rounded border flex items-center justify-center flex-shrink-0 ${
                              checked ? 'bg-clover-blue border-clover-blue' : 'border-bg-border-light'
                            }`}>
                              {checked && <span className="text-white text-[8px]">✓</span>}
                            </span>
                            {name}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {selectedMcp.size > 0 && (
                    <p className="text-[9px] text-clover-orange mt-1.5">
                      ⚠ MCP 조회는 시간이 더 걸려요 (30초~2분). 비용도 증가.
                    </p>
                  )}
                </div>

                <div className="flex justify-between items-center">
                  <button onClick={() => setMode('list')} className="text-[10px] text-text-tertiary hover:text-text-secondary">취소</button>
                  <button onClick={handleAiGenerate} disabled={!aiPrompt.trim() || aiLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-orange-500 to-blue-500 text-white text-[11px] font-medium hover:opacity-90 disabled:opacity-40">
                    {aiLoading
                      ? <><Loader2 size={11} className="animate-spin" /> {selectedMcp.size > 0 ? 'MCP 조회 중...' : '생성 중...'}</>
                      : <><Sparkles size={11} /> 스킬 생성{selectedMcp.size > 0 ? ` (MCP ${selectedMcp.size})` : ''}</>
                    }
                  </button>
                </div>
              </div>
            )}

            {/* 편집 모드 */}
            {mode === 'edit' && editing && (
              <div className="p-3 border-b border-bg-border bg-bg-surface-hover">
                <input type="text" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="스킬 이름" autoFocus
                  className="w-full px-2.5 py-1.5 bg-bg-primary border border-bg-border rounded-md text-xs text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue mb-2" />
                <input type="text" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="설명 (선택)"
                  className="w-full px-2.5 py-1.5 bg-bg-primary border border-bg-border rounded-md text-xs text-text-secondary placeholder-text-tertiary focus:outline-none focus:border-clover-blue mb-2" />
                <textarea value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                  placeholder={"## 규칙\n- 조건과 동작\n\n## 출력 형식\n- 결과 형태"}
                  rows={8}
                  className="w-full px-2.5 py-1.5 bg-bg-primary border border-bg-border rounded-md text-xs text-text-secondary placeholder-text-tertiary font-mono focus:outline-none focus:border-clover-blue resize-y mb-2" />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-[10px] text-text-secondary">
                    <input type="checkbox" checked={editing.autoApply} onChange={(e) => setEditing({ ...editing, autoApply: e.target.checked })} className="accent-blue-500" />
                    자동 적용
                  </label>
                  <div className="flex gap-1.5">
                    <button onClick={() => { setEditing(null); setMode('list') }} className="px-2.5 py-1 rounded-md text-[10px] text-text-secondary hover:text-text-primary border border-bg-border">취소</button>
                    <button onClick={saveSkill} disabled={!editing.name.trim()}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-500 text-white text-[10px] font-medium hover:bg-blue-600 disabled:opacity-40">
                      <Save size={10} /> 저장
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 스킬 목록 */}
            {(mode === 'list' || mode === 'edit') && (
              <div className="max-h-52 overflow-y-auto">
                {skills.length === 0 && mode === 'list' ? (
                  <div className="px-4 py-6 text-center">
                    <Zap size={24} className="text-text-tertiary mx-auto mb-2" />
                    <p className="text-[11px] text-text-secondary mb-2">등록된 스킬이 없습니다</p>
                    <div className="flex gap-1.5 justify-center">
                      {templates.length > 0 && (
                        <button onClick={() => setMode('template')}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-300 text-[10px] font-medium hover:bg-emerald-500/25">
                          <LayoutTemplate size={10} /> 템플릿으로 시작
                        </button>
                      )}
                      <button onClick={() => setMode('ai-generate')}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-gradient-to-r from-orange-500/20 to-blue-500/20 text-clover-orange text-[10px] font-medium hover:from-orange-500/30 hover:to-blue-500/30">
                        <Sparkles size={10} /> AI로 생성
                      </button>
                    </div>
                  </div>
                ) : (
                  skills.map((skill) => (
                    <div key={skill.id}
                      className={`flex items-center gap-2.5 px-4 py-2.5 border-b border-bg-border last:border-0 transition-colors ${
                        skill.enabled ? 'hover:bg-bg-surface-hover' : 'opacity-40 hover:bg-bg-surface-hover'
                      }`}>
                      <button onClick={() => toggle(skill)} className="flex-shrink-0" title={skill.enabled ? '비활성화' : '활성화'}>
                        {skill.enabled ? <ToggleRight size={20} className="text-emerald-400" /> : <ToggleLeft size={20} className="text-text-tertiary" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-text-primary truncate">{skill.name}</p>
                        {skill.description && <p className="text-[9px] text-text-tertiary truncate">{skill.description}</p>}
                      </div>
                      {skill.target === 'all' && (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-purple-500/15 text-purple-300 font-medium flex-shrink-0">전체</span>
                      )}
                      <button onClick={() => startEdit(skill)} className="p-1 rounded text-text-tertiary hover:text-text-secondary" title="편집"><Edit3 size={11} /></button>
                      <button onClick={() => deleteSkill(skill.id)} className="p-1 rounded text-text-tertiary hover:text-red-400" title="삭제"><Trash2 size={11} /></button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default SkillQuickToggle
