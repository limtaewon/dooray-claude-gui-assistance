import { useState, useEffect } from 'react'
import { X, Sparkles, Edit3, Loader2, Check, AlertCircle, FileText } from 'lucide-react'
import type { Skill } from '../../../../shared/types/skills'

interface Props {
  onClose: () => void
  onCreated: (skill: Skill) => void
}

type Mode = 'choose' | 'ai' | 'manual'

function SkillCreateModal({ onClose, onCreated }: Props): JSX.Element {
  const [mode, setMode] = useState<Mode>('choose')

  // AI 생성용
  const [instruction, setInstruction] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generated, setGenerated] = useState<{ name: string; description: string; content: string } | null>(null)

  // MCP 선택 (스킬 생성 중 실시간 조회용)
  const [mcpServers, setMcpServers] = useState<string[]>([])
  const [selectedMcp, setSelectedMcp] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (mode !== 'ai') return
    window.api.mcp.list()
      .then((servers) => setMcpServers(Object.keys(servers || {})))
      .catch(() => setMcpServers([]))
  }, [mode])

  const toggleMcp = (name: string): void => {
    setSelectedMcp((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  // 직접 작성용
  const [manualName, setManualName] = useState('')

  const handleGenerate = async (): Promise<void> => {
    if (!instruction.trim()) return
    setGenerating(true); setError(null); setGenerated(null)
    try {
      const mcpList = Array.from(selectedMcp)
      const result = await window.api.ai.generateSkill(instruction, 'all', undefined, mcpList)
      setGenerated(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 생성 실패')
    } finally {
      setGenerating(false)
    }
  }

  const slugify = (s: string): string =>
    s.trim().toLowerCase()
      .replace(/[^\w가-힣\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50) || 'skill'

  const buildFrontmatter = (name: string, description: string, body: string): string => {
    return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`
  }

  const handleSaveAI = async (): Promise<void> => {
    if (!generated) return
    const filename = `${slugify(generated.name)}.md`
    const content = buildFrontmatter(generated.name, generated.description, generated.content)
    try {
      await window.api.skills.save({ filename, content })
      onCreated({ name: generated.name, filename, content, updatedAt: Date.now() })
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패')
    }
  }

  const handleSaveManual = (): void => {
    if (!manualName.trim()) return
    const name = manualName.trim()
    const filename = `${slugify(name)}.md`
    const content = `---\nname: ${name}\ndescription: \n---\n\n# ${name}\n\n스킬 내용을 작성하세요.\n`
    onCreated({ name, filename, content, updatedAt: Date.now() })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'var(--overlay-bg)' }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--bg-surface-raised)', border: '1px solid var(--bg-border)' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-bg-border flex-shrink-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-clover-blue/10 border border-clover-blue/30">
            <Sparkles size={15} className="text-clover-blue" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-text-primary">새 스킬 만들기</h2>
            <p className="text-[10px] text-text-tertiary">Claude Code 스킬 — AI로 생성하거나 직접 작성</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-surface-hover text-text-tertiary hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        {/* Mode 선택 */}
        {mode === 'choose' && (
          <div className="p-6 grid grid-cols-2 gap-4">
            <button onClick={() => setMode('ai')}
              className="group flex flex-col items-center gap-3 p-6 rounded-xl border border-bg-border bg-bg-surface hover:border-clover-blue/50 hover:bg-clover-blue/5 transition-all">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-clover-orange/15 to-clover-blue/15 border border-clover-blue/20 group-hover:scale-110 transition-transform">
                <Sparkles size={24} className="text-clover-blue" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-text-primary">AI로 만들기</p>
                <p className="text-[11px] text-text-tertiary mt-1 leading-relaxed">
                  원하는 스킬을 자연어로 설명하면<br/>AI가 이름·설명·본문까지 생성
                </p>
              </div>
            </button>
            <button onClick={() => setMode('manual')}
              className="group flex flex-col items-center gap-3 p-6 rounded-xl border border-bg-border bg-bg-surface hover:border-clover-blue/50 hover:bg-clover-blue/5 transition-all">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-bg-subtle border border-bg-border group-hover:scale-110 transition-transform">
                <Edit3 size={24} className="text-text-secondary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-text-primary">직접 작성</p>
                <p className="text-[11px] text-text-tertiary mt-1 leading-relaxed">
                  이름만 입력하고<br/>빈 에디터에서 작성
                </p>
              </div>
            </button>
          </div>
        )}

        {/* AI 생성 모드 */}
        {mode === 'ai' && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <div>
              <label className="text-[11px] font-semibold text-text-secondary block mb-1.5">
                어떤 스킬을 만들고 싶으세요?
              </label>
              <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)}
                placeholder="예) React 컴포넌트 리뷰할 때 쓸 스킬. 접근성, 성능, 타입 안전성 순서로 체크하고 개선안 제시&#10;예) 커밋 메시지 작성 도우미. Conventional Commits 규칙에 맞춰 한국어로 생성"
                className="w-full min-h-[120px] px-3 py-2.5 rounded-lg bg-bg-subtle border border-bg-border text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue resize-y"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-text-tertiary">구체적일수록 좋습니다 · 모델: Opus (고정)</span>
                <button onClick={handleGenerate} disabled={generating || !instruction.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-clover-orange to-clover-blue disabled:opacity-40 hover:opacity-90">
                  {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {generating ? '스킬 생성 중...' : generated ? '다시 생성' : `생성하기${selectedMcp.size > 0 ? ` (MCP ${selectedMcp.size})` : ''}`}
                </button>
              </div>
            </div>

            {/* MCP 서버 선택 — 스킬 생성 중 실시간 데이터 조회용 */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[11px] font-semibold text-text-secondary">MCP 서버 활용 (선택)</span>
                <span className="text-[10px] text-text-tertiary">선택한 MCP로 실제 ID·값을 조회해 스킬에 박아넣습니다</span>
              </div>
              {mcpServers.length === 0 ? (
                <div className="px-3 py-2 rounded-lg bg-bg-subtle border border-bg-border text-[10px] text-text-tertiary">
                  등록된 MCP 서버가 없습니다 (MCP 탭에서 추가 가능)
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {mcpServers.map((name) => {
                    const checked = selectedMcp.has(name)
                    return (
                      <button key={name} onClick={() => toggleMcp(name)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] border transition-colors ${
                          checked
                            ? 'bg-clover-blue/15 border-clover-blue/40 text-clover-blue font-medium'
                            : 'bg-bg-subtle border-bg-border text-text-secondary hover:text-text-primary hover:border-bg-border-light'
                        }`}>
                        <span className={`w-3 h-3 rounded border flex items-center justify-center flex-shrink-0 ${
                          checked ? 'bg-clover-blue border-clover-blue' : 'border-bg-border-light'
                        }`}>
                          {checked && <span className="text-white text-[8px]">✓</span>}
                        </span>
                        {name}
                      </button>
                    )
                  })}
                </div>
              )}
              {selectedMcp.size > 0 && (
                <p className="text-[10px] text-clover-orange mt-1.5">
                  ⚠ MCP 조회는 시간이 더 걸려요 (30초~2분). 비용도 증가.
                </p>
              )}
            </div>

            {/* 생성 결과 미리보기 */}
            {generated && (
              <div className="rounded-xl border border-clover-blue/30 bg-clover-blue/5 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-clover-blue/20 bg-clover-blue/10">
                  <Check size={12} className="text-clover-blue" />
                  <span className="text-xs font-semibold text-text-primary">{generated.name}</span>
                </div>
                <div className="p-3 space-y-2">
                  <div>
                    <div className="text-[10px] font-semibold text-text-tertiary mb-0.5">설명</div>
                    <p className="text-xs text-text-secondary">{generated.description}</p>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-text-tertiary mb-0.5">본문</div>
                    <pre className="text-[11px] text-text-primary bg-bg-subtle rounded p-2 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                      {generated.content}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-red-500/10 text-red-500 border border-red-500/30">
                <AlertCircle size={13} /> {error}
              </div>
            )}
          </div>
        )}

        {/* 직접 작성 모드 */}
        {mode === 'manual' && (
          <div className="p-6 space-y-4">
            <div>
              <label className="text-[11px] font-semibold text-text-secondary block mb-1.5">스킬 이름</label>
              <input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)}
                placeholder="예) code-reviewer, commit-helper"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && manualName.trim()) handleSaveManual() }}
                className="w-full px-3 py-2 rounded-lg bg-bg-subtle border border-bg-border text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue"
              />
              <p className="text-[10px] text-text-tertiary mt-1.5">
                <FileText size={9} className="inline mr-0.5" />
                파일로 저장 시: <span className="font-mono text-text-secondary">{manualName.trim() ? slugify(manualName) : 'skill-name'}.md</span>
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        {mode !== 'choose' && (
          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-bg-border flex-shrink-0">
            <button onClick={() => { setMode('choose'); setGenerated(null); setError(null); setInstruction(''); setManualName('') }}
              className="text-xs text-text-tertiary hover:text-text-secondary">
              ← 뒤로
            </button>
            <div className="flex items-center gap-2">
              <button onClick={onClose}
                className="px-4 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover">
                취소
              </button>
              {mode === 'ai' ? (
                <button onClick={handleSaveAI} disabled={!generated}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-clover-blue hover:bg-clover-blue/90 disabled:opacity-40">
                  <Check size={12} /> 저장하기
                </button>
              ) : (
                <button onClick={handleSaveManual} disabled={!manualName.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-clover-blue hover:bg-clover-blue/90 disabled:opacity-40">
                  <Check size={12} /> 만들기
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SkillCreateModal
