import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react'
import {
  RefreshCw, CheckCircle2, Circle, Clock, AlertCircle,
  FolderOpen, ChevronRight, ChevronLeft, PanelLeftClose, PanelLeftOpen, Search, X
} from 'lucide-react'
import type { DoorayTask, DoorayProject } from '../../../../shared/types/dooray'
import TaskDetailPanel from './TaskDetailPanel'
import ResizeHandle from '../common/ResizeHandle'
import ProjectFilter from '../common/ProjectFilter'

const WORKFLOW_ICONS: Record<string, typeof Circle> = {
  backlog: Circle, registered: AlertCircle, working: Clock, done: CheckCircle2, closed: CheckCircle2
}
const WORKFLOW_COLORS: Record<string, string> = {
  backlog: 'text-text-tertiary', registered: 'text-clover-orange', working: 'text-clover-blue',
  done: 'text-emerald-400', closed: 'text-text-tertiary'
}
const WORKFLOW_BG_COLORS: Record<string, string> = {
  backlog: 'bg-gray-500/10 text-gray-400', registered: 'bg-clover-orange/10 text-clover-orange',
  working: 'bg-clover-blue/10 text-clover-blue', done: 'bg-emerald-400/10 text-emerald-400',
  closed: 'bg-gray-500/10 text-gray-400'
}

function getWorkflowName(task: DoorayTask): string {
  return task.workflow?.name || task.workflowName || task.workflowClass || '알 수 없음'
}

/**
 * 태그 칩 스타일.
 * hue는 원색 유지, HSL L값을 테마별 고정 → WCAG AA(4.5:1) 대비 보장.
 */
const TAG_STYLE_CACHE = new Map<string, React.CSSProperties>()
if (typeof window !== 'undefined') {
  window.addEventListener('theme-changed', () => TAG_STYLE_CACHE.clear())
}
function currentTheme(): 'light' | 'dark' {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}
function hexToHsl(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let hue = 0
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) hue = ((b - r) / d + 2) / 6
  else hue = ((r - g) / d + 4) / 6
  return [Math.round(hue * 360), Math.round(s * 100), Math.round(l * 100)]
}
function tagStyle(color?: string): React.CSSProperties {
  if (!color || color === 'ffffff') return {}
  const theme = currentTheme()
  const key = `${theme}|${color}`
  const cached = TAG_STYLE_CACHE.get(key)
  if (cached) return cached
  const [h, s] = hexToHsl(color)
  const sAdj = Math.min(s, 80)
  const style: React.CSSProperties = theme === 'light'
    ? {
        backgroundColor: `hsl(${h} ${sAdj * 0.25}% 94%)`,
        color: `hsl(${h} ${sAdj}% 25%)`,
        borderColor: `hsl(${h} ${sAdj * 0.5}% 75%)`
      }
    : {
        backgroundColor: `hsl(${h} ${sAdj * 0.2}% 18%)`,
        color: `hsl(${h} ${sAdj}% 80%)`,
        borderColor: `hsl(${h} ${sAdj * 0.35}% 40%)`
      }
  TAG_STYLE_CACHE.set(key, style)
  return style
}

/** 메모이즈된 태스크 로우 (참조 바뀔 때만 재렌더) */
interface TaskRowProps {
  task: DoorayTask
  isSelected: boolean
  currentTagFilter: string
  onSelect: (task: DoorayTask) => void
  onToggleTag: (tagKey: string) => void
}

const TaskRow = memo(function TaskRow({ task, isSelected, currentTagFilter, onSelect, onToggleTag }: TaskRowProps): JSX.Element {
  const wf = task.workflowClass || 'registered'
  const Icon = WORKFLOW_ICONS[wf] || Circle
  const color = WORKFLOW_COLORS[wf]
  const wfName = getWorkflowName(task)
  return (
    <div
      onClick={() => onSelect(task)}
      // content-visibility: 뷰포트 밖에 있을 때 렌더 스킵 (브라우저 내장 가상화)
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 60px' }}
      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
        isSelected ? 'bg-clover-blue/5' : 'hover:bg-bg-surface-hover'
      }`}
    >
      <Icon size={14} className={`flex-shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-text-primary truncate">{task.subject}</p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${WORKFLOW_BG_COLORS[wf] || 'bg-gray-500/10 text-gray-400'}`}>
            {wfName}
          </span>
          {task.tags && task.tags.length > 0 && (() => {
            const MAX_VISIBLE = 3
            const visible = task.tags.slice(0, MAX_VISIBLE)
            const hidden = task.tags.length - MAX_VISIBLE
            return (
              <>
                {visible.map((tag) => (
                  <span
                    key={tag.id}
                    className="text-[9px] px-1.5 py-0.5 rounded-full border"
                    style={tagStyle(tag.color)}
                    onClick={(e) => { e.stopPropagation(); onToggleTag(tag.name || tag.id) }}
                  >
                    {tag.name || tag.id}
                  </span>
                ))}
                {hidden > 0 && (
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded-full bg-bg-surface border border-bg-border text-text-tertiary cursor-default"
                    title={task.tags.slice(MAX_VISIBLE).map((t) => t.name || t.id).join(', ')}
                  >
                    +{hidden}
                  </span>
                )}
              </>
            )
          })()}
          {task.milestone?.name && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400">
              {task.milestone.name}
            </span>
          )}
          {task.dueDateAt && (
            <span className="text-[9px] text-text-tertiary">
              마감 {new Date(task.dueDateAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={12} className="text-text-tertiary flex-shrink-0" />
    </div>
  )
}, (prev, next) =>
  prev.task.id === next.task.id &&
  prev.task.subject === next.task.subject &&
  prev.task.workflowClass === next.task.workflowClass &&
  prev.task.tags === next.task.tags &&
  prev.isSelected === next.isSelected &&
  prev.currentTagFilter === next.currentTagFilter
)

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
              <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">프로젝트</span>
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
                    className="w-full pl-6 pr-6 py-1 bg-bg-primary border border-bg-border rounded text-[10px] text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue"
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
                <div className="text-[10px] text-text-tertiary text-center py-4">로딩...</div>
              ) : (() => {
                const q = projectQuery.trim().toLowerCase()
                const visible = q ? projects.filter((p) => p.code.toLowerCase().includes(q)) : projects
                if (visible.length === 0) {
                  return <div className="text-[10px] text-text-tertiary text-center py-4">검색 결과 없음</div>
                }
                return visible.map((p) => {
                  const isSelected = selectedProject?.id === p.id
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProject(p)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                        isSelected
                          ? 'bg-clover-blue/10 text-clover-blue border-r-2 border-clover-blue'
                          : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
                      }`}
                    >
                      <FolderOpen size={13} className={`flex-shrink-0 ${isSelected ? 'text-clover-blue' : 'text-text-tertiary'}`} />
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
                  className="w-40 px-2.5 py-1 bg-bg-surface border border-bg-border rounded text-[11px] text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue"
                />

                {/* 상태 드롭다운 */}
                <div className="relative">
                  <button
                    onClick={() => { setShowWfDropdown(!showWfDropdown); setShowTagDropdown(false) }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] border transition-colors ${
                      wfFilter !== '전체' ? 'bg-clover-blue/10 border-clover-blue/30 text-clover-blue' : 'bg-bg-surface border-bg-border text-text-secondary hover:border-bg-border-light'
                    }`}
                  >
                    상태: {wfFilter} <ChevronRight size={10} className={`transition-transform ${showWfDropdown ? 'rotate-90' : ''}`} />
                  </button>
                  {showWfDropdown && (
                    <div className="absolute top-full left-0 mt-1 w-48 bg-bg-surface border border-bg-border rounded-lg shadow-xl z-20 py-1 max-h-60 overflow-y-auto">
                      <button onClick={() => { setWfFilter('전체'); setShowWfDropdown(false) }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors ${wfFilter === '전체' ? 'bg-clover-blue/10 text-clover-blue' : 'text-text-secondary hover:bg-bg-surface-hover'}`}>
                        전체
                      </button>
                      {workflowCounts.map((wf) => (
                        <button key={wf.name} onClick={() => { setWfFilter(wf.name); setShowWfDropdown(false) }}
                          className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center justify-between transition-colors ${
                            wfFilter === wf.name ? 'bg-clover-blue/10 text-clover-blue' : 'text-text-secondary hover:bg-bg-surface-hover'
                          }`}>
                          <span className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              wf.cls === 'working' ? 'bg-clover-blue' : wf.cls === 'registered' ? 'bg-clover-orange' : wf.cls === 'closed' ? 'bg-emerald-400' : 'bg-gray-400'
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
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] border transition-colors ${
                      tagFilter !== '전체' ? 'bg-clover-blue/10 border-clover-blue/30 text-clover-blue' : 'bg-bg-surface border-bg-border text-text-secondary hover:border-bg-border-light'
                    }`}
                  >
                    태그: {tagFilter} <ChevronRight size={10} className={`transition-transform ${showTagDropdown ? 'rotate-90' : ''}`} />
                  </button>
                  {showTagDropdown && (
                    <div className="absolute top-full left-0 mt-1 w-56 bg-bg-surface border border-bg-border rounded-lg shadow-xl z-20 py-1 max-h-60 overflow-y-auto">
                      <button onClick={() => { setTagFilter('전체'); setShowTagDropdown(false) }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors ${tagFilter === '전체' ? 'bg-clover-blue/10 text-clover-blue' : 'text-text-secondary hover:bg-bg-surface-hover'}`}>
                        전체
                      </button>
                      {tagList.map((tag) => (
                        <button key={tag.name} onClick={() => { setTagFilter(tag.name); setShowTagDropdown(false) }}
                          className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center justify-between transition-colors ${
                            tagFilter === tag.name ? 'bg-clover-blue/10 text-clover-blue' : 'text-text-secondary hover:bg-bg-surface-hover'
                          }`}>
                          <span className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded text-[9px] border" style={tagStyle(tag.color)}>{tag.name}</span>
                          </span>
                          <span className="text-text-tertiary">{tag.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 결과 수 */}
                <span className="text-[10px] text-text-tertiary ml-auto">
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
                  <button onClick={() => loadTasks(selectedProject.id)} className="text-xs text-clover-blue hover:underline mt-2">다시 시도</button>
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
                    <div className="py-3 text-center text-[10px] text-text-tertiary">
                      {visibleTasks.length} / {filteredTasks.length}개 표시 — 스크롤하면 더 불러옵니다
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm">
            {sidebarCollapsed ? '좌측 버튼으로 프로젝트 목록을 여세요' : '좌측에서 프로젝트를 선택하세요'}
          </div>
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
