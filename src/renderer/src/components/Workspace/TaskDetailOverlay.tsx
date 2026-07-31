import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Copy, ExternalLink, Hash, Play, Send, Terminal as TerminalIcon, TerminalSquare, Unlink, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { DoorayTask, DoorayTaskComment, DoorayTaskDetail } from '@shared/types/dooray'
import type { TaskSessionLink } from '@shared/types/workspace'
import { workspaceKey } from '@shared/workspace/workspaceKey'
import DoorayImage from '../common/DoorayImage'
import { Button, Chip, LoadingView, useToast } from '../common/ds'
import { getWorkflowName } from '../Dooray/taskStyles'

const markdownComponents = {
  img: ({ src, alt }: { src?: string; alt?: string }) => (
    <DoorayImage src={src} alt={alt} className="max-w-full rounded-lg" />
  )
}

interface TaskDetailOverlayProps {
  task: DoorayTask
  onClose: () => void
  /** 활성 터미널에서 이 업무로 claude 를 띄운다 (드래그&드롭과 같은 동작) */
  onRunInTerminal?: () => void
  /** 에이전트에 넣을 프롬프트 — 복사용 */
  promptText: (detail: DoorayTaskDetail | null) => string
}

/**
 * 업무 상세 오버레이 — 화면 오른쪽 절반을 덮고, 본문 옆에 액션 레일과 하단 댓글 입력을 둔다.
 * 좁은 작업 패널로는 두레이 본문(체크리스트·표)이 읽히지 않아 오버레이로 띄운다.
 */
function TaskDetailOverlay({ task, onClose, onRunInTerminal, promptText }: TaskDetailOverlayProps): JSX.Element {
  const toast = useToast()
  const [detail, setDetail] = useState<DoorayTaskDetail | null>(null)
  const [comments, setComments] = useState<DoorayTaskComment[]>([])
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)

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
        /* 본문 실패는 제목만 표시로 degrade */
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

  // Esc 로 닫기 — 오버레이는 모달성이므로 전역 단축키보다 먼저 소비한다
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const copy = async (text: string, label: string): Promise<void> => {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} 복사됨`)
  }

  const submitComment = async (): Promise<void> => {
    const body = comment.trim()
    if (!body) return
    setSending(true)
    try {
      await window.api.dooray.tasks.createComment({ projectId: task.projectId, postId: task.id, content: body })
      setComment('')
      setComments(await window.api.dooray.tasks.comments(task.projectId, task.id).catch(() => comments))
      toast.success('댓글 등록됨')
    } catch (err) {
      toast.error('댓글 등록 실패', err instanceof Error ? err.message : undefined)
    } finally {
      setSending(false)
    }
  }

  const ref = task.projectCode ? `${task.projectCode}/${task.number ?? ''}` : String(task.number ?? '')

  // 앱 루트 밖(body)으로 포털 — 터미널 flex 컨테이너 안에서는 absolute 기준이 어긋나
  // 드로어와 쌓임 순서가 뒤집힌다 (DS Modal 과 동일 전략).
  return createPortal(
    <div className="fixed inset-0 z-[60] flex" role="dialog" aria-modal="true" aria-label={task.subject}>
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="flex-1 bg-black/55 backdrop-blur-[2px] cursor-default"
      />
      <div className="w-[min(1040px,72%)] flex-none flex flex-col min-h-0 bg-bg-surface border-l border-bg-border shadow-2xl">
        <div className="flex items-start gap-3 px-7 pt-6 pb-4 flex-none">
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary">{ref}</div>
            <h2 className="mt-1.5 text-[calc(20px_*_var(--app-font-scale,1))] font-semibold text-text-primary leading-tight">
              {task.subject}
            </h2>
            <div className="flex items-center gap-2 mt-3">
              <Chip tone={task.workflowClass === 'working' ? 'blue' : 'neutral'}>{getWorkflowName(task)}</Chip>
            </div>
          </div>
          {onRunInTerminal && (
            <Button variant="primary" onClick={onRunInTerminal}>
              <TerminalSquare size={14} /> 터미널에서 시작
            </Button>
          )}
          {/* 액션은 아이콘 버튼으로 헤더에 둔다 — 별도 레일을 두면 폭만 잡아먹는다 */}
          <button
            type="button"
            title="업무 번호 복사"
            aria-label="업무 번호 복사"
            onClick={() => void copy(ref || task.id, '업무 번호')}
            className="ds-btn ghost icon"
          >
            <Hash size={15} />
          </button>
          <button
            type="button"
            title="프롬프트 복사"
            aria-label="프롬프트 복사"
            onClick={() => void copy(promptText(detail), '프롬프트')}
            className="ds-btn ghost icon"
          >
            <Copy size={15} />
          </button>
          <a
            href={`https://nhnent.dooray.com/project/posts/${task.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Dooray 에서 열기"
            aria-label="Dooray 에서 열기"
            className="ds-btn ghost icon"
          >
            <ExternalLink size={15} />
          </a>
          <button
            type="button"
            aria-label="상세 닫기"
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary ml-1 mt-1.5"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 overflow-y-auto px-7 pb-6 border-t border-bg-border pt-5">
            <TaskSessionList task={task} />

            {loading ? (
              <LoadingView label="업무 정보를 불러오는 중" />
            ) : detail?.body?.content ? (
              <div className="markdown-body text-[calc(13px_*_var(--app-font-scale,1))]">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownComponents}>
                  {detail.body.content}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-[calc(12px_*_var(--app-font-scale,1))] text-text-tertiary">본문이 없습니다.</p>
            )}

            {comments.length > 0 && (
              <div className="mt-7">
                <div className="text-[calc(10.5px_*_var(--app-font-scale,1))] font-semibold text-text-tertiary uppercase tracking-wide mb-2">
                  댓글 {comments.length}
                </div>
                <div className="flex flex-col gap-2">
                  {comments.map((c) => (
                    <div key={c.id} className="ds-card">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[calc(11px_*_var(--app-font-scale,1))] font-medium text-text-primary">
                          {c.creator?.member?.name ?? '알 수 없음'}
                        </span>
                        {c.createdAt && (
                          <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">
                            {new Date(c.createdAt).toLocaleString('ko-KR', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        )}
                      </div>
                      {/* 두레이 댓글은 text/html 과 마크다운이 섞여 온다 — rehypeRaw 로 둘 다 렌더 */}
                      {c.body?.content && (
                        <div className="markdown-body text-[calc(12.5px_*_var(--app-font-scale,1))] leading-relaxed">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeRaw]}
                            components={markdownComponents}
                          >
                            {c.body.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>

        <div className="flex items-end gap-2 px-7 py-4 border-t border-bg-border flex-none">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="두레이 댓글을 입력하세요..."
            rows={2}
            aria-label="두레이 댓글"
            className="ds-input flex-1 resize-none"
          />
          <Button variant="secondary" onClick={() => void submitComment()} disabled={!comment.trim() || sending}>
            <Send size={13} /> 댓글 달기
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}

/**
 * 이 업무가 폴더별로 쓰던 claude 세션.
 *
 * 업무 하나가 여러 저장소에 걸치는 일이 흔해서(예: 서버와 AI 를 같이 고침) 폴더마다 세션이
 * 따로 생긴다. 어디서 무엇으로 작업했는지 여기서 보고 바로 이어간다.
 */
function TaskSessionList({ task }: { task: DoorayTask }): JSX.Element | null {
  const [links, setLinks] = useState<TaskSessionLink[]>([])

  const load = useCallback(() => {
    void window.api.workspace.taskDrop
      .linked()
      .then((map) => setLinks(map[workspaceKey(task.projectId, task.id)] ?? []))
      .catch(() => setLinks([]))
  }, [task.projectId, task.id])

  useEffect(load, [load])

  if (links.length === 0) return null

  const resume = (link: TaskSessionLink): void => {
    void window.api.workspace.taskDrop.touch(task.projectId, task.id, link.cwd)
    window.dispatchEvent(
      new CustomEvent('create-terminal', {
        detail: { cwd: link.cwd, initialCommand: `claude --resume ${link.claudeSessionId}` }
      })
    )
  }

  const disconnect = async (link: TaskSessionLink): Promise<void> => {
    await window.api.workspace.taskDrop.unlink(task.projectId, task.id, link.cwd)
    load()
    window.dispatchEvent(new CustomEvent('task-session-linked'))
  }

  return (
    <div className="mb-5 rounded-lg border border-bg-border bg-bg-surface-raised p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <TerminalIcon size={12} className="text-brand-terminal flex-none" />
        <span className="text-[calc(11.5px_*_var(--app-font-scale,1))] font-semibold text-text-primary">
          진행 중인 작업
        </span>
        <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">
          {links.length}개 폴더
        </span>
      </div>

      <div className="flex flex-col gap-1">
        {links.map((link) => (
          <div key={link.cwd} className="group flex items-center gap-2 rounded px-1.5 py-1 hover:bg-bg-surface-hover">
            <div className="flex-1 min-w-0">
              <div className="text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-primary truncate">
                {link.repoName ?? link.cwd.split('/').filter(Boolean).pop()}
              </div>
              <div className="text-[calc(9.5px_*_var(--app-font-scale,1))] text-text-tertiary truncate font-mono">
                {link.cwd}
              </div>
            </div>
            <span className="flex-none text-[calc(9.5px_*_var(--app-font-scale,1))] text-text-tertiary">
              {relativeDay(link.lastUsedAt)}
            </span>
            <button
              type="button"
              onClick={() => resume(link)}
              className="ds-btn secondary xs flex-none"
              title={`${link.cwd} 에서 이 세션 이어가기`}
            >
              <Play size={10} /> 이어가기
            </button>
            <button
              type="button"
              onClick={() => void disconnect(link)}
              aria-label={`${link.repoName ?? link.cwd} 세션 연결 해제`}
              title="연결 해제 — 다음부터 새 세션으로 시작합니다"
              className="ds-btn ghost icon flex-none opacity-0 group-hover:opacity-100 focus:opacity-100"
            >
              <Unlink size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 마지막 사용 시각을 사람이 읽는 말로. */
function relativeDay(timestamp: number): string {
  const days = Math.floor((Date.now() - timestamp) / 86_400_000)
  if (days <= 0) return '오늘'
  if (days === 1) return '어제'
  if (days < 30) return `${days}일 전`
  return `${Math.floor(days / 30)}개월 전`
}

export default TaskDetailOverlay
