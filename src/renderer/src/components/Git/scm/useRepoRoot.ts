import { useCallback, useEffect, useState } from 'react'

export interface TerminalRepoTarget {
  /** 포커스된 pane 의 PTY 세션 — 이게 있어야 `cd` 이후의 실제 cwd 를 알 수 있다 */
  sessionId?: string
  /** OSC7 로 받아둔 cwd (없으면 PTY 생성 시점 cwd) */
  cwd?: string
}

export interface TerminalRepo {
  repoRoot: string | null
  /** 판정에 실제로 쓴 cwd — 안내 문구에 보여준다 */
  cwd: string | null
  resolving: boolean
  refresh: () => void
}

/**
 * 지금 보고 있는 터미널의 저장소 루트.
 *
 * cwd 결정 순서: PTY pid 실측(`terminal.sessionCwd`) → OSC7/생성 시점 cwd.
 * pid 실측을 1순위로 두는 이유: 사용자가 셸에서 `cd` 한 것은 OSC7 을 쏘는 셸에서만 알 수 있는데,
 * 그 설정이 없는 환경이 흔하다. 실측이 실패하는 Windows 등에서는 OSC7/생성 cwd 로 떨어진다.
 */
export function useTerminalRepo(target: TerminalRepoTarget): TerminalRepo {
  const { sessionId, cwd: hintedCwd } = target
  const [repoRoot, setRepoRoot] = useState<string | null>(null)
  const [cwd, setCwd] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!sessionId && !hintedCwd) {
      setRepoRoot(null)
      setCwd(null)
      setResolving(false)
      return
    }

    let cancelled = false
    setResolving(true)
    ;(async () => {
      // optional call — 부분 mock 이나 구버전 preload 에서도 폴백으로 동작해야 한다.
      const probed = sessionId
        ? await (window.api.terminal.sessionCwd?.(sessionId) ?? Promise.resolve(null)).catch(() => null)
        : null
      const effective = probed ?? hintedCwd ?? null
      if (cancelled) return
      setCwd(effective)

      if (!effective) {
        setRepoRoot(null)
        setResolving(false)
        return
      }
      const root = await window.api.git.repoRoot(effective).catch(() => '')
      if (cancelled) return
      setRepoRoot(root.trim() || null)
      setResolving(false)
    })()

    return () => {
      cancelled = true
    }
  }, [sessionId, hintedCwd, nonce])

  return { repoRoot, cwd, resolving, refresh }
}
