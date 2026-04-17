import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Users, TrendingUp, AlertTriangle, BarChart3, Loader2 } from 'lucide-react'
import type { DoorayTask } from '../../../../shared/types/dooray'

interface ProjectStats {
  code: string
  total: number
  backlog: number
  registered: number
  working: number
  closed: number
  overdueCount: number
}

function TeamInsights(): JSX.Element {
  const [tasks, setTasks] = useState<DoorayTask[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.api.dooray.tasks.list()
      setTasks(list)
    } catch (err) {
      console.error('태스크 로드 실패:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // 프로젝트별 통계
  const projectStats: ProjectStats[] = []
  const projectMap = new Map<string, ProjectStats>()

  for (const task of tasks) {
    const code = task.projectCode || 'UNKNOWN'
    if (!projectMap.has(code)) {
      projectMap.set(code, { code, total: 0, backlog: 0, registered: 0, working: 0, closed: 0, overdueCount: 0 })
    }
    const stats = projectMap.get(code)!
    stats.total++
    const wf = task.workflowClass || 'registered'
    if (wf in stats) (stats as unknown as Record<string, number>)[wf]++
    if (task.dueDateAt && new Date(task.dueDateAt) < new Date() && wf !== 'closed') {
      stats.overdueCount++
    }
  }
  projectMap.forEach((v) => projectStats.push(v))
  projectStats.sort((a, b) => b.total - a.total)

  // 전체 통계
  const totalStats = {
    total: tasks.length,
    backlog: tasks.filter((t) => t.workflowClass === 'backlog').length,
    registered: tasks.filter((t) => t.workflowClass === 'registered').length,
    working: tasks.filter((t) => t.workflowClass === 'working').length,
    closed: tasks.filter((t) => t.workflowClass === 'closed').length,
    overdue: tasks.filter((t) =>
      t.dueDateAt && new Date(t.dueDateAt) < new Date() &&
      t.workflowClass !== 'closed'
    ).length
  }

  const completionRate = totalStats.total > 0
    ? Math.round((totalStats.closed / totalStats.total) * 100)
    : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-text-secondary">
        <Loader2 size={16} className="animate-spin" /> 데이터 분석 중...
      </div>
    )
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">팀 인사이트</h2>
          <p className="text-xs text-text-secondary mt-0.5">프로젝트별 태스크 현황 분석</p>
        </div>
        <button
          onClick={loadData}
          className="p-2 rounded-lg hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="전체 태스크" value={totalStats.total} icon={BarChart3} color="text-clover-blue" />
        <StatCard label="진행중" value={totalStats.working} icon={TrendingUp} color="text-clover-blue" />
        <StatCard label="완료율" value={`${completionRate}%`} icon={Users} color="text-emerald-400" />
        <StatCard label="지연" value={totalStats.overdue} icon={AlertTriangle} color="text-red-400" />
      </div>

      {/* 상태 분포 바 */}
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-text-secondary mb-2">전체 상태 분포</h3>
        <div className="h-3 rounded-full overflow-hidden flex bg-bg-surface border border-bg-border">
          {totalStats.total > 0 && (
            <>
              <div
                className="bg-gray-400 h-full transition-all"
                style={{ width: `${(totalStats.backlog / totalStats.total) * 100}%` }}
                title={`백로그 ${totalStats.backlog}`}
              />
              <div
                className="bg-clover-orange h-full transition-all"
                style={{ width: `${(totalStats.registered / totalStats.total) * 100}%` }}
                title={`등록 ${totalStats.registered}`}
              />
              <div
                className="bg-clover-blue h-full transition-all"
                style={{ width: `${(totalStats.working / totalStats.total) * 100}%` }}
                title={`진행중 ${totalStats.working}`}
              />
              <div
                className="bg-emerald-400 h-full transition-all"
                style={{ width: `${(totalStats.closed / totalStats.total) * 100}%` }}
                title={`완료 ${totalStats.closed}`}
              />
            </>
          )}
        </div>
        <div className="flex gap-4 mt-1.5">
          <Legend color="bg-gray-400" label="백로그" count={totalStats.backlog} />
          <Legend color="bg-clover-orange" label="등록" count={totalStats.registered} />
          <Legend color="bg-clover-blue" label="진행중" count={totalStats.working} />
          <Legend color="bg-emerald-400" label="완료" count={totalStats.closed} />
        </div>
      </div>

      {/* 프로젝트별 현황 */}
      <div>
        <h3 className="text-xs font-semibold text-text-secondary mb-3">프로젝트별 현황</h3>
        <div className="space-y-2">
          {projectStats.map((p) => {
            const activeTotal = p.backlog + p.registered + p.working + p.closed
            return (
              <div key={p.code} className="bg-bg-surface border border-bg-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold text-text-primary">{p.code}</span>
                    <span className="text-[10px] text-text-tertiary">{p.total}개</span>
                  </div>
                  {p.overdueCount > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-red-400">
                      <AlertTriangle size={10} />
                      지연 {p.overdueCount}
                    </span>
                  )}
                </div>
                <div className="h-2 rounded-full overflow-hidden flex bg-bg-primary">
                  {activeTotal > 0 && (
                    <>
                      <div className="bg-gray-400 h-full" style={{ width: `${(p.backlog / activeTotal) * 100}%` }} />
                      <div className="bg-clover-orange h-full" style={{ width: `${(p.registered / activeTotal) * 100}%` }} />
                      <div className="bg-clover-blue h-full" style={{ width: `${(p.working / activeTotal) * 100}%` }} />
                      <div className="bg-emerald-400 h-full" style={{ width: `${(p.closed / activeTotal) * 100}%` }} />
                    </>
                  )}
                </div>
                <div className="flex gap-3 mt-1.5 text-[10px] text-text-tertiary">
                  <span>등록 {p.registered}</span>
                  <span>진행 {p.working}</span>
                  <span>완료 {p.closed}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label, value, icon: Icon, color
}: {
  label: string; value: string | number; icon: typeof BarChart3; color: string
}): JSX.Element {
  return (
    <div className="bg-bg-surface border border-bg-border rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className={color} />
        <span className="text-[10px] text-text-secondary">{label}</span>
      </div>
      <span className="text-xl font-bold text-text-primary">{value}</span>
    </div>
  )
}

function Legend({ color, label, count }: { color: string; label: string; count: number }): JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-[10px] text-text-secondary">{label} {count}</span>
    </div>
  )
}

export default TeamInsights
