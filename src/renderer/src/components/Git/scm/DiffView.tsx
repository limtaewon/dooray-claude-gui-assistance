import { useEffect, useState } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import { FileDiff } from 'lucide-react'
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

/** 같은 파일·같은 비교 대상이면 탭을 새로 만들지 않고 재사용하기 위한 안정 키. */
export function diffTabId(request: DiffRequest): string {
  const source =
    request.source.kind === 'commit' ? `commit:${request.source.commitOid}` : request.source.kind
  return `diff ${request.repoPath} ${source} ${request.path}`
}

/**
 * 파일 diff 화면. 터미널 탭 하나로 들어간다 — 전체 화면 오버레이로 띄우면 커스텀 타이틀바(신호등
 * 버튼)를 덮어버리고, 터미널로 돌아가려면 매번 닫아야 해서 비교하며 작업하기 어렵다.
 */
function DiffView({ request }: { request: DiffRequest }): JSX.Element {
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

  const binary = diff?.originalBinary || diff?.modifiedBinary

  return (
    <div className="flex flex-col h-full min-h-0 bg-bg-primary">
      <div className="flex items-center gap-2 px-3 h-8 flex-none border-b border-bg-border bg-bg-surface">
        <FileDiff size={12} className="text-text-tertiary flex-none" />
        <span className="text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-primary truncate font-mono">
          {request.path}
        </span>
        {request.caption && (
          <span className="text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary truncate">
            {request.caption}
          </span>
        )}
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
    </div>
  )
}

export default DiffView
