import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, FolderGit2, Loader2, Trash2 } from 'lucide-react'
import type { TaskSessionLink } from '@shared/types/workspace'
import {
  buildCleanupRows,
  formatBytes,
  formatLastUsed,
  summarizeSelection,
  type WorktreeCleanupRow
} from '@shared/git/worktreeCleanup'
import { Button, Modal, useToast } from '../../common/ds'

interface WorktreeCleanupModalProps {
  repoPath: string
  onClose: () => void
  /** 하나라도 지웠으면 호출 — 목록 갱신용 */
  onRemoved: () => void
}

/**
 * 워크트리 정리 — 업무마다 워크트리가 쌓이므로 무엇을 지워도 되는지 한 화면에서 보고 고른다.
 *
 * 자동으로 지우지 않는다. 오래 안 쓴 것부터 보여주고, 커밋되지 않은 변경이 있으면 표시해
 * 사용자가 판단하게 한다. 브랜치는 남으므로 지운 뒤 같은 업무를 다시 시작하면 이어서 할 수 있다.
 */
function WorktreeCleanupModal({ repoPath, onClose, onRemoved }: WorktreeCleanupModalProps): JSX.Element {
  const [rows, setRows] = useState<WorktreeCleanupRow[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const now = useMemo(() => Date.now(), [])

  const load = useCallback(async (): Promise<void> => {
    setRows(null)
    try {
      const [usages, linkMap] = await Promise.all([
        window.api.git.worktreeUsage(repoPath),
        window.api.workspace.taskDrop.linked().catch(() => ({}) as Record<string, TaskSessionLink[]>)
      ])
      setRows(buildCleanupRows(usages, Object.values(linkMap).flat()))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setRows([])
    }
  }, [repoPath])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = (path: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const summary = summarizeSelection(rows ?? [], selected)

  const removeSelected = async (): Promise<void> => {
    setBusy(true)
    let removed = 0
    const failed: string[] = []
    for (const path of selected) {
      const dirty = (rows ?? []).find((row) => row.path === path)?.dirtyFiles ?? 0
      try {
        // 변경이 남아 있으면 git 이 거부한다 — 사용자가 그걸 보고 고른 것이므로 force 로 진행한다.
        await window.api.git.removeWorktree({ repoPath, worktreePath: path, force: dirty > 0 })
        removed += 1
      } catch (e) {
        failed.push(`${path}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    setBusy(false)
    setSelected(new Set())

    if (removed > 0) {
      toast.success(`워크트리 ${removed}개 정리됨`, '브랜치는 남아 있어 다시 시작하면 이어집니다')
      onRemoved()
    }
    if (failed.length > 0) toast.error(`${failed.length}개를 지우지 못했습니다`, failed[0])
    if (failed.length === 0 && removed > 0) onClose()
    else void load()
  }

  return (
    <Modal open onClose={onClose} title="워크트리 정리">
      <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary mb-3">
        업무를 시작할 때마다 워크트리가 생깁니다. 오래 안 쓴 것부터 보여주며,
        <strong className="text-text-secondary"> 브랜치와 커밋은 지워지지 않습니다</strong> —
        같은 업무를 다시 시작하면 이어서 진행합니다.
      </p>

      {rows === null && (
        <p className="flex items-center gap-1.5 py-6 justify-center text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-tertiary">
          <Loader2 size={12} className="animate-spin" /> 용량을 재는 중…
        </p>
      )}

      {error && (
        <p className="text-[calc(11.5px_*_var(--app-font-scale,1))] text-c-red-fg mb-2">{error}</p>
      )}

      {rows?.length === 0 && !error && (
        <p className="py-6 text-center text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-tertiary">
          정리할 워크트리가 없습니다.
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="flex flex-col gap-1 max-h-[45vh] overflow-y-auto">
          {rows.map((row) => (
            <label
              key={row.path}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-bg-border hover:bg-bg-surface-hover cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.has(row.path)}
                onChange={() => toggle(row.path)}
                aria-label={`${row.branch || row.path} 선택`}
                className="flex-none"
              />
              <FolderGit2 size={12} className="flex-none text-text-tertiary" />
              <span className="flex-1 min-w-0">
                <span className="block text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-primary truncate">
                  {row.branch || row.path.split('/').pop()}
                </span>
                <span className="block font-mono text-[calc(9.5px_*_var(--app-font-scale,1))] text-text-tertiary truncate">
                  {row.path}
                </span>
              </span>
              {row.dirtyFiles > 0 && (
                <span className="ds-chip orange flex-none" title="커밋되지 않은 변경">
                  <AlertTriangle size={8} /> 변경 {row.dirtyFiles}
                </span>
              )}
              <span className="flex-none w-16 text-right text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary">
                {formatLastUsed(row.lastUsedAt, now)}
              </span>
              <span className="flex-none w-14 text-right text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-secondary">
                {formatBytes(row.sizeBytes)}
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-bg-border">
        <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary">
          {summary.count === 0
            ? '지울 항목을 고르세요'
            : `${summary.count}개 선택 · ${summary.unknownSize ? '약 ' : ''}${formatBytes(summary.sizeBytes)} 확보`}
          {summary.dirtyCount > 0 && (
            <span className="text-c-orange-fg">
              {' '}
              · 커밋 안 된 변경이 있는 {summary.dirtyCount}개 포함
            </span>
          )}
        </span>
        <div className="flex items-center gap-1.5 flex-none">
          <Button variant="ghost" size="sm" onClick={onClose}>
            닫기
          </Button>
          <Button
            variant="danger"
            size="sm"
            leftIcon={<Trash2 size={11} />}
            disabled={summary.count === 0 || busy}
            onClick={() => void removeSelected()}
          >
            {busy ? '지우는 중…' : '선택 삭제'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default WorktreeCleanupModal
