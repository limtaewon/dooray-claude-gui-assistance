import { useState, useEffect } from 'react'
import { Check, Cpu, Key, Eye, EyeOff, ExternalLink, SlidersHorizontal, LogOut, BarChart2, Moon, Sun, Type, CalendarDays, Loader2, AlertCircle, Zap, X, ChevronUp, ChevronDown, GripVertical, RotateCcw } from 'lucide-react'
import { CUSTOMIZABLE_NAV_ITEMS, DEFAULT_SIDEBAR_PREFS, type SidebarPrefs, type SidebarView } from '../Layout/Sidebar'
import type { AIModelConfig, AIModelName } from '../../../../shared/types/ai'
import UsageInsights from './UsageInsights'
import { useTheme } from '../../hooks/useTheme'
import { useFontSettings, FONT_FAMILY_LABELS, type FontFamily } from '../../hooks/useFontSettings'
import ThemePicker from './ThemePicker'
import { Modal } from '../common/ds'

type SettingsTab = 'models' | 'dooray' | 'caldav' | 'app' | 'insights'

function SettingsView(): JSX.Element {
  const [activeTab, setActiveTab] = useState<SettingsTab>('models')

  // 다른 화면에서 특정 탭을 지정해서 이동 요청 시 반영
  useEffect(() => {
    const onJump = (e: Event): void => {
      const tab = (e as CustomEvent<{ tab?: SettingsTab }>).detail?.tab
      if (tab) setActiveTab(tab)
    }
    window.addEventListener('goto-settings', onJump as EventListener)
    return () => window.removeEventListener('goto-settings', onJump as EventListener)
  }, [])

  const tabs: { id: SettingsTab; icon: typeof Cpu; label: string }[] = [
    { id: 'models', icon: Cpu, label: 'AI 모델' },
    { id: 'insights', icon: BarChart2, label: '사용 인사이트' },
    { id: 'dooray', icon: Key, label: '두레이 연결' },
    { id: 'caldav', icon: CalendarDays, label: '캘린더 연결' },
    { id: 'app', icon: SlidersHorizontal, label: '외관 & 동작' }
  ]

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center h-10 bg-bg-surface border-b border-bg-border px-4 gap-1 flex-shrink-0">
        {tabs.map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-all ${
              activeTab === id ? 'bg-clauday-blue/10 text-clauday-blue' : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
            }`}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'models' && <ModelSettings />}
        {activeTab === 'insights' && <UsageInsights />}
        {activeTab === 'dooray' && <DoorayTokenSettings />}
        {activeTab === 'caldav' && <CalDAVSettings />}
        {activeTab === 'app' && <AppBehaviorSettings />}
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
  sonnet: { label: 'Sonnet', speed: '빠름', quality: '좋음', cost: '$$', color: 'text-clauday-blue bg-clauday-blue/10' },
  opus: { label: 'Opus', speed: '느림', quality: '최상', cost: '$$$', color: 'text-clauday-orange bg-clauday-orange/10' }
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
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-text-primary">기능별 AI 모델</h3>
        <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5">
          각 기능마다 원하는 모델을 선택하세요. Haiku는 빠르고 저렴, Opus는 품질 최상.
        </p>
      </div>

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
              className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-bg-border/50' : ''}`}>
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
            className="px-5 py-2 rounded-lg bg-clauday-blue text-white text-sm font-medium hover:bg-clauday-blue/80 disabled:opacity-50">
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
    <div className="p-6 max-w-2xl mx-auto">
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
      <div className="p-3 rounded-xl bg-clauday-blue/5 border border-clauday-blue/20 mb-3">
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
          className="mt-2 px-4 py-1.5 rounded-lg bg-clauday-blue text-white text-xs font-medium hover:bg-clauday-blue/80 disabled:opacity-50">
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
                : isConnecting ? 'text-clauday-blue'
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
          className="mt-2 px-4 py-1.5 rounded-lg bg-clauday-orange text-white text-xs font-medium hover:bg-clauday-orange/80 disabled:opacity-50">
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
    <div className="p-6 max-w-2xl mx-auto">
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
      <div className="p-3 rounded-xl bg-clauday-blue/5 border border-clauday-blue/20 mb-3">
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
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-clauday-blue text-white text-xs font-medium hover:bg-clauday-blue/80 disabled:opacity-50">
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
                className="px-4 py-1.5 rounded-lg bg-clauday-blue text-white text-[calc(11px_*_var(--app-font-scale,1))] font-medium hover:bg-clauday-blue/80">
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
                className="px-4 py-1.5 rounded-lg bg-clauday-blue text-white text-[calc(11px_*_var(--app-font-scale,1))] font-medium hover:bg-clauday-blue/80">
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

function AppBehaviorSettings(): JSX.Element {
  const [startupView, setStartupView] = useState<StartupView>('dooray')
  const [saved, setSaved] = useState(false)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    window.api.settings.get('startupView').then((v) => {
      if (v) setStartupView(v as StartupView)
    })
  }, [])

  const save = async (v: StartupView): Promise<void> => {
    setStartupView(v)
    await window.api.settings.set('startupView', v)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const STARTUP_OPTIONS: { value: StartupView; label: string; description: string }[] = [
    { value: 'dooray', label: '두레이 (기본)', description: '태스크/브리핑/캘린더' },
    { value: 'terminal', label: '터미널', description: 'Claude Code CLI 세션' },
    { value: 'git', label: '브랜치 작업', description: 'Git worktree 관리' },
    { value: 'last', label: '마지막 사용', description: '앱 종료 시 열려있던 화면' }
  ]

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-text-primary">앱 동작</h3>
        <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5">앱 실행 시 동작을 설정합니다.</p>
      </div>

      {/* 테마 */}
      <div className="bg-bg-surface border border-bg-border rounded-xl overflow-hidden mb-3">
        <div className="px-4 py-2.5 border-b border-bg-border bg-bg-primary/30">
          <span className="text-xs font-medium text-text-primary">테마</span>
        </div>
        <div className="p-2 grid grid-cols-2 gap-2">
          {([
            { value: 'dark' as const, label: '다크', icon: Moon, description: '어두운 배경' },
            { value: 'light' as const, label: '라이트', icon: Sun, description: '밝은 배경' }
          ]).map(({ value, label, icon: Icon, description }) => (
            <button key={value} onClick={() => setTheme(value)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
                theme === value ? 'bg-clauday-blue/10 border border-clauday-blue/40' : 'hover:bg-bg-surface-hover border border-transparent'
              }`}>
              <Icon size={16} className={theme === value ? 'text-clauday-blue' : 'text-text-tertiary'} />
              <div className="flex-1 min-w-0">
                <p className={`text-xs ${theme === value ? 'text-clauday-blue font-medium' : 'text-text-primary'}`}>{label}</p>
                <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5">{description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 라이트 팔레트 목업 선택 */}
      {theme === 'light' && (
        <div className="bg-bg-surface border border-bg-border rounded-xl p-4 mb-3">
          <ThemePicker />
        </div>
      )}

      {/* 글꼴 & 크기 */}
      <div className="bg-bg-surface border border-bg-border rounded-xl overflow-hidden mb-3">
        <div className="px-4 py-2.5 border-b border-bg-border bg-bg-primary/30 flex items-center gap-2">
          <Type size={12} className="text-text-secondary" />
          <span className="text-xs font-medium text-text-primary">글꼴 & 크기</span>
        </div>
        <FontSettingsSection />
      </div>

      {/* 시작 뷰 */}
      <div className="bg-bg-surface border border-bg-border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-bg-border bg-bg-primary/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-primary">시작 시 열 화면</span>
            {saved && <span className="flex items-center gap-1 text-[calc(10px_*_var(--app-font-scale,1))] text-emerald-400"><Check size={10} /> 저장됨</span>}
          </div>
        </div>
        <div className="p-2">
          {STARTUP_OPTIONS.map((opt) => (
            <label key={opt.value}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                startupView === opt.value ? 'bg-clauday-blue/10' : 'hover:bg-bg-surface-hover'
              }`}>
              <input type="radio" name="startup" checked={startupView === opt.value}
                onChange={() => save(opt.value)}
                className="accent-clauday-blue" />
              <div className="flex-1 min-w-0">
                <p className={`text-xs ${startupView === opt.value ? 'text-clauday-blue font-medium' : 'text-text-primary'}`}>{opt.label}</p>
                <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5">{opt.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* 사이드바 커스텀 */}
      <div className="bg-bg-surface border border-bg-border rounded-xl overflow-hidden mt-3">
        <div className="px-4 py-2.5 border-b border-bg-border bg-bg-primary/30">
          <span className="text-xs font-medium text-text-primary">사이드바 항목</span>
          <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5">순서를 바꾸거나 자주 안 쓰는 항목을 숨길 수 있습니다. 설정/매뉴얼은 항상 노출됩니다.</p>
        </div>
        <SidebarPrefsSection />
      </div>

      {/* 알림 */}
      <div className="bg-bg-surface border border-bg-border rounded-xl overflow-hidden mt-3">
        <div className="px-4 py-2.5 border-b border-bg-border bg-bg-primary/30">
          <span className="text-xs font-medium text-text-primary">알림</span>
        </div>
        <div className="p-2">
          <AiRecommendNotifyToggle />
        </div>
      </div>

      <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mt-3">
        💡 <strong className="text-text-secondary">AI 스킬 관리</strong>는 각 AI 기능 화면 우측의 <span className="text-amber-400 font-medium">스킬</span> 버튼에서 바로 할 수 있습니다.
      </p>
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
                className="p-1 rounded hover:bg-bg-primary/50 text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent">
                <ChevronUp size={12} />
              </button>
              <button onClick={() => move(item.view, 1)} disabled={isLast}
                aria-label="아래로"
                className="p-1 rounded hover:bg-bg-primary/50 text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent">
                <ChevronDown size={12} />
              </button>
              <label className="flex items-center gap-1 cursor-pointer ml-1 text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary hover:text-text-secondary">
                <input type="checkbox" checked={!isHidden} onChange={() => toggleHidden(item.view)}
                  className="accent-clauday-blue" />
                <span>{isHidden ? '숨김' : '표시'}</span>
              </label>
            </div>
          )
        })}
      </div>
      <div className="mt-2 pt-2 border-t border-bg-border/50 flex justify-end">
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
        className="accent-clauday-blue mt-0.5" />
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
                  active ? 'bg-clauday-blue/10 border-clauday-blue/40' : 'bg-bg-primary border-bg-border hover:border-bg-border-light'
                }`}>
                <span className={`block text-xs ${active ? 'text-clauday-blue font-medium' : 'text-text-primary'}`}>
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
          className="w-full accent-clauday-blue"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {SCALE_PRESETS.map((p) => (
            <button key={p.value} onClick={() => setScale(p.value)}
              className={`px-2.5 py-1 rounded-md text-[calc(10px_*_var(--app-font-scale,1))] border transition-colors ${
                Math.abs(settings.scale - p.value) < 0.01
                  ? 'bg-clauday-blue/10 border-clauday-blue/40 text-clauday-blue font-medium'
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
