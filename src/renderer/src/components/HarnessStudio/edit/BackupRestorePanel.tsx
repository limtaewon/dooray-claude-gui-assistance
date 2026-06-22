/**
 * BackupRestorePanel.tsx — 백업 목록 + 복원 패널
 *
 * window.api.harness.edit.listBackups 로 백업 목록을 불러와 표시한다.
 * 복원 버튼 클릭 시 confirm 후 window.api.harness.edit.restore 를 호출한다.
 * 복원 성공 시 onRestored(newModel) 으로 뷰를 갱신한다.
 */

import { useState, useEffect, useCallback } from 'react'
import { RotateCcw, FolderOpen, Clock, AlertTriangle, CheckCircle, FileText } from 'lucide-react'
import type { HarnessModel } from '@shared/types/harness'
import type { BackupEntry } from '@shared/types/harness-edit'
import Button from '@/components/common/ds/Button'
import { LoadingView, ErrorView, EmptyView } from '@/components/common/ds/StateViews'

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export interface BackupRestorePanelProps {
  bundlePath: string
  onRestored: (newModel: HarnessModel) => void
}

// ─────────────────────────────────────────────
// 내부 유틸
// ─────────────────────────────────────────────

/** ISO 문자열을 로컬 날짜+시각으로 변환 */
function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return isoString
    return d.toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch {
    return isoString
  }
}

/** 백업 디렉터리명에서 타임스탬프 부분 추출 */
function backupLabel(backupDir: string): string {
  const parts = backupDir.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] ?? backupDir
}

// ─────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────

/**
 * 백업 목록 + 복원 패널.
 *
 * 마운트 시 listBackups 를 자동 호출한다.
 * 복원 버튼은 인라인 확인(confirm 상태)으로 2단계 클릭을 요구한다 (실수 방지).
 */
export function BackupRestorePanel({ bundlePath, onRestored }: BackupRestorePanelProps): JSX.Element {
  const [backups, setBackups] = useState<BackupEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null) // 복원 중인 backupDir
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null) // 확인 대기 중
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null) // 성공 메시지

  const loadBackups = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const list = await window.api.harness.edit.listBackups(bundlePath)
      setBackups(list)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [bundlePath])

  useEffect(() => {
    void loadBackups()
  }, [loadBackups])

  const handleRestoreConfirm = useCallback((backupDir: string) => {
    setConfirmTarget(backupDir)
    setRestoreError(null)
  }, [])

  const handleRestoreExecute = useCallback(async (backupDir: string) => {
    setRestoring(backupDir)
    setRestoreError(null)
    setRestoreSuccess(null)
    setConfirmTarget(null)
    try {
      const { restored, model } = await window.api.harness.edit.restore(bundlePath, backupDir)
      setRestoreSuccess(`${restored.length}개 파일 복원 완료`)
      onRestored(model)
      // 복원 후 목록 갱신
      void loadBackups()
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : String(e))
    } finally {
      setRestoring(null)
    }
  }, [bundlePath, onRestored, loadBackups])

  if (loading) return <LoadingView label="백업 목록 불러오는 중..." />
  if (loadError) return <ErrorView title="백업 목록 로드 실패" body={loadError} onRetry={loadBackups} />

  if (backups !== null && backups.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <EmptyView
          icon={RotateCcw}
          title="백업이 없습니다"
          body="파일을 적용하면 자동으로 백업이 생성됩니다."
        />
      </div>
    )
  }

  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RotateCcw size={14} className="text-[color:var(--text-secondary)]" />
          <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">
            백업 복원
          </h3>
        </div>
        <Button variant="ghost" size="xs" leftIcon={<RotateCcw size={10} />} onClick={loadBackups}>
          새로고침
        </Button>
      </div>

      <p className="text-xs text-[color:var(--text-tertiary)]">
        백업은 <span className="font-mono">&lt;userData&gt;/harness-backups/</span> 에 저장됩니다.
        복원하면 번들이 해당 시점의 파일로 되돌아가고 재정규화됩니다.
      </p>

      {/* 성공 메시지 */}
      {restoreSuccess && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[color:var(--c-emerald-bg)] border border-[color:var(--c-emerald-fg)]">
          <CheckCircle size={13} className="text-[color:var(--c-emerald-fg)]" />
          <span className="text-xs text-[color:var(--text-primary)]">{restoreSuccess}</span>
          <button className="ml-auto text-xs text-[color:var(--text-tertiary)]" onClick={() => setRestoreSuccess(null)}>×</button>
        </div>
      )}

      {/* 복원 오류 */}
      {restoreError && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[color:var(--c-red-bg)] border border-[color:var(--c-red-fg)]">
          <AlertTriangle size={13} className="text-[color:var(--c-red-fg)]" />
          <span className="text-xs text-[color:var(--c-red-fg)]">{restoreError}</span>
          <button className="ml-auto text-xs" onClick={() => setRestoreError(null)}>×</button>
        </div>
      )}

      {/* 백업 목록 */}
      <div className="flex flex-col gap-2">
        {(backups ?? []).map((entry) => {
          const isConfirming = confirmTarget === entry.backupDir
          const isRestoring = restoring === entry.backupDir
          return (
            <div
              key={entry.backupDir}
              className="border border-[color:var(--bg-border)] rounded-lg bg-[color:var(--bg-surface)] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <FolderOpen size={13} className="text-[color:var(--text-tertiary)] flex-none" />
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-[color:var(--text-primary)] truncate">
                      {backupLabel(entry.backupDir)}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Clock size={9} className="text-[color:var(--text-tertiary)]" />
                      <span className="text-xs text-[color:var(--text-tertiary)]">
                        {formatDate(entry.createdAt)}
                      </span>
                      <span className="text-xs text-[color:var(--text-tertiary)]">·</span>
                      <span className="text-xs text-[color:var(--text-tertiary)]">
                        {entry.files.length}개 파일
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-none">
                  {!isConfirming && !isRestoring && (
                    <Button
                      variant="ghost"
                      size="xs"
                      leftIcon={<RotateCcw size={10} />}
                      onClick={() => handleRestoreConfirm(entry.backupDir)}
                    >
                      복원
                    </Button>
                  )}
                  {isConfirming && (
                    <>
                      <p className="text-xs text-[color:var(--c-yellow-fg)]">이 시점으로 복원할까요?</p>
                      <Button
                        variant="danger"
                        size="xs"
                        onClick={() => { void handleRestoreExecute(entry.backupDir) }}
                      >
                        확인
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setConfirmTarget(null)}
                      >
                        취소
                      </Button>
                    </>
                  )}
                  {isRestoring && (
                    <span className="text-xs text-[color:var(--text-tertiary)]">복원 중...</span>
                  )}
                </div>
              </div>

              {/* 백업 파일 목록 (접혀 있음) */}
              <details className="mt-2">
                <summary className="text-xs text-[color:var(--text-tertiary)] cursor-pointer hover:text-[color:var(--text-secondary)]">
                  파일 목록 ({entry.files.length}개)
                </summary>
                <div className="mt-1.5 flex flex-col gap-0.5 max-h-32 overflow-y-auto">
                  {entry.files.map((f) => (
                    <div key={f} className="flex items-center gap-1.5">
                      <FileText size={9} className="text-[color:var(--text-tertiary)] flex-none" />
                      <span className="text-xs font-mono text-[color:var(--text-tertiary)]">{f}</span>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )
        })}
      </div>
    </div>
  )
}
