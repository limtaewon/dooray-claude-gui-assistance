import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Undo2
} from 'lucide-react'
import type { GitStatusEntry, GitStatusResult } from '@shared/git/statusTypes'
import type { GitRemoteOpResult } from '@shared/git/scmTypes'
import { Button, useToast } from '../../common/ds'
import {
  CONFLICT_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  canDiscard,
  entryKey,
  splitIntoSections,
  splitPath
} from './statusDisplay'
import type { DiffRequest } from './DiffView'

const CONFLICT_OPERATION_LABELS: Record<string, string> = {
  merge: '머지',
  rebase: '리베이스',
  'cherry-pick': '체리픽',
  revert: '되돌리기'
}

interface SourceControlPanelProps {
  repoPath: string
  onOpenDiff: (request: DiffRequest) => void
  /** 커밋/스테이징 후 히스토리 탭도 다시 읽게 알린다 */
  onRepoChanged?: () => void
}

/**
 * 작업 트리 변경 목록 + 스테이징 + 커밋 + 원격 동기화.
 *
 * 갱신 정책(Orca 참고): 폴링하지 않고 ① 최초 진입 ② 사용자 동작 직후 ③ 수동 새로고침
 * ④ 터미널 명령 종료 이벤트에만 다시 읽는다. 터미널에서 `git commit` 을 해도 즉시 반영된다.
 */
function SourceControlPanel({ repoPath, onOpenDiff, onRepoChanged }: SourceControlPanelProps): JSX.Element {
  const [status, setStatus] = useState<GitStatusResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [amend, setAmend] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toast = useToast()
  const repoRef = useRef(repoPath)
  repoRef.current = repoPath

  const refresh = useCallback(async (): Promise<void> => {
    const target = repoRef.current
    try {
      const result = await window.api.git.scm.status(target)
      // 응답이 늦게 온 이전 저장소의 결과로 화면을 덮지 않는다.
      if (repoRef.current !== target) return
      setStatus(result)
      setError(null)
    } catch (e) {
      if (repoRef.current !== target) return
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (repoRef.current === target) setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    setStatus(null)
    void refresh()
  }, [repoPath, refresh])

  // 터미널에서 git 명령을 실행해도 반영되도록 — TerminalView 가 명령 종료 시 이 이벤트를 쏜다.
  useEffect(() => {
    const handler = (): void => void refresh()
    window.addEventListener('git-repo-maybe-changed', handler)
    return () => window.removeEventListener('git-repo-maybe-changed', handler)
  }, [refresh])

  const sections = useMemo(() => splitIntoSections(status?.entries ?? []), [status])

  /**
   * 커밋에 넣을 파일 — **스테이징과 분리된 화면 상태**다.
   * 체크를 스테이징에 직결하면 파일이 섹션을 옮겨 다녀 목록이 출렁인다(IntelliJ 도 이렇게 하지 않는다).
   * 실제 `git add` 는 커밋 직전에 한 번 한다.
   *
   * 상태로 들고 있는 것은 **사용자가 직접 바꾼 것뿐**이고 나머지는 매번 계산한다 —
   * "이전에 본 경로" 같은 기억을 두면 목록이 갱신될 때마다 그 기억과 어긋나 선택이 사라진다.
   */
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map())

  const selected = useMemo(() => {
    const picked = new Set<string>()
    // 추적 중인 변경은 기본 포함. 버전이 없는 파일은 직접 고른 것만
    // (빌드 산출물이 딸려 들어가면 되돌리기 번거롭다).
    for (const entry of sections.changes) if (overrides.get(entry.path) ?? true) picked.add(entry.path)
    for (const entry of sections.untracked) if (overrides.get(entry.path) ?? false) picked.add(entry.path)
    return picked
  }, [sections, overrides])

  const toggleSelected = useCallback((paths: string[], next: boolean): void => {
    setOverrides((prev) => {
      const updated = new Map(prev)
      for (const path of paths) updated.set(path, next)
      return updated
    })
  }, [])

  const run = useCallback(
    async (label: string, action: () => Promise<void>): Promise<void> => {
      setBusy(label)
      try {
        await action()
        await refresh()
        onRepoChanged?.()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(null)
      }
    },
    [refresh, onRepoChanged, toast]
  )

  const remote = useCallback(
    async (label: string, action: () => Promise<GitRemoteOpResult>): Promise<void> => {
      setBusy(label)
      try {
        const result = await action()
        if (result.ok) toast.success(`${label} 완료`)
        else toast.error(result.message || `${label} 실패`)
        await refresh()
        onRepoChanged?.()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(null)
      }
    },
    [refresh, onRepoChanged, toast]
  )

  const commit = async (): Promise<void> => {
    const paths = [...selected]
    const result = await window.api.git.scm.commit({ repoPath, message, amend, paths })
    if (!result.ok) {
      toast.error(result.message)
      throw new Error(result.message)
    }
    setMessage('')
    setAmend(false)
    toast.success(`${paths.length}개 파일을 커밋했습니다`)
  }

  /** 커밋하고 바로 올린다 — 커밋만 하고 잊는 일이 잦아 한 버튼으로 묶는다(IntelliJ 와 같은 흐름). */
  const commitAndPush = async (): Promise<void> => {
    await commit()
    const result = await window.api.git.scm.push({
      repoPath,
      setUpstream: !status?.upstreamStatus?.hasUpstream
    })
    if (result.ok) toast.success('푸시 완료')
    else toast.error(result.message || '푸시 실패')
  }

  const toggleAmend = async (): Promise<void> => {
    const next = !amend
    setAmend(next)
    // amend 로 켜면 직전 메시지를 채워 넣는다 — 비어 있는 채로 커밋하면 메시지가 날아간다.
    if (next && !message.trim()) {
      setMessage(await window.api.git.scm.lastCommitMessage(repoPath).catch(() => ''))
    }
  }

  const openDiff = (entry: GitStatusEntry): void => {
    onOpenDiff({
      repoPath,
      path: entry.path,
      oldPath: entry.oldPath,
      source: { kind: entry.area === 'staged' ? 'staged' : 'unstaged' },
      caption: entry.area === 'staged' ? '스테이징됨' : undefined
    })
  }

  const upstream = status?.upstreamStatus
  const selectedCount = selected.size
  const hasConflicts = sections.conflicts.length > 0
  const commitDisabled =
    busy !== null || hasConflicts || (!amend && selected.size === 0) || !message.trim()
  const conflictOperation = status?.conflictOperation ?? 'none'

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
      {/* 브랜치 · 동기화 */}
      <div className="flex items-center gap-1 px-3 py-2 flex-none border-b border-bg-border">
        <span className="text-[calc(11.5px_*_var(--app-font-scale,1))] font-medium text-text-primary truncate">
          {status?.branch?.replace('refs/heads/', '') ?? (status?.head ? 'detached HEAD' : '—')}
        </span>
        {upstream?.hasUpstream && (upstream.ahead > 0 || upstream.behind > 0) && (
          <span className="flex items-center gap-1.5 text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary flex-none">
            {upstream.behind > 0 && <span>↓{upstream.behind}</span>}
            {upstream.ahead > 0 && <span>↑{upstream.ahead}</span>}
          </span>
        )}
        <div className="ml-auto flex items-center gap-0.5 flex-none">
          <Button
            variant="ghost"
            size="xs"
            disabled={busy !== null}
            onClick={() => void remote('풀', () => window.api.git.scm.pull({ repoPath }))}
            aria-label="풀"
            title="풀 (pull)"
          >
            <ArrowDownToLine size={12} />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            disabled={busy !== null}
            onClick={() =>
              void remote('푸시', () =>
                window.api.git.scm.push({ repoPath, setUpstream: !upstream?.hasUpstream })
              )
            }
            aria-label="푸시"
            title={upstream?.hasUpstream ? '푸시 (push)' : '브랜치 발행 (push -u)'}
          >
            <ArrowUpFromLine size={12} />
          </Button>
          <Button variant="ghost" size="xs" onClick={() => void refresh()} aria-label="새로고침">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {conflictOperation !== 'none' && (
        <div className="flex items-center gap-2 px-3 py-2 flex-none bg-bg-surface-raised border-b border-bg-border">
          <AlertTriangle size={12} className="text-git-deleted flex-none" />
          <span className="text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-secondary flex-1">
            {CONFLICT_OPERATION_LABELS[conflictOperation] ?? conflictOperation} 진행 중
          </span>
          {(conflictOperation === 'merge' || conflictOperation === 'rebase') && (
            <Button
              variant="ghost"
              size="xs"
              disabled={busy !== null}
              onClick={() =>
                void run('중단', () => window.api.git.scm.abort(repoPath, conflictOperation))
              }
            >
              중단
            </Button>
          )}
        </div>
      )}

      {/* 파일 목록 */}
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {status?.didHitLimit && (
          <p className="px-3 py-2 text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary">
            변경이 너무 많습니다({status.statusLength?.toLocaleString()}건). 앞쪽 일부만 표시합니다.
          </p>
        )}
        {!loading && (status?.entries.length ?? 0) === 0 && (
          <p className="px-3 py-6 text-center text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary">
            변경된 파일이 없습니다
          </p>
        )}

        <Section
          id="conflicts"
          title="충돌"
          entries={sections.conflicts}
          collapsed={collapsed}
          onToggle={setCollapsed}
          onOpenDiff={openDiff}
          busy={busy !== null}
        />
        <Section
          id="changes"
          title="변경"
          entries={sections.changes}
          collapsed={collapsed}
          onToggle={setCollapsed}
          onOpenDiff={openDiff}
          selected={selected}
          onSelect={toggleSelected}
          busy={busy !== null}
          onDiscard={(paths) => void run('되돌리기', () => window.api.git.scm.discard(repoPath, paths))}
        />
        <Section
          id="untracked"
          title="버전이 없는 파일"
          entries={sections.untracked}
          collapsed={collapsed}
          onToggle={setCollapsed}
          onOpenDiff={openDiff}
          selected={selected}
          onSelect={toggleSelected}
          busy={busy !== null}
          onDiscard={(paths) => void run('되돌리기', () => window.api.git.scm.discard(repoPath, paths))}
        />
      </div>

      {/* 커밋 — 목록 아래에 둔다(IntelliJ 와 같은 배치). 고른 파일이 바로 위에 보인다. */}
      <div className="px-3 py-2.5 flex flex-col gap-2 flex-none border-t border-bg-border">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={selectedCount > 0 ? `${selectedCount}개 파일 커밋 메시지` : '커밋 메시지'}
          rows={2}
          className="ds-input resize-none text-[calc(11.5px_*_var(--app-font-scale,1))]"
        />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary cursor-pointer select-none">
            <input type="checkbox" checked={amend} onChange={() => void toggleAmend()} />
            직전 커밋 수정
          </label>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="primary"
              size="xs"
              disabled={commitDisabled}
              onClick={() => void run('커밋', commit)}
              leftIcon={<Check size={11} />}
            >
              커밋
            </Button>
            <Button
              variant="secondary"
              size="xs"
              disabled={commitDisabled}
              onClick={() => void run('커밋 및 푸시', commitAndPush)}
              leftIcon={<ArrowUpFromLine size={11} />}
            >
              커밋 및 푸시
            </Button>
          </div>
        </div>
        {hasConflicts && (
          <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-git-deleted">
            충돌을 먼저 해결해야 커밋할 수 있습니다.
          </p>
        )}
      </div>
    </div>
  )
}

interface SectionProps {
  id: string
  title: string
  entries: GitStatusEntry[]
  collapsed: Record<string, boolean>
  onToggle: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void
  onOpenDiff: (entry: GitStatusEntry) => void
  busy: boolean
  /** 커밋에 넣을 파일들 (경로 집합) */
  selected?: Set<string>
  onSelect?: (paths: string[], next: boolean) => void
  onDiscard?: (paths: string[]) => void
}

function Section({
  id,
  title,
  entries,
  collapsed,
  onToggle,
  onOpenDiff,
  busy,
  selected,
  onSelect,
  onDiscard
}: SectionProps): JSX.Element | null {
  if (entries.length === 0) return null
  const isCollapsed = collapsed[id] === true
  const selectable = entries.filter((entry) => !entry.conflictKind)
  const pickedCount = selected ? selectable.filter((entry) => selected.has(entry.path)).length : 0
  const allPicked = selectable.length > 0 && pickedCount === selectable.length

  return (
    <div className="mb-0.5">
      <div className="group flex items-center gap-1 px-2 h-6 hover:bg-bg-surface-hover">
        {onSelect && selectable.length > 0 && (
          <input
            type="checkbox"
            checked={allPicked}
            ref={(el) => {
              // 일부만 골랐을 때는 중간 상태로 — 전부/일부/없음이 눈에 바로 들어와야 한다.
              if (el) el.indeterminate = pickedCount > 0 && !allPicked
            }}
            onChange={() => onSelect(selectable.map((entry) => entry.path), !allPicked)}
            aria-label={`${title} 전체 ${allPicked ? '빼기' : '커밋에 포함'}`}
            className="flex-none"
          />
        )}
        <button
          onClick={() => onToggle((prev) => ({ ...prev, [id]: !prev[id] }))}
          className="flex items-center gap-1 flex-1 min-w-0 text-left"
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? <ChevronRight size={11} className="text-text-tertiary" /> : <ChevronDown size={11} className="text-text-tertiary" />}
          <span className="text-[calc(11px_*_var(--app-font-scale,1))] font-semibold uppercase tracking-wide text-text-tertiary truncate">
            {title}
          </span>
          <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary">{entries.length}</span>
        </button>
      </div>

      {!isCollapsed &&
        entries.map((entry) => (
          <EntryRow
            key={entryKey(entry)}
            entry={entry}
            busy={busy}
            onOpenDiff={() => onOpenDiff(entry)}
            picked={selected?.has(entry.path) ?? false}
            onSelect={onSelect && ((next) => onSelect([entry.path], next))}
            onDiscard={onDiscard && (() => onDiscard([entry.path]))}
          />
        ))}
    </div>
  )
}

interface EntryRowProps {
  entry: GitStatusEntry
  busy: boolean
  onOpenDiff: () => void
  /** 커밋에 넣기로 고른 파일인지 */
  picked: boolean
  onSelect?: (next: boolean) => void
  onDiscard?: () => void
}

function EntryRow({ entry, busy, onOpenDiff, picked, onSelect, onDiscard }: EntryRowProps): JSX.Element {
  const { dir, name } = splitPath(entry.path)

  return (
    <div className="group/row flex items-center gap-1 h-6 pl-2 pr-2 hover:bg-bg-surface-hover">
      {onSelect && !entry.conflictKind && (
        <input
          type="checkbox"
          checked={picked}
          onChange={() => onSelect(!picked)}
          title={picked ? '커밋에서 빼기' : '커밋에 포함'}
          aria-label={`${entry.path} ${picked ? '커밋에서 빼기' : '커밋에 포함'}`}
          className="flex-none"
        />
      )}
      <button onClick={onOpenDiff} className="flex-1 min-w-0 flex items-baseline gap-1 text-left" title={entry.path}>
        <span className="text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-primary truncate">{name}</span>
        {dir && (
          <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary truncate">{dir}</span>
        )}
      </button>

      {/* hover 시 액션 — 평소에는 라인 수와 상태 글자만 보인다 */}
      <div className="hidden group-hover/row:flex items-center gap-0.5 flex-none">
        {onDiscard && canDiscard(entry) && (
          <button onClick={onDiscard} disabled={busy} className="ds-btn ghost icon" title="변경 되돌리기" aria-label="변경 되돌리기">
            <Undo2 size={11} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-none group-hover/row:hidden">
        {(entry.added !== undefined || entry.removed !== undefined) && (
          <span className="text-[calc(9.5px_*_var(--app-font-scale,1))] tabular-nums">
            {entry.added ? <span className="text-git-added">+{entry.added}</span> : null}
            {entry.removed ? <span className="text-git-deleted ml-0.5">-{entry.removed}</span> : null}
          </span>
        )}
        <span
          className={`text-[calc(11px_*_var(--app-font-scale,1))] font-semibold w-3 text-center ${STATUS_COLORS[entry.status]}`}
          title={entry.conflictKind ? CONFLICT_LABELS[entry.conflictKind] : undefined}
        >
          {entry.conflictKind ? '!' : STATUS_LABELS[entry.status]}
        </span>
      </div>
    </div>
  )
}

export default SourceControlPanel
