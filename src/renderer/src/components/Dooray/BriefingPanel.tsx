import { useState, useEffect } from 'react'
import { Sparkles, AlertTriangle, Target, Clock, Calendar, Lightbulb, Trash2, ChevronDown, ThumbsUp, ThumbsDown, MessageSquare, ExternalLink } from 'lucide-react'
import type { AIBriefing } from '../../../../shared/types/ai'
import SkillQuickToggle from './SkillQuickToggle'
import AIToolsPopover from '../common/AIToolsPopover'
import { useAIProgress } from '../../hooks/useAIProgress'
import AIProgressIndicator from '../common/AIProgressIndicator'
import { ErrorView, EmptyView } from '../common/StateViews'
import { Button, Chip } from '../common/ds'
import { useErrorReport } from '../ErrorReport/ErrorReportProvider'

type StoredBriefing = AIBriefing & { savedAt: string }

/** 읽기 콘텐츠 폭 상한. 창을 넓혀도 한 줄이 길어지지 않게 — 남는 폭은 섹션 목차가 쓴다. */
const READ_WIDTH = 'max-w-[820px]'

/**
 * 섹션 메타 — 앵커·라벨·색을 한 곳에서 정의해 목차 점과 카드 아이콘이 같은 색을 쓰게 한다.
 *
 * 색은 **아이콘과 목차 점에만** 붙는다. 카드 배경·테두리는 전부 무채색이고, 「긴급」만
 * 좌측 3px 레일을 추가로 갖는다 — 면적이 작아서 여섯이 유색이어도 레일이 가장 강하게 읽힌다.
 */
type SectionTone = 'danger' | 'blue' | 'violet' | 'yellow' | 'emerald' | 'neutral'

const SECTION_ICON_CLS: Record<SectionTone, string> = {
  danger:  'text-c-red-fg',
  blue:    'text-c-blue-fg',
  violet:  'text-c-violet-fg',
  yellow:  'text-c-yellow-fg',
  emerald: 'text-c-emerald-fg',
  neutral: 'text-text-secondary'
}
const SECTION_DOT_CLS: Record<SectionTone, string> = {
  danger:  'bg-c-red-solid',
  blue:    'bg-c-blue-solid',
  violet:  'bg-c-violet-solid',
  yellow:  'bg-c-yellow-solid',
  emerald: 'bg-c-emerald-solid',
  neutral: 'bg-c-neutral-solid'
}

const SECTIONS = {
  urgent:          { id: 'briefing-urgent',          label: '긴급',      tone: 'danger'  },
  focus:           { id: 'briefing-focus',           label: '오늘 집중', tone: 'blue'    },
  recommendations: { id: 'briefing-recommendations', label: 'AI 제안',   tone: 'violet'  },
  stale:           { id: 'briefing-stale',           label: '착수 필요', tone: 'yellow'  },
  todayEvents:     { id: 'briefing-today-events',    label: '오늘 일정', tone: 'emerald' },
  mentioned:       { id: 'briefing-mentioned',       label: '참고사항',  tone: 'neutral' }
} as const satisfies Record<string, { id: string; label: string; tone: SectionTone }>

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
            className={`${READ_WIDTH} mx-auto`}
          />
          {/* 이전 브리핑이 있으면 흐리게 배경 표시 (기다리는 동안 참고) */}
          {briefing && (
            <div className={`${READ_WIDTH} mx-auto mt-6 opacity-30`}>
              <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary mb-2">↓ 이전 브리핑 (참고용)</p>
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
              className="flex items-center gap-1 text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary hover:text-text-primary px-2 py-1 rounded-md border border-bg-border bg-bg-surface hover:bg-bg-surface-hover"
            >
              히스토리 {history.length}개
              <ChevronDown size={11} className={`transition-transform ${showHistory ? 'rotate-180' : ''}`} />
            </button>
          )}
          {briefing && (
            <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary">
              · {new Date((briefing as StoredBriefing).savedAt || Date.now()).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 생성
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {briefing && history.length > 0 && (
            /* 히스토리 각 행의 삭제와 같은 아이콘이라 아이콘만으로는 무엇이 지워지는지 모호하다 —
               지금 보고 있는 브리핑이 대상이라는 걸 버튼이 직접 말한다. */
            <Button
              variant="danger"
              size="sm"
              aria-label="지금 보고 있는 브리핑 삭제"
              onClick={() => deleteBriefing(0)}
              leftIcon={<Trash2 size={12} />}
            >
              이 브리핑 삭제
            </Button>
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
                <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary font-mono">
                  {new Date(h.savedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-xs text-text-secondary truncate">{h.greeting}</span>
              </div>
              <button
                aria-label={`${new Date(h.savedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric' })} 브리핑 삭제`}
                onClick={(e) => { e.stopPropagation(); deleteBriefing(i) }}
                className="text-c-red-fg hover:bg-c-red-bg rounded p-1.5"
              >
                <Trash2 size={12} />
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
          <div className="flex gap-7 px-6 py-5">
            <BriefingToc briefing={briefing} />
            <div className={`flex-1 min-w-0 ${READ_WIDTH} space-y-3.5`}>
            {/* 요약 카드 — 색은 아래 상태 칩이 담당하고 카드 자체는 무채색으로 둔다 */}
            <div className="rounded-xl px-4 py-3.5 bg-bg-surface border border-bg-border">
              <div className="text-[calc(13px_*_var(--app-font-scale,1))] leading-relaxed text-text-primary">{briefing.greeting}</div>
              <div className="flex items-center gap-1.5 mt-2">
                {/* 색이 붙는 건 긴급 하나뿐 — 넷이 다 유색이면 무엇이 급한지 사라진다 */}
                {briefing.urgent.length > 0 && <Chip tone="red" dot>긴급 {briefing.urgent.length}</Chip>}
                {briefing.focus.length > 0 && <Chip tone="selected">집중 {briefing.focus.length}</Chip>}
                {briefing.mentioned && briefing.mentioned.length > 0 && <Chip tone="selected">참고 {briefing.mentioned.length}</Chip>}
                {briefing.todayEvents.length > 0 && <Chip tone="selected">회의 {briefing.todayEvents.length}</Chip>}
              </div>
              {/* 참고 데이터 메타 — 사용자가 "뭘 보고 만든 결과인지" 한 줄로 인지.
                  토글한 프로젝트 태스크 + 토글한 캘린더 일정은 항상 base 로 들어감.
                  스킬/MCP 가 활성이면 추가 보강 분석이 그 위에서 일어남. */}
              {briefing.sourceMeta && (
                <div className="mt-2 text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary">
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
              <Section section={SECTIONS.urgent} icon={AlertTriangle} count={briefing.urgent.length} hint="즉시 원인 확인">
                {briefing.urgent.map((item, i) => <TaskItem key={i} taskId={item.taskId} subject={item.subject} detail={item.reason} />)}
              </Section>
            )}

            {briefing.focus.length > 0 && (
              <Section section={SECTIONS.focus} icon={Target} count={briefing.focus.length}>
                {briefing.focus.map((item, i) => <TaskItem key={i} taskId={item.taskId} subject={item.subject} detail={item.reason} />)}
              </Section>
            )}

            {briefing.recommendations.length > 0 && (
              <Section section={SECTIONS.recommendations} icon={Lightbulb} count={briefing.recommendations.length}>
                {briefing.recommendations.map((rec, i) => (
                  <RecommendationItem key={i} text={rec} index={i} />
                ))}
              </Section>
            )}

            {briefing.stale.length > 0 && (
              <Section section={SECTIONS.stale} icon={Clock} count={briefing.stale.length} hint="대기 일수 순">
                {[...briefing.stale]
                  .sort((a, b) => b.daysSinceCreated - a.daysSinceCreated)
                  .map((item, i) => (
                    <StaleItem key={i} taskId={item.taskId} subject={item.subject} days={item.daysSinceCreated} />
                  ))}
              </Section>
            )}

            {briefing.todayEvents.length > 0 && (
              <Section section={SECTIONS.todayEvents} icon={Calendar} count={briefing.todayEvents.length}>
                {briefing.todayEvents.map((evt, i) => (
                  <div key={i} className="flex items-center gap-3.5 px-4 py-2.5 border-b border-bg-border last:border-b-0">
                    <span className="flex-none min-w-[52px] font-mono text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary">{evt.time}</span>
                    <span className="flex-1 min-w-0 text-[calc(13px_*_var(--app-font-scale,1))] text-text-primary">{evt.subject}</span>
                  </div>
                ))}
              </Section>
            )}

            {briefing.mentioned && briefing.mentioned.length > 0 && (
              <Section section={SECTIONS.mentioned} icon={MessageSquare} count={briefing.mentioned.length}>
                {briefing.mentioned.map((item, i) => <TaskItem key={i} taskId={item.taskId} subject={item.subject} detail={item.reason} />)}
              </Section>
            )}

            {/* 피드백 */}
            <BriefingFeedback />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 브리핑 섹션 카드. 배경·테두리는 무채색이고 색은 아이콘에만 붙는다.
 * 「긴급」은 좌측 3px 레일을 더 가져서, 여섯 아이콘이 유색이어도 심각도가 묻히지 않는다.
 */
function Section({ section, icon: Icon, count, hint, children }: {
  section: { id: string; label: string; tone: SectionTone }
  icon: typeof Sparkles
  count?: number
  hint?: string
  children: React.ReactNode
}): JSX.Element {
  const isDanger = section.tone === 'danger'
  return (
    <section
      id={section.id}
      className={`rounded-xl bg-bg-surface border border-bg-border overflow-hidden ${isDanger ? 'border-l-[3px] border-l-c-red-solid' : ''}`}
    >
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-bg-border">
        <Icon size={14} className={SECTION_ICON_CLS[section.tone]} />
        <span className="text-[calc(13px_*_var(--app-font-scale,1))] font-bold text-text-primary">
          {section.label}
        </span>
        {count !== undefined && <Chip tone={isDanger ? 'red' : 'selected'}>{count}</Chip>}
        {hint && <span className="ml-auto text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary">{hint}</span>}
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  )
}

/** 섹션 점프 목차. 본문 폭을 820px 로 묶으면서 남은 폭을 여기로 회수한다. */
function BriefingToc({ briefing }: { briefing: AIBriefing }): JSX.Element | null {
  const counts: Record<keyof typeof SECTIONS, number> = {
    urgent: briefing.urgent.length,
    focus: briefing.focus.length,
    recommendations: briefing.recommendations.length,
    stale: briefing.stale.length,
    todayEvents: briefing.todayEvents.length,
    mentioned: briefing.mentioned?.length ?? 0
  }
  const items = (Object.keys(SECTIONS) as Array<keyof typeof SECTIONS>)
    .map((key) => ({ ...SECTIONS[key], count: counts[key] }))
    .filter((it) => it.count > 0)

  // 섹션이 하나뿐이면 목차가 정보를 더하지 않는다
  if (items.length < 2) return null

  return (
    <nav aria-label="브리핑 섹션" className="hidden lg:flex w-[172px] flex-none flex-col gap-0.5 self-start sticky top-0">
      <span className="px-2.5 pb-2 text-[calc(11px_*_var(--app-font-scale,1))] font-semibold uppercase tracking-wider text-text-tertiary">
        섹션
      </span>
      {items.map((it) => (
        <a
          key={it.id}
          href={`#${it.id}`}
          className="flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[calc(12px_*_var(--app-font-scale,1))] text-text-secondary no-underline hover:bg-bg-surface-hover hover:text-text-primary"
        >
          {/* 표식 자리를 고정폭으로 잡아 라벨 시작점을 모든 항목에서 맞춘다.
              「긴급」만 세로 레일, 나머지는 점 — 형태가 달라서 색 없이도 구별된다. */}
          <span className="flex-none w-1.5 flex items-center justify-center">
            {it.tone === 'danger'
              ? <span className={`w-[3px] h-4 rounded-full ${SECTION_DOT_CLS[it.tone]}`} />
              : <span className={`w-[5px] h-[5px] rounded-full ${SECTION_DOT_CLS[it.tone]}`} />}
          </span>
          {it.label}
          <span className="ml-auto font-mono text-[calc(11px_*_var(--app-font-scale,1))]">{it.count}</span>
        </a>
      ))}
    </nav>
  )
}

/**
 * 착수 대기 항목. 경과 일수를 고정폭 칩으로 꺼내 60일↑ red / 30일↑ yellow / 그 아래 neutral 로 나눈다.
 * 평문 「90일째」와 「3일째」가 같은 무게로 나오면 무엇부터 손대야 하는지 안 보인다.
 */
function StaleItem({ taskId, subject, days }: { taskId: string; subject: string; days: number }): JSX.Element {
  const tone = days >= 60 ? 'red' : days >= 30 ? 'yellow' : 'neutral'
  return (
    <a
      href={`https://nhnent.dooray.com/project/posts/${taskId}`}
      target="_blank"
      rel="noopener noreferrer"
      title="두레이에서 열기"
      className="group flex items-center gap-3.5 px-4 py-3 border-b border-bg-border last:border-b-0 no-underline hover:bg-bg-surface-hover"
    >
      <Chip tone={tone} square className="min-w-[52px] justify-center font-mono font-bold">{days}일</Chip>
      <span className="min-w-0 flex-1 truncate text-[calc(13px_*_var(--app-font-scale,1))] font-semibold text-text-primary">
        {subject}
      </span>
      <ExternalLink size={12} className="flex-none text-text-tertiary group-hover:text-link" />
    </a>
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
        className="inline-flex items-center gap-0.5 mx-0.5 px-1.5 py-0.5 rounded border border-bg-border-strong bg-bg-surface text-text-secondary hover:text-link hover:border-link text-[calc(11px_*_var(--app-font-scale,1))] font-mono align-baseline"
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
    <div className="flex items-start gap-3 px-4 py-2.5 border-b border-bg-border last:border-b-0 hover:bg-bg-surface-hover transition-colors">
      <span className="flex-none w-4 text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary font-mono mt-0.5 text-right">{index + 1}.</span>
      <span className="flex-1 min-w-0 text-[calc(12px_*_var(--app-font-scale,1))] text-text-primary leading-relaxed">
        {leadingEmoji && <span className="mr-1 text-[calc(13px_*_var(--app-font-scale,1))]">{leadingEmoji}</span>}
        {anchor && (
          <span className="inline-block align-middle mr-1.5">
            <Chip tone="selected">{anchor}</Chip>
          </span>
        )}
        {linkifyText(body)}
        {taskIds.map((id, i) => (
          <a key={`${id}-${i}`} href={`https://nhnent.dooray.com/project/posts/${id}`}
             target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 rounded border border-bg-border-strong bg-bg-surface text-text-secondary hover:text-link hover:border-link text-[calc(11px_*_var(--app-font-scale,1))] font-mono align-middle"
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
    ? <div className="text-text-secondary text-[calc(11px_*_var(--app-font-scale,1))] leading-relaxed mt-1">{linkifyText(detail)}</div>
    : null
  return (
    <div className="group flex items-start gap-3 px-4 py-3 border-b border-bg-border last:border-b-0 hover:bg-bg-surface-hover transition-colors">
      <div className="min-w-0 flex-1">
        {taskId ? (
          <a href={`https://nhnent.dooray.com/project/posts/${taskId}`} target="_blank" rel="noopener noreferrer"
            className="text-[calc(13px_*_var(--app-font-scale,1))] font-semibold leading-snug text-text-primary no-underline hover:text-link"
            title="두레이에서 열기">
            {subject}
          </a>
        ) : (
          <span className="block text-[calc(13px_*_var(--app-font-scale,1))] font-semibold leading-snug text-text-primary">{subject}</span>
        )}
        {detailNode}
      </div>
      {taskId && <ExternalLink size={12} className="mt-0.5 flex-none text-text-tertiary group-hover:text-link" />}
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
      <div className="text-center text-[calc(11px_*_var(--app-font-scale,1))] text-c-emerald-fg py-2">
        ✓ 피드백 고마워요! 개선에 활용할게요.
      </div>
    )
  }

  return (
    <div className="pt-3 border-t border-bg-border">
      {feedback === null ? (
        /* 아직 고르지 않은 두 선택지다 — 여기에 색을 주면 한쪽이 권장 답처럼 보인다 */
        <div className="flex items-center justify-center gap-3 text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary">
          이번 브리핑 어땠나요?
          <Button variant="secondary" size="sm" onClick={() => submit('up')} leftIcon={<ThumbsUp size={12} />}>
            좋아요
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setFeedback('down')} leftIcon={<ThumbsDown size={12} />}>
            아쉬워요
          </Button>
        </div>
      ) : feedback === 'down' ? (
        <div className="space-y-2">
          <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary text-center">뭐가 아쉬웠나요? (선택)</p>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
            placeholder="예: 긴급 기준이 안 맞아요, 참고사항 태스크를 더 강조해주세요"
            className="ds-input resize-none" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setFeedback(null)}>취소</Button>
            <Button variant="primary" size="sm" onClick={() => submit('down', comment)}>제출</Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default BriefingPanel
