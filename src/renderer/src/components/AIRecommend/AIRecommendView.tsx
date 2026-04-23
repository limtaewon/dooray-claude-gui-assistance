import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Lightbulb, ExternalLink, Sparkles, RefreshCw, Loader2, AlertCircle,
  Search, X, Clock, ChevronLeft, Hash, MessageSquare, Send, Edit3, Eye, Image as ImageIcon, ChevronDown
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { AIRecommendResult, AIRecommendItem } from '../../../../shared/types/ai-recommend'
import type { DoorayTask, DoorayTaskDetail, DoorayTaskComment } from '../../../../shared/types/dooray'
import DoorayImage, { DoorayFileContext } from '../common/DoorayImage'
import { LoadingView, ErrorView, EmptyView } from '../common/StateViews'
import { Button, SegTabs, useToast } from '../common/ds'
import SkillQuickToggle from '../Dooray/SkillQuickToggle'
import AIToolsPopover from '../common/AIToolsPopover'

/** Dooray AI 활용 사례 공유 프로젝트 */
const AI_SHARING_PROJECT_ID = '4138743749699736544'

type Tab = 'posts' | 'recommend'
type Category = 'immediate' | 'reference' | 'covered'

const CATEGORY_META: Record<Category, { label: string; color: string; bg: string; border: string }> = {
  immediate: { label: '즉시 도입 가치', color: '#F87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.25)' },
  reference: { label: '참고할만한 사례', color: '#FBBF24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.25)' },
  covered:   { label: '이미 보유/유사', color: '#34D399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.25)' }
}

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

function getInitials(name: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

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

const markdownComponents = {
  img: ({ src, alt }: { src?: string; alt?: string }) => <DoorayImage src={src} alt={alt} className="max-w-full rounded-lg" />
}

/* ────────────────────────────── AI 추천 결과 카드 ────────────────────────────── */

function ItemCard({ item, category }: { item: AIRecommendItem; category: Category }): JSX.Element {
  const meta = CATEGORY_META[category]
  return (
    <div className="ds-card group relative" style={{ padding: '12px 14px', borderLeft: `3px solid ${meta.color}` }}>
      <div className="flex items-start gap-2.5">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-text-primary leading-snug">{item.title}</div>
          <div className="text-[11px] text-text-secondary mt-1 leading-relaxed whitespace-pre-wrap">{item.reason}</div>
          {item.coveredBy && (
            <div className="text-[10.5px] text-text-tertiary mt-1.5">
              <span className="opacity-70">커버 스킬/MCP:</span>{' '}
              <span className="font-medium text-text-secondary">{item.coveredBy}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          className="flex-none flex items-center gap-1 text-[11px] text-clover-blue hover:text-clover-blue/80"
          title="두레이에서 열기"
          onClick={(e) => { e.stopPropagation(); window.open(item.url, '_blank', 'noopener,noreferrer') }}
        >
          <ExternalLink size={12} />
        </button>
      </div>
    </div>
  )
}

function Section({ category, items }: { category: Category; items: AIRecommendItem[] }): JSX.Element | null {
  if (items.length === 0) return null
  const meta = CATEGORY_META[category]
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-[6px]"
        style={{ background: meta.bg, border: `1px solid ${meta.border}` }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
        <span className="text-[12px] font-semibold" style={{ color: meta.color }}>{meta.label}</span>
        <span className="text-[11px] text-text-tertiary">{items.length}건</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {items.map((item) => <ItemCard key={item.taskId} item={item} category={category} />)}
      </div>
    </div>
  )
}

/* ────────────────────────────── 글 읽기 (read-only) ────────────────────────────── */

function PostCard({ post, onSelect }: { post: DoorayTask; onSelect: () => void }): JSX.Element {
  const timeAgo = formatTimeAgo(post.createdAt)
  const preview = extractPreview((post as DoorayTask & { body?: { content?: string } }).body?.content || '')
  const authorName = (post as DoorayTask & { users?: { from?: { member?: { name?: string } } } }).users?.from?.member?.name || ''
  const colors = avatarColor(authorName)
  const initials = getInitials(authorName)

  return (
    <button
      onClick={onSelect}
      className="w-full text-left px-4 py-3 rounded-xl transition-all group hover:-translate-y-0.5"
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
      <div className="flex gap-3">
        <div className="flex-shrink-0 flex flex-col items-center pt-0.5">
          <div className="min-w-7 h-6 px-1.5 rounded-md flex items-center justify-center text-[11px] font-bold text-clover-blue group-hover:bg-clover-blue group-hover:text-white transition-colors"
            style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}>
            {post.number ?? '·'}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary group-hover:text-clover-blue transition-colors leading-snug pr-2">{post.subject}</p>
          {preview && <p className="text-[11px] text-text-tertiary mt-1 line-clamp-2 leading-relaxed">{preview}</p>}
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0"
                style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.ring}40` }}>
                {initials}
              </span>
              {authorName && <span className="text-[10px] text-text-secondary font-medium">{authorName}</span>}
            </div>
            <span className="text-text-tertiary text-[10px]">·</span>
            <span className="flex items-center gap-1 text-[10px] text-text-tertiary">
              <Clock size={9} />
              {timeAgo}
            </span>
          </div>
        </div>
        <div className="flex-shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">
          <ChevronLeft size={14} className="rotate-180 text-clover-blue" />
        </div>
      </div>
    </button>
  )
}

function PostDetail({ post, onBack }: { post: DoorayTask; onBack: () => void }): JSX.Element {
  const [detail, setDetail] = useState<DoorayTaskDetail | null>(null)
  const [comments, setComments] = useState<DoorayTaskComment[]>([])
  const [loadingDetail, setLoadingDetail] = useState(true)
  const [loadingComments, setLoadingComments] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingDetail(true); setLoadingComments(true)
      try {
        const [d, c] = await Promise.all([
          window.api.dooray.tasks.detail(AI_SHARING_PROJECT_ID, post.id),
          window.api.dooray.tasks.comments(AI_SHARING_PROJECT_ID, post.id)
        ])
        if (cancelled) return
        setDetail(d); setComments(c)
      } catch { /* ok */ }
      finally {
        if (!cancelled) { setLoadingDetail(false); setLoadingComments(false) }
      }
    })()
    return () => { cancelled = true }
  }, [post.id])

  const refreshComments = async (): Promise<void> => {
    setLoadingComments(true)
    try { setComments(await window.api.dooray.tasks.comments(AI_SHARING_PROJECT_ID, post.id)) }
    finally { setLoadingComments(false) }
  }

  const body = detail?.body?.content || ''
  const authorName = detail?.users?.to?.[0]?.member?.name || ''
  const authorColors = avatarColor(authorName)
  const authorInitials = getInitials(authorName)

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      <div className="px-4 py-2.5 border-b border-bg-border flex items-center gap-3 flex-shrink-0"
        style={{ background: 'var(--bg-primary)' }}>
        <button onClick={onBack}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-all text-xs font-medium">
          <ChevronLeft size={13} />
          <span>목록</span>
        </button>
        <div className="w-px h-4 bg-bg-border" />
        <div className="flex-1 min-w-0">
          <h2 className="text-xs font-semibold text-text-secondary truncate">{post.subject}</h2>
        </div>
        <button
          onClick={() => window.open(`https://nhnent.dooray.com/task/${AI_SHARING_PROJECT_ID}/${post.id}`, '_blank', 'noopener,noreferrer')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-surface transition-all text-[11px]"
          title="두레이에서 열기"
        >
          <ExternalLink size={11} />
          두레이
        </button>
        <span className="text-[10px] text-text-tertiary flex-shrink-0">{formatTimeAgo(post.createdAt)}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-5 pb-4">
          {loadingDetail ? (
            <LoadingView message="게시글 로딩 중..." />
          ) : (
            <div className="rounded-xl overflow-hidden mb-5"
              style={{ border: '1px solid var(--bg-border)', background: 'var(--bg-surface)' }}>
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
                  style={{ background: 'rgba(251,146,60,0.15)', color: 'var(--clover-orange)', border: '1px solid rgba(251,146,60,0.25)' }}>
                  <Hash size={9} />
                  AI 공유
                </div>
              </div>
              <div className="px-4 pt-4 pb-2">
                <h1 className="text-base font-bold text-text-primary leading-snug">{post.subject}</h1>
              </div>
              <div className="px-4 pb-4">
                {body ? (
                  <div className="markdown-body text-sm leading-relaxed text-text-secondary">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownComponents}>
                      {body}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-xs text-text-tertiary italic">(본문 없음)</p>
                )}
              </div>
            </div>
          )}

          {/* 댓글 (읽기 전용) */}
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

          {loadingComments ? (
            <LoadingView message="댓글 로딩 중..." />
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center py-6 gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)' }}>
                <MessageSquare size={16} className="text-text-tertiary" />
              </div>
              <p className="text-xs text-text-tertiary">첫 댓글을 남겨보세요</p>
            </div>
          ) : (
            <div className="space-y-2 mb-2">
              {comments.map((c, idx) => {
                const commenterName = c.creator?.member?.name || '알 수 없음'
                const commenterColors = avatarColor(commenterName)
                const commenterInitials = getInitials(commenterName)
                return (
                  <div key={c.id} className="flex gap-2.5">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
                        style={{ background: commenterColors.bg, color: commenterColors.text, border: `1.5px solid ${commenterColors.ring}50` }}>
                        {commenterInitials}
                      </span>
                      {idx < comments.length - 1 && (
                        <div className="w-px flex-1 mt-1" style={{ background: 'var(--bg-border)', minHeight: '12px' }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)' }}>
                        <div className="px-3 py-2 flex items-center gap-2"
                          style={{ borderBottom: c.body?.content ? '1px solid var(--bg-border)' : 'none', background: 'var(--bg-primary)' }}>
                          <span className="text-[11px] font-semibold text-text-primary">{commenterName}</span>
                          {c.createdAt && <span className="text-[9px] text-text-tertiary ml-auto">{formatTimeAgo(c.createdAt)}</span>}
                        </div>
                        {c.body?.content && (
                          <div className="px-3 py-2.5 markdown-body text-xs leading-relaxed text-text-secondary">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownComponents}>
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

          {/* 댓글 작성 */}
          <CommentComposer postId={post.id} onPosted={refreshComments} />
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────── 댓글 작성 ────────────────────────────── */

interface PendingImage {
  tmpId: string
  filename: string
  mime: string
  file: File
  dataUrl: string
}

const IMG_PLACEHOLDER = (tmpId: string, filename: string): string => `![${filename}](clauday-tmp://${tmpId})`
const IMG_PLACEHOLDER_REGEX = /!\[([^\]]*)\]\(clauday-tmp:\/\/([^)]+)\)/g

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
        projectId: AI_SHARING_PROJECT_ID, postId, content: text
      })
      if (images.length > 0) {
        const uploadedMap = new Map<string, string>()
        for (const img of images) {
          if (!text.includes(img.tmpId)) continue
          try {
            const buf = await img.file.arrayBuffer()
            const up = await window.api.dooray.tasks.uploadFile({
              projectId: AI_SHARING_PROJECT_ID, postId, filename: img.filename, mime: img.mime, data: buf
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
            projectId: AI_SHARING_PROJECT_ID, postId, logId: created.id, content: newContent
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
    <div className="rounded-xl overflow-hidden transition-all mt-3"
      style={{
        border: focused ? '1px solid var(--accent-blue)' : '1px solid var(--bg-border)',
        background: 'var(--bg-surface)',
        boxShadow: focused ? '0 0 0 3px rgba(59,130,246,0.08)' : 'none'
      }}>
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
        >
          <ImageIcon size={10} />
          이미지
          <input type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { Array.from(e.target.files || []).forEach(addImage); e.target.value = '' }} />
        </label>
      </div>

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

/* ────────────────────────────── 메인 뷰 ────────────────────────────── */

function AIRecommendView(): JSX.Element {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('posts')

  // 글 읽기
  const PAGE_SIZE = 50
  const [posts, setPosts] = useState<DoorayTask[]>([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [postsLoadingMore, setPostsLoadingMore] = useState(false)
  const [postsError, setPostsError] = useState<string | null>(null)
  const [postsTotal, setPostsTotal] = useState(0)
  const [postsPage, setPostsPage] = useState(0)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<DoorayTask | null>(null)

  // AI 추천
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<AIRecommendResult | null>(null)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  const loadPosts = useCallback(async () => {
    setPostsLoading(true); setPostsError(null)
    try {
      const res = await window.api.community.posts(AI_SHARING_PROJECT_ID, 0, PAGE_SIZE)
      setPosts(res.posts)
      setPostsTotal(res.totalCount)
      setPostsPage(0)
    } catch (err) {
      setPostsError(err instanceof Error ? err.message : '게시글 로드 실패')
    } finally {
      setPostsLoading(false)
    }
  }, [])

  const loadMorePosts = useCallback(async () => {
    if (postsLoadingMore) return
    const nextPage = postsPage + 1
    setPostsLoadingMore(true)
    try {
      const res = await window.api.community.posts(AI_SHARING_PROJECT_ID, nextPage, PAGE_SIZE)
      setPosts((prev) => {
        // id 중복 제거 (혹시나 API 경계에서 겹치는 경우 방지)
        const existing = new Set(prev.map((p) => p.id))
        const fresh = res.posts.filter((p) => !existing.has(p.id))
        return [...prev, ...fresh]
      })
      setPostsTotal(res.totalCount)
      setPostsPage(nextPage)
    } catch (err) {
      setPostsError(err instanceof Error ? err.message : '추가 로드 실패')
    } finally {
      setPostsLoadingMore(false)
    }
  }, [postsPage, postsLoadingMore])

  useEffect(() => { loadPosts() }, [loadPosts])

  // 이전 분석 결과 캐시 로드 (마운트 시 1회) — 구버전 preload에는 없을 수 있어 guard
  useEffect(() => {
    const getter = window.api.ai.recommendCacheGet
    if (typeof getter !== 'function') return
    getter().then((cached) => {
      if (cached) setResult(cached)
    }).catch(() => { /* cache 없음/읽기 실패는 무시 */ })
  }, [])

  // 분석 진행 스트림은 구독은 하지만 문구는 고정(사용자가 상태 플리커 싫어함)
  useEffect(() => {
    const off = window.api.ai.onProgress(() => { /* no-op — 진행 메시지 고정 */ })
    return off
  }, [])

  const analyze = useCallback(async () => {
    setAnalyzing(true); setAnalyzeError(null)
    const requestId = `ai-recommend-${Date.now()}`
    try {
      const mcpServers = await AIToolsPopover.loadSelected('aiRecommend')
      const r = await window.api.ai.recommendAnalyze({ requestId, mcpServers })
      setResult(r)
      toast.success(`${r.analyzedCount}건 분석 완료`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setAnalyzeError(msg)
      toast.error('분석 실패')
    } finally {
      setAnalyzing(false)
    }
  }, [toast])

  const filtered = useMemo(() => {
    if (!search) return posts
    const q = search.toLowerCase()
    return posts.filter((p) => p.subject.toLowerCase().includes(q) || String(p.id).includes(q))
  }, [posts, search])

  const totalRec = result ? result.immediate.length + result.reference.length + result.covered.length : 0

  // 상세 보기로 진입한 경우 — 독립 풀스크린
  if (selected) {
    return (
      <DoorayFileContext.Provider value={{ projectId: AI_SHARING_PROJECT_ID, postId: selected.id }}>
        <PostDetail post={selected} onBack={() => setSelected(null)} />
      </DoorayFileContext.Provider>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 py-4 space-y-4">
        {/* PageHeader */}
        <div className="flex items-center gap-3 flex-wrap">
          <Lightbulb size={18} className="text-clover-orange" />
          <h2 className="text-[14px] font-semibold text-text-primary">AI 추천</h2>
          {tab === 'posts' && posts.length > 0 && <span className="ds-chip neutral">{posts.length}개</span>}
          {tab === 'recommend' && result && <span className="ds-chip neutral">{totalRec}건</span>}
          <div className="flex-1" />
          <SegTabs<Tab>
            value={tab}
            onChange={setTab}
            items={[
              { key: 'posts', label: '글 읽기' },
              { key: 'recommend', label: 'AI 추천' }
            ]}
          />
          {tab === 'recommend' && <SkillQuickToggle target="aiRecommend" feature="aiRecommend" size="sm" />}
          {tab === 'posts' ? (
            <Button variant="primary" onClick={loadPosts} disabled={postsLoading}
              leftIcon={<RefreshCw size={12} className={postsLoading ? 'animate-spin' : ''} />}>
              새로고침
            </Button>
          ) : (
            <Button variant="ai" onClick={analyze} disabled={analyzing}
              leftIcon={analyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}>
              {analyzing ? '분석 중...' : result ? '다시 분석' : '분석 시작'}
            </Button>
          )}
        </div>

        {tab === 'posts' ? (
          /* ── 글 읽기 ── */
          <>
            {posts.length > 0 && (
              <div className="relative max-w-md">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="제목으로 검색..."
                  className="ds-input sm"
                  style={{ paddingLeft: 28, paddingRight: 28 }}
                />
                {search && (
                  <button onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary">
                    <X size={12} />
                  </button>
                )}
              </div>
            )}

            {postsLoading ? (
              <LoadingView message="게시글 불러오는 중..." />
            ) : postsError ? (
              <ErrorView message={postsError} onRetry={loadPosts} />
            ) : filtered.length === 0 ? (
              <EmptyView
                icon={Lightbulb}
                title={search ? '검색 결과가 없습니다' : '게시글이 없습니다'}
                description={search ? '다른 키워드로 검색해보세요' : '프로젝트에 아직 등록된 사례가 없습니다'}
              />
            ) : (
              <div className="space-y-2">
                {filtered.map((p) => <PostCard key={p.id} post={p} onSelect={() => setSelected(p)} />)}
                {/* 페이지네이션 — 검색 중엔 숨김 (서버 페이지가 아닌 클라 필터이므로) */}
                {!search && posts.length < postsTotal && (
                  <div className="pt-2 flex justify-center">
                    <Button
                      variant="secondary"
                      onClick={loadMorePosts}
                      disabled={postsLoadingMore}
                      leftIcon={postsLoadingMore ? <Loader2 size={12} className="animate-spin" /> : <ChevronDown size={12} />}
                    >
                      {postsLoadingMore ? '불러오는 중...' : `더 보기 (${posts.length} / ${postsTotal})`}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* ── AI 추천 ── */
          <>
            <div className="ds-card flex items-center justify-center" style={{ padding: '14px 16px' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[8px] flex-none flex items-center justify-center bg-clover-blue/10">
                  <Sparkles size={16} className="text-clover-blue" />
                </div>
                <div className="text-[12px] text-text-secondary leading-relaxed text-center">
                  <strong className="text-text-primary">AI 활용 사례 공유 프로젝트</strong>의 최신 사례를
                  내 설정(스킬 · MCP 서버)과 비교해
                  <strong className="text-text-primary"> 즉시 도입 / 참고 / 이미 보유</strong> 3가지로 분류합니다.
                </div>
              </div>
            </div>

            {analyzing && (
              <div className="ds-card flex items-center gap-3" style={{ padding: '12px 14px' }}>
                <Loader2 size={16} className="animate-spin text-clover-blue flex-none" />
                <div className="text-[12px] text-text-secondary flex-1">분석 중...</div>
              </div>
            )}

            {analyzeError && !analyzing && (
              <div className="ds-card flex items-start gap-3"
                style={{ padding: '12px 14px', borderColor: 'rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.06)' }}>
                <AlertCircle size={16} className="text-red-400 flex-none mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-red-400 mb-1">분석 실패</div>
                  <pre className="text-[11px] text-text-secondary whitespace-pre-wrap break-words font-mono">{analyzeError}</pre>
                </div>
              </div>
            )}

            {result && !analyzing && (
              <>
                <div className="text-[12px] text-text-secondary px-0.5">
                  {result.summary}
                  {result.analyzedAt && (
                    <span className="text-text-tertiary"> · 분석 {formatTimeAgo(new Date(result.analyzedAt).toISOString())}</span>
                  )}
                  {result.costUsd !== undefined && result.costUsd > 0 && (
                    <span className="text-text-tertiary"> · ${result.costUsd.toFixed(4)}</span>
                  )}
                </div>
                <div className="space-y-4">
                  <Section category="immediate" items={result.immediate} />
                  <Section category="reference" items={result.reference} />
                  <Section category="covered" items={result.covered} />
                </div>
                {totalRec === 0 && (
                  <div className="py-12 text-center text-[12px] text-text-tertiary">분류된 사례가 없습니다.</div>
                )}
              </>
            )}

            {!result && !analyzing && !analyzeError && (
              <div className="py-16 text-center">
                <Lightbulb size={32} className="mx-auto text-text-tertiary mb-3" />
                <p className="text-sm font-medium text-text-primary mb-1">아직 분석된 결과가 없습니다</p>
                <p className="text-[11px] text-text-tertiary">'분석 시작' 버튼을 눌러 내 설정과 비교해보세요</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default AIRecommendView
