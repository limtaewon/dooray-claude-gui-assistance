import Editor from '@monaco-editor/react'

interface SkillEditorProps {
  filename: string
  content: string
  onChange: (value: string) => void
}

function SkillEditor({ filename, content, onChange }: SkillEditorProps): JSX.Element {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center h-9 px-4 bg-bg-surface border-b border-bg-border">
        <span className="text-xs font-mono text-text-secondary">{filename}</span>
      </div>
      <div className="flex-1">
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
      </div>
    </div>
  )
}

export default SkillEditor
