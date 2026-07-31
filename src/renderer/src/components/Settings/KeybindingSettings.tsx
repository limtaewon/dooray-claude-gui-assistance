import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Lock, RotateCcw, Search } from 'lucide-react'
import {
  KEYBINDINGS,
  type KeybindingDefinition,
  type KeybindingOverrides,
  defaultBindingsOf,
  effectiveBindings,
  findConflicts,
  findDefinition
} from '@shared/keybindings/registry'
import { bindingFromEvent, formatBinding, formatBindingChips } from '@shared/keybindings/binding'
import { Button, Chip, Input, Kbd, useToast } from '../common/ds'
import { currentPlatform, loadOverrides, saveOverrides } from '../../hooks/useKeybindings'

type Filter = 'all' | 'modified' | 'conflicts'

/** 설정 → 단축키: 전체 목록 확인 + 키 캡처 리바인딩 + 충돌 감지 + 기본값 복원. */
function KeybindingSettings(): JSX.Element {
  const toast = useToast()
  const platform = currentPlatform()
  const [overrides, setOverrides] = useState<KeybindingOverrides>({})
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [capturing, setCapturing] = useState<string | null>(null)

  useEffect(() => {
    void loadOverrides().then(setOverrides)
  }, [])

  const conflicts = useMemo(() => findConflicts(platform, overrides), [platform, overrides])
  const conflictByAction = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const c of conflicts) {
      for (const id of c.actionIds) {
        map.set(id, c.actionIds.filter((other) => other !== id))
      }
    }
    return map
  }, [conflicts])

  const apply = useCallback(
    async (next: KeybindingOverrides): Promise<void> => {
      setOverrides(next)
      try {
        await saveOverrides(next)
      } catch (err) {
        toast.error('단축키 저장 실패', err instanceof Error ? err.message : undefined)
      }
    },
    [toast]
  )

  const rebind = useCallback(
    (def: KeybindingDefinition, binding: string): void => {
      void apply({ ...overrides, [def.id]: [binding] })
    },
    [apply, overrides]
  )

  const reset = useCallback(
    (id: string): void => {
      const next = { ...overrides }
      delete next[id]
      void apply(next)
    },
    [apply, overrides]
  )

  const resetAll = useCallback((): void => {
    if (!window.confirm('모든 단축키를 기본값으로 되돌릴까요?')) return
    void apply({})
  }, [apply])

  // 캡처 모드: 다음 키 입력을 조합으로 받는다. Esc 는 취소.
  useEffect(() => {
    if (!capturing) return
    const def = findDefinition(capturing)
    const onKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapturing(null)
        return
      }
      const binding = bindingFromEvent(e, platform)
      if (!binding || !def) return
      rebind(def, binding)
      setCapturing(null)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [capturing, platform, rebind])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return KEYBINDINGS.filter((def) => {
      if (filter === 'modified' && !overrides[def.id]) return false
      if (filter === 'conflicts' && !conflictByAction.has(def.id)) return false
      if (!q) return true
      const bindings = effectiveBindings(def.id, platform, overrides).join(' ').toLowerCase()
      const label = formatBinding(effectiveBindings(def.id, platform, overrides)[0] ?? '', platform).toLowerCase()
      return (
        def.title.toLowerCase().includes(q) ||
        def.group.toLowerCase().includes(q) ||
        bindings.includes(q) ||
        label.includes(q) ||
        (def.keywords ?? []).some((k) => k.toLowerCase().includes(q))
      )
    })
  }, [query, filter, overrides, conflictByAction, platform])

  const groups = useMemo(() => {
    const map = new Map<string, KeybindingDefinition[]>()
    for (const def of filtered) {
      const list = map.get(def.group) ?? []
      list.push(def)
      map.set(def.group, list)
    }
    return [...map.entries()]
  }, [filtered])

  const modifiedCount = Object.keys(overrides).length

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="액션 또는 키로 검색"
            style={{ paddingLeft: 28 }}
            aria-label="단축키 검색"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={resetAll} disabled={modifiedCount === 0}>
          <RotateCcw size={13} /> 기본값 전체 복원
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        {(
          [
            ['all', `전체 ${KEYBINDINGS.length}`],
            ['modified', `변경됨 ${modifiedCount}`],
            ['conflicts', `충돌 ${conflicts.length}`]
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`ds-chip ${filter === key ? 'selected' : 'neutral'} cursor-pointer`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">
          {platform === 'darwin' ? 'macOS' : 'Windows / Linux'} 기준
        </span>
      </div>

      {groups.length === 0 && (
        <p className="text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-tertiary">일치하는 단축키가 없습니다.</p>
      )}

      {groups.map(([group, defs]) => (
        <section key={group}>
          <h3 className="text-[calc(10px_*_var(--app-font-scale,1))] font-semibold text-text-tertiary uppercase tracking-wide mb-1.5">
            {group}
          </h3>
          <div className="ds-card flat divide-y divide-bg-border">
            {defs.map((def) => {
              const bindings = effectiveBindings(def.id, platform, overrides)
              const isModified = Boolean(overrides[def.id])
              const conflictWith = conflictByAction.get(def.id)
              const isCapturing = capturing === def.id
              return (
                <div key={def.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[calc(12px_*_var(--app-font-scale,1))] text-text-primary">{def.title}</span>
                      {isModified && <Chip tone="selected">변경됨</Chip>}
                      {bindings.length === 0 && <Chip tone="neutral">미할당</Chip>}
                      {def.fixed && (
                        <span title="변경할 수 없는 항목" className="text-text-tertiary">
                          <Lock size={11} />
                        </span>
                      )}
                    </div>
                    {def.note && (
                      <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5">{def.note}</p>
                    )}
                    {conflictWith && conflictWith.length > 0 && (
                      <p className="flex items-center gap-1 text-[calc(10px_*_var(--app-font-scale,1))] text-clauday-orange mt-0.5">
                        <AlertTriangle size={10} />
                        {conflictWith.map((id) => findDefinition(id)?.title ?? id).join(', ')} 와(과) 같은 조합입니다
                      </p>
                    )}
                  </div>

                  {isCapturing ? (
                    <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-primary animate-pulse whitespace-nowrap">
                      새 조합을 누르세요… (Esc 취소)
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={def.fixed}
                      onClick={() => setCapturing(def.id)}
                      aria-label={`${def.title} 단축키 변경`}
                      className={`flex items-center gap-0.5 ${def.fixed ? 'cursor-not-allowed opacity-60' : 'hover:opacity-80'}`}
                    >
                      {bindings.length === 0 ? (
                        <span className="text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary">—</span>
                      ) : (
                        formatBindingChips(bindings[0], platform).map((chip, i) => <Kbd key={i}>{chip}</Kbd>)
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={!isModified}
                    onClick={() => reset(def.id)}
                    aria-label={`${def.title} 기본값 복원`}
                    className={`text-text-tertiary ${isModified ? 'hover:text-text-primary' : 'opacity-0 pointer-events-none'}`}
                  >
                    <RotateCcw size={12} />
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      ))}

      <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">
        변경 사항은 즉시 저장됩니다. 자물쇠 표시는 셸 제어문자나 시스템 메뉴가 소유해 변경할 수 없는 항목입니다.
      </p>
    </div>
  )
}

/** 기본값과 실제 바인딩이 다른지 — 테스트/외부 사용용. */
export function isRebound(id: string, platform: 'darwin' | 'other', overrides: KeybindingOverrides): boolean {
  const def = findDefinition(id)
  if (!def) return false
  const current = effectiveBindings(id, platform, overrides).join(',')
  return current !== defaultBindingsOf(def, platform).join(',')
}

export default KeybindingSettings
