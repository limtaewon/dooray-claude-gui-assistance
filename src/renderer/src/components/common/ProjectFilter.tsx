import { useState, useEffect, useCallback, useRef } from 'react'
import { Settings, Check, FolderOpen, Search, X } from 'lucide-react'
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
  const [pinnedIds, setPinnedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const items = useWikiDomains
        ? (await window.api.dooray.wiki.domains()).map((d) => ({ id: d.id, code: d.name } as DoorayProject))
        : await window.api.dooray.projects.list()
      const pinned = (await window.api.settings.get(settingsKey) as string[]) || []
      setAllProjects(items)
      setPinnedIds(pinned)
    } catch {} finally { setLoading(false) }
  }, [settingsKey, useWikiDomains])

  useEffect(() => {
    if (open) {
      load()
      setSearchQuery('')
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [open, load])

  const toggle = async (id: string): Promise<void> => {
    const next = pinnedIds.includes(id) ? pinnedIds.filter((p) => p !== id) : [...pinnedIds, id]
    setPinnedIds(next)
    await window.api.settings.set(settingsKey, next)
    onChanged?.()
  }

  const pinnedCount = pinnedIds.length

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
          <div className="absolute left-0 top-full mt-1 w-64 bg-[#151c2c] border border-[#2d3a52] rounded-xl shadow-2xl z-40 overflow-hidden">
            <div className="px-3 py-2 border-b border-[#2d3a52] bg-[#1a2238]">
              <span className="text-[11px] font-semibold text-gray-100">표시할 프로젝트 선택</span>
              <span className="text-[9px] text-gray-500 ml-2">{pinnedCount > 0 ? `${pinnedCount}개 선택` : '전체 표시'}</span>
            </div>
            <div className="px-2 py-1.5 border-b border-[#2d3a52]">
              <div className="relative">
                <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="프로젝트 검색..."
                  className="w-full pl-6 pr-6 py-1 bg-[#0d1321] border border-[#2d3a52] rounded text-[11px] text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {loading ? (
                <div className="text-[10px] text-gray-500 text-center py-4">로딩...</div>
              ) : allProjects.filter((p) => !searchQuery || p.code.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                <div className="text-[10px] text-gray-500 text-center py-4">검색 결과 없음</div>
              ) : allProjects.filter((p) => !searchQuery || p.code.toLowerCase().includes(searchQuery.toLowerCase())).map((p) => {
                const checked = pinnedIds.includes(p.id)
                return (
                  <button key={p.id} onClick={() => toggle(p.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#1e2840] transition-colors text-left">
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                      checked ? 'bg-blue-500 border-blue-500' : 'border-gray-600'
                    }`}>
                      {checked && <Check size={9} className="text-white" />}
                    </div>
                    <FolderOpen size={11} className={checked ? 'text-blue-400' : 'text-gray-500'} />
                    <span className={`text-[11px] truncate ${checked ? 'text-gray-100' : 'text-gray-400'}`}>{p.code}</span>
                  </button>
                )
              })}
            </div>
            <div className="px-3 py-1.5 border-t border-[#2d3a52] text-[9px] text-gray-500">
              선택 없으면 전체 표시 · 변경 즉시 반영
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default ProjectFilter
