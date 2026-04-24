import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import Kbd from './Kbd'

export interface CommandItem {
  id: string
  label: string
  icon?: ReactNode
  hint?: string
  keywords?: string
}

export interface CommandGroup {
  label: string
  items: CommandItem[]
}

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  groups: CommandGroup[]
  onRun: (item: CommandItem) => void
  placeholder?: string
}

/** ⌘K 스타일 커맨드 팔레트. group별 라벨 + 필터링 + 키보드 네비게이션 */
function CommandPalette({
  open, onClose, groups, onRun, placeholder = '명령 또는 파일 검색...'
}: CommandPaletteProps): JSX.Element | null {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQ('')
    setSel(0)
    const t = setTimeout(() => inputRef.current?.focus(), 20)
    return () => clearTimeout(t)
  }, [open])

  const filtered = useMemo<CommandGroup[]>(() => {
    if (!q.trim()) return groups
    const lq = q.toLowerCase()
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((i) =>
          i.label.toLowerCase().includes(lq) ||
          (i.hint?.toLowerCase().includes(lq) ?? false) ||
          (i.keywords?.toLowerCase().includes(lq) ?? false)
        )
      }))
      .filter((g) => g.items.length > 0)
  }, [q, groups])

  const flat = useMemo<CommandItem[]>(
    () => filtered.flatMap((g) => g.items),
    [filtered]
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(flat.length - 1, s + 1)) }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
      else if (e.key === 'Enter') {
        e.preventDefault()
        const it = flat[sel]
        if (it) { onRun(it); onClose() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, flat, sel, onClose, onRun])

  if (!open) return null

  let idxOffset = 0
  return createPortal(
    <div className="ds-cp-backdrop" onClick={onClose}>
      <div className="ds-cp" onClick={(e) => e.stopPropagation()}>
        <div className="ds-cp-search">
          <Search size={14} style={{ color: 'var(--text-tertiary)' }} />
          <input
            ref={inputRef} value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0) }}
            placeholder={placeholder}
          />
          <Kbd>ESC</Kbd>
        </div>
        <div className="ds-cp-list">
          {flat.length === 0 && (
            <div style={{ padding: '18px 12px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 11 }}>
              결과가 없어요
            </div>
          )}
          {filtered.map((g) => {
            const startIdx = idxOffset
            idxOffset += g.items.length
            return (
              <div key={g.label}>
                <div className="ds-cp-group-label">{g.label}</div>
                {g.items.map((it, i) => {
                  const idx = startIdx + i
                  return (
                    <div
                      key={it.id}
                      className={`ds-cp-item ${sel === idx ? 'sel' : ''}`}
                      onMouseEnter={() => setSel(idx)}
                      onClick={() => { onRun(it); onClose() }}
                    >
                      <span className="cp-icon">{it.icon || <ChevronRight size={13} />}</span>
                      <span className="cp-lbl">{it.label}</span>
                      {it.hint && <span className="cp-hint">{it.hint}</span>}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
        <div className="ds-cp-foot">
          <span style={{ display: 'inline-flex', gap: 4 }}><Kbd>↑</Kbd><Kbd>↓</Kbd> 이동</span>
          <span style={{ display: 'inline-flex', gap: 4 }}><Kbd>↵</Kbd> 실행</span>
          <span style={{ flex: 1 }} />
          <span>{flat.length}건</span>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default CommandPalette
