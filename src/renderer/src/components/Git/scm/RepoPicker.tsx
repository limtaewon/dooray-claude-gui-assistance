import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, FolderGit2, FolderOpen, Pin, Terminal as TerminalIcon } from 'lucide-react'
import { useToast } from '../../common/ds'

interface RepoPickerProps {
  repo: string | null
  pinned: string | null
  recents: string[]
  onPin: (repo: string | null) => void
  /** 자동 추종일 때 터미널이 가리키는 폴더 — 저장소가 아니면 안내에 쓴다 */
  autoCwd?: string | null
}

function basename(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() || path
}

/**
 * 소스 제어가 볼 저장소 선택.
 *
 * 기본은 터미널 자동 추종이고, 목록에서 고르면 그 저장소로 **고정**된다. 고정이 필요한 이유:
 * Windows 는 셸의 `cd` 를 추적할 수 없고, 터미널을 안 연 상태에서도 저장소를 봐야 할 때가 있으며,
 * A 에서 작업하며 B 를 들여다보고 싶은 경우가 있다.
 */
function RepoPicker({ repo, pinned, recents, onPin, autoCwd }: RepoPickerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent): void => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const chooseFolder = async (): Promise<void> => {
    setOpen(false)
    const folder = await window.api.dialog.selectFolder()
    if (!folder) return
    const root = await window.api.git.repoRoot(folder).catch(() => '')
    if (!root.trim()) {
      toast.error('git 저장소가 아닙니다', folder)
      return
    }
    onPin(root.trim())
  }

  const label = repo ? basename(repo) : '저장소 없음'

  return (
    <div ref={containerRef} className="relative px-2 py-1.5 flex-none border-b border-bg-border">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={repo ?? (autoCwd ? `${autoCwd} — git 저장소가 아닙니다` : '터미널을 열어 저장소로 이동하세요')}
        className="w-full h-6 px-1.5 flex items-center gap-1.5 rounded-[5px] hover:bg-bg-surface-hover text-left"
      >
        <FolderGit2 size={11} className="text-text-tertiary flex-none" />
        <span className="flex-1 min-w-0 truncate text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-primary">
          {label}
        </span>
        {pinned ? (
          <Pin size={9} className="text-text-tertiary flex-none" aria-label="고정됨" />
        ) : (
          <TerminalIcon size={9} className="text-text-tertiary flex-none" aria-label="터미널 따라가는 중" />
        )}
        <ChevronDown size={11} className="text-text-tertiary flex-none" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-2 right-2 top-full z-30 mt-0.5 py-1 rounded-md border border-bg-border bg-bg-surface-raised shadow-lg max-h-72 overflow-y-auto"
        >
          <Row
            selected={pinned === null}
            icon={<TerminalIcon size={11} />}
            label="터미널 따라가기"
            hint="지금 보고 있는 터미널의 저장소"
            onClick={() => { onPin(null); setOpen(false) }}
          />

          {recents.length > 0 && (
            <>
              <div className="px-2 pt-1.5 pb-0.5 text-[calc(9.5px_*_var(--app-font-scale,1))] font-semibold uppercase tracking-wide text-text-tertiary">
                최근 저장소
              </div>
              {recents.map((path) => (
                <Row
                  key={path}
                  selected={pinned === path}
                  icon={<FolderGit2 size={11} />}
                  label={basename(path)}
                  hint={path}
                  onClick={() => { onPin(path); setOpen(false) }}
                />
              ))}
            </>
          )}

          <div className="my-1 border-t border-bg-border" />
          <Row
            icon={<FolderOpen size={11} />}
            label="폴더 열기…"
            onClick={() => void chooseFolder()}
          />
        </div>
      )}
    </div>
  )
}

function Row({
  selected,
  icon,
  label,
  hint,
  onClick
}: {
  selected?: boolean
  icon: JSX.Element
  label: string
  hint?: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      role="option"
      aria-selected={Boolean(selected)}
      onClick={onClick}
      title={hint}
      className="w-full px-2 py-1 flex items-center gap-1.5 hover:bg-bg-surface-hover text-left"
    >
      <span className="text-text-tertiary flex-none">{icon}</span>
      <span className="flex-1 min-w-0 truncate text-[calc(11px_*_var(--app-font-scale,1))] text-text-primary">
        {label}
      </span>
      {selected && <Check size={11} className="text-text-secondary flex-none" />}
    </button>
  )
}

export default RepoPicker
