/**
 * ApplyDialog.tsx — draft 적용 확인 다이얼로그
 *
 * window.api.harness.edit.apply 호출 전 최종 확인 화면.
 * 다음을 표시하고 사용자 확인을 받는다:
 * - 변경 파일 목록 (origin 배지 포함)
 * - 자동 백업 생성 안내
 * - .sh 파일 변경 시 빨간 경고 배너
 * - 충돌(STALE) 파일 있으면 적용 버튼 차단
 *
 * 적용 성공 시 onSuccess(newModel, newBundleHash) 호출.
 * 실패 시 명확한 사유 표시 + draft 보존.
 */

import { useState, useCallback } from 'react'
import { AlertTriangle, ShieldCheck, FileText, Check } from 'lucide-react'
import type { HarnessModel } from '@shared/types/harness'
import type { HarnessDraft } from '@shared/types/harness-edit'
import type { DraftFileEditWithStale } from './draftReducer'
import { hasStaleEdits, editCount } from './draftReducer'
import Button from '@/components/common/ds/Button'
import Modal from '@/components/common/ds/Modal'
import Chip from '@/components/common/ds/Chip'

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export interface ApplyDialogProps {
  open: boolean
  bundlePath: string
  draft: HarnessDraft
  onClose: () => void
  /** 적용 성공 시 — 새 HarnessModel + 새 bundleHash */
  onSuccess: (newModel: HarnessModel, newBundleHash: string) => void
}

// ─────────────────────────────────────────────
// 내부 유틸
// ─────────────────────────────────────────────

function originLabel(origin: 'form' | 'raw' | 'ai'): string {
  switch (origin) {
    case 'form': return '폼'
    case 'raw': return 'raw'
    case 'ai': return 'AI'
  }
}

// ─────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────

/**
 * 파일 적용 확인 다이얼로그.
 *
 * 사용자가 "파일에 적용" 버튼을 누르면 열린다.
 * 충돌/게이트 거부 시 에러를 표시하고 draft 는 보존된다.
 */
export function ApplyDialog({ open, bundlePath, draft, onClose, onSuccess }: ApplyDialogProps): JSX.Element {
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [backupDir, setBackupDir] = useState<string | null>(null)

  const entries = Object.entries(draft.edits)
  const draftCount = editCount(draft)
  const hasStale = hasStaleEdits(draft)
  const hasShellEdit = entries.some(([relPath]) => relPath.endsWith('.sh'))

  const handleApply = useCallback(async () => {
    setApplying(true)
    setApplyError(null)
    try {
      const result = await window.api.harness.edit.apply(bundlePath, draft)
      setBackupDir(result.backupDir)
      // 성공 — 새 모델의 bundleHash 로 draft 초기화
      onSuccess(result.model, result.model.meta.bundleHash)
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e))
    } finally {
      setApplying(false)
    }
  }, [bundlePath, draft, onSuccess])

  const handleClose = useCallback(() => {
    if (applying) return
    setApplyError(null)
    setBackupDir(null)
    onClose()
  }, [applying, onClose])

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="변경 사항 파일에 적용"
      icon={<Check size={14} className="text-[color:var(--c-blue-solid)]" />}
      width={560}
      dismissable={!applying}
      footer={
        backupDir ? (
          // 성공 후 푸터
          <div className="flex w-full justify-end">
            <Button variant="primary" size="sm" onClick={handleClose}>
              닫기
            </Button>
          </div>
        ) : (
          // 적용 전 푸터
          <div className="flex items-center justify-between w-full">
            <p className="text-xs text-[color:var(--text-tertiary)]">
              적용 전 자동 백업이 생성됩니다.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleClose} disabled={applying}>
                취소
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Check size={11} />}
                onClick={() => { void handleApply() }}
                disabled={applying || hasStale || draftCount === 0}
                title={hasStale ? '충돌 파일이 있어 적용할 수 없습니다' : undefined}
              >
                {applying ? '적용 중...' : `${draftCount}개 파일 적용`}
              </Button>
            </div>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-3">
        {/* 성공 결과 표시 */}
        {backupDir && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-[color:var(--c-emerald-bg)] border border-[color:var(--c-emerald-fg)]">
              <Check size={14} className="text-[color:var(--c-emerald-fg)] flex-none" />
              <div>
                <p className="text-sm font-semibold text-[color:var(--text-primary)]">적용 완료</p>
                <p className="text-xs text-[color:var(--text-secondary)] mt-0.5 break-all">
                  백업 위치: <span className="font-mono">{backupDir}</span>
                </p>
              </div>
            </div>
            <p className="text-xs text-[color:var(--text-tertiary)]">
              번들이 재정규화되어 뷰가 갱신되었습니다. 이전 상태는 "백업 복원" 패널에서 되돌릴 수 있습니다.
            </p>
          </div>
        )}

        {/* 적용 전 확인 화면 */}
        {!backupDir && (
          <>
            {/* .sh 파일 경고 */}
            {hasShellEdit && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-[color:var(--c-red-bg)] border border-[color:var(--c-red-fg)]">
                <AlertTriangle size={14} className="text-[color:var(--c-red-fg)] flex-none mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-[color:var(--c-red-fg)]">게이트 스크립트 변경 포함</p>
                  <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                    변경 대상에 <span className="font-mono">.sh</span> 파일이 포함되어 있습니다.
                    스크립트는 텍스트로만 저장되며 자동 실행되지 않지만, 하네스 동작에 영향을 줄 수 있습니다.
                    적용 전 diff 에서 내용을 반드시 확인하세요.
                  </p>
                </div>
              </div>
            )}

            {/* 충돌 경고 */}
            {hasStale && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-[color:var(--c-red-bg)] border border-[color:var(--c-red-fg)]">
                <AlertTriangle size={14} className="text-[color:var(--c-red-fg)] flex-none mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-[color:var(--c-red-fg)]">외부 변경 충돌 감지</p>
                  <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                    일부 파일이 외부에서 변경되어 충돌 상태입니다. Diff 탭에서 충돌 파일을 확인하고
                    되돌린 후 재편집하세요.
                  </p>
                </div>
              </div>
            )}

            {/* 백업 안내 */}
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[color:var(--bg-subtle)] border border-[color:var(--bg-border)]">
              <ShieldCheck size={14} className="text-[color:var(--c-blue-solid)] flex-none" />
              <p className="text-xs text-[color:var(--text-secondary)]">
                적용 전 원본 파일이 자동 백업됩니다. "백업 복원" 패널에서 언제든 되돌릴 수 있습니다.
              </p>
            </div>

            {/* 변경 파일 목록 */}
            <div>
              <p className="text-xs font-semibold text-[color:var(--text-secondary)] mb-2">
                변경 대상 파일 ({draftCount}개)
              </p>
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {entries.map(([relPath, edit]) => {
                  const e = edit as DraftFileEditWithStale
                  return (
                    <div
                      key={relPath}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                        e.stale
                          ? 'bg-[color:var(--c-red-bg)] border-[color:var(--c-red-fg)]'
                          : relPath.endsWith('.sh')
                            ? 'bg-[color:var(--c-orange-bg)] border-[color:var(--c-orange-fg)]'
                            : 'bg-[color:var(--bg-surface)] border-[color:var(--bg-border)]'
                      }`}
                    >
                      <FileText size={11} className="text-[color:var(--text-tertiary)] flex-none" />
                      <span className="font-mono text-[color:var(--text-primary)] flex-1 truncate">{relPath}</span>
                      <Chip tone={e.origin === 'ai' ? 'violet' : e.origin === 'form' ? 'blue' : 'neutral'} square>
                        {originLabel(e.origin)}
                      </Chip>
                      {e.stale && <Chip tone="red" square>충돌</Chip>}
                      {relPath.endsWith('.sh') && <Chip tone="orange" square>.sh</Chip>}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 적용 오류 */}
            {applyError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-[color:var(--c-red-bg)] border border-[color:var(--c-red-fg)]">
                <AlertTriangle size={14} className="text-[color:var(--c-red-fg)] flex-none mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-[color:var(--c-red-fg)]">적용 실패</p>
                  <p className="text-xs text-[color:var(--text-secondary)] mt-0.5 break-all">{applyError}</p>
                  <p className="text-xs text-[color:var(--text-tertiary)] mt-1">초안은 보존됩니다. 오류 원인 해결 후 재시도하세요.</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
