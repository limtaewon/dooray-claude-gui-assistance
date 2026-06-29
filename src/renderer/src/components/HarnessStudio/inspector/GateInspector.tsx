/**
 * GateInspector — 선택된 게이트의 상세 정보 패널.
 *
 * FlowCanvas 에서 GateNode 클릭 시 우측 패널에 표시된다.
 * 표시 항목: 단계(phase), blocking 여부 강조, 규칙코드 전체, description 전문.
 * blocking=true 이면 "통과 못하면 다음 단계로 진입 불가" 경고를 명시한다.
 *
 * "AI 설명" 버튼 — window.api.harness.explain 을 optional chaining 으로 호출.
 * AgentInspector 와 동일한 우측 패널 폭·스타일을 공유한다.
 */

import { useState, useCallback } from 'react'
import {
  X,
  Lock,
  Unlock,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronRight,
  FileCheck,
  ListChecks,
  CheckCircle2,
  ShieldAlert,
  Dot
} from 'lucide-react'
import type { HarnessGate } from '@shared/types/harness'
import Chip from '@/components/common/ds/Chip'
import Button from '@/components/common/ds/Button'
import { groupRuleDetails } from '../views/gateRuleGroups'
import type { RuleCategory } from '../views/gateRuleGroups'

export interface GateInspectorProps {
  /** 표시할 게이트 */
  gate: HarnessGate
  /** 번들 소스 경로 (explain 호출에 필요) */
  sourcePath: string
  /** 닫기 버튼 콜백 */
  onClose: () => void
}

/**
 * 선택된 게이트의 phase / blocking / ruleCodes / description 상세 패널.
 *
 * FlowCanvas 에서 GateNode 클릭 시 AgentInspector 대신 표시된다.
 */
export function GateInspector({ gate, sourcePath, onClose }: GateInspectorProps): JSX.Element {
  const [explainLoading, setExplainLoading] = useState(false)
  const [explainMarkdown, setExplainMarkdown] = useState<string | null>(null)
  const [explainError, setExplainError] = useState<string | null>(null)
  const [explainExpanded, setExplainExpanded] = useState(false)

  /** AI 설명 요청 — window.api.harness.explain optional chaining 처리 */
  const handleExplain = useCallback(async () => {
    setExplainLoading(true)
    setExplainError(null)
    try {
      const api = (
        window as unknown as {
          api?: {
            harness?: {
              explain?: (arg: {
                path: string
                topic: string
              }) => Promise<{ markdown: string }>
            }
          }
        }
      ).api
      const ruleCodesStr = gate.ruleCodes.length > 0 ? gate.ruleCodes.join(', ') : '없음'
      const result = await api?.harness?.explain?.({
        path: sourcePath,
        topic: `게이트 "${gate.phase}" 가 무엇을 검사하고 무엇을 차단하는지, 규칙코드 ${ruleCodesStr} 의 의미 설명`
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
  }, [sourcePath, gate.phase, gate.ruleCodes])

  const headerBg = gate.blocking
    ? 'color-mix(in oklab, var(--c-red-solid) 14%, var(--bg-surface))'
    : 'color-mix(in oklab, var(--c-emerald-solid) 14%, var(--bg-surface))'
  const headerFg = gate.blocking ? 'var(--c-red-fg)' : 'var(--c-emerald-fg)'

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 border-b border-[color:var(--bg-border)] flex-shrink-0"
        style={{ background: headerBg }}
      >
        {gate.blocking ? (
          <Lock size={12} style={{ color: headerFg, flexShrink: 0 }} />
        ) : (
          <Unlock size={12} style={{ color: headerFg, flexShrink: 0 }} />
        )}
        <span
          className="text-xs font-bold flex-1 truncate font-mono"
          style={{ color: headerFg }}
          title={`Gate: ${gate.phase}`}
        >
          Gate: {gate.phase}
        </span>
        <Button
          variant="ghost"
          size="xs"
          onClick={onClose}
          title="닫기"
          aria-label="게이트 인스펙터 닫기"
        >
          <X size={12} />
        </Button>
      </div>

      {/* 본체 */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">

        {/* 차단 여부 강조 */}
        <Section label="차단 유형">
          {gate.blocking ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <Chip tone="red" square>차단 (blocking)</Chip>
              </div>
              <div
                className="flex items-start gap-1.5 rounded-md px-2.5 py-2 text-xs leading-snug"
                style={{
                  background: 'var(--c-red-bg)',
                  color: 'var(--c-red-fg)',
                  border: '1px solid color-mix(in oklab, var(--c-red-fg) 20%, transparent)'
                }}
              >
                <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>이 게이트를 통과하지 못하면 다음 단계로 진입할 수 없습니다.</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Chip tone="emerald" square>경고만</Chip>
            </div>
          )}
        </Section>

        {/* 단계 */}
        <Section label="단계 (phase)">
          <span
            className="ds-chip sq text-xs font-mono"
            style={{
              background: 'var(--bg-surface-raised)',
              color: 'var(--text-primary)',
              border: '1px solid var(--bg-border)'
            }}
          >
            {gate.phase}
          </span>
        </Section>

        {/* 규칙 코드별 검사 내용 — 성격별 그룹핑 */}
        {gate.ruleCodes.length > 0 && (() => {
          const ruleDetails = gate.ruleDetails && gate.ruleDetails.length > 0
            ? gate.ruleDetails
            : gate.ruleCodes.map((code) => ({ code, message: '(스크립트에서 설명 추출 안 됨)' }))
          const groups = groupRuleDetails(ruleDetails)
          return (
            <Section label={`규칙 코드 (${gate.ruleCodes.length}개) — 무엇을 검사하나`}>
              <div className="flex flex-col gap-2">
                {groups.map((group) => (
                  <div key={group.category} className="flex flex-col gap-1">
                    {/* 그룹 소제목 */}
                    <div className="flex items-center gap-1">
                      <RuleGroupIcon category={group.category} />
                      <span className="text-[calc(10px_*_var(--app-font-scale,1))] font-medium text-[color:var(--text-secondary)] uppercase tracking-wide">
                        {group.label}
                      </span>
                    </div>
                    {/* 그룹 규칙 목록 */}
                    <div className="flex flex-col gap-1 pl-3.5">
                      {group.rules.map((d) => (
                        <div key={d.code} className="flex items-start gap-2">
                          <Chip tone="violet" square>{d.code}</Chip>
                          <span className="text-xs text-[color:var(--text-secondary)] leading-relaxed flex-1 min-w-0">
                            {d.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )
        })()}

        {/* description 전문 — truncate 금지 */}
        {gate.description && (
          <Section label="이 게이트가 막는 것">
            <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
              {gate.description}
            </p>
          </Section>
        )}

        {/* AI 설명 섹션 */}
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

export default GateInspector
