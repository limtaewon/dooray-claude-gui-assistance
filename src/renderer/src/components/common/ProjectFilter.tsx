import { useState, useEffect, useCallback } from 'react'
import { Settings, Check, FolderOpen } from 'lucide-react'
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

  useEffect(() => { if (open) load() }, [open, load])

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
            <div className="max-h-72 overflow-y-auto py-1">
              {loading ? (
                <div className="text-[10px] text-gray-500 text-center py-4">로딩...</div>
              ) : allProjects.map((p) => {
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
