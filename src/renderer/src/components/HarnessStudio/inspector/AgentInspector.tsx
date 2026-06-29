/**
 * AgentInspector — 선택된 에이전트의 상세 정보 패널.
 *
 * FlowCanvas 에서 노드 클릭 시 우측 패널에 표시된다.
 * 표시 항목: 모델/역할/도구(화이트리스트)/입출력(reads/writes)/에스컬레이션.
 * modelSource='ai' 이면 ProvenanceBadge 표시.
 *
 * M8: "AI 설명" 버튼 — window.api.harness.explain 호출 후 markdown 표시.
 *
 * PRD §7-1 에이전트 인스펙터 기능 요구사항 충족.
 */

import { useState, useCallback } from 'react'
import {
  X,
  Wrench,
  FileInput,
  FileOutput,
  AlertTriangle,
  ArrowUpCircle,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Lock,
  Unlock,
  FileCheck,
  ListChecks,
  CheckCircle2,
  ShieldAlert,
  Dot
} from 'lucide-react'
import type { HarnessAgent, HarnessGate, Provenance } from '@shared/types/harness'
import { ProvenanceBadge } from '../shared/ProvenanceBadge'
import { phaseTokens } from '../shared/PhaseColor'
import Chip from '@/components/common/ds/Chip'
import Button from '@/components/common/ds/Button'
import { groupRuleDetails } from '../views/gateRuleGroups'
import type { RuleCategory } from '../views/gateRuleGroups'

export interface AgentInspectorProps {
  /** 표시할 에이전트 */
  agent: HarnessAgent
  /** 모델 전체 provenance 맵 */
  provenance: Provenance
  /** 닫기 버튼 콜백 */
  onClose: () => void
  /** 번들 소스 경로 (explain 호출에 필요) */
  bundlePath?: string
  /**
   * 이 에이전트 단계에 대응하는 게이트.
   * 있으면 "이 단계 게이트" 섹션을 표시한다.
   */
  gate?: HarnessGate
}

/** 모델명 → Chip tone 매핑 */
const MODEL_TONE: Record<string, 'neutral' | 'blue' | 'orange' | 'emerald' | 'red' | 'violet' | 'yellow'> = {
  haiku:   'neutral',
  sonnet:  'blue',
  opus:    'orange',
  unknown: 'neutral'
}

/**
 * 선택된 에이전트의 모델/역할/도구/입출력/에스컬레이션 패널.
 *
 * FlowCanvas 와 형제로 export 되어 'flow' 탭 레이아웃 안에서 동작한다.
 */
export function AgentInspector({ agent, provenance, onClose, bundlePath, gate }: AgentInspectorProps): JSX.Element {
  const tokens = phaseTokens(agent.phaseClass)
  const [explainLoading, setExplainLoading] = useState(false)
  const [explainMarkdown, setExplainMarkdown] = useState<string | null>(null)
  const [explainError, setExplainError] = useState<string | null>(null)
  const [explainExpanded, setExplainExpanded] = useState(false)

  /** AI 설명 요청 — window.api.harness.explain optional chaining 처리 */
  const handleExplain = useCallback(async () => {
    if (!bundlePath) return
    setExplainLoading(true)
    setExplainError(null)
    try {
      const api = (window as unknown as { api?: { harness?: { explain?: (arg: { path: string; topic: string }) => Promise<{ markdown: string }> } } }).api
      const result = await api?.harness?.explain?.({
        path: bundlePath,
        topic: `에이전트: ${agent.displayName} (${agent.id})`
      })
      if (result?.markdown) {
        setExplainMarkdown(result.markdown)
        setExplainExpanded(true)
      } else {
        setExplainError('AI 설명을 받지 못했습니다.')
      }
    } catch (e) {
      setExplainError(e instanceof Error ? e.message : String(e))
    } finally {
      setExplainLoading(false)
    }
  }, [bundlePath, agent.displayName, agent.id])

  // provenance 에서 이 에이전트의 model 출처 확인
  const agentIdx = agent.id  // provenance 키는 "agents[N].model" 형식이므로 id 로 간접 탐색
  const modelFieldKey = findProvenanceKey(provenance, agentIdx, 'model')
  const modelSource = modelFieldKey ? provenance[modelFieldKey] : agent.modelSource

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 border-b border-[color:var(--bg-border)] flex-shrink-0"
        style={{ background: tokens.bg }}
      >
        <span
          className="text-xs font-bold flex-1 truncate"
          style={{ color: tokens.fg }}
          title={agent.displayName}
        >
          {agent.displayName}
        </span>
        <Button
          variant="ghost"
          size="xs"
          onClick={onClose}
          title="닫기"
          aria-label="인스펙터 닫기"
        >
          <X size={12} />
        </Button>
      </div>

      {/* 본체 */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">

        {/* 모델 */}
        <Section label="모델">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Chip tone={MODEL_TONE[agent.model] ?? 'neutral'} square>
              {agent.model === 'unknown' ? '알 수 없음' : agent.model}
            </Chip>
            <ProvenanceBadge source={modelSource} size="xs" />
          </div>
        </Section>

        {/* 역할 */}
        {agent.role && (
          <Section label="역할">
            <p className="text-xs text-[color:var(--text-secondary)] leading-snug">
              {agent.role}
            </p>
          </Section>
        )}

        {/* phaseClass */}
        {agent.phaseClass && (
          <Section label="페이즈">
            <span
              className="ds-chip sq text-xs"
              style={{ background: tokens.bg, color: tokens.fg, border: `1px solid ${tokens.border}` }}
            >
              {agent.phaseClass}
            </span>
          </Section>
        )}

        {/* 도구 화이트리스트 */}
        {agent.tools.length > 0 && (
          <Section label="허용 도구" icon={<Wrench size={10} />}>
            <div className="flex flex-wrap gap-1">
              {agent.tools.map((tool) => (
                <span
                  key={tool}
                  className="ds-chip neutral sq text-xs"
                  style={{ maxWidth: '150px' }}
                  title={tool}
                >
                  <span className="truncate inline-block max-w-full">{tool}</span>
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* 읽기 파일 (reads) */}
        {agent.reads.length > 0 && (
          <Section label="읽기 (reads)" icon={<FileInput size={10} />}>
            <ul className="flex flex-col gap-0.5">
              {agent.reads.map((r, idx) => (
                <li key={idx} className="text-xs text-[color:var(--text-secondary)] font-mono leading-snug truncate" title={r}>
                  {r}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* 쓰기 경로 (writes) */}
        {agent.writes.length > 0 && (
          <Section label="쓰기 (writes)" icon={<FileOutput size={10} />}>
            <ul className="flex flex-col gap-0.5">
              {agent.writes.map((w, idx) => (
                <li key={idx} className="text-xs text-[color:var(--text-secondary)] font-mono leading-snug truncate" title={w}>
                  {w}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* 위험 노트 */}
        {agent.riskNote && (
          <Section
            label="주된 위험"
            icon={<AlertTriangle size={10} style={{ color: 'var(--c-yellow-fg)' }} />}
          >
            <p className="text-xs text-[color:var(--text-secondary)] leading-snug">
              {agent.riskNote}
            </p>
          </Section>
        )}

        {/* 에스컬레이션 조건 */}
        {agent.escalation && (
          <Section
            label="에스컬레이션"
            icon={<ArrowUpCircle size={10} style={{ color: 'var(--c-orange-fg)' }} />}
          >
            <p className="text-xs text-[color:var(--text-secondary)] leading-snug">
              {agent.escalation}
            </p>
          </Section>
        )}

        {/* 이 단계 게이트 */}
        {gate && (
          <Section
            label="이 단계 게이트"
            icon={
              gate.blocking
                ? <Lock size={10} style={{ color: 'var(--c-red-fg)' }} />
                : <Unlock size={10} style={{ color: 'var(--c-emerald-fg)' }} />
            }
          >
            <div className="flex flex-col gap-2">
              {/* blocking 배지 */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {gate.blocking ? (
                  <Chip tone="red" square>차단 (blocking)</Chip>
                ) : (
                  <Chip tone="emerald" square>경고만</Chip>
                )}
              </div>
              {/* 규칙코드 + 무엇을 검사하나 — 성격별 그룹핑 */}
              {gate.ruleCodes.length > 0 && (() => {
                const ruleDetails = gate.ruleDetails && gate.ruleDetails.length > 0
                  ? gate.ruleDetails
                  : gate.ruleCodes.map((code) => ({ code, message: '' }))
                const groups = groupRuleDetails(ruleDetails)
                return (
                  <div className="flex flex-col gap-2">
                    {groups.map((group) => (
                      <div key={group.category} className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <RuleGroupIcon category={group.category} />
                          <span className="text-[calc(10px_*_var(--app-font-scale,1))] font-medium text-[color:var(--text-secondary)] uppercase tracking-wide">
                            {group.label}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1 pl-3.5">
                          {group.rules.map((d) => (
                            <div key={d.code} className="flex items-start gap-1.5">
                              <Chip tone="violet" square>{d.code}</Chip>
                              {d.message && (
                                <span className="text-xs text-[color:var(--text-secondary)] leading-snug flex-1 min-w-0">
                                  {d.message}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
              {/* description 전문 */}
              {gate.description && (
                <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                  {gate.description}
                </p>
              )}
            </div>
          </Section>
        )}

        {/* 허용 신호 (signals) */}
        {agent.signals && agent.signals.length > 0 && (
          <Section label="허용 신호">
            <div className="flex flex-wrap gap-1">
              {agent.signals.map((sig) => (
                <Chip key={sig} tone="violet" square>{sig}</Chip>
              ))}
            </div>
          </Section>
        )}

        {/* AI 설명 섹션 (M8) */}
        {bundlePath && (
          <Section
            label="AI 설명"
            icon={<Sparkles size={10} style={{ color: 'var(--clauday-blue)' }} />}
          >
            {!explainMarkdown && !explainError && (
              <Button
                variant="secondary"
                size="xs"
                leftIcon={<Sparkles size={10} />}
                onClick={() => void handleExplain()}
                disabled={explainLoading}
              >
                {explainLoading ? '설명 생성 중...' : 'AI 설명 생성'}
              </Button>
            )}

            {explainError && (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-[color:var(--c-red-fg)]">{explainError}</p>
                <Button variant="ghost" size="xs" onClick={() => void handleExplain()}>
                  재시도
                </Button>
              </div>
            )}

            {explainMarkdown && (
              <div className="flex flex-col gap-1">
                <button
                  className="flex items-center gap-1 text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)] transition-colors"
                  onClick={() => setExplainExpanded((v) => !v)}
                  aria-expanded={explainExpanded}
                >
                  {explainExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  <span className="text-xs">{explainExpanded ? '접기' : '펼치기'}</span>
                </button>
                {explainExpanded && (
                  <div className="text-xs text-[color:var(--text-secondary)] leading-relaxed whitespace-pre-wrap bg-[color:var(--bg-primary)] rounded-md p-2.5 border border-[color:var(--bg-border)] max-h-48 overflow-y-auto">
                    {explainMarkdown}
                  </div>
                )}
              </div>
            )}
          </Section>
        )}

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 내부 헬퍼 컴포넌트
// ─────────────────────────────────────────────

/** 카테고리별 lucide 아이콘 */
function RuleGroupIcon({ category, size = 11 }: { category: RuleCategory; size?: number }): JSX.Element {
  switch (category) {
    case 'existence': return <FileCheck size={size} style={{ color: 'var(--c-emerald-fg)', flexShrink: 0 }} />
    case 'section':   return <ListChecks size={size} style={{ color: 'var(--c-blue-fg)', flexShrink: 0 }} />
    case 'content':   return <CheckCircle2 size={size} style={{ color: 'var(--c-violet-fg)', flexShrink: 0 }} />
    case 'domain':    return <ShieldAlert size={size} style={{ color: 'var(--c-orange-fg)', flexShrink: 0 }} />
    default:          return <Dot size={size} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
  }
}

interface SectionProps {
  label: string
  icon?: React.ReactNode
  children: React.ReactNode
}

function Section({ label, icon, children }: SectionProps): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {icon && <span className="text-[color:var(--text-tertiary)]">{icon}</span>}
        <span className="ds-field-label">{label}</span>
      </div>
      {children}
    </div>
  )
}

/**
 * provenance 맵에서 주어진 에이전트 id 와 fieldName 에 해당하는 키를 탐색.
 * 키 형식: "agents[N].fieldName"
 */
function findProvenanceKey(
  provenance: Provenance,
  agentId: string,
  fieldName: string
): string | undefined {
  return Object.keys(provenance).find(
    (key) => key.endsWith(`.${fieldName}`) && key.includes(agentId)
  )
}

export default AgentInspector
