/**
 * DraftDiffView.tsx — draft 편집 diff 뷰어 컴포넌트
 *
 * 각 relPath 별로 Monaco DiffEditor (baseContent ↔ draftContent) 를 표시한다.
 * 파일별로 펼치기/접기, 되돌리기 기능을 제공한다.
 *
 * Monaco DiffEditor 테마는 useTheme 으로 다크/라이트 연동한다.
 */

import { useState, useCallback } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import { ChevronDown, ChevronUp, RotateCcw, AlertTriangle, FileText, FileDiff } from 'lucide-react'
import type { HarnessDraft, DraftFileEdit } from '@shared/types/harness-edit'
import type { DraftFileEditWithStale } from './draftReducer'
import Button from '@/components/common/ds/Button'
import Chip from '@/components/common/ds/Chip'
import { useTheme } from '@/hooks/useTheme'

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export interface DraftDiffViewProps {
  draft: HarnessDraft
  onRevert: (relPath: string) => void
}

// ─────────────────────────────────────────────
// 내부 유틸
// ─────────────────────────────────────────────

/** 파일 확장자에 따른 Monaco 언어 ID */
function getMonacoLanguage(relPath: string): string {
  if (relPath.endsWith('.md')) return 'markdown'
  if (relPath.endsWith('.sh') || relPath.endsWith('.bash')) return 'shell'
  if (relPath.endsWith('.json')) return 'json'
  if (relPath.endsWith('.yaml') || relPath.endsWith('.yml')) return 'yaml'
  return 'plaintext'
}

/** origin 레이블 */
function originLabel(origin: DraftFileEdit['origin']): string {
  switch (origin) {
    case 'form': return '구조화 폼'
    case 'raw': return '원본 에디터'
    case 'ai': return 'AI 편집'
  }
}

// ─────────────────────────────────────────────
// 단일 파일 diff 패널
// ─────────────────────────────────────────────

interface FileDiffPanelProps {
  relPath: string
  edit: DraftFileEditWithStale
  onRevert: (relPath: string) => void
  monacoTheme: string
}

/** 단일 파일에 대한 diff 패널 — 펼치기/접기 + Monaco DiffEditor */
function FileDiffPanel({ relPath, edit, onRevert, monacoTheme }: FileDiffPanelProps): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const isShellFile = relPath.endsWith('.sh')

  return (
    <div className={`border rounded-lg overflow-hidden ${
      edit.stale
        ? 'border-[color:var(--c-red-fg)]'
        : isShellFile
          ? 'border-[color:var(--c-orange-fg)]'
          : 'border-[color:var(--bg-border)]'
    }`}>
      {/* 파일 헤더 — 전체 행이 펼치기/접기 클릭 타겟 */}
      <div
        className={`flex items-center gap-2 px-3 py-2 cursor-pointer select-none hover:brightness-95 transition-all ${
          edit.stale ? 'bg-[color:var(--c-red-bg)]' : isShellFile ? 'bg-[color:var(--c-orange-bg)]' : 'bg-[color:var(--bg-surface)]'
        }`}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v) } }}
      >
        <FileText size={12} className="flex-none text-[color:var(--text-tertiary)]" />
        <span className="text-xs font-mono text-[color:var(--text-primary)] flex-1 truncate" title={relPath}>
          {relPath}
        </span>

        <div className="flex items-center gap-1.5 flex-none">
          {/* origin 배지 */}
          <Chip tone={edit.origin === 'ai' ? 'violet' : edit.origin === 'form' ? 'blue' : 'neutral'} square>
            {originLabel(edit.origin)}
          </Chip>

          {/* 충돌 경고 */}
          {edit.stale && (
            <Chip tone="red" square>
              <AlertTriangle size={9} className="mr-0.5" />
              충돌
            </Chip>
          )}

          {/* 셸 파일 경고 */}
          {isShellFile && (
            <Chip tone="orange" square>
              <AlertTriangle size={9} className="mr-0.5" />
              .sh
            </Chip>
          )}

          {/* AI 명령 표시 */}
          {edit.aiCommand && (
            <span className="text-xs text-[color:var(--text-tertiary)] italic truncate max-w-32" title={edit.aiCommand}>
              "{edit.aiCommand}"
            </span>
          )}

          <Button
            variant="ghost"
            size="xs"
            leftIcon={<RotateCcw size={10} />}
            onClick={(e) => { e.stopPropagation(); onRevert(relPath) }}
            title="이 파일 변경 되돌리기"
          >
            되돌리기
          </Button>
          <span className="text-[color:var(--text-tertiary)]" aria-hidden>
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </span>
        </div>
      </div>

      {/* 충돌 안내 */}
      {edit.stale && expanded && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[color:var(--c-red-bg)] border-t border-[color:var(--c-red-fg)]">
          <AlertTriangle size={11} className="text-[color:var(--c-red-fg)] flex-none" />
          <span className="text-xs text-[color:var(--c-red-fg)]">
            외부에서 파일이 변경되어 적용할 수 없습니다. 되돌리기 후 재로드하세요.
          </span>
        </div>
      )}

      {/* Monaco DiffEditor */}
      {expanded && (
        <div style={{ height: 300 }}>
          <DiffEditor
            original={edit.baseContent}
            modified={edit.draftContent}
            language={getMonacoLanguage(relPath)}
            theme={monacoTheme}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 11,
              lineHeight: 17,
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              renderSideBySide: true,
              diffWordWrap: 'on',
            }}
          />
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────

/**
 * draft 전체 diff 뷰.
 *
 * 변경된 파일 목록을 FileDiffPanel 로 렌더링한다.
 * 파일이 없으면 빈 상태 안내를 표시한다.
 */
export function DraftDiffView({ draft, onRevert }: DraftDiffViewProps): JSX.Element {
  const { theme } = useTheme()
  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'light'

  const entries = Object.entries(draft.edits)

  const handleRevert = useCallback((relPath: string) => {
    onRevert(relPath)
  }, [onRevert])

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
        <FileDiff size={32} className="text-[color:var(--text-tertiary)]" />
        <p className="text-sm text-[color:var(--text-secondary)]">변경된 파일이 없습니다</p>
        <p className="text-xs text-[color:var(--text-tertiary)]">
          구조화 폼 또는 파일 편집기에서 편집을 시작하세요.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 mb-1">
        <FileDiff size={14} className="text-[color:var(--text-secondary)]" />
        <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">
          변경 파일 {entries.length}개 — 원본 vs 초안
        </h3>
        <p className="text-xs text-[color:var(--text-tertiary)] ml-2">
          좌측: 원본 / 우측: 초안 (빨간 선: 삭제 / 초록 선: 추가)
        </p>
      </div>

      {entries.map(([relPath, edit]) => (
        <FileDiffPanel
          key={relPath}
          relPath={relPath}
          edit={edit as DraftFileEditWithStale}
          onRevert={handleRevert}
          monacoTheme={monacoTheme}
        />
      ))}
    </div>
  )
}
