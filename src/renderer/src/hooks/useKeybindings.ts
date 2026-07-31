import { useCallback, useEffect, useRef, useState } from 'react'
import {
  KEYBINDINGS_SETTINGS_KEY,
  type KeybindingOverrides,
  effectiveBindings
} from '@shared/keybindings/registry'
import { matchesBinding, type KeybindingPlatform } from '@shared/keybindings/binding'

/** 오버라이드 변경을 앱 전체에 알리는 이벤트 — 설정 화면에서 바꾸면 훅들이 즉시 반영한다. */
const CHANGED_EVENT = 'keybindings-changed'

let cache: KeybindingOverrides | null = null
let inflight: Promise<KeybindingOverrides> | null = null

export function currentPlatform(): KeybindingPlatform {
  return window.api?.system?.platform === 'darwin' ? 'darwin' : 'other'
}

/** 저장된 오버라이드를 읽는다(프로세스당 1회 캐시). */
export async function loadOverrides(): Promise<KeybindingOverrides> {
  if (cache) return cache
  if (!inflight) {
    inflight = (async () => {
      const raw = (await window.api.settings.get(KEYBINDINGS_SETTINGS_KEY)) as KeybindingOverrides | null
      cache = raw && typeof raw === 'object' ? raw : {}
      return cache
    })()
  }
  return inflight
}

export async function saveOverrides(next: KeybindingOverrides): Promise<void> {
  cache = next
  inflight = Promise.resolve(next)
  await window.api.settings.set(KEYBINDINGS_SETTINGS_KEY, next)
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT))
}

/** 현재 오버라이드 + 변경 구독. 설정 화면과 훅이 같은 값을 본다. */
export function useKeybindingOverrides(): KeybindingOverrides {
  const [overrides, setOverrides] = useState<KeybindingOverrides>(cache ?? {})

  useEffect(() => {
    let alive = true
    const sync = (): void => {
      void loadOverrides().then((o) => alive && setOverrides(o))
    }
    sync()
    const onChanged = (): void => {
      if (alive && cache) setOverrides({ ...cache })
    }
    window.addEventListener(CHANGED_EVENT, onChanged)
    return () => {
      alive = false
      window.removeEventListener(CHANGED_EVENT, onChanged)
    }
  }, [])

  return overrides
}

/** 편집 가능한 요소에 포커스가 있는지 — xterm 의 helper textarea 는 제외한다(터미널은 자체 처리). */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.classList.contains('xterm-helper-textarea')) return false
  if (target.isContentEditable) return true
  return target.closest('input, textarea, select, [contenteditable="true"]') !== null
}

export interface UseShortcutOptions {
  /** false 면 리스너를 붙이지 않는다 — 비활성 뷰의 오발화 방지 */
  enabled?: boolean
  /** 입력 필드 포커스 중에도 발화시킬지 (기본 false) */
  allowInEditable?: boolean
}

/**
 * 레지스트리 액션 하나에 핸들러를 붙인다. 조합은 사용자 오버라이드를 반영하며,
 * `enabled` 가 false 면 아예 등록하지 않는다(모든 뷰가 상시 마운트되는 구조 대응).
 */
export function useShortcut(actionId: string, handler: (e: KeyboardEvent) => void, options: UseShortcutOptions = {}): void {
  const { enabled = true, allowInEditable = false } = options
  const overrides = useKeybindingOverrides()
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    if (!enabled) return
    const platform = currentPlatform()
    const bindings = effectiveBindings(actionId, platform, overrides)
    if (bindings.length === 0) return

    const onKeyDown = (e: KeyboardEvent): void => {
      // 앞선 계층(xterm 의 attachCustomKeyEventHandler 등)이 이미 소비한 키는 다시 잡지 않는다.
      // 터미널 포커스에서 ⌘K 가 "화면 지우기"와 "커맨드 팔레트"로 동시에 발화하던 문제의 해소.
      if (e.defaultPrevented) return
      if (!allowInEditable && isEditableTarget(e.target)) return
      if (!bindings.some((b) => matchesBinding(e, b, platform))) return
      handlerRef.current(e)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [actionId, enabled, allowInEditable, overrides])
}

/** 테스트 전용 — 모듈 캐시 초기화. */
export function resetKeybindingCache(): void {
  cache = null
  inflight = null
}
