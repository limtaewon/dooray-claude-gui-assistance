import { useState } from 'react'
import Editor from '@monaco-editor/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { Pencil, Eye, Sparkles, Loader2, AlertCircle, Check } from 'lucide-react'
import { useToast } from '../common/ds'

interface SkillEditorProps {
  filename: string
  content: string
  onChange: (value: string) => void
}

type Mode = 'edit' | 'preview'

/**
 * AI 개선 패널 상태 — null이면 숨김, 'input'이면 지시 입력, 'loading'이면 생성 중,
 * 'review'이면 결과 검토 대기 중.
 */
type AIPanel = 'input' | 'loading' | 'review'

interface AIResult {
  name: string
  description: string
  content: string
}

/** SKILL.md frontmatter에서 name/description 추출 */
function parseFrontmatter(body: string): { name: string; description: string } {
  const m = body.match(/^\s*---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return { name: '', description: '' }
  const nameMatch = m[1].match(/^\s*name\s*:\s*(.+?)\s*$/m)
  const descMatch = m[1].match(/^\s*description\s*:\s*(.+?)\s*$/m)
  return {
    name: nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, '') : '',
    description: descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, '') : ''
  }
}

/** AI 결과를 frontmatter + 본문으로 직렬화 */
function buildContent(name: string, description: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`
}

function SkillEditor({ filename, content, onChange }: SkillEditorProps): JSX.Element {
  const toast = useToast()
  const [mode, setMode] = useState<Mode>('edit')

  // AI 개선 패널
  const [aiPanel, setAiPanel] = useState<AIPanel | null>(null)
  const [aiInstruction, setAiInstruction] = useState('')
  const [aiResult, setAiResult] = useState<AIResult | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)

  const handleAIImprove = async (): Promise<void> => {
    if (!aiInstruction.trim()) return
    setAiPanel('loading')
    setAiError(null)
    setAiResult(null)
    try {
      // 현재 스킬 내용을 request에 포함하여 개선 요청.
      // generateSkill의 request 파라미터에 기존 본문 + 사용자 지시를 합쳐 전달.
      const request = [
        '[기존 스킬 내용]',
        content,
        '',
        '[개선 지시]',
        aiInstruction.trim(),
        '',
        '위 기존 스킬을 개선 지시에 따라 개선해주세요. 스킬의 의도와 목적은 최대한 보존하면서 개선하세요.'
      ].join('\n')
      const result = await window.api.ai.generateSkill(request, 'all')
      setAiResult(result)
      setAiPanel('review')
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI 개선 실패')
      setAiPanel('input')
    }
  }

  /** AI 결과를 에디터에 적용 (저장은 사용자가 직접). */
  const handleApplyAI = (): void => {
    if (!aiResult) return
    const newContent = buildContent(aiResult.name, aiResult.description, aiResult.content)
    onChange(newContent)
    setAiPanel(null)
    setAiInstruction('')
    setAiResult(null)
    toast.success('AI 개선 내용이 에디터에 적용됐습니다', '검토 후 저장 버튼을 눌러주세요')
  }

  const handleDiscardAI = (): void => {
    setAiPanel(null)
    setAiInstruction('')
    setAiResult(null)
    setAiError(null)
  }

  return (
    <div className="h-full flex flex-col">
      {/* 툴바 */}
      <div className="flex items-center h-9 px-4 bg-bg-surface border-b border-bg-border gap-3 flex-shrink-0">
        <span className="text-xs font-mono text-text-secondary">{filename}</span>
        <div className="flex-1" />
        {/* AI 개선 버튼 */}
        <button
          type="button"
          onClick={() => setAiPanel(aiPanel ? null : 'input')}
          disabled={aiPanel === 'loading'}
          className={`flex items-center gap-1 px-2 py-0.5 text-[calc(11px_*_var(--app-font-scale,1))] rounded-md border transition-colors ${
            aiPanel
              ? 'bg-clauday-orange/15 text-clauday-orange border-clauday-orange/40'
              : 'text-text-tertiary border-transparent hover:text-clauday-blue hover:border-clauday-blue/30'
          }`}
          title="AI로 스킬 개선"
        >
          <Sparkles size={11} />
          AI 개선
        </button>
        {/* 편집/미리보기 토글 */}
        <div className="flex items-center rounded-md border border-bg-border overflow-hidden">
          <button
            type="button"
            onClick={() => setMode('edit')}
            className={`flex items-center gap-1 px-2 py-0.5 text-[calc(11px_*_var(--app-font-scale,1))] transition-colors ${
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
            className={`flex items-center gap-1 px-2 py-0.5 text-[calc(11px_*_var(--app-font-scale,1))] border-l border-bg-border transition-colors ${
              mode === 'preview'
                ? 'bg-clauday-blue/15 text-clauday-blue'
                : 'text-text-tertiary hover:text-text-primary'
            }`}
          >
            <Eye size={11} /> 미리보기
          </button>
        </div>
      </div>

      {/* AI 개선 패널 */}
      {aiPanel && (
        <div className="flex-shrink-0 border-b border-bg-border bg-bg-subtle px-4 py-3 space-y-2">
          {aiPanel === 'input' && (
            <>
              <div className="flex items-center gap-2">
                <Sparkles size={12} className="text-clauday-orange" />
                <span className="text-[calc(11px_*_var(--app-font-scale,1))] font-semibold text-text-primary">AI로 스킬 개선</span>
                <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">현재 스킬 내용을 바탕으로 AI가 개선안을 제시합니다</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && aiInstruction.trim()) handleAIImprove() }}
                  placeholder="어떻게 개선할까요? 예) 단계를 더 구체적으로, 예시 추가, 한국어로"
                  className="flex-1 px-3 py-1.5 rounded-lg bg-bg-surface border border-bg-border text-xs text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clauday-blue"
                  autoFocus
                />
                <button
                  onClick={handleAIImprove}
                  disabled={!aiInstruction.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-clauday-orange to-clauday-blue disabled:opacity-40 hover:opacity-90"
                >
                  <Sparkles size={11} /> 개선하기
                </button>
                <button onClick={handleDiscardAI} className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary hover:text-text-primary px-1">
                  취소
                </button>
              </div>
              {aiError && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-red-500/10 text-red-500 border border-red-500/30">
                  <AlertCircle size={12} /> {aiError}
                </div>
              )}
            </>
          )}
          {aiPanel === 'loading' && (
            <div className="flex items-center gap-2 py-1 text-xs text-text-secondary">
              <Loader2 size={13} className="animate-spin text-clauday-blue" />
              AI가 스킬을 개선하는 중입니다... (모델: Opus, 15초~1분 소요)
            </div>
          )}
          {aiPanel === 'review' && aiResult && (
            <>
              <div className="flex items-center gap-2">
                <Check size={12} className="text-emerald-500" />
                <span className="text-[calc(11px_*_var(--app-font-scale,1))] font-semibold text-text-primary">AI 개선 완료 — 검토 후 적용하세요</span>
              </div>
              <div className="rounded-lg border border-clauday-blue/30 bg-clauday-blue/5 p-3 space-y-1.5 text-xs">
                <div>
                  <span className="text-[calc(10px_*_var(--app-font-scale,1))] font-semibold text-text-tertiary">이름</span>
                  <p className="text-text-primary mt-0.5">{aiResult.name}</p>
                </div>
                <div>
                  <span className="text-[calc(10px_*_var(--app-font-scale,1))] font-semibold text-text-tertiary">설명</span>
                  <p className="text-text-secondary mt-0.5">{aiResult.description}</p>
                </div>
                <div>
                  <span className="text-[calc(10px_*_var(--app-font-scale,1))] font-semibold text-text-tertiary">본문 미리보기</span>
                  <pre className="mt-0.5 text-[calc(11px_*_var(--app-font-scale,1))] font-mono text-text-primary bg-bg-subtle rounded p-2 whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed">
                    {aiResult.content.slice(0, 400)}{aiResult.content.length > 400 ? '...' : ''}
                  </pre>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleApplyAI}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-clauday-blue hover:bg-clauday-blue/90"
                >
                  <Check size={11} /> 에디터에 적용
                </button>
                <button
                  onClick={() => setAiPanel('input')}
                  className="px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover border border-bg-border"
                >
                  다시 시도
                </button>
                <button onClick={handleDiscardAI} className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary hover:text-text-primary px-1">
                  닫기
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 에디터 / 미리보기 */}
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
export { parseFrontmatter, buildContent }
