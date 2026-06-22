/**
 * ViewExplainer — 각 뷰 최상단에 붙는 "읽는 법 + AI 심화 설명" 배너.
 *
 * 정적 howto 는 항상 노출되고,
 * "AI 설명" 버튼을 누르면 window.api.harness.explain 을 호출해
 * 마크다운을 접고 펼치는 형태로 표시한다.
 *
 * AgentInspector 의 explain 패턴을 재사용한다.
 */

import { useState, useCallback, type ReactNode } from 'react'
import { Info, Sparkles, ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import Button from '@/components/common/ds/Button'

export interface ViewExplainerProps {
  /** 제목 (예: "Skills / Blocks") */
  title: string
  /** 항상 노출되는 정적 설명 (ReactNode 허용 — 목록, 강조 등) */
  howto: ReactNode
  /** AI explain topic 문자열 */
  topic: string
  /** 번들 소스 경로 */
  sourcePath: string
  /** 아이콘 (선택) */
  icon?: LucideIcon
}

/**
 * 각 뷰 최상단에 삽입하는 설명 배너.
 *
 * - 정적 howto 는 항상 표시.
 * - "AI 설명 보기" 버튼 → explain IPC → 마크다운 표시 (접고 펼치기).
 * - window.api.harness.explain 없을 때 버튼 자체를 숨겨 안전 강등.
 */
export function ViewExplainer({
  title,
  howto,
  topic,
  sourcePath,
  icon: Icon
}: ViewExplainerProps): JSX.Element {
  const [explainOpen, setExplainOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hasExplainApi = Boolean(
    (window as unknown as { api?: { harness?: { explain?: unknown } } }).api?.harness?.explain
  )

  const handleExplain = useCallback(async () => {
    if (markdown) {
      setExplainOpen((v) => !v)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const api = (
        window as unknown as {
          api?: {
            harness?: {
              explain?: (arg: { path: string; topic: string }) => Promise<{ markdown: string }>
            }
          }
        }
      ).api
      const result = await api?.harness?.explain?.({ path: sourcePath, topic })
      if (result?.markdown) {
        setMarkdown(result.markdown)
        setExplainOpen(true)
      } else {
        setError('AI 설명을 받지 못했습니다.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [markdown, sourcePath, topic])

  return (
    <div className="flex flex-col gap-2 px-4 pt-4 pb-3 border-b border-[color:var(--bg-border)] bg-[color:var(--bg-surface)]">
      {/* 제목 행 */}
      <div className="flex items-center gap-2">
        {Icon ? (
          <Icon size={16} className="text-[color:var(--clauday-blue)] flex-none" />
        ) : (
          <Info size={16} className="text-[color:var(--clauday-blue)] flex-none" />
        )}
        <span className="text-sm font-semibold text-[color:var(--text-primary)]">{title}</span>
        {hasExplainApi && (
          <div className="ml-auto">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Sparkles size={14} />}
              onClick={() => void handleExplain()}
              disabled={loading}
              title="이 화면 내용을 AI 가 쉽게 설명해 줍니다"
            >
              {loading ? 'AI 설명 생성 중…' : markdown ? (explainOpen ? '설명 접기' : 'AI 설명 보기') : 'AI 설명 보기'}
            </Button>
          </div>
        )}
      </div>

      {/* 정적 howto */}
      <div className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
        {howto}
      </div>

      {/* AI 설명 영역 */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-[color:var(--c-red-fg)]">
          <span>{error}</span>
          <Button variant="ghost" size="xs" onClick={() => void handleExplain()}>
            재시도
          </Button>
        </div>
      )}

      {markdown && (
        <div className="flex flex-col gap-1">
          <button
            className="flex items-center gap-1 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors w-fit"
            onClick={() => setExplainOpen((v) => !v)}
            aria-expanded={explainOpen}
          >
            {explainOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <span className="text-xs">AI 심화 설명 {explainOpen ? '접기' : '펼치기'}</span>
          </button>
          {explainOpen && (
            <div className="text-xs text-[color:var(--text-secondary)] leading-relaxed whitespace-pre-wrap bg-[color:var(--bg-primary)] rounded-md p-2.5 border border-[color:var(--bg-border)] max-h-64 overflow-y-auto">
              {markdown}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ViewExplainer
