import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { MessageSquare, Copy, Send, Loader2, Bug, Sparkles, Lightbulb } from 'lucide-react'
import Modal from '../common/ds/Modal'
import { useToast } from '../common/ds/Toast'
import type { FeedbackCategory, FeedbackPayload, FeedbackSubmitResult } from '@shared/types/feedback'

/**
 * 피드백 시스템 — 오류/기능요청/개선을 어디서나 보낼 수 있는 통합 UI.
 * 사용:
 *   const { open, openBug, openFeature, openImprovement } = useFeedback()
 *   또는 역호환: const { open } = useErrorReport() — bug 카테고리로 열림
 */

type FeedbackCategoryLabel = 'bug' | 'feature' | 'improvement'

interface FeedbackApi {
  /** 모달 열기. initialCategory 지정 가능 (기본: 'bug') */
  open: (initialCategory?: FeedbackCategory) => void
  /** bug 카테고리로 열기 */
  openBug: () => void
  /** feature 카테고리로 열기 */
  openFeature: () => void
  /** improvement 카테고리로 열기 */
  openImprovement: () => void
}

const FeedbackCtx = createContext<FeedbackApi | null>(null)

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackCtx)
  if (!ctx) throw new Error('useFeedback must be used within <FeedbackProvider>')
  return ctx
}

function FeedbackProvider({ children }: { children: ReactNode }): JSX.Element {
  const toast = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [category, setCategory] = useState<FeedbackCategory>('bug')
  const [subject, setSubject] = useState('')
  const [userNote, setUserNote] = useState('')
  const [diagnostic, setDiagnostic] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const open = useCallback((initialCategory: FeedbackCategory = 'bug'): void => {
    setIsOpen(true)
    setCategory(initialCategory)
    setSubject('')
    setUserNote('')
    setDiagnostic('')
    setLoading(false)
    setSubmitting(false)

    // bug 카테고리일 때만 진단 정보 수집
    if (initialCategory === 'bug') {
      setLoading(true)
      window.api.errorReport.collect()
        .then((c) => {
          setSubject(c.defaultSubject)
          setDiagnostic(c.body)
        })
        .catch((err) => {
          toast.error('진단 정보 수집 실패', err instanceof Error ? err.message : String(err))
        })
        .finally(() => setLoading(false))
    }
  }, [toast])

  const openBug = useCallback(() => open('bug'), [open])
  const openFeature = useCallback(() => open('feature'), [open])
  const openImprovement = useCallback(() => open('improvement'), [open])

  // 글로벌 단축키 Cmd/Ctrl+Shift+B 리스너
  useEffect(() => {
    const onOpenFeedback = (e: Event): void => {
      const detail = (e as CustomEvent<{ category?: FeedbackCategory }>).detail
      open(detail?.category || 'bug')
    }
    window.addEventListener('open-feedback-modal', onOpenFeedback as EventListener)
    return () => window.removeEventListener('open-feedback-modal', onOpenFeedback as EventListener)
  }, [open])

  const close = (): void => {
    if (submitting) return
    setIsOpen(false)
  }

  const submit = async (): Promise<void> => {
    if (submitting) return
    setSubmitting(true)
    try {
      const payload: FeedbackPayload = {
        category,
        subject: subject.trim() || '피드백',
        userNote: userNote.trim() || '(내용 없음)',
        diagnostic: category === 'bug' ? diagnostic : undefined,
      }

      const result: FeedbackSubmitResult = await window.api.feedback.submit(payload)

      if (result.ok) {
        toast.success('피드백이 전달됨', 'Ultra Agent 가 분석 후 PR 생성까지 자동 진행합니다')
        setIsOpen(false)
      } else {
        // 실패 시 클립보드 fallback
        const fallbackText = [
          `[${category === 'bug' ? '🐞 오류' : category === 'feature' ? '✨ 기능요청' : '💡 개선'}] ${subject}`,
          '',
          userNote,
          ...(diagnostic ? ['', '## 진단 정보', diagnostic] : []),
        ].join('\n')
        await navigator.clipboard.writeText(fallbackText)
        toast.error(
          result.reason === 'hook-url-missing' ? 'Hook URL 미설정' : '전송 실패',
          '클립보드에 복사했어요. 두레이 메신저에 붙여넣어 공유하세요',
          { label: '복사됨', onClick: () => {} }
        )
      }
    } catch (err) {
      toast.error('전송 실패', err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const api = useMemo<FeedbackApi>(() => ({ open, openBug, openFeature, openImprovement }), [open, openBug, openFeature, openImprovement])

  const categoryOptions: { value: FeedbackCategory; label: string; icon: ReactNode }[] = [
    { value: 'bug', label: '🐞 오류', icon: <Bug size={14} /> },
    { value: 'feature', label: '✨ 기능요청', icon: <Sparkles size={14} /> },
    { value: 'improvement', label: '💡 개선', icon: <Lightbulb size={14} /> },
  ]

  return (
    <FeedbackCtx.Provider value={api}>
      {children}
      <Modal
        open={isOpen}
        onClose={close}
        title="피드백"
        icon={<MessageSquare size={14} style={{ color: 'var(--c-blue-solid)' }} />}
        width={680}
        resizable
        dismissable={!submitting}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
            <button
              className="ds-btn sm"
              onClick={async () => {
                const fallbackText = [
                  `[${category === 'bug' ? '🐞 오류' : category === 'feature' ? '✨ 기능요청' : '💡 개선'}] ${subject}`,
                  '',
                  userNote,
                  ...(diagnostic ? ['', '## 진단 정보', diagnostic] : []),
                ].join('\n')
                await navigator.clipboard.writeText(fallbackText)
                toast.success('클립보드에 복사됨', '두레이 메신저에 붙여넣어 공유하세요')
              }}
              disabled={loading || submitting}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Copy size={11} /> 클립보드 복사
            </button>
            <button
              className="ds-btn sm primary"
              onClick={submit}
              disabled={loading || submitting || !subject.trim()}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {submitting ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
              전송
            </button>
          </div>
        }
      >
        {loading ? (
          <div className="flex items-center gap-2 py-6 justify-center text-text-secondary">
            <Loader2 size={14} className="animate-spin" /> 진단 정보 수집 중...
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* 카테고리 선택 */}
            <div className="flex gap-2">
              {categoryOptions.map((opt) => (
                <button
                  key={opt.value}
                  className={`ds-btn sm ${category === opt.value ? 'primary' : ''}`}
                  onClick={() => {
                    if (category === opt.value) return
                    setCategory(opt.value)
                    // 카테고리 전환 시 제목/내용 리셋 + bug 면 진단 prefill 재호출
                    setSubject('')
                    setUserNote('')
                    if (opt.value === 'bug') {
                      setLoading(true)
                      window.api.errorReport.collect()
                        .then((c) => {
                          setSubject(c.defaultSubject)
                          setDiagnostic(c.body)
                        })
                        .catch((err) => {
                          toast.error('진단 정보 수집 실패', err instanceof Error ? err.message : String(err))
                        })
                        .finally(() => setLoading(false))
                    } else {
                      setDiagnostic('')
                    }
                  }}
                  disabled={submitting}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}
                >
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>

            <div className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary leading-relaxed">
              {category === 'bug'
                ? '오류 발생 시 진단 정보가 자동 포함됩니다. 민감정보가 있으면 직접 지우고 보내주세요.'
                : category === 'feature'
                ? '원하는 기능을 설명해주세요.'
                : '개선할 점을 제안해주세요.'}
              <div className="mt-1 text-text-tertiary">
                전송 시 Ultra Agent 가 자동으로 분석 → 브랜치 → 구현 → 테스트 → PR 생성까지 진행합니다.
              </div>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[calc(11px_*_var(--app-font-scale,1))] font-semibold text-text-primary">제목</span>
              <input
                type="text"
                className="ds-input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={
                  category === 'bug'
                    ? '예: 브리핑 응답이 비어있음'
                    : category === 'feature'
                    ? '예: 캘린더 일정 검색 기능 추가'
                    : '예: 사이드바 토글 위치 조정'
                }
                maxLength={100}
                disabled={submitting}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[calc(11px_*_var(--app-font-scale,1))] font-semibold text-text-primary">
                내용 <span className="text-text-tertiary font-normal">(선택)</span>
              </span>
              <textarea
                className="ds-input"
                rows={6}
                value={userNote}
                onChange={(e) => setUserNote(e.target.value)}
                placeholder="상세 내용을 적어주세요 (선택)"
                maxLength={4000}
                disabled={submitting}
              />
            </label>

            {category === 'bug' && diagnostic && (
              <label className="flex flex-col gap-1">
                <span className="text-[calc(11px_*_var(--app-font-scale,1))] font-semibold text-text-primary">
                  진단 정보 <span className="text-text-tertiary font-normal">(자동 생성 — 필요 시 편집 가능)</span>
                </span>
                <textarea
                  className="ds-input"
                  rows={10}
                  value={diagnostic}
                  onChange={(e) => setDiagnostic(e.target.value)}
                  style={{ fontFamily: 'var(--mono-font, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 11 }}
                  disabled={submitting}
                />
              </label>
            )}
          </div>
        )}
      </Modal>
    </FeedbackCtx.Provider>
  )
}

export default FeedbackProvider
