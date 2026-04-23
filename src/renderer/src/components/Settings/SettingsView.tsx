import { useState, useEffect } from 'react'
import { Check, Cpu, Key, Eye, EyeOff, ExternalLink, SlidersHorizontal, LogOut, BarChart2, Moon, Sun, Type } from 'lucide-react'
import type { AIModelConfig, AIModelName } from '../../../../shared/types/ai'
import UsageInsights from './UsageInsights'
import { useTheme } from '../../hooks/useTheme'
import { useFontSettings, FONT_FAMILY_LABELS, type FontFamily } from '../../hooks/useFontSettings'
import ThemePicker from './ThemePicker'

type SettingsTab = 'models' | 'dooray' | 'app' | 'insights'

function SettingsView(): JSX.Element {
  const [activeTab, setActiveTab] = useState<SettingsTab>('models')

  const tabs: { id: SettingsTab; icon: typeof Cpu; label: string }[] = [
    { id: 'models', icon: Cpu, label: 'AI 모델' },
    { id: 'insights', icon: BarChart2, label: '사용 인사이트' },
    { id: 'dooray', icon: Key, label: '두레이 연결' },
    { id: 'app', icon: SlidersHorizontal, label: '외관 & 동작' }
  ]

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center h-10 bg-bg-surface border-b border-bg-border px-4 gap-1 flex-shrink-0">
        {tabs.map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-all ${
              activeTab === id ? 'bg-clover-blue/10 text-clover-blue' : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
            }`}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'models' && <ModelSettings />}
        {activeTab === 'insights' && <UsageInsights />}
        {activeTab === 'dooray' && <DoorayTokenSettings />}
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
  { key: 'meetingNote', label: '회의록 템플릿', description: '캘린더 이벤트 기반', defaultModel: 'haiku' },
  { key: 'sessionSummary', label: '세션 요약', description: 'Claude Code 세션 대화 요약', defaultModel: 'sonnet' },
  { key: 'calendarAnalysis', label: '캘린더 분석', description: '이번 주 일정 분석', defaultModel: 'sonnet' },
  { key: 'messengerCompose', label: '메신저 메시지 작성', description: '지시사항 → 정리된 메시지', defaultModel: 'sonnet' }
]

const MODEL_INFO: Record<AIModelName, { label: string; speed: string; quality: string; cost: string; color: string }> = {
  haiku: { label: 'Haiku', speed: '매우 빠름', quality: '기본', cost: '$', color: 'text-emerald-400 bg-emerald-400/10' },
  sonnet: { label: 'Sonnet', speed: '빠름', quality: '좋음', cost: '$$', color: 'text-clover-blue bg-clover-blue/10' },
  opus: { label: 'Opus', speed: '느림', quality: '최상', cost: '$$$', color: 'text-clover-orange bg-clover-orange/10' }
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
        <p className="text-[10px] text-text-tertiary mt-0.5">
          각 기능마다 원하는 모델을 선택하세요. Haiku는 빠르고 저렴, Opus는 품질 최상.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {(Object.keys(MODEL_INFO) as AIModelName[]).map((m) => {
          const info = MODEL_INFO[m]
          return (
            <div key={m} className="p-2.5 rounded-lg bg-bg-surface border border-bg-border">
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${info.color}`}>{info.label}</span>
                <span className="text-[9px] text-text-tertiary">{info.cost}</span>
              </div>
              <div className="text-[9px] text-text-secondary">속도 {info.speed} · 품질 {info.quality}</div>
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
                    <span className="text-[9px] text-text-tertiary px-1.5 py-0.5 rounded bg-bg-primary">
                      기본 · {MODEL_INFO[feat.defaultModel].label}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-text-tertiary mt-0.5">{feat.description}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {(['default', 'haiku', 'sonnet', 'opus'] as const).map((m) => {
                  const isActive = m === 'default' ? !current : current === m
                  const label = m === 'default' ? '기본' : MODEL_INFO[m].label
                  return (
                    <button key={m} onClick={() => setFeatureModel(feat.key, m)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
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
            className="px-5 py-2 rounded-lg bg-clover-blue text-white text-sm font-medium hover:bg-clover-blue/80 disabled:opacity-50">
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
        <p className="text-[10px] text-text-tertiary mt-0.5">
          Dooray의 태스크/위키/캘린더에 접근하려면 개인 API 토큰이 필요합니다.
        </p>
      </div>

      {/* 현재 상태 */}
      <div className="p-4 rounded-xl bg-bg-surface border border-bg-border mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-text-primary font-medium">현재 연결 상태</p>
            {hasToken === null ? (
              <p className="text-[10px] text-text-tertiary mt-0.5">확인 중...</p>
            ) : hasToken && validation?.valid ? (
              <p className="text-[10px] text-emerald-400 mt-0.5 flex items-center gap-1">
                <Check size={10} /> 연결됨 · {validation.name}
              </p>
            ) : hasToken && !validation?.valid ? (
              <p className="text-[10px] text-red-400 mt-0.5">
                토큰은 있지만 유효하지 않음: {validation?.error}
              </p>
            ) : (
              <p className="text-[10px] text-text-tertiary mt-0.5">토큰이 설정되지 않음</p>
            )}
          </div>
          {hasToken && (
            <button onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-[11px] hover:bg-red-500/20">
              <LogOut size={11} /> 연결 해제
            </button>
          )}
        </div>
      </div>

      {/* 토큰 발급 안내 */}
      <div className="p-3 rounded-xl bg-clover-blue/5 border border-clover-blue/20 mb-3">
        <p className="text-[11px] text-text-secondary mb-2">
          <strong className="text-text-primary">토큰 발급 방법:</strong>
        </p>
        <ol className="text-[10px] text-text-tertiary list-decimal list-inside space-y-0.5">
          <li>두레이 접속 → 우측 상단 프로필 클릭</li>
          <li>"내 정보" 또는 "인증" 메뉴 → "API 토큰" 섹션</li>
          <li>"새 토큰 발급" → 권한: 프로젝트/캘린더/위키 읽기·쓰기</li>
          <li>발급된 토큰을 아래 입력란에 붙여넣기</li>
        </ol>
        <a href="https://helpdesk.dooray.com/en/kb/article/2021003040" target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-[10px] text-clover-blue hover:underline">
          <ExternalLink size={10} /> 두레이 공식 가이드
        </a>
      </div>

      {/* 토큰 입력 */}
      <div>
        <label className="text-[11px] font-medium text-text-secondary block mb-1.5">
          {hasToken ? '새 토큰으로 교체' : '토큰 입력'}
        </label>
        <div className="relative">
          <input
            type={showToken ? 'text' : 'password'}
            value={newToken}
            onChange={(e) => setNewToken(e.target.value)}
            placeholder="dooray:xxxxxxxxxxxxxxxxxxxxxxxxx"
            className="w-full pl-3 pr-9 py-2 bg-bg-surface border border-bg-border rounded-lg text-xs text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue font-mono"
          />
          <button onClick={() => setShowToken(!showToken)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary">
            {showToken ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>
        <button onClick={handleSave} disabled={saving || !newToken.trim()}
          className="mt-2 px-4 py-1.5 rounded-lg bg-clover-blue text-white text-xs font-medium hover:bg-clover-blue/80 disabled:opacity-50">
          {saving ? '검증 중...' : '저장 및 검증'}
        </button>
      </div>
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
        <p className="text-[10px] text-text-tertiary mt-0.5">앱 실행 시 동작을 설정합니다.</p>
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
                theme === value ? 'bg-clover-blue/10 border border-clover-blue/40' : 'hover:bg-bg-surface-hover border border-transparent'
              }`}>
              <Icon size={16} className={theme === value ? 'text-clover-blue' : 'text-text-tertiary'} />
              <div className="flex-1 min-w-0">
                <p className={`text-xs ${theme === value ? 'text-clover-blue font-medium' : 'text-text-primary'}`}>{label}</p>
                <p className="text-[10px] text-text-tertiary mt-0.5">{description}</p>
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
            {saved && <span className="flex items-center gap-1 text-[10px] text-emerald-400"><Check size={10} /> 저장됨</span>}
          </div>
        </div>
        <div className="p-2">
          {STARTUP_OPTIONS.map((opt) => (
            <label key={opt.value}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                startupView === opt.value ? 'bg-clover-blue/10' : 'hover:bg-bg-surface-hover'
              }`}>
              <input type="radio" name="startup" checked={startupView === opt.value}
                onChange={() => save(opt.value)}
                className="accent-clover-blue" />
              <div className="flex-1 min-w-0">
                <p className={`text-xs ${startupView === opt.value ? 'text-clover-blue font-medium' : 'text-text-primary'}`}>{opt.label}</p>
                <p className="text-[10px] text-text-tertiary mt-0.5">{opt.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-text-tertiary mt-3">
        💡 <strong className="text-text-secondary">AI 스킬 관리</strong>는 각 AI 기능 화면 우측의 <span className="text-amber-400 font-medium">스킬</span> 버튼에서 바로 할 수 있습니다.
      </p>
    </div>
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
          <span className="text-[11px] text-text-secondary">폰트</span>
          <span className="text-[10px] text-text-tertiary">OS에 설치된 폰트만 표시됩니다</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {FAMILIES.map((f) => {
            const active = settings.family === f
            return (
              <button key={f} onClick={() => setFamily(f)}
                className={`px-3 py-2 rounded-md text-left transition-colors border ${
                  active ? 'bg-clover-blue/10 border-clover-blue/40' : 'bg-bg-primary border-bg-border hover:border-bg-border-light'
                }`}>
                <span className={`block text-xs ${active ? 'text-clover-blue font-medium' : 'text-text-primary'}`}>
                  {FONT_FAMILY_LABELS[f]}
                </span>
                <span className="block text-[10px] text-text-tertiary mt-0.5">안녕하세요 Abc 123</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 크기 배율 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-text-secondary">글자 크기</span>
          <span className="text-[11px] text-text-primary font-mono">{pct}%</span>
        </div>
        <input
          type="range"
          min={75}
          max={160}
          step={5}
          value={pct}
          onChange={(e) => setScale(Number(e.target.value) / 100)}
          className="w-full accent-clover-blue"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {SCALE_PRESETS.map((p) => (
            <button key={p.value} onClick={() => setScale(p.value)}
              className={`px-2.5 py-1 rounded-md text-[10px] border transition-colors ${
                Math.abs(settings.scale - p.value) < 0.01
                  ? 'bg-clover-blue/10 border-clover-blue/40 text-clover-blue font-medium'
                  : 'bg-bg-primary border-bg-border text-text-secondary hover:text-text-primary'
              }`}>
              {p.label} <span className="text-text-tertiary">{Math.round(p.value * 100)}%</span>
            </button>
          ))}
          <button onClick={reset}
            className="ml-auto px-2.5 py-1 rounded-md text-[10px] text-text-tertiary hover:text-text-secondary">
            기본값으로
          </button>
        </div>
      </div>

      {/* 미리보기 */}
      <div className="rounded-lg border border-bg-border bg-bg-primary p-3">
        <p className="text-[10px] text-text-tertiary mb-1.5">미리보기</p>
        <p className="text-sm text-text-primary leading-relaxed">
          안녕하세요. Clauday v1.1.0 입니다. The quick brown fox jumps over the lazy dog. 1234567890
        </p>
        <p className="text-xs text-text-secondary mt-1">작은 텍스트 예시 — 필터, 뱃지, 설명에 사용됩니다.</p>
      </div>
    </div>
  )
}

export default SettingsView
