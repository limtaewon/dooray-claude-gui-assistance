import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  MessageSquare, Plus, RefreshCw, Search, Clock, User, ChevronLeft, Send, Loader2, Users, X,
  Image as ImageIcon, Sparkles, Eye, Edit3, Trash2, Hash, ArrowUp
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { DoorayTask, DoorayTaskDetail, DoorayTaskComment } from '../../../../shared/types/dooray'
import DoorayImage, { DoorayFileContext } from '../common/DoorayImage'
import { LoadingView, ErrorView, EmptyView } from '../common/StateViews'

/** Clauday 커뮤니티 프로젝트 (공개 프로젝트) */
const COMMUNITY_PROJECT_ID = '4312559241344624232'

const markdownComponents = {
  img: ({ src, alt }: { src?: string; alt?: string }) => <DoorayImage src={src} alt={alt} className="max-w-full rounded-lg" />
}

/** 첨부 이미지 임시 저장 (게시 시 업로드 예정) */
interface PendingImage {
  tmpId: string
  filename: string
  mime: string
  file: File
  dataUrl: string // 미리보기용
}

/** 본문에 박히는 플레이스홀더 포맷 */
const IMG_PLACEHOLDER = (tmpId: string, filename: string): string => `![${filename}](clauday-tmp://${tmpId})`
const IMG_PLACEHOLDER_REGEX = /!\[([^\]]*)\]\(clauday-tmp:\/\/([^)]+)\)/g

/** 이름에서 이니셜 추출 */
function getInitials(name: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

/** 이름 기반 결정론적 색상 — rgba tint로 라이트/다크 모두 대응 */
const AVATAR_COLORS = [
  { bg: 'rgba(59,130,246,0.15)', text: '#2563eb', ring: '#3b82f6' },
  { bg: 'rgba(239,68,68,0.15)',  text: '#dc2626', ring: '#ef4444' },
  { bg: 'rgba(34,197,94,0.15)',  text: '#16a34a', ring: '#22c55e' },
  { bg: 'rgba(245,158,11,0.15)', text: '#d97706', ring: '#f59e0b' },
  { bg: 'rgba(168,85,247,0.15)', text: '#9333ea', ring: '#a855f7' },
  { bg: 'rgba(6,182,212,0.15)',  text: '#0891b2', ring: '#06b6d4' },
  { bg: 'rgba(249,115,22,0.15)', text: '#ea580c', ring: '#f97316' },
  { bg: 'rgba(132,204,22,0.15)', text: '#65a30d', ring: '#84cc16' }
]

function avatarColor(name: string): { bg: string; text: string; ring: string } {
  if (!name) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function CommunityView({ active = true }: { active?: boolean } = {}): JSX.Element {
  const [posts, setPosts] = useState<DoorayTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<DoorayTask | null>(null)
  const [writing, setWriting] = useState(false)
  const [myMemberId, setMyMemberId] = useState<string | null>(null)

  // 본인 memberId는 컴포넌트 mount 시 1회 캐시 (작성자 본인 검증용)
  useEffect(() => {
    void window.api.dooray.myMemberId().then(setMyMemberId).catch(() => setMyMemberId(null))
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await window.api.community.posts(COMMUNITY_PROJECT_ID, 0, 50)
      setPosts(res.posts)
    } catch (err) {
      setError(err instanceof Error ? err.message : '게시글 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDeletePost = useCallback(async (post: DoorayTask): Promise<void> => {
    if (!window.confirm(`"${post.subject}" 글을 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return
    try {
      await window.api.dooray.tasks.delete({
        projectId: COMMUNITY_PROJECT_ID,
        postId: post.id
      })
      // 목록에서 제거
      setPosts((prev) => prev.filter((p) => p.id !== post.id))
      // 상세화면이 그 글이면 닫기
      if (selected?.id === post.id) setSelected(null)
    } catch (err) {
      alert(`삭제 실패: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [selected])

  // App에서 visibility만 토글하기 때문에 컴포넌트가 unmount 되지 않는다.
  // 탭에 진입할 때마다(=active가 false→true로 전환될 때) 항상 새 글을 로드한다.
  const wasActiveRef = useRef(active)
  useEffect(() => {
    if (active && !wasActiveRef.current) {
      load()
    }
    wasActiveRef.current = active
  }, [active, load])

  // 첫 mount 시 1회 로드
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    if (!search) return posts
    const q = search.toLowerCase()
    return posts.filter((p) => p.subject.toLowerCase().includes(q) || String(p.id).includes(q))
  }, [posts, search])

  if (selected) {
    return (
      <DoorayFileContext.Provider value={{ projectId: COMMUNITY_PROJECT_ID, postId: selected.id }}>
        <PostDetail
          post={selected}
          onBack={() => setSelected(null)}
          onRefresh={load}
          myMemberId={myMemberId}
          onDeletePost={() => handleDeletePost(selected)}
        />
      </DoorayFileContext.Provider>
    )
  }

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-bg-border flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-clover-blue/10 border border-clover-blue/30">
              <Users size={14} className="text-clover-blue" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text-primary leading-tight">커뮤니티</h2>
              <p className="text-[10px] text-text-tertiary leading-tight">Clauday 사용자 모임</p>
            </div>
            {!loading && posts.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)', border: '1px solid rgba(59,130,246,0.3)' }}>
                {posts.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setWriting(true)}
              className="ds-btn ai sm">
              <Plus size={13} />
              새 글 쓰기
            </button>
            <button onClick={load} disabled={loading}
              className="ds-btn sm primary">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              새로고침
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="제목으로 검색..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs text-text-primary placeholder-text-tertiary focus:outline-none transition-colors"
            style={{
              background: 'var(--bg-surface)',
              border: search ? '1px solid var(--accent-blue)' : '1px solid var(--bg-border)'
            }}
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary">
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Post list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <LoadingView message="게시글 불러오는 중..." />
        ) : error ? (
          <ErrorView message={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyView
            icon={MessageSquare}
            title={search ? '검색 결과가 없습니다' : '아직 글이 없습니다'}
            description={search ? '다른 키워드로 검색해보세요' : '첫 글을 작성해보세요!'}
            actionLabel={search ? undefined : '새 글 쓰기'}
            onAction={search ? undefined : () => setWriting(true)}
          />
        ) : (
          <div className="p-4 space-y-2">
            {filtered.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                onSelect={() => setSelected(p)}
                myMemberId={myMemberId}
                onDelete={() => handleDeletePost(p)}
              />
            ))}
          </div>
        )}
      </div>

      {writing && (
        <WriteModal onClose={() => setWriting(false)} onPosted={() => { setWriting(false); load() }} />
      )}
    </div>
  )
}

function PostCard({
  post,
  onSelect,
  myMemberId,
  onDelete
}: {
  post: DoorayTask
  onSelect: () => void
  myMemberId: string | null
  onDelete: () => void
}): JSX.Element {
  const timeAgo = formatTimeAgo(post.createdAt)
  const preview = extractPreview((post as DoorayTask & { body?: { content?: string } }).body?.content || '')
  const authorMemberId = (post as DoorayTask & { users?: { from?: { member?: { organizationMemberId?: string } } } })
    .users?.from?.member?.organizationMemberId
  const authorName = (post as DoorayTask & { users?: { from?: { member?: { name?: string } } } }).users?.from?.member?.name || ''
  const colors = avatarColor(authorName)
  const initials = getInitials(authorName)
  const isMine = !!myMemberId && !!authorMemberId && myMemberId === authorMemberId

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      className="relative w-full text-left px-4 py-3 rounded-xl transition-all group hover:-translate-y-0.5 cursor-pointer"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--bg-border)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent-blue)'
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(59,130,246,0.15)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--bg-border)'
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)'
      }}
    >
      {isMine && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title="삭제"
          aria-label="글 삭제"
          className="absolute right-2 top-2 z-10 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/15 text-text-tertiary hover:text-red-400"
        >
          <Trash2 size={12} />
        </button>
      )}
      <div className="flex gap-3">
        {/* Left: Dooray task number */}
        <div className="flex-shrink-0 flex flex-col items-center pt-0.5">
          <div className="min-w-7 h-6 px-1.5 rounded-md flex items-center justify-center text-[11px] font-bold text-clover-blue group-hover:bg-clover-blue group-hover:text-white transition-colors"
            style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}>
            {post.number ?? '·'}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary group-hover:text-clover-blue transition-colors leading-snug pr-2">
            {post.subject}
          </p>
          {preview && (
            <p className="text-[11px] text-text-tertiary mt-1 line-clamp-2 leading-relaxed">
              {preview}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2">
            {/* Author chip */}
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0"
                style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.ring}40` }}>
                {initials}
              </span>
              {authorName && (
                <span className="text-[10px] text-text-secondary font-medium">{authorName}</span>
              )}
            </div>
            <span className="text-text-tertiary text-[10px]">·</span>
            <span className="flex items-center gap-1 text-[10px] text-text-tertiary">
              <Clock size={9} />
              {timeAgo}
            </span>
            <div className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium"
              style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--bg-border)' }}>
              <MessageSquare size={8} />
              <span>댓글</span>
            </div>
          </div>
        </div>

        {/* Right arrow hint */}
        <div className="flex-shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">
          <ChevronLeft size={14} className="rotate-180 text-clover-blue" />
        </div>
      </div>
    </div>
  )
}

/** 상세 화면 */
function PostDetail({
  post,
  onBack,
  myMemberId,
  onDeletePost
}: {
  post: DoorayTask
  onBack: () => void
  onRefresh: () => void
  myMemberId: string | null
  onDeletePost: () => void
}): JSX.Element {
  const [detail, setDetail] = useState<DoorayTaskDetail | null>(null)
  const [comments, setComments] = useState<DoorayTaskComment[]>([])
  const [loadingDetail, setLoadingDetail] = useState(true)
  const [loadingComments, setLoadingComments] = useState(true)

  const loadAll = useCallback(async () => {
    setLoadingDetail(true); setLoadingComments(true)
    try {
      const [d, c] = await Promise.all([
        window.api.dooray.tasks.detail(COMMUNITY_PROJECT_ID, post.id),
        window.api.dooray.tasks.comments(COMMUNITY_PROJECT_ID, post.id)
      ])
      setDetail(d); setComments(c)
    } catch { /* ok */ }
    finally { setLoadingDetail(false); setLoadingComments(false) }
  }, [post.id])

  useEffect(() => { loadAll() }, [loadAll])

  const refreshComments = async (): Promise<void> => {
    setLoadingComments(true)
    try { setComments(await window.api.dooray.tasks.comments(COMMUNITY_PROJECT_ID, post.id)) }
    finally { setLoadingComments(false) }
  }

  const handleDeleteComment = async (comment: DoorayTaskComment): Promise<void> => {
    if (!window.confirm('이 댓글을 삭제하시겠습니까?')) return
    try {
      await window.api.dooray.tasks.deleteComment({
        projectId: COMMUNITY_PROJECT_ID,
        postId: post.id,
        logId: comment.id
      })
      setComments((prev) => prev.filter((c) => c.id !== comment.id))
    } catch (err) {
      alert(`댓글 삭제 실패: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const body = detail?.body?.content || ''
  // 글 작성자 ID — community post는 users.from.member.organizationMemberId
  const postAuthorMemberId = ((detail || post) as DoorayTask & { users?: { from?: { member?: { organizationMemberId?: string } } } })
    .users?.from?.member?.organizationMemberId
  const isMyPost = !!myMemberId && !!postAuthorMemberId && myMemberId === postAuthorMemberId
  const authorName = detail?.users?.to?.[0]?.member?.name || ''
  const authorColors = avatarColor(authorName)
  const authorInitials = getInitials(authorName)

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Nav header */}
      <div className="px-4 py-2.5 border-b border-bg-border flex items-center gap-3 flex-shrink-0"
        style={{ background: 'var(--bg-primary)' }}>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-all text-xs font-medium"
        >
          <ChevronLeft size={13} />
          <span>목록</span>
        </button>
        <div className="w-px h-4 bg-bg-border" />
        <div className="flex-1 min-w-0">
          <h2 className="text-xs font-semibold text-text-secondary truncate">{post.subject}</h2>
        </div>
        <span className="text-[10px] text-text-tertiary flex-shrink-0">{formatTimeAgo(post.createdAt)}</span>
        {isMyPost && (
          <button
            onClick={onDeletePost}
            title="글 삭제"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={11} />
            글 삭제
          </button>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-5 pb-2">

          {/* Post body card */}
          {loadingDetail ? (
            <LoadingView message="게시글 로딩 중..." />
          ) : (
            <div className="rounded-xl overflow-hidden mb-5"
              style={{ border: '1px solid var(--bg-border)', background: 'var(--bg-surface)' }}>
              {/* Author strip */}
              <div className="px-4 py-3 flex items-center gap-2.5"
                style={{ borderBottom: '1px solid var(--bg-border)', background: 'var(--bg-primary)' }}>
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                  style={{ background: authorColors.bg, color: authorColors.text, border: `1.5px solid ${authorColors.ring}60` }}>
                  {authorInitials}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-text-primary">{authorName || '알 수 없음'}</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Clock size={9} className="text-text-tertiary" />
                    <span className="text-[9px] text-text-tertiary">{formatTimeAgo(post.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium"
                  style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)', border: '1px solid rgba(59,130,246,0.25)' }}>
                  <Hash size={9} />
                  커뮤니티
                </div>
              </div>

              {/* Title */}
              <div className="px-4 pt-4 pb-2">
                <h1 className="text-base font-bold text-text-primary leading-snug">{post.subject}</h1>
              </div>

              {/* Body */}
              <div className="px-4 pb-4">
                {body ? (
                  <div className="markdown-body text-sm leading-relaxed text-text-secondary">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw]}
                      components={markdownComponents}
                    >
                      {body}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-xs text-text-tertiary italic">(본문 없음)</p>
                )}
              </div>
            </div>
          )}

          {/* Comments section header */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1.5">
              <MessageSquare size={13} className="text-clover-blue" />
              <span className="text-xs font-bold text-text-primary">댓글</span>
              {comments.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                  style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)' }}>
                  {comments.length}
                </span>
              )}
            </div>
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, #3a4566 0%, transparent 100%)' }} />
          </div>

          {/* Comments thread */}
          {loadingComments ? (
            <LoadingView message="댓글 로딩 중..." />
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)' }}>
                <MessageSquare size={16} className="text-text-tertiary" />
              </div>
              <p className="text-xs text-text-tertiary">첫 댓글을 남겨보세요</p>
            </div>
          ) : (
            <div className="space-y-2 mb-4">
              {comments.map((c, idx) => {
                const commenterName = c.creator?.member?.name || '알 수 없음'
                const commenterColors = avatarColor(commenterName)
                const commenterInitials = getInitials(commenterName)
                const commenterMemberId = c.creator?.member?.id
                const isMyComment = !!myMemberId && !!commenterMemberId && myMemberId === commenterMemberId
                return (
                  <div key={c.id} className="flex gap-2.5 group">
                    {/* Thread line */}
                    <div className="flex flex-col items-center flex-shrink-0">
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
                        style={{ background: commenterColors.bg, color: commenterColors.text, border: `1.5px solid ${commenterColors.ring}50` }}>
                        {commenterInitials}
                      </span>
                      {idx < comments.length - 1 && (
                        <div className="w-px flex-1 mt-1" style={{ background: 'var(--bg-border)', minHeight: '12px' }} />
                      )}
                    </div>
                    {/* Comment bubble */}
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)' }}>
                        <div className="px-3 py-2 flex items-center gap-2"
                          style={{ borderBottom: c.body?.content ? '1px solid var(--bg-border)' : 'none', background: 'var(--bg-primary)' }}>
                          <span className="text-[11px] font-semibold text-text-primary">{commenterName}</span>
                          {c.createdAt && (
                            <span className="text-[9px] text-text-tertiary ml-auto">{formatTimeAgo(c.createdAt)}</span>
                          )}
                          {isMyComment && (
                            <button
                              onClick={() => handleDeleteComment(c)}
                              title="댓글 삭제"
                              aria-label="댓글 삭제"
                              className="opacity-0 group-hover:opacity-100 p-1 rounded text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 size={10} />
                            </button>
                          )}
                        </div>
                        {c.body?.content && (
                          <div className="px-3 py-2.5 markdown-body text-xs leading-relaxed text-text-secondary">
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
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Sticky composer */}
        <div className="px-4 pb-4">
          <CommentComposer postId={post.id} onPosted={refreshComments} />
        </div>
      </div>
    </div>
  )
}

/** 댓글 작성 (이미지 붙여넣기 + 미리보기 + AI 개선) */
function CommentComposer({ postId, onPosted }: { postId: string; onPosted: () => void }): JSX.Element {
  const [text, setText] = useState('')
  const [images, setImages] = useState<PendingImage[]>([])
  const [posting, setPosting] = useState(false)
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [focused, setFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const addImage = (file: File): void => {
    const reader = new FileReader()
    reader.onload = (): void => {
      const tmpId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const image: PendingImage = {
        tmpId,
        filename: file.name || `image-${Date.now()}.png`,
        mime: file.type || 'image/png',
        file,
        dataUrl: String(reader.result)
      }
      setImages((prev) => [...prev, image])
      setText((prev) => prev + (prev && !prev.endsWith('\n') ? '\n' : '') + IMG_PLACEHOLDER(tmpId, image.filename) + '\n')
    }
    reader.readAsDataURL(file)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) { addImage(file); e.preventDefault() }
      }
    }
  }

  const submit = async (): Promise<void> => {
    if (!text.trim() || posting) return
    setPosting(true)
    try {
      const created = await window.api.dooray.tasks.createComment({
        projectId: COMMUNITY_PROJECT_ID, postId, content: text
      })
      if (images.length > 0) {
        const uploadedMap = new Map<string, string>()
        for (const img of images) {
          if (!text.includes(img.tmpId)) continue
          try {
            const buf = await img.file.arrayBuffer()
            const up = await window.api.dooray.tasks.uploadFile({
              projectId: COMMUNITY_PROJECT_ID, postId, filename: img.filename, mime: img.mime, data: buf
            })
            uploadedMap.set(img.tmpId, up.id)
          } catch (err) {
            console.warn('이미지 업로드 실패', err)
          }
        }
        const newContent = text.replace(IMG_PLACEHOLDER_REGEX, (match, alt, tmpId) => {
          const fileId = uploadedMap.get(tmpId)
          return fileId ? `![${alt}](/files/${fileId})` : match
        })
        if (newContent !== text) {
          await window.api.dooray.tasks.updateComment({
            projectId: COMMUNITY_PROJECT_ID, postId, logId: created.id, content: newContent
          })
        }
      }
      setText(''); setImages([]); setTab('write')
      onPosted()
    } catch (err) {
      alert(`댓글 작성 실패: ${err instanceof Error ? err.message : ''}`)
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="rounded-xl overflow-hidden transition-all"
      style={{
        border: focused ? '1px solid var(--accent-blue)' : '1px solid var(--bg-border)',
        background: 'var(--bg-surface)',
        boxShadow: focused ? '0 0 0 3px rgba(59,130,246,0.08)' : 'none'
      }}>
      {/* Tab bar */}
      <div className="flex items-center px-3 pt-2.5 gap-1">
        <button
          onClick={() => setTab('write')}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all"
          style={tab === 'write'
            ? { background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)', border: '1px solid rgba(59,130,246,0.3)' }
            : { color: 'var(--text-secondary)', border: '1px solid transparent' }
          }
        >
          <Edit3 size={10} />
          쓰기
        </button>
        <button
          onClick={() => setTab('preview')}
          disabled={!text.trim()}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all disabled:opacity-40"
          style={tab === 'preview'
            ? { background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)', border: '1px solid rgba(59,130,246,0.3)' }
            : { color: 'var(--text-secondary)', border: '1px solid transparent' }
          }
        >
          <Eye size={10} />
          미리보기
        </button>
        <label
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors"
          style={{ color: 'var(--text-secondary)', border: '1px solid transparent' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#f9fafb'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-border)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        >
          <ImageIcon size={10} />
          이미지
          <input type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { Array.from(e.target.files || []).forEach(addImage); e.target.value = '' }} />
        </label>
      </div>

      {/* Editor / Preview */}
      <div className="px-3 pt-1 pb-2">
        {tab === 'write' ? (
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={handlePaste}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) submit() }}
            placeholder="댓글을 작성하세요... (이미지 붙여넣기 / ⌘+Enter 전송)"
            rows={3}
            className="w-full bg-transparent text-xs text-text-primary placeholder-text-tertiary focus:outline-none resize-y leading-relaxed"
          />
        ) : (
          <div className="min-h-[72px] text-xs markdown-body leading-relaxed text-text-secondary">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={{ img: ({ src, alt }) => <PreviewImage src={src} alt={alt} images={images} /> }}
            >
              {text}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {/* Image chips */}
      {images.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
          {images.map((img) => (
            <div key={img.tmpId}
              className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg text-[10px] text-text-secondary"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--bg-border)' }}>
              <img src={img.dataUrl} alt="" className="w-5 h-5 object-cover rounded" />
              <span className="max-w-[100px] truncate">{img.filename}</span>
              <button
                onClick={() => setImages((p) => p.filter((i) => i.tmpId !== img.tmpId))}
                className="text-text-tertiary hover:text-red-400 ml-0.5 transition-colors"
              >
                <X size={9} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Actions footer */}
      <div className="flex items-center justify-between px-3 py-2"
        style={{ borderTop: '1px solid var(--bg-border)' }}>
        <p className="text-[9px] text-text-tertiary">⌘+Enter로 전송</p>
        <button
          onClick={submit}
          disabled={!text.trim() || posting}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-white text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-40 active:scale-95"
          style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', boxShadow: text.trim() ? '0 2px 8px rgba(59,130,246,0.3)' : 'none' }}
        >
          {posting ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
          {posting ? '작성 중...' : '댓글 작성'}
        </button>
      </div>
    </div>
  )
}

/** 미리보기에서 플레이스홀더를 임시 dataUrl로 치환 */
function PreviewImage({ src, alt, images }: { src?: string; alt?: string; images: PendingImage[] }): JSX.Element | null {
  if (!src) return null
  if (src.startsWith('clauday-tmp://')) {
    const tmpId = src.replace('clauday-tmp://', '')
    const img = images.find((i) => i.tmpId === tmpId)
    if (img) return <img src={img.dataUrl} alt={alt || ''} className="max-w-full rounded-lg" />
    return null
  }
  return <DoorayImage src={src} alt={alt} className="max-w-full rounded-lg" />
}

/** 글쓰기 모달 */
function WriteModal({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }): JSX.Element {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [images, setImages] = useState<PendingImage[]>([])
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [aiLoading, setAiLoading] = useState(false)

  const addImage = (file: File): void => {
    const reader = new FileReader()
    reader.onload = (): void => {
      const tmpId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const image: PendingImage = {
        tmpId, filename: file.name || `image-${Date.now()}.png`, mime: file.type || 'image/png', file,
        dataUrl: String(reader.result)
      }
      setImages((prev) => [...prev, image])
      setBody((prev) => prev + (prev && !prev.endsWith('\n') ? '\n\n' : '') + IMG_PLACEHOLDER(tmpId, image.filename) + '\n')
    }
    reader.readAsDataURL(file)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) { addImage(file); e.preventDefault() }
      }
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>): void => {
    e.preventDefault()
    Array.from(e.dataTransfer.files).forEach((f) => {
      if (f.type.startsWith('image/')) addImage(f)
    })
  }

  const aiImprove = async (): Promise<void> => {
    if (!body.trim() && !subject.trim()) return
    setAiLoading(true); setError(null)
    try {
      const prompt = `다음 커뮤니티 글을 개선해줘. 제목은 유지하되 본문을 더 명확하고 가독성 좋게 다듬어줘.

[제목]
${subject || '(미정)'}

[본문]
${body || '(빈 내용. 제목을 보고 초안을 작성해줘.)'}

규칙:
- 마크다운 유지
- 이미지 플레이스홀더 ![...](clauday-tmp://...)는 그대로 유지
- 결과 본문만 출력 (설명 없이)`
      const improved = await window.api.ai.ask({ prompt, feature: 'wikiImprove' })
      setBody(improved)
      setTab('preview')
    } catch (err) {
      setError(`AI 개선 실패: ${err instanceof Error ? err.message : ''}`)
    } finally {
      setAiLoading(false)
    }
  }

  const submit = async (): Promise<void> => {
    if (!subject.trim() || !body.trim() || posting) return
    setPosting(true); setError(null)
    try {
      const created = await window.api.dooray.tasks.create({
        projectId: COMMUNITY_PROJECT_ID, subject: subject.trim(), body: body
      })
      if (images.length > 0) {
        const uploadedMap = new Map<string, string>()
        for (const img of images) {
          if (!body.includes(img.tmpId)) continue
          try {
            const buf = await img.file.arrayBuffer()
            const up = await window.api.dooray.tasks.uploadFile({
              projectId: COMMUNITY_PROJECT_ID, postId: created.id, filename: img.filename, mime: img.mime, data: buf
            })
            uploadedMap.set(img.tmpId, up.id)
          } catch (err) {
            console.warn('이미지 업로드 실패', err)
          }
        }
        const newBody = body.replace(IMG_PLACEHOLDER_REGEX, (match, alt, tmpId) => {
          const fileId = uploadedMap.get(tmpId)
          return fileId ? `![${alt}](/files/${fileId})` : match
        })
        if (newBody !== body) {
          await window.api.dooray.tasks.updateBody({
            projectId: COMMUNITY_PROJECT_ID, postId: created.id, subject: subject.trim(), body: newBody
          })
        }
      }
      onPosted()
    } catch (err) {
      setError(err instanceof Error ? err.message : '작성 실패')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: '1px solid var(--bg-border)', background: 'var(--bg-primary)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-clover-orange/15 border border-clover-orange/30">
              <Plus size={13} className="text-clover-orange" />
            </div>
            <h3 className="text-sm font-bold text-text-primary">새 글 쓰기</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full text-text-tertiary"
              style={{ background: 'var(--bg-border)' }}>
              커뮤니티
            </span>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-surface transition-all">
            <X size={14} />
          </button>
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-y-auto">
          {/* Subject input */}
          <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--bg-border)' }}>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="제목을 입력하세요..."
              autoFocus
              className="w-full bg-transparent text-base font-bold text-text-primary placeholder-text-tertiary focus:outline-none leading-snug"
            />
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-1.5 px-5 py-2"
            style={{ borderBottom: '1px solid var(--bg-border)', background: 'var(--bg-primary)' }}>
            {/* Write / Preview tabs */}
            <button
              onClick={() => setTab('write')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
              style={tab === 'write'
                ? { background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)', border: '1px solid rgba(59,130,246,0.4)' }
                : { color: 'var(--text-secondary)', border: '1px solid var(--bg-border)' }
              }
            >
              <Edit3 size={11} />
              쓰기
            </button>
            <button
              onClick={() => setTab('preview')}
              disabled={!body.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-40"
              style={tab === 'preview'
                ? { background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)', border: '1px solid rgba(59,130,246,0.4)' }
                : { color: 'var(--text-secondary)', border: '1px solid var(--bg-border)' }
              }
            >
              <Eye size={11} />
              미리보기
            </button>

            <div className="flex items-center gap-1.5 ml-auto">
              {/* AI improve button — attention-grabbing */}
              <button
                onClick={aiImprove}
                disabled={aiLoading || (!subject.trim() && !body.trim())}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-40"
                style={{
                  background: 'linear-gradient(135deg, rgba(251,146,60,0.2) 0%, rgba(59,130,246,0.2) 100%)',
                  border: '1px solid rgba(251,146,60,0.5)',
                  color: '#fb923c',
                  boxShadow: aiLoading ? 'none' : '0 0 12px rgba(251,146,60,0.15)'
                }}
              >
                {aiLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                AI {body.trim() ? '개선' : '초안'}
              </button>

              {/* Image attach */}
              <label
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-all"
                style={{ color: 'var(--text-secondary)', border: '1px solid var(--bg-border)' }}
              >
                <ImageIcon size={11} />
                이미지
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => { Array.from(e.target.files || []).forEach(addImage); e.target.value = '' }} />
              </label>
            </div>
          </div>

          {/* Editor area */}
          <div className="px-5 py-4">
            {tab === 'write' ? (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onPaste={handlePaste}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                placeholder="내용을 작성하세요... (마크다운 지원 · 이미지 붙여넣기/드래그앤드롭)"
                rows={14}
                className="w-full bg-transparent text-sm text-text-primary placeholder-text-tertiary focus:outline-none resize-y font-mono leading-relaxed"
              />
            ) : (
              <div
                className="min-h-[300px] markdown-body text-sm leading-relaxed text-text-secondary"
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  components={{ img: ({ src, alt }) => <PreviewImage src={src} alt={alt} images={images} /> }}
                >
                  {body || '_내용을 입력하세요_'}
                </ReactMarkdown>
              </div>
            )}
          </div>

          {/* Image chips */}
          {images.length > 0 && (
            <div className="px-5 pb-4 flex flex-wrap gap-2">
              {images.map((img) => (
                <div key={img.tmpId}
                  className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-lg text-[11px] text-text-secondary transition-all"
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--bg-border)' }}>
                  <img src={img.dataUrl} alt="" className="w-6 h-6 object-cover rounded" />
                  <span className="max-w-[160px] truncate">{img.filename}</span>
                  <button
                    onClick={() => setImages((p) => p.filter((i) => i.tmpId !== img.tmpId))}
                    className="ml-1 text-text-tertiary hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="mx-5 mb-4 px-3 py-2 rounded-lg text-[11px] text-red-400"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
              {error}
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="flex items-center justify-between px-5 py-3"
          style={{ borderTop: '1px solid var(--bg-border)', background: 'var(--bg-primary)' }}>
          <p className="text-[10px] text-text-tertiary">
            이미지 Paste/Drop 지원 · 게시하면 Clauday 프로젝트에 등록
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary transition-all"
              style={{ border: '1px solid var(--bg-border)' }}
            >
              취소
            </button>
            <button
              onClick={submit}
              disabled={!subject.trim() || !body.trim() || posting}
              className="flex items-center gap-1.5 px-5 py-1.5 rounded-lg text-white text-xs font-bold transition-all hover:opacity-90 disabled:opacity-40 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #fb923c 0%, #3b82f6 100%)',
                boxShadow: subject.trim() && body.trim() ? '0 2px 12px rgba(251,146,60,0.3)' : 'none'
              }}
            >
              {posting ? <Loader2 size={12} className="animate-spin" /> : <ArrowUp size={12} />}
              {posting ? '게시 중...' : '게시하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// utils
function formatTimeAgo(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const diff = Date.now() - d.getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return '방금'
    if (m < 60) return `${m}분 전`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}시간 전`
    const days = Math.floor(h / 24)
    if (days < 7) return `${days}일 전`
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  } catch { return '' }
}

function extractPreview(markdown: string): string {
  if (!markdown) return ''
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[#*_>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim().substring(0, 150)
}

export default CommunityView
