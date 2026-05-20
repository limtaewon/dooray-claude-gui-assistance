import { useState } from 'react'
import Editor from '@monaco-editor/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { Pencil, Eye } from 'lucide-react'

interface SkillEditorProps {
  filename: string
  content: string
  onChange: (value: string) => void
}

type Mode = 'edit' | 'preview'

function SkillEditor({ filename, content, onChange }: SkillEditorProps): JSX.Element {
  const [mode, setMode] = useState<Mode>('edit')

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center h-9 px-4 bg-bg-surface border-b border-bg-border gap-3">
        <span className="text-xs font-mono text-text-secondary">{filename}</span>
        <div className="flex-1" />
        <div className="flex items-center rounded-md border border-bg-border overflow-hidden">
          <button
            type="button"
            onClick={() => setMode('edit')}
            className={`flex items-center gap-1 px-2 py-0.5 text-[11px] transition-colors ${
              mode === 'edit'
                ? 'bg-clauday-blue/15 text-clauday-blue'
                : 'text-text-tertiary hover:text-text-primary'
            }`}
          >
            <Pencil size={11} /> 편집
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            className={`flex items-center gap-1 px-2 py-0.5 text-[11px] border-l border-bg-border transition-colors ${
              mode === 'preview'
                ? 'bg-clauday-blue/15 text-clauday-blue'
                : 'text-text-tertiary hover:text-text-primary'
            }`}
          >
            <Eye size={11} /> 미리보기
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {mode === 'edit' ? (
          <Editor
            height="100%"
            language="markdown"
            value={content}
            onChange={(value) => onChange(value || '')}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: 'JetBrains Mono, monospace',
              lineHeight: 1.6,
              padding: { top: 16 },
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2
            }}
          />
        ) : (
          <div className="h-full overflow-y-auto px-6 py-5">
            <div className="markdown-body max-w-3xl">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                {content}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SkillEditor
