import { useState, useEffect, useMemo, useRef } from 'react'
import { ArrowLeft, Check, Cpu, Key, Eye, EyeOff, ExternalLink, LogOut, Moon, Sun, Loader2, AlertCircle, Zap, X, ChevronUp, ChevronDown, GripVertical, RotateCcw, Search } from 'lucide-react'
import { CUSTOMIZABLE_NAV_ITEMS, DEFAULT_SIDEBAR_PREFS, type SidebarPrefs, type SidebarView } from '../Layout/Sidebar'
import type { AIModelConfig, AIModelName } from '../../../../shared/types/ai'
import UsageInsights from './UsageInsights'
import WorkspaceSettings from './WorkspaceSettings'
import KeybindingSettings from './KeybindingSettings'
import { useTheme } from '../../hooks/useTheme'
import { useFontSettings, FONT_FAMILY_LABELS, type FontFamily } from '../../hooks/useFontSettings'
import ThemePicker from './ThemePicker'
import { Modal } from '../common/ds'
import SettingsSection, { SettingsSectionProvider } from './SettingsSection'
import {
  SettingsDivider,
  SettingsRow,
  SettingsSegmentedControl,
  SettingsSubsectionHeader
} from './controls'
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_NAV_GROUPS,
  SETTINGS_SEARCH_TARGETS,
  SETTINGS_SECTION_META,
  type SettingsSectionId
} from './settingsNav'
import { SETTINGS_SEARCH_DEBOUNCE_MS, matchedSectionIds } from './settingsSearch'

/**
 * 설정 화면.
 *
 * 구조는 Orca 를 따랐다 — 좌측 그룹 네비 + 검색, 우측에 **한 번에 한 섹션만** 마운트.
 * 전부 마운트하면 각 패널이 저마다 IPC 를 때려 설정 진입이 느려진다.
 * 저장은 즉시 저장이고 "저장됨" 토스트를 따로 띄우지 않는다 — 컨트롤 자체가 상태를 보여준다.
 */
function SettingsView({ onExit }: { onExit?: () => void }): JSX.Element {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(DEFAULT_SETTINGS_SECTION)
  /** 입력값과 적용값을 나눈다 — 적용은 섹션을 갈아끼우므로 타이핑마다 하면 버벅인다. */
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!searchInput.trim()) {
      setSearchQuery('')
      return
    }
    const timer = window.setTimeout(() => setSearchQuery(searchInput), SETTINGS_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  // 다른 화면에서 특정 섹션을 지정해 이동 요청 시 반영 (구 탭 id 도 받아준다)
  useEffect(() => {
    const onJump = (e: Event): void => {
      const tab = (e as CustomEvent<{ tab?: string }>).detail?.tab
      if (!tab) return
      const legacy: Record<string, SettingsSectionId> = { app: 'behavior' }
      const target = (legacy[tab] ?? tab) as SettingsSectionId
      if (SETTINGS_SECTION_META[target]) setActiveSection(target)
    }
    window.addEventListener('goto-settings', onJump as EventListener)
    return () => window.removeEventListener('goto-settings', onJump as EventListener)
  }, [])

  const matched = useMemo(
    () => matchedSectionIds(SETTINGS_SEARCH_TARGETS, searchQuery),
    [searchQuery]
  )
  const searching = searchQuery.trim().length > 0

  // 검색 결과에 지금 섹션이 없으면 첫 결과로 옮겨준다 — 빈 화면을 보여주지 않는다.
  useEffect(() => {
    if (!searching || matched.size === 0 || matched.has(activeSection)) return
    const first = SETTINGS_NAV_GROUPS.flatMap((g) => g.items).find((i) => matched.has(i.id))
    if (first) setActiveSection(first.id)
  }, [searching, matched, activeSection])

  // Escape 로 나가되, 입력 중이면 그쪽이 우선이다 — 편집을 취소하려다 설정이 닫히면 안 된다.
  useEffect(() => {
    if (!onExit) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return
      onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  const meta = SETTINGS_SECTION_META[activeSection]

  return (
    <div className="h-full flex min-h-0">
      <aside className="w-[240px] flex-none flex flex-col min-h-0 border-r border-bg-border bg-bg-sidebar">
        {onExit && (
          <div className="p-2 pb-0 flex-none">
            <button
              onClick={onExit}
              className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[calc(12px_*_var(--app-font-scale,1))] text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary"
            >
              <ArrowLeft size={13} className="flex-none" />
              앱으로 돌아가기
            </button>
          </div>
        )}
        <div className="p-2 flex-none">
          <div className="relative">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              ref={searchRef}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setSearchInput(''); searchRef.current?.blur() } }}
              placeholder="설정 검색"
              aria-label="설정 검색"
              className="ds-input sm"
              style={{ paddingLeft: 24, paddingRight: searchInput ? 22 : undefined }}
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                aria-label="검색 지우기"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
              >
                <X size={11} />
              </button>
            )}
          </div>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 space-y-4">
          {SETTINGS_NAV_GROUPS.map((group) => {
            const items = searching ? group.items.filter((i) => matched.has(i.id)) : group.items
            if (items.length === 0) return null
            return (
              <div key={group.id} className="space-y-1">
                <div className="px-2 text-[calc(9.5px_*_var(--app-font-scale,1))] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                  {group.label}
                </div>
                {items.map(({ id, label, icon: Icon }) => {
                  const active = activeSection === id
                  return (
                    <button
                      key={id}
                      onClick={() => setActiveSection(id)}
                      aria-current={active ? 'page' : undefined}
                      className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[calc(12px_*_var(--app-font-scale,1))] transition-colors ${
                        active
                          ? 'bg-bg-active font-medium text-text-primary'
                          : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
                      }`}
                    >
                      <Icon size={13} className="flex-none" />
                      <span className="truncate">{label}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}

          {searching && matched.size === 0 && (
            <p className="px-2 py-6 text-center text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary">
              검색 결과가 없습니다
            </p>
          )}
        </nav>
      </aside>

      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl xl:max-w-4xl 2xl:max-w-5xl px-8 pt-8 pb-20">
          <SettingsSectionProvider activeSectionId={activeSection} query={searchQuery}>
            <SettingsSection id="dooray" title={meta.title} description={meta.description} bare>
              <DoorayTokenSettings />
            </SettingsSection>
            <SettingsSection id="caldav" title={meta.title} description={meta.description} bare>
              <CalDAVSettings />
            </SettingsSection>
            <SettingsSection id="workspace" title={meta.title} description={meta.description} bare>
              <WorkspaceSettings />
            </SettingsSection>
            <SettingsSection id="keys" title={meta.title} description={meta.description} bare>
              <KeybindingSettings />
            </SettingsSection>
            <SettingsSection id="models" title={meta.title} description={meta.description} bare>
              <ModelSettings />
            </SettingsSection>
            <SettingsSection id="insights" title={meta.title} description={meta.description} bare>
              <UsageInsights />
            </SettingsSection>
            <SettingsSection id="appearance" title={meta.title} description={meta.description}>
              <AppearanceSettings />
            </SettingsSection>
            <SettingsSection id="behavior" title={meta.title} description={meta.description}>
              <BehaviorSettings />
            </SettingsSection>
          </SettingsSectionProvider>
        </div>
      </div>
    </div>
  )
}

/** =========== AI 모델 =========== */
interface ModelFeatureDef {
  key: keyof AIModelConfig
  label: string
  description: string
  defaultModel: AIModelName
}

const MODEL_FEATURES: ModelFeatureDef[] = [
  { key: 'briefing', label: 'AI 브리핑', description: '매일 업무 분석 및 추천', defaultModel: 'opus' },
  { key: 'report', label: '일간/주간 보고서', description: '마크다운 업무 보고서 생성', defaultModel: 'opus' },
  { key: 'wikiProofread', label: '위키 교정', description: '맞춤법/문법 교정', defaultModel: 'opus' },
  { key: 'wikiImprove', label: '위키 개선', description: '가독성/구조 개선', defaultModel: 'opus' },
  { key: 'wikiDraft', label: '위키 초안 작성', description: '태스크 기반 문서 초안', defaultModel: 'sonnet' },
  { key: 'wikiSummarize', label: '위키 요약', description: '문서 3~5줄 요약', defaultModel: 'sonnet' },
  { key: 'wikiStructure', label: '위키 구조 분석', description: '구조 및 개선 방안 제안', defaultModel: 'sonnet' },
  { key: 'summarizeTask', label: '태스크 요약', description: '3줄 핵심 요약', defaultModel: 'haiku' },
  // AI 스킬 생성은 품질 우선 — 항상 Opus 고정 (SettingsView 노출 제거)
  { key: 'sessionSummary', label: '세션 요약', description: 'Claude Code 세션 대화 요약', defaultModel: 'sonnet' },
  { key: 'calendarAnalysis', label: '캘린더 분석', description: '이번 주 일정 분석', defaultModel: 'sonnet' },
  { key: 'messengerCompose', label: '메신저 메시지 작성', description: '지시사항 → 정리된 메시지', defaultModel: 'sonnet' }
]

const MODEL_INFO: Record<AIModelName, { label: string; speed: string; quality: string; cost: string; color: string }> = {
  haiku: { label: 'Haiku', speed: '매우 빠름', quality: '기본', cost: '$', color: 'text-emerald-400 bg-emerald-400/10' },
  sonnet: { label: 'Sonnet', speed: '빠름', quality: '좋음', cost: '$$', color: 'text-text-primary bg-bg-active' },
  opus: { label: 'Opus', speed: '느림', quality: '최상', cost: '$$$', color: 'text-clauday-orange bg-bg-active' }
}

function ModelSettings(): JSX.Element {
  const [config, setConfig] = useState<AIModelConfig>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.ai.getModelConfig().then(setConfig).catch(() => setConfig({}))
  }, [])

  const setFeatureModel = (key: keyof AIModelConfig, model: AIModelName | 'default'): void => {
    const next = { ...config }
    if (model === 'default') delete next[key]
    else next[key] = model
    setConfig(next)
    setSaved(false)
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.api.ai.setModelConfig(config)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { /* ok */ }
    finally { setSaving(false) }
  }

  const resetAll = (): void => { setConfig({}); setSaved(false) }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {(Object.keys(MODEL_INFO) as AIModelName[]).map((m) => {
          const info = MODEL_INFO[m]
          return (
            <div key={m} className="p-2.5 rounded-lg bg-bg-surface border border-bg-border">
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`text-[calc(10px_*_var(--app-font-scale,1))] px-1.5 py-0.5 rounded font-semibold ${info.color}`}>{info.label}</span>
                <span className="text-[calc(9px_*_var(--app-font-scale,1))] text-text-tertiary">{info.cost}</span>
              </div>
              <div className="text-[calc(9px_*_var(--app-font-scale,1))] text-text-secondary">속도 {info.speed} · 품질 {info.quality}</div>
            </div>
          )
        })}
      </div>

      <div className="bg-bg-surface border border-bg-border rounded-xl overflow-hidden">
        {MODEL_FEATURES.map((feat, i) => {
          const current = config[feat.key]
          return (
            <div key={feat.key}
              className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-bg-border' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-primary">{feat.label}</span>
                  {!current && (
                    <span className="text-[calc(9px_*_var(--app-font-scale,1))] text-text-tertiary px-1.5 py-0.5 rounded bg-bg-primary">
                      기본 · {MODEL_INFO[feat.defaultModel].label}
                    </span>
                  )}
                </div>
                <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5">{feat.description}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {(['default', 'haiku', 'sonnet', 'opus'] as const).map((m) => {
                  const isActive = m === 'default' ? !current : current === m
                  const label = m === 'default' ? '기본' : MODEL_INFO[m].label
                  return (
                    <button key={m} onClick={() => setFeatureModel(feat.key, m)}
                      className={`px-2.5 py-1 rounded-md text-[calc(10px_*_var(--app-font-scale,1))] font-medium transition-colors ${
                        isActive
                          ? m === 'default' ? 'bg-bg-border text-text-primary' : MODEL_INFO[m as AIModelName].color
                          : 'bg-bg-primary text-text-secondary hover:text-text-primary border border-bg-border'
                      }`}>
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button onClick={resetAll} className="text-xs text-text-tertiary hover:text-text-secondary">
          전체 기본값으로 초기화
        </button>
        <div className="flex items-center gap-3">
          {saved && <span className="flex items-center gap-1 text-xs text-emerald-400"><Check size={12} /> 저장됨</span>}
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 rounded-lg bg-clauday-blue text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

    </div>
  )
}

/** =========== 두레이 연결 =========== */
function DoorayTokenSettings(): JSX.Element {
  const [hasToken, setHasToken] = useState<boolean | null>(null)
  const [validation, setValidation] = useState<{ valid: boolean; name?: string; error?: string } | null>(null)
  const [newToken, setNewToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    (async () => {
      const token = await window.api.dooray.getToken()
      setHasToken(!!token)
      if (token) {
        const v = await window.api.dooray.validateToken()
        setValidation(v)
      }
    })()
  }, [])

  const handleSave = async (): Promise<void> => {
    if (!newToken.trim()) return
    setSaving(true)
    try {
      await window.api.dooray.setToken(newToken.trim())
      const v = await window.api.dooray.validateToken()
      setValidation(v)
      setHasToken(v.valid)
      if (v.valid) setNewToken('')
    } finally { setSaving(false) }
  }

  const handleDelete = async (): Promise<void> => {
    if (!window.confirm('두레이 토큰을 삭제할까요? 모든 두레이 연동이 중단됩니다.')) return
    await window.api.dooray.deleteToken()
    setHasToken(false)
    setValidation(null)
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-text-primary">두레이 API 토큰</h3>
        <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5">
          Dooray의 태스크/위키/캘린더에 접근하려면 개인 API 토큰이 필요합니다.
        </p>
      </div>

      {/* 현재 상태 */}
      <div className="p-4 rounded-xl bg-bg-surface border border-bg-border mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-text-primary font-medium">현재 연결 상태</p>
            {hasToken === null ? (
              <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5">확인 중...</p>
            ) : hasToken && validation?.valid ? (
              <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-emerald-400 mt-0.5 flex items-center gap-1">
                <Check size={10} /> 연결됨 · {validation.name}
              </p>
            ) : hasToken && !validation?.valid ? (
              <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-red-400 mt-0.5">
                토큰은 있지만 유효하지 않음: {validation?.error}
              </p>
            ) : (
              <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5">토큰이 설정되지 않음</p>
            )}
          </div>
          {hasToken && (
            <button onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-[calc(11px_*_var(--app-font-scale,1))] hover:bg-red-500/20">
              <LogOut size={11} /> 연결 해제
            </button>
          )}
        </div>
      </div>

      {/* 토큰 발급 안내 */}
      <div className="p-3 rounded-xl bg-bg-active border border-bg-border-light mb-3">
        <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary mb-2">
          <strong className="text-text-primary">토큰 발급 방법:</strong>
        </p>
        <ol className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary list-decimal list-inside space-y-0.5">
          <li>두레이 접속 → 우측 상단 프로필 클릭</li>
          <li>"내 정보" 또는 "인증" 메뉴 → "API 토큰" 섹션</li>
          <li>"새 토큰 발급" → 권한: 프로젝트/캘린더/위키 읽기·쓰기</li>
          <li>발급된 토큰을 아래 입력란에 붙여넣기</li>
        </ol>
        <a href="https://nhnent.dooray.com/setting/api/token" target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-[calc(10px_*_var(--app-font-scale,1))] text-clauday-blue hover:underline">
          <ExternalLink size={10} /> API 토큰 발급 페이지 열기
        </a>
      </div>

      {/* 토큰 입력 */}
      <div>
        <label className="text-[calc(11px_*_var(--app-font-scale,1))] font-medium text-text-secondary block mb-1.5">
          {hasToken ? '새 토큰으로 교체' : '토큰 입력'}
        </label>
        <div className="relative">
          <input
            type={showToken ? 'text' : 'password'}
            value={newToken}
            onChange={(e) => setNewToken(e.target.value)}
            placeholder="dooray:xxxxxxxxxxxxxxxxxxxxxxxxx"
            className="w-full pl-3 pr-9 py-2 bg-bg-surface border border-bg-border rounded-lg text-xs text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clauday-blue font-mono"
          />
          <button onClick={() => setShowToken(!showToken)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary">
            {showToken ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>
        <button onClick={handleSave} disabled={saving || !newToken.trim()}
          className="mt-2 px-4 py-1.5 rounded-lg bg-clauday-blue text-white text-xs font-medium hover:opacity-90 disabled:opacity-50">
          {saving ? '검증 중...' : '저장 및 검증'}
        </button>
      </div>

      {/* Socket Mode 실시간 메시지 수신 — Bot WebSocket */}
      <div className="mt-6 pt-6 border-t border-bg-border">
        <SocketModeSettings hasApiToken={hasToken === true} />
      </div>
    </div>
  )
}

/** =========== Socket Mode (실시간 WebSocket 메시지 수신) =========== */
interface SocketBotStatus { state: string; lastError: string | null; ready: boolean }
function SocketModeSettings({ hasApiToken }: { hasApiToken: boolean }): JSX.Element {
  const [domain, setDomain] = useState('')
  const [domainDraft, setDomainDraft] = useState('')
  const [status, setStatus] = useState<SocketBotStatus | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let unsub: (() => void) | undefined
    void (async () => {
      try {
        const [cfg, st] = await Promise.all([
          window.api.bot.getConfig().catch(() => ({ domain: '' })),
          window.api.bot.getStatus().catch(() => ({ state: 'DISCONNECTED', lastError: null, ready: false }))
        ])
        setDomain(cfg.domain || '')
        setDomainDraft(cfg.domain || '')
        setStatus(st)
      } catch (err) { console.warn('[SocketModeSettings] init 실패:', err) }
    })()
    try { unsub = window.api.bot.onStateUpdate((s) => setStatus(s)) }
    catch (err) { console.warn('[SocketModeSettings] onStateUpdate 등록 실패:', err) }
    return () => { if (unsub) unsub() }
  }, [])

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const next = await window.api.bot.setConfig({ domain: domainDraft.trim() })
      setStatus(next)
      setDomain(domainDraft.trim())
    } finally { setSaving(false) }
  }

  const clear = async (): Promise<void> => {
    if (!window.confirm('Socket Mode 를 비활성화할까요? 다시 폴링 방식으로 메시지를 수신합니다.')) return
    setSaving(true)
    try {
      await window.api.bot.setConfig({ domain: '' })
      setDomain('')
      setDomainDraft('')
      setStatus(await window.api.bot.getStatus())
    } finally { setSaving(false) }
  }

  const state = status?.state || 'DISCONNECTED'
  const isActive = state === 'ACTIVE'
  const isConnecting = state === 'CONNECTING'
  const isStandby = state === 'STANDBY'
  const stateLabel = isActive ? 'ACTIVE'
    : isConnecting ? 'CONNECTING'
    : isStandby ? 'STANDBY'
    : !domain ? '폴링만'
    : '연결 안 됨'
  const stateDesc = isActive ? '실시간 push 수신 중'
    : isConnecting ? '연결 중...'
    : isStandby ? '다른 세션 활성 — 대기 중'
    : !domain ? '도메인 설정 시 실시간 모드'
    : (status?.lastError || '에러')

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Zap size={14} className="text-clauday-orange" />
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Socket Mode (실시간 메시지 수신)</h3>
          <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5">
            두레이 도메인을 입력하면 WebSocket으로 메시지를 실시간 수신합니다 (폴링 누락 0). API 토큰은 그대로 재사용해요.
          </p>
        </div>
      </div>

      {!hasApiToken && (
        <div className="p-2 mb-3 rounded text-[calc(11px_*_var(--app-font-scale,1))] flex items-start gap-1.5"
          style={{ background: 'var(--c-yellow-bg)', border: '1px solid color-mix(in oklab, var(--c-yellow-fg) 30%, transparent)', color: 'var(--c-yellow-fg)' }}>
          <AlertCircle size={12} className="flex-none mt-0.5" />
          <span>먼저 위에서 두레이 API 토큰을 등록하세요.</span>
        </div>
      )}

      <div className="p-4 rounded-xl bg-bg-surface border border-bg-border mb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-text-primary font-medium">현재 상태</p>
            <p className={`text-[calc(10px_*_var(--app-font-scale,1))] mt-0.5 flex items-center gap-1.5 ${
              isActive ? 'text-emerald-400'
                : isConnecting ? 'text-text-primary'
                : isStandby ? 'text-amber-400'
                : !domain ? 'text-text-tertiary'
                : 'text-red-400'
            }`}>
              {isActive && <Check size={10} />}
              {isConnecting && <Loader2 size={10} className="animate-spin" />}
              {(isStandby || (!isActive && !isConnecting && domain)) && <AlertCircle size={10} />}
              <span className="font-semibold">{stateLabel}</span>
              <span className="text-text-tertiary">· {stateDesc}</span>
            </p>
          </div>
          {domain && (
            <button onClick={clear} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-[calc(11px_*_var(--app-font-scale,1))] hover:bg-red-500/20">
              <X size={11} /> 비활성화
            </button>
          )}
        </div>
        {status?.lastError && (
          <div className="mt-2 p-2 rounded text-[calc(10px_*_var(--app-font-scale,1))] text-red-400"
            style={{ background: 'var(--c-red-bg)', border: '1px solid color-mix(in oklab, var(--c-red-fg) 25%, transparent)' }}>
            {status.lastError}
          </div>
        )}
      </div>

      <div>
        <label className="text-[calc(11px_*_var(--app-font-scale,1))] font-medium text-text-secondary block mb-1.5">두레이 도메인</label>
        <input
          type="text"
          value={domainDraft}
          onChange={(e) => setDomainDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'Enter') { e.preventDefault(); void save() }
          }}
          placeholder="company.dooray.com"
          className="w-full px-3 py-2 bg-bg-surface border border-bg-border rounded-lg text-xs font-mono text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clauday-orange"
        />
        <button onClick={save} disabled={saving || !hasApiToken || !domainDraft.trim()}
          className="mt-2 px-4 py-1.5 rounded-lg bg-clauday-orange text-white text-xs font-medium hover:opacity-90 disabled:opacity-50">
          {saving ? '연결 중...' : domain ? '재연결' : '연결'}
        </button>
      </div>
    </div>
  )
}

/** =========== 캘린더 연결 (CalDAV) =========== */
function CalDAVSettings(): JSX.Element {
  const [status, setStatus] = useState<{ connected: boolean; username: string | null } | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  // 동기화 진행률
  const [syncProgress, setSyncProgress] = useState<
    | { stage: 'idle' }
    | { stage: 'syncing'; current: number; total: number; calendarName: string }
    | { stage: 'complete'; totalObjects: number }
    | { stage: 'error'; message: string }
  >({ stage: 'idle' })

  useEffect(() => {
    const off = window.api.caldav.onSyncProgress((p) => {
      if ('stage' in p) {
        if (p.stage === 'start') setSyncProgress({ stage: 'syncing', current: 0, total: 0, calendarName: '' })
        else if (p.stage === 'error') setSyncProgress({ stage: 'error', message: p.message || '동기화 실패' })
        // 'complete' 은 handleSave 안에서 처리
      } else {
        setSyncProgress({ stage: 'syncing', current: p.current, total: p.total, calendarName: p.calendarName })
      }
    })
    return off
  }, [])

  const refreshStatus = async (): Promise<void> => {
    const s = await window.api.caldav.status()
    setStatus(s)
    if (s.username) setUsername(s.username)
  }

  useEffect(() => { refreshStatus() }, [])

  const handleTest = async (): Promise<void> => {
    if (!username.trim() || !password) return
    setTesting(true); setTestResult(null)
    try {
      const r = await window.api.caldav.testConnect({ username: username.trim(), password })
      if (r.ok) {
        setTestResult({ ok: true, message: `연결 성공 — 캘린더 ${r.calendarCount}개 발견` })
      } else {
        setTestResult({ ok: false, message: r.error || '연결 실패' })
      }
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : '연결 실패' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!username.trim() || !password) return
    setSaving(true); setTestResult(null)
    try {
      const r = await window.api.caldav.testConnect({ username: username.trim(), password })
      if (!r.ok) {
        setTestResult({ ok: false, message: r.error || '연결 실패 — 자격증명을 다시 확인해주세요.' })
        return
      }
      await window.api.caldav.saveCredentials({ username: username.trim(), password })
      setPassword('')
      await refreshStatus()
      window.dispatchEvent(new CustomEvent('caldav-status-changed'))
      // 초기 전체 동기화 — 진행률은 onSyncProgress 로 받음
      const syncResult = await window.api.caldav.fullSync()
      setSyncProgress({ stage: 'complete', totalObjects: syncResult.totalObjects })
      setTestResult({ ok: true, message: `연결 + 동기화 완료 — 일정 ${syncResult.totalObjects}건` })
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : '저장 실패' })
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async (): Promise<void> => {
    if (!window.confirm('CalDAV 연결을 해제할까요? 저장된 자격증명이 삭제됩니다.')) return
    await window.api.caldav.disconnect()
    setPassword('')
    setTestResult(null)
    await refreshStatus()
    window.dispatchEvent(new CustomEvent('caldav-status-changed'))
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-text-primary">두레이 캘린더 (CalDAV)</h3>
        <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5">
          두레이의 CalDAV 엔드포인트로 일정을 양방향 동기화합니다. 비밀번호는 두레이에서 별도 발급한 CalDAV 전용 비밀번호입니다.
        </p>
      </div>

      {/* 상태 */}
      <div className="p-4 rounded-xl bg-bg-surface border border-bg-border mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-text-primary font-medium">현재 연결 상태</p>
            {status === null ? (
              <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5">확인 중...</p>
            ) : status.connected ? (
              <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-emerald-400 mt-0.5 flex items-center gap-1">
                <Check size={10} /> 연결됨 · {status.username}
              </p>
            ) : (
              <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5">연결되지 않음</p>
            )}
          </div>
          {status?.connected && (
            <button onClick={handleDisconnect}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-[calc(11px_*_var(--app-font-scale,1))] hover:bg-red-500/20">
              <LogOut size={11} /> 연결 해제
            </button>
          )}
        </div>
      </div>

      {/* 비번 발급 안내 */}
      <div className="p-3 rounded-xl bg-bg-active border border-bg-border-light mb-3">
        <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary mb-2">
          <strong className="text-text-primary">CalDAV 비밀번호 발급:</strong>
        </p>
        <ol className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary list-decimal list-inside space-y-0.5">
          <li>아래 링크에서 두레이 CalDAV 설정 페이지 접속</li>
          <li>"비밀번호" 필드 옆 <strong>새로받기</strong> 클릭 → 비밀번호 복사</li>
          <li>아이디(이메일)와 복사한 비밀번호를 아래에 입력</li>
        </ol>
        <a href="https://nhnent.dooray.com/setting/calendar/caldav" target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-[calc(10px_*_var(--app-font-scale,1))] text-clauday-blue hover:underline">
          <ExternalLink size={10} /> 두레이 CalDAV 설정 페이지 열기
        </a>
        <p className="text-[calc(9px_*_var(--app-font-scale,1))] text-text-tertiary mt-2">서버: <code className="font-mono text-text-secondary">caldav.dooray.com</code> (고정)</p>
      </div>

      {/* 입력 */}
      <div className="space-y-3">
        <div>
          <label className="text-[calc(11px_*_var(--app-font-scale,1))] font-medium text-text-secondary block mb-1.5">아이디 (이메일)</label>
          <input
            type="email" autoComplete="username"
            value={username} onChange={(e) => setUsername(e.target.value)}
            placeholder="you@nhndooray.com"
            className="w-full px-3 py-2 bg-bg-surface border border-bg-border rounded-lg text-xs text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clauday-blue"
          />
        </div>

        <div>
          <label className="text-[calc(11px_*_var(--app-font-scale,1))] font-medium text-text-secondary block mb-1.5">CalDAV 비밀번호</label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'} autoComplete="off"
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="두레이에서 발급된 CalDAV 비밀번호"
              className="w-full pl-3 pr-9 py-2 bg-bg-surface border border-bg-border rounded-lg text-xs text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clauday-blue font-mono"
            />
            <button onClick={() => setShowPw(!showPw)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary">
              {showPw ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          </div>
        </div>

        {/* 결과 */}
        {testResult && (
          <div className={`flex items-start gap-2 p-2.5 rounded-lg text-[calc(11px_*_var(--app-font-scale,1))] ${
            testResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
          }`}>
            {testResult.ok ? <Check size={12} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />}
            <span>{testResult.message}</span>
          </div>
        )}

        {/* 버튼 */}
        <div className="flex items-center gap-2">
          <button onClick={handleTest} disabled={testing || saving || !username.trim() || !password}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-bg-border text-text-secondary text-xs hover:bg-bg-surface disabled:opacity-50">
            {testing && <Loader2 size={12} className="animate-spin" />}
            연결 테스트
          </button>
          <button onClick={handleSave} disabled={saving || testing || !username.trim() || !password}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-clauday-blue text-white text-xs font-medium hover:opacity-90 disabled:opacity-50">
            {saving && <Loader2 size={12} className="animate-spin" />}
            저장 및 연결
          </button>
        </div>

        <p className="text-[calc(9px_*_var(--app-font-scale,1))] text-text-tertiary leading-relaxed">
          비밀번호는 OS 키체인(macOS Keychain / Windows Credential Vault)에 암호화 저장됩니다. 평문으로 디스크에 남지 않습니다.
        </p>
      </div>

      {/* 초기 동기화 진행률 다이얼로그 */}
      <Modal open={syncProgress.stage === 'syncing' || syncProgress.stage === 'complete' || syncProgress.stage === 'error'}
        onClose={() => setSyncProgress({ stage: 'idle' })}
        width={420}
        title="CalDAV 동기화"
        icon={syncProgress.stage === 'syncing'
          ? <Loader2 size={14} className="animate-spin text-clauday-blue" />
          : syncProgress.stage === 'complete'
            ? <Check size={14} className="text-emerald-400" />
            : <AlertCircle size={14} className="text-rose-400" />}
        dismissable={syncProgress.stage !== 'syncing'}>
        {syncProgress.stage === 'syncing' && (
          <div className="space-y-3">
            <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary">
              두레이 캘린더의 모든 일정을 받아 로컬에 저장하는 중입니다. 첫 동기화 후엔 빠르게 표시됩니다.
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[calc(11px_*_var(--app-font-scale,1))]">
                <span className="text-text-secondary truncate">{syncProgress.calendarName || '준비 중...'}</span>
                <span className="text-text-tertiary tabular-nums flex-shrink-0">
                  {syncProgress.current} / {syncProgress.total || '?'}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-bg-surface overflow-hidden">
                <div className="h-full bg-clauday-blue transition-all duration-300"
                  style={{ width: syncProgress.total > 0 ? `${(syncProgress.current / syncProgress.total) * 100}%` : '5%' }} />
              </div>
            </div>
          </div>
        )}
        {syncProgress.stage === 'complete' && (
          <div className="space-y-3">
            <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-primary">동기화 완료 — 일정 <strong>{syncProgress.totalObjects}건</strong> 저장됨</p>
            <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">이후엔 45초 주기로 변경분만 자동 동기화됩니다.</p>
            <div className="flex justify-end">
              <button onClick={() => setSyncProgress({ stage: 'idle' })}
                className="px-4 py-1.5 rounded-lg bg-clauday-blue text-white text-[calc(11px_*_var(--app-font-scale,1))] font-medium hover:opacity-90">
                확인
              </button>
            </div>
          </div>
        )}
        {syncProgress.stage === 'error' && (
          <div className="space-y-3">
            <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-rose-400">{syncProgress.message}</p>
            <div className="flex justify-end">
              <button onClick={() => setSyncProgress({ stage: 'idle' })}
                className="px-4 py-1.5 rounded-lg bg-clauday-blue text-white text-[calc(11px_*_var(--app-font-scale,1))] font-medium hover:opacity-90">
                닫기
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

/** =========== 앱 동작 =========== */
type StartupView = 'dooray' | 'terminal' | 'git' | 'last'

/** =========== 외관 =========== */
function AppearanceSettings(): JSX.Element {
  const { theme, setTheme } = useTheme()

  const blocks = [
    <SettingsRow
      key="theme"
      label="테마"
      description="앱 전체의 밝기를 정합니다."
      searchKeywords={['theme', 'dark', 'light', '다크', '라이트']}
      control={
        <SettingsSegmentedControl
          value={theme}
          onChange={setTheme}
          ariaLabel="테마"
          options={[
            { value: 'dark' as const, label: <span className="flex items-center gap-1"><Moon size={10} /> 다크</span> },
            { value: 'light' as const, label: <span className="flex items-center gap-1"><Sun size={10} /> 라이트</span> }
          ]}
        />
      }
    />,
    theme === 'light' ? (
      <div key="palette" className="space-y-3">
        <SettingsSubsectionHeader title="색상 팔레트" description="라이트 테마의 색조를 고릅니다." />
        <ThemePicker />
      </div>
    ) : null,
    <div key="font" className="space-y-3">
      <SettingsSubsectionHeader title="글꼴 & 크기" description="앱 전체에 적용됩니다." />
      <FontSettingsSection />
    </div>,
    <div key="sidebar" className="space-y-3">
      <SettingsSubsectionHeader
        title="사이드바 항목"
        description="순서를 바꾸거나 자주 안 쓰는 항목을 숨깁니다. 설정·매뉴얼은 항상 보입니다."
      />
      <SidebarPrefsSection />
    </div>
  ].filter(Boolean)

  return <SettingsBlocks blocks={blocks} />
}

/** =========== 동작 =========== */
function BehaviorSettings(): JSX.Element {
  const [startupView, setStartupView] = useState<StartupView>('dooray')

  useEffect(() => {
    window.api.settings.get('startupView').then((v) => {
      if (v) setStartupView(v as StartupView)
    })
  }, [])

  const save = (v: StartupView): void => {
    setStartupView(v)
    void window.api.settings.set('startupView', v)
  }

  const blocks = [
    <SettingsRow
      key="startup"
      label="시작 시 열 화면"
      description="앱을 켰을 때 처음 보이는 화면입니다."
      searchKeywords={['startup', '시작']}
      control={
        <SettingsSegmentedControl
          value={startupView}
          onChange={save}
          ariaLabel="시작 시 열 화면"
          options={[
            { value: 'dooray' as const, label: '두레이' },
            { value: 'terminal' as const, label: '터미널' },
            { value: 'last' as const, label: '마지막' }
          ]}
        />
      }
    />,
    <div key="renderer" className="space-y-3">
      <SettingsSubsectionHeader
        title="터미널 렌더러"
        description="GPU 문제로 화면이 깨지면 DOM 으로 바꾸세요. WebGL 을 못 쓰면 자동으로 DOM 으로 폴백하고 알려줍니다."
      />
      <TerminalRendererSection />
    </div>,
    <div key="notify" className="space-y-3">
      <SettingsSubsectionHeader title="알림" />
      <AiRecommendNotifyToggle />
    </div>
  ]

  return <SettingsBlocks blocks={blocks} />
}

/**
 * 블록 사이에만 구분선을 넣는다. **첫 블록 앞에는 넣지 않는다** —
 * 검색으로 앞 블록이 사라져도 고아 구분선이 남으면 안 된다.
 */
function SettingsBlocks({ blocks }: { blocks: React.ReactNode[] }): JSX.Element {
  return (
    <div className="space-y-5">
      {blocks.map((block, index) => (
        <div key={index} className="space-y-5">
          {index > 0 && <SettingsDivider />}
          {block}
        </div>
      ))}
    </div>
  )
}

type TerminalRendererSetting = 'webgl' | 'dom'
const TERMINAL_RENDERER_OPTIONS: { value: TerminalRendererSetting; label: string; description: string }[] = [
  { value: 'webgl', label: 'WebGL (기본값)', description: 'GPU 가속 — 긴 로그·TUI 재그리기에 유리' },
  { value: 'dom', label: 'DOM', description: '호환 모드 — GPU 드라이버 문제 시 폴백' }
]

/** 터미널 렌더러 설정(webgl|dom) — TerminalView 가 같은 settings 키를 읽어 pane 에 적용한다. */
function TerminalRendererSection(): JSX.Element {
  const [value, setValue] = useState<TerminalRendererSetting>('webgl')

  useEffect(() => {
    window.api.settings.get('terminalRenderer').then((v) => {
      if (v === 'dom' || v === 'webgl') setValue(v)
    })
  }, [])

  const save = async (v: TerminalRendererSetting): Promise<void> => {
    setValue(v)
    await window.api.settings.set('terminalRenderer', v)
  }

  return (
    <div className="p-2">
      {TERMINAL_RENDERER_OPTIONS.map((opt) => (
        <label key={opt.value}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
            value === opt.value ? 'bg-bg-active' : 'hover:bg-bg-surface-hover'
          }`}>
          <input type="radio" name="terminal-renderer" checked={value === opt.value}
            onChange={() => save(opt.value)}
            className="accent-[var(--text-secondary)]" />
          <div className="flex-1 min-w-0">
            <p className={`text-xs ${value === opt.value ? 'text-text-primary font-medium' : 'text-text-primary'}`}>{opt.label}</p>
            <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5">{opt.description}</p>
          </div>
        </label>
      ))}
    </div>
  )
}

/**
 * 사이드바 항목 순서/노출 커스텀.
 * - 저장 형식: `{ order: View[], hidden: View[] }` (settings 'sidebarPrefs')
 * - 변경 즉시 sidebar 에 반영 — `sidebar-prefs-changed` window 이벤트 dispatch.
 */
function SidebarPrefsSection(): JSX.Element {
  const [prefs, setPrefs] = useState<SidebarPrefs | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    window.api.settings.get('sidebarPrefs').then((saved) => {
      if (saved && typeof saved === 'object') setPrefs(saved as SidebarPrefs)
      else setPrefs(null)
      setLoaded(true)
    }).catch(() => { setPrefs(null); setLoaded(true) })
  }, [])

  // 카탈로그 + 저장된 prefs 머지해서 표시할 항목 순서 결정 (resolveOrderedItems 와 같은 로직, hidden 까지 포함)
  const itemsAll = (() => {
    const map = new Map(CUSTOMIZABLE_NAV_ITEMS.map((i) => [i.view, i]))
    const seen = new Set<SidebarView>()
    const ordered: typeof CUSTOMIZABLE_NAV_ITEMS = []
    const order = prefs?.order || DEFAULT_SIDEBAR_PREFS.order
    for (const view of order) {
      const item = map.get(view)
      if (item && !seen.has(view)) { ordered.push(item); seen.add(view) }
    }
    for (const item of CUSTOMIZABLE_NAV_ITEMS) if (!seen.has(item.view)) ordered.push(item)
    return ordered
  })()
  const hidden = new Set(prefs?.hidden || [])

  const persist = async (next: SidebarPrefs): Promise<void> => {
    setPrefs(next)
    await window.api.settings.set('sidebarPrefs', next)
    window.dispatchEvent(new CustomEvent('sidebar-prefs-changed'))
  }

  const move = (view: SidebarView, dir: -1 | 1): void => {
    const order = itemsAll.map((i) => i.view)
    const idx = order.indexOf(view)
    const j = idx + dir
    if (idx < 0 || j < 0 || j >= order.length) return
    ;[order[idx], order[j]] = [order[j], order[idx]]
    void persist({ order, hidden: Array.from(hidden) })
  }

  const toggleHidden = (view: SidebarView): void => {
    const next = new Set(hidden)
    if (next.has(view)) next.delete(view); else next.add(view)
    void persist({ order: itemsAll.map((i) => i.view), hidden: Array.from(next) })
  }

  const resetAll = (): void => {
    void persist({ ...DEFAULT_SIDEBAR_PREFS })
  }

  if (!loaded) {
    return <div className="p-3 text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">불러오는 중...</div>
  }

  return (
    <div className="p-2">
      <div className="space-y-0.5">
        {itemsAll.map((item, idx) => {
          const Icon = item.icon
          const isHidden = hidden.has(item.view)
          const isFirst = idx === 0
          const isLast = idx === itemsAll.length - 1
          return (
            <div key={item.view}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${isHidden ? 'opacity-50' : 'hover:bg-bg-surface-hover'}`}>
              <GripVertical size={12} className="text-text-tertiary flex-none" />
              <Icon size={14} className={isHidden ? 'text-text-tertiary' : 'text-text-secondary'} />
              <span className={`flex-1 text-xs ${isHidden ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>
                {item.label}
              </span>
              <button onClick={() => move(item.view, -1)} disabled={isFirst}
                aria-label="위로"
                className="p-1 rounded hover:bg-bg-primary text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent">
                <ChevronUp size={12} />
              </button>
              <button onClick={() => move(item.view, 1)} disabled={isLast}
                aria-label="아래로"
                className="p-1 rounded hover:bg-bg-primary text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent">
                <ChevronDown size={12} />
              </button>
              <label className="flex items-center gap-1 cursor-pointer ml-1 text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary hover:text-text-secondary">
                <input type="checkbox" checked={!isHidden} onChange={() => toggleHidden(item.view)}
                  className="accent-[var(--text-secondary)]" />
                <span>{isHidden ? '숨김' : '표시'}</span>
              </label>
            </div>
          )
        })}
      </div>
      <div className="mt-2 pt-2 border-t border-bg-border flex justify-end">
        <button onClick={resetAll}
          className="flex items-center gap-1.5 text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary hover:text-text-primary px-2 py-1 rounded hover:bg-bg-surface-hover">
          <RotateCcw size={10} /> 기본값으로 초기화
        </button>
      </div>
    </div>
  )
}

/**
 * AI 추천 새 글 OS 알림 토글 — 1시간 폴링 + 22~9시 silent.
 * 사용자 설정은 main 측 electron-store 에 저장. UI 는 단순 boolean.
 */
function AiRecommendNotifyToggle(): JSX.Element {
  const [enabled, setEnabled] = useState<boolean>(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let cancelled = false
    window.api.aiRecommendNotify.getEnabled()
      .then((v) => { if (!cancelled) setEnabled(!!v) })
      .catch(() => { /* default true */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])
  const toggle = async (): Promise<void> => {
    setSaving(true)
    const next = !enabled
    try {
      const r = await window.api.aiRecommendNotify.setEnabled(next)
      setEnabled(r.enabled)
    } finally {
      setSaving(false)
    }
  }
  return (
    <label className="flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-bg-surface-hover">
      <input type="checkbox" checked={enabled} onChange={toggle} disabled={loading || saving}
        className="accent-[var(--text-secondary)] mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-text-primary">AI 추천 새 글 알림</p>
        <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5">
          두레이 "AI 활용 사례" 프로젝트에 새 글이 올라오면 데스크톱 알림 (1시간 주기, 22~9시 보류)
        </p>
      </div>
    </label>
  )
}

/** 글꼴 종류 + 크기 배율 설정 */
function FontSettingsSection(): JSX.Element {
  const { settings, setFamily, setScale, reset } = useFontSettings()
  const pct = Math.round(settings.scale * 100)

  const FAMILIES: FontFamily[] = ['default', 'pretendard', 'appleSystem', 'notoSansKr', 'sans', 'serif']
  const SCALE_PRESETS: Array<{ value: number; label: string }> = [
    { value: 0.875, label: '작게' },
    { value: 1.0, label: '기본' },
    { value: 1.125, label: '크게' },
    { value: 1.25, label: '더 크게' },
    { value: 1.4, label: '가장 크게' }
  ]

  return (
    <div className="p-3 space-y-4">
      {/* 폰트 패밀리 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary">폰트</span>
          <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">OS에 설치된 폰트만 표시됩니다</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {FAMILIES.map((f) => {
            const active = settings.family === f
            return (
              <button key={f} onClick={() => setFamily(f)}
                className={`px-3 py-2 rounded-md text-left transition-colors border ${
                  active ? 'bg-bg-active border-bg-border-strong' : 'bg-bg-primary border-bg-border hover:border-bg-border-light'
                }`}>
                <span className={`block text-xs ${active ? 'text-text-primary font-medium' : 'text-text-primary'}`}>
                  {FONT_FAMILY_LABELS[f]}
                </span>
                <span className="block text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5">안녕하세요 Abc 123</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 크기 배율 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary">글자 크기</span>
          <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-primary font-mono">{pct}%</span>
        </div>
        <input
          type="range"
          min={75}
          max={160}
          step={5}
          value={pct}
          onChange={(e) => setScale(Number(e.target.value) / 100)}
          className="w-full accent-[var(--text-secondary)]"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {SCALE_PRESETS.map((p) => (
            <button key={p.value} onClick={() => setScale(p.value)}
              className={`px-2.5 py-1 rounded-md text-[calc(10px_*_var(--app-font-scale,1))] border transition-colors ${
                Math.abs(settings.scale - p.value) < 0.01
                  ? 'bg-bg-active border-bg-border-strong text-text-primary font-medium'
                  : 'bg-bg-primary border-bg-border text-text-secondary hover:text-text-primary'
              }`}>
              {p.label} <span className="text-text-tertiary">{Math.round(p.value * 100)}%</span>
            </button>
          ))}
          <button onClick={reset}
            className="ml-auto px-2.5 py-1 rounded-md text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary hover:text-text-secondary">
            기본값으로
          </button>
        </div>
      </div>

      {/* 미리보기 */}
      <div className="rounded-lg border border-bg-border bg-bg-primary p-3">
        <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mb-1.5">미리보기</p>
        <p className="text-sm text-text-primary leading-relaxed">
          안녕하세요. Clauday v1.1.0 입니다. The quick brown fox jumps over the lazy dog. 1234567890
        </p>
        <p className="text-xs text-text-secondary mt-1">작은 텍스트 예시 — 필터, 뱃지, 설명에 사용됩니다.</p>
      </div>
    </div>
  )
}

export default SettingsView
