import { useEffect, useRef, useState, useCallback } from 'react'
import type { AIProgressEvent } from '../../../shared/types/ai'

export interface AIProgressState {
  requestId: string
  stage: AIProgressEvent['stage'] | 'idle'
  message: string
  elapsedMs: number
  /** 스트리밍 누적 텍스트 */
  streamedText: string
}

/**
 * AI 진행상황 + 스트리밍 훅
 *
 * 사용법:
 *   const { progress, start, done } = useAIProgress()
 *   const handleClick = async () => {
 *     const reqId = start()
 *     const result = await window.api.ai.briefing(reqId)
 *     done()
 *   }
 */
export function useAIProgress(): {
  progress: AIProgressState
  start: () => string
  done: () => void
  isActive: boolean
} {
  const [progress, setProgress] = useState<AIProgressState>({
    requestId: '',
    stage: 'idle',
    message: '',
    elapsedMs: 0,
    streamedText: ''
  })
  const activeRequestId = useRef<string>('')
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const startedAtRef = useRef<number>(0)

  // 이벤트 구독
  useEffect(() => {
    const unsubscribe = window.api.ai.onProgress((event) => {
      if (event.requestId !== activeRequestId.current) return
      setProgress((prev) => ({
        ...prev,
        stage: event.stage,
        message: event.message,
        elapsedMs: event.elapsedMs,
        streamedText: event.chunk ? prev.streamedText + event.chunk : prev.streamedText
      }))
    })
    return unsubscribe
  }, [])

  // 1초마다 경과시간 업데이트 (서버 이벤트가 드물게 오는 구간 대비)
  useEffect(() => {
    if (progress.stage === 'idle' || progress.stage === 'done' || progress.stage === 'error') {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      return
    }
    if (!timerRef.current) {
      timerRef.current = setInterval(() => {
        setProgress((prev) => ({ ...prev, elapsedMs: Date.now() - startedAtRef.current }))
      }, 500)
    }
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }
  }, [progress.stage])

  const start = useCallback((): string => {
    const reqId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    activeRequestId.current = reqId
    startedAtRef.current = Date.now()
    setProgress({
      requestId: reqId,
      stage: 'collecting',
      message: '준비 중...',
      elapsedMs: 0,
      streamedText: ''
    })
    return reqId
  }, [])

  const done = useCallback((): void => {
    setProgress((prev) => ({ ...prev, stage: 'idle' }))
    activeRequestId.current = ''
  }, [])

  const isActive = progress.stage !== 'idle' && progress.stage !== 'done' && progress.stage !== 'error'

  return { progress, start, done, isActive }
}

/** ms를 "12.3초" 또는 "1분 20초"로 포맷 */
export function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}초`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}분 ${s}초`
}
