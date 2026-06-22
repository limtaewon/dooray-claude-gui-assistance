/**
 * RawFileEditor.tsx — 번들 파일 원문 Monaco 에디터 컴포넌트
 *
 * 파일 선택 후 원문을 Monaco Editor 로 편집한다.
 * 편집 내용은 즉시 저장되지 않고 "draft 에 추가" 버튼으로 DraftFileEdit 를 생성한다.
 *
 * .sh 파일 선택 시 상단에 빨간 경고 배너를 표시한다.
 * Monaco 테마는 useTheme 으로 다크/라이트 연동한다.
 */

import { useState, useCallback, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { FileText, AlertTriangle, FolderOpen, Plus } from 'lucide-react'
import type { HarnessDraft, DraftFileEdit } from '@shared/types/harness-edit'
import Button from '@/components/common/ds/Button'
import { useTheme } from '@/hooks/useTheme'

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export interface RawFileEditorProps {
  bundlePath: string
  fileTree: string[]
  selectedRelPath: string | null
  draft: HarnessDraft
  onEdit: (edit: DraftFileEdit) => void
  onSelectFile: (relPath: string) => void
}

// ─────────────────────────────────────────────
// 내부 유틸
// ─────────────────────────────────────────────

/** 파일 확장자에 따른 Monaco 언어 ID */
function getMonacoLanguage(relPath: string): string {
  if (relPath.endsWith('.md')) return 'markdown'
  if (relPath.endsWith('.sh') || relPath.endsWith('.bash')) return 'shell'
  if (relPath.endsWith('.ts') || relPath.endsWith('.tsx')) return 'typescript'
  if (relPath.endsWith('.js')) return 'javascript'
  if (relPath.endsWith('.json')) return 'json'
  if (relPath.endsWith('.yaml') || relPath.endsWith('.yml')) return 'yaml'
  return 'plaintext'
}

/** 파일명 변환: relPath → 표시 이름 */
function displayName(relPath: string): string {
  return relPath.split('/').pop() ?? relPath
}

// ─────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────

/**
 * 번들 파일 원문 Monaco 에디터.
 *
 * 좌측 파일 트리에서 파일을 선택하면 원본 내용을 로드한다.
 * draft 에 이미 편집이 있는 파일은 draft 내용을 초기값으로 표시한다.
 * 편집 후 "draft 에 추가" 버튼으로 변경을 draft 에 반영한다.
 */
export function RawFileEditor({
  bundlePath,
  fileTree,
  selectedRelPath,
  draft,
  onEdit,
  onSelectFile,
}: RawFileEditorProps): JSX.Element {
  const { theme } = useTheme()

  const [fileContent, setFileContent] = useState<string>('')
  const [baseContent, setBaseContent] = useState<string>('')
  const [editorValue, setEditorValue] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  // 파일 선택 시 원본 로드
  useEffect(() => {
    if (!selectedRelPath) return
    const existingDraft = draft.edits[selectedRelPath]
    if (existingDraft) {
      // draft 에 이미 편집 내용이 있으면 draft 내용으로 초기화
      setFileContent(existingDraft.draftContent)
      setBaseContent(existingDraft.baseContent)
      setEditorValue(existingDraft.draftContent)
      setDirty(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    window.api.harness.edit.readFile(bundlePath, selectedRelPath)
      .then(({ content }) => {
        setFileContent(content)
        setBaseContent(content)
        setEditorValue(content)
        setDirty(false)
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        setLoading(false)
      })
  // draft.edits 는 의도적으로 의존성에 포함하지 않음 — 파일 선택 시점만 로드
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRelPath, bundlePath])

  // draft 가 외부에서 revert 되면 editorValue 도 초기화
  useEffect(() => {
    if (!selectedRelPath) return
    if (!(selectedRelPath in draft.edits)) {
      // draft 에서 제거됨 → 원본으로 복귀
      setEditorValue(baseContent)
      setDirty(false)
    }
  }, [draft.edits, selectedRelPath, baseContent])

  const handleEditorChange = useCallback((value: string | undefined) => {
    const v = value ?? ''
    setEditorValue(v)
    setDirty(v !== fileContent)
  }, [fileContent])

  const handleAddToDraft = useCallback(() => {
    if (!selectedRelPath) return
    const edit: DraftFileEdit = {
      relPath: selectedRelPath,
      baseContent,
      draftContent: editorValue,
      origin: 'raw',
      editedAt: new Date().toISOString(),
    }
    onEdit(edit)
    setFileContent(editorValue)
    setDirty(false)
  }, [selectedRelPath, baseContent, editorValue, onEdit])

  const isShellFile = selectedRelPath?.endsWith('.sh') ?? false

  return (
    <div className="flex h-full">
      {/* 좌측 파일 트리 */}
      <div className="w-52 flex-none border-r border-[color:var(--bg-border)] bg-[color:var(--bg-surface)] flex flex-col">
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[color:var(--bg-border)]">
          <FolderOpen size={12} className="text-[color:var(--text-tertiary)]" />
          <span className="text-xs font-semibold text-[color:var(--text-secondary)]">파일 목록</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {fileTree.length === 0 ? (
            <p className="text-xs text-[color:var(--text-tertiary)] px-3 py-2 italic">파일 없음</p>
          ) : (
            fileTree.map((relPath) => {
              const inDraft = relPath in draft.edits
              const isSelected = relPath === selectedRelPath
              return (
                <button
                  key={relPath}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-[color:var(--bg-active)] text-[color:var(--text-primary)]'
                      : 'text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-surface-hover)] hover:text-[color:var(--text-primary)]'
                  }`}
                  onClick={() => onSelectFile(relPath)}
                  title={relPath}
                >
                  <FileText size={10} className="flex-none text-[color:var(--text-tertiary)]" />
                  <span className="truncate">{displayName(relPath)}</span>
                  {inDraft && (
                    <span className="flex-none w-1.5 h-1.5 rounded-full bg-[color:var(--c-blue-solid)] ml-auto" />
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* 우측 에디터 영역 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[color:var(--bg-border)] bg-[color:var(--bg-surface)] flex-shrink-0">
          {selectedRelPath ? (
            <>
              <FileText size={12} className="text-[color:var(--text-tertiary)] flex-none" />
              <span className="text-xs font-mono text-[color:var(--text-primary)] truncate">
                {selectedRelPath}
              </span>
              {dirty && (
                <span className="flex-none w-1.5 h-1.5 rounded-full bg-[color:var(--c-orange-solid)]" title="저장되지 않은 변경" />
              )}
              <div className="ml-auto flex items-center gap-1.5">
                {dirty && (
                  <Button
                    variant="primary"
                    size="xs"
                    leftIcon={<Plus size={10} />}
                    onClick={handleAddToDraft}
                    title="이 변경을 draft 에 추가"
                  >
                    draft 에 추가
                  </Button>
                )}
              </div>
            </>
          ) : (
            <span className="text-xs text-[color:var(--text-tertiary)]">
              좌측에서 파일을 선택하세요
            </span>
          )}
        </div>

        {/* 셸 스크립트 경고 배너 */}
        {isShellFile && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[color:var(--c-red-bg)] border-b border-[color:var(--c-red-fg)] flex-shrink-0">
            <AlertTriangle size={12} className="text-[color:var(--c-red-fg)] flex-none" />
            <span className="text-xs text-[color:var(--c-red-fg)] font-medium">
              게이트 스크립트(.sh) 입니다. 텍스트로만 저장되며 자동 실행되지 않습니다. 스크립트 의미론을 직접 확인하세요.
            </span>
          </div>
        )}

        {/* 에디터 본체 */}
        <div className="flex-1 min-h-0">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-[color:var(--text-tertiary)]">파일 로딩 중...</p>
            </div>
          )}
          {loadError && (
            <div className="flex items-center justify-center h-full p-4">
              <p className="text-sm text-[color:var(--c-red-fg)]">오류: {loadError}</p>
            </div>
          )}
          {!selectedRelPath && !loading && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-[color:var(--text-tertiary)]">파일을 선택하면 원문을 편집할 수 있습니다</p>
            </div>
          )}
          {selectedRelPath && !loading && !loadError && (
            <Editor
              height="100%"
              language={getMonacoLanguage(selectedRelPath)}
              value={editorValue}
              onChange={handleEditorChange}
              theme={theme === 'dark' ? 'vs-dark' : 'light'}
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                lineHeight: 18,
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                renderLineHighlight: 'line',
                smoothScrolling: true,
                cursorBlinking: 'smooth',
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
