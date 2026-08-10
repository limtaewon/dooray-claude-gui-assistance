import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SquareArrowOutUpRight } from 'lucide-react'
import type { DetectedEditor } from '@shared/types/editor'
import { anchoredMenuPosition, type AnchoredMenuPosition } from './anchoredMenu'
import { useToast } from './ds'

const MENU_WIDTH = 200

/** 감지 결과는 앱이 떠 있는 동안 잘 바뀌지 않는다 — 컴포넌트마다 IPC 를 부르지 않게 모아 둔다. */
let editorsPromise: Promise<DetectedEditor[]> | null = null

function loadEditors(): Promise<DetectedEditor[]> {
  if (!editorsPromise) {
    editorsPromise = window.api.editor.list().catch((err) => {
      console.warn('[OpenInEditorButton] 에디터 감지 실패:', err)
      return []
    })
  }
  return editorsPromise
}

/** 테스트에서 감지 캐시를 비운다. */
export function resetEditorCache(): void {
  editorsPromise = null
}

interface OpenInEditorButtonProps {
  /** 열 폴더의 절대 경로 */
  path: string
  /** 아이콘만 그릴지 (좁은 목록용) */
  compact?: boolean
  className?: string
}

/**
 * 폴더를 외부 에디터에서 프로젝트로 여는 버튼.
 *
 * 워크트리는 저장소와 다른 폴더라 IDE 에서 매번 찾아 열기가 번거롭다. 설치된 에디터가 하나면
 * 바로 그것으로 열고, 여러 개면 골라서 연다. 하나도 없으면 그리지 않는다 —
 * 눌러도 아무 일 없는 버튼을 두지 않는다.
 */
function OpenInEditorButton({ path, compact = false, className = '' }: OpenInEditorButtonProps): JSX.Element | null {
  const toast = useToast()
  const [editors, setEditors] = useState<DetectedEditor[]>([])
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<AnchoredMenuPosition | null>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let alive = true
    void loadEditors().then((list) => {
      if (alive) setEditors(list)
    })
    return () => {
      alive = false
    }
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const place = (): void => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (!rect) return
      setPos(
        anchoredMenuPosition(rect, { width: MENU_WIDTH }, {
          width: window.innerWidth,
          height: window.innerHeight
        })
      )
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const openWith = async (editor: DetectedEditor): Promise<void> => {
    setOpen(false)
    try {
      await window.api.editor.open({ editorId: editor.id, path })
    } catch (err) {
      toast.error(`${editor.name} 로 열지 못했습니다`, err instanceof Error ? err.message : undefined)
    }
  }

  if (editors.length === 0) return null

  const only = editors.length === 1 ? editors[0] : null
  const label = only ? `${only.name} 로 열기` : '에디터로 열기'

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (only) void openWith(only)
          else setOpen((o) => !o)
        }}
        aria-label={`${label} — ${path}`}
        title={`${label}\n${path}`}
        aria-expanded={only ? undefined : open}
        className={className || 'ds-btn ghost xs flex-none'}
      >
        <SquareArrowOutUpRight size={compact ? 11 : 12} />
        {/* 아이콘만으로는 무슨 버튼인지 읽히지 않는다 — 라벨을 쓸 때는 감지된 에디터 이름까지 드러낸다. */}
        {!compact && <span>{label}</span>}
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
            <div
              role="dialog"
              aria-label="에디터로 열기"
              className="fixed z-[71] flex flex-col rounded-md border border-bg-border bg-bg-surface-raised shadow-xl overflow-hidden py-0.5"
              style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight }}
            >
              {editors.map((editor) => (
                <button
                  key={editor.id}
                  type="button"
                  onClick={() => void openWith(editor)}
                  className="w-full px-2.5 py-1.5 text-left text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover"
                >
                  {editor.name}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </>
  )
}

export default OpenInEditorButton
