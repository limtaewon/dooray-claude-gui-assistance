import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  Check,
  FolderGit2,
  GitBranch,
  Plus,
  RefreshCw,
  Terminal as TerminalIcon,
  Trash2,
  X
} from 'lucide-react'
import type { GitBranch as GitBranchInfo, GitWorktree } from '@shared/types/git'
import type { GitStashEntry } from '@shared/git/scmTypes'
import { Button, Input, useToast } from '../../common/ds'

interface BranchesPanelProps {
  repoPath: string
  /** 워크트리를 새 터미널 탭에서 연다 */
  onOpenInTerminal: (cwd: string) => void
  onRepoChanged?: () => void
}

type Creating = 'none' | 'branch' | 'worktree' | 'stash'

/**
 * 브랜치 · 워크트리 · 스태시 관리. 구 '브랜치 작업' 뷰를 터미널 드로어로 옮긴 것으로,
 * 그쪽이 따로 들고 있던 터미널 탭 시스템은 버리고 본체 터미널 탭을 재사용한다.
 */
function BranchesPanel({ repoPath, onOpenInTerminal, onRepoChanged }: BranchesPanelProps): JSX.Element {
  const [branches, setBranches] = useState<GitBranchInfo[]>([])
  const [worktrees, setWorktrees] = useState<GitWorktree[]>([])
  const [stashes, setStashes] = useState<GitStashEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState<Creating>('none')
  const [draft, setDraft] = useState('')
  const toast = useToast()

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [branchList, worktreeList, stashList] = await Promise.all([
        window.api.git.branches(repoPath),
        window.api.git.worktrees(repoPath),
        window.api.git.scm.stashList(repoPath).catch(() => [] as GitStashEntry[])
      ])
      setBranches(branchList.filter((b) => !b.isRemote))
      setWorktrees(worktreeList)
      setStashes(stashList)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [repoPath])

  useEffect(() => {
    setLoading(true)
    void refresh()
  }, [repoPath, refresh])

  useEffect(() => {
    const handler = (): void => void refresh()
    window.addEventListener('git-repo-maybe-changed', handler)
    return () => window.removeEventListener('git-repo-maybe-changed', handler)
  }, [refresh])

  const run = useCallback(
    async (label: string, action: () => Promise<void>): Promise<void> => {
      setBusy(true)
      try {
        await action()
        await refresh()
        onRepoChanged?.()
      } catch (e) {
        toast.error(`${label} 실패`, e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    },
    [refresh, onRepoChanged, toast]
  )

  const submitDraft = async (): Promise<void> => {
    const value = draft.trim()
    const mode = creating
    setCreating('none')
    setDraft('')
    if (mode === 'branch') {
      if (!value) return
      await run('브랜치 생성', () =>
        window.api.git.scm.createBranch({ repoPath, name: value, checkout: true })
      )
    } else if (mode === 'worktree') {
      if (!value) return
      await run('워크트리 생성', async () => {
        const worktree = await window.api.git.createWorktree({ repoPath, branch: value, newBranch: true })
        onOpenInTerminal(worktree.path)
      })
    } else if (mode === 'stash') {
      await run('스태시', () =>
        window.api.git.scm.stashPush(repoPath, { message: value, includeUntracked: true })
      )
    }
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
        <AlertTriangle size={18} className="text-text-tertiary" />
        <p className="text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-secondary">{error}</p>
        <Button variant="secondary" size="xs" onClick={() => void refresh()}>
          다시 시도
        </Button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-2 flex-none border-b border-bg-border">
        <span className="text-[calc(10px_*_var(--app-font-scale,1))] font-semibold uppercase tracking-wide text-text-tertiary">
          브랜치 · 워크트리
        </span>
        <Button variant="ghost" size="xs" className="ml-auto" onClick={() => void refresh()} aria-label="새로고침">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      {creating !== 'none' && (
        <div className="flex items-center gap-1 px-3 py-2 flex-none border-b border-bg-border">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitDraft()
              if (e.key === 'Escape') { setCreating('none'); setDraft('') }
            }}
            placeholder={
              creating === 'branch'
                ? '새 브랜치 이름'
                : creating === 'worktree'
                  ? '워크트리로 만들 새 브랜치 이름'
                  : '스태시 메시지 (선택)'
            }
            className="flex-1"
          />
          <Button variant="ghost" size="xs" onClick={() => void submitDraft()} aria-label="확인">
            <Check size={12} />
          </Button>
          <Button variant="ghost" size="xs" onClick={() => { setCreating('none'); setDraft('') }} aria-label="취소">
            <X size={12} />
          </Button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        <SectionHeader
          title="브랜치"
          count={branches.length}
          actionLabel="새 브랜치"
          onAction={() => { setCreating('branch'); setDraft('') }}
        />
        {branches.map((branch) => (
          <div key={branch.name} className="group flex items-center gap-1.5 h-6 pl-5 pr-2 hover:bg-bg-surface-hover">
            <GitBranch size={10} className={branch.isCurrent ? 'text-brand-claude flex-none' : 'text-text-tertiary flex-none'} />
            <button
              onClick={() =>
                branch.isCurrent
                  ? undefined
                  : void run('브랜치 전환', () => window.api.git.scm.checkout(repoPath, branch.name))
              }
              disabled={busy || branch.isCurrent}
              className="flex-1 min-w-0 text-left"
              title={branch.isCurrent ? '현재 브랜치' : `${branch.name} 로 전환`}
            >
              <span
                className={`text-[calc(11.5px_*_var(--app-font-scale,1))] truncate ${
                  branch.isCurrent ? 'text-text-primary font-medium' : 'text-text-secondary'
                }`}
              >
                {branch.name}
              </span>
            </button>
            {!branch.isCurrent && (
              <button
                onClick={() => void run('브랜치 삭제', () => window.api.git.deleteBranch(repoPath, branch.name))}
                disabled={busy}
                className="ds-btn ghost icon hidden group-hover:flex flex-none"
                title="브랜치 삭제 (병합되지 않았으면 실패)"
                aria-label={`${branch.name} 삭제`}
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        ))}

        <SectionHeader
          title="워크트리"
          count={worktrees.length}
          actionLabel="새 워크트리"
          onAction={() => { setCreating('worktree'); setDraft('') }}
        />
        {worktrees.map((worktree) => (
          <div key={worktree.path} className="group flex items-center gap-1.5 h-6 pl-5 pr-2 hover:bg-bg-surface-hover">
            <FolderGit2 size={10} className="text-text-tertiary flex-none" />
            <button
              onClick={() => onOpenInTerminal(worktree.path)}
              className="flex-1 min-w-0 text-left"
              title={`${worktree.path} 에서 새 터미널 열기`}
            >
              <span className="text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-secondary truncate">
                {worktree.branch || worktree.head.slice(0, 7)}
              </span>
            </button>
            <div className="hidden group-hover:flex items-center gap-0.5 flex-none">
              <button
                onClick={() => onOpenInTerminal(worktree.path)}
                className="ds-btn ghost icon"
                title="새 터미널에서 열기"
                aria-label="새 터미널에서 열기"
              >
                <TerminalIcon size={11} />
              </button>
              {!worktree.isMain && (
                <button
                  onClick={() =>
                    void run('워크트리 제거', () =>
                      window.api.git.removeWorktree({ repoPath, worktreePath: worktree.path })
                    )
                  }
                  disabled={busy}
                  className="ds-btn ghost icon"
                  title="워크트리 제거"
                  aria-label="워크트리 제거"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          </div>
        ))}

        <SectionHeader
          title="스태시"
          count={stashes.length}
          actionLabel="현재 변경 스태시"
          onAction={() => { setCreating('stash'); setDraft('') }}
        />
        {stashes.length === 0 && (
          <p className="pl-5 pr-2 py-1 text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary">
            보관된 변경이 없습니다
          </p>
        )}
        {stashes.map((stash) => (
          <div key={stash.ref} className="group flex items-center gap-1.5 h-6 pl-5 pr-2 hover:bg-bg-surface-hover">
            <Archive size={10} className="text-text-tertiary flex-none" />
            <span className="flex-1 min-w-0 text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary truncate" title={stash.message}>
              {stash.message}
            </span>
            <div className="hidden group-hover:flex items-center gap-0.5 flex-none">
              <button
                onClick={() => void run('스태시 적용', () => window.api.git.scm.stashAction(repoPath, 'pop', stash.ref))}
                disabled={busy}
                className="ds-btn ghost icon"
                title="적용하고 목록에서 제거 (pop)"
                aria-label="스태시 적용"
              >
                <Check size={11} />
              </button>
              <button
                onClick={() => void run('스태시 삭제', () => window.api.git.scm.stashAction(repoPath, 'drop', stash.ref))}
                disabled={busy}
                className="ds-btn ghost icon"
                title="스태시 삭제"
                aria-label="스태시 삭제"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SectionHeader({
  title,
  count,
  actionLabel,
  onAction
}: {
  title: string
  count: number
  actionLabel: string
  onAction: () => void
}): JSX.Element {
  return (
    <div className="group flex items-center gap-1 px-2 h-6 mt-1 hover:bg-bg-surface-hover">
      <span className="text-[calc(10px_*_var(--app-font-scale,1))] font-semibold uppercase tracking-wide text-text-tertiary">
        {title}
      </span>
      <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">{count}</span>
      <button
        onClick={onAction}
        className="ds-btn ghost icon ml-auto opacity-0 group-hover:opacity-100 focus:opacity-100 flex-none"
        title={actionLabel}
        aria-label={actionLabel}
      >
        <Plus size={11} />
      </button>
    </div>
  )
}

export default BranchesPanel
