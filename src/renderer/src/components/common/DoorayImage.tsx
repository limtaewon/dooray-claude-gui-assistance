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
      <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-[10px] text-text-tertiary">
        <Loader2 size={11} className="animate-spin" /> 이미지 로딩 중...
      </span>
    )
  }

  if (error) {
    const webUrl = src.startsWith('/') ? `https://nhnent.dooray.com${src}` : src
    // 404는 "다른 페이지 소유 파일"인 경우가 많음 — 간결한 안내
    const is404 = error.includes('404')
    return (
      <a href={webUrl} target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-[11px] text-text-secondary hover:border-clover-blue/40 hover:text-clover-blue transition-colors"
        title={error}>
        <ImageOff size={13} className="flex-shrink-0" />
        <span className="truncate max-w-xs">{alt || '이미지'}</span>
        <ExternalLink size={10} className="flex-shrink-0 opacity-60" />
        <span className="text-[9px] text-text-tertiary flex-shrink-0">
          {is404 ? '두레이에서 보기' : '로드 실패'}
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
