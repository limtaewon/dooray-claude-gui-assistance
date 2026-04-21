import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  LayoutDashboard, Sparkles, Loader2, CheckCircle2, Clock, Target,
  AlertCircle, ArrowRight, Send, FileText, ChevronDown, ChevronRight, RotateCcw, Wand2, Plus
} from 'lucide-react'
import type { DoorayTask, DoorayProject } from '../../../../shared/types/dooray'
import SkillQuickToggle from './SkillQuickToggle'

const CREATE_EXPANDED_KEY = 'dashboard.createExpanded'

/**
 * Phase 1: AI 업무 대시보드
 * - 태스크 상태별 집계 카드
 * - 태스크 빠른 생성 — 제목/본문 편집 영역이 메인, 템플릿/AI는 그 영역을 채우는 보조 도구
 * - 오늘 집중할 태스크 바로가기
 */
function DashboardView(): JSX.Element {
  const [tasks, setTasks] = useState<DoorayTask[]>([])
  const [projects, setProjects] = useState<DoorayProject[]>([])
  const [loading, setLoading] = useState(true)

  // 메인 편집 영역 (두레이에 실제로 생성되는 값)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [nlProject, setNlProject] = useState<string>('')

  // 보조 도구 상태
  const [aiHint, setAiHint] = useState('') // AI에게 줄 자연어 지시 (선택)
  const [composing, setComposing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [activeTemplateName, setActiveTemplateName] = useState<string | null>(null)

  // 두레이 템플릿
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false)

  // 빠른 생성 섹션 접힘/펼침 (기본: 접힘)
  const [createExpanded, setCreateExpanded] = useState<boolean>(() => {
    return localStorage.getItem(CREATE_EXPANDED_KEY) === '1'
  })
  useEffect(() => {
    localStorage.setItem(CREATE_EXPANDED_KEY, createExpanded ? '1' : '0')
  }, [createExpanded])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // 1단계: 프로젝트 목록과 pin 설정을 먼저 가져옴
      const [allProjects, pinnedIds] = await Promise.all([
        window.api.dooray.projects.list(),
        window.api.settings.getProjects()
      ])
      const pinnedSet = new Set(pinnedIds)
      const visibleProjects = pinnedIds.length > 0
        ? allProjects.filter((p) => pinnedSet.has(p.id))
        : allProjects
      setProjects(visibleProjects)
      if (!nlProject && visibleProjects.length > 0) setNlProject(visibleProjects[0].id)

      // 2단계: 표시 대상 프로젝트의 태스크만 조회
      // pinned가 있으면 그것만, 없으면 전체 (기존 동작 유지)
      const targetProjectIds = visibleProjects.map((p) => p.id)
      const taskList = targetProjectIds.length > 0
        ? await window.api.dooray.tasks.list(targetProjectIds)
        : []
      setTasks(taskList)
    } catch { /* ok */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // 선택한 프로젝트의 두레이 템플릿 목록 로드
  useEffect(() => {
    if (!nlProject) { setTemplates([]); setTemplatesError(null); return }
    let cancelled = false
    setTemplatesLoading(true)
    setTemplatesError(null)
    window.api.dooray.tasks.templates(nlProject)
      .then((list) => { if (!cancelled) { setTemplates(list || []); setTemplatesError(null) } })
      .catch((err) => {
        if (!cancelled) {
          setTemplates([])
          setTemplatesError(err instanceof Error ? err.message : '템플릿 불러오기 실패')
        }
      })
      .finally(() => { if (!cancelled) setTemplatesLoading(false) })
    return () => { cancelled = true }
  }, [nlProject])

  const stats = useMemo(() => {
    const byClass: Record<'backlog' | 'registered' | 'working' | 'closed', number> =
      { backlog: 0, registered: 0, working: 0, closed: 0 }
    for (const t of tasks) {
      const cls = (t.workflowClass || 'registered') as keyof typeof byClass
      if (cls in byClass) byClass[cls]++
    }
    const todayKey = new Date().toISOString().substring(0, 10)
    const dueToday = tasks.filter((t) => t.dueDateAt && t.dueDateAt.substring(0, 10) === todayKey).length
    return { ...byClass, total: tasks.length, dueToday }
  }, [tasks])

  /** 템플릿 선택 → 제목/본문 필드를 템플릿 내용으로 채움 */
  const applyTemplate = async (templateId: string, templateName: string): Promise<void> => {
    setTemplateMenuOpen(false)
    if (!nlProject) return
    if ((subject.trim() || body.trim()) && !window.confirm('편집 중인 내용이 있습니다. 템플릿으로 덮어쓸까요?')) return
    try {
      const detail = await window.api.dooray.tasks.templateDetail(nlProject, templateId)
      if (!detail) throw new Error('템플릿을 불러오지 못했습니다')
      setSubject(detail.subject || detail.name || templateName)
      setBody(detail.body || '')
      setActiveTemplateName(detail.name || templateName)
      setResult(null)
    } catch (err) {
      setResult({ type: 'err', text: err instanceof Error ? err.message : '템플릿 로드 실패' })
    }
  }

  /** AI로 채우기:
   * - aiHint(자연어 지시)가 있으면 그걸 기반으로 새로 생성
   * - 이미 subject/body가 있으면 AI가 현재 내용을 참고해 다듬어줌 */
  const composeWithAI = async (): Promise<void> => {
    const hasInput = aiHint.trim() || subject.trim() || body.trim()
    if (!hasInput) {
      setResult({ type: 'err', text: 'AI에게 전달할 자연어 지시 또는 편집 중인 내용이 필요합니다' })
      return
    }
    setComposing(true); setResult(null)
    try {
      const prompt = buildAiPrompt({
        hint: aiHint.trim(),
        existingSubject: subject.trim(),
        existingBody: body.trim(),
        templateName: activeTemplateName
      })
      const raw = await window.api.ai.ask({ prompt, feature: 'summarizeTask' })
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('AI 응답에서 JSON을 찾을 수 없습니다')
      const parsed = JSON.parse(match[0]) as { subject?: string; body?: string }
      if (!parsed.subject) throw new Error('AI 응답의 제목이 비어있습니다')
      setSubject(parsed.subject)
      setBody(parsed.body || '')
    } catch (err) {
      setResult({ type: 'err', text: err instanceof Error ? err.message : 'AI 변환 실패' })
    } finally {
      setComposing(false)
    }
  }

  /** 현재 편집 내용을 두레이에 태스크로 생성 */
  const createOnDooray = async (): Promise<void> => {
    if (!subject.trim()) {
      setResult({ type: 'err', text: '제목을 입력하세요' })
      return
    }
    if (!nlProject) {
      setResult({ type: 'err', text: '프로젝트를 선택하세요' })
      return
    }
    setCreating(true); setResult(null)
    try {
      await window.api.dooray.tasks.create({
        projectId: nlProject,
        subject: subject.trim(),
        body: body
      })
      const proj = projects.find((p) => p.id === nlProject)
      setResult({ type: 'ok', text: `${proj?.code || '프로젝트'}에 "${subject.trim()}" 생성됨` })
      // 초기화
      setSubject(''); setBody(''); setAiHint(''); setActiveTemplateName(null)
      await load()
    } catch (err) {
      setResult({ type: 'err', text: err instanceof Error ? err.message : '태스크 생성 실패' })
    } finally {
      setCreating(false)
    }
  }

  const reset = (): void => {
    if ((subject.trim() || body.trim()) && !window.confirm('편집 중인 내용을 모두 지울까요?')) return
    setSubject(''); setBody(''); setAiHint(''); setActiveTemplateName(null); setResult(null)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5 max-w-5xl mx-auto space-y-5">
        {/* 헤더 */}
        <div className="flex items-center gap-2">
          <LayoutDashboard size={18} className="text-clover-blue" />
          <h2 className="text-lg font-semibold text-text-primary">대시보드</h2>
          <span className="text-[10px] text-text-tertiary">
            {projects.length > 0
              ? `${projects.length}개 프로젝트 기준 · 태스크 탭 사이드바에서 변경`
              : '오늘의 업무 현황'}
          </span>
        </div>

        {/* 상태별 집계 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <StatCard label="전체 태스크" value={stats.total} loading={loading} />
          <StatCard label="진행 중" value={stats.working} icon={Clock} color="text-clover-blue" loading={loading} />
          <StatCard label="등록됨" value={stats.registered} icon={AlertCircle} color="text-clover-orange" loading={loading} />
          <StatCard label="오늘 마감" value={stats.dueToday} icon={Target} color="text-red-400" loading={loading} />
          <StatCard label="완료" value={stats.closed} icon={CheckCircle2} color="text-emerald-400" loading={loading} />
        </div>

        {/* 태스크 빠른 생성 (접힘/펼침) */}
        <div className={`rounded-xl border border-bg-border bg-bg-surface ${createExpanded ? 'p-4 space-y-3' : 'p-3'}`}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCreateExpanded(!createExpanded)}
              className="flex items-center gap-2 flex-1 text-left hover:text-clover-blue transition-colors"
              title={createExpanded ? '접기' : '펼치기'}
            >
              {createExpanded
                ? <ChevronDown size={14} className="text-text-secondary" />
                : <ChevronRight size={14} className="text-text-secondary" />
              }
              <Sparkles size={14} className="text-clover-orange" />
              <h3 className="text-sm font-semibold text-text-primary">태스크 빠른 생성</h3>
              <span className="text-[10px] text-text-tertiary">템플릿 · AI · 직접 입력 모두 가능</span>
            </button>
            {!createExpanded && (
              <button
                onClick={() => setCreateExpanded(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-clover-blue/10 text-clover-blue text-[10px] font-medium hover:bg-clover-blue/20"
              >
                <Plus size={10} /> 새 태스크
              </button>
            )}
            {createExpanded && (
              <SkillQuickToggle target="task" />
            )}
          </div>

          {createExpanded && <>

          {/* 툴바 */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={nlProject}
              onChange={(e) => setNlProject(e.target.value)}
              className="px-3 py-1.5 rounded-md bg-bg-primary border border-bg-border text-xs font-medium text-text-primary focus:outline-none focus:border-clover-blue"
              title="대상 프로젝트"
            >
              {projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
            </select>

            {/* 템플릿 드롭다운 */}
            <div className="relative">
              <button
                onClick={() => setTemplateMenuOpen(!templateMenuOpen)}
                disabled={!nlProject || templatesLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium bg-bg-primary border-bg-border text-text-secondary hover:text-text-primary hover:border-bg-border-light disabled:opacity-40"
                title={nlProject ? '두레이 프로젝트 템플릿에서 불러오기' : '프로젝트를 먼저 선택하세요'}
              >
                {templatesLoading ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                템플릿{templates.length > 0 ? ` ${templates.length}` : ''}
                <ChevronDown size={10} />
              </button>
              {templateMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setTemplateMenuOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 w-72 bg-bg-surface border border-bg-border rounded-lg shadow-2xl z-40 py-1 max-h-72 overflow-y-auto">
                    {templatesError ? (
                      <div className="px-3 py-2 text-[10px] text-red-400 whitespace-pre-wrap">
                        템플릿 불러오기 실패:{'\n'}{templatesError}
                      </div>
                    ) : templates.length === 0 ? (
                      <div className="px-3 py-2 text-[11px] text-text-tertiary">
                        {templatesLoading ? '불러오는 중...' : '이 프로젝트에 저장된 템플릿이 없습니다'}
                      </div>
                    ) : (
                      templates.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => applyTemplate(t.id, t.name)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-text-primary hover:bg-bg-surface-hover text-left"
                        >
                          <FileText size={11} className="text-text-tertiary flex-shrink-0" />
                          <span className="truncate">{t.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            {/* AI 지시 토글은 버튼 자체에 포함 */}
            <button
              onClick={composeWithAI}
              disabled={composing || (!aiHint.trim() && !subject.trim() && !body.trim())}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-clover-blue text-white text-xs font-medium hover:bg-clover-blue/80 disabled:opacity-40"
              title={subject.trim() || body.trim() ? '현재 편집 내용을 AI가 다듬습니다' : '자연어 지시를 AI가 제목/본문으로 변환합니다'}
            >
              {composing
                ? <><Loader2 size={12} className="animate-spin" /> AI 작업 중...</>
                : <><Wand2 size={12} /> AI로 채우기</>
              }
            </button>

            {activeTemplateName && (
              <span className="ml-auto text-[10px] text-text-tertiary flex items-center gap-1">
                <FileText size={10} /> 적용된 템플릿: <span className="text-text-secondary font-medium">{activeTemplateName}</span>
              </span>
            )}
          </div>

          {/* AI 지시 입력 (선택) */}
          <div>
            <label className="text-[10px] text-text-tertiary mb-1 block">
              AI 지시 <span className="text-text-tertiary">(선택 — 자연어로 작성 후 위 &quot;AI로 채우기&quot; 클릭)</span>
            </label>
            <textarea
              value={aiHint}
              onChange={(e) => setAiHint(e.target.value)}
              placeholder="예: 내일까지 로그인 API 리팩토링하고 세션 만료 시간 5분에서 30분으로 변경"
              className="w-full px-3 py-2 rounded-md bg-bg-primary border border-bg-border text-xs text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue resize-none"
              rows={2}
            />
          </div>

          {/* 메인 편집 영역: 제목 + 본문 */}
          <div className="rounded-lg border border-bg-border bg-bg-primary p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-clover-blue uppercase tracking-wide">생성될 내용</span>
              <span className="text-[10px] text-text-tertiary">수정 후 두레이에 생성하세요</span>
            </div>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="제목"
              className="w-full px-3 py-2 rounded-md bg-bg-surface border border-bg-border text-sm font-semibold text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="본문 (마크다운 지원)"
              rows={10}
              className="w-full px-3 py-2 rounded-md bg-bg-surface border border-bg-border text-xs font-mono text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue resize-y"
            />
          </div>

          {/* 하단 액션 */}
          <div className="flex items-center justify-between">
            <button
              onClick={reset}
              disabled={!subject.trim() && !body.trim() && !aiHint.trim()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover disabled:opacity-40"
            >
              <RotateCcw size={11} /> 초기화
            </button>
            <button
              onClick={createOnDooray}
              disabled={creating || !subject.trim() || !nlProject}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 disabled:opacity-40"
            >
              {creating ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              {creating ? '생성 중...' : '두레이에 생성'}
            </button>
          </div>

          {/* 결과 */}
          {result && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs ${
              result.type === 'ok' ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/30'
                : 'bg-red-500/10 text-red-400 border border-red-500/30'
            }`}>
              {result.type === 'ok' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
              {result.text}
            </div>
          )}

          </>}

          {/* 접힘 상태에서 성공 결과만 잠깐 노출 */}
          {!createExpanded && result?.type === 'ok' && (
            <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] bg-emerald-400/10 text-emerald-400 border border-emerald-400/30">
              <CheckCircle2 size={11} />
              {result.text}
            </div>
          )}
        </div>

        {/* 오늘 집중할 태스크 */}
        <div className="rounded-xl border border-bg-border bg-bg-surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target size={14} className="text-clover-blue" />
            <h3 className="text-sm font-semibold text-text-primary">오늘 집중할 태스크</h3>
            <span className="text-[10px] text-text-tertiary">진행 중 + 오늘 마감</span>
          </div>
          <TodayFocusList tasks={tasks} loading={loading} />
        </div>
      </div>
    </div>
  )
}

function buildAiPrompt(p: {
  hint: string
  existingSubject: string
  existingBody: string
  templateName: string | null
}): string {
  const hasExisting = p.existingSubject || p.existingBody
  if (hasExisting) {
    return `아래 두레이 태스크 초안을 다듬으세요. ${p.hint ? `사용자 지시: ${p.hint}` : '가독성과 구조를 개선하세요.'}${p.templateName ? ` (템플릿 "${p.templateName}" 기반)` : ''}

[현재 제목]
${p.existingSubject || '(비어있음)'}

[현재 본문]
${p.existingBody || '(비어있음)'}

JSON 형태로만 응답하세요 (설명/머리말 없이):
{
  "subject": "다듬어진 제목 — 짧고 동사로 시작",
  "body": "다듬어진 본문 — 마크다운. 섹션 구조 유지 또는 개선"
}`
  }
  return `다음 자연어 지시를 두레이(Dooray) 태스크로 변환하세요.

지시: ${p.hint}

JSON 형태로만 응답하세요 (설명/머리말 없이):
{
  "subject": "태스크 제목 — 짧고 동사로 시작 (예: '로그인 API 리팩토링')",
  "body": "태스크 본문 — 마크다운. 목적/배경/체크리스트 포함"
}`
}

function StatCard({ label, value, icon: Icon, color, loading }: {
  label: string; value: number; icon?: typeof Clock; color?: string; loading: boolean
}): JSX.Element {
  return (
    <div className="rounded-lg border border-bg-border bg-bg-surface p-3">
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon size={11} className={color || 'text-text-tertiary'} />}
        <span className="text-[10px] text-text-secondary uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-xl font-bold text-text-primary">
        {loading ? <span className="text-text-tertiary text-sm">...</span> : value}
      </div>
    </div>
  )
}

function TodayFocusList({ tasks, loading }: { tasks: DoorayTask[]; loading: boolean }): JSX.Element {
  const focus = useMemo(() => {
    const todayKey = new Date().toISOString().substring(0, 10)
    const working = tasks.filter((t) => t.workflowClass === 'working')
    const dueToday = tasks.filter((t) => t.dueDateAt && t.dueDateAt.substring(0, 10) === todayKey)
    const merged: DoorayTask[] = []
    const seen = new Set<string>()
    for (const t of [...dueToday, ...working]) {
      if (!seen.has(t.id)) { seen.add(t.id); merged.push(t) }
    }
    return merged.slice(0, 8)
  }, [tasks])

  if (loading) return <p className="text-[11px] text-text-tertiary">불러오는 중...</p>
  if (focus.length === 0) return <p className="text-[11px] text-text-tertiary">오늘 집중할 태스크가 없습니다.</p>

  return (
    <div className="space-y-1">
      {focus.map((t) => (
        <a
          key={t.id}
          href={`https://nhnent.dooray.com/project/posts/${t.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-bg-surface-hover transition-colors"
          title="두레이에서 열기"
        >
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
            t.workflowClass === 'working' ? 'bg-clover-blue/10 text-clover-blue' : 'bg-clover-orange/10 text-clover-orange'
          }`}>
            {t.workflowClass === 'working' ? '진행 중' : (t.workflow?.name || '등록')}
          </span>
          <span className="text-xs text-text-primary truncate flex-1">{t.subject}</span>
          {t.projectCode && <span className="text-[10px] text-text-tertiary">{t.projectCode}</span>}
          {t.dueDateAt && (
            <span className="text-[10px] text-red-400">
              {new Date(t.dueDateAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
            </span>
          )}
          <ArrowRight size={10} className="text-text-tertiary flex-shrink-0" />
        </a>
      ))}
    </div>
  )
}

export default DashboardView
