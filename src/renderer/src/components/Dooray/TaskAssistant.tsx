import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, CheckCircle2, Circle, Clock, AlertCircle, LogOut, Filter } from 'lucide-react'
import type { DoorayTask } from '../../../../shared/types/dooray'
import WikiManager from './WikiManager'
import CalendarAssistant from './CalendarAssistant'

const WORKFLOW_ICONS: Record<string, typeof Circle> = {
  registered: AlertCircle,
  working: Clock,
  done: CheckCircle2,
  closed: CheckCircle2
}

const WORKFLOW_COLORS: Record<string, string> = {
  registered: 'text-clover-orange',
  working: 'text-clover-blue',
  done: 'text-emerald-400',
  closed: 'text-text-secondary'
}

const WORKFLOW_BG: Record<string, string> = {
  registered: 'bg-clover-orange/10 border-clover-orange/20',
  working: 'bg-clover-blue/10 border-clover-blue/20',
  done: 'bg-emerald-400/10 border-emerald-400/20',
  closed: 'bg-gray-500/10 border-gray-500/20'
}

const WORKFLOW_LABELS: Record<string, string> = {
  registered: '등록',
  working: '진행 중',
  done: '완료',
  closed: '닫힘'
}

type WorkflowClass = 'registered' | 'working' | 'done' | 'closed'
type Tab = 'tasks' | 'wiki' | 'calendar'

const TAB_LABELS: Record<Tab, string> = {
  tasks: '태스크',
  wiki: '위키',
  calendar: '캘린더'
}

interface TaskAssistantProps {
  onDisconnect?: () => void
}

function TaskAssistant({ onDisconnect }: TaskAssistantProps): JSX.Element {
  const [tasks, setTasks] = useState<DoorayTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('tasks')
  const [activeFilters, setActiveFilters] = useState<Set<WorkflowClass>>(
    new Set(['registered', 'working'])
  )

  const loadTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await window.api.dooray.tasks.list()
      setTasks(list)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      console.error('태스크 로드 실패:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTasks() }, [loadTasks])

  const toggleFilter = (wf: WorkflowClass): void => {
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(wf)) next.delete(wf)
      else next.add(wf)
      return next
    })
  }

  const filteredTasks = tasks.filter((t) =>
    activeFilters.has(t.workflowClass || 'registered')
  )

  const statusCounts = tasks.reduce<Record<string, number>>((acc, t) => {
    const wf = t.workflowClass || 'registered'
    acc[wf] = (acc[wf] || 0) + 1
    return acc
  }, {})

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center h-10 bg-bg-surface border-b border-bg-border px-4 gap-4">
        {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`text-xs font-medium transition-colors pb-2 border-b-2 ${
              activeTab === tab
                ? 'text-clover-blue border-clover-blue'
                : 'text-text-secondary hover:text-text-primary border-transparent'
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
        <div className="ml-auto">
          {onDisconnect && (
            <button
              onClick={onDisconnect}
              className="flex items-center gap-1 text-[10px] text-text-secondary hover:text-red-400 transition-colors"
              title="토큰 재설정"
            >
              <LogOut size={12} />
              연결 해제
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'tasks' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">내 태스크</h2>
              <button
                onClick={loadTasks}
                className="p-2 rounded-lg hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
                title="새로 고침"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* 상태 필터 */}
            <div className="flex items-center gap-2 mb-4">
              <Filter size={12} className="text-text-tertiary" />
              {(Object.keys(WORKFLOW_LABELS) as WorkflowClass[]).map((wf) => {
                const isActive = activeFilters.has(wf)
                const count = statusCounts[wf] || 0
                return (
                  <button
                    key={wf}
                    onClick={() => toggleFilter(wf)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                      isActive
                        ? WORKFLOW_BG[wf]
                        : 'bg-transparent border-bg-border text-text-tertiary hover:border-bg-border-light'
                    }`}
                  >
                    <span className={isActive ? WORKFLOW_COLORS[wf] : ''}>
                      {WORKFLOW_LABELS[wf]}
                    </span>
                    {count > 0 && (
                      <span className={`text-[10px] ${isActive ? 'opacity-80' : 'opacity-50'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-40 text-text-secondary text-sm">
                태스크 불러오는 중...
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <p className="text-xs text-red-400 text-center px-4">{error}</p>
                <p className="text-[10px] text-text-secondary text-center">
                  토큰이 잘못됐다면 우측 상단 "연결 해제" 후 재설정하세요.
                </p>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-text-secondary text-sm">
                {tasks.length === 0 ? '담당 태스크가 없습니다.' : '선택한 상태의 태스크가 없습니다.'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTasks.map((task) => {
                  const wfClass = task.workflowClass || 'registered'
                  const Icon = WORKFLOW_ICONS[wfClass] || Circle
                  const color = WORKFLOW_COLORS[wfClass] || 'text-text-secondary'
                  const label = WORKFLOW_LABELS[wfClass] || task.workflowName
                  return (
                    <div
                      key={task.id}
                      className="flex items-start gap-3 p-3 bg-bg-surface border border-bg-border rounded-lg hover:border-clover-blue/30 hover:bg-bg-surface-hover transition-all"
                    >
                      <Icon size={16} className={`mt-0.5 flex-shrink-0 ${color}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary truncate">{task.subject}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {task.projectCode && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-primary text-text-secondary font-mono">
                              {task.projectCode}
                            </span>
                          )}
                          <span className={`text-[10px] ${color}`}>{label}</span>
                          {task.dueDateAt && (
                            <span className="text-[10px] text-text-secondary">
                              마감: {new Date(task.dueDateAt).toLocaleDateString('ko-KR')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'wiki' && <WikiManager />}
        {activeTab === 'calendar' && <CalendarAssistant />}
      </div>
    </div>
  )
}

export default TaskAssistant
