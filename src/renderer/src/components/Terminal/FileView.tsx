import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Save, RotateCcw, ExternalLink, AlertTriangle, Eye, Code2 } from 'lucide-react'
import type { FileTabRequest, TextFileWriteReason } from '@shared/types/textFile'
import { previewUrlForPath } from '@shared/types/previewUrl'
import { useTheme } from '../../hooks/useTheme'
import { languageOf } from '../common/monacoLanguage'
import { filePreviewKind } from './filePreviewKind'
import { LoadingView, useToast } from '../common/ds'
import Button from '../common/ds/Button'

interface FileViewProps {
  request: FileTabRequest
  /** 저장 여부가 탭 제목의 • 표시로 이어진다 — 호스트가 알아야 한다. */
  onDirtyChange?: (dirty: boolean) => void
}

const WRITE_FAIL_MESSAGE: Record<TextFileWriteReason, string> = {
  conflict: '저장하지 않았습니다 — 그 사이 다른 곳에서 이 파일이 바뀌었습니다',
  'not-found': '저장하지 못했습니다 — 파일이 사라졌습니다',
  'write-failed': '저장하지 못했습니다 — 쓰기 권한을 확인해 주세요'
}

/**
 * 앱 안에서 파일을 열어 고치는 탭. 터미널에서 ⌘클릭한 경로가 여기로 온다.
 *
 * 저장은 ⌘S. 읽은 시점의 mtime 을 함께 보내 그 사이 파일이 바뀌었으면 덮어쓰지 않는다 —
 * 터미널에서 돌린 스크립트·git 이 같은 파일을 건드리는 일이 흔한 화면이라서다.
 */
/**
 * 소스 대신 렌더 결과를 보여준다.
 *
 * HTML 은 전용 스킴(`clauday-preview://`)으로 서빙한 URL 을 iframe 에 물린다. `srcdoc` 은
 * 문서에 자체 URL 이 없어 페이지 안 앵커(`href="#x"`)를 누르면 프레임이 문서를 떠나 백지가 됐다.
 *
 * 보안은 세 겹이다: ①`allow-scripts` 를 주지 않아 스크립트가 아예 안 돈다 ②앱과 다른 출처라
 * 프레임이 앱 DOM 에 닿지 못한다 ③main 이 응답에 CSP 를 붙여 원격 요청까지 막는다.
 * `allow-same-origin` 은 자체 출처를 유지해 앵커·상대 경로 리소스를 살리기 위한 것으로,
 * 스크립트가 없으므로 그 출처로 할 수 있는 일이 없다.
 */
function FilePreview({
  kind,
  content,
  path
}: { kind: 'markdown' | 'html'; content: string; path: string }): JSX.Element {
  if (kind === 'html') {
    return (
      <iframe
        title="파일 미리보기"
        sandbox="allow-same-origin"
        src={previewUrlForPath(path)}
        className="w-full h-full border-0 bg-white"
      />
    )
  }
  return (
    <div className="h-full overflow-auto px-6 py-4">
      <div className="markdown-body max-w-[900px]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  )
}

function FileView({ request, onDirtyChange }: FileViewProps): JSX.Element {
  const { theme } = useTheme()
  const toast = useToast()
  const [content, setContent] = useState<string | null>(null)
  const [savedContent, setSavedContent] = useState('')
  const [mtimeMs, setMtimeMs] = useState<number | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // 최신 값을 Monaco 의 단축키 핸들러(마운트 시 1회 등록)에서 읽기 위한 ref.
  const stateRef = useRef({ content: '', savedContent: '', mtimeMs: undefined as number | undefined })
  stateRef.current = { content: content ?? '', savedContent, mtimeMs }

  const dirty = content !== null && content !== savedContent
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  // 렌더해 볼 수 있는 형식이면 미리보기로 연다 — 문서를 열었는데 태그부터 보이면 한 번 더 눌러야 한다.
  const previewKind = useMemo(() => filePreviewKind(request.path), [request.path])
  const [showPreview, setShowPreview] = useState(previewKind !== null)

  const load = useCallback(async (): Promise<void> => {
    setError(null)
    const result = await window.api.file.readText(request.path)
    if (!result.ok || result.content === undefined) {
      setError(`파일을 열지 못했습니다 (${result.reason ?? 'unknown'})`)
      return
    }
    setContent(result.content)
    setSavedContent(result.content)
    setMtimeMs(result.mtimeMs)
  }, [request.path])

  useEffect(() => { void load() }, [load])

  const save = useCallback(async (): Promise<void> => {
    const { content: current, savedContent: saved, mtimeMs: expected } = stateRef.current
    if (current === saved) return
    setSaving(true)
    try {
      const result = await window.api.file.writeText({
        path: request.path,
        content: current,
        expectedMtimeMs: expected
      })
      if (!result.ok) {
        toast.error(WRITE_FAIL_MESSAGE[result.reason ?? 'write-failed'])
        return
      }
      setSavedContent(current)
      setMtimeMs(result.mtimeMs)
    } finally {
      setSaving(false)
    }
  }, [request.path, toast])

  const handleMount = useCallback<OnMount>((editor, monaco) => {
    // ⌘S / Ctrl+S — Monaco 안에서 눌러야 잡히므로 에디터에 직접 건다.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => { void save() })
    if (request.line && request.line > 0) {
      editor.revealLineInCenter(request.line)
      editor.setPosition({ lineNumber: request.line, column: 1 })
      editor.focus()
    }
  }, [request.line, save])

  const fileName = request.path.split('/').pop() || request.path

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-text-secondary">
        <AlertTriangle size={20} className="text-c-red-fg" />
        <p className="text-[calc(12px_*_var(--app-font-scale,1))]">{error}</p>
        <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary">{request.path}</p>
        <Button size="sm" variant="secondary" onClick={() => void window.api.shell.openPath(request.path)}>
          <ExternalLink size={12} /> 기본 앱으로 열기
        </Button>
      </div>
    )
  }

  if (content === null) return <LoadingView label="파일을 여는 중" />

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-none flex items-center gap-2 px-3 h-9 border-b border-bg-border bg-bg-surface">
        <span className="text-[calc(12px_*_var(--app-font-scale,1))] text-text-primary font-medium truncate">
          {fileName}{dirty && ' •'}
        </span>
        <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary truncate min-w-0 flex-1">
          {request.path}
        </span>
        {previewKind && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowPreview((v) => !v)}
            title={showPreview ? '소스 보기' : '렌더 결과 보기'}
          >
            {showPreview ? <><Code2 size={12} /> 소스</> : <><Eye size={12} /> 미리보기</>}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={saving} title="디스크 내용으로 되돌리기">
          <RotateCcw size={12} /> 되돌리기
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void save()} disabled={!dirty || saving} title="저장 (⌘S)">
          <Save size={12} /> 저장
        </Button>
        {/* 아이콘만 두면 무슨 버튼인지 안 읽힌다 — 탭바에서 겪은 것과 같은 문제라 라벨을 붙인다. */}
        <Button size="sm" variant="ghost" onClick={() => void window.api.shell.openPath(request.path)} title="OS 기본 앱으로 열기 (⌥⌘클릭도 같다)">
          <ExternalLink size={12} /> 기본 앱
        </Button>
      </div>
      <div className="flex-1 min-h-0">
        {showPreview && previewKind ? (
          <FilePreview kind={previewKind} content={content} path={request.path} />
        ) : (
          <Editor
            height="100%"
            path={request.path}
            language={languageOf(request.path)}
            value={content}
            onChange={(next) => setContent(next ?? '')}
            onMount={handleMount}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              scrollBeyondLastLine: false,
              renderWhitespace: 'selection'
            }}
          />
        )}
      </div>
    </div>
  )
}

export default FileView
