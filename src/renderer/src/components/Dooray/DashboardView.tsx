import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  LayoutDashboard, Plus, Loader2, RotateCcw, Target, ArrowRight, FileText,
  Wand2, ChevronRight, ChevronDown, Send, Timer, Image as ImageIcon, X
} from 'lucide-react'
import type { DoorayTask, DoorayProject } from '../../../../shared/types/dooray'
import SkillQuickToggle from './SkillQuickToggle'
import AIToolsPopover from '../common/AIToolsPopover'
import {
  Button, Chip, Card, Avatar, Input, Textarea, FieldLabel, Kbd,
  EmptyView, LoadingView, useToast, type ChipTone
} from '../common/ds'
import { useErrorReport } from '../ErrorReport/ErrorReportProvider'

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
      <div className="flex items-center gap-1.5 text-[calc(9px_*_var(--app-font-scale,1))] font-semibold uppercase tracking-wide text-text-secondary">
        {tone !== 'neutral' && (
          <span className="w-[10px] h-[10px] rounded-[2px] flex-none" style={{ background: STAT_DOT[tone] }} />
        )}
        {label}
      </div>
      <div className="text-[calc(20px_*_var(--app-font-scale,1))] font-bold leading-none" style={{ color: STAT_VALUE_COLOR[tone] }}>
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
  const errorReport = useErrorReport()

  // 편집 상태
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [aiHint, setAiHint] = useState('')
  const [nlProject, setNlProject] = useState<string>('')
  const [composing, setComposing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [activeTemplateName, setActiveTemplateName] = useState<string | null>(null)
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null)

  // 템플릿
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false)
  // 빠른 태스크 생성: 프로젝트별 태그. 일부 프로젝트는 태그 필수라 미선택 시 생성 실패.
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; name: string; color: string }>>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  // AI 자동작성 이미지 첨부 (paste/drop) — 절대경로 list
  const [aiImages, setAiImages] = useState<string[]>([])
  const [aiDropActive, setAiDropActive] = useState(false)

  const [createExpanded, setCreateExpanded] = useState<boolean>(
    () => localStorage.getItem(CREATE_EXPANDED_KEY) === '1'
  )
  useEffect(() => {
    localStorage.setItem(CREATE_EXPANDED_KEY, createExpanded ? '1' : '0')
  }, [createExpanded])

  // 자동 동기화 — 0 이면 끔. 분 단위. 설정은 main 의 settings store 에 영속.
  const [autoSyncMin, setAutoSyncMin] = useState<number>(0)
  const [autoSyncMenuOpen, setAutoSyncMenuOpen] = useState(false)
  useEffect(() => {
    window.api.settings.get('dashboardAutoSyncMin')
      .then((v) => { if (typeof v === 'number') setAutoSyncMin(v) })
      .catch(() => { /* ok */ })
  }, [])

  const load = useCallback(async (force = false) => {
    console.log(`[Dashboard] 새로고침 force=${force}`)
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
      const taskList = targetIds.length > 0 ? await window.api.dooray.tasks.list(targetIds, force) : []
      setTasks(taskList)
    } catch { /* ok */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // 자동 동기화 인터벌 — autoSyncMin > 0 일 때만 활성. force=true 로 캐시 우회.
  useEffect(() => {
    if (autoSyncMin <= 0) return
    const id = setInterval(() => { void load(true) }, autoSyncMin * 60_000)
    return () => clearInterval(id)
  }, [autoSyncMin, load])

  const setAndSaveAutoSync = (min: number): void => {
    setAutoSyncMin(min)
    window.api.settings.set('dashboardAutoSyncMin', min).catch(() => { /* ok */ })
    setAutoSyncMenuOpen(false)
  }

  useEffect(() => {
    if (!nlProject) { setTemplates([]); setAvailableTags([]); setSelectedTagIds([]); return }
    let cancelled = false
    setTemplatesLoading(true)
    window.api.dooray.tasks.templates(nlProject)
      .then((list) => { if (!cancelled) setTemplates(list || []) })
      .catch(() => { if (!cancelled) setTemplates([]) })
      .finally(() => { if (!cancelled) setTemplatesLoading(false) })
    // 태그도 같이 로드. 프로젝트 변경 시 이전 선택은 초기화.
    setSelectedTagIds([])
    window.api.dooray.tasks.tags(nlProject)
      .then((list) => { if (!cancelled) setAvailableTags(list || []) })
      .catch(() => { if (!cancelled) setAvailableTags([]) })
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
      setActiveTemplateId(templateId)
    } catch (err) {
      toast.error('템플릿 로드 실패', err instanceof Error ? err.message : String(err))
    }
  }

  // AI로 채우기
  const composeWithAI = async (): Promise<void> => {
    const hasInput = aiHint.trim() || subject.trim() || body.trim() || aiImages.length > 0
    if (!hasInput) {
      toast.warn('내용이 필요해요', 'AI 지시·편집 중인 내용·이미지 중 하나는 있어야 합니다')
      return
    }
    setComposing(true)
    try {
      const hasExisting = subject.trim() || body.trim()
      // 태그 후보 — id/name 둘 다 노출해 AI 가 정확한 id 로 선택하도록
      const tagCatalog = availableTags.length > 0
        ? `\n\n[선택 가능한 태그 — 가장 적합한 것만 골라 id 로 반환]
${JSON.stringify(availableTags.map((t) => ({ id: t.id, name: t.name })))}`
        : ''
      const imageHint = aiImages.length > 0 ? `\n\n첨부된 이미지를 우선 분석하여 화면/오류/스크린샷 등 시각 정보를 본문에 반영하세요.` : ''
      const prompt = hasExisting
        ? `다음 두레이 태스크 초안을 다듬으세요.${aiHint.trim() ? ` 지시: ${aiHint.trim()}` : ' 가독성·구조 개선.'}${activeTemplateName ? ` (템플릿 "${activeTemplateName}" 기반)` : ''}${imageHint}

[현재 제목]
${subject || '(비어있음)'}

[현재 본문]
${body || '(비어있음)'}${tagCatalog}

JSON 형태로만 응답:
{"subject": "...", "body": "...", "tagIds": ["선택한 태그 id 0~N개"]}`
        : `다음 자연어 지시를 두레이 태스크로 변환하세요.${imageHint}

지시: ${aiHint.trim() || '(첨부 이미지를 분석해서 적절한 태스크 초안 작성)'}${tagCatalog}

JSON 형태로만 응답:
{"subject": "짧고 동사로 시작한 제목", "body": "마크다운 본문 — 목적/배경/체크리스트", "tagIds": ["선택한 태그 id 0~N개"]}`

      // task 스킬이 mcp__dooray-mcp__* 같은 도구 호출을 지시할 수 있으므로 사용자가 선택한 MCP 서버 목록을 함께 넘긴다.
      const mcpServers = await AIToolsPopover.loadSelected('task')
      const raw = await window.api.ai.ask({
        prompt,
        feature: 'summarizeTask',
        imagePaths: aiImages.length > 0 ? aiImages : undefined,
        mcpServers: mcpServers.length > 0 ? mcpServers : undefined
      })
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('AI 응답에서 JSON을 찾을 수 없습니다')
      const parsed = JSON.parse(match[0]) as { subject?: string; body?: string; tagIds?: string[] }
      if (!parsed.subject) throw new Error('제목이 비어있습니다')
      setSubject(parsed.subject)
      setBody(parsed.body || '')
      // 태그 자동 선택 — 응답에 명시된 tagIds 중 실제 availableTags 에 있는 것만 반영
      if (Array.isArray(parsed.tagIds) && parsed.tagIds.length > 0) {
        const valid = new Set(availableTags.map((t) => t.id))
        const picked = parsed.tagIds.filter((id) => valid.has(id))
        if (picked.length > 0) setSelectedTagIds(picked)
      }
      toast.ai('AI가 채웠어요', `제목·본문${parsed.tagIds && parsed.tagIds.length > 0 ? '·태그' : ''}을 확인 후 생성하세요`)
    } catch (err) {
      toast.error('AI 변환 실패', err instanceof Error ? err.message : String(err), {
        label: '🐞 리포트',
        onClick: errorReport.open
      })
    } finally {
      setComposing(false)
    }
  }

  // 이미지 첨부 — File 또는 ArrayBuffer 받아서 main 에 저장 후 절대경로를 state 에 추가
  const attachImage = async (file: File): Promise<void> => {
    try {
      const buf = await file.arrayBuffer()
      const name = file.name || `pasted-${Date.now()}.png`
      const abs = await window.api.claude.saveAttachment(name, buf)
      setAiImages((prev) => [...prev, abs])
    } catch (err) {
      toast.error('이미지 첨부 실패', err instanceof Error ? err.message : String(err))
    }
  }

  const handleAiPaste = useCallback(async (e: React.ClipboardEvent): Promise<void> => {
    const items = Array.from(e.clipboardData?.items || [])
    const imgs = items.filter((it) => it.type.startsWith('image/'))
    if (imgs.length === 0) return
    e.preventDefault()
    for (const it of imgs) {
      const f = it.getAsFile()
      if (f) await attachImage(f)
    }
  }, [])

  const handleAiDrop = useCallback(async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    setAiDropActive(false)
    const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'))
    for (const f of files) await attachImage(f)
  }, [])

  const createOnDooray = async (): Promise<void> => {
    if (!subject.trim()) { toast.warn('제목이 필요해요', '태스크 제목을 먼저 입력하세요'); return }
    if (!nlProject) { toast.warn('프로젝트를 선택하세요', ''); return }
    setCreating(true)
    try {
      await window.api.dooray.tasks.create({
        projectId: nlProject,
        subject: subject.trim(),
        body: body,
        tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        templateId: activeTemplateId || undefined
      })
      const proj = projects.find((p) => p.id === nlProject)
      toast.success(`${proj?.code || '프로젝트'}에 생성됨`, `"${subject.trim()}" 태스크가 두레이에 등록됐어요`)
      setSubject(''); setBody(''); setAiHint(''); setActiveTemplateName(null); setActiveTemplateId(null); setSelectedTagIds([]); setAiImages([])
      // 방금 생성한 태스크가 즉시 보이도록 캐시 우회
      await load(true)
    } catch (err) {
      // Electron IPC 는 에러를 "Error invoking remote method '...': Error: 실제메시지" 형태로 감싸서 던진다.
      // 토스트에는 실제 메시지만 노출하고, 풀 스택은 콘솔로 남겨 디버깅을 돕는다.
      console.error('[Dashboard] 태스크 생성 실패:', err)
      const raw = err instanceof Error ? err.message : String(err)
      const stripped = raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '').trim()
      toast.error('태스크 생성 실패', stripped || raw || '알 수 없는 오류')
    } finally {
      setCreating(false)
    }
  }

  const reset = (): void => {
    if ((subject.trim() || body.trim()) && !window.confirm('편집 중인 내용을 모두 지울까요?')) return
    setSubject(''); setBody(''); setAiHint(''); setActiveTemplateName(null); setAiImages([]); setSelectedTagIds([])
  }

  // 프로젝트 설정이 비어있으면 전체 프로젝트가 그대로 깔리기 때문에 헤더 칩이 가로로 넘쳐 깨진다.
  // 가시 개수를 제한하고 나머지는 "+N" 으로 요약. 칩 자체에도 max-width + truncate 적용.
  const MAX_VISIBLE_PROJECT_CODES = 5
  const projectCodesLabel = useMemo(() => {
    if (projects.length === 0) return ''
    const codes = projects.map((p) => p.code)
    if (codes.length <= MAX_VISIBLE_PROJECT_CODES) return codes.join(' · ')
    const head = codes.slice(0, MAX_VISIBLE_PROJECT_CODES).join(' · ')
    return `${head} · 외 ${codes.length - MAX_VISIBLE_PROJECT_CODES}개`
  }, [projects])
  const allProjectCodes = useMemo(() => projects.map((p) => p.code).join(' · '), [projects])

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 py-4 space-y-3">
        {/* Page head — 좁은 폭에서 chip 가 줄바꿈 될 수 있게 */}
        <div className="flex items-center gap-2 flex-wrap">
          <LayoutDashboard size={15} className="text-text-primary" />
          <span className="text-[calc(14px_*_var(--app-font-scale,1))] font-semibold text-text-primary">대시보드</span>
          {projectCodesLabel && (
            <span title={allProjectCodes} className="inline-flex max-w-full sm:max-w-[480px] min-w-0">
              <Chip tone="neutral" className="truncate max-w-full">{projectCodesLabel}</Chip>
            </span>
          )}
          <div className="flex-1" />
          {/* 자동 동기화 토글 */}
          <div className="relative">
            <Button
              variant={autoSyncMin > 0 ? 'secondary' : 'ghost'}
              onClick={() => setAutoSyncMenuOpen((v) => !v)}
              leftIcon={<Timer size={12} />}
              title="자동 동기화 주기"
            >
              {autoSyncMin > 0 ? `${autoSyncMin}분마다` : '자동 동기화'}
            </Button>
            {autoSyncMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setAutoSyncMenuOpen(false)} />
                <div className="ds-menu" style={{ top: 'calc(100% + 4px)', right: 0, minWidth: 140, zIndex: 40 }}>
                  {[
                    { v: 0, label: '끔' },
                    { v: 1, label: '1분' },
                    { v: 5, label: '5분' },
                    { v: 15, label: '15분' },
                    { v: 30, label: '30분' }
                  ].map((opt) => (
                    <div
                      key={opt.v}
                      className={`ds-menu-item ${autoSyncMin === opt.v ? 'text-clauday-blue font-semibold' : ''}`}
                      onClick={() => setAndSaveAutoSync(opt.v)}
                    >
                      {opt.label}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <Button variant="secondary" onClick={() => load(true)} leftIcon={<RotateCcw size={12} />}>
            새로고침
          </Button>
        </div>

        {/* Stat row — 좁은 폭에서 stack, 넓어지면 5열로 펼침 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
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
            <Plus size={12} className="text-clauday-blue" />
            <span className="text-[calc(12px_*_var(--app-font-scale,1))] font-semibold text-text-primary">빠른 태스크 생성</span>
            <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">· 템플릿 · AI · 직접 입력 모두 가능</span>
            <div className="flex-1" />
            <Kbd>⌘N</Kbd>
          </div>

          {createExpanded && (
            <div className="px-3 pb-3 pt-2 border-t border-bg-border flex flex-col gap-2">
              {/* 1) 프로젝트 */}
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

              {/* 2) AI 자동작성 패널 — 자연어 지시(textarea) + 이미지 첨부 (drop/paste) + 태그 자동 선택 */}
              <div
                className={`rounded-lg bg-clauday-orange/5 px-3 py-2.5 flex flex-col gap-2 transition-colors ${aiDropActive ? 'ring-2 ring-clauday-orange' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setAiDropActive(true) }}
                onDragLeave={() => setAiDropActive(false)}
                onDrop={handleAiDrop}
              >
                <div className="flex items-center gap-2">
                  <Wand2 size={12} className="text-clauday-orange" />
                  <span className="text-[calc(11px_*_var(--app-font-scale,1))] font-semibold text-text-primary">AI 자동작성</span>
                  <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">자연어 + 이미지로 제목·본문·태그까지 한 번에</span>
                  <div className="flex-1" />
                  <AIToolsPopover feature="task" size="sm" />
                  <SkillQuickToggle target="task" />
                  <div className="relative">
                    <Button
                      variant="secondary"
                      onClick={() => setTemplateMenuOpen((o) => !o)}
                      disabled={!nlProject || templatesLoading}
                      leftIcon={templatesLoading ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                    >
                      템플릿{templates.length > 0 ? ` ${templates.length}` : ''}
                    </Button>
                    {templateMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setTemplateMenuOpen(false)} />
                        <div className="ds-menu" style={{ top: 'calc(100% + 4px)', right: 0, minWidth: 220 }}>
                          {templates.length === 0 ? (
                            <div className="px-3 py-2 text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">
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
                </div>

                {/* Textarea — 높이 ↑, paste 이미지 핸들 */}
                <Textarea
                  rows={4}
                  className="!text-[calc(12px_*_var(--app-font-scale,1))]"
                  style={{ resize: 'vertical' }}
                  placeholder={'예: "로그인 세션 만료 이슈 — 30분으로 늘리는 작업"\n또는 화면 스크린샷을 붙여넣기/드래그하여 첨부하세요'}
                  value={aiHint}
                  onChange={(e) => setAiHint(e.target.value)}
                  onPaste={handleAiPaste}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !composing) {
                      e.preventDefault()
                      composeWithAI()
                    }
                  }}
                />

                {/* 첨부 이미지 미리보기 칩 */}
                {aiImages.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {aiImages.map((p, i) => (
                      <div key={`${p}-${i}`}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-bg-surface border border-bg-border text-[calc(10px_*_var(--app-font-scale,1))] text-text-secondary">
                        <ImageIcon size={10} className="text-clauday-orange" />
                        <span className="font-mono truncate max-w-[180px]" title={p}>{p.split(/[/\\]/).pop()}</span>
                        <button
                          onClick={() => setAiImages((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-text-tertiary hover:text-red-400"
                          title="첨부 제거"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary flex-1">
                    {aiImages.length > 0 ? `🖼 이미지 ${aiImages.length}장 첨부됨 — Vision 으로 함께 분석` : '⌘+Enter 로 실행 · 이미지는 paste/drop'}
                  </span>
                  <Button variant="ai" onClick={composeWithAI}
                    disabled={composing}
                    leftIcon={composing ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}>
                    {composing ? '작성 중...' : 'AI 채우기'}
                  </Button>
                </div>
              </div>

              {/* 3) 제목 */}
              <div className="flex flex-col gap-1">
                <FieldLabel>제목</FieldLabel>
                <Input
                  size="sm"
                  placeholder="예: 로그인 세션 만료 이슈 수정"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>

              {/* 4) 본문 */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <FieldLabel className="!mb-0">본문</FieldLabel>
                  <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">· 마크다운</span>
                  {activeTemplateName && (
                    <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">· 템플릿: <span className="text-text-secondary font-medium">{activeTemplateName}</span></span>
                  )}
                </div>

                <Textarea
                  rows={12}
                  className="!font-mono"
                  style={{ fontSize: 11, resize: 'vertical' }}
                  placeholder={'## 요약\n- [ ] 세션 만료 5분 → 30분\n\n## 배경\n'}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>

              {/* 5) 태그 — "Group: Name" 형식이면 그룹별로 묶음. AI 채우기 시 자동 선택. */}
              {availableTags.length > 0 && (
                <TagPickerSection
                  tags={availableTags}
                  selectedIds={selectedTagIds}
                  onChange={setSelectedTagIds}
                />
              )}

              {/* 하단 액션 */}
              <div className="flex items-center gap-2">
                <div className="flex-1" />
                <Button variant="ghost" onClick={reset}>취소</Button>
                <Button variant="success"
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
            <span className="text-[calc(12px_*_var(--app-font-scale,1))] font-semibold text-text-primary">오늘 집중할 태스크</span>
            <Chip tone="neutral">{focus.filter((t) => t.workflowClass !== 'closed').length}</Chip>
            <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">진행 중 + 오늘 마감</span>
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
                // 색상(tone)은 workflowClass 기반, 라벨은 실제 워크플로우 이름 우선.
                // 두레이는 working class 안에 "진행 중", "리뷰 중", "QA", "PM 검토" 등 다양한
                // 워크플로우가 매핑돼있어서 class만으로는 모두 "진행 중"으로 보이는 문제.
                const workflowLabel = t.workflow?.name?.trim() || t.workflowName?.trim() || chip.label
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
                    <span title={`workflowClass: ${t.workflowClass}`} className="inline-flex">
                      <Chip tone={chip.tone}>{workflowLabel}</Chip>
                    </span>
                    <span className="flex-1 text-[calc(12px_*_var(--app-font-scale,1))] text-text-primary truncate">{t.subject}</span>
                    {assigneeName && <Avatar name={assigneeName} size="sm" />}
                    {t.projectCode && (
                      <span className="font-mono text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">{t.projectCode}</span>
                    )}
                    {dueStr && (
                      <span
                        className="text-[calc(10px_*_var(--app-font-scale,1))] whitespace-nowrap"
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

/**
 * 태그 선택 영역 — "Group: Name" 형식이면 그룹별로 묶어 표시.
 * 두레이 API 가 group required 정보를 안 주므로 사용자가 직접 그룹 당 1개씩 선택.
 */
interface TagPickerSectionProps {
  tags: Array<{ id: string; name: string; color: string }>
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

function TagPickerSection({ tags, selectedIds, onChange }: TagPickerSectionProps): JSX.Element {
  // "Group: Name" 또는 "Group/Name" 형식이면 그룹 추출. 그 외는 "기타" 그룹.
  const groups = useMemo(() => {
    const map = new Map<string, Array<{ id: string; name: string; color: string; label: string }>>()
    for (const t of tags) {
      const m = t.name.match(/^([^:/]+)\s*[:/]\s*(.+)$/)
      const groupName = m ? m[1].trim() : '기타'
      const label = m ? m[2].trim() : t.name
      if (!map.has(groupName)) map.set(groupName, [])
      map.get(groupName)!.push({ ...t, label })
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === '기타') return 1
      if (b === '기타') return -1
      return a.localeCompare(b)
    })
  }, [tags])

  const toggle = (id: string): void => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <FieldLabel className="!mb-0">태그</FieldLabel>
        <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">
          그룹별 1개씩 선택 권장 (프로젝트에 따라 일부 그룹은 필수)
        </span>
      </div>
      <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
        {groups.map(([groupName, items]) => (
          <div key={groupName} className="flex items-start gap-2">
            <span className="text-[calc(10px_*_var(--app-font-scale,1))] font-semibold text-text-secondary mt-0.5 min-w-[80px] max-w-[120px] truncate">
              {groupName}
            </span>
            <div className="flex flex-wrap gap-1 flex-1">
              {items.map((tag) => {
                const selected = selectedIds.includes(tag.id)
                // 외부에서 들어온 hex는 hue로만 사용 — color-mix로 surface와 섞고
                // 글자색은 var(--text-primary)로 가독성 보장 (라이트/다크 둘 다 자동)
                const hex = `#${tag.color}`
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggle(tag.id)}
                    className="text-[calc(10px_*_var(--app-font-scale,1))] px-2 py-0.5 rounded-full border transition-colors"
                    style={{
                      background: selected
                        ? `color-mix(in oklab, ${hex} 35%, var(--bg-surface))`
                        : `color-mix(in oklab, ${hex} 14%, var(--bg-surface))`,
                      borderColor: selected
                        ? `color-mix(in oklab, ${hex} 80%, var(--text-secondary))`
                        : `color-mix(in oklab, ${hex} 55%, var(--bg-border))`,
                      color: 'var(--text-primary)'
                    }}
                  >
                    {tag.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default DashboardView
