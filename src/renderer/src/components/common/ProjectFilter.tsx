import { useState, useEffect, useCallback, useRef } from 'react'
import { Settings, Check, FolderOpen, Search, X, Plus, Link, Trash2 } from 'lucide-react'
import type { DoorayProject } from '../../../../shared/types/dooray'

interface ProjectFilterProps {
  /** 설정 키 (기본: pinnedProjects) - 태스크/위키 분리용 */
  settingsKey?: string
  /** 프로젝트 목록 대신 위키 도메인 목록을 사용할지 */
  useWikiDomains?: boolean
  onChanged?: () => void
}

function ProjectFilter({ settingsKey = 'pinnedProjects', useWikiDomains = false, onChanged }: ProjectFilterProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [allProjects, setAllProjects] = useState<DoorayProject[]>([])
  const [customProjects, setCustomProjects] = useState<DoorayProject[]>([])
  const [pinnedIds, setPinnedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 수동 추가 상태
  const [showAddForm, setShowAddForm] = useState(false)
  const [addInput, setAddInput] = useState('')
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const items = useWikiDomains
        ? (await window.api.dooray.wiki.domains()).map((d) => ({ id: d.id, code: d.name } as DoorayProject))
        : await window.api.dooray.projects.list()
      const pinned = (await window.api.settings.get(settingsKey) as string[]) || []
      const custom = (await window.api.settings.get('customProjects') as DoorayProject[]) || []
      setAllProjects(items)
      setCustomProjects(custom)
      setPinnedIds(pinned)
    } catch { /* ok */ }
    finally { setLoading(false) }
  }, [settingsKey, useWikiDomains])

  useEffect(() => {
    if (open) {
      load()
      setSearchQuery('')
      setShowAddForm(false)
      setAddError('')
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [open, load])

  const toggle = async (id: string): Promise<void> => {
    const next = pinnedIds.includes(id) ? pinnedIds.filter((p) => p !== id) : [...pinnedIds, id]
    setPinnedIds(next)
    await window.api.settings.set(settingsKey, next)
    onChanged?.()
  }

  // 프로젝트 ID 또는 URL에서 ID 추출
  const extractProjectId = (input: string): string => {
    const trimmed = input.trim()
    // URL 형태: https://nhnent.dooray.com/task/3787724725029315943/...
    const urlMatch = trimmed.match(/\/task\/(\d+)/)
    if (urlMatch) return urlMatch[1]
    // 순수 숫자 ID
    if (/^\d+$/.test(trimmed)) return trimmed
    return trimmed
  }

  const handleAddProject = async (): Promise<void> => {
    if (!addInput.trim()) return
    setAdding(true)
    setAddError('')
    try {
      const projectId = extractProjectId(addInput)
      const allIds = new Set([...allProjects.map((p) => p.id), ...customProjects.map((p) => p.id)])
      if (allIds.has(projectId)) {
        setAddError('이미 목록에 있는 프로젝트입니다')
        return
      }
      const project = await window.api.dooray.projects.info(projectId)
      const nextCustom = [...customProjects, { id: project.id, code: project.code } as DoorayProject]
      setCustomProjects(nextCustom)
      await window.api.settings.set('customProjects', nextCustom)
      setAddInput('')
      setShowAddForm(false)
      onChanged?.()
    } catch {
      setAddError('프로젝트를 찾을 수 없습니다')
    } finally {
      setAdding(false)
    }
  }

  const removeCustomProject = async (id: string): Promise<void> => {
    const nextCustom = customProjects.filter((p) => p.id !== id)
    setCustomProjects(nextCustom)
    await window.api.settings.set('customProjects', nextCustom)
    if (pinnedIds.includes(id)) {
      const nextPinned = pinnedIds.filter((p) => p !== id)
      setPinnedIds(nextPinned)
      await window.api.settings.set(settingsKey, nextPinned)
    }
    onChanged?.()
  }

  const pinnedCount = pinnedIds.length
  const customIds = new Set(customProjects.map((p) => p.id))
  // API 프로젝트 + 수동 프로젝트 병합 (중복 제거)
  const mergedProjects = [...allProjects]
  for (const cp of customProjects) {
    if (!allProjects.some((p) => p.id === cp.id)) mergedProjects.push(cp)
  }
  const filtered = mergedProjects.filter((p) =>
    !searchQuery || p.code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className={`p-1 rounded hover:bg-bg-surface-hover transition-colors ${pinnedCount > 0 ? 'text-clover-blue' : 'text-text-tertiary'}`}
        title="표시할 프로젝트 설정">
        <Settings size={12} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 w-72 bg-bg-surface border border-bg-border rounded-xl shadow-2xl z-40 overflow-hidden">
            <div className="px-3 py-2 border-b border-bg-border bg-bg-surface-hover">
              <span className="text-[11px] font-semibold text-text-primary">표시할 프로젝트 선택</span>
              <span className="text-[9px] text-text-tertiary ml-2">{pinnedCount > 0 ? `${pinnedCount}개 선택` : '전체 표시'}</span>
            </div>
            {/* 검색 */}
            <div className="px-2 py-1.5 border-b border-bg-border">
              <div className="relative">
                <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="프로젝트 검색..."
                  className="w-full pl-6 pr-6 py-1 bg-bg-primary border border-bg-border rounded text-[11px] text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary">
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
            {/* 프로젝트 목록 */}
            <div className="max-h-72 overflow-y-auto py-1">
              {loading ? (
                <div className="text-[10px] text-text-tertiary text-center py-4">로딩...</div>
              ) : filtered.length === 0 ? (
                <div className="text-[10px] text-text-tertiary text-center py-4">검색 결과 없음</div>
              ) : filtered.map((p) => {
                const checked = pinnedIds.includes(p.id)
                const isCustom = customIds.has(p.id)
                return (
                  <div key={p.id} className="flex items-center group">
                    <button onClick={() => toggle(p.id)}
                      className="flex-1 flex items-center gap-2 px-3 py-1.5 hover:bg-bg-surface-hover transition-colors text-left">
                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                        checked ? 'bg-blue-500 border-blue-500' : 'border-gray-600'
                      }`}>
                        {checked && <Check size={9} className="text-white" />}
                      </div>
                      {isCustom ? (
                        <Link size={11} className={`flex-shrink-0 ${checked ? 'text-amber-400' : 'text-amber-600'}`} />
                      ) : (
                        <FolderOpen size={11} className={`flex-shrink-0 ${checked ? 'text-blue-400' : 'text-text-tertiary'}`} />
                      )}
                      <span className={`text-[11px] truncate min-w-0 ${checked ? 'text-text-primary' : 'text-gray-400'}`}>{p.code}</span>
                    </button>
                    {isCustom && (
                      <button onClick={() => removeCustomProject(p.id)}
                        className="px-1.5 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                        title="수동 추가 프로젝트 제거">
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            {/* 수동 추가 */}
            <div className="border-t border-bg-border">
              {showAddForm ? (
                <div className="px-2 py-2 space-y-1.5">
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={addInput}
                      onChange={(e) => { setAddInput(e.target.value); setAddError('') }}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddProject()}
                      placeholder="프로젝트 ID 또는 URL"
                      className="flex-1 px-2 py-1 bg-bg-primary border border-bg-border rounded text-[11px] text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue"
                      autoFocus
                    />
                    <button onClick={handleAddProject} disabled={adding || !addInput.trim()}
                      className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-text-tertiary rounded text-[10px] text-white transition-colors">
                      {adding ? '...' : '추가'}
                    </button>
                  </div>
                  {addError && <div className="text-[9px] text-red-400 px-1">{addError}</div>}
                  <div className="text-[9px] text-gray-600 px-1">예: 3787724725029315943 또는 Dooray URL</div>
                </div>
              ) : (
                <button onClick={() => setShowAddForm(true)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-text-tertiary hover:text-text-secondary hover:bg-bg-surface-hover transition-colors">
                  <Plus size={10} />
                  프로젝트 수동 추가 (ID/URL)
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default ProjectFilter
