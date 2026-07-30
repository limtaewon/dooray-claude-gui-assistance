import { useEffect, useState } from 'react'

/**
 * cwd 가 속한 git 저장소 루트. 저장소가 아니면 null.
 *
 * 소스 제어 패널은 "지금 보고 있는 터미널의 저장소"를 따라간다 — 별도 저장소 선택 UI 를 두면
 * 터미널에서 보는 것과 패널이 보는 것이 어긋난다.
 */
export function useRepoRoot(cwd: string | undefined): { repoRoot: string | null; resolving: boolean } {
  const [repoRoot, setRepoRoot] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)

  useEffect(() => {
    if (!cwd) {
      setRepoRoot(null)
      setResolving(false)
      return
    }
    let cancelled = false
    setResolving(true)
    window.api.git
      .repoRoot(cwd)
      .then((root) => { if (!cancelled) setRepoRoot(root.trim() || null) })
      .catch(() => { if (!cancelled) setRepoRoot(null) })
      .finally(() => { if (!cancelled) setResolving(false) })
    return () => { cancelled = true }
  }, [cwd])

  return { repoRoot, resolving }
}
