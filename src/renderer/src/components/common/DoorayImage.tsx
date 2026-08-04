import { useEffect, useState, createContext, useContext } from 'react'
import { ImageOff, Loader2, ExternalLink } from 'lucide-react'
import { openLightbox } from './ImageLightbox'

export interface DoorayFileContextValue {
  projectId?: string
  postId?: string
  wikiId?: string
  pageId?: string
}

/** 태스크/위키 컴포넌트가 Provider로 감싸서 이미지 로드 시 경로 구성에 사용 */
export const DoorayFileContext = createContext<DoorayFileContextValue>({})

interface Props {
  src?: string
  alt?: string
  className?: string
}

/**
 * 실패 원인을 사람 말로. 원인마다 사용자가 할 일이 다르다 —
 * 없는 파일은 두레이에서 보면 되고, 권한 문제는 봐도 안 되며, 429 는 그냥 다시 열면 된다.
 */
export function causeLabel(cause?: string): string {
  if (cause === '404') return '두레이에서 보기'
  if (cause === '403') return '접근 권한 없음'
  if (cause === '429') return '요청이 몰림 · 다시 열어보세요'
  return '로드 실패'
}

function DoorayImage({ src, alt, className }: Props): JSX.Element | null {
  const ctx = useContext(DoorayFileContext)
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!src) return

    if (src.startsWith('http://') || src.startsWith('https://')) {
      setDataUrl(src)
      return
    }
    if (src.startsWith('data:')) {
      setDataUrl(src)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    window.api.dooray.fetchFile(src, ctx)
      .then((url) => { if (!cancelled) { setDataUrl(url); setLoading(false) } })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [src, ctx.projectId, ctx.postId, ctx.wikiId, ctx.pageId])

  if (!src) return null

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary">
        <Loader2 size={11} className="animate-spin" /> 이미지 로딩 중...
      </span>
    )
  }

  if (error) {
    const webUrl = src.startsWith('/') ? `https://nhnent.dooray.com${src}` : src
    // main 이 첫 후보(컨텍스트 경로)의 상태 코드를 `[cause=NNN]` 으로 실어 보낸다.
    // 메시지 전체에서 '404' 를 찾으면 안 된다 — 늘 404 인 범용 후보 때문에 항상 참이 된다.
    const cause = /\[cause=(\d+)\]/.exec(error)?.[1]
    return (
      <a href={webUrl} target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary hover:border-bg-border-strong hover:text-brand-dooray transition-colors"
        title={error}>
        <ImageOff size={13} className="flex-shrink-0" />
        <span className="truncate max-w-xs">{alt || '이미지'}</span>
        <ExternalLink size={10} className="flex-shrink-0 opacity-60" />
        <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary flex-shrink-0">
          {causeLabel(cause)}
        </span>
      </a>
    )
  }

  if (!dataUrl) return null

  return (
    <img
      src={dataUrl}
      alt={alt || ''}
      className={`${className || ''} cursor-zoom-in hover:opacity-90 transition-opacity`}
      onClick={(e) => { e.stopPropagation(); openLightbox(dataUrl, alt) }}
    />
  )
}

export default DoorayImage
