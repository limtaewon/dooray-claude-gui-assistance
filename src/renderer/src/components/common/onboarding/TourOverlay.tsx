import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { TourStep } from './tours'
import { spotlightRect, tourCardPosition, type TourRect } from './tourGeometry'

const CARD = { width: 340, height: 168 }

interface TourOverlayProps {
  steps: TourStep[]
  index: number
  onIndexChange: (next: number) => void
  onClose: () => void
  /** 마지막 단계에서 '완료' 를 눌렀을 때 */
  onFinish: () => void
}

function anchorRect(anchor: string | undefined): TourRect | null {
  if (!anchor) return null
  const element = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`)
  if (!element) return null
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

/**
 * 기능 안내 투어 — 실제 화면 요소를 비추고 그 옆에 설명을 붙인다.
 *
 * 앵커를 못 찾으면 가운데 카드로 떨어진다. 화면이 아직 안 그려졌거나 그 요소가 조건부로만
 * 나타나는 경우가 있어서, 못 찾았다고 단계를 건너뛰면 설명에 구멍이 생긴다.
 */
function TourOverlay({ steps, index, onIndexChange, onClose, onFinish }: TourOverlayProps): JSX.Element | null {
  const step = steps[index]
  const [rect, setRect] = useState<TourRect | null>(null)

  const measure = useCallback(() => {
    setRect(anchorRect(step?.anchor))
  }, [step?.anchor])

  useLayoutEffect(() => {
    if (!step) return
    // 요소가 늦게 붙는 화면(탭 전환 직후 등)을 위해 한 프레임 뒤에 한 번 더 잰다.
    measure()
    const raf = window.requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure, step])

  const last = index >= steps.length - 1
  const goNext = useCallback(() => {
    if (last) onFinish()
    else onIndexChange(index + 1)
  }, [last, onFinish, onIndexChange, index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        goNext()
      } else if (e.key === 'ArrowLeft') {
        onIndexChange(Math.max(0, index - 1))
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [goNext, onClose, onIndexChange, index])

  if (!step) return null

  const viewport = { width: window.innerWidth, height: window.innerHeight }
  const hole = spotlightRect(rect, viewport)
  const card = tourCardPosition(rect, CARD, viewport)

  return createPortal(
    <div className="fixed inset-0 z-[200]" role="dialog" aria-label="기능 안내">
      {/* 구멍 뚫린 딤 — 큰 그림자로 바깥을 덮으면 리렌더마다 사각형 4개를 그리지 않아도 된다 */}
      {hole ? (
        <div
          className="absolute rounded-lg pointer-events-none border-2 border-brand-claude"
          style={{
            left: hole.left,
            top: hole.top,
            width: hole.width,
            height: hole.height,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)'
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}

      {/* 딤 클릭으로 닫기 — 카드 영역은 아래에서 stopPropagation */}
      <div className="absolute inset-0" onClick={onClose} />

      <div
        className="absolute flex flex-col gap-2 p-3.5 rounded-xl bg-bg-surface-raised border border-bg-border-strong shadow-2xl"
        style={{ left: card.left, top: card.top, width: CARD.width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2">
          <span className="flex-1 text-[calc(13px_*_var(--app-font-scale,1))] font-semibold text-text-primary">
            {step.title}
          </span>
          <button onClick={onClose} className="ds-btn ghost icon flex-none" aria-label="안내 닫기">
            <X size={12} />
          </button>
        </div>

        <p className="text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-secondary leading-relaxed">
          {step.body}
        </p>

        <div className="flex items-center gap-1.5 mt-1">
          <span className="flex-1 text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary tabular-nums">
            {index + 1}/{steps.length}
          </span>
          <button
            onClick={() => onIndexChange(Math.max(0, index - 1))}
            disabled={index === 0}
            className="ds-btn ghost sm"
            aria-label="이전 단계"
          >
            <ChevronLeft size={11} /> 이전
          </button>
          <button onClick={goNext} className="ds-btn primary sm" aria-label={last ? '안내 마치기' : '다음 단계'}>
            {last ? '마치기' : '다음'}
            {!last && <ChevronRight size={11} />}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default TourOverlay
