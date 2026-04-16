import { useState, useEffect } from 'react'
import { X, Sparkles, Play, ExternalLink, Clock, User, MessageCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { DoorayTask, DoorayTaskDetail, DoorayTaskComment } from '../../../../shared/types/dooray'

interface TaskDetailPanelProps {
  task: DoorayTask
  onClose: () => void
  onStartWork?: (task: DoorayTask, summary: string) => void
}

function TaskDetailPanel({ task, onClose, onStartWork }: TaskDetailPanelProps): JSX.Element {
  const [detail, setDetail] = useState<DoorayTaskDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<string | null>(null)
  const [summarizing, setSummarizing] = useState(false)
  const [comments, setComments] = useState<DoorayTaskComment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)

  useEffect(() => {
    const load = async (): Promise<void> => {
      setLoading(true)
      setSummary(null)
      try {
        const d = await window.api.dooray.tasks.detail(task.projectId, task.id)
        setDetail(d)
      } catch (err) {
        console.error('태스크 상세 로드 실패:', err)
      } finally {
        setLoading(false)
      }
    }
    const loadComments = async (): Promise<void> => {
      setLoadingComments(true)
      try {
        const list = await window.api.dooray.tasks.comments(task.projectId, task.id)
        setComments(list)
      } catch { setComments([]) }
      finally { setLoadingComments(false) }
    }
    load()
    loadComments()
  }, [task.id, task.projectId])

  const handleSummarize = async (): Promise<void> => {
    setSummarizing(true)
    try {
      const body = detail?.body?.content || ''
      const result = await window.api.ai.summarizeTask(task, body)
      setSummary(result)
    } catch {
      setSummary('요약 생성에 실패했습니다.')
    } finally {
      setSummarizing(false)
    }
  }

  const bodyContent = detail?.body?.content || ''
  const wfName = task.workflow?.name || task.workflowName || task.workflowClass

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* 헤더 */}
      <div className="flex items-start justify-between p-4 border-b border-bg-border bg-bg-surface flex-shrink-0">
        <div className="flex-1 min-w-0 mr-3">
          <h3 className="text-sm font-semibold text-text-primary leading-snug">{task.subject}</h3>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {task.projectCode && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-clover-blue/10 text-clover-blue font-mono">{task.projectCode}</span>
            )}
            <span className="text-[10px] text-text-secondary">{wfName}</span>
            {task.dueDateAt && (
              <span className="flex items-center gap-0.5 text-[10px] text-text-secondary">
                <Clock size={9} /> {new Date(task.dueDateAt).toLocaleDateString('ko-KR')}
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-bg-surface-hover text-text-secondary flex-shrink-0">
          <X size={16} />
        </button>
      </div>

      {/* 액션 버튼 */}
      <div className="flex gap-2 p-3 border-b border-bg-border flex-shrink-0">
        <button onClick={handleSummarize} disabled={summarizing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-clover-orange/20 to-clover-blue/20 border border-clover-orange/30 text-xs font-medium text-text-primary hover:from-clover-orange/30 hover:to-clover-blue/30 transition-all disabled:opacity-50">
          <Sparkles size={12} className={`text-clover-orange ${summarizing ? 'animate-pulse' : ''}`} />
          {summarizing ? 'AI 분석 중...' : 'AI 분석'}
        </button>
        <a href={`https://nhnent.dooray.com/project/posts/${task.id}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-clover-blue/10 border border-clover-blue/30 text-xs text-clover-blue hover:bg-clover-blue/20 transition-all">
          <ExternalLink size={12} /> 두레이에서 보기
        </a>
      </div>

      {/* AI 요약 */}
      {summary && (
        <div className="mx-3 mt-3 p-3 rounded-lg bg-gradient-to-r from-clover-orange/5 to-clover-blue/5 border border-clover-orange/20 flex-shrink-0">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles size={12} className="text-clover-orange" />
            <span className="text-[11px] font-semibold text-clover-orange">AI 분석</span>
          </div>
          <div className="text-xs text-text-primary leading-relaxed markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{summary}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-text-secondary text-sm">로딩 중...</div>
        ) : bodyContent ? (
          <div className="markdown-body text-xs leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{bodyContent}</ReactMarkdown>
          </div>
        ) : (
          <div className="text-text-secondary text-sm text-center py-8">태스크 본문이 비어있습니다.</div>
        )}

        {/* 담당자 */}
        {detail?.users?.to && detail.users.to.length > 0 && (
          <div className="mt-4 pt-4 border-t border-bg-border">
            <h4 className="text-[11px] font-semibold text-text-secondary mb-2 flex items-center gap-1">
              <User size={11} /> 담당자
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {detail.users.to.map((u) => (
                <span key={u.member.id} className="text-[10px] px-2 py-0.5 rounded-full bg-bg-surface border border-bg-border text-text-primary">
                  {u.member.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 댓글 */}
        {comments.length > 0 && (
          <div className="mt-4 pt-4 border-t border-bg-border">
            <h4 className="text-[11px] font-semibold text-text-secondary mb-3 flex items-center gap-1">
              <MessageCircle size={11} /> 댓글 {comments.length}
            </h4>
            <div className="space-y-3">
              {comments.map((c) => (
                <div key={c.id} className="bg-bg-surface rounded-lg p-3 border border-bg-border">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-semibold text-text-primary">
                      {c.creator?.member?.name || '알 수 없음'}
                    </span>
                    {c.createdAt && (
                      <span className="text-[9px] text-text-tertiary">
                        {new Date(c.createdAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  {c.body?.content && (
                    <div className="markdown-body text-xs leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{c.body.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {loadingComments && (
          <div className="mt-4 text-[10px] text-text-tertiary text-center">댓글 로딩 중...</div>
        )}
      </div>
    </div>
  )
}

export default TaskDetailPanel
