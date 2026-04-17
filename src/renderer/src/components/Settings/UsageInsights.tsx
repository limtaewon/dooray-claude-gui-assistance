import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, TrendingUp, Zap, ThumbsUp, ThumbsDown, Lightbulb, Download, Trash2, Shield, Activity } from 'lucide-react'
import type { AnalyticsSummary } from '../../../../shared/types/analytics'

/** 기능 키 → 라벨 */
const FEATURE_LABELS: Record<string, string> = {
  'view.dooray': '두레이',
  'view.terminal': '터미널',
  'view.git': '브랜치 작업',
  'view.mcp': 'MCP 서버',
  'view.skills': 'Claude 스킬',
  'view.sessions': '세션',
  'view.usage': '사용량',
  'view.manual': '매뉴얼',
  'view.settings': '설정',
  'ai.briefing': 'AI 브리핑',
  'ai.report': '보고서',
  'ai.wiki.proofread': '위키 교정',
  'ai.wiki.improve': '위키 개선',
  'ai.wiki.summarize': '위키 요약',
  'ai.wiki.structure': '위키 구조',
  'ai.wiki.draft': '위키 초안',
  'ai.task.summarize': '태스크 요약',
  'ai.meeting.note': '회의록',
  'ai.session.summarize': '세션 요약',
  'ai.calendar.analysis': '캘린더 분석',
  'ai.skill.generate': 'AI 스킬 생성'
}

function label(key: string): string {
  return FEATURE_LABELS[key] || key
}

function formatDwell(seconds: number): string {
  if (seconds < 60) return `${seconds}초`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}분`
  const h = Math.floor(m / 60)
  return `${h}시간 ${m % 60}분`
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}초`
}

function UsageInsights(): JSX.Element {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const s = await window.api.analytics.summary(days)
      setSummary(s)
    } catch { /* ok */ }
    finally { setLoading(false) }
  }, [days])

  useEffect(() => { load() }, [load])

  const handleExport = async (): Promise<void> => {
    const events = await window.api.analytics.exportAll()
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clauday-analytics-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleClear = async (): Promise<void> => {
    if (!window.confirm('모든 사용 데이터를 삭제할까요? 인사이트가 초기화됩니다.')) return
    await window.api.analytics.clear()
    load()
  }

  if (loading || !summary) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-2 text-text-secondary text-sm py-10 justify-center">
          <RefreshCw size={14} className="animate-spin" /> 인사이트 집계 중...
        </div>
      </div>
    )
  }

  const feedbackTotal = summary.briefingFeedback.up + summary.briefingFeedback.down
  const positiveRate = feedbackTotal > 0 ? Math.round((summary.briefingFeedback.up / feedbackTotal) * 100) : 0

  // 개인화 제안 생성
  const suggestions: Array<{ text: string; action?: string }> = []
  if (summary.aiUsage.briefing && summary.aiUsage.briefing.count > 3 && feedbackTotal === 0) {
    suggestions.push({ text: '브리핑을 자주 쓰시네요! 하단 👍/👎로 피드백 남기시면 개인화에 도움이 돼요.' })
  }
  if (summary.unusedFeatures.includes('ai.report') && summary.aiUsage.briefing?.count > 5) {
    suggestions.push({ text: '브리핑은 자주 쓰시는데 보고서는 안 쓰시네요. 주간 보고 템플릿을 한 번 써보세요.' })
  }
  if (summary.skills.totalCreated === 0 && summary.totalEvents > 20) {
    suggestions.push({ text: '아직 커스텀 스킬이 없네요. 역할별 템플릿으로 1분이면 시작 가능합니다.' })
  }
  if (feedbackTotal >= 3 && positiveRate < 50) {
    suggestions.push({ text: '브리핑 만족도가 낮은 편입니다. 스킬에 구체적인 규칙을 추가해보세요.' })
  }
  if (summary.errors > 5) {
    suggestions.push({ text: `최근 에러가 ${summary.errors}건 발생했습니다. 네트워크/인증 상태를 확인해보세요.` })
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">내 사용 인사이트</h3>
          <p className="text-[10px] text-text-tertiary mt-0.5 flex items-center gap-1">
            <Shield size={10} /> 로컬에만 저장 · 외부 전송 없음
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            className="px-2 py-1 bg-bg-surface border border-bg-border rounded text-[11px] text-text-primary focus:outline-none">
            <option value={7}>최근 7일</option>
            <option value={30}>최근 30일</option>
            <option value={90}>최근 90일</option>
          </select>
          <button onClick={load} className="p-1.5 rounded hover:bg-bg-surface-hover text-text-tertiary" title="새로고침">
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-2">
        <SummaryCard icon={Activity} label="총 이벤트" value={`${summary.totalEvents}`} color="text-clover-blue" />
        <SummaryCard icon={Zap} label="AI 호출" value={Object.values(summary.aiUsage).reduce((s, v) => s + v.count, 0).toString()} color="text-clover-orange" />
        <SummaryCard icon={ThumbsUp} label="만족도" value={feedbackTotal > 0 ? `${positiveRate}%` : '-'} color="text-emerald-400" />
        <SummaryCard icon={TrendingUp} label="스킬" value={`${summary.skills.totalCreated}`} color="text-violet-400" />
      </div>

      {/* 개인화 제안 */}
      {suggestions.length > 0 && (
        <section className="p-4 rounded-xl bg-gradient-to-r from-clover-orange/5 to-clover-blue/5 border border-clover-orange/20">
          <h4 className="text-[11px] font-semibold text-clover-orange flex items-center gap-1.5 mb-2">
            <Lightbulb size={11} /> 개선 제안
          </h4>
          <ul className="space-y-1">
            {suggestions.map((s, i) => (
              <li key={i} className="text-[11px] text-text-primary flex gap-2">
                <span className="text-clover-orange flex-shrink-0">·</span>{s.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 가장 많이 쓰는 기능 */}
      <section>
        <h4 className="text-[11px] font-semibold text-text-secondary mb-2">가장 많이 쓰는 기능 Top 5</h4>
        <div className="bg-bg-surface border border-bg-border rounded-xl overflow-hidden">
          {summary.topFeatures.length === 0 ? (
            <div className="text-center py-6 text-[11px] text-text-tertiary">아직 데이터가 부족해요</div>
          ) : (
            summary.topFeatures.map((item, i) => {
              const max = summary.topFeatures[0]?.count || 1
              const pct = (item.count / max) * 100
              return (
                <div key={item.feature} className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-bg-border/50' : ''}`}>
                  <span className="text-[10px] text-text-tertiary font-mono w-5">#{i + 1}</span>
                  <span className="text-xs text-text-primary w-28 flex-shrink-0">{label(item.feature)}</span>
                  <div className="flex-1 h-2 bg-bg-primary rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-clover-blue to-clover-orange" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[11px] text-text-secondary font-mono w-10 text-right">{item.count}</span>
                </div>
              )
            })
          )}
        </div>
      </section>

      {/* 뷰별 체류 시간 */}
      {Object.keys(summary.viewDwell).length > 0 && (
        <section>
          <h4 className="text-[11px] font-semibold text-text-secondary mb-2">뷰별 체류 시간</h4>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(summary.viewDwell)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([view, sec]) => (
                <div key={view} className="flex items-center justify-between px-3 py-2 bg-bg-surface border border-bg-border rounded-lg">
                  <span className="text-[11px] text-text-primary">{label(`view.${view}`)}</span>
                  <span className="text-[10px] text-text-tertiary font-mono">{formatDwell(sec)}</span>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* AI 기능별 성과 */}
      {Object.keys(summary.aiUsage).length > 0 && (
        <section>
          <h4 className="text-[11px] font-semibold text-text-secondary mb-2">AI 기능별 성과</h4>
          <div className="bg-bg-surface border border-bg-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_60px_80px_60px] gap-2 px-4 py-2 bg-bg-primary/30 border-b border-bg-border/50 text-[9px] font-semibold text-text-tertiary uppercase">
              <span>기능</span>
              <span className="text-right">호출</span>
              <span className="text-right">평균 시간</span>
              <span className="text-right">성공률</span>
            </div>
            {Object.entries(summary.aiUsage).map(([key, v]) => (
              <div key={key} className="grid grid-cols-[1fr_60px_80px_60px] gap-2 px-4 py-2 border-b border-bg-border/30 last:border-0 items-center">
                <span className="text-xs text-text-primary">{label(`ai.${key}`)}</span>
                <span className="text-[11px] text-text-secondary font-mono text-right">{v.count}</span>
                <span className="text-[11px] text-text-secondary font-mono text-right">
                  {v.avgDurationMs > 0 ? formatMs(v.avgDurationMs) : '-'}
                </span>
                <span className={`text-[11px] font-mono text-right ${v.successRate >= 90 ? 'text-emerald-400' : v.successRate >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                  {v.successRate}%
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 브리핑 피드백 */}
      {feedbackTotal > 0 && (
        <section>
          <h4 className="text-[11px] font-semibold text-text-secondary mb-2">브리핑 피드백</h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between p-3 bg-emerald-400/5 border border-emerald-400/20 rounded-lg">
              <span className="text-xs text-text-primary flex items-center gap-1.5"><ThumbsUp size={11} className="text-emerald-400" /> 좋아요</span>
              <span className="text-sm font-semibold text-emerald-400">{summary.briefingFeedback.up}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-red-400/5 border border-red-400/20 rounded-lg">
              <span className="text-xs text-text-primary flex items-center gap-1.5"><ThumbsDown size={11} className="text-red-400" /> 아쉬워요</span>
              <span className="text-sm font-semibold text-red-400">{summary.briefingFeedback.down}</span>
            </div>
          </div>
        </section>
      )}

      {/* 데이터 관리 */}
      <section className="pt-3 border-t border-bg-border/50">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] text-text-tertiary">
            데이터는 <code className="text-text-secondary">~/Library/Application Support/Clauday/analytics/</code>에만 저장됩니다.
          </p>
          <div className="flex gap-1.5">
            <button onClick={handleExport}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-bg-surface border border-bg-border text-[10px] text-text-secondary hover:text-text-primary">
              <Download size={10} /> 내보내기
            </button>
            <button onClick={handleClear}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 text-[10px] hover:bg-red-500/20">
              <Trash2 size={10} /> 초기화
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, color }: {
  icon: typeof Activity; label: string; value: string; color: string
}): JSX.Element {
  return (
    <div className="p-3 bg-bg-surface border border-bg-border rounded-xl">
      <div className="flex items-center gap-1.5 text-[10px] text-text-tertiary mb-1">
        <Icon size={11} className={color} /> {label}
      </div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
    </div>
  )
}

export default UsageInsights
