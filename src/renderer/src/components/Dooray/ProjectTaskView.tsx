import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  RefreshCw,
  FolderOpen, ChevronRight, ChevronLeft, PanelLeftClose, PanelLeftOpen, Search, X
} from 'lucide-react'
import type { DoorayTask, DoorayProject } from '../../../../shared/types/dooray'
import TaskDetailPanel from './TaskDetailPanel'
import ResizeHandle from '../common/ResizeHandle'
import ProjectFilter from '../common/ProjectFilter'
import TaskRow from './TaskRow'
import { getWorkflowName, tagStyle } from './taskStyles'
import { ViewOnboarding } from '../common/onboarding/viewOnboarding'

function ProjectTaskView(): JSX.Element {
  const [projects, setProjects] = useState<DoorayProject[]>([])
  const [selectedProject, setSelectedProject] = useState<DoorayProject | null>(null)
  const [tasks, setTasks] = useState<DoorayTask[]>([])
  const [selectedTask, setSelectedTask] = useState<DoorayTask | null>(null)
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 필터
  const [wfFilter, setWfFilter] = useState<string>('전체')
  const [tagFilter, setTagFilter] = useState<string>('전체')
  const [searchQuery, setSearchQuery] = useState('')
  const [showWfDropdown, setShowWfDropdown] = useState(false)
  const [showTagDropdown, setShowTagDropdown] = useState(false)
  // 점진적 렌더링
  const [renderCount, setRenderCount] = useState(50)
  const listRef = useRef<HTMLDivElement>(null)

  // 패널 크기 상태
  const [sidebarWidth, setSidebarWidth] = useState(200)
  const [detailWidth, setDetailWidth] = useState(480)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [projectQuery, setProjectQuery] = useState('')

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true)
    try {
      const [allProjects, pinnedIds, customProjects, lastProjectId] = await Promise.all([
        window.api.dooray.projects.list(),
        window.api.settings.getProjects(),
        window.api.settings.get('customProjects') as Promise<DoorayProject[] | null>,
        window.api.settings.get('lastSelectedProjectId') as Promise<string | null>
      ])
      // API 프로젝트 + 수동 추가 프로젝트 병합 (중복 제거)
      const merged = [...allProjects]
      for (const cp of customProjects || []) {
        if (!allProjects.some((p) => p.id === cp.id)) merged.push(cp)
      }
      let filtered: DoorayProject[]
      if (pinnedIds.length > 0) {
        filtered = pinnedIds
          .map((id) => merged.find((p) => p.id === id))
          .filter(Boolean) as DoorayProject[]
      } else {
        filtered = merged
      }
      setProjects(filtered)
      if (filtered.length > 0 && !selectedProject) {
        // 마지막 선택 프로젝트가 있으면 복원, 없으면 첫번째
        const last = lastProjectId ? filtered.find((p) => p.id === lastProjectId) : null
        setSelectedProject(last || filtered[0])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '프로젝트 로드 실패')
    } finally {
      setLoadingProjects(false)
    }
  }, [])

  const loadTasks = useCallback(async (projectId: string, force = false) => {
    setLoadingTasks(true)
    setError(null)
    setTasks([])
    const t0 = performance.now()
    try {
      const list = await window.api.dooray.tasks.list([projectId], force)
      const t1 = performance.now()
      console.log(`[TaskLoad] API ${(t1 - t0).toFixed(0)}ms · ${list.length}개 (final)`)
      // partial로 이미 채워졌어도 최종 리스트로 대체 (정합성)
      setTasks(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : '태스크 로드 실패')
      setTasks([])
    } finally {
      setLoadingTasks(false)
    }
  }, [])

  // 점진 로딩 이벤트 구독: 첫 페이지 도착 시 바로 UI에 표시
  useEffect(() => {
    const unsub = window.api.dooray.tasks.onPartial(({ projectId, tasks: partialTasks, done }) => {
      // 현재 선택된 프로젝트 것만 반영
      const current = selectedProjectRef.current
      if (!current || current.id !== projectId) return
      setTasks(partialTasks)
      if (!done) {
        console.log(`[TaskLoad] Partial ${partialTasks.length}개 (계속 로딩 중)`)
        // 첫 페이지 받았으니 로딩 표시 내림 (나머지는 백그라운드)
        setLoadingTasks(false)
      }
    })
    return unsub
  }, [])

  // selectedProject 최신값을 이벤트 핸들러에서 참조하기 위한 ref
  const selectedProjectRef = useRef<DoorayProject | null>(null)
  useEffect(() => {
    selectedProjectRef.current = selectedProject
  }, [selectedProject])

  useEffect(() => { loadProjects() }, [loadProjects])
  useEffect(() => {
    if (selectedProject) {
      loadTasks(selectedProject.id); setSelectedTask(null); setWfFilter('전체'); setTagFilter('전체'); setSearchQuery(''); setRenderCount(50)
      // 마지막 선택 프로젝트 저장 (다음 세션에 복원)
      window.api.settings.set('lastSelectedProjectId', selectedProject.id)
    }
  }, [selectedProject, loadTasks])

  // 스크롤 하단 감지 → 추가 로드
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const handler = (): void => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
        setRenderCount((prev) => prev + 50)
      }
    }
    el.addEventListener('scroll', handler)
    return () => el.removeEventListener('scroll', handler)
  }, [loadingTasks])

  // 워크플로우 카운트 + 태그 목록 (tasks가 바뀔 때만 재계산)
  const { workflowCounts, tagList } = useMemo(() => {
    const countMap = new Map<string, { cls: string; count: number }>()
    const tagsMap = new Map<string, { name: string; color: string; count: number }>()
    for (const t of tasks) {
      const name = getWorkflowName(t)
      const cls = t.workflowClass || 'registered'
      const existing = countMap.get(name)
      if (existing) existing.count++
      else countMap.set(name, { cls, count: 1 })

      if (t.tags) {
        for (const tag of t.tags) {
          const key = tag.name || tag.id
          const tagExisting = tagsMap.get(key)
          if (tagExisting) tagExisting.count++
          else tagsMap.set(key, { name: key, color: tag.color || 'ffffff', count: 1 })
        }
      }
    }
    const ORDER: Record<string, number> = { working: 0, registered: 1, backlog: 2, done: 3, closed: 4 }
    const workflowArr = Array.from(countMap.entries())
      .map(([k, v]) => ({ name: k, cls: v.cls, count: v.count }))
      .sort((a, b) => (ORDER[a.cls] ?? 2) - (ORDER[b.cls] ?? 2))
    const tagArr = Array.from(tagsMap.values()).sort((a, b) => b.count - a.count)
    return { workflowCounts: workflowArr, tagList: tagArr }
  }, [tasks])

  // 필터 적용 (필터 조건이 바뀔 때만 재계산)
  const filteredTasks = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return tasks.filter((t) => {
      if (wfFilter !== '전체' && getWorkflowName(t) !== wfFilter) return false
      if (tagFilter !== '전체' && !t.tags?.some((tag) => (tag.name || tag.id) === tagFilter)) return false
      if (q && !t.subject.toLowerCase().includes(q)) return false
      return true
    })
  }, [tasks, wfFilter, tagFilter, searchQuery])

  const visibleTasks = useMemo(() => filteredTasks.slice(0, renderCount), [filteredTasks, renderCount])

  const handleSelectTask = useCallback((task: DoorayTask) => {
    setSelectedTask((prev) => prev?.id === task.id ? null : task)
  }, [])

  const handleToggleTag = useCallback((tagKey: string) => {
    setTagFilter((prev) => prev === tagKey ? '전체' : tagKey)
  }, [])

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((w) => Math.max(120, Math.min(400, w + delta)))
  }, [])

  // ESC로 상세 패널 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && selectedTask) {
        setSelectedTask(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedTask])

  const handleDetailResize = useCallback((delta: number) => {
    setDetailWidth((w) => Math.max(280, Math.min(900, w - delta)))
  }, [])

  return (
    <div className="h-full flex">
      {/* 좌측: 프로젝트 목록 */}
      {!sidebarCollapsed && (
        <>
          <div style={{ width: sidebarWidth }} className="flex-shrink-0 bg-bg-surface border-r border-bg-border flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-bg-border">
              <span className="text-[calc(11px_*_var(--app-font-scale,1))] font-semibold text-text-secondary uppercase tracking-wide">프로젝트</span>
              <div className="flex items-center gap-0.5">
                <ProjectFilter onChanged={loadProjects} />
                <button onClick={loadProjects} className="p-1 rounded hover:bg-bg-surface-hover text-text-tertiary">
                  <RefreshCw size={11} className={loadingProjects ? 'animate-spin' : ''} />
                </button>
                <button onClick={() => setSidebarCollapsed(true)} className="p-1 rounded hover:bg-bg-surface-hover text-text-tertiary" title="사이드바 닫기">
                  <PanelLeftClose size={12} />
                </button>
              </div>
            </div>
            {/* 프로젝트 인라인 검색 */}
            {projects.length > 5 && (
              <div className="px-2 py-1.5 border-b border-bg-border">
                <div className="relative">
                  <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
                  <input
                    type="text"
                    value={projectQuery}
                    onChange={(e) => setProjectQuery(e.target.value)}
                    placeholder="프로젝트 검색"
                    className="w-full pl-6 pr-6 py-1 bg-bg-primary border border-bg-border rounded text-[calc(10px_*_var(--app-font-scale,1))] text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clauday-blue"
                  />
                  {projectQuery && (
                    <button onClick={() => setProjectQuery('')}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary">
                      <X size={10} />
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto py-1">
              {loadingProjects ? (
                <div className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary text-center py-4">로딩...</div>
              ) : (() => {
                const q = projectQuery.trim().toLowerCase()
                const visible = q ? projects.filter((p) => p.code.toLowerCase().includes(q)) : projects
                if (visible.length === 0) {
                  return <div className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary text-center py-4">검색 결과 없음</div>
                }
                return visible.map((p) => {
                  const isSelected = selectedProject?.id === p.id
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProject(p)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                        isSelected
                          ? 'bg-clauday-blue/10 text-clauday-blue border-r-2 border-clauday-blue'
                          : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
                      }`}
                    >
                      <FolderOpen size={13} className={`flex-shrink-0 ${isSelected ? 'text-clauday-blue' : 'text-text-tertiary'}`} />
                      <span className="text-xs font-medium truncate min-w-0">{p.code}</span>
                    </button>
                  )
                })
              })()}
            </div>
          </div>
          <ResizeHandle onResize={handleSidebarResize} />
        </>
      )}

      {/* 중앙: 태스크 목록 */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* 접힌 사이드바 열기 버튼 */}
        {sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="absolute left-16 top-[52px] z-10 p-1.5 rounded-r-lg bg-bg-surface border border-l-0 border-bg-border text-text-tertiary hover:text-text-primary hover:bg-bg-surface-hover transition-colors"
            title="프로젝트 목록 열기"
          >
            <PanelLeftOpen size={14} />
          </button>
        )}

        {selectedProject ? (
          <>
            <div className="border-b border-bg-border bg-bg-primary flex-shrink-0">
              {/* 프로젝트 제목 */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-bg-border">
                <h2 className="text-sm font-semibold text-text-primary">{selectedProject.code}</h2>
                <button onClick={() => loadTasks(selectedProject.id, true)} className="p-1.5 rounded-lg hover:bg-bg-surface-hover text-text-secondary">
                  <RefreshCw size={13} className={loadingTasks ? 'animate-spin' : ''} />
                </button>
              </div>

              {/* 필터 바 (두레이 스타일) */}
              <div className="flex items-center gap-2 px-4 py-2 flex-wrap">
                {/* 검색 */}
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="업무 검색..."
                  className="w-40 px-2.5 py-1 bg-bg-surface border border-bg-border rounded text-[calc(11px_*_var(--app-font-scale,1))] text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clauday-blue"
                />

                {/* 상태 드롭다운 */}
                <div className="relative">
                  <button
                    onClick={() => { setShowWfDropdown(!showWfDropdown); setShowTagDropdown(false) }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-[calc(11px_*_var(--app-font-scale,1))] border transition-colors ${
                      wfFilter !== '전체' ? 'bg-clauday-blue/10 border-clauday-blue/30 text-clauday-blue' : 'bg-bg-surface border-bg-border text-text-secondary hover:border-bg-border-light'
                    }`}
                  >
                    상태: {wfFilter} <ChevronRight size={10} className={`transition-transform ${showWfDropdown ? 'rotate-90' : ''}`} />
                  </button>
                  {showWfDropdown && (
                    <div className="absolute top-full left-0 mt-1 w-48 bg-bg-surface border border-bg-border rounded-lg shadow-xl z-20 py-1 max-h-60 overflow-y-auto">
                      <button onClick={() => { setWfFilter('전체'); setShowWfDropdown(false) }}
                        className={`w-full text-left px-3 py-1.5 text-[calc(11px_*_var(--app-font-scale,1))] transition-colors ${wfFilter === '전체' ? 'bg-clauday-blue/10 text-clauday-blue' : 'text-text-secondary hover:bg-bg-surface-hover'}`}>
                        전체
                      </button>
                      {workflowCounts.map((wf) => (
                        <button key={wf.name} onClick={() => { setWfFilter(wf.name); setShowWfDropdown(false) }}
                          className={`w-full text-left px-3 py-1.5 text-[calc(11px_*_var(--app-font-scale,1))] flex items-center justify-between transition-colors ${
                            wfFilter === wf.name ? 'bg-clauday-blue/10 text-clauday-blue' : 'text-text-secondary hover:bg-bg-surface-hover'
                          }`}>
                          <span className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              wf.cls === 'working' ? 'bg-clauday-blue' : wf.cls === 'registered' ? 'bg-clauday-orange' : wf.cls === 'closed' ? 'bg-emerald-400' : 'bg-gray-400'
                            }`} />
                            {wf.name}
                          </span>
                          <span className="text-text-tertiary">{wf.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 태그 드롭다운 */}
                <div className="relative">
                  <button
                    onClick={() => { setShowTagDropdown(!showTagDropdown); setShowWfDropdown(false) }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-[calc(11px_*_var(--app-font-scale,1))] border transition-colors ${
                      tagFilter !== '전체' ? 'bg-clauday-blue/10 border-clauday-blue/30 text-clauday-blue' : 'bg-bg-surface border-bg-border text-text-secondary hover:border-bg-border-light'
                    }`}
                  >
                    태그: {tagFilter} <ChevronRight size={10} className={`transition-transform ${showTagDropdown ? 'rotate-90' : ''}`} />
                  </button>
                  {showTagDropdown && (
                    <div className="absolute top-full left-0 mt-1 w-56 bg-bg-surface border border-bg-border rounded-lg shadow-xl z-20 py-1 max-h-60 overflow-y-auto">
                      <button onClick={() => { setTagFilter('전체'); setShowTagDropdown(false) }}
                        className={`w-full text-left px-3 py-1.5 text-[calc(11px_*_var(--app-font-scale,1))] transition-colors ${tagFilter === '전체' ? 'bg-clauday-blue/10 text-clauday-blue' : 'text-text-secondary hover:bg-bg-surface-hover'}`}>
                        전체
                      </button>
                      {tagList.map((tag) => (
                        <button key={tag.name} onClick={() => { setTagFilter(tag.name); setShowTagDropdown(false) }}
                          className={`w-full text-left px-3 py-1.5 text-[calc(11px_*_var(--app-font-scale,1))] flex items-center justify-between transition-colors ${
                            tagFilter === tag.name ? 'bg-clauday-blue/10 text-clauday-blue' : 'text-text-secondary hover:bg-bg-surface-hover'
                          }`}>
                          <span className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded text-[calc(9px_*_var(--app-font-scale,1))] border" style={tagStyle(tag.color)}>{tag.name}</span>
                          </span>
                          <span className="text-text-tertiary">{tag.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 결과 수 */}
                <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary ml-auto">
                  {filteredTasks.length}/{tasks.length}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto" ref={listRef}>
              {loadingTasks ? (
                <div className="text-text-secondary text-sm text-center py-12">태스크 불러오는 중...</div>
              ) : error ? (
                <div className="text-center py-8">
                  <p className="text-xs text-red-400">{error}</p>
                  <button onClick={() => loadTasks(selectedProject.id)} className="text-xs text-clauday-blue hover:underline mt-2">다시 시도</button>
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="text-text-secondary text-sm text-center py-12">
                  {tasks.length === 0 ? '담당 태스크가 없습니다.' : '필터에 맞는 태스크가 없습니다.'}
                </div>
              ) : (
                <div className="divide-y divide-bg-border">
                  {visibleTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      isSelected={selectedTask?.id === task.id}
                      currentTagFilter={tagFilter}
                      onSelect={handleSelectTask}
                      onToggleTag={handleToggleTag}
                    />
                  ))}
                  {renderCount < filteredTasks.length && (
                    <div className="py-3 text-center text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">
                      {visibleTasks.length} / {filteredTasks.length}개 표시 — 스크롤하면 더 불러옵니다
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <ViewOnboarding
            view="dooray"
            description={
              sidebarCollapsed
                ? '좌측 버튼으로 프로젝트 목록을 열고 작업할 프로젝트를 고르세요.'
                : '좌측에서 프로젝트를 고르면 내 담당 업무가 여기 표시됩니다.'
            }
          />
        )}
      </div>

      {/* 우측: 태스크 상세 */}
      {selectedTask && (
        <>
          <ResizeHandle onResize={handleDetailResize} />
          <div style={{ width: detailWidth }} className="flex-shrink-0">
            <TaskDetailPanel task={selectedTask} onClose={() => setSelectedTask(null)} />
          </div>
        </>
      )}
    </div>
  )
}

export default ProjectTaskView
