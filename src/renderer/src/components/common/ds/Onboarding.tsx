import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import Kbd from './Kbd'

export interface OnboardingStep {
  /** 스텝 아이콘 — 생략하면 순번 원이 그려진다 */
  icon?: LucideIcon
  title: string
  body?: ReactNode
  /** `⌘T` / `Ctrl+T` 같은 표기. 이미 분해된 키 배열을 넘긴다 */
  keys?: string[]
}

export interface OnboardingAction {
  label: string
  onClick: () => void
  icon?: LucideIcon
  variant?: 'primary' | 'secondary'
  disabled?: boolean
}

export interface OnboardingViewProps {
  icon: LucideIcon
  title: string
  description: ReactNode
  /** 이 화면에서 무엇을 할 수 있는지 — 3~5개가 적당하다 */
  steps?: OnboardingStep[]
  actions?: OnboardingAction[]
  /** 맨 아래 한 줄 힌트 */
  hint?: ReactNode
  /** 좁은 패널(드로어 320px)용 축약 레이아웃 */
  compact?: boolean
  /** 아이콘 강조색 — 도메인 식별색(브랜드) 을 넘긴다 */
  accent?: string
}

/**
 * 메뉴별 온보딩 화면. 비어 있는 상태를 "아무것도 없음"이 아니라 "여기서 무엇을 할 수 있는지"로
 * 바꾼다 — 발견이 어려운 기능(드래그&드롭, 단축키)을 이 자리에서 알린다.
 */
function OnboardingView({
  icon: Icon,
  title,
  description,
  steps = [],
  actions = [],
  hint,
  compact = false,
  accent
}: OnboardingViewProps): JSX.Element {
  const scale = compact ? 0.85 : 1

  return (
    <div
      className={`flex-1 flex flex-col items-center justify-center min-h-0 overflow-y-auto ${
        compact ? 'px-4 py-6' : 'px-8 py-10'
      }`}
    >
      <div
        className={`rounded-[14px] bg-bg-surface-raised border border-bg-border flex items-center justify-center flex-none ${
          compact ? 'w-10 h-10' : 'w-14 h-14'
        }`}
      >
        <Icon size={compact ? 18 : 26} style={accent ? { color: accent } : undefined} className={accent ? '' : 'text-text-secondary'} />
      </div>

      <h2
        className="mt-4 font-bold text-text-primary text-center"
        style={{ fontSize: `calc(${compact ? 15 : 24}px * var(--app-font-scale, 1))` }}
      >
        {title}
      </h2>
      <p
        className="mt-1.5 text-text-secondary text-center leading-relaxed max-w-md"
        style={{ fontSize: `calc(${compact ? 11.5 : 12.5}px * var(--app-font-scale, 1))` }}
      >
        {description}
      </p>

      {actions.length > 0 && (
        <div className={`flex flex-wrap items-center justify-center gap-2 ${compact ? 'mt-4' : 'mt-6'}`}>
          {actions.map((action) => {
            const ActionIcon = action.icon
            return (
              <button
                key={action.label}
                onClick={action.onClick}
                disabled={action.disabled}
                className={`ds-btn ${action.variant ?? 'secondary'}${compact ? ' xs' : ''}`}
              >
                {ActionIcon && <ActionIcon size={compact ? 12 : 14} />} {action.label}
              </button>
            )
          })}
        </div>
      )}

      {steps.length > 0 && (
        <div
          className={`w-full flex flex-col ${compact ? 'mt-5 gap-2.5' : 'mt-9 gap-3 max-w-sm'}`}
        >
          {steps.map((step, index) => {
            const StepIcon = step.icon
            return (
              <div key={step.title} className="flex items-start gap-2.5">
                <span className="flex-none mt-[1px] w-4 h-4 rounded-full bg-bg-surface-raised border border-bg-border flex items-center justify-center">
                  {StepIcon ? (
                    <StepIcon size={9} className="text-text-tertiary" />
                  ) : (
                    <span className="text-[calc(9px_*_var(--app-font-scale,1))] text-text-tertiary tabular-nums">{index + 1}</span>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-text-primary"
                      style={{ fontSize: `calc(${11.5 * scale + 0.5}px * var(--app-font-scale, 1))` }}
                    >
                      {step.title}
                    </span>
                    {step.keys && step.keys.length > 0 && (
                      <span className="flex items-center gap-1 ml-auto flex-none">
                        {step.keys.map((key, i) => (
                          <Kbd key={i}>{key}</Kbd>
                        ))}
                      </span>
                    )}
                  </div>
                  {step.body && (
                    <p
                      className="mt-0.5 text-text-tertiary leading-relaxed"
                      style={{ fontSize: `calc(${10.5}px * var(--app-font-scale, 1))` }}
                    >
                      {step.body}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {hint && (
        <p
          className={`text-text-tertiary text-center ${compact ? 'mt-5' : 'mt-8'}`}
          style={{ fontSize: 'calc(10.5px * var(--app-font-scale, 1))' }}
        >
          {hint}
        </p>
      )}
    </div>
  )
}

export default OnboardingView
