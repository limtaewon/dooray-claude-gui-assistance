import { useState, useEffect } from 'react'
import { Sparkles, AlertTriangle, Target, Clock, Calendar, Lightbulb, RefreshCw, Loader2, Trash2, ChevronDown } from 'lucide-react'
import type { AIBriefing } from '../../../../shared/types/ai'
import SkillQuickToggle from './SkillQuickToggle'

type StoredBriefing = AIBriefing & { savedAt: string }

function BriefingPanel(): JSX.Element {
  const [briefing, setBriefing] = useState<AIBriefing | null>(null)
  const [history, setHistory] = useState<StoredBriefing[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  // 히스토리 로드
  useEffect(() => {
    window.api.briefingStore.list().then((list) => {
      setHistory(list)
      // 가장 최근 브리핑이 있으면 표시
      if (list.length > 0) setBriefing(list[0])
    })
  }, [])

  const loadBriefing = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.ai.briefing()
      setBriefing(result)
      // 저장
      await window.api.briefingStore.save(result)
      const list = await window.api.briefingStore.list()
      setHistory(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : '브리핑 생성 실패')
    } finally {
      setLoading(false)
    }
  }

  const selectBriefing = (b: StoredBriefing): void => {
    setBriefing(b)
    setShowHistory(false)
  }

  const deleteBriefing = async (index: number): Promise<void> => {
    await window.api.briefingStore.delete(index)
    const list = await window.api.briefingStore.list()
    setHistory(list)
    if (list.length > 0) setBriefing(list[0])
    else setBriefing(null)
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 size={24} className="animate-spin text-clover-orange" />
        <p className="text-sm text-text-secondary">AI가 업무를 분석하고 있습니다...</p>
        <p className="text-[10px] text-text-tertiary">Claude Code CLI를 통해 처리 중</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-bg-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-clover-orange" />
          <span className="text-sm font-semibold text-text-primary">AI 브리핑</span>
          {history.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-secondary px-1.5 py-0.5 rounded bg-bg-surface"
            >
              히스토리 {history.length}개
              <ChevronDown size={10} className={`transition-transform ${showHistory ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SkillQuickToggle target="briefing" />
          <button
            onClick={loadBriefing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-clover-orange to-clover-blue text-white text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <Sparkles size={12} />
            새 브리핑 생성
          </button>
        </div>
      </div>

      {/* 히스토리 드롭다운 */}
      {showHistory && history.length > 0 && (
        <div className="border-b border-bg-border bg-bg-surface max-h-40 overflow-y-auto">
          {history.map((h, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-4 py-2 hover:bg-bg-surface-hover cursor-pointer"
              onClick={() => selectBriefing(h)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] text-text-tertiary font-mono">
                  {new Date(h.savedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-xs text-text-secondary truncate">{h.greeting}</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteBriefing(i) }}
                className="text-text-tertiary hover:text-red-400 p-1"
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 브리핑 내용 */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="p-4 text-center">
            <p className="text-xs text-red-400 mb-2">{error}</p>
            <button onClick={loadBriefing} className="text-xs text-clover-blue hover:underline">다시 시도</button>
          </div>
        )}

        {!briefing && !error && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-clover-orange/20 to-clover-blue/20 flex items-center justify-center mb-3">
              <Sparkles size={28} className="text-clover-orange" />
            </div>
            <p className="text-sm font-semibold text-text-primary mb-1">오늘의 AI 브리핑</p>
            <p className="text-xs text-text-secondary mb-4">태스크와 일정을 분석하여 오늘 집중할 업무를 추천합니다</p>
            <button
              onClick={loadBriefing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-clover-orange to-clover-blue text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Sparkles size={14} />
              브리핑 생성
            </button>
          </div>
        )}

        {briefing && (
          <div className="p-4 space-y-4">
            <p className="text-sm font-semibold text-text-primary">{briefing.greeting}</p>

            {briefing.urgent.length > 0 && (
              <Section icon={AlertTriangle} iconColor="text-red-400" title="긴급" bgColor="from-red-500/5 to-transparent border-red-500/20">
                {briefing.urgent.map((item, i) => <TaskItem key={i} subject={item.subject} detail={item.reason} />)}
              </Section>
            )}

            {briefing.focus.length > 0 && (
              <Section icon={Target} iconColor="text-clover-blue" title="오늘 집중" bgColor="from-clover-blue/5 to-transparent border-clover-blue/20">
                {briefing.focus.map((item, i) => <TaskItem key={i} subject={item.subject} detail={item.reason} />)}
              </Section>
            )}

            {briefing.mentioned && briefing.mentioned.length > 0 && (
              <Section icon={AlertTriangle} iconColor="text-violet-400" title="멘션됨 (내가 알아야 할 것)" bgColor="from-violet-500/5 to-transparent border-violet-500/20">
                {briefing.mentioned.map((item, i) => <TaskItem key={i} subject={item.subject} detail={item.reason} />)}
              </Section>
            )}

            {briefing.stale.length > 0 && (
              <Section icon={Clock} iconColor="text-clover-orange" title="착수 필요" bgColor="from-clover-orange/5 to-transparent border-clover-orange/20">
                {briefing.stale.map((item, i) => <TaskItem key={i} subject={item.subject} detail={`${item.daysSinceCreated}일째`} />)}
              </Section>
            )}

            {briefing.todayEvents.length > 0 && (
              <Section icon={Calendar} iconColor="text-emerald-400" title="오늘 일정" bgColor="from-emerald-400/5 to-transparent border-emerald-400/20">
                {briefing.todayEvents.map((evt, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-text-secondary font-mono">{evt.time}</span>
                    <span className="text-text-primary">{evt.subject}</span>
                  </div>
                ))}
              </Section>
            )}

            {briefing.recommendations.length > 0 && (
              <Section icon={Lightbulb} iconColor="text-yellow-400" title="AI 추천" bgColor="from-yellow-400/5 to-transparent border-yellow-400/20">
                <ol className="space-y-1.5">
                  {briefing.recommendations.map((rec, i) => (
                    <li key={i} className="flex gap-2 text-xs text-text-primary">
                      <span className="text-text-tertiary font-mono flex-shrink-0">{i + 1}.</span>{rec}
                    </li>
                  ))}
                </ol>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ icon: Icon, iconColor, title, bgColor, children }: {
  icon: typeof Sparkles; iconColor: string; title: string; bgColor: string; children: React.ReactNode
}): JSX.Element {
  return (
    <div className={`rounded-lg bg-gradient-to-r ${bgColor} border p-3`}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={12} className={iconColor} />
        <span className="text-[11px] font-semibold text-text-primary">{title}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function TaskItem({ subject, detail }: { subject: string; detail: string }): JSX.Element {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-text-primary flex-1">{subject}</span>
      <span className="text-text-secondary flex-shrink-0">{detail}</span>
    </div>
  )
}

export default BriefingPanel
