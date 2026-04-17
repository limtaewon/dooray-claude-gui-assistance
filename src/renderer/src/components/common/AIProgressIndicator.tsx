import { Sparkles, Clock, Loader2 } from 'lucide-react'
import { formatElapsed, type AIProgressState } from '../../hooks/useAIProgress'

interface Props {
  progress: AIProgressState
  /** 스트리밍 텍스트 프리뷰를 보여줄지 (기본 false) */
  showStreamPreview?: boolean
  /** 추가 CSS 클래스 */
  className?: string
}

const STAGE_LABEL: Record<string, string> = {
  idle: '',
  collecting: '데이터 수집',
  thinking: 'AI 추론',
  streaming: '응답 생성',
  parsing: '결과 정리',
  done: '완료',
  error: '오류'
}

function AIProgressIndicator({ progress, showStreamPreview = false, className = '' }: Props): JSX.Element | null {
  if (progress.stage === 'idle' || progress.stage === 'done') return null

  return (
    <div className={`rounded-xl bg-gradient-to-br from-clover-orange/10 via-clover-blue/5 to-transparent border border-clover-orange/20 p-3 ${className}`}>
      <div className="flex items-center gap-2">
        <div className="relative">
          <Sparkles size={14} className="text-clover-orange animate-pulse" />
          {progress.stage !== 'done' && (
            <Loader2 size={18} className="absolute -top-0.5 -left-0.5 text-clover-orange/30 animate-spin" />
          )}
        </div>
        <span className="text-xs font-medium text-text-primary flex-1">
          {progress.message || STAGE_LABEL[progress.stage] || 'AI 작업 중...'}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-text-tertiary font-mono">
          <Clock size={10} />
          {formatElapsed(progress.elapsedMs)}
        </span>
      </div>

      {/* 스테이지 진행바 */}
      <div className="mt-2 flex items-center gap-1">
        {(['collecting', 'thinking', 'streaming', 'parsing'] as const).map((s) => {
          const order = { collecting: 0, thinking: 1, streaming: 2, parsing: 3 }
          const current = order[progress.stage as keyof typeof order] ?? -1
          const mine = order[s]
          const isActive = mine === current
          const isDone = mine < current
          return (
            <div
              key={s}
              className={`flex-1 h-1 rounded-full transition-all ${
                isActive ? 'bg-clover-orange animate-pulse' :
                isDone ? 'bg-clover-blue/60' :
                'bg-bg-border'
              }`}
            />
          )
        })}
      </div>

      {/* 스트리밍 프리뷰 */}
      {showStreamPreview && progress.streamedText && (
        <div className="mt-2 text-[10px] text-text-secondary font-mono max-h-24 overflow-y-auto p-2 bg-bg-primary/50 rounded border border-bg-border/50 whitespace-pre-wrap">
          {progress.streamedText.length > 400
            ? '...' + progress.streamedText.substring(progress.streamedText.length - 400)
            : progress.streamedText}
        </div>
      )}
    </div>
  )
}

export default AIProgressIndicator
