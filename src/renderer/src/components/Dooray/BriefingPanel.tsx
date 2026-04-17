import { useState, useEffect } from 'react'
import { Sparkles, AlertTriangle, Target, Clock, Calendar, Lightbulb, RefreshCw, Trash2, ChevronDown, ThumbsUp, ThumbsDown } from 'lucide-react'
import type { AIBriefing } from '../../../../shared/types/ai'
import SkillQuickToggle from './SkillQuickToggle'
import { useAIProgress } from '../../hooks/useAIProgress'
import AIProgressIndicator from '../common/AIProgressIndicator'
import { ErrorView, EmptyView } from '../common/StateViews'

type StoredBriefing = AIBriefing & { savedAt: string }

function BriefingPanel(): JSX.Element {
  const [briefing, setBriefing] = useState<AIBriefing | null>(null)
  const [history, setHistory] = useState<StoredBriefing[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const { progress, start, done, isActive } = useAIProgress()

  // 히스토리 로드
  useEffect(() => {
    window.api.briefingStore.list().then((list) => {
      setHistory(list)
      // 가장 최근 브리핑이 있으면 표시
      if (list.length > 0) setBriefing(list[0])
    })
  }, [])

  const loadBriefing = async (): Promise<void> => {
    setError(null)
    const reqId = start()
    const started = Date.now()
    window.api.analytics.track('ai.briefing.start')
    try {
      const result = await window.api.ai.briefing(reqId)
      setBriefing(result)
      await window.api.briefingStore.save(result)
      const list = await window.api.briefingStore.list()
      setHistory(list)
      window.api.analytics.track('ai.briefing.success', {
        durationMs: Date.now() - started,
        success: true
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '브리핑 생성 실패')
      window.api.analytics.track('ai.briefing.error', {
        durationMs: Date.now() - started,
        success: false,
        meta: { message: err instanceof Error ? err.message.substring(0, 100) : 'unknown' }
      })
    } finally {
      done()
    }
  }

  const selectBriefing = (b: StoredBriefing): void => {
    setBriefing(b)
    setShowHistory(false)
  }

  const deleteBriefing = async (index: number): Promise<void> => {
    if (!window.confirm('이 브리핑을 삭제할까요?\n삭제 후에는 복구할 수 없습니다.')) return
    await window.api.briefingStore.delete(index)
    const list = await window.api.briefingStore.list()
    setHistory(list)
    if (list.length > 0) setBriefing(list[0])
    else setBriefing(null)
  }

  if (isActive) {
    return (
      <div className="h-full flex flex-col">
        {/* 헤더 유지 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-bg-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-clover-orange animate-pulse" />
            <span className="text-sm font-semibold text-text-primary">AI 브리핑 생성 중</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <AIProgressIndicator
            progress={progress}
            showStreamPreview
            size="large"
            expectedTime="보통 30초 ~ 2분 걸립니다. 태스크가 많으면 더 오래 걸릴 수 있어요."
            className="max-w-3xl mx-auto"
          />
          {/* 이전 브리핑이 있으면 흐리게 배경 표시 (기다리는 동안 참고) */}
          {briefing && (
            <div className="max-w-3xl mx-auto mt-6 opacity-30">
              <p className="text-[10px] text-text-tertiary mb-2">↓ 이전 브리핑 (참고용)</p>
              <p className="text-sm font-semibold text-text-primary mb-3">{briefing.greeting}</p>
              {briefing.urgent.length > 0 && (
                <div className="text-[11px] text-text-secondary">
                  긴급: {briefing.urgent.map((u) => u.subject).join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
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
        {error && <ErrorView message={error} onRetry={loadBriefing} />}

        {!briefing && !error && (
          <EmptyView
            icon={Sparkles}
            title="오늘의 AI 브리핑"
            description="태스크와 일정을 분석하여 오늘 집중할 업무를 추천합니다"
            actionLabel="✨ 브리핑 생성"
            onAction={loadBriefing}
          />
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

            {/* 피드백 */}
            <BriefingFeedback />
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

/** 브리핑 피드백 — 스킬 개선 힌트 수집용 */
function BriefingFeedback(): JSX.Element {
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const submit = async (type: 'up' | 'down', text?: string): Promise<void> => {
    setFeedback(type)
    const history = (await window.api.settings.get('briefingFeedback') as Array<{ at: string; type: string; comment?: string }>) || []
    history.push({ at: new Date().toISOString(), type, comment: text })
    await window.api.settings.set('briefingFeedback', history.slice(-50))
    window.api.analytics.track('ai.briefing.feedback', {
      meta: { feedback: type, hasComment: !!text }
    })
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="text-center text-[10px] text-emerald-400 py-2">
        ✓ 피드백 고마워요! 개선에 활용할게요.
      </div>
    )
  }

  return (
    <div className="pt-3 border-t border-bg-border/50">
      {feedback === null ? (
        <div className="flex items-center justify-center gap-3 text-[11px] text-text-tertiary">
          이번 브리핑 어땠나요?
          <button onClick={() => submit('up')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20">
            <ThumbsUp size={11} /> 좋아요
          </button>
          <button onClick={() => setFeedback('down')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-400/10 text-red-400 hover:bg-red-400/20">
            <ThumbsDown size={11} /> 아쉬워요
          </button>
        </div>
      ) : feedback === 'down' ? (
        <div className="space-y-2">
          <p className="text-[10px] text-text-secondary text-center">뭐가 아쉬웠나요? (선택)</p>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
            placeholder="예: 긴급 기준이 안 맞아요, 멘션된 태스크를 더 강조해주세요"
            className="w-full px-3 py-2 bg-bg-surface border border-bg-border rounded-lg text-[11px] text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue resize-none" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setFeedback(null)} className="text-[10px] text-text-tertiary hover:text-text-secondary">취소</button>
            <button onClick={() => submit('down', comment)}
              className="px-3 py-1 rounded-md bg-clover-blue text-white text-[10px] font-medium hover:bg-clover-blue/80">
              제출
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default BriefingPanel
