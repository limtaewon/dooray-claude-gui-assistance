import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, GitBranch, RefreshCw, Search, X } from 'lucide-react'
import type { GitCommitDetail } from '@shared/git/scmTypes'
import type {
  GitHistoryFilter,
  GitHistoryItem,
  GitHistoryItemRef,
  GitHistoryResult
} from '@shared/git/historyTypes'
import { hasHistoryFilter } from '@shared/git/historyTypes'
import {
  buildDefaultGitHistoryColorMap,
  buildGitHistoryViewModels,
  type GitHistoryItemViewModel
} from '@shared/git/historyGraph'
import { Button, Input } from '../../common/ds'
import GitHistoryGraphSvg from './GitHistoryGraphSvg'
import { STATUS_COLORS, STATUS_LABELS, splitPath } from './statusDisplay'
import type { DiffRequest } from './DiffView'

const PAGE_SIZE = 50
/** 타이핑 중에 git 을 매번 부르지 않는다. */
const SEARCH_DEBOUNCE_MS = 300

type FilterField = 'message' | 'author' | 'path' | 'content'

const FILTER_FIELDS: { id: FilterField; label: string; placeholder: string; hint: string }[] = [
  { id: 'message', label: '메시지', placeholder: '커밋 메시지 검색', hint: '커밋 제목·본문에서 찾습니다' },
  { id: 'author', label: '작성자', placeholder: '작성자 이름 또는 이메일', hint: '작성자로 거릅니다' },
  { id: 'path', label: '파일', placeholder: '경로 (예: src/main)', hint: '그 경로를 건드린 커밋만' },
  { id: 'content', label: '코드', placeholder: '추가·삭제된 문자열', hint: '그 문자열이 추가되거나 삭제된 커밋만' }
]

interface GitHistoryPanelProps {
  repoPath: string
  onOpenDiff: (request: DiffRequest) => void
}

/** 상대 시간 — 스크린샷의 `3시간 전` 형태. */
function relativeTime(timestamp: number | undefined): string {
  if (!timestamp) return ''
  const seconds = Math.round((Date.now() - timestamp) / 1000)
  if (seconds < 60) return '방금'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}일 전`
  const months = Math.round(days / 30)
  if (months < 12) return `${months}개월 전`
  return `${Math.round(months / 12)}년 전`
}

/**
 * 커밋 히스토리 + 그래프.
 *
 * 폴링하지 않는다 — 히스토리는 git 을 여러 번 부르므로 진입/커밋 후/수동 새로고침에만 읽는다.
 * Load more 는 offset(`--skip`) 방식이라 전 브랜치 토폴로지가 페이지 사이에 일관된다.
 * ⚠️ 레인 계산은 직전 행 결과에 의존하므로 누적 목록 전체를 계산하고 렌더만 잘라야 한다.
 */
function GitHistoryPanel({ repoPath, onOpenDiff }: GitHistoryPanelProps): JSX.Element {
  const [items, setItems] = useState<GitHistoryItem[]>([])
  const [meta, setMeta] = useState<GitHistoryResult | null>(null)
  const [allBranches, setAllBranches] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [field, setField] = useState<FilterField>('message')
  const [query, setQuery] = useState('')
  /** 디바운스가 끝난 값 — 실제 조회에 쓰인다. */
  const [appliedFilter, setAppliedFilter] = useState<GitHistoryFilter>({})
  const repoRef = useRef(repoPath)
  repoRef.current = repoPath

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedFilter(query.trim() ? { [field]: query.trim() } : {})
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query, field])

  const load = useCallback(
    async (options: {
      skip: number
      all: boolean
      append: boolean
      filter: GitHistoryFilter
    }): Promise<void> => {
      const target = repoRef.current
      if (options.append) setLoadingMore(true)
      else setLoading(true)
      try {
        const result = await window.api.git.scm.history(target, {
          limit: PAGE_SIZE,
          skip: options.skip,
          allBranches: options.all,
          filter: options.filter
        })
        // 저장소가 바뀐 뒤 도착한 응답으로 화면을 덮지 않는다.
        if (repoRef.current !== target) return
        setMeta(result)
        setItems((prev) => (options.append ? [...prev, ...result.items] : result.items))
        setError(null)
      } catch (e) {
        if (repoRef.current !== target) return
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (repoRef.current === target) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    []
  )

  useEffect(() => {
    setItems([])
    setExpanded(null)
    void load({ skip: 0, all: allBranches, append: false, filter: appliedFilter })
  }, [repoPath, allBranches, appliedFilter, load])

  useEffect(() => {
    const handler = (): void => {
      setExpanded(null)
      void load({ skip: 0, all: allBranches, append: false, filter: appliedFilter })
    }
    window.addEventListener('git-repo-maybe-changed', handler)
    return () => window.removeEventListener('git-repo-maybe-changed', handler)
  }, [allBranches, appliedFilter, load])

  const filtering = hasHistoryFilter(appliedFilter)

  const viewModels = useMemo(
    () =>
      buildGitHistoryViewModels(items, {
        colorMap: buildDefaultGitHistoryColorMap({
          currentRef: meta?.currentRef,
          remoteRef: meta?.remoteRef,
          baseRef: meta?.baseRef
        }),
        currentRef: meta?.currentRef,
        remoteRef: meta?.remoteRef,
        baseRef: meta?.baseRef
      }),
    [items, meta]
  )

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
        <AlertTriangle size={18} className="text-text-tertiary" />
        <p className="text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-secondary">{error}</p>
        <Button variant="secondary" size="xs" onClick={() => void load({ skip: 0, all: allBranches, append: false, filter: appliedFilter })}>
          다시 시도
        </Button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-2 flex-none border-b border-bg-border">
        <GitBranch size={12} className="text-text-tertiary flex-none" />
        <span className="text-[calc(11.5px_*_var(--app-font-scale,1))] font-medium text-text-primary truncate">
          {meta?.currentRef?.name ?? '—'}
        </span>
        <button
          onClick={() => setAllBranches((v) => !v)}
          aria-pressed={allBranches}
          className={`ml-auto flex-none px-1.5 h-5 rounded text-[calc(10px_*_var(--app-font-scale,1))] border transition-colors ${
            allBranches
              ? 'text-text-primary bg-bg-active border-bg-border-light'
              : 'text-text-tertiary border-bg-border hover:text-text-primary'
          }`}
          title="모든 브랜치의 커밋을 함께 표시"
        >
          모든 브랜치
        </button>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => void load({ skip: 0, all: allBranches, append: false, filter: appliedFilter })}
          aria-label="히스토리 새로고침"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      <div className="px-3 pt-2 pb-1.5 flex flex-col gap-1.5 flex-none">
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={FILTER_FIELDS.find((f) => f.id === field)?.placeholder}
            aria-label="커밋 검색"
            style={{ paddingLeft: 24, paddingRight: query ? 22 : undefined }}
            className="sm"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="검색 지우기"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
            >
              <X size={11} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {FILTER_FIELDS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setField(f.id)}
              aria-pressed={field === f.id}
              title={f.hint}
              className={`ds-chip ${field === f.id ? 'selected' : 'neutral'} cursor-pointer`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 pb-1.5 flex items-baseline gap-1.5 flex-none">
        <span className="text-[calc(10px_*_var(--app-font-scale,1))] font-semibold uppercase tracking-wide text-text-tertiary">
          커밋 {items.length}
          {meta?.hasMore ? '+' : ''}
        </span>
        {filtering && (
          <span className="text-[calc(9.5px_*_var(--app-font-scale,1))] text-text-tertiary">
            검색 결과 — 그래프는 접힙니다
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-2">
        {!loading && items.length === 0 && (
          <p className="px-3 py-6 text-center text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary">
            {filtering ? '검색 결과가 없습니다' : '커밋이 없습니다'}
          </p>
        )}

        {viewModels.map((viewModel) => (
          <CommitRow
            key={viewModel.historyItem.id}
            viewModel={viewModel}
            repoPath={repoPath}
            expanded={expanded === viewModel.historyItem.id}
            showGraph={!filtering}
            onToggle={() =>
              setExpanded((prev) => (prev === viewModel.historyItem.id ? null : viewModel.historyItem.id))
            }
            onOpenDiff={onOpenDiff}
          />
        ))}

        {meta?.hasMore && (
          <div className="px-3 pt-2">
            <Button
              variant="secondary"
              size="xs"
              className="w-full"
              disabled={loadingMore}
              onClick={() => void load({ skip: items.length, all: allBranches, append: true, filter: appliedFilter })}
            >
              {loadingMore ? '불러오는 중…' : '더 보기'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

interface CommitRowProps {
  viewModel: GitHistoryItemViewModel
  repoPath: string
  expanded: boolean
  /** 검색 결과는 히스토리의 부분집합이라 부모가 목록에 없다 — 레인이 매 행 늘어나므로 접는다. */
  showGraph: boolean
  onToggle: () => void
  onOpenDiff: (request: DiffRequest) => void
}

function CommitRow({ viewModel, repoPath, expanded, showGraph, onToggle, onOpenDiff }: CommitRowProps): JSX.Element {
  const commit = viewModel.historyItem
  const [detail, setDetail] = useState<GitCommitDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    if (!expanded || detail) return
    let cancelled = false
    window.api.git.scm
      .commitDetail(repoPath, commit.id)
      .then((result) => { if (!cancelled) setDetail(result) })
      .catch((e: unknown) => { if (!cancelled) setDetailError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [expanded, detail, repoPath, commit.id])

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 pl-1 pr-2 h-6 hover:bg-bg-surface-hover text-left"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown size={10} className="text-text-tertiary flex-none" />
        ) : (
          <ChevronRight size={10} className="text-text-tertiary flex-none" />
        )}
        {showGraph ? (
          <GitHistoryGraphSvg viewModel={viewModel} />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary flex-none" aria-hidden />
        )}
        <span className="flex items-center gap-1 flex-none">
          {commit.references?.slice(0, 2).map((ref) => <RefBadge key={ref.id} refItem={ref} />)}
        </span>
        <span className="flex-1 min-w-0 text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-primary truncate">
          {commit.subject}
        </span>
        <span className="flex-none text-[calc(9.5px_*_var(--app-font-scale,1))] text-text-tertiary tabular-nums">
          {relativeTime(commit.timestamp)}
        </span>
      </button>

      {expanded && (
        <div className="pl-6 pr-2 pb-1.5">
          <div className="flex items-center gap-2 py-1 text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">
            <span className="font-mono">{commit.displayId}</span>
            {commit.author && <span className="truncate">{commit.author}</span>}
          </div>

          {detailError && (
            <p className="py-1 text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary">
              변경 파일을 불러오지 못했습니다 — {detailError}
            </p>
          )}
          {!detail && !detailError && (
            <p className="py-1 text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary">
              불러오는 중…
            </p>
          )}

          {detail?.files.map((file) => {
            const { dir, name } = splitPath(file.path)
            return (
              <button
                key={file.path}
                onClick={() =>
                  onOpenDiff({
                    repoPath,
                    path: file.path,
                    oldPath: file.oldPath,
                    source: { kind: 'commit', commitOid: detail.commitOid, parentOid: detail.parentOid },
                    caption: commit.subject
                  })
                }
                className="w-full flex items-center gap-1 h-5 px-1 rounded hover:bg-bg-surface-hover text-left"
                title={file.path}
              >
                <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary truncate">
                  {name}
                </span>
                {dir && (
                  <span className="text-[calc(9.5px_*_var(--app-font-scale,1))] text-text-tertiary truncate">
                    {dir}
                  </span>
                )}
                <span
                  className={`ml-auto flex-none text-[calc(9.5px_*_var(--app-font-scale,1))] font-semibold ${STATUS_COLORS[file.status]}`}
                >
                  {STATUS_LABELS[file.status]}
                </span>
              </button>
            )
          })}

          {detail && detail.files.length === 0 && (
            <p className="py-1 text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary">
              변경된 파일이 없습니다 (빈 커밋)
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** `origin/develop` 같은 ref 배지 — 색은 그래프 레인과 같은 토큰을 쓴다. */
function RefBadge({ refItem }: { refItem: GitHistoryItemRef }): JSX.Element {
  const color = refItem.color ? `var(--${refItem.color})` : 'var(--text-tertiary)'
  return (
    <span
      className="px-1 h-[15px] inline-flex items-center rounded-[3px] border text-[calc(9px_*_var(--app-font-scale,1))] max-w-[90px] truncate"
      style={{ color, borderColor: color }}
      title={refItem.id}
    >
      {refItem.name}
    </span>
  )
}

export default GitHistoryPanel
