import { useState } from 'react'
import { AlertTriangle, CheckCircle, FileText, ChevronDown, ChevronRight, Wrench } from 'lucide-react'
import type { RawBundleSummary, HarnessMeta } from '@shared/types/harness'
import Button from '@/components/common/ds/Button'
import Chip from '@/components/common/ds/Chip'
import Card from '@/components/common/ds/Card'
import { KindChip } from './SourceStep'

export type HarnessKind = HarnessMeta['kind']

export interface ScanStepProps {
  summary: RawBundleSummary
  /** 사용자가 kind 를 수동으로 교정한 경우 부모에게 알림 (ADR-002) */
  onKindOverride?: (kind: HarnessKind) => void
  /** kind 교정 포함한 실제 적용 kind */
  kindOverride?: HarnessKind
  onConfirm: () => void
  onBack: () => void
}

const KIND_OPTIONS: HarnessKind[] = ['bundle', 'overlay', 'partial-skill', 'task']

/**
 * Import 위저드 2단계 — 정적 스캔 결과 확인.
 *
 * AI 없이 즉시 표시된다. 표시 내용:
 * - 감지된 번들 종류(kind)와 수동 교정 UI (ADR-002 kind 오판 대응)
 * - 파일 트리 (접기/펼치기)
 * - 에이전트 스텁 목록 (id, model, tools 개수)
 * - 스캔 경고 메시지 (항상 사용자에게 노출)
 */
export function ScanStep({ summary, onKindOverride, kindOverride, onConfirm, onBack }: ScanStepProps): JSX.Element {
  const [treeExpanded, setTreeExpanded] = useState(false)
  const [showKindPicker, setShowKindPicker] = useState(false)

  const activeKind = kindOverride ?? summary.kind
  const hasWarnings = summary.warnings.length > 0

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* 종류 + 교정 UI */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
            감지된 번들 종류
          </span>
          {kindOverride && kindOverride !== summary.kind && (
            <Chip tone="orange" square>수동 교정됨</Chip>
          )}
        </div>
        <div className="flex items-center gap-2">
          <KindChip kind={activeKind} />
          <Button
            variant="ghost"
            size="xs"
            leftIcon={<Wrench size={10} />}
            onClick={() => setShowKindPicker(!showKindPicker)}
            aria-expanded={showKindPicker}
            aria-label="번들 종류 수동 교정"
          >
            {showKindPicker ? '닫기' : '교정'}
          </Button>
        </div>

        {showKindPicker && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {KIND_OPTIONS.map((k) => (
              <button
                key={k}
                onClick={() => {
                  onKindOverride?.(k)
                  setShowKindPicker(false)
                }}
                className={[
                  'ds-btn ghost xs rounded-md',
                  activeKind === k ? 'bg-[color:var(--c-orange-bg)] text-[color:var(--c-orange-fg)]' : ''
                ].join(' ')}
                aria-pressed={activeKind === k}
              >
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 경고 메시지 — 항상 노출 (ADR-002 degradation) */}
      {hasWarnings && (
        <section className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
            스캔 경고
          </span>
          {summary.warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-md p-2 bg-[color:var(--c-yellow-bg)]"
            >
              <AlertTriangle size={13} className="mt-0.5 flex-none text-[color:var(--c-yellow-fg)]" />
              <p className="text-xs text-[color:var(--c-yellow-fg)] leading-relaxed">{w}</p>
            </div>
          ))}
        </section>
      )}

      {/* 에이전트 스텁 */}
      {summary.agentStubs.length > 0 && (
        <section className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
            감지된 에이전트 ({summary.agentStubs.length}개)
          </span>
          <div className="flex flex-col gap-1">
            {summary.agentStubs.map((agent) => (
              <Card key={agent.id} variant="flat" className="flex items-center gap-2 px-2 py-1.5">
                <CheckCircle size={12} className="flex-none text-[color:var(--c-emerald-fg)]" />
                <span className="text-sm font-medium text-[color:var(--text-primary)] flex-none">
                  {agent.displayName}
                </span>
                <ModelChip model={agent.model} />
                {agent.tools.length > 0 && (
                  <Chip tone="neutral" square className="ml-auto">
                    도구 {agent.tools.length}개
                  </Chip>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* 파일 트리 (접기/펼치기) */}
      <section className="flex flex-col gap-1">
        <button
          className="flex items-center gap-1 text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider hover:text-[color:var(--text-primary)] transition-colors"
          onClick={() => setTreeExpanded(!treeExpanded)}
          aria-expanded={treeExpanded}
        >
          {treeExpanded
            ? <ChevronDown size={12} />
            : <ChevronRight size={12} />
          }
          파일 ({summary.fileTree.length}개)
        </button>
        {treeExpanded && (
          <div className="rounded-md border border-[color:var(--bg-border)] bg-[color:var(--bg-primary)] px-3 py-2 max-h-48 overflow-y-auto">
            {summary.fileTree.map((path) => (
              <div key={path} className="flex items-center gap-1.5 py-0.5">
                <FileText size={10} className="flex-none text-[color:var(--text-tertiary)]" />
                <span className="text-xs font-mono text-[color:var(--text-secondary)]">{path}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 액션 버튼 */}
      <div className="flex justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          이전
        </Button>
        <Button variant="primary" size="sm" onClick={onConfirm}>
          AI 정규화 시작
        </Button>
      </div>
    </div>
  )
}

/** 모델 표시 칩 */
function ModelChip({ model }: { model: string }): JSX.Element {
  const MAP: Record<string, { tone: React.ComponentProps<typeof Chip>['tone']; label: string }> = {
    haiku:   { tone: 'neutral',  label: 'Haiku' },
    sonnet:  { tone: 'blue',     label: 'Sonnet' },
    opus:    { tone: 'violet',   label: 'Opus' },
    unknown: { tone: 'neutral',  label: '미확인' }
  }
  const cfg = MAP[model] ?? MAP.unknown
  return <Chip tone={cfg.tone} square>{cfg.label}</Chip>
}

const KIND_LABELS: Record<HarnessKind, string> = {
  bundle:          '번들',
  overlay:         '오버레이',
  'partial-skill': '부분 스킬',
  task:            '태스크'
}

export { ModelChip, KIND_LABELS }
