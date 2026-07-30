import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, FileDiff, RefreshCw, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { DoorayTask, DoorayTaskComment, DoorayTaskDetail, DoorayWorkflow } from '@shared/types/dooray'
import type { GitDiffResult } from '@shared/types/git'
import type { AgentRun } from '@shared/types/workspace'
import DoorayImage from '../common/DoorayImage'
import DiffPanel from '../Git/DiffPanel'
import { Button, Chip, LoadingView, SegTabs } from '../common/ds'

const markdownComponents = {
  img: ({ src, alt }: { src?: string; alt?: string }) => (
    <DoorayImage src={src} alt={alt} className="max-w-full rounded-lg" />
  )
}

type Tab = 'detail' | 'changes'

interface TaskSidePanelProps {
  task: DoorayTask
  /** 워크스페이스가 있을 때만 — 변경사항 탭의 대상 */
  run?: AgentRun
  onClose: () => void
}

/**
 * 터미널을 보면서 업무 본문을 같이 읽는 우측 패널. 기본 탭은 "업무 상세" 다.
 * 변경사항 탭은 현재 워크트리의 미커밋 diff 를 보여준다.
 */
function TaskSidePanel({ task, run, onClose }: TaskSidePanelProps): JSX.Element {
  const [tab, setTab] = useState<Tab>('detail')
  const [detail, setDetail] = useState<DoorayTaskDetail | null>(null)
  const [comments, setComments] = useState<DoorayTaskComment[]>([])
  const [loading, setLoading] = useState(true)
  const [workflows, setWorkflows] = useState<DoorayWorkflow[]>([])
  const [diff, setDiff] = useState<GitDiffResult | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setDetail(null)
    setComments([])
    void (async () => {
      try {
        const d = await window.api.dooray.tasks.detail(task.projectId, task.id)
        if (alive) setDetail(d)
      } catch {
        /* 상세 실패는 본문 미표시로 degrade */
      }
      try {
        const c = await window.api.dooray.tasks.comments(task.projectId, task.id)
        if (alive) setComments(c)
      } catch {
        /* 댓글 실패 무시 */
      }
      if (alive) setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [task.projectId, task.id])

  useEffect(() => {
    let alive = true
    void window.api.dooray
      .projectWorkflows(task.projectId)
      .then((w) => alive && setWorkflows(w))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [task.projectId])

  const loadDiff = useCallback(async (): Promise<void> => {
    if (!run) return
    setDiffLoading(true)
    try {
      setDiff(await window.api.git.diff(run.worktreePath))
    } catch {
      setDiff(null)
    } finally {
      setDiffLoading(false)
    }
  }, [run])

  useEffect(() => {
    if (tab === 'changes') void loadDiff()
  }, [tab, loadDiff])

  const changeWorkflow = async (workflowId: string): Promise<void> => {
    try {
      await window.api.dooray.tasks.update({ postId: task.id, projectId: task.projectId, status: workflowId })
    } catch {
      /* 실패는 무시 — 두레이 웹에서 변경 가능 */
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-bg-surface border-l border-bg-border">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-bg-border flex-none">
        <SegTabs
          items={[
            { key: 'detail', label: '업무 상세' },
            { key: 'changes', label: '변경사항' }
          ]}
          value={tab}
          onChange={(k) => setTab(k as Tab)}
        />
        <button
          type="button"
          aria-label="패널 닫기"
          onClick={onClose}
          className="ml-auto text-text-tertiary hover:text-text-primary"
        >
          <X size={15} />
        </button>
      </div>

      {tab === 'detail' ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-3.5">
          <div className="flex items-start gap-2">
            {task.number !== undefined && (
              <span className="font-mono text-[calc(11px_*_var(--app-font-scale,1))] text-clauday-blue mt-0.5">
                #{task.number}
              </span>
            )}
            <h3 className="flex-1 text-[calc(13px_*_var(--app-font-scale,1))] font-semibold text-text-primary leading-snug">
              {task.subject}
            </h3>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap mt-2">
            {workflows.length > 0 ? (
              <select
                aria-label="두레이 상태"
                defaultValue=""
                onChange={(e) => e.target.value && void changeWorkflow(e.target.value)}
                className="ds-input sm w-auto"
              >
                <option value="">{task.workflowName || task.workflow?.name || '상태 변경'}</option>
                {workflows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            ) : (
              <Chip tone="neutral">{task.workflowName || task.workflow?.name || '상태'}</Chip>
            )}
            {task.tags?.map((t) => (
              <Chip key={t.id ?? t.name} tone="blue">
                {t.name}
              </Chip>
            ))}
          </div>

          {loading ? (
            <LoadingView label="업무 정보를 불러오는 중" />
          ) : (
            <>
              {detail?.body?.content && (
                <div className="markdown-body mt-3 text-[calc(12px_*_var(--app-font-scale,1))]">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={markdownComponents}
                  >
                    {detail.body.content}
                  </ReactMarkdown>
                </div>
              )}
              {comments.length > 0 && (
                <div className="mt-4">
                  <div className="text-[calc(10px_*_var(--app-font-scale,1))] font-semibold text-text-tertiary uppercase tracking-wide mb-1.5">
                    댓글 {comments.length}
                  </div>
                  <div className="flex flex-col gap-2">
                    {comments.map((c) => (
                      <div key={c.id} className="ds-card">
                        <div className="text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary mb-1">
                          {c.creator?.member?.name ?? '알 수 없음'}
                        </div>
                        <div className="text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-secondary whitespace-pre-wrap break-words">
                          {c.body?.content ?? ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <a
            href={`https://nhnent.dooray.com/project/posts/${task.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ds-btn ghost sm mt-4"
          >
            <ExternalLink size={13} /> Dooray 에서 열기
          </a>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {!run ? (
            <div className="p-4 text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-tertiary">
              워크스페이스를 시작하면 변경사항을 볼 수 있습니다.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 py-2 border-b border-bg-border">
                <FileDiff size={13} className="text-text-tertiary" />
                <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary">
                  {diff ? diffSummaryOf(diff) : '미커밋 변경'}
                </span>
                <Button variant="ghost" size="xs" className="ml-auto" onClick={() => void loadDiff()}>
                  <RefreshCw size={12} /> 새로고침
                </Button>
              </div>
              {diffLoading ? (
                <LoadingView label="diff 불러오는 중" />
              ) : diff && diff.files.length > 0 ? (
                <DiffPanel result={diff} branch={run.branch} repoPath={run.worktreePath} />
              ) : (
                <div className="p-4 text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-tertiary">
                  미커밋 변경이 없습니다.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** 워크트리 diff 한 줄 요약 — `+84 −12 · 파일 6개`. */
function diffSummaryOf(diff: GitDiffResult): string {
  const additions = diff.files.reduce((sum, f) => sum + f.additions, 0)
  const deletions = diff.files.reduce((sum, f) => sum + f.deletions, 0)
  return `+${additions} −${deletions} · 파일 ${diff.files.length}개`
}

export default TaskSidePanel
