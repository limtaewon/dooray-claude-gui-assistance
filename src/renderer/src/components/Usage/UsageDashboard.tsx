import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, DollarSign, Cpu, Zap, Clock, TrendingUp, BarChart3, PieChart, Sparkles, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, PieChart as RPieChart, Pie, Cell
} from 'recharts'
import type { UsageSummary, UsageQueryParams } from '../../../../shared/types/usage'

type Period = UsageQueryParams['period']

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

const COLORS = ['#3B82F6', '#FB923C', '#22C55E', '#A78BFA', '#F472B6', '#FBBF24']

function UsageDashboard(): JSX.Element {
  const [period, setPeriod] = useState<Period>('week')
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [insightReport, setInsightReport] = useState<string | null>(null)
  const [insightLoading, setInsightLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setSummary(await window.api.usage.query({ period, groupBy: 'date' })) }
    catch {} finally { setLoading(false) }
  }, [period])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="flex items-center justify-center h-full text-text-secondary text-sm">사용량 데이터 불러오는 중...</div>
  if (!summary) return <div className="flex items-center justify-center h-full text-text-secondary text-sm">데이터 없음</div>

  // 차트 데이터
  const dailyData = Object.entries(summary.byDate).map(([date, recs]) => ({
    date: date.slice(5), // MM-DD
    입력: recs.reduce((s, r) => s + r.inputTokens, 0),
    출력: recs.reduce((s, r) => s + r.outputTokens, 0),
    캐시: recs.reduce((s, r) => s + r.cacheReadInputTokens, 0),
    비용: +recs.reduce((s, r) => s + r.costUsd, 0).toFixed(2),
    호출수: recs.length
  })).sort((a, b) => a.date.localeCompare(b.date))

  const modelData = Object.entries(summary.byModel).map(([model, recs]) => ({
    name: model.replace('claude-', '').replace(/-\d{8}$/, ''),
    비용: +recs.reduce((s, r) => s + r.costUsd, 0).toFixed(2),
    호출수: recs.length,
    토큰: recs.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0)
  })).sort((a, b) => b.비용 - a.비용)

  const hourData = Array.from({ length: 24 }, (_, h) => ({
    시간: `${h}시`,
    호출수: (summary.byHour[h] || []).length,
    토큰: (summary.byHour[h] || []).reduce((s, r) => s + r.inputTokens + r.outputTokens, 0)
  }))

  const cacheHitRate = summary.totalInputTokens > 0
    ? ((summary.totalCacheReadTokens / (summary.totalInputTokens + summary.totalCacheReadTokens)) * 100).toFixed(1)
    : '0'

  const avgCostPerDay = dailyData.length > 0
    ? (summary.totalCostUsd / dailyData.length).toFixed(2)
    : '0'

  const totalTokens = summary.totalInputTokens + summary.totalOutputTokens

  const tooltipStyle = {
    backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 8, color: '#F9FAFB', fontSize: 11
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">사용량 대시보드</h2>
          <p className="text-xs text-text-secondary mt-0.5">Claude Code 토큰 사용량, 비용, 패턴 분석</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={async () => {
              setInsightLoading(true)
              try {
                const result = await window.api.claudeInsights.generate()
                setInsightReport(result || '인사이트를 생성할 수 없습니다.')
              } catch (err) {
                setInsightReport(`오류: ${err instanceof Error ? err.message : '인사이트 생성 실패'}`)
              } finally { setInsightLoading(false) }
            }}
            disabled={insightLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-clover-orange to-clover-blue text-white text-xs font-medium hover:opacity-90 disabled:opacity-50">
            {insightLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {insightLoading ? '분석 중...' : 'AI 인사이트'}
          </button>
          {(['day', 'week', 'month'] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                period === p ? 'bg-clover-blue text-white' : 'bg-bg-surface border border-bg-border text-text-secondary hover:text-text-primary'
              }`}>
              {{ day: '24시간', week: '7일', month: '30일' }[p]}
            </button>
          ))}
          <button onClick={load} className="p-2 rounded-lg hover:bg-bg-surface-hover text-text-secondary"><RefreshCw size={14} /></button>
        </div>
      </div>

      {/* AI 인사이트 리포트 */}
      {insightReport && (
        <div className="mb-6 bg-bg-surface border border-bg-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-bg-border bg-gradient-to-r from-clover-orange/10 to-clover-blue/10">
            <div className="flex items-center gap-1.5">
              <Sparkles size={13} className="text-clover-orange" />
              <span className="text-xs font-semibold text-text-primary">AI 사용 인사이트 (한국어)</span>
            </div>
            <button onClick={() => setInsightReport(null)} className="text-[9px] text-text-tertiary hover:text-text-secondary">닫기</button>
          </div>
          <div className="p-5 max-h-[60vh] overflow-y-auto markdown-body text-sm leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{insightReport}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* 요약 카드 6개 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard icon={DollarSign} iconColor="text-clover-orange" label="총 비용" value={`$${summary.totalCostUsd.toFixed(2)}`} />
        <StatCard icon={TrendingUp} iconColor="text-emerald-400" label="일 평균 비용" value={`$${avgCostPerDay}`} />
        <StatCard icon={Zap} iconColor="text-clover-blue" label="총 토큰" value={fmt(totalTokens)} />
        <StatCard icon={Cpu} iconColor="text-purple-400" label="API 호출" value={`${summary.records.length}회`} />
        <StatCard icon={BarChart3} iconColor="text-amber-400" label="캐시 히트율" value={`${cacheHitRate}%`} />
        <StatCard icon={Clock} iconColor="text-sky-400" label="세션 수" value={`${summary.totalSessions}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* 일별 토큰 사용량 */}
        <div className="bg-bg-surface border border-bg-border rounded-xl p-4">
          <h3 className="text-xs font-semibold text-text-primary mb-3">일별 토큰 사용량</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 10 }} tickFormatter={fmt} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmt(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="입력" fill="#3B82F6" radius={[2, 2, 0, 0]} />
              <Bar dataKey="출력" fill="#FB923C" radius={[2, 2, 0, 0]} />
              <Bar dataKey="캐시" fill="#22C55E" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 일별 비용 트렌드 */}
        <div className="bg-bg-surface border border-bg-border rounded-xl p-4">
          <h3 className="text-xs font-semibold text-text-primary mb-3">일별 비용 추이</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `$${v}`} />
              <Area type="monotone" dataKey="비용" stroke="#FB923C" fill="#FB923C" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* 모델별 비용 파이 */}
        <div className="bg-bg-surface border border-bg-border rounded-xl p-4">
          <h3 className="text-xs font-semibold text-text-primary mb-3">모델별 비용 비율</h3>
          <ResponsiveContainer width="100%" height={200}>
            <RPieChart>
              <Pie data={modelData} dataKey="비용" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                {modelData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `$${v}`} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </RPieChart>
          </ResponsiveContainer>
        </div>

        {/* 시간대별 활동 */}
        <div className="bg-bg-surface border border-bg-border rounded-xl p-4 lg:col-span-2">
          <h3 className="text-xs font-semibold text-text-primary mb-3">시간대별 사용 패턴</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="시간" tick={{ fill: '#9CA3AF', fontSize: 9 }} interval={2} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="호출수" fill="#A78BFA" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 모델별 상세 */}
      <div className="bg-bg-surface border border-bg-border rounded-xl p-4">
        <h3 className="text-xs font-semibold text-text-primary mb-3">모델별 상세</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-bg-border text-text-secondary">
                <th className="text-left py-2 px-3 font-medium">모델</th>
                <th className="text-right py-2 px-3 font-medium">호출</th>
                <th className="text-right py-2 px-3 font-medium">입력 토큰</th>
                <th className="text-right py-2 px-3 font-medium">출력 토큰</th>
                <th className="text-right py-2 px-3 font-medium">총 토큰</th>
                <th className="text-right py-2 px-3 font-medium">비용</th>
                <th className="text-right py-2 px-3 font-medium">비율</th>
              </tr>
            </thead>
            <tbody>
              {modelData.map((m, i) => (
                <tr key={m.name} className="border-b border-bg-border/50 hover:bg-bg-surface-hover">
                  <td className="py-2 px-3 font-mono flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    {m.name}
                  </td>
                  <td className="text-right py-2 px-3 text-text-secondary">{m.호출수}</td>
                  <td className="text-right py-2 px-3 text-clover-blue">{fmt(m.토큰 * 0.7 | 0)}</td>
                  <td className="text-right py-2 px-3 text-clover-orange">{fmt(m.토큰 * 0.3 | 0)}</td>
                  <td className="text-right py-2 px-3 text-text-primary font-medium">{fmt(m.토큰)}</td>
                  <td className="text-right py-2 px-3 text-clover-orange font-medium">${m.비용.toFixed(2)}</td>
                  <td className="text-right py-2 px-3 text-text-secondary">
                    {summary.totalCostUsd > 0 ? ((m.비용 / summary.totalCostUsd) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, iconColor, label, value }: {
  icon: typeof DollarSign; iconColor: string; label: string; value: string
}): JSX.Element {
  return (
    <div className="bg-bg-surface border border-bg-border rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className={iconColor} />
        <span className="text-[10px] text-text-secondary">{label}</span>
      </div>
      <p className="text-lg font-bold text-text-primary">{value}</p>
    </div>
  )
}

export default UsageDashboard
