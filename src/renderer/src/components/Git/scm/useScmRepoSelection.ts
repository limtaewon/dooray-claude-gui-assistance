import { useCallback, useEffect, useState } from 'react'

const PINNED_KEY = 'terminalScmPinnedRepo'
const RECENTS_KEY = 'terminalScmRecentRepos'
const MAX_RECENTS = 8

export interface ScmRepoSelection {
  /** 소스 제어 패널이 실제로 볼 저장소 */
  repo: string | null
  /** 고정된 저장소. null 이면 터미널을 따라간다 */
  pinned: string | null
  /** 최근에 본 저장소 (최신순) */
  recents: string[]
  /** null 을 넘기면 자동 추종으로 되돌린다 */
  pin: (repo: string | null) => void
}

/** 목록에 넣기 전 정규화 — 뒤 슬래시 차이로 같은 저장소가 두 번 쌓이지 않게. */
function normalize(path: string): string {
  return path.replace(/[/\\]+$/, '')
}

/**
 * 소스 제어가 볼 저장소를 정한다.
 *
 * 기본은 **터미널 자동 추종** — 탭마다 다른 워크트리를 여는 것이 이 앱의 주 흐름이라, 탭을 옮길
 * 때마다 저장소를 다시 고르게 하면 퇴보다. 다만 자동 추종이 닿지 않는 경우가 있어(Windows 의
 * `cd` 추적 불가, 터미널을 안 연 상태, A 에서 작업하며 B 를 보고 싶은 경우) 명시적 고정을 함께 둔다.
 */
export function useScmRepoSelection(autoRepo: string | null): ScmRepoSelection {
  const [pinned, setPinned] = useState<string | null>(null)
  const [recents, setRecents] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void Promise.all([
      window.api.settings.get(PINNED_KEY).catch(() => null),
      window.api.settings.get(RECENTS_KEY).catch(() => null)
    ]).then(([p, r]) => {
      if (typeof p === 'string' && p) setPinned(p)
      if (Array.isArray(r)) setRecents(r.filter((x): x is string => typeof x === 'string'))
      setLoaded(true)
    })
  }, [])

  const repo = pinned ?? autoRepo

  // 실제로 본 저장소만 최근 목록에 쌓는다 — 고정/자동 어느 쪽이든.
  useEffect(() => {
    if (!loaded || !repo) return
    const key = normalize(repo)
    setRecents((prev) => {
      if (prev[0] === key) return prev
      const next = [key, ...prev.filter((r) => r !== key)].slice(0, MAX_RECENTS)
      void window.api.settings.set(RECENTS_KEY, next)
      return next
    })
  }, [repo, loaded])

  const pin = useCallback((target: string | null) => {
    const value = target ? normalize(target) : null
    setPinned(value)
    void window.api.settings.set(PINNED_KEY, value)
  }, [])

  return { repo, pinned, recents, pin }
}
