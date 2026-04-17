import { useState, useEffect } from 'react'
import { Check, Cpu } from 'lucide-react'
import type { AIModelConfig, AIModelName } from '../../../../shared/types/ai'

function SettingsView(): JSX.Element {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center h-10 bg-bg-surface border-b border-bg-border px-4 gap-1 flex-shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-clover-blue/10 text-clover-blue">
          <Cpu size={13} /> AI 모델 설정
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <ModelSettings />
      </div>
    </div>
  )
}

/** 기능별 AI 모델 선택 */
interface ModelFeatureDef {
  key: keyof AIModelConfig
  label: string
  description: string
  defaultModel: AIModelName
}

const MODEL_FEATURES: ModelFeatureDef[] = [
  { key: 'briefing', label: 'AI 브리핑', description: '매일 업무 분석 및 추천', defaultModel: 'sonnet' },
  { key: 'report', label: '일간/주간 보고서', description: '마크다운 업무 보고서 생성', defaultModel: 'sonnet' },
  { key: 'wikiProofread', label: '위키 교정', description: '맞춤법/문법 교정', defaultModel: 'opus' },
  { key: 'wikiImprove', label: '위키 개선', description: '가독성/구조 개선', defaultModel: 'opus' },
  { key: 'wikiDraft', label: '위키 초안 작성', description: '태스크 기반 문서 초안', defaultModel: 'sonnet' },
  { key: 'wikiSummarize', label: '위키 요약', description: '문서 3~5줄 요약', defaultModel: 'sonnet' },
  { key: 'wikiStructure', label: '위키 구조 분석', description: '구조 및 개선 방안 제안', defaultModel: 'sonnet' },
  { key: 'summarizeTask', label: '태스크 요약', description: '3줄 핵심 요약', defaultModel: 'haiku' },
  { key: 'generateSkill', label: 'AI 스킬 생성', description: '사용자 맞춤 스킬 생성', defaultModel: 'sonnet' },
  { key: 'meetingNote', label: '회의록 템플릿', description: '캘린더 이벤트 기반', defaultModel: 'haiku' },
  { key: 'sessionSummary', label: '세션 요약', description: 'Claude Code 세션 대화 요약', defaultModel: 'sonnet' },
  { key: 'calendarAnalysis', label: '캘린더 분석', description: '이번 주 일정 분석', defaultModel: 'sonnet' }
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

      {/* 모델 가이드 */}
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

      {/* 기능별 설정 */}
      <div className="bg-bg-surface border border-bg-border rounded-xl overflow-hidden">
        {MODEL_FEATURES.map((feat, i) => {
          const current = config[feat.key]
          return (
            <div
              key={feat.key}
              className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-bg-border/50' : ''}`}
            >
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
                    <button
                      key={m}
                      onClick={() => setFeatureModel(feat.key, m)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                        isActive
                          ? m === 'default'
                            ? 'bg-bg-border text-text-primary'
                            : MODEL_INFO[m as AIModelName].color
                          : 'bg-bg-primary text-text-secondary hover:text-text-primary border border-bg-border'
                      }`}
                    >
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

export default SettingsView
