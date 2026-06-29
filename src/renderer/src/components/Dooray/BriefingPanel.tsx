import { useState, useEffect } from 'react'
import { Sparkles, AlertTriangle, Target, Clock, Calendar, Lightbulb, Trash2, ChevronDown, ThumbsUp, ThumbsDown, MessageSquare } from 'lucide-react'
import type { AIBriefing } from '../../../../shared/types/ai'
import SkillQuickToggle from './SkillQuickToggle'
import AIToolsPopover from '../common/AIToolsPopover'
import { useAIProgress } from '../../hooks/useAIProgress'
import AIProgressIndicator from '../common/AIProgressIndicator'
import { ErrorView, EmptyView } from '../common/StateViews'
import { Button, Chip } from '../common/ds'
import { useErrorReport } from '../ErrorReport/ErrorReportProvider'

type StoredBriefing = AIBriefing & { savedAt: string }

function BriefingPanel(): JSX.Element {
  const [briefing, setBriefing] = useState<AIBriefing | null>(null)
  const [history, setHistory] = useState<StoredBriefing[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const { progress, start, done, isActive } = useAIProgress()
  const errorReport = useErrorReport()

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
      const mcpServers = await AIToolsPopover.loadSelected('briefing')
      const result = await window.api.ai.briefing(reqId, mcpServers)
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
            <Sparkles size={16} className="text-clauday-orange animate-pulse" />
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
              <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mb-2">↓ 이전 브리핑 (참고용)</p>
              <p className="text-sm font-semibold text-text-primary mb-3">{briefing.greeting}</p>
              {briefing.urgent.length > 0 && (
                <div className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary">
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
          <Sparkles size={16} className="text-clauday-orange" />
          <span className="text-sm font-semibold text-text-primary">AI 브리핑</span>
          {history.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1 text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary hover:text-text-secondary px-1.5 py-0.5 rounded bg-bg-surface"
            >
              히스토리 {history.length}개
              <ChevronDown size={10} className={`transition-transform ${showHistory ? 'rotate-180' : ''}`} />
            </button>
          )}
          {briefing && (
            <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">
              · {new Date((briefing as StoredBriefing).savedAt || Date.now()).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 생성
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {briefing && history.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              title="현재 브리핑 삭제"
              onClick={() => deleteBriefing(0)}
              leftIcon={<Trash2 size={12} />}
            />
          )}
          <SkillQuickToggle target="briefing" feature="briefing" />
          <Button
            variant="ai"
            onClick={loadBriefing}
            leftIcon={<Sparkles size={12} />}
          >
            새 브리핑 생성
          </Button>
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
                <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary font-mono">
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
        {error && <ErrorView message={error} onRetry={loadBriefing} onReport={errorReport.open} />}

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
          <div className="px-6 py-4 space-y-3">
            {/* Greeting card with orange→blue gradient + summary chips */}
            <div
              className="rounded-xl px-4 py-3.5"
              style={{
                background: 'linear-gradient(90deg, rgba(234,88,12,0.10), rgba(37,99,235,0.10))',
                border: '1px solid rgba(234,88,12,0.45)'
              }}
            >
              <div className="text-[calc(13px_*_var(--app-font-scale,1))] leading-relaxed text-text-primary">{briefing.greeting}</div>
              <div className="flex items-center gap-1.5 mt-2">
                {briefing.urgent.length > 0 && <Chip tone="orange" dot>긴급 {briefing.urgent.length}</Chip>}
                {briefing.focus.length > 0 && <Chip tone="blue" dot>집중 {briefing.focus.length}</Chip>}
                {briefing.mentioned && briefing.mentioned.length > 0 && <Chip tone="neutral" dot>참고 {briefing.mentioned.length}</Chip>}
                {briefing.todayEvents.length > 0 && <Chip tone="emerald" dot>회의 {briefing.todayEvents.length}</Chip>}
              </div>
              {/* 참고 데이터 메타 — 사용자가 "뭘 보고 만든 결과인지" 한 줄로 인지.
                  토글한 프로젝트 태스크 + 토글한 캘린더 일정은 항상 base 로 들어감.
                  스킬/MCP 가 활성이면 추가 보강 분석이 그 위에서 일어남. */}
              {briefing.sourceMeta && (
                <div className="mt-2 text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">
                  <div>
                    참고: 내 태스크 {briefing.sourceMeta.taskCount}개 · CC {briefing.sourceMeta.ccTaskCount}개 · 오늘 마감 {briefing.sourceMeta.dueTodayCount}개 · 일정 {briefing.sourceMeta.eventCount}개
                    {briefing.sourceMeta.eventRange ? ` (${briefing.sourceMeta.eventRange})` : ''}
                  </div>
                  {briefing.sourceMeta.probes && briefing.sourceMeta.probes.length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer hover:text-text-secondary">
                        🔎 AI 가 확인한 외부 출처 {briefing.sourceMeta.probes.length}개
                      </summary>
                      <ul className="mt-1 ml-3 space-y-0.5 list-disc list-inside">
                        {briefing.sourceMeta.probes.map((p, i) => (
                          <li key={i} className="font-mono">
                            <span className="text-text-secondary">{p.name}</span>
                            {p.summary ? <span className="text-text-tertiary"> {p.summary}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>

            {briefing.urgent.length > 0 && (
              <Section icon={AlertTriangle} iconColor="text-red-500 dark:text-red-400" title="긴급" count={briefing.urgent.length} bgColor="from-red-500/12 to-transparent border-red-500/60">
                {briefing.urgent.map((item, i) => <TaskItem key={i} taskId={item.taskId} subject={item.subject} detail={item.reason} />)}
              </Section>
            )}

            {briefing.focus.length > 0 && (
              <Section icon={Target} iconColor="text-blue-700 dark:text-clauday-blue" title="오늘 집중" count={briefing.focus.length} bgColor="from-clauday-blue/15 to-transparent border-clauday-blue">
                {briefing.focus.map((item, i) => <TaskItem key={i} taskId={item.taskId} subject={item.subject} detail={item.reason} />)}
              </Section>
            )}

            {briefing.recommendations.length > 0 && (
              <Section icon={Lightbulb} iconColor="text-violet-600 dark:text-violet-300" title="AI 제안" count={briefing.recommendations.length} bgColor="from-violet-500/10 to-transparent border-violet-500/55">
                <div className="space-y-1.5">
                  {briefing.recommendations.map((rec, i) => (
                    <RecommendationItem key={i} text={rec} index={i} />
                  ))}
                </div>
              </Section>
            )}

            {briefing.stale.length > 0 && (
              <Section icon={Clock} iconColor="text-amber-700 dark:text-amber-400" title="착수 필요" count={briefing.stale.length} bgColor="from-amber-500/12 to-transparent border-amber-500/70">
                {briefing.stale.map((item, i) => <TaskItem key={i} taskId={item.taskId} subject={item.subject} detail={`${item.daysSinceCreated}일째`} />)}
              </Section>
            )}

            {briefing.todayEvents.length > 0 && (
              <Section icon={Calendar} iconColor="text-emerald-600 dark:text-emerald-400" title="오늘 일정" count={briefing.todayEvents.length} bgColor="from-emerald-500/10 to-transparent border-emerald-500/55">
                {briefing.todayEvents.map((evt, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono">{evt.time}</span>
                    <span className="text-text-primary flex-1">{evt.subject}</span>
                  </div>
                ))}
              </Section>
            )}

            {briefing.mentioned && briefing.mentioned.length > 0 && (
              <Section icon={MessageSquare} iconColor="text-slate-500 dark:text-slate-400" title="참고사항" count={briefing.mentioned.length} bgColor="from-slate-500/8 to-transparent border-slate-500/40">
                {briefing.mentioned.map((item, i) => <TaskItem key={i} taskId={item.taskId} subject={item.subject} detail={item.reason} />)}
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

function Section({ icon: Icon, iconColor, title, count, bgColor, children }: {
  icon: typeof Sparkles; iconColor: string; title: string; count?: number; bgColor: string; children: React.ReactNode
}): JSX.Element {
  return (
    <div className={`rounded-xl bg-gradient-to-r ${bgColor} border px-3.5 py-3`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={iconColor} />
        <span className={`text-[calc(12px_*_var(--app-font-scale,1))] font-semibold ${iconColor}`}>{title}</span>
        {count !== undefined && <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">· {count}</span>}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

/**
 * 본문 텍스트 안의 URL 을 자동으로 anchor 로 렌더링.
 * - http(s):// 로 시작하는 URL 매칭. 호스트 별로 (nhnent / github.com / github.nhnent.com 등) 짧은 라벨로 축약.
 * - Dooray 태스크 URL 은 별도 chip 처리 안 하고 일반 링크처럼 — 시각적 일관성.
 */
const URL_RE = /(https?:\/\/[^\s,()<>]+)/g
function linkifyText(text: string): React.ReactNode {
  if (!text || !URL_RE.test(text)) return text
  URL_RE.lastIndex = 0
  const parts: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const url = m[1]
    let label = url
    try {
      const u = new URL(url)
      // 호스트 + path 마지막 segment 만 노출 — 예: github.nhnent.com/org/repo/pull/123 → "nhnent #123"
      const host = u.hostname.replace(/^www\./, '')
      const segs = u.pathname.split('/').filter(Boolean)
      const tail = segs[segs.length - 1] || ''
      const hostShort = host.endsWith('nhnent.com') ? 'nhnent'
        : host === 'github.com' ? 'github'
        : host
      const isPr = /\/(pull|issues)\/\d+/.test(u.pathname)
      label = isPr ? `${hostShort} #${tail}` : `${hostShort}/${tail || ''}`.replace(/\/$/, '')
    } catch { /* keep raw */ }
    parts.push(
      <a key={`url-${i++}`} href={url} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-0.5 mx-0.5 px-1.5 py-0.5 rounded border border-bg-border-strong bg-bg-surface text-text-secondary hover:text-clauday-blue hover:border-clauday-blue text-[calc(10px_*_var(--app-font-scale,1))] font-mono align-baseline"
        title={url}>
        {label}
      </a>
    )
    last = m.index + url.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

/**
 * AI 제안 한 줄을 시각적 위계로 분해 — 시간 anchor(오전/오후/EOD/N일/HH시) chip 좌측 분리 +
 * 18자리 raw taskId 숨김(클릭은 두레이로 열림) + emoji prefix 살리기 + 번호.
 * 단순 텍스트 줄 나열로는 6개 추천이 뭉뚱그려져 안 읽힘.
 */
function RecommendationItem({ text, index }: { text: string; index: number }): JSX.Element {
  // 시간 anchor 추출 (우선순위 순)
  const ANCHOR_PATTERNS: Array<RegExp> = [
    /^(오전\s*후반|오전|오후\s*블록\s*\d+시간|오후|EOD\s*전|EOD|점심\s*후|점심|미팅\s*전|회의\s*전|주간회의\s*전|시작\s*전)\s*[:：]?\s*/,
    /^(\d{1,2}일\s*\([월화수목금토일]\)\s*\d{0,2}시?|\d{1,2}일\s*\d{0,2}시?|\d{1,2}\/\d{1,2}\s*\d{0,2}시?)\s*[:：]?\s*/
  ]
  let anchor: string | null = null
  let body = text
  for (const re of ANCHOR_PATTERNS) {
    const m = body.match(re)
    if (m) {
      anchor = m[1].trim().replace(/[:：]\s*$/, '').trim()
      body = body.slice(m[0].length).trim()
      break
    }
  }

  // 18자리 raw taskId 추출 → 클릭 가능한 mini chip 으로 (괄호 통째 제거 후 별도 표시)
  const taskIds: string[] = []
  body = body.replace(/\((\d{15,20})\)/g, (_, id: string) => {
    taskIds.push(id)
    return ''
  }).replace(/\s+/g, ' ').replace(/\s+([,.])/g, '$1').trim()

  // 선행 emoji prefix (⚠️🔴🟡🚨📋💬🔍🚀⏰⏳🔄📝🏖️ 등)
  let leadingEmoji: string | null = null
  const em = body.match(/^([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]+(?:\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]+)*)\s+/u)
  if (em) {
    leadingEmoji = em[1].trim()
    body = body.slice(em[0].length).trim()
  }

  return (
    <div className="flex items-start gap-2 py-1 px-1.5 -mx-1.5 rounded-md hover:bg-bg-surface-hover transition-colors">
      <span className="flex-none w-4 text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary font-mono mt-1 text-right">{index + 1}.</span>
      <span className="flex-1 text-[calc(12px_*_var(--app-font-scale,1))] text-text-primary leading-relaxed">
        {leadingEmoji && <span className="mr-1 text-[calc(13px_*_var(--app-font-scale,1))]">{leadingEmoji}</span>}
        {anchor && (
          <span className="inline-block align-middle mr-1.5">
            <Chip tone="orange">{anchor}</Chip>
          </span>
        )}
        {linkifyText(body)}
        {taskIds.map((id, i) => (
          <a key={`${id}-${i}`} href={`https://nhnent.dooray.com/project/posts/${id}`}
             target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 rounded border border-bg-border-strong bg-bg-surface text-text-secondary hover:text-clauday-blue hover:border-clauday-blue text-[calc(10px_*_var(--app-font-scale,1))] font-mono align-middle"
             title={`두레이에서 ${id} 열기`}>
            #{id.slice(-4)}
          </a>
        ))}
      </span>
    </div>
  )
}

function TaskItem({ taskId, subject, detail }: { taskId?: string; subject: string; detail: string }): JSX.Element {
  // detail 안에 URL 이 있으면 outer anchor 로 감쌀 수 없음(nested <a>) — subject 만 링크화하고 detail 은 별도 줄.
  const detailNode = detail
    ? <div className="text-text-secondary text-[calc(11px_*_var(--app-font-scale,1))] leading-relaxed mt-0.5">{linkifyText(detail)}</div>
    : null
  if (taskId) {
    return (
      <div className="text-xs px-1.5 -mx-1.5 py-1 rounded hover:bg-bg-surface-hover transition-colors">
        <a href={`https://nhnent.dooray.com/project/posts/${taskId}`} target="_blank" rel="noopener noreferrer"
          className="text-text-primary hover:text-clauday-blue cursor-pointer"
          title="두레이에서 열기">
          {subject}
        </a>
        {detailNode}
      </div>
    )
  }
  return (
    <div className="text-xs">
      <span className="text-text-primary block">{subject}</span>
      {detailNode}
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
      <div className="text-center text-[calc(10px_*_var(--app-font-scale,1))] text-emerald-400 py-2">
        ✓ 피드백 고마워요! 개선에 활용할게요.
      </div>
    )
  }

  return (
    <div className="pt-3 border-t border-bg-border/50">
      {feedback === null ? (
        <div className="flex items-center justify-center gap-3 text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary">
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
          <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-secondary text-center">뭐가 아쉬웠나요? (선택)</p>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
            placeholder="예: 긴급 기준이 안 맞아요, 참고사항 태스크를 더 강조해주세요"
            className="w-full px-3 py-2 bg-bg-surface border border-bg-border rounded-lg text-[calc(11px_*_var(--app-font-scale,1))] text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clauday-blue resize-none" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setFeedback(null)} className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary hover:text-text-secondary">취소</button>
            <button onClick={() => submit('down', comment)}
              className="px-3 py-1 rounded-md bg-clauday-blue text-white text-[calc(10px_*_var(--app-font-scale,1))] font-medium hover:bg-clauday-blue/80">
              제출
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default BriefingPanel
