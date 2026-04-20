import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  GitBranch as GitBranchIcon,
  FolderOpen,
  Plus,
  Trash2,
  Terminal,
  RefreshCw,
  Loader2,
  FileCode,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  X,
  Search,
  Eye
} from 'lucide-react'
import TerminalPane from '../Terminal/TerminalPane'

interface Worktree {
  path: string
  branch: string
  head: string
  isMain: boolean
  isBare: boolean
}

interface WorktreeStatusInfo {
  modifiedFiles: number
  untrackedFiles: number
  aheadBehind: { ahead: number; behind: number }
}

interface Branch {
  name: string
  isRemote: boolean
  isCurrent: boolean
  lastCommit: string
  lastCommitDate: string
}

interface FileDiff {
  file: string
  status: 'M' | 'A' | 'D' | 'R' | '?'
  additions: number
  deletions: number
}

interface DiffResult {
  files: FileDiff[]
  summary: string
  patch: string
}

interface CompareResult {
  file: string
  leftContent: string
  rightContent: string
  leftBranch: string
  rightBranch: string
}

type Panel = 'none' | 'diff' | 'compare' | 'file-compare' | 'terminal'

interface BranchWorkspaceProps {
  onOpenTerminal?: () => void
}

function BranchWorkspace({ onOpenTerminal: _onOpenTerminal }: BranchWorkspaceProps): JSX.Element {
  // 프로젝트 상태
  const [repoPath, setRepoPath] = useState<string>('')
  const [isRepo, setIsRepo] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  // 워크트리 & 브랜치
  const [worktrees, setWorktrees] = useState<Worktree[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [statuses, setStatuses] = useState<Record<string, WorktreeStatusInfo>>({})

  // UI 상태
  const [showBranchPicker, setShowBranchPicker] = useState(false)
  const [branchSearch, setBranchSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [activePanel, setActivePanel] = useState<Panel>('none')
  const [selectedWorktree, setSelectedWorktree] = useState<Worktree | null>(null)
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
  const [compareResult, setCompareResult] = useState<DiffResult | null>(null)
  const [fileCompare, setFileCompare] = useState<CompareResult | null>(null)
  const [compareBranches, setCompareBranches] = useState<[string, string]>(['', ''])
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  /** 워크트리 경로 → 터미널 세션 id (재클릭 시 기존 세션 재사용) */
  const [termSessions, setTermSessions] = useState<Record<string, string>>({})
  /** 탭 순서: 열려있는 워크트리 경로 목록 (오래된 순) */
  const [openTermPaths, setOpenTermPaths] = useState<string[]>([])
  /** 현재 활성 터미널의 워크트리 경로 */
  const [activeTermPath, setActiveTermPath] = useState<string | null>(null)
  /** 앱 시작 후 터미널 복원 완료 여부 (중복 방지) */
  const termRestoredRef = useRef(false)

  // 상태를 localStorage에 영속화
  useEffect(() => {
    localStorage.setItem('branchWorkspace.openTermPaths', JSON.stringify(openTermPaths))
  }, [openTermPaths])
  useEffect(() => {
    localStorage.setItem('branchWorkspace.activeTermPath', activeTermPath || '')
  }, [activeTermPath])

  // 앱 시작 시 터미널 세션 복원 — 마지막으로 열려있던 브랜치 터미널들을 재생성
  useEffect(() => {
    if (termRestoredRef.current) return
    termRestoredRef.current = true
    try {
      const saved = localStorage.getItem('branchWorkspace.openTermPaths')
      if (!saved) return
      const paths = JSON.parse(saved) as string[]
      if (!Array.isArray(paths) || paths.length === 0) return
      const savedActive = localStorage.getItem('branchWorkspace.activeTermPath') || paths[paths.length - 1]

      // 각 경로에 대해 새 pty 세션 생성 (병렬)
      Promise.all(paths.map(async (p) => {
        try {
          const session = await window.api.terminal.create({ cwd: p })
          return { path: p, id: session.id }
        } catch { return null }
      })).then((results) => {
        const nextSessions: Record<string, string> = {}
        const nextPaths: string[] = []
        for (const r of results) {
          if (!r) continue
          nextSessions[r.path] = r.id
          nextPaths.push(r.path)
        }
        if (nextPaths.length > 0) {
          setTermSessions(nextSessions)
          setOpenTermPaths(nextPaths)
          setActiveTermPath(nextPaths.includes(savedActive) ? savedActive : nextPaths[nextPaths.length - 1])
          // 패널은 자동으로 열지 않음 — 사용자가 브랜치 클릭 시 나타남
        }
      }).catch(() => { /* ignore */ })
    } catch { /* ignore */ }
  }, [])

  // Cmd/Ctrl + 1~9 로 터미널 탭 전환
  useEffect(() => {
    if (activePanel !== 'terminal') return
    const handler = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return
      // 입력 포커스가 input/textarea에 있으면 건너뜀 (typing 방해 방지)
      const t = e.target as HTMLElement | null
      const tag = t?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      const num = parseInt(e.key, 10)
      if (!Number.isFinite(num) || num < 1 || num > 9) return
      if (num > openTermPaths.length) return
      e.preventDefault()
      setActiveTermPath(openTermPaths[num - 1])
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activePanel, openTermPaths])

  // 앱 시작 시 마지막 프로젝트 복원
  useEffect(() => {
    (async () => {
      const saved = await window.api.settings.get('gitRepoPath') as string | null
      if (!saved) return
      try {
        const valid = await window.api.git.isRepo(saved)
        if (valid) {
          setRepoPath(saved)
          setIsRepo(true)
        }
      } catch {}
    })()
  }, [])

  // 프로젝트 폴더 선택
  const selectFolder = useCallback(async () => {
    const folder = await window.api.dialog.selectFolder()
    if (!folder) return
    setError('')
    setLoading(true)
    try {
      const valid = await window.api.git.isRepo(folder)
      if (!valid) {
        setError('선택한 폴더가 Git 저장소가 아닙니다')
        setIsRepo(false)
        return
      }
      const root = await window.api.git.repoRoot(folder)
      setRepoPath(root)
      setIsRepo(true)
      await window.api.settings.set('gitRepoPath', root)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // 데이터 로드
  const refresh = useCallback(async () => {
    if (!repoPath) return
    setLoading(true)
    try {
      const [wt, br] = await Promise.all([
        window.api.git.worktrees(repoPath),
        window.api.git.branches(repoPath)
      ])
      setWorktrees(wt)
      setBranches(br)

      // 각 워크트리 상태 병렬 조회
      const statusEntries = await Promise.all(
        wt.filter((w) => !w.isBare).map(async (w) => {
          try {
            const s = await window.api.git.worktreeStatus(w.path)
            return [w.path, s] as const
          } catch {
            return [w.path, { modifiedFiles: 0, untrackedFiles: 0, aheadBehind: { ahead: 0, behind: 0 } }] as const
          }
        })
      )
      setStatuses(Object.fromEntries(statusEntries))
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [repoPath])

  useEffect(() => {
    if (isRepo && repoPath) refresh()
  }, [isRepo, repoPath, refresh])

  // 브랜치로 워크트리 생성
  const createWorktree = async (branchName: string): Promise<void> => {
    setCreating(true)
    setError('')
    try {
      await window.api.git.createWorktree({ repoPath, branch: branchName })
      setShowBranchPicker(false)
      setBranchSearch('')
      await refresh()
    } catch (err) {
      setError(`워크트리 생성 실패: ${err}`)
    } finally {
      setCreating(false)
    }
  }

  // 워크트리 삭제 (확인 후)
  const removeWorktree = async (wt: Worktree): Promise<void> => {
    if (wt.isMain) return
    const confirmed = window.confirm(`워크트리 "${wt.branch}"를 제거하시겠습니까?\n커밋하지 않은 변경사항은 삭제됩니다.`)
    if (!confirmed) return
    try {
      // 인라인 터미널 탭도 같이 정리
      if (termSessions[wt.path]) {
        await closeTerminalTab(wt.path)
      }
      if (selectedWorktree?.path === wt.path) setActivePanel('none')
      try {
        await window.api.git.removeWorktree({ repoPath, worktreePath: wt.path })
      } catch {
        await window.api.git.removeWorktree({ repoPath, worktreePath: wt.path, force: true })
      }
      await refresh()
    } catch (err) {
      setError(`워크트리 삭제 실패: ${err}`)
    }
  }

  // 우측 패널에 인라인 터미널 — 탭으로 여러 브랜치 동시 유지
  const openTerminal = async (wt: Worktree): Promise<void> => {
    setSelectedWorktree(wt)
    setActivePanel('terminal')
    setActiveTermPath(wt.path)
    // 탭 순서에 없으면 추가
    setOpenTermPaths((prev) => prev.includes(wt.path) ? prev : [...prev, wt.path])
    // 기존 세션 있으면 재사용, 없으면 생성
    if (termSessions[wt.path]) return
    try {
      const session = await window.api.terminal.create({ cwd: wt.path })
      setTermSessions((prev) => ({ ...prev, [wt.path]: session.id }))
    } catch (err) {
      console.error('터미널 생성 실패:', err)
    }
  }

  // 특정 탭 닫기 (세션 kill)
  const closeTerminalTab = async (path: string): Promise<void> => {
    const sessionId = termSessions[path]
    if (sessionId) {
      try { await window.api.terminal.kill(sessionId) } catch { /* ignore */ }
    }
    setTermSessions((prev) => {
      const next = { ...prev }
      delete next[path]
      return next
    })
    setOpenTermPaths((prev) => {
      const next = prev.filter((p) => p !== path)
      // 현재 활성 탭을 닫았다면 다른 탭으로 전환
      if (activeTermPath === path) {
        if (next.length > 0) setActiveTermPath(next[next.length - 1])
        else {
          setActiveTermPath(null)
          setActivePanel('none')
        }
      }
      return next
    })
  }

  // diff 보기
  const viewDiff = async (wt: Worktree): Promise<void> => {
    setSelectedWorktree(wt)
    setActivePanel('diff')
    try {
      const result = await window.api.git.diff(wt.path)
      setDiffResult(result)
    } catch {
      setDiffResult(null)
    }
  }

  // 브랜치 비교
  const runCompare = async (): Promise<void> => {
    const [b1, b2] = compareBranches
    if (!b1 || !b2) return
    setActivePanel('compare')
    try {
      const result = await window.api.git.compareBranches(repoPath, b1, b2)
      setCompareResult(result)
    } catch {
      setCompareResult(null)
    }
  }

  // 파일 비교
  const viewFileCompare = async (filePath: string, branch1: string, branch2: string): Promise<void> => {
    setActivePanel('file-compare')
    try {
      const result = await window.api.git.compareFile(repoPath, filePath, branch1, branch2)
      setFileCompare(result)
    } catch {
      setFileCompare(null)
    }
  }

  // 사용 중인 브랜치 이름 세트 (메모이제이션)
  const usedBranches = useMemo(() => new Set(worktrees.map((w) => w.branch)), [worktrees])

  const availableBranches = useMemo(() =>
    branches.filter((b) => {
      if (usedBranches.has(b.name)) return false
      if (usedBranches.has(b.name.replace(/^origin\//, ''))) return false
      if (branchSearch) return b.name.toLowerCase().includes(branchSearch.toLowerCase())
      return true
    }),
    [branches, usedBranches, branchSearch]
  )

  const toggleCard = (path: string): void => {
    setExpandedCards((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const statusBadge = (status: WorktreeStatusInfo | undefined): JSX.Element | null => {
    if (!status) return null
    const total = status.modifiedFiles + status.untrackedFiles
    if (total === 0 && status.aheadBehind.ahead === 0 && status.aheadBehind.behind === 0) {
      return (
        <span className="flex items-center gap-0.5 text-[9px] text-emerald-400">
          <CheckCircle2 size={10} /> clean
        </span>
      )
    }
    return (
      <div className="flex items-center gap-2 text-[9px]">
        {total > 0 && (
          <span className="text-clover-orange">{total} 변경</span>
        )}
        {status.aheadBehind.ahead > 0 && (
          <span className="text-clover-blue">↑{status.aheadBehind.ahead}</span>
        )}
        {status.aheadBehind.behind > 0 && (
          <span className="text-red-400">↓{status.aheadBehind.behind}</span>
        )}
      </div>
    )
  }

  // 프로젝트 미선택 상태
  if (!isRepo) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-clover-blue/20 to-clover-blue/5 flex items-center justify-center">
          <GitBranchIcon size={28} className="text-clover-blue" />
        </div>
        <div className="text-center">
          <h2 className="text-base font-semibold text-text-primary mb-1">브랜치 병렬 작업</h2>
          <p className="text-xs text-text-secondary">
            프로젝트를 선택하면 여러 브랜치를 동시에 작업할 수 있습니다
          </p>
        </div>
        <button
          onClick={selectFolder}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-clover-blue text-white text-sm font-medium hover:bg-clover-blue/80 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
          프로젝트 폴더 선택
        </button>
        {error && (
          <div className="flex items-center gap-1 text-xs text-red-400">
            <AlertCircle size={12} /> {error}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-bg-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranchIcon size={15} className="text-clover-blue" />
            <h2 className="text-sm font-semibold text-text-primary">브랜치 병렬 작업</h2>
            <span className="text-[9px] text-text-tertiary bg-bg-surface px-1.5 py-0.5 rounded">
              {repoPath.split('/').pop()}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowBranchPicker(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-clover-blue text-white text-[11px] font-medium hover:bg-clover-blue/80 transition-colors"
            >
              <Plus size={12} /> 브랜치 추가
            </button>
            <button
              onClick={refresh}
              disabled={loading}
              className="p-1.5 rounded-lg hover:bg-bg-surface-hover text-text-tertiary transition-colors"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => { setRepoPath(''); setIsRepo(false); setWorktrees([]); setBranches([]); void window.api.settings.set('gitRepoPath', '') }}
              className="p-1.5 rounded-lg hover:bg-bg-surface-hover text-text-tertiary transition-colors"
              title="프로젝트 변경"
            >
              <FolderOpen size={13} />
            </button>
          </div>
        </div>
        {error && (
          <div className="flex items-center gap-1 mt-1.5 text-[10px] text-red-400">
            <AlertCircle size={10} /> {error}
            <button onClick={() => setError('')} className="ml-auto"><X size={10} /></button>
          </div>
        )}
      </div>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 좌측: 워크트리 카드 목록 */}
        <div className={`${activePanel !== 'none' ? 'w-[340px]' : 'flex-1'} flex-shrink-0 overflow-y-auto p-3 space-y-2 transition-all`}>
          {/* 브랜치 비교 영역 */}
          <div className="p-3 rounded-xl bg-bg-surface/50 border border-bg-border/50">
            <div className="flex items-center gap-1.5 mb-2">
              <ArrowUpDown size={11} className="text-clover-blue" />
              <span className="text-[10px] font-medium text-text-secondary">브랜치 비교</span>
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={compareBranches[0]}
                onChange={(e) => setCompareBranches([e.target.value, compareBranches[1]])}
                className="flex-1 min-w-0 px-2 py-1 bg-bg-primary border border-bg-border rounded text-[10px] text-text-primary focus:outline-none focus:border-clover-blue"
              >
                <option value="">브랜치 1</option>
                {worktrees.map((w) => (
                  <option key={w.path} value={w.branch}>{w.branch}</option>
                ))}
              </select>
              <span className="text-[10px] text-text-tertiary flex-shrink-0">vs</span>
              <select
                value={compareBranches[1]}
                onChange={(e) => setCompareBranches([compareBranches[0], e.target.value])}
                className="flex-1 min-w-0 px-2 py-1 bg-bg-primary border border-bg-border rounded text-[10px] text-text-primary focus:outline-none focus:border-clover-blue"
              >
                <option value="">브랜치 2</option>
                {worktrees.map((w) => (
                  <option key={w.path} value={w.branch}>{w.branch}</option>
                ))}
              </select>
              <button
                onClick={runCompare}
                disabled={!compareBranches[0] || !compareBranches[1] || compareBranches[0] === compareBranches[1]}
                className="flex-shrink-0 px-2.5 py-1 rounded bg-clover-blue/10 text-clover-blue text-[10px] font-medium hover:bg-clover-blue/20 disabled:opacity-30 disabled:cursor-not-allowed"
                title={compareBranches[0] === compareBranches[1] && compareBranches[0] ? '같은 브랜치는 비교할 수 없습니다' : ''}
              >
                비교
              </button>
            </div>
            {compareBranches[0] && compareBranches[1] && compareBranches[0] === compareBranches[1] && (
              <p className="mt-1.5 text-[9px] text-amber-400">같은 브랜치를 선택했습니다</p>
            )}
          </div>

          {/* 워크트리 카드들 */}
          {worktrees.filter((w) => !w.isBare).map((wt) => {
            const status = statuses[wt.path]
            const expanded = expandedCards.has(wt.path)

            return (
              <div
                key={wt.path}
                className={`rounded-xl border transition-all ${
                  selectedWorktree?.path === wt.path && activePanel === 'diff'
                    ? 'border-clover-blue/50 bg-clover-blue/5'
                    : 'border-bg-border bg-bg-surface/50 hover:border-bg-border/80'
                }`}
              >
                {/* 카드 헤더 */}
                <div className="px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <button onClick={() => toggleCard(wt.path)} className="text-text-tertiary">
                        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </button>
                      <GitBranchIcon size={12} className={wt.isMain ? 'text-emerald-400' : 'text-clover-blue'} />
                      <span className="text-xs font-medium text-text-primary truncate">{wt.branch}</span>
                      {wt.isMain && (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">main</span>
                      )}
                    </div>
                    {statusBadge(status)}
                  </div>
                  <div className="flex items-center gap-1 mt-1 ml-5">
                    <span className="text-[9px] text-text-tertiary truncate">{wt.path}</span>
                    <span className="text-[9px] text-text-tertiary font-mono">{wt.head.substring(0, 7)}</span>
                  </div>

                  {/* 액션 버튼 */}
                  <div className="flex items-center gap-1 mt-2 ml-5">
                    <button
                      onClick={() => openTerminal(wt)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md bg-bg-primary border border-bg-border text-[10px] text-text-secondary hover:text-text-primary hover:border-clover-blue/30 transition-colors"
                    >
                      <Terminal size={10} /> 터미널
                    </button>
                    <button
                      onClick={() => viewDiff(wt)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md bg-bg-primary border border-bg-border text-[10px] text-text-secondary hover:text-text-primary hover:border-clover-blue/30 transition-colors"
                    >
                      <FileCode size={10} /> 변경사항
                    </button>
                    {!wt.isMain && (
                      <button
                        onClick={() => removeWorktree(wt)}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-bg-primary border border-bg-border text-[10px] text-red-400/60 hover:text-red-400 hover:border-red-400/30 transition-colors ml-auto"
                      >
                        <Trash2 size={10} /> 제거
                      </button>
                    )}
                  </div>
                </div>

                {/* 확장: 변경 파일 미리보기 */}
                {expanded && status && (status.modifiedFiles + status.untrackedFiles > 0) && (
                  <div className="px-3 pb-2.5 border-t border-bg-border/50 pt-2">
                    <ChangedFilesList worktreePath={wt.path} />
                  </div>
                )}
              </div>
            )
          })}

          {worktrees.filter((w) => !w.isBare).length === 0 && !loading && (
            <div className="text-center py-8 text-text-tertiary text-xs">
              워크트리가 없습니다. 브랜치를 추가해보세요.
            </div>
          )}
        </div>

        {/* 우측: 상세 패널 */}
        {activePanel !== 'none' && (
          <div className="flex-1 border-l border-bg-border flex flex-col overflow-hidden">
            {/* 터미널 탭바 (터미널 모드일 때만) */}
            {activePanel === 'terminal' ? (
              <div className="flex items-center border-b border-bg-border bg-bg-surface flex-shrink-0 overflow-x-auto">
                {openTermPaths.map((path, idx) => {
                  const wt = worktrees.find((w) => w.path === path)
                  const isActive = activeTermPath === path
                  const label = wt?.branch || path.split('/').pop() || path
                  const shortcutKey = idx < 9 ? String(idx + 1) : null
                  const modKey = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl+'
                  return (
                    <div key={path}
                      onClick={() => setActiveTermPath(path)}
                      title={shortcutKey ? `${modKey}${shortcutKey} 로 전환` : undefined}
                      className={`group flex items-center gap-1.5 px-3 py-2 text-[11px] cursor-pointer border-r border-bg-border transition-colors ${
                        isActive
                          ? 'bg-bg-primary text-clover-blue border-b-2 border-b-clover-blue'
                          : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
                      }`}>
                      {shortcutKey && (
                        <span className={`text-[9px] font-mono px-1 rounded ${
                          isActive ? 'bg-clover-blue/20 text-clover-blue' : 'bg-bg-border text-text-tertiary'
                        }`}>
                          {shortcutKey}
                        </span>
                      )}
                      <Terminal size={10} className={isActive ? 'text-clover-blue' : 'text-text-tertiary'} />
                      <span className="font-mono truncate max-w-[160px]">{label}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); closeTerminalTab(path) }}
                        className="p-0.5 rounded hover:bg-red-500/10 text-text-tertiary hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="터미널 닫기"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  )
                })}
                <button
                  onClick={() => setActivePanel('none')}
                  className="ml-auto p-2 text-text-tertiary hover:text-text-primary"
                  title="패널 닫기"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="px-3 py-2 border-b border-bg-border flex items-center justify-between flex-shrink-0">
                <span className="text-[11px] font-medium text-text-primary flex items-center gap-1.5">
                  {activePanel === 'diff' && `${selectedWorktree?.branch} 변경사항`}
                  {activePanel === 'compare' && `${compareBranches[0]} ↔ ${compareBranches[1]}`}
                  {activePanel === 'file-compare' && fileCompare?.file}
                </span>
                <button
                  onClick={() => setActivePanel('none')}
                  className="p-1 rounded hover:bg-bg-surface-hover text-text-tertiary"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* 터미널: 모든 탭 항상 마운트해서 상태 유지 (active만 보이게) */}
            {activePanel === 'terminal' ? (
              <div className="relative flex-1 overflow-hidden" style={{ background: '#111827' }}>
                {openTermPaths.map((path) => {
                  const sessionId = termSessions[path]
                  if (!sessionId) return null
                  return (
                    <TerminalPane
                      key={sessionId}
                      sessionId={sessionId}
                      isActive={activeTermPath === path}
                    />
                  )
                })}
                {openTermPaths.length === 0 || !termSessions[activeTermPath || ''] ? (
                  <div className="flex items-center justify-center h-full text-xs text-text-tertiary">
                    <Loader2 size={14} className="animate-spin mr-2" /> 터미널 준비 중...
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {activePanel === 'diff' && diffResult && (
                  <DiffPanel
                    result={diffResult}
                    branch={selectedWorktree?.branch || ''}
                    repoPath={repoPath}
                    onFileCompare={compareBranches[0] && compareBranches[1]
                      ? (f) => viewFileCompare(f, compareBranches[0], compareBranches[1])
                      : undefined
                    }
                  />
                )}
                {activePanel === 'compare' && compareResult && (
                  <DiffPanel
                    result={compareResult}
                    branch={`${compareBranches[0]} → ${compareBranches[1]}`}
                    repoPath={repoPath}
                    onFileCompare={(f) => viewFileCompare(f, compareBranches[0], compareBranches[1])}
                  />
                )}
                {activePanel === 'file-compare' && fileCompare && (
                  <FileComparePanel result={fileCompare} onBack={() => setActivePanel('compare')} />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 브랜치 선택 모달 */}
      {showBranchPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowBranchPicker(false)} onKeyDown={(e) => e.key === 'Escape' && setShowBranchPicker(false)} role="dialog" aria-modal="true">
          <div className="bg-bg-surface rounded-xl border border-bg-border w-[400px] max-h-[500px] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-bg-border">
              <h3 className="text-sm font-semibold text-text-primary mb-2">작업할 브랜치 선택</h3>
              <div className="relative">
                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
                <input
                  type="text"
                  value={branchSearch}
                  onChange={(e) => setBranchSearch(e.target.value)}
                  placeholder="브랜치 검색..."
                  autoFocus
                  className="w-full pl-7 pr-2 py-1.5 bg-bg-primary border border-bg-border rounded-lg text-xs text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {creating ? (
                <div className="flex items-center justify-center py-8 text-text-secondary text-xs gap-2">
                  <Loader2 size={12} className="animate-spin" /> 워크트리 생성 중...
                </div>
              ) : availableBranches.length === 0 ? (
                <div className="text-center py-8 text-text-tertiary text-xs">
                  {branchSearch ? '검색 결과 없음' : '사용 가능한 브랜치 없음'}
                </div>
              ) : (
                availableBranches.map((b) => (
                  <button
                    key={b.name}
                    onClick={() => createWorktree(b.name)}
                    className="w-full px-4 py-2.5 text-left hover:bg-bg-surface-hover border-b border-bg-border/30 transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <GitBranchIcon size={11} className={b.isRemote ? 'text-text-tertiary' : 'text-clover-blue'} />
                      <span className="text-xs text-text-primary">{b.name}</span>
                      {b.isRemote && (
                        <span className="text-[8px] text-text-tertiary px-1 py-0.5 rounded bg-bg-primary">remote</span>
                      )}
                    </div>
                    <div className="text-[9px] text-text-tertiary mt-0.5 ml-4">
                      {b.lastCommit} · {b.lastCommitDate ? new Date(b.lastCommitDate).toLocaleDateString('ko-KR') : ''}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** 변경 파일 목록 (카드 내 확장 영역) */
function ChangedFilesList({ worktreePath }: { worktreePath: string }): JSX.Element {
  const [files, setFiles] = useState<FileDiff[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await window.api.git.diff(worktreePath)
        if (!cancelled) setFiles(result.files)
      } catch {}
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [worktreePath])

  if (loading) return <div className="text-[9px] text-text-tertiary">로딩...</div>
  if (files.length === 0) return <div className="text-[9px] text-text-tertiary">변경 파일 없음</div>

  return (
    <div className="space-y-0.5">
      {files.slice(0, 10).map((f) => (
        <div key={f.file} className="flex items-center gap-1.5 text-[9px]">
          <span className={`font-mono w-4 text-center ${
            f.status === 'M' ? 'text-clover-orange' :
            f.status === 'A' ? 'text-emerald-400' :
            f.status === 'D' ? 'text-red-400' : 'text-text-tertiary'
          }`}>{f.status}</span>
          <span className="text-text-secondary truncate">{f.file}</span>
        </div>
      ))}
      {files.length > 10 && (
        <div className="text-[9px] text-text-tertiary">+{files.length - 10}개 더...</div>
      )}
    </div>
  )
}

/** Diff 패널 (변경사항 상세) */
function DiffPanel({
  result,
  branch,
  repoPath,
  onFileCompare
}: {
  result: DiffResult
  branch: string
  repoPath: string
  onFileCompare?: (filePath: string) => void
}): JSX.Element {
  const statusIcon = (s: string): string => {
    switch (s) {
      case 'M': return '수정'
      case 'A': return '추가'
      case 'D': return '삭제'
      case '?': return '미추적'
      default: return s
    }
  }

  const statusColor = (s: string): string => {
    switch (s) {
      case 'M': return 'text-clover-orange bg-clover-orange/10'
      case 'A': return 'text-emerald-400 bg-emerald-400/10'
      case 'D': return 'text-red-400 bg-red-400/10'
      default: return 'text-text-tertiary bg-bg-surface'
    }
  }

  if (result.files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
        <CheckCircle2 size={24} className="text-emerald-400 mb-2" />
        <span className="text-xs">변경사항 없음</span>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-1.5">
      <div className="text-[10px] text-text-tertiary mb-2">
        {result.files.length}개 파일 변경 · {result.summary}
      </div>
      {result.files.map((f) => (
        <div key={f.file} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-bg-surface/50 group">
          <span className={`text-[8px] px-1 py-0.5 rounded font-medium ${statusColor(f.status)}`}>
            {statusIcon(f.status)}
          </span>
          <span className="text-[11px] text-text-primary truncate flex-1 font-mono">{f.file}</span>
          {onFileCompare && (
            <button
              onClick={() => onFileCompare(f.file)}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-bg-surface-hover text-text-tertiary transition-all"
              title="파일 비교"
            >
              <Eye size={11} />
            </button>
          )}
        </div>
      ))}

      {/* Patch 미리보기 */}
      {result.patch && (
        <div className="mt-3">
          <div className="text-[10px] text-text-tertiary mb-1">Diff 미리보기</div>
          <pre className="text-[9px] leading-relaxed font-mono bg-bg-primary rounded-lg p-3 overflow-x-auto max-h-[400px] overflow-y-auto border border-bg-border">
            {result.patch.split('\n').map((line, i) => (
              <div
                key={i}
                className={
                  line.startsWith('+') && !line.startsWith('+++') ? 'text-emerald-400 bg-emerald-400/5' :
                  line.startsWith('-') && !line.startsWith('---') ? 'text-red-400 bg-red-400/5' :
                  line.startsWith('@@') ? 'text-clover-blue' :
                  'text-text-tertiary'
                }
              >
                {line}
              </div>
            ))}
          </pre>
        </div>
      )}
    </div>
  )
}

/** 파일 비교 패널 (좌우 분할) */
function FileComparePanel({ result, onBack }: { result: CompareResult; onBack: () => void }): JSX.Element {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 border-b border-bg-border flex items-center gap-2 flex-shrink-0">
        <button onClick={onBack} className="text-[10px] text-clover-blue hover:underline">← 목록으로</button>
        <span className="text-[10px] text-text-tertiary font-mono">{result.file}</span>
      </div>
      <div className="flex-1 flex overflow-hidden">
        {/* 좌측 브랜치 */}
        <div className="flex-1 flex flex-col border-r border-bg-border overflow-hidden">
          <div className="px-3 py-1 bg-bg-surface/50 border-b border-bg-border text-[9px] text-text-tertiary flex-shrink-0">
            {result.leftBranch}
          </div>
          <pre className="flex-1 text-[9px] leading-relaxed font-mono p-2 overflow-auto text-text-secondary">
            {result.leftContent}
          </pre>
        </div>
        {/* 우측 브랜치 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 py-1 bg-bg-surface/50 border-b border-bg-border text-[9px] text-text-tertiary flex-shrink-0">
            {result.rightBranch}
          </div>
          <pre className="flex-1 text-[9px] leading-relaxed font-mono p-2 overflow-auto text-text-secondary">
            {result.rightContent}
          </pre>
        </div>
      </div>
    </div>
  )
}

export default BranchWorkspace
