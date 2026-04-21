import { useState, useEffect } from 'react'
import { X, Sparkles, Play, ExternalLink, Clock, User, MessageCircle, GitPullRequest, Loader2, Check, AlertCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import DoorayImage, { DoorayFileContext } from '../common/DoorayImage'
import type { DoorayTask, DoorayTaskDetail, DoorayTaskComment } from '../../../../shared/types/dooray'

// ReactMarkdown img 컴포넌트 override — 두레이 인증 필요 이미지 처리
const markdownComponents = {
  img: ({ src, alt }: { src?: string; alt?: string }) => <DoorayImage src={src} alt={alt} className="max-w-full rounded-lg" />
}

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

  // AI 코드리뷰 → 코멘트 상태
  const [reviewing, setReviewing] = useState(false)
  const [reviewPreview, setReviewPreview] = useState<string | null>(null)
  const [reviewRepoPath, setReviewRepoPath] = useState<string>('')
  const [posting, setPosting] = useState(false)
  const [reviewStatus, setReviewStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

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

  /** AI 코드리뷰 → 태스크 코멘트 초안 생성 */
  const handleCodeReview = async (): Promise<void> => {
    setReviewStatus(null)
    setReviewPreview(null)
    let path = reviewRepoPath
    if (!path) {
      const selected = await window.api.dialog.selectFolder()
      if (!selected) return
      path = selected
      setReviewRepoPath(selected)
    }
    setReviewing(true)
    try {
      const isRepo = await window.api.git.isRepo(path)
      if (!isRepo) throw new Error('선택한 폴더는 Git 저장소가 아닙니다')
      const diff = await window.api.git.diff(path)
      if (!diff.patch || diff.patch.trim().length === 0) {
        throw new Error('변경사항이 없습니다. 리뷰할 diff가 비어있습니다.')
      }
      const trimmed = diff.patch.substring(0, 20000)
      const prompt = `다음 git diff를 코드 리뷰하세요. 두레이 태스크 "${task.subject}"에 대한 변경사항입니다.

[변경 파일]
${diff.files.map((f) => `- ${f.status} ${f.file} (+${f.additions}/-${f.deletions})`).join('\n')}

[diff]
\`\`\`diff
${trimmed}
\`\`\`

리뷰 지침:
- 마크다운으로 작성, 두레이 태스크에 그대로 코멘트로 붙여넣을 수 있도록
- 섹션: ## 요약 / ## 잘된 점 / ## 개선 제안 / ## 버그·리스크
- 구체적인 파일:라인 언급, 짧고 실행 가능한 제안 위주
- 없는 섹션은 생략`

      const result = await window.api.ai.ask({ prompt, feature: 'wikiProofread' })
      setReviewPreview(result)
    } catch (err) {
      setReviewStatus({ type: 'err', text: err instanceof Error ? err.message : '코드리뷰 실패' })
    } finally {
      setReviewing(false)
    }
  }

  const postReviewAsComment = async (): Promise<void> => {
    if (!reviewPreview) return
    setPosting(true); setReviewStatus(null)
    try {
      await window.api.dooray.tasks.createComment({
        projectId: task.projectId,
        postId: task.id,
        content: reviewPreview
      })
      setReviewStatus({ type: 'ok', text: '두레이 태스크에 코멘트가 작성되었습니다' })
      setReviewPreview(null)
      // 댓글 목록 새로고침
      try {
        const list = await window.api.dooray.tasks.comments(task.projectId, task.id)
        setComments(list)
      } catch { /* ok */ }
    } catch (err) {
      setReviewStatus({ type: 'err', text: err instanceof Error ? err.message : '코멘트 작성 실패' })
    } finally {
      setPosting(false)
    }
  }

  const bodyContent = detail?.body?.content || ''
  const wfName = task.workflow?.name || task.workflowName || task.workflowClass

  return (
    <DoorayFileContext.Provider value={{ projectId: task.projectId, postId: task.id }}>
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
      <div className="flex gap-2 p-3 border-b border-bg-border flex-shrink-0 flex-wrap">
        <button onClick={handleSummarize} disabled={summarizing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-clover-orange/20 to-clover-blue/20 border border-clover-orange/30 text-xs font-medium text-text-primary hover:from-clover-orange/30 hover:to-clover-blue/30 transition-all disabled:opacity-50">
          <Sparkles size={12} className={`text-clover-orange ${summarizing ? 'animate-pulse' : ''}`} />
          {summarizing ? 'AI 분석 중...' : 'AI 분석'}
        </button>
        <button onClick={handleCodeReview} disabled={reviewing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-all disabled:opacity-50"
          title="현재 작업 중인 git 저장소의 diff를 AI가 리뷰하여 두레이 코멘트 초안을 만듭니다">
          {reviewing ? <Loader2 size={12} className="animate-spin" /> : <GitPullRequest size={12} />}
          {reviewing ? '리뷰 중...' : 'AI 코드리뷰'}
        </button>
        <a href={`https://nhnent.dooray.com/project/posts/${task.id}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-clover-blue/10 border border-clover-blue/30 text-xs text-clover-blue hover:bg-clover-blue/20 transition-all">
          <ExternalLink size={12} /> 두레이에서 보기
        </a>
      </div>

      {/* AI 코드리뷰 미리보기 */}
      {reviewPreview && (
        <div className="mx-3 mt-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/30 flex-shrink-0 max-h-[40vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-2 sticky top-0 bg-bg-primary/80 backdrop-blur-sm py-1">
            <div className="flex items-center gap-1.5">
              <GitPullRequest size={12} className="text-emerald-400" />
              <span className="text-[11px] font-semibold text-emerald-400">AI 코드리뷰 코멘트 미리보기</span>
              <span className="text-[9px] text-text-tertiary">{reviewRepoPath}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={postReviewAsComment} disabled={posting}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50">
                {posting ? <Loader2 size={9} className="animate-spin" /> : <MessageCircle size={9} />}
                {posting ? '게시 중...' : '코멘트로 게시'}
              </button>
              <button onClick={() => setReviewPreview(null)} className="text-text-tertiary hover:text-text-secondary">
                <X size={11} />
              </button>
            </div>
          </div>
          <div className="markdown-body text-xs leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownComponents}>{reviewPreview}</ReactMarkdown>
          </div>
        </div>
      )}
      {reviewStatus && (
        <div className={`mx-3 mt-2 flex items-center gap-1.5 px-3 py-2 rounded-md text-[11px] ${
          reviewStatus.type === 'ok' ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/30'
            : 'bg-red-500/10 text-red-400 border border-red-500/30'
        }`}>
          {reviewStatus.type === 'ok' ? <Check size={11} /> : <AlertCircle size={11} />}
          {reviewStatus.text}
        </div>
      )}

      {/* AI 요약 */}
      {summary && (
        <div className="mx-3 mt-3 p-3 rounded-lg bg-gradient-to-r from-clover-orange/5 to-clover-blue/5 border border-clover-orange/20 flex-shrink-0">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles size={12} className="text-clover-orange" />
            <span className="text-[11px] font-semibold text-clover-orange">AI 분석</span>
          </div>
          <div className="text-xs text-text-primary leading-relaxed markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownComponents}>{summary}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-text-secondary text-sm">로딩 중...</div>
        ) : bodyContent ? (
          <div className="markdown-body text-xs leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownComponents}>{bodyContent}</ReactMarkdown>
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
              {detail.users.to.map((u, i) => {
                const name = u?.member?.name || u?.emailUser?.emailAddress || '알 수 없음'
                const key = u?.member?.id || u?.emailUser?.emailAddress || `user-${i}`
                return (
                  <span key={key} className="text-[10px] px-2 py-0.5 rounded-full bg-bg-surface border border-bg-border text-text-primary">
                    {name}
                  </span>
                )
              })}
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
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownComponents}>{c.body.content}</ReactMarkdown>
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
    </DoorayFileContext.Provider>
  )
}

export default TaskDetailPanel
