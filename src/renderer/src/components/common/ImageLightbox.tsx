import { useEffect, useState, useCallback } from 'react'
import { X, Download, ZoomIn, ZoomOut, RotateCw } from 'lucide-react'

interface LightboxState {
  src: string
  alt?: string
}

/**
 * 이미지 클릭 시 전체화면 확대 보기.
 * App 최상단에 한 번 마운트 + window 이벤트로 열기.
 */
function ImageLightbox(): JSX.Element | null {
  const [state, setState] = useState<LightboxState | null>(null)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)

  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<LightboxState>).detail
      if (detail?.src) {
        setState(detail)
        setZoom(1)
        setRotation(0)
      }
    }
    window.addEventListener('open-lightbox', handler)
    return () => window.removeEventListener('open-lightbox', handler)
  }, [])

  const close = useCallback(() => setState(null), [])

  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(z + 0.25, 5))
      if (e.key === '-') setZoom((z) => Math.max(z - 0.25, 0.25))
      if (e.key === 'r') setRotation((r) => (r + 90) % 360)
      if (e.key === '0') { setZoom(1); setRotation(0) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, close])

  const handleDownload = (): void => {
    if (!state) return
    const a = document.createElement('a')
    a.href = state.src
    a.download = state.alt || 'image.png'
    a.click()
  }

  if (!state) return null

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center"
      onClick={close}
    >
      {/* 툴바 */}
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-bg-surface/90 backdrop-blur rounded-xl px-2 py-1.5 border border-bg-border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={() => setZoom((z) => Math.max(z - 0.25, 0.25))}
          className="p-1.5 rounded-lg hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary" title="축소 (-)">
          <ZoomOut size={14} />
        </button>
        <span className="text-[10px] text-text-tertiary font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(z + 0.25, 5))}
          className="p-1.5 rounded-lg hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary" title="확대 (+)">
          <ZoomIn size={14} />
        </button>
        <div className="w-px h-4 bg-bg-border mx-1" />
        <button onClick={() => setRotation((r) => (r + 90) % 360)}
          className="p-1.5 rounded-lg hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary" title="회전 (R)">
          <RotateCw size={14} />
        </button>
        <button onClick={handleDownload}
          className="p-1.5 rounded-lg hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary" title="다운로드">
          <Download size={14} />
        </button>
        <div className="w-px h-4 bg-bg-border mx-1" />
        <button onClick={close}
          className="p-1.5 rounded-lg hover:bg-red-500/20 text-text-secondary hover:text-red-400" title="닫기 (Esc)">
          <X size={14} />
        </button>
      </div>

      {/* 파일명 */}
      {state.alt && (
        <div className="absolute top-4 right-4 text-[11px] text-text-tertiary bg-bg-surface/90 backdrop-blur rounded-lg px-3 py-1.5 border border-bg-border max-w-xs truncate">
          {state.alt}
        </div>
      )}

      {/* 키보드 단축키 안내 */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 text-[10px] text-text-tertiary bg-bg-surface/80 backdrop-blur rounded-lg px-3 py-1.5 border border-bg-border/50">
        <span><kbd className="font-mono">Esc</kbd> 닫기</span>
        <span><kbd className="font-mono">+/-</kbd> 확대/축소</span>
        <span><kbd className="font-mono">R</kbd> 회전</span>
        <span><kbd className="font-mono">0</kbd> 초기화</span>
      </div>

      {/* 이미지 */}
      <img
        src={state.src}
        alt={state.alt || ''}
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: `scale(${zoom}) rotate(${rotation}deg)`,
          transition: 'transform 0.15s ease-out',
          maxWidth: '90vw',
          maxHeight: '90vh',
          cursor: 'zoom-in'
        }}
        className="rounded-lg shadow-2xl select-none"
        draggable={false}
      />
    </div>
  )
}

/** 이미지 클릭 핸들러 — DoorayImage 등에서 호출 */
export function openLightbox(src: string, alt?: string): void {
  window.dispatchEvent(new CustomEvent<LightboxState>('open-lightbox', { detail: { src, alt } }))
}

export default ImageLightbox
