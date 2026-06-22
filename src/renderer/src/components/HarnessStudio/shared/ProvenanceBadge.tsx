import { Cpu, FileText, GitBranch, HelpCircle } from 'lucide-react'
import type { FieldSource } from '@shared/types/harness'

export interface ProvenanceBadgeProps {
  source: FieldSource
  /** 칩 크기. 기본 'sm' */
  size?: 'xs' | 'sm'
  className?: string
}

/** 필드 출처(provenance)에 따른 신뢰도 배지.
 *
 * - static  : 정적 파서가 파일/frontmatter 에서 직접 읽은 값 (신뢰도 최고)
 * - ai      : AI 가 산문 분석으로 추정한 값
 * - inferred: 규칙 기반으로 정적 데이터에서 파생한 값 (AI 없음)
 * - absent  : 번들에 해당 정보 없음
 *
 * ADR-001 §신뢰도 투명성 요구에 따라 모든 AI 추정 필드 옆에 이 배지를 표시한다.
 */
export function ProvenanceBadge({ source, size = 'sm', className = '' }: ProvenanceBadgeProps): JSX.Element {
  const config = SOURCE_CONFIG[source]
  const Icon = config.icon
  const sizeCls = size === 'xs' ? ' xs' : ''

  return (
    <span
      className={`ds-chip sq ${config.tone}${sizeCls} inline-flex items-center gap-0.5 ${className}`}
      title={config.label}
      aria-label={`출처: ${config.label}`}
    >
      <Icon size={size === 'xs' ? 8 : 9} />
      <span>{config.short}</span>
    </span>
  )
}

/** FieldSource → 표시 설정 매핑 (순수 데이터, 테스트 대상) */
export const SOURCE_CONFIG: Record<FieldSource, {
  short: string
  label: string
  tone: 'emerald' | 'blue' | 'yellow' | 'neutral'
  icon: typeof FileText
}> = {
  static:   { short: '정적',   label: '정적 파서 — 파일/frontmatter 직접 읽음', tone: 'emerald', icon: FileText },
  ai:       { short: 'AI',     label: 'AI 추정 — 산문 분석 기반',       tone: 'blue',    icon: Cpu },
  inferred: { short: '파생',   label: '규칙 기반 파생 — AI 없음, 간접 추론',     tone: 'yellow',  icon: GitBranch },
  absent:   { short: '없음',   label: '번들에 해당 정보 없음',                    tone: 'neutral', icon: HelpCircle }
}

export default ProvenanceBadge
