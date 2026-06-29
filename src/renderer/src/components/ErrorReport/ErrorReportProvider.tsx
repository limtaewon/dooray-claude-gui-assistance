import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Bug, Copy, Globe2, ExternalLink, Loader2 } from 'lucide-react'
import Modal from '../common/ds/Modal'
import { useToast } from '../common/ds/Toast'

/**
 * 오류 리포트 — 모든 AI 호출 실패 지점에서 사용자가 한 번에 제보할 수 있게 하는 인프라.
 * 사용:
 *   const { open } = useErrorReport()
 *   toast.error('실패', err.message, { label: '🐞 리포트', onClick: open })
 *   또는 직접 open() 호출.
 */

interface ErrorReportApi {
  /** 모달 열기. 호출 시점에 main 의 collect 가 실행되어 진단 정보가 prefill 됨. */
  open: () => void
}

const ErrorReportCtx = createContext<ErrorReportApi | null>(null)

export function useErrorReport(): ErrorReportApi {
  const ctx = useContext(ErrorReportCtx)
  if (!ctx) throw new Error('useErrorReport must be used within <ErrorReportProvider>')
  return ctx
}

function ErrorReportProvider({ children }: { children: ReactNode }): JSX.Element {
  const toast = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [subject, setSubject] = useState('')
  const [userNote, setUserNote] = useState('')
  const [body, setBody] = useState('')
  const [logPath, setLogPath] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const open = useCallback((): void => {
    setIsOpen(true)
    setLoading(true)
    setUserNote('')
    window.api.errorReport.collect()
      .then((c) => {
        setSubject(c.defaultSubject)
        setBody(c.body)
        setLogPath(c.logPath)
      })
      .catch((err) => {
        toast.error('진단 정보 수집 실패', err instanceof Error ? err.message : String(err))
        setIsOpen(false)
      })
      .finally(() => setLoading(false))
  }, [toast])

  const close = (): void => {
    if (submitting) return
    setIsOpen(false)
  }

  const submitCommunity = async (): Promise<void> => {
    if (submitting) return
    setSubmitting(true)
    try {
      const { url } = await window.api.errorReport.submitCommunity({
        subject, userNote, diagnosticsBody: body
      })
      toast.success('🐞 커뮤니티에 게시됨', '같은 문제 다른 사용자도 보고 도와줄 수 있어요', {
        label: '게시글 열기',
        onClick: () => window.open(url, '_blank', 'noopener,noreferrer')
      })
      setIsOpen(false)
    } catch (err) {
      toast.error('게시 실패', err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const copyToClipboard = async (): Promise<void> => {
    if (submitting) return
    setSubmitting(true)
    try {
      await window.api.errorReport.copyToClipboard({ subject, userNote, diagnosticsBody: body })
      toast.success('클립보드에 복사됨', '두레이 메신저에 붙여넣어 공유하세요')
      setIsOpen(false)
    } catch (err) {
      toast.error('복사 실패', err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const api = useMemo<ErrorReportApi>(() => ({ open }), [open])

  return (
    <ErrorReportCtx.Provider value={api}>
      {children}
      <Modal
        open={isOpen}
        onClose={close}
        title="오류 리포트"
        icon={<Bug size={14} style={{ color: 'var(--c-red-solid)' }} />}
        width={680}
        resizable
        dismissable={!submitting}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
            <button
              className="ds-btn sm"
              onClick={copyToClipboard}
              disabled={loading || submitting}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Copy size={11} /> 클립보드 복사
            </button>
            <button
              className="ds-btn sm primary"
              onClick={submitCommunity}
              disabled={loading || submitting}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {submitting ? <Loader2 size={11} className="animate-spin" /> : <Globe2 size={11} />}
              커뮤니티에 게시
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
            <div className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary leading-relaxed">
              Claude CLI 호출 진단 + 시스템 정보를 묶어서 보냅니다. 민감정보가 있으면 직접 지우고 보내주세요.
              <br />
              <span className="text-text-tertiary">
                로그 파일: <code className="text-[calc(10px_*_var(--app-font-scale,1))]">{logPath}</code>
              </span>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[calc(11px_*_var(--app-font-scale,1))] font-semibold text-text-primary">제목</span>
              <input
                type="text"
                className="ds-input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={submitting}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[calc(11px_*_var(--app-font-scale,1))] font-semibold text-text-primary">
                현상 / 재현 절차 <span className="text-text-tertiary font-normal">(선택 — 어떤 작업 중에 났는지 한 줄이면 충분)</span>
              </span>
              <textarea
                className="ds-input"
                rows={3}
                value={userNote}
                onChange={(e) => setUserNote(e.target.value)}
                placeholder="예: 브리핑 새로고침 눌렀더니 에러가 떴어요"
                disabled={submitting}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[calc(11px_*_var(--app-font-scale,1))] font-semibold text-text-primary">
                진단 정보 <span className="text-text-tertiary font-normal">(자동 생성 — 필요 시 직접 편집)</span>
              </span>
              <textarea
                className="ds-input"
                rows={14}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                style={{ fontFamily: 'var(--mono-font, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 11 }}
                disabled={submitting}
              />
            </label>

            <div className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary flex items-center gap-1">
              <ExternalLink size={10} />
              "커뮤니티에 게시" 누르면 Clauday 두레이 커뮤니티 채널에 본인 계정으로 글이 등록됩니다.
            </div>
          </div>
        )}
      </Modal>
    </ErrorReportCtx.Provider>
  )
}

export default ErrorReportProvider
