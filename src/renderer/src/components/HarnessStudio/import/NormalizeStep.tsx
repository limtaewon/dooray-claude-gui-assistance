import { useEffect, useRef, useState } from 'react'
import { Cpu, CheckCircle, AlertTriangle } from 'lucide-react'
import type { HarnessModel } from '@shared/types/harness'
import Button from '@/components/common/ds/Button'
import Chip from '@/components/common/ds/Chip'
import { ErrorView } from '@/components/common/ds/StateViews'
import { useAIProgress, formatElapsed } from '@/hooks/useAIProgress'
import { ProvenanceBadge } from '../shared/ProvenanceBadge'

export interface NormalizeStepProps {
  /** 번들 절대 경로. pickDialog 경로인 경우 빈 문자열일 수 있으며, 이 때 main 이 마지막 스캔 경로를 재사용한다 */
  bundlePath: string
  /** 이미 캐시된 모델이 있으면 AI 없이 바로 전달 */
  onComplete: (model: HarnessModel) => void
  onBack: () => void
}

/**
 * Import 위저드 3단계 — AI 정규화.
 *
 * harness.normalize 를 호출하고 useAIProgress 훅으로 진행률을 표시한다.
 * 완료 시 provenance 프리뷰(AI/정적 필드 비율)를 요약해 보여준 뒤 다음 단계로 넘어간다.
 * 캐시 hit 시에는 AI 호출 없이 즉시 완료된다.
 */
export function NormalizeStep({ bundlePath, onComplete, onBack }: NormalizeStepProps): JSX.Element {
  const { progress, start, done, isActive } = useAIProgress()
  const [model, setModel] = useState<HarnessModel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cacheHit, setCacheHit] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    void (async () => {
      const requestId = start()
      try {
        const result = await window.api.harness.normalize({
          path: bundlePath,
          requestId
        })
        // 거의 즉시 돌아오면 캐시 hit 으로 간주 (경과 < 500ms)
        if (progress.elapsedMs < 500) setCacheHit(true)
        setModel(result)
        done()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        done()
      }
    })()
    // start/done 은 useCallback 으로 안정 → deps 에 넣어도 무방하지만 의도적 1회 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <ErrorView
          title="정규화 오류"
          body={error}
          onRetry={() => {
            started.current = false
            setError(null)
          }}
        />
        <div className="flex justify-start pt-2">
          <Button variant="ghost" size="sm" onClick={onBack}>이전</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* 진행 중 */}
      {isActive && (
        <div className="flex flex-col gap-3 items-center py-8">
          <div className="relative">
            <Cpu size={32} className="text-[color:var(--c-blue-solid)] animate-pulse" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-[color:var(--text-primary)]">AI 정규화 진행 중</p>
            <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
              {progress.message || 'Sonnet이 번들 구조를 분석하고 있습니다...'}
            </p>
          </div>
          {progress.elapsedMs > 0 && (
            <p className="text-xs text-[color:var(--text-tertiary)]">{formatElapsed(progress.elapsedMs)} 경과</p>
          )}
          {/* 진행 바 */}
          <div className="w-64 h-1.5 rounded-full bg-[color:var(--bg-border)] overflow-hidden">
            <div className="h-full bg-[color:var(--c-blue-solid)] animate-[progress-indeterminate_1.5s_ease-in-out_infinite] rounded-full" />
          </div>
        </div>
      )}

      {/* 완료 */}
      {model && !isActive && (
        <div className="flex flex-col gap-4">
          {/* 상태 헤더 */}
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-[color:var(--c-emerald-fg)]" />
            <span className="text-sm font-semibold text-[color:var(--text-primary)]">
              {cacheHit ? '캐시에서 불러옴 (즉시)' : '정규화 완료'}
            </span>
            {cacheHit && <Chip tone="emerald" square>캐시</Chip>}
          </div>

          {/* Degradation 경고 */}
          {model.warnings.length > 0 && (
            <div className="flex flex-col gap-1">
              {model.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md p-2 bg-[color:var(--c-yellow-bg)]">
                  <AlertTriangle size={13} className="mt-0.5 flex-none text-[color:var(--c-yellow-fg)]" />
                  <p className="text-xs text-[color:var(--c-yellow-fg)] leading-relaxed">{w}</p>
                </div>
              ))}
            </div>
          )}

          {/* Provenance 요약 */}
          <ProvenanceSummary model={model} />

          {/* 액션 */}
          <div className="flex justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={onBack}>이전</Button>
            <Button variant="primary" size="sm" onClick={() => onComplete(model)}>
              다음 — 확정
            </Button>
          </div>
        </div>
      )}

      {/* 아직 시작 전 (드물게 렌더 직후) */}
      {!isActive && !model && !error && (
        <div className="flex items-center justify-center py-12">
          <div className="ds-spinner" />
        </div>
      )}
    </div>
  )
}

/** HarnessModel 의 provenance 맵에서 static/ai/inferred/absent 비율을 요약 표시 */
function ProvenanceSummary({ model }: { model: HarnessModel }): JSX.Element {
  const counts = countProvenance(model.provenance)
  const total = Object.values(counts).reduce((s, n) => s + n, 0)

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
        필드 출처 요약
      </span>
      <div className="flex flex-wrap gap-2">
        {total === 0 ? (
          <p className="text-xs text-[color:var(--text-tertiary)]">provenance 정보 없음</p>
        ) : (
          (['static', 'ai', 'inferred', 'absent'] as const).map((src) =>
            counts[src] > 0 ? (
              <div key={src} className="flex items-center gap-1">
                <ProvenanceBadge source={src} size="xs" />
                <span className="text-xs text-[color:var(--text-secondary)]">{counts[src]}개</span>
              </div>
            ) : null
          )
        )}
      </div>
      {/* 에이전트 수 */}
      <p className="text-xs text-[color:var(--text-secondary)]">
        에이전트 {model.agents.length}개 &middot; 레벨 {model.levels.length}개 &middot; 산출물 {model.artifacts.length}개
      </p>
    </div>
  )
}

/** Provenance 맵에서 source별 카운트를 계산하는 순수함수 (테스트 대상) */
export function countProvenance(provenance: Record<string, string>): Record<'static' | 'ai' | 'inferred' | 'absent', number> {
  const counts = { static: 0, ai: 0, inferred: 0, absent: 0 }
  for (const src of Object.values(provenance)) {
    if (src === 'static' || src === 'ai' || src === 'inferred' || src === 'absent') {
      counts[src]++
    }
  }
  return counts
}
