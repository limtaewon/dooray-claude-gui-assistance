import { useCallback, useEffect, useState } from 'react'
import { GitCompare, RefreshCw } from 'lucide-react'
import type { GitBranchDiff } from '@shared/git/scmTypes'
import { STATUS_COLORS, STATUS_LABELS, splitPath } from './statusDisplay'
import type { DiffRequest } from './DiffView'

interface BranchDiffPanelProps {
  repoPath: string
  onOpenDiff: (request: DiffRequest) => void
}

/**
 * 이 브랜치가 기준(base)에서 갈라진 뒤 바꾼 파일들.
 *
 * '변경사항' 탭이 아직 커밋 안 한 것만 보여주는 것과 달리 **커밋한 것까지 합쳐** 보여준다 —
 * 워크트리에서 업무 하나를 끝내고 "이 브랜치가 결국 뭘 바꾸나" 를 확인하는 자리다.
 */
function BranchDiffPanel({ repoPath, onOpenDiff }: BranchDiffPanelProps): JSX.Element {
  const [diff, setDiff] = useState<GitBranchDiff | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setDiff(await window.api.git.scm.branchDiff(repoPath))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setDiff(null)
    } finally {
      setLoading(false)
    }
  }, [repoPath])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1.5 px-2 h-7 flex-none border-b border-bg-border">
        <GitCompare size={11} className="text-text-tertiary flex-none" />
        <span className="flex-1 min-w-0 truncate text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary">
          {diff ? (
            <>
              <span className="text-text-primary">{diff.headRef}</span>
              <span className="text-text-tertiary"> ← {diff.baseRef}</span>
            </>
          ) : (
            '브랜치 변경'
          )}
        </span>
        {diff && diff.ahead > 0 && (
          <span className="ds-chip neutral flex-none" title="기준 이후 이 브랜치의 커밋 수">
            커밋 {diff.ahead}
          </span>
        )}
        <button
          onClick={() => void load()}
          disabled={loading}
          className="ds-btn ghost icon flex-none"
          title="다시 읽기"
          aria-label="다시 읽기"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <p className="px-2 py-2 text-[calc(11px_*_var(--app-font-scale,1))] text-c-red-fg">{error}</p>
      )}

      {!error && diff?.files.length === 0 && (
        <p className="px-2 py-4 text-center text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary">
          {diff.baseRef} 와 달라진 파일이 없습니다
        </p>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {diff?.files.map((file) => {
          const { dir, name } = splitPath(file.path)
          return (
            <button
              key={file.path}
              onClick={() =>
                onOpenDiff({
                  repoPath,
                  path: file.path,
                  oldPath: file.oldPath,
                  source: { kind: 'range', baseOid: diff.baseOid },
                  caption: `${diff.baseRef} 대비`
                })
              }
              title={file.path}
              className="w-full flex items-center gap-1.5 h-6 px-2 hover:bg-bg-surface-hover text-left"
            >
              <span className="flex-1 min-w-0 flex items-baseline gap-1">
                <span className="text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-primary truncate">
                  {name}
                </span>
                {dir && (
                  <span className="text-[calc(9.5px_*_var(--app-font-scale,1))] text-text-tertiary truncate">
                    {dir}
                  </span>
                )}
              </span>
              {(file.added !== undefined || file.removed !== undefined) && (
                <span className="flex-none text-[calc(9.5px_*_var(--app-font-scale,1))]">
                  <span className="text-git-added">+{file.added ?? 0}</span>{' '}
                  <span className="text-git-deleted">-{file.removed ?? 0}</span>
                </span>
              )}
              <span
                className={`flex-none w-3 text-center text-[calc(11px_*_var(--app-font-scale,1))] ${STATUS_COLORS[file.status]}`}
              >
                {STATUS_LABELS[file.status]}
              </span>
            </button>
          )
        })}
      </div>

      {diff && diff.files.length > 0 && (
        <p className="flex-none px-2 py-1 border-t border-bg-border text-[calc(9.5px_*_var(--app-font-scale,1))] text-text-tertiary">
          커밋한 변경 + 아직 커밋 안 한 변경. 새로 만든(추적 안 되는) 파일은 &lsquo;변경사항&rsquo; 탭에서 봅니다.
        </p>
      )}
    </div>
  )
}

export default BranchDiffPanel
