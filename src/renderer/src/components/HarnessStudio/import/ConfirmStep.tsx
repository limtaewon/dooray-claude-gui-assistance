import { useState } from 'react'
import { CheckCircle, Globe, Layers } from 'lucide-react'
import type { HarnessModel } from '@shared/types/harness'
import Button from '@/components/common/ds/Button'
import Card from '@/components/common/ds/Card'
import Chip from '@/components/common/ds/Chip'
import { KindChip } from './SourceStep'
import { ProvenanceBadge } from '../shared/ProvenanceBadge'

export interface ConfirmStepPersonalization {
  /** 오버레이 반영 여부 (P3) */
  applyOverlay: boolean
  /** 용어 번역 활성화 여부 (P3) */
  termTranslation: boolean
}

export interface ConfirmStepProps {
  model: HarnessModel
  /** 확정 클릭 시 호출 */
  onConfirm: (personalization: ConfirmStepPersonalization) => void
  onBack: () => void
}

/**
 * Import 위저드 4단계 — 확정 및 개인화.
 *
 * - 모델 요약 표시 (이름, kind, 에이전트 수, 레벨 수)
 * - 오버레이 반영 토글 (P3 자리만 마련 — 현재는 토글 상태만 보유)
 * - 용어 번역 토글 (P3 자리만 마련 — 현재는 토글 상태만 보유)
 * - 확정 버튼: 위저드를 닫고 HarnessStudioView 에서 model 을 보유
 */
export function ConfirmStep({ model, onConfirm, onBack }: ConfirmStepProps): JSX.Element {
  const [applyOverlay, setApplyOverlay] = useState(false)
  const [termTranslation, setTermTranslation] = useState(false)

  const handleConfirm = (): void => {
    onConfirm({ applyOverlay, termTranslation })
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* 모델 요약 카드 */}
      <Card className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-[color:var(--text-primary)]">
              {model.meta.name}
            </span>
            {model.meta.tagline && (
              <p className="text-xs text-[color:var(--text-secondary)]">{model.meta.tagline}</p>
            )}
          </div>
          <KindChip kind={model.meta.kind} />
        </div>

        {/* 메타 */}
        <div className="flex flex-wrap gap-2 pt-1">
          {model.meta.version && (
            <Chip tone="neutral" square>v{model.meta.version}</Chip>
          )}
          {model.meta.author && (
            <Chip tone="neutral" square>{model.meta.author}</Chip>
          )}
          <Chip tone="blue" square>에이전트 {model.agents.length}개</Chip>
          <Chip tone="blue" square>레벨 {model.levels.length}개</Chip>
          <Chip tone="emerald" square>산출물 {model.artifacts.length}개</Chip>
        </div>

        {/* Provenance — meta.source 출처 */}
        {model.provenance['meta.name'] && (
          <div className="flex items-center gap-1 pt-1">
            <span className="text-xs text-[color:var(--text-tertiary)]">이름 출처:</span>
            <ProvenanceBadge source={model.provenance['meta.name']} size="xs" />
          </div>
        )}
      </Card>

      {/* 경고 노출 */}
      {model.warnings.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
            주의
          </span>
          {model.warnings.map((w, i) => (
            <p key={i} className="text-xs text-[color:var(--c-yellow-fg)] bg-[color:var(--c-yellow-bg)] rounded-md px-2 py-1.5">
              {w}
            </p>
          ))}
        </div>
      )}

      {/* 개인화 옵션 (P3 자리) */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
          개인화 (P3 미리보기)
        </span>

        <ToggleRow
          icon={<Layers size={13} />}
          label="오버레이 반영"
          description="config.md / _overlays 가 있으면 모델 오버라이드·비활성 에이전트를 적용합니다"
          value={applyOverlay}
          onChange={setApplyOverlay}
          badge="P3"
        />

        <ToggleRow
          icon={<Globe size={13} />}
          label="용어 번역"
          description="번들 고유 용어를 팀 언어로 번역해 표시합니다"
          value={termTranslation}
          onChange={setTermTranslation}
          badge="P3"
        />
      </div>

      {/* 액션 */}
      <div className="flex justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>이전</Button>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<CheckCircle size={13} />}
          onClick={handleConfirm}
        >
          Harness Studio 열기
        </Button>
      </div>
    </div>
  )
}

interface ToggleRowProps {
  icon: React.ReactNode
  label: string
  description: string
  value: boolean
  onChange: (v: boolean) => void
  badge?: string
}

function ToggleRow({ icon, label, description, value, onChange, badge }: ToggleRowProps): JSX.Element {
  return (
    <div className="flex items-start gap-3 rounded-lg p-2.5 bg-[color:var(--bg-surface)] border border-[color:var(--bg-border)]">
      <span className="text-[color:var(--text-secondary)] mt-0.5 flex-none">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-[color:var(--text-primary)]">{label}</span>
          {badge && <Chip tone="yellow" square>{badge}</Chip>}
        </div>
        <p className="text-xs text-[color:var(--text-secondary)] mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={[
          'relative inline-flex h-5 w-9 flex-none cursor-pointer rounded-full',
          'border-2 border-transparent transition-colors duration-200',
          value
            ? 'bg-[color:var(--c-blue-solid)]'
            : 'bg-[color:var(--bg-border)]'
        ].join(' ')}
        aria-label={`${label} ${value ? '활성화됨' : '비활성화됨'}`}
      >
        <span
          className={[
            'pointer-events-none inline-block h-4 w-4 transform rounded-full',
            'bg-white shadow ring-0 transition duration-200',
            value ? 'translate-x-4' : 'translate-x-0'
          ].join(' ')}
        />
      </button>
    </div>
  )
}

export { ToggleRow }
