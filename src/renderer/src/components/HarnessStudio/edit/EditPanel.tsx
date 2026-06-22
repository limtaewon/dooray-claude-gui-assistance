/**
 * EditPanel.tsx — Harness Studio 편집 모드 셸 컴포넌트
 *
 * 편집 모드 ON 상태에서 렌더링된다. 편집 모드 OFF 시 이 컴포넌트는 마운트되지 않으므로
 * 기존 read-only 뷰에 대한 회귀가 없다.
 *
 * 레이아웃:
 * - 좌측 사이드바: 파일 목록(번들 fileTree) + StructuredFieldForm 진입
 * - 우측 메인 영역: 선택된 파일의 RawFileEditor 또는 StructuredFieldForm
 * - 하단 드래프트 목록: DraftDiffView (변경된 파일 목록)
 */

import { useState, useEffect, useCallback, useReducer, useRef } from 'react'
import { FileText, FileCode, Wand2, List, Eye, RotateCcw, AlertTriangle, FileDiff } from 'lucide-react'
import type { HarnessModel } from '@shared/types/harness'
import type { HarnessDraft, AgentSourceMap, DraftFileEdit, AIEditProposal } from '@shared/types/harness-edit'
import Button from '@/components/common/ds/Button'
import Chip from '@/components/common/ds/Chip'
import { draftReducer, createEmptyDraft, editCount, hasStaleEdits } from './draftReducer'
import type { DraftFileEditWithStale } from './draftReducer'
import { RawFileEditor } from './RawFileEditor'
import { StructuredFieldForm } from './StructuredFieldForm'
import { DraftDiffView } from './DraftDiffView'
import { AICommandBar } from './AICommandBar'
import { ApplyDialog } from './ApplyDialog'
import { BackupRestorePanel } from './BackupRestorePanel'

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export interface EditPanelProps {
  model: HarnessModel
  sourceMap?: AgentSourceMap
  fileTree?: string[]
  /** 편집 적용 성공 시 — 새 HarnessModel 로 뷰 갱신 */
  onModelUpdated: (newModel: HarnessModel) => void
  /** 편집 모드 취소 (미적용 변경 있으면 확인 다이얼로그) */
  onExitEdit: () => void
}

/** 메인 편집 패널 활성 뷰 */
type EditView = 'form' | 'raw' | 'diff' | 'backup'

// ─────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────

/**
 * 편집 모드 셸 — 파일 선택, 구조화 폼, raw 에디터, draft diff, AI 명령, 적용 다이얼로그를 통합.
 *
 * draft 는 useReducer(draftReducer) 로 관리한다.
 * 편집 모드 OFF 시(onExitEdit 호출) 미적용 변경이 있으면 사용자에게 확인을 구한다.
 */
export function EditPanel({
  model,
  sourceMap = {},
  fileTree = [],
  onModelUpdated,
  onExitEdit,
}: EditPanelProps): JSX.Element {
  const bundlePath = model.meta.source
  const bundleHash = model.meta.bundleHash

  // draft 상태
  const [draft, dispatch] = useReducer(
    draftReducer,
    undefined,
    () => createEmptyDraft(bundlePath, bundleHash)
  )

  // 활성 뷰 (구조화 폼 | raw 에디터 | diff | 백업)
  const [activeView, setActiveView] = useState<EditView>('form')

  // 선택된 파일 relPath (raw 에디터 용)
  const [selectedRelPath, setSelectedRelPath] = useState<string | null>(null)

  // 적용 다이얼로그 열림 여부
  const [applyOpen, setApplyOpen] = useState(false)

  // 미적용 확인 모달
  const [exitConfirmPending, setExitConfirmPending] = useState(false)

  // diff 요약 (적용 전 검증)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState<string | null>(null)

  // 전역 오류 메시지
  const [editError, setEditError] = useState<string | null>(null)

  const draftCount = editCount(draft)
  const hasStale = hasStaleEdits(draft)
  const hasAnyEdits = draftCount > 0

  // draft 가 bundleHash 변경 시 (외부 재정규화) 자동 초기화 — 충돌 방지
  const prevHashRef = useRef(bundleHash)
  useEffect(() => {
    if (prevHashRef.current !== bundleHash && hasAnyEdits) {
      // 번들이 외부 변경됨 — draft 는 stale 할 수 있음, 사용자에게 경고
      setEditError('번들이 재정규화되어 일부 변경이 충돌할 수 있습니다. 적용 전 diff 를 확인하세요.')
    }
    prevHashRef.current = bundleHash
  }, [bundleHash, hasAnyEdits])

  // ── 핸들러: 파일에서 초안 추가 ────────────────────────────────────
  const handleRawEdit = useCallback((edit: DraftFileEdit) => {
    dispatch({ type: 'ADD_OR_UPDATE', edit })
    setEditError(null)
  }, [])

  // ── 핸들러: AI 제안 승인 ──────────────────────────────────────────
  const handleAIProposalAccepted = useCallback((proposals: AIEditProposal[], command: string) => {
    for (const p of proposals) {
      // baseContent 를 미리 읽은 파일 내용으로 채운다
      // (AICommandBar 가 readFile 을 호출하고 proposal 에 함께 반환한다)
      const edit: DraftFileEdit = {
        relPath: p.relPath,
        baseContent: (p as AIEditProposal & { baseContent?: string }).baseContent ?? '',
        draftContent: p.newContent,
        origin: 'ai',
        aiCommand: command,
        editedAt: new Date().toISOString(),
      }
      dispatch({ type: 'ADD_OR_UPDATE', edit })
    }
    setEditError(null)
  }, [])

  // ── 핸들러: 파일별 되돌리기 ──────────────────────────────────────
  const handleRevert = useCallback((relPath: string) => {
    dispatch({ type: 'REVERT', relPath })
  }, [])

  // ── 핸들러: 전체 초기화 ──────────────────────────────────────────
  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET' })
    setEditError(null)
  }, [])

  // ── 핸들러: stale 표시 ────────────────────────────────────────────
  const handleMarkStale = useCallback((stalePaths: string[]) => {
    dispatch({ type: 'MARK_STALE', stalePaths })
  }, [])

  // ── 핸들러: 적용 성공 ────────────────────────────────────────────
  const handleApplySuccess = useCallback((newModel: HarnessModel, newBundleHash: string) => {
    dispatch({ type: 'CLEAR_AFTER_APPLY', newBundleHash })
    setApplyOpen(false)
    setEditError(null)
    onModelUpdated(newModel)
  }, [onModelUpdated])

  // ── 핸들러: 편집 모드 종료 ───────────────────────────────────────
  const handleExit = useCallback(() => {
    if (hasAnyEdits) {
      setExitConfirmPending(true)
    } else {
      onExitEdit()
    }
  }, [hasAnyEdits, onExitEdit])

  const handleExitConfirmed = useCallback(() => {
    setExitConfirmPending(false)
    onExitEdit()
  }, [onExitEdit])

  // ── diff 사전 검증 ────────────────────────────────────────────────
  const handleCheckDiff = useCallback(async () => {
    if (!hasAnyEdits) return
    setDiffLoading(true)
    setDiffError(null)
    try {
      const summary = await window.api.harness.edit.diff(bundlePath, draft)
      const stalePaths = summary.files.filter((f) => f.stale).map((f) => f.relPath)
      if (stalePaths.length > 0) {
        handleMarkStale(stalePaths)
      }
      setActiveView('diff')
    } catch (e) {
      setDiffError(e instanceof Error ? e.message : String(e))
    } finally {
      setDiffLoading(false)
    }
  }, [hasAnyEdits, bundlePath, draft, handleMarkStale])

  // ─────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--bg-primary)]">

      {/* 편집 모드 상단 바 */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[color:var(--bg-surface)] border-b border-[color:var(--bg-border)] flex-shrink-0">
        <Chip tone="orange" square>편집 모드</Chip>

        {/* 뷰 전환 버튼들 */}
        <Button
          variant={activeView === 'form' ? 'secondary' : 'ghost'}
          size="xs"
          leftIcon={<List size={11} />}
          onClick={() => setActiveView('form')}
        >
          구조화 폼
        </Button>
        <Button
          variant={activeView === 'raw' ? 'secondary' : 'ghost'}
          size="xs"
          leftIcon={<FileCode size={11} />}
          onClick={() => setActiveView('raw')}
        >
          파일 편집기
        </Button>
        <Button
          variant={activeView === 'diff' ? 'secondary' : 'ghost'}
          size="xs"
          leftIcon={<FileDiff size={11} />}
          onClick={() => { void handleCheckDiff() }}
          disabled={!hasAnyEdits || diffLoading}
        >
          {diffLoading ? '대조 중...' : `변경 대조${draftCount > 0 ? ` (${draftCount})` : ''}`}
        </Button>
        <Button
          variant={activeView === 'backup' ? 'secondary' : 'ghost'}
          size="xs"
          leftIcon={<RotateCcw size={11} />}
          onClick={() => setActiveView('backup')}
        >
          백업 복원
        </Button>

        <div className="ml-auto flex items-center gap-2">
          {/* 변경 배지 */}
          {draftCount > 0 && (
            <Chip tone={hasStale ? 'red' : 'blue'} square>
              변경 {draftCount}개{hasStale ? ' · 충돌' : ''}
            </Chip>
          )}

          <Button
            variant="ghost"
            size="xs"
            leftIcon={<RotateCcw size={11} />}
            onClick={handleReset}
            disabled={!hasAnyEdits}
            title="모든 변경 취소"
          >
            전체 취소
          </Button>
          <Button
            variant="primary"
            size="xs"
            onClick={() => setApplyOpen(true)}
            disabled={!hasAnyEdits || hasStale}
            title={hasStale ? '충돌 파일이 있어 적용할 수 없습니다' : '변경 사항을 파일에 적용'}
          >
            파일에 적용
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={handleExit}
          >
            편집 종료
          </Button>
        </div>
      </div>

      {/* 오류 배너 */}
      {(editError || diffError) && (
        <div className="flex items-center gap-2 px-4 py-1.5 text-xs bg-[color:var(--c-red-bg)] border-b border-[color:var(--bg-border)] flex-shrink-0">
          <AlertTriangle size={12} className="text-[color:var(--c-red-fg)] flex-none" />
          <span className="text-[color:var(--c-red-fg)]">{editError ?? diffError}</span>
          <button
            className="ml-auto text-[color:var(--c-red-fg)] opacity-70 hover:opacity-100"
            onClick={() => { setEditError(null); setDiffError(null) }}
          >
            ×
          </button>
        </div>
      )}

      {/* AI 명령 바 */}
      <div className="border-b border-[color:var(--bg-border)] flex-shrink-0">
        <AICommandBar
          model={model}
          sourceMap={sourceMap}
          fileTree={fileTree}
          bundlePath={bundlePath}
          draft={draft}
          onProposalAccepted={handleAIProposalAccepted}
        />
      </div>

      {/* 메인 편집 영역 */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeView === 'form' && (
          <div className="h-full overflow-y-auto">
            <StructuredFieldForm
              model={model}
              sourceMap={sourceMap}
              bundlePath={bundlePath}
              draft={draft}
              onEdit={handleRawEdit}
              onSelectFile={(relPath) => {
                setSelectedRelPath(relPath)
                setActiveView('raw')
              }}
            />
          </div>
        )}

        {activeView === 'raw' && (
          <RawFileEditor
            bundlePath={bundlePath}
            fileTree={fileTree}
            selectedRelPath={selectedRelPath}
            draft={draft}
            onEdit={handleRawEdit}
            onSelectFile={setSelectedRelPath}
          />
        )}

        {activeView === 'diff' && (
          <DraftDiffView
            draft={draft}
            onRevert={handleRevert}
          />
        )}

        {activeView === 'backup' && (
          <BackupRestorePanel
            bundlePath={bundlePath}
            onRestored={onModelUpdated}
          />
        )}
      </div>

      {/* 하단 파일 요약 바 */}
      {hasAnyEdits && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-t border-[color:var(--bg-border)] bg-[color:var(--bg-surface)] flex-shrink-0">
          <FileText size={11} className="text-[color:var(--text-tertiary)]" />
          <span className="text-xs text-[color:var(--text-secondary)]">
            변경된 파일:
          </span>
          <div className="flex gap-1 flex-wrap">
            {Object.keys(draft.edits).map((rp) => {
              const e = draft.edits[rp] as DraftFileEditWithStale
              return (
                <button
                  key={rp}
                  className="text-xs px-1.5 py-0.5 rounded bg-[color:var(--bg-surface-hover)] border border-[color:var(--bg-border)] text-[color:var(--text-primary)] hover:bg-[color:var(--bg-active)] transition-colors"
                  onClick={() => {
                    setSelectedRelPath(rp)
                    setActiveView('raw')
                  }}
                  title={`${rp} (${e.origin}${e.stale ? ' · 충돌' : ''})`}
                >
                  {rp.split('/').pop()}
                  {e.stale && <span className="ml-1 text-[color:var(--c-red-fg)]">!</span>}
                </button>
              )
            })}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Eye size={11} className="text-[color:var(--text-tertiary)]" />
            <button
              className="text-xs text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)]"
              onClick={() => { void handleCheckDiff() }}
            >
              diff 보기
            </button>
          </div>
        </div>
      )}

      {/* 적용 다이얼로그 */}
      <ApplyDialog
        open={applyOpen}
        bundlePath={bundlePath}
        draft={draft}
        onClose={() => setApplyOpen(false)}
        onSuccess={handleApplySuccess}
      />

      {/* 편집 종료 확인 모달 */}
      {exitConfirmPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[color:var(--bg-surface)] border border-[color:var(--bg-border)] rounded-xl p-5 w-80 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-[color:var(--c-yellow-fg)]" />
              <p className="text-sm font-semibold text-[color:var(--text-primary)]">변경 사항이 있습니다</p>
            </div>
            <p className="text-xs text-[color:var(--text-secondary)] mb-4">
              적용하지 않은 변경 {draftCount}개가 있습니다. 편집 모드를 종료하면 모든 변경이 사라집니다.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setExitConfirmPending(false)}>
                취소
              </Button>
              <Button variant="danger" size="sm" onClick={handleExitConfirmed}>
                변경 버리고 종료
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
