import { useEffect, useState } from 'react'
import { Check, Compass, Play, RotateCcw, Settings as SettingsIcon } from 'lucide-react'
import { VIEW_ONBOARDING, type OnboardingViewId } from '../common/onboarding/viewOnboarding'
import { TOURS, type TourViewId } from '../common/onboarding/tours'

/** 허브에 늘어놓을 순서 — 처음 쓰는 사람이 밟을 만한 차례. */
const ORDER: TourViewId[] = [
  'terminal',
  'dooray',
  'sessions',
  'mcp',
  'skills',
  'agent',
  'monitoring',
  'community',
  'ai-recommend',
  'usage',
  'harness',
  'settings'
]

const SETTINGS_CARD = {
  icon: SettingsIcon,
  title: '설정',
  description: '저장소·프로젝트 규칙·단축키·테마. 워크스페이스 규칙이 업무 드롭 동작을 정합니다.'
}

function cardOf(view: TourViewId): { icon: typeof SettingsIcon; title: string; description: string } {
  if (view === 'settings') return SETTINGS_CARD
  const copy = VIEW_ONBOARDING[view as OnboardingViewId]
  return { icon: copy.icon, title: copy.title, description: copy.description }
}

interface OnboardingHubProps {
  /** 그 메뉴로 이동한 뒤 투어를 시작한다 */
  onStartTour: (view: TourViewId) => void
  /** 이미 본 투어 — 다시 볼 수 있게 표시만 한다 */
  completed: TourViewId[]
  onResetCompleted: () => void
}

/**
 * 온보딩 허브 — 메뉴 목록에서 하나를 골라 그 화면으로 이동한 뒤 기능 안내를 시작한다.
 *
 * 읽는 매뉴얼을 대신한다. 기능 설명은 그 기능이 있는 화면에서, 실제 요소를 가리키며 하는 편이
 * 훨씬 잘 남는다 — 문서는 어디를 눌러야 하는지까지는 알려주지 못한다.
 */
function OnboardingHub({ onStartTour, completed, onResetCompleted }: OnboardingHubProps): JSX.Element {
  const done = new Set(completed)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[min(1100px,92%)] py-8 flex flex-col gap-5">
        <header className="flex items-start gap-3">
          <div className="flex-none w-9 h-9 rounded-lg bg-bg-active flex items-center justify-center">
            <Compass size={18} className="text-text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[calc(17px_*_var(--app-font-scale,1))] font-semibold text-text-primary">
              온보딩
            </h1>
            <p className="text-[calc(12px_*_var(--app-font-scale,1))] text-text-secondary mt-0.5">
              메뉴를 고르고 <strong className="text-text-primary">온보딩 시작</strong> 을 누르면 그 화면으로
              옮겨가 기능을 하나씩 짚어 줍니다. 안내 중에는 <kbd className="ds-kbd">←</kbd>{' '}
              <kbd className="ds-kbd">→</kbd> 로 이동하고 <kbd className="ds-kbd">Esc</kbd> 로 멈춥니다.
            </p>
          </div>
          {done.size > 0 && (
            <button onClick={onResetCompleted} className="ds-btn ghost sm flex-none" title="본 표시를 모두 지웁니다">
              <RotateCcw size={11} /> 진행 초기화
            </button>
          )}
        </header>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2.5">
          {ORDER.map((view) => {
            const card = cardOf(view)
            const Icon = card.icon
            const steps = TOURS[view]?.length ?? 0
            const seen = done.has(view)
            return (
              <div key={view} className="ds-card flat flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Icon size={14} className="flex-none text-text-tertiary" />
                  <span className="flex-1 min-w-0 text-[calc(13px_*_var(--app-font-scale,1))] font-medium text-text-primary truncate">
                    {card.title}
                  </span>
                  {seen && (
                    <span className="ds-chip emerald flex-none">
                      <Check size={8} /> 봄
                    </span>
                  )}
                </div>

                <p className="flex-1 text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-secondary leading-relaxed">
                  {card.description}
                </p>

                <div className="flex items-center gap-2">
                  <span className="flex-1 text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary">
                    {steps}단계
                  </span>
                  <button
                    onClick={() => onStartTour(view)}
                    disabled={steps === 0}
                    className="ds-btn secondary sm flex-none"
                  >
                    <Play size={10} /> {seen ? '다시 보기' : '온보딩 시작'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default OnboardingHub
