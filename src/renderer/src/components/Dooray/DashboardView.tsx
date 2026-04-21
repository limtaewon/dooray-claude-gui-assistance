import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  LayoutDashboard, Plus, Loader2, RotateCcw, Target, ArrowRight, FileText,
  Wand2, ChevronRight, ChevronDown, Send, Filter
} from 'lucide-react'
import type { DoorayTask, DoorayProject } from '../../../../shared/types/dooray'
import SkillQuickToggle from './SkillQuickToggle'
import {
  Button, Chip, Card, Avatar, Input, Textarea, FieldLabel, Kbd,
  EmptyView, LoadingView, useToast, type ChipTone
} from '../common/ds'

const CREATE_EXPANDED_KEY = 'dashboard.createExpanded'

/* Stat card 톤 매핑 — DS stat card 디자인 (색상 숫자 + 좌측 color dot) */
type StatTone = 'neutral' | 'blue' | 'orange' | 'red' | 'emerald'
const STAT_DOT: Record<Exclude<StatTone, 'neutral'>, string> = {
  blue:    '#60A5FA',
  orange:  '#FB923C',
  red:     '#F87171',
  emerald: '#22C55E'
}
const STAT_VALUE_COLOR: Record<StatTone, string> = {
  neutral: 'var(--text-primary)',
  blue:    '#60A5FA',
  orange:  '#FB923C',
  red:     '#F87171',
  emerald: '#22C55E'
}

function StatCard({ label, value, tone = 'neutral', loading }: {
  label: string; value: number; tone?: StatTone; loading?: boolean
}): JSX.Element {
  return (
    <Card className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide text-text-secondary">
        {tone !== 'neutral' && (
          <span className="w-[10px] h-[10px] rounded-[2px] flex-none" style={{ background: STAT_DOT[tone] }} />
        )}
        {label}
      </div>
      <div className="text-[20px] font-bold leading-none" style={{ color: STAT_VALUE_COLOR[tone] }}>
        {loading ? <span className="text-sm text-text-tertiary">...</span> : value}
      </div>
    </Card>
  )
}

/* 워크플로우 class → Chip 톤 매핑 */
const CLS_CHIP: Record<string, { tone: ChipTone; label: string }> = {
  working:    { tone: 'blue',    label: '진행 중' },
  registered: { tone: 'orange',  label: '등록' },
  backlog:    { tone: 'neutral', label: '백로그' },
  done:       { tone: 'emerald', label: '완료' },
  closed:     { tone: 'emerald', label: '완료' }
}

function DashboardView(): JSX.Element {
  const [tasks, setTasks] = useState<DoorayTask[]>([])
  const [projects, setProjects] = useState<DoorayProject[]>([])
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  // 편집 상태
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [aiHint, setAiHint] = useState('')
  const [nlProject, setNlProject] = useState<string>('')
  const [composing, setComposing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [activeTemplateName, setActiveTemplateName] = useState<string | null>(null)

  // 템플릿
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false)

  const [createExpanded, setCreateExpanded] = useState<boolean>(
    () => localStorage.getItem(CREATE_EXPANDED_KEY) === '1'
  )
  useEffect(() => {
    localStorage.setItem(CREATE_EXPANDED_KEY, createExpanded ? '1' : '0')
  }, [createExpanded])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [allProjects, pinnedIds] = await Promise.all([
        window.api.dooray.projects.list(),
        window.api.settings.getProjects()
      ])
      const pinnedSet = new Set(pinnedIds)
      const visible = pinnedIds.length > 0
        ? allProjects.filter((p) => pinnedSet.has(p.id))
        : allProjects
      setProjects(visible)
      if (!nlProject && visible.length > 0) setNlProject(visible[0].id)

      const targetIds = visible.map((p) => p.id)
      const taskList = targetIds.length > 0 ? await window.api.dooray.tasks.list(targetIds) : []
      setTasks(taskList)
    } catch { /* ok */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!nlProject) { setTemplates([]); return }
    let cancelled = false
    setTemplatesLoading(true)
    window.api.dooray.tasks.templates(nlProject)
      .then((list) => { if (!cancelled) setTemplates(list || []) })
      .catch(() => { if (!cancelled) setTemplates([]) })
      .finally(() => { if (!cancelled) setTemplatesLoading(false) })
    return () => { cancelled = true }
  }, [nlProject])

  // 통계
  const stats = useMemo(() => {
    const byClass: Record<'backlog' | 'registered' | 'working' | 'closed', number> =
      { backlog: 0, registered: 0, working: 0, closed: 0 }
    for (const t of tasks) {
      const cls = (t.workflowClass || 'registered') as keyof typeof byClass
      if (cls in byClass) byClass[cls]++
    }
    const todayKey = new Date().toISOString().substring(0, 10)
    const dueToday = tasks.filter((t) => t.dueDateAt?.substring(0, 10) === todayKey).length
    return { ...byClass, total: tasks.length, dueToday }
  }, [tasks])

  // 오늘 집중 태스크
  const focus = useMemo(() => {
    const todayKey = new Date().toISOString().substring(0, 10)
    const working = tasks.filter((t) => t.workflowClass === 'working')
    const dueToday = tasks.filter((t) => t.dueDateAt?.substring(0, 10) === todayKey)
    const seen = new Set<string>()
    const merged: DoorayTask[] = []
    for (const t of [...dueToday, ...working]) {
      if (!seen.has(t.id)) { seen.add(t.id); merged.push(t) }
    }
    return merged.slice(0, 10)
  }, [tasks])

  // 템플릿 적용
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
    } catch (err) {
      toast.error('템플릿 로드 실패', err instanceof Error ? err.message : String(err))
    }
  }

  // AI로 채우기
  const composeWithAI = async (): Promise<void> => {
    const hasInput = aiHint.trim() || subject.trim() || body.trim()
    if (!hasInput) {
      toast.warn('내용이 필요해요', 'AI 지시 또는 편집 중인 내용이 있어야 합니다')
      return
    }
    setComposing(true)
    try {
      const hasExisting = subject.trim() || body.trim()
      const prompt = hasExisting
        ? `다음 두레이 태스크 초안을 다듬으세요.${aiHint.trim() ? ` 지시: ${aiHint.trim()}` : ' 가독성·구조 개선.'}${activeTemplateName ? ` (템플릿 "${activeTemplateName}" 기반)` : ''}

[현재 제목]
${subject || '(비어있음)'}

[현재 본문]
${body || '(비어있음)'}

JSON 형태로만 응답:
{"subject": "...", "body": "..."}`
        : `다음 자연어 지시를 두레이 태스크로 변환하세요.

지시: ${aiHint.trim()}

JSON 형태로만 응답:
{"subject": "짧고 동사로 시작한 제목", "body": "마크다운 본문 — 목적/배경/체크리스트"}`

      const raw = await window.api.ai.ask({ prompt, feature: 'summarizeTask' })
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('AI 응답에서 JSON을 찾을 수 없습니다')
      const parsed = JSON.parse(match[0]) as { subject?: string; body?: string }
      if (!parsed.subject) throw new Error('제목이 비어있습니다')
      setSubject(parsed.subject)
      setBody(parsed.body || '')
      toast.ai('AI가 채웠어요', '제목과 본문을 확인 후 생성하세요')
    } catch (err) {
      toast.error('AI 변환 실패', err instanceof Error ? err.message : String(err))
    } finally {
      setComposing(false)
    }
  }

  const createOnDooray = async (): Promise<void> => {
    if (!subject.trim()) { toast.warn('제목이 필요해요', '태스크 제목을 먼저 입력하세요'); return }
    if (!nlProject) { toast.warn('프로젝트를 선택하세요', ''); return }
    setCreating(true)
    try {
      await window.api.dooray.tasks.create({
        projectId: nlProject,
        subject: subject.trim(),
        body: body
      })
      const proj = projects.find((p) => p.id === nlProject)
      toast.success(`${proj?.code || '프로젝트'}에 생성됨`, `"${subject.trim()}" 태스크가 두레이에 등록됐어요`)
      setSubject(''); setBody(''); setAiHint(''); setActiveTemplateName(null)
      await load()
    } catch (err) {
      toast.error('태스크 생성 실패', err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  const reset = (): void => {
    if ((subject.trim() || body.trim()) && !window.confirm('편집 중인 내용을 모두 지울까요?')) return
    setSubject(''); setBody(''); setAiHint(''); setActiveTemplateName(null)
  }

  const projectCodes = useMemo(() => projects.map((p) => p.code).join(' · '), [projects])

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 py-4 max-w-6xl mx-auto space-y-3">
        {/* Page head */}
        <div className="flex items-center gap-2">
          <LayoutDashboard size={15} className="text-text-primary" />
          <span className="text-[14px] font-semibold text-text-primary">대시보드</span>
          {projectCodes && <Chip tone="neutral">{projectCodes}</Chip>}
          <div className="flex-1" />
          <Button variant="icon" size="sm" title="필터" aria-label="필터">
            <Filter size={12} />
          </Button>
          <Button variant="secondary" size="sm" onClick={load} leftIcon={<RotateCcw size={11} />}>
            새로고침
          </Button>
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-5 gap-2">
          <StatCard label="전체 태스크" value={stats.total} loading={loading} />
          <StatCard label="진행 중" value={stats.working} tone="blue" loading={loading} />
          <StatCard label="등록됨" value={stats.registered} tone="orange" loading={loading} />
          <StatCard label="오늘 마감" value={stats.dueToday} tone="red" loading={loading} />
          <StatCard label="완료" value={stats.closed} tone="emerald" loading={loading} />
        </div>

        {/* Quick create (collapsible) */}
        <Card className="!p-0 overflow-visible">
          <div className="flex items-center gap-2 w-full px-3 py-2 cursor-pointer"
            onClick={() => setCreateExpanded(!createExpanded)}
          >
            {createExpanded
              ? <ChevronDown size={12} className="text-text-secondary" />
              : <ChevronRight size={12} className="text-text-secondary" />}
            <Plus size={12} className="text-clover-blue" />
            <span className="text-[12px] font-semibold text-text-primary">빠른 태스크 생성</span>
            <span className="text-[10px] text-text-tertiary">· 템플릿 · AI · 직접 입력 모두 가능</span>
            <div className="flex-1" />
            <Kbd>⌘N</Kbd>
          </div>

          {createExpanded && (
            <div className="px-3 pb-3 pt-2 border-t border-bg-border flex flex-col gap-2">
              {/* 프로젝트 + 제목 */}
              <div className="grid grid-cols-[160px_1fr] gap-2">
                <div className="flex flex-col gap-1">
                  <FieldLabel>프로젝트</FieldLabel>
                  <select
                    className="ds-input sm"
                    value={nlProject}
                    onChange={(e) => setNlProject(e.target.value)}
                  >
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <FieldLabel>제목</FieldLabel>
                  <Input
                    size="sm"
                    placeholder="예: 로그인 세션 만료 이슈 수정"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>
              </div>

              {/* 본문 + 도구 바 */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <FieldLabel className="!mb-0">본문</FieldLabel>
                  <span className="text-[10px] text-text-tertiary">· 마크다운</span>
                  {activeTemplateName && (
                    <span className="text-[10px] text-text-tertiary">· 템플릿: <span className="text-text-secondary font-medium">{activeTemplateName}</span></span>
                  )}
                  <div className="flex-1" />

                  {/* 템플릿 드롭다운 */}
                  <div className="relative">
                    <Button
                      variant="ghost" size="xs"
                      onClick={() => setTemplateMenuOpen((o) => !o)}
                      disabled={!nlProject || templatesLoading}
                      leftIcon={templatesLoading ? <Loader2 size={10} className="animate-spin" /> : <FileText size={10} />}
                    >
                      템플릿{templates.length > 0 ? ` ${templates.length}` : ''}
                    </Button>
                    {templateMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setTemplateMenuOpen(false)} />
                        <div className="ds-menu" style={{ top: 'calc(100% + 4px)', right: 0, minWidth: 220 }}>
                          {templates.length === 0 ? (
                            <div className="px-3 py-2 text-[10px] text-text-tertiary">
                              저장된 템플릿이 없습니다
                            </div>
                          ) : (
                            templates.map((t) => (
                              <div key={t.id} className="ds-menu-item"
                                onClick={() => applyTemplate(t.id, t.name)}>
                                <FileText size={11} />
                                <span className="truncate">{t.name}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  <SkillQuickToggle target="task" />
                  <Button variant="ai" size="xs" onClick={composeWithAI}
                    disabled={composing}
                    leftIcon={composing ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}>
                    {composing ? 'AI 작업 중...' : 'AI로 채우기'}
                  </Button>
                </div>

                <Textarea
                  rows={4}
                  className="!font-mono"
                  style={{ fontSize: 11, resize: 'vertical' }}
                  placeholder={'## 요약\n- [ ] 세션 만료 5분 → 30분\n\n## 배경\n'}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>

              {/* AI 지시 (선택) */}
              <div className="flex flex-col gap-1">
                <FieldLabel>AI 지시 (선택)</FieldLabel>
                <Input
                  size="sm"
                  placeholder="자연어로 설명하고 'AI로 채우기' 클릭"
                  value={aiHint}
                  onChange={(e) => setAiHint(e.target.value)}
                />
              </div>

              {/* 하단 액션 */}
              <div className="flex items-center gap-2">
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={reset}>취소</Button>
                <Button variant="success" size="sm"
                  onClick={createOnDooray}
                  disabled={creating || !subject.trim()}
                  leftIcon={creating ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}>
                  {creating ? '생성 중...' : '두레이에 생성'}
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Today focus list */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Target size={13} className="text-text-secondary" />
            <span className="text-[12px] font-semibold text-text-primary">오늘 집중할 태스크</span>
            <Chip tone="neutral">{focus.filter((t) => t.workflowClass !== 'closed').length}</Chip>
            <span className="text-[10px] text-text-tertiary">진행 중 + 오늘 마감</span>
            <div className="flex-1" />
          </div>

          {loading ? (
            <Card><LoadingView label="태스크 불러오는 중..." /></Card>
          ) : focus.length === 0 ? (
            <Card>
              <EmptyView icon={Target} title="오늘 집중할 태스크가 없습니다" body="진행 중이거나 오늘 마감인 태스크가 여기 표시돼요" />
            </Card>
          ) : (
            <Card className="!p-[3px]">
              {focus.map((t) => {
                const chip = CLS_CHIP[t.workflowClass] || CLS_CHIP.registered
                const assigneeName = '' // 현재 task에 assignee 정보 없음 — 향후 detail에서 가져올 수 있음
                const dueStr = formatDue(t.dueDateAt)
                const isDueToday = dueStr === '오늘'
                return (
                  <a
                    key={t.id}
                    href={`https://nhnent.dooray.com/project/posts/${t.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-2 py-[5px] rounded-[5px] cursor-pointer hover:bg-bg-surface-hover transition-colors"
                  >
                    <Chip tone={chip.tone}>{chip.label}</Chip>
                    <span className="flex-1 text-[12px] text-text-primary truncate">{t.subject}</span>
                    {assigneeName && <Avatar name={assigneeName} size="sm" />}
                    {t.projectCode && (
                      <span className="font-mono text-[10px] text-text-tertiary">{t.projectCode}</span>
                    )}
                    {dueStr && (
                      <span
                        className="text-[10px] whitespace-nowrap"
                        style={{ color: isDueToday ? '#F87171' : 'var(--text-tertiary)' }}
                      >
                        {dueStr}
                      </span>
                    )}
                    <ArrowRight size={11} className="text-text-tertiary flex-none" />
                  </a>
                )
              })}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function formatDue(due?: string): string {
  if (!due) return ''
  const todayKey = new Date().toISOString().substring(0, 10)
  const dueKey = due.substring(0, 10)
  if (dueKey === todayKey) return '오늘'
  const d = new Date(due)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

export default DashboardView
