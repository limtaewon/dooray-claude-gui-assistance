import { useEffect, useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import type { AIProgressEvent } from '../../../../shared/types/ai'

/**
 * 전역 AI 작업 인디케이터.
 * 어떤 탭에서든 AI 작업이 진행 중이면 상단 바에 떠서 진행 상황 표시.
 * 돌아가서 결과 보러 가기 편하게.
 */
function GlobalAIIndicator(): JSX.Element | null {
  const [active, setActive] = useState<{ message: string; elapsedMs: number } | null>(null)

  useEffect(() => {
    const unsub = window.api.ai.onProgress((event: AIProgressEvent) => {
      if (event.stage === 'done' || event.stage === 'error') {
        setActive(null)
      } else {
        setActive({ message: event.message || 'AI 작업 중', elapsedMs: event.elapsedMs })
      }
    })
    return unsub
  }, [])

  if (!active) return null

  const seconds = Math.floor(active.elapsedMs / 1000)
  const timeStr = seconds < 60 ? `${seconds}초` : `${Math.floor(seconds / 60)}분 ${seconds % 60}초`

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-clover-orange/20 to-clover-blue/20 border border-clover-orange/30">
      <div className="relative flex items-center justify-center">
        <Sparkles size={11} className="text-clover-orange" />
        <Loader2 size={14} className="absolute text-clover-orange/40 animate-spin" />
      </div>
      <span className="text-[10px] text-text-primary font-medium truncate max-w-[200px]">
        {active.message}
      </span>
      <span className="text-[9px] text-text-tertiary font-mono">{timeStr}</span>
    </div>
  )
}

export default GlobalAIIndicator
