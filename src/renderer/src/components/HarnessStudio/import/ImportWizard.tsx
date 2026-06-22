import { useState, useCallback } from 'react'
import { X } from 'lucide-react'
import type { RawBundleSummary, HarnessModel } from '@shared/types/harness'
import type { HarnessKind } from './ScanStep'
import Button from '@/components/common/ds/Button'
import { SourceStep } from './SourceStep'
import { ScanStep } from './ScanStep'
import { NormalizeStep } from './NormalizeStep'
import { ConfirmStep } from './ConfirmStep'
import type { ConfirmStepPersonalization } from './ConfirmStep'

/** Import 위저드 4단계 식별자 */
export type WizardStep = 'source' | 'scan' | 'normalize' | 'confirm'

export interface ImportWizardProps {
  onComplete: (model: HarnessModel, personalization: ConfirmStepPersonalization) => void
  onClose: () => void
}

/** 단계별 표시 이름 */
const STEP_LABELS: Record<WizardStep, string> = {
  source:    '소스 선택',
  scan:      '구조 인식',
  normalize: 'AI 정규화',
  confirm:   '확정·개인화'
}

const STEP_ORDER: WizardStep[] = ['source', 'scan', 'normalize', 'confirm']

/**
 * Harness Import 위저드 컨테이너.
 *
 * 4단계를 선형으로 진행하며 각 단계의 결과를 state 로 보유한다:
 * source → scan → normalize → confirm
 *
 * 단계 전이 로직과 UI 를 분리해 순수함수 테스트(wizardStepTransition)가 가능하다.
 */
export function ImportWizard({ onComplete, onClose }: ImportWizardProps): JSX.Element {
  const [currentStep, setCurrentStep] = useState<WizardStep>('source')
  const [bundlePath, setBundlePath] = useState('')
  const [scanSummary, setScanSummary] = useState<RawBundleSummary | null>(null)
  const [kindOverride, setKindOverride] = useState<HarnessKind | undefined>()
  const [model, setModel] = useState<HarnessModel | null>(null)

  const handleScanReady = useCallback((path: string, summary: RawBundleSummary) => {
    setBundlePath(path)
    setScanSummary(summary)
    setKindOverride(undefined)
    setCurrentStep('scan')
  }, [])

  const handleScanConfirm = useCallback(() => {
    setCurrentStep('normalize')
  }, [])

  const handleNormalizeComplete = useCallback((normalized: HarnessModel) => {
    setModel(normalized)
    setCurrentStep('confirm')
  }, [])

  const handleConfirm = useCallback((personalization: ConfirmStepPersonalization) => {
    if (model) onComplete(model, personalization)
  }, [model, onComplete])

  const goBack = useCallback(() => {
    const idx = STEP_ORDER.indexOf(currentStep)
    if (idx > 0) setCurrentStep(STEP_ORDER[idx - 1])
  }, [currentStep])

  const currentIdx = STEP_ORDER.indexOf(currentStep)

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--bg-border)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[color:var(--text-primary)]">
            하네스 가져오기
          </span>
        </div>
        <Button variant="icon" size="sm" onClick={onClose} aria-label="위저드 닫기">
          <X size={14} />
        </Button>
      </div>

      {/* 스텝 인디케이터 */}
      <div className="flex items-center gap-0 px-4 py-2.5 border-b border-[color:var(--bg-border)] flex-shrink-0">
        {STEP_ORDER.map((step, i) => (
          <StepIndicator
            key={step}
            label={STEP_LABELS[step]}
            index={i + 1}
            active={currentStep === step}
            done={currentIdx > i}
            isLast={i === STEP_ORDER.length - 1}
          />
        ))}
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto">
        {currentStep === 'source' && (
          <SourceStep onScanReady={handleScanReady} />
        )}
        {currentStep === 'scan' && scanSummary && (
          <ScanStep
            summary={scanSummary}
            kindOverride={kindOverride}
            onKindOverride={setKindOverride}
            onConfirm={handleScanConfirm}
            onBack={goBack}
          />
        )}
        {currentStep === 'normalize' && (
          <NormalizeStep
            bundlePath={bundlePath}
            onComplete={handleNormalizeComplete}
            onBack={goBack}
          />
        )}
        {currentStep === 'confirm' && model && (
          <ConfirmStep
            model={model}
            onConfirm={handleConfirm}
            onBack={goBack}
          />
        )}
      </div>
    </div>
  )
}

interface StepIndicatorProps {
  label: string
  index: number
  active: boolean
  done: boolean
  isLast: boolean
}

function StepIndicator({ label, index, active, done, isLast }: StepIndicatorProps): JSX.Element {
  return (
    <>
      <div className="flex items-center gap-1.5 flex-none">
        <span
          className={[
            'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold',
            done
              ? 'bg-[color:var(--c-emerald-bg)] text-[color:var(--c-emerald-fg)]'
              : active
                ? 'bg-[color:var(--c-orange-bg)] text-[color:var(--c-orange-fg)]'
                : 'bg-[color:var(--bg-surface)] text-[color:var(--text-tertiary)] border border-[color:var(--bg-border)]'
          ].join(' ')}
        >
          {index}
        </span>
        <span
          className={[
            'text-xs font-medium',
            active
              ? 'text-[color:var(--text-primary)]'
              : done
                ? 'text-[color:var(--c-emerald-fg)]'
                : 'text-[color:var(--text-tertiary)]'
          ].join(' ')}
        >
          {label}
        </span>
      </div>
      {!isLast && (
        <span className="flex-1 h-px bg-[color:var(--bg-border)] mx-2 min-w-[12px]" aria-hidden="true" />
      )}
    </>
  )
}

/** 단계 전이 로직을 순수 함수로 분리 (테스트 대상) */
export function wizardNextStep(current: WizardStep): WizardStep {
  const idx = STEP_ORDER.indexOf(current)
  return idx < STEP_ORDER.length - 1 ? STEP_ORDER[idx + 1] : current
}

export function wizardPrevStep(current: WizardStep): WizardStep {
  const idx = STEP_ORDER.indexOf(current)
  return idx > 0 ? STEP_ORDER[idx - 1] : current
}

export { STEP_ORDER, STEP_LABELS }
