import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Settings, Check, ChevronRight, FolderOpen, Search, X, Plus, Link, Trash2 } from 'lucide-react'
import type { DoorayProject } from '../../../../shared/types/dooray'
import { anchoredMenuPosition, type AnchoredMenuPosition } from './anchoredMenu'

interface ProjectFilterProps {
  /** 설정 키 (기본: pinnedProjects) - 태스크/위키 분리용 */
  settingsKey?: string
  /** 하단에 '설정에서 프로젝트별 규칙 정하기' 링크를 보일지 (업무 목록에서만 의미가 있다) */
  showSettingsLink?: boolean
  /** 프로젝트 목록 대신 위키 도메인 목록을 사용할지 */
  useWikiDomains?: boolean
  onChanged?: () => void
}

function ProjectFilter({
  settingsKey = 'pinnedProjects',
  useWikiDomains = false,
  showSettingsLink = false,
  onChanged
}: ProjectFilterProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [allProjects, setAllProjects] = useState<DoorayProject[]>([])
  const [customProjects, setCustomProjects] = useState<DoorayProject[]>([])
  const [pinnedIds, setPinnedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)
  /** 메뉴를 body 포털로 띄운다 — 작업 패널(320px) 안에 두면 잘리고 레이아웃을 밀어 덜컹거린다. */
  const [menuPos, setMenuPos] = useState<AnchoredMenuPosition | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null)
      return
    }
    const place = (): void => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (!rect) return
      setMenuPos(
        anchoredMenuPosition(rect, { width: 288 }, { width: window.innerWidth, height: window.innerHeight })
      )
    }
    place()
    window.addEventListener('resize', place)
    // 스크롤로 앵커가 움직이면 위치가 어긋난다 — 캡처 단계로 모든 스크롤 컨테이너를 잡는다.
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  // 수동 추가 상태
  const [showAddForm, setShowAddForm] = useState(false)
  const [addInput, setAddInput] = useState('')
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)

  // 위키/태스크 각각 별도 커스텀 저장소 사용
  const customKey = useWikiDomains ? 'customWikis' : 'customProjects'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const items = useWikiDomains
        ? (await window.api.dooray.wiki.domains()).map((d) => ({ id: d.id, code: d.name } as DoorayProject))
        : await window.api.dooray.projects.list()
      const pinned = (await window.api.settings.get(settingsKey) as string[]) || []
      const custom = (await window.api.settings.get(customKey) as DoorayProject[]) || []
      setAllProjects(items)
      setCustomProjects(custom)
      // 현재 목록에 없는 stale pinned 는 자동 제거
      const validIds = new Set<string>([...items.map((i) => i.id), ...custom.map((c) => c.id)])
      const cleaned = pinned.filter((id) => validIds.has(id))
      setPinnedIds(cleaned)
      if (cleaned.length !== pinned.length) {
        await window.api.settings.set(settingsKey, cleaned)
      }
    } catch { /* ok */ }
    finally { setLoading(false) }
  }, [settingsKey, useWikiDomains, customKey])

  // 배지는 열어보기 전에도 보여야 한다 — 몇 개를 고른 상태인지가 버튼의 정보다.
  useEffect(() => {
    void load()
  }, [load])

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
      await window.api.settings.set(customKey, nextCustom)
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
    await window.api.settings.set(customKey, nextCustom)
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
      <button
      data-tour="dooray-project-filter" ref={anchorRef} onClick={() => setOpen(!open)}
        className="ds-btn secondary sm"
        title="표시할 프로젝트 선택">
        <Settings size={13} />
        프로젝트 선택
        {pinnedCount > 0 && (
          <span className="ml-0.5 px-1.5 rounded-full bg-brand-dooray text-white text-[calc(9px_*_var(--app-font-scale,1))] font-semibold">
            {pinnedCount}
          </span>
        )}
      </button>

      {open && menuPos && createPortal(
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[71] bg-bg-surface border border-bg-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
            style={{
              left: menuPos.left,
              top: menuPos.top,
              width: menuPos.width,
              maxHeight: menuPos.maxHeight
            }}
          >
            <div className="px-3 py-2 border-b border-bg-border bg-bg-surface-hover">
              <span className="text-[calc(11px_*_var(--app-font-scale,1))] font-semibold text-text-primary">표시할 프로젝트 선택</span>
              <span className="text-[calc(9px_*_var(--app-font-scale,1))] text-text-tertiary ml-2">{pinnedCount > 0 ? `${pinnedCount}개 선택` : '전체 표시'}</span>
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
                  className="w-full pl-6 pr-6 py-1 bg-bg-primary border border-bg-border rounded text-[calc(11px_*_var(--app-font-scale,1))] text-text-primary placeholder-text-tertiary focus:outline-none focus:border-bg-border-strong"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary">
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
            {/* 프로젝트 목록 */}
            <div className="flex-1 min-h-0 overflow-y-auto py-1">
              {loading ? (
                <div className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary text-center py-4">로딩...</div>
              ) : filtered.length === 0 ? (
                <div className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary text-center py-4">검색 결과 없음</div>
              ) : filtered.map((p) => {
                const checked = pinnedIds.includes(p.id)
                const isCustom = customIds.has(p.id)
                return (
                  <div key={p.id} className="flex items-center group">
                    <button onClick={() => toggle(p.id)}
                      className="flex-1 flex items-center gap-2 px-3 py-1.5 hover:bg-bg-surface-hover transition-colors text-left">
                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                        checked
                          ? 'bg-brand-dooray border-brand-dooray'
                          : 'border-bg-border-strong'
                      }`}>
                        {checked && <Check size={9} className="text-white" strokeWidth={3} />}
                      </div>
                      {isCustom ? (
                        <Link size={11} className={`flex-shrink-0 ${checked ? 'text-brand-dooray' : 'text-text-tertiary'}`} />
                      ) : (
                        <FolderOpen size={11} className={`flex-shrink-0 ${checked ? 'text-text-primary' : 'text-text-tertiary'}`} />
                      )}
                      <span className={`text-[calc(11px_*_var(--app-font-scale,1))] truncate min-w-0 ${checked ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>{p.code}</span>
                    </button>
                    {isCustom && (
                      <button onClick={() => removeCustomProject(p.id)}
                        className="px-1.5 opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-red-400 transition-all"
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
                      className="flex-1 px-2 py-1 bg-bg-primary border border-bg-border rounded text-[calc(11px_*_var(--app-font-scale,1))] text-text-primary placeholder-text-tertiary focus:outline-none focus:border-bg-border-strong"
                      autoFocus
                    />
                    <button onClick={handleAddProject} disabled={adding || !addInput.trim()}
                      className="ds-btn primary xs">
                      {adding ? '...' : '추가'}
                    </button>
                  </div>
                  {addError && <div className="text-[calc(9px_*_var(--app-font-scale,1))] text-red-400 px-1">{addError}</div>}
                  <div className="text-[calc(9px_*_var(--app-font-scale,1))] text-text-tertiary px-1">예: 3787724725029315943 또는 Dooray URL</div>
                </div>
              ) : (
                <button onClick={() => setShowAddForm(true)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary hover:text-text-secondary hover:bg-bg-surface-hover transition-colors">
                  <Plus size={10} />
                  프로젝트 수동 추가 (ID/URL)
                </button>
              )}
            </div>

            {/* 고른 뒤에 정할 것들(저장소·브랜치 이름·첫 지시 문구)은 이 좁은 팝오버에서 다룰 수 없다.
                여기서 어설프게 흉내 내지 말고 제대로 된 화면으로 보낸다. */}
            {showSettingsLink && (
              <button
                onClick={() => {
                  setOpen(false)
                  window.dispatchEvent(
                    new CustomEvent('goto-settings', { detail: { tab: 'workspace' } })
                  )
                }}
                className="flex items-center gap-1.5 w-full px-3 py-2 border-t border-bg-border text-left text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors"
              >
                <Settings size={11} className="flex-none" />
                <span className="flex-1 min-w-0">프로젝트별 규칙 정하기 — 저장소 · 브랜치 이름 · 첫 지시 문구</span>
                <ChevronRight size={11} className="flex-none text-text-tertiary" />
              </button>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

export default ProjectFilter
