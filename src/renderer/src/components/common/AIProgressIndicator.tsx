import { Sparkles, Clock, Loader2, Info } from 'lucide-react'
import { formatElapsed, type AIProgressState } from '../../hooks/useAIProgress'
import { useEffect, useRef } from 'react'

interface Props {
  progress: AIProgressState
  /** 스트리밍 텍스트 프리뷰를 보여줄지 (기본 false) */
  showStreamPreview?: boolean
  /** 예상 시간 안내 (예: "보통 30초~2분") */
  expectedTime?: string
  /** 추가 CSS 클래스 */
  className?: string
  /** 큰 레이아웃 사용 (브리핑/보고서처럼 메인 영역 차지할 때) */
  size?: 'compact' | 'large'
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

function AIProgressIndicator({
  progress,
  showStreamPreview = false,
  expectedTime,
  className = '',
  size = 'compact'
}: Props): JSX.Element | null {
  const preRef = useRef<HTMLPreElement>(null)

  // 스트림 preview 자동 스크롤 (최신 출력 보이게)
  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight
    }
  }, [progress.streamedText])

  if (progress.stage === 'idle' || progress.stage === 'done') return null

  const isLarge = size === 'large'

  return (
    <div className={`rounded-xl bg-gradient-to-br from-clover-orange/10 via-clover-blue/5 to-transparent border border-clover-orange/20 ${isLarge ? 'p-5' : 'p-3'} ${className}`}>
      <div className="flex items-center gap-2.5">
        <div className="relative flex-shrink-0">
          <Sparkles size={isLarge ? 18 : 14} className="text-clover-orange animate-pulse" />
          {progress.stage !== 'error' && (
            <Loader2 size={isLarge ? 24 : 18} className="absolute -top-0.5 -left-0.5 text-clover-orange/30 animate-spin" />
          )}
        </div>
        <span className={`font-medium text-text-primary flex-1 ${isLarge ? 'text-sm' : 'text-xs'}`}>
          {progress.message || STAGE_LABEL[progress.stage] || 'AI 작업 중...'}
        </span>
        <span className={`flex items-center gap-1 text-text-tertiary font-mono ${isLarge ? 'text-xs' : 'text-[10px]'}`}>
          <Clock size={isLarge ? 12 : 10} />
          {formatElapsed(progress.elapsedMs)}
        </span>
      </div>

      {/* 스테이지 진행바 */}
      <div className={`flex items-center gap-1 ${isLarge ? 'mt-3' : 'mt-2'}`}>
        {(['collecting', 'thinking', 'streaming', 'parsing'] as const).map((s) => {
          const order = { collecting: 0, thinking: 1, streaming: 2, parsing: 3 }
          const current = order[progress.stage as keyof typeof order] ?? -1
          const mine = order[s]
          const isActive = mine === current
          const isDone = mine < current
          return (
            <div
              key={s}
              className={`flex-1 ${isLarge ? 'h-1.5' : 'h-1'} rounded-full transition-all ${
                isActive ? 'bg-clover-orange animate-pulse' :
                isDone ? 'bg-clover-blue/60' :
                'bg-bg-border'
              }`}
            />
          )
        })}
      </div>

      {/* 스테이지 라벨 */}
      {isLarge && (
        <div className="flex items-center gap-1 mt-1 text-[9px] text-text-tertiary">
          {(['collecting', 'thinking', 'streaming', 'parsing'] as const).map((s) => (
            <span key={s} className="flex-1 text-center">{STAGE_LABEL[s]}</span>
          ))}
        </div>
      )}

      {/* 예상 시간 안내 */}
      {expectedTime && isLarge && (
        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-text-tertiary">
          <Info size={10} /> {expectedTime}
        </div>
      )}

      {/* 스트리밍 프리뷰 */}
      {showStreamPreview && progress.streamedText && (
        <pre
          ref={preRef}
          className={`mt-3 text-text-secondary font-mono p-3 bg-bg-primary/60 rounded-lg border border-bg-border/50 whitespace-pre-wrap overflow-y-auto leading-relaxed ${
            isLarge ? 'text-[11px] max-h-80' : 'text-[10px] max-h-24'
          }`}
        >
          {progress.streamedText.length > 2000
            ? '... ' + progress.streamedText.substring(progress.streamedText.length - 2000)
            : progress.streamedText}
        </pre>
      )}
    </div>
  )
}

export default AIProgressIndicator
