import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { DiffEditor } from '@monaco-editor/react'
import { FileDiff, X } from 'lucide-react'
import type { GitFileDiffContent, GitFileDiffParams } from '@shared/git/scmTypes'
import { useTheme } from '../../../hooks/useTheme'
import { LoadingView } from '../../common/ds'

/** 확장자 → Monaco 언어. 목록에 없으면 plaintext 로 두고 하이라이트를 포기한다. */
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript',
  json: 'json', css: 'css', scss: 'scss', html: 'html', md: 'markdown', yml: 'yaml', yaml: 'yaml',
  sh: 'shell', bash: 'shell', zsh: 'shell', py: 'python', java: 'java', kt: 'kotlin', go: 'go',
  rs: 'rust', sql: 'sql', xml: 'xml', toml: 'ini', ini: 'ini'
}

function languageOf(path: string): string {
  return LANGUAGE_BY_EXTENSION[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'plaintext'
}

export interface DiffRequest extends GitFileDiffParams {
  /** 헤더에 붙일 부제 — 커밋 제목이나 '스테이징됨' 등 */
  caption?: string
}

interface DiffViewerOverlayProps {
  request: DiffRequest
  onClose: () => void
}

/**
 * 파일 diff 오버레이. 터미널 탭 스키마(PTY 전용)를 건드리지 않으려고 중앙 탭이 아니라
 * `document.body` 포털 오버레이로 띄운다 — xterm portal 순회 불변식을 유지하기 위함.
 */
function DiffViewerOverlay({ request, onClose }: DiffViewerOverlayProps): JSX.Element {
  const { theme } = useTheme()
  const [diff, setDiff] = useState<GitFileDiffContent | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDiff(null)
    setError(null)
    window.api.git.scm
      .fileDiff(request)
      .then((result) => { if (!cancelled) setDiff(result) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [request])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const binary = diff?.originalBinary || diff?.modifiedBinary

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg-primary">
      <div className="flex items-center gap-2 px-4 h-11 flex-none border-b border-bg-border bg-bg-surface">
        <FileDiff size={14} className="text-text-secondary flex-none" />
        <span className="text-[calc(12.5px_*_var(--app-font-scale,1))] font-medium text-text-primary truncate">
          {request.path}
        </span>
        {request.caption && (
          <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary truncate">
            {request.caption}
          </span>
        )}
        <button onClick={onClose} className="ds-btn ghost icon ml-auto flex-none" aria-label="diff 닫기">
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 min-h-0">
        {error ? (
          <div className="h-full flex items-center justify-center px-8 text-center text-[calc(12px_*_var(--app-font-scale,1))] text-text-secondary">
            diff 를 불러오지 못했습니다 — {error}
          </div>
        ) : !diff ? (
          <LoadingView label="diff 를 불러오는 중" />
        ) : binary ? (
          <div className="h-full flex items-center justify-center text-[calc(12px_*_var(--app-font-scale,1))] text-text-secondary">
            바이너리 파일은 비교할 수 없습니다.
          </div>
        ) : diff.tooLarge ? (
          <div className="h-full flex flex-col items-center justify-center gap-1 px-8 text-center">
            <p className="text-[calc(12.5px_*_var(--app-font-scale,1))] text-text-primary">
              변경이 너무 커서 표시하지 않습니다
            </p>
            <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary">
              {diff.tooLarge.lines
                ? `${diff.tooLarge.lines.toLocaleString()}줄 이상`
                : `${Math.round((diff.tooLarge.characters ?? 0) / 1_000_000)}MB 이상`}
              {' — 에디터가 멈추는 것을 막기 위해 렌더를 건너뜁니다'}
            </p>
          </div>
        ) : (
          <DiffEditor
            height="100%"
            language={languageOf(request.path)}
            original={diff.original}
            modified={diff.modified}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            options={{
              readOnly: true,
              renderSideBySide: true,
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              fontSize: 12,
              renderOverviewRuler: true,
              automaticLayout: true
            }}
          />
        )}
      </div>
    </div>,
    document.body
  )
}

export default DiffViewerOverlay
