import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  LayoutDashboard, Plus, Sparkles, Loader2, CheckCircle2, Clock, Target,
  AlertCircle, ArrowRight, Send, X, FileText, ChevronDown
} from 'lucide-react'
import type { DoorayTask, DoorayProject } from '../../../../shared/types/dooray'
import SkillQuickToggle from './SkillQuickToggle'

/**
 * Phase 1: AI 업무 대시보드
 * - 태스크 상태별 집계 카드
 * - 자연어 태스크 생성 (입력 → AI가 제목/본문 구조화 → 두레이에 생성)
 * - 오늘 집중할 태스크 바로가기
 */
function DashboardView(): JSX.Element {
  const [tasks, setTasks] = useState<DoorayTask[]>([])
  const [projects, setProjects] = useState<DoorayProject[]>([])
  const [loading, setLoading] = useState(true)

  // 자연어 태스크 생성 상태
  const [nlInput, setNlInput] = useState('')
  const [nlProject, setNlProject] = useState<string>('')
  const [composing, setComposing] = useState(false)
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null)
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // 두레이 템플릿
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [allProjects, pinnedIds, taskList] = await Promise.all([
        window.api.dooray.projects.list(),
        window.api.settings.getProjects(),
        window.api.dooray.tasks.list()
      ])
      const pinnedSet = new Set(pinnedIds)
      const visibleProjects = pinnedIds.length > 0
        ? allProjects.filter((p) => pinnedSet.has(p.id))
        : allProjects
      setProjects(visibleProjects)
      setTasks(taskList)
      if (!nlProject && visibleProjects.length > 0) setNlProject(visibleProjects[0].id)
    } catch { /* ok */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // 선택한 프로젝트의 두레이 템플릿 목록 로드
  const [templatesError, setTemplatesError] = useState<string | null>(null)
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

  const pickTemplate = async (templateId: string): Promise<void> => {
    setTemplateMenuOpen(false)
    if (!nlProject) return
    try {
      const detail = await window.api.dooray.tasks.templateDetail(nlProject, templateId)
      if (!detail) throw new Error('템플릿을 불러오지 못했습니다')
      // 템플릿 본문을 미리보기로 바로 채움 (AI 거치지 않음)
      setPreview({ subject: detail.subject || detail.name, body: detail.body })
      setResult(null)
    } catch (err) {
      setResult({ type: 'err', text: err instanceof Error ? err.message : '템플릿 로드 실패' })
    }
  }

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

  /** 자연어 → AI로 구조화된 태스크 만들기 (생성은 사용자 확인 후) */
  const composeTask = async (): Promise<void> => {
    if (!nlInput.trim()) return
    setComposing(true); setResult(null); setPreview(null)
    try {
      const prompt = `다음 자연어 지시를 두레이(Dooray) 태스크로 변환하세요.

지시: ${nlInput}

JSON 형태로만 응답하세요 (설명/머리말 없이):
{
  "subject": "태스크 제목 — 짧고 동사로 시작 (예: '로그인 API 리팩토링')",
  "body": "태스크 본문 — 마크다운. 목적/배경/체크리스트 포함"
}`
      const raw = await window.api.ai.ask({ prompt, feature: 'summarizeTask' })
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('AI 응답에서 JSON을 찾을 수 없습니다')
      const parsed = JSON.parse(match[0]) as { subject?: string; body?: string }
      if (!parsed.subject) throw new Error('제목이 비어있습니다')
      setPreview({ subject: parsed.subject, body: parsed.body || '' })
    } catch (err) {
      setResult({ type: 'err', text: err instanceof Error ? err.message : 'AI 변환 실패' })
    } finally {
      setComposing(false)
    }
  }

  /** 미리보기를 실제 태스크로 생성 */
  const confirmCreate = async (): Promise<void> => {
    if (!preview || !nlProject) return
    setCreating(true); setResult(null)
    try {
      await window.api.dooray.tasks.create({
        projectId: nlProject,
        subject: preview.subject,
        body: preview.body
      })
      const proj = projects.find((p) => p.id === nlProject)
      setResult({ type: 'ok', text: `${proj?.code || '프로젝트'}에 태스크 "${preview.subject}" 생성됨` })
      setNlInput('')
      setPreview(null)
      await load()
    } catch (err) {
      setResult({ type: 'err', text: err instanceof Error ? err.message : '태스크 생성 실패' })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5 max-w-5xl mx-auto space-y-5">
        {/* 헤더 */}
        <div className="flex items-center gap-2">
          <LayoutDashboard size={18} className="text-clover-blue" />
          <h2 className="text-lg font-semibold text-text-primary">대시보드</h2>
          <span className="text-[10px] text-text-tertiary">오늘의 업무 현황</span>
        </div>

        {/* 상태별 집계 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <StatCard label="전체 태스크" value={stats.total} loading={loading} />
          <StatCard label="진행 중" value={stats.working} icon={Clock} color="text-clover-blue" loading={loading} />
          <StatCard label="등록됨" value={stats.registered} icon={AlertCircle} color="text-clover-orange" loading={loading} />
          <StatCard label="오늘 마감" value={stats.dueToday} icon={Target} color="text-red-400" loading={loading} />
          <StatCard label="완료" value={stats.closed} icon={CheckCircle2} color="text-emerald-400" loading={loading} />
        </div>

        {/* 자연어 태스크 생성 */}
        <div className="rounded-xl border border-bg-border bg-bg-surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-clover-orange" />
            <h3 className="text-sm font-semibold text-text-primary">자연어로 태스크 생성</h3>
            <span className="text-[10px] text-text-tertiary">AI가 제목과 본문을 구조화해서 두레이에 생성합니다</span>
            <div className="ml-auto flex items-center gap-1">
              {/* 두레이 템플릿 드롭다운 — 스킬 버튼과 동일한 사이즈 */}
              <div className="relative">
                <button
                  onClick={() => setTemplateMenuOpen(!templateMenuOpen)}
                  disabled={!nlProject || templatesLoading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all bg-bg-surface border-bg-border text-text-secondary hover:text-text-primary hover:border-bg-border-light disabled:opacity-40"
                  title={nlProject ? '두레이 프로젝트 템플릿에서 불러오기' : '프로젝트를 먼저 선택하세요'}
                >
                  {templatesLoading ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                  템플릿{templates.length > 0 ? ` ${templates.length}` : ''}
                  <ChevronDown size={10} />
                </button>
                {templateMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setTemplateMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 w-72 bg-bg-surface border border-bg-border rounded-lg shadow-2xl z-40 py-1 max-h-72 overflow-y-auto">
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
                            onClick={() => pickTemplate(t.id)}
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
              {/* 스킬 토글 */}
              <SkillQuickToggle target="task" />
            </div>
          </div>
          <div className="space-y-2">
            <textarea
              value={nlInput}
              onChange={(e) => { setNlInput(e.target.value); setPreview(null); setResult(null) }}
              placeholder="예: 내일까지 로그인 API 리팩토링하고 세션 만료 시간 5분에서 30분으로 변경"
              className="w-full px-3 py-2 rounded-lg bg-bg-primary border border-bg-border text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue resize-none"
              rows={3}
            />
            <div className="flex items-center gap-2">
              <select
                value={nlProject}
                onChange={(e) => setNlProject(e.target.value)}
                className="px-3 py-1.5 rounded-md bg-bg-primary border border-bg-border text-xs font-medium text-text-primary focus:outline-none focus:border-clover-blue"
              >
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
              </select>
              <button
                onClick={composeTask}
                disabled={composing || !nlInput.trim() || !nlProject}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-clover-blue text-white text-xs font-medium hover:bg-clover-blue/80 disabled:opacity-40"
              >
                {composing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {composing ? 'AI 변환 중...' : 'AI로 구조화'}
              </button>
              <span className="text-[10px] text-text-tertiary ml-auto">생성 전 미리보기를 확인합니다</span>
            </div>
          </div>

          {/* 미리보기 */}
          {preview && (
            <div className="mt-3 rounded-lg border border-clover-blue/30 bg-clover-blue/5 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-clover-blue uppercase">미리보기</span>
                <button onClick={() => setPreview(null)} className="ml-auto text-text-tertiary hover:text-text-secondary">
                  <X size={12} />
                </button>
              </div>
              <input
                value={preview.subject}
                onChange={(e) => setPreview({ ...preview, subject: e.target.value })}
                className="w-full px-2 py-1 rounded bg-bg-primary border border-bg-border text-sm font-semibold text-text-primary focus:outline-none focus:border-clover-blue"
              />
              <textarea
                value={preview.body}
                onChange={(e) => setPreview({ ...preview, body: e.target.value })}
                rows={5}
                className="w-full px-2 py-1 rounded bg-bg-primary border border-bg-border text-xs text-text-primary font-mono focus:outline-none focus:border-clover-blue resize-none"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setPreview(null)}
                  className="px-3 py-1 rounded-md text-[11px] text-text-secondary hover:text-text-primary">
                  취소
                </button>
                <button onClick={confirmCreate} disabled={creating || !preview.subject.trim()}
                  className="flex items-center gap-1 px-3 py-1 rounded-md bg-emerald-500 text-white text-[11px] font-medium hover:bg-emerald-600 disabled:opacity-40">
                  {creating ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                  {creating ? '생성 중...' : '두레이에 생성'}
                </button>
              </div>
            </div>
          )}

          {/* 결과 */}
          {result && (
            <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-md text-xs ${
              result.type === 'ok' ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/30'
                : 'bg-red-500/10 text-red-400 border border-red-500/30'
            }`}>
              {result.type === 'ok' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
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
