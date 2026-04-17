import { useState, useEffect, useCallback } from 'react'
import { FileText, Copy, Check, Download, ChevronDown, Trash2, Clock } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { AIReport } from '../../../../shared/types/ai'
import SkillQuickToggle from './SkillQuickToggle'
import { useAIProgress } from '../../hooks/useAIProgress'
import AIProgressIndicator from '../common/AIProgressIndicator'

function ReportGenerator(): JSX.Element {
  const [report, setReport] = useState<AIReport | null>(null)
  const [copied, setCopied] = useState(false)
  const [reportType, setReportType] = useState<'daily' | 'weekly'>('daily')
  const [history, setHistory] = useState<Array<AIReport & { savedAt: string }>>([])
  const [showHistory, setShowHistory] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editContent, setEditContent] = useState('')
  const { progress, start, done, isActive } = useAIProgress()

  // 히스토리 로드
  const loadHistory = useCallback(async () => {
    try {
      const list = await window.api.briefingStore.list() as unknown as Array<AIReport & { savedAt: string }>
      // 보고서만 필터 (title에 "보고서" 포함)
      const reports = (await window.api.settings.get('reportHistory') as Array<AIReport & { savedAt: string }>) || []
      setHistory(reports)
    } catch { /* ok */ }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  const handleGenerate = async (): Promise<void> => {
    setReport(null)
    setEditMode(false)
    const reqId = start()
    try {
      const result = await window.api.ai.generateReport(reportType, reqId)
      setReport(result)
      // 히스토리에 저장
      const updated = [{ ...result, savedAt: new Date().toISOString() }, ...history].slice(0, 20)
      await window.api.settings.set('reportHistory', updated)
      setHistory(updated)
    } catch (err) {
      setReport({
        title: '오류',
        content: err instanceof Error ? err.message : '보고서 생성에 실패했습니다.',
        generatedAt: new Date().toISOString()
      })
    } finally {
      done()
    }
  }

  const handleCopy = async (): Promise<void> => {
    const content = editMode ? editContent : report?.content
    if (!content) return
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = (): void => {
    const content = editMode ? editContent : report?.content
    if (!content) return
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${report?.title || '보고서'}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const startEdit = (): void => {
    if (!report) return
    setEditContent(report.content)
    setEditMode(true)
  }

  const selectHistory = (r: AIReport & { savedAt: string }): void => {
    setReport(r)
    setShowHistory(false)
    setEditMode(false)
  }

  const deleteHistory = async (index: number): Promise<void> => {
    const updated = [...history]
    updated.splice(index, 1)
    await window.api.settings.set('reportHistory', updated)
    setHistory(updated)
  }

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="px-6 py-4 border-b border-bg-border flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">AI 업무 보고서</h2>
            <p className="text-xs text-text-secondary mt-0.5">태스크와 일정을 분석하여 보고서 초안을 자동 생성합니다</p>
          </div>
          <div className="flex items-center gap-2">
            <SkillQuickToggle target="report" />
            <button onClick={handleGenerate} disabled={isActive}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-clover-orange to-clover-blue text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
              <FileText size={14} /> {isActive ? '생성 중...' : '보고서 생성'}
            </button>
          </div>
        </div>

        {/* 유형 선택 + 히스토리 */}
        <div className="flex items-center gap-2">
          {(['daily', 'weekly'] as const).map((type) => (
            <button key={type} onClick={() => setReportType(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                reportType === type
                  ? 'bg-clover-blue/10 border-clover-blue/30 text-clover-blue'
                  : 'bg-bg-surface border-bg-border text-text-secondary hover:border-bg-border-light'
              }`}>
              {type === 'daily' ? '일일 보고서' : '주간 보고서'}
            </button>
          ))}
          {history.length > 0 && (
            <div className="relative ml-2">
              <button onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] text-text-tertiary hover:text-text-secondary bg-bg-surface border border-bg-border">
                <Clock size={10} /> 히스토리 {history.length} <ChevronDown size={9} className={`transition-transform ${showHistory ? 'rotate-180' : ''}`} />
              </button>
              {showHistory && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowHistory(false)} />
                  <div className="absolute left-0 top-full mt-1 w-72 bg-bg-surface border border-bg-border rounded-lg shadow-xl z-30 py-1 max-h-48 overflow-y-auto">
                    {history.map((r, i) => (
                      <div key={i} onClick={() => selectHistory(r)}
                        className="flex items-center justify-between px-3 py-1.5 hover:bg-bg-surface-hover cursor-pointer">
                        <div className="min-w-0">
                          <p className="text-[10px] text-text-tertiary font-mono">
                            {new Date(r.savedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-xs text-text-secondary truncate">{r.title}</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); deleteHistory(i) }}
                          className="p-1 text-text-tertiary hover:text-red-400"><Trash2 size={10} /></button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto">
        {isActive && (
          <div className="p-6 flex flex-col items-center gap-3">
            <AIProgressIndicator progress={progress} showStreamPreview className="w-full max-w-2xl" />
          </div>
        )}

        {report && !isActive && (
          <div className="p-6">
            {/* 보고서 카드 */}
            <div className="bg-bg-surface border border-bg-border rounded-xl overflow-hidden">
              {/* 도구 바 */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-bg-border bg-bg-primary">
                <span className="text-xs font-semibold text-text-primary">{report.title}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => editMode ? setEditMode(false) : startEdit()}
                    className={`px-2 py-1 rounded text-[10px] transition-colors ${
                      editMode ? 'bg-clover-blue/10 text-clover-blue' : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
                    }`}>
                    {editMode ? '미리보기' : '편집'}
                  </button>
                  <button onClick={handleCopy}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-text-secondary hover:text-text-primary hover:bg-bg-surface">
                    {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                    {copied ? '복사됨' : '복사'}
                  </button>
                  <button onClick={handleDownload}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-text-secondary hover:text-text-primary hover:bg-bg-surface">
                    <Download size={10} /> .md 저장
                  </button>
                </div>
              </div>

              {/* 내용 */}
              <div className="p-5">
                {editMode ? (
                  <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)}
                    className="w-full min-h-[400px] bg-bg-primary border border-bg-border rounded-lg p-4 text-xs text-text-primary font-mono focus:outline-none focus:border-clover-blue resize-y" />
                ) : (
                  <div className="markdown-body text-sm leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                      {editContent || report.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>

              {/* 푸터 */}
              <div className="px-4 py-2 border-t border-bg-border text-[10px] text-text-tertiary">
                생성: {new Date(report.generatedAt).toLocaleString('ko-KR')}
              </div>
            </div>
          </div>
        )}

        {!report && !isActive && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FileText size={40} className="text-text-tertiary mb-3" />
            <p className="text-sm text-text-secondary">보고서 유형을 선택하고 "생성" 버튼을 누르세요</p>
            <p className="text-[10px] text-text-tertiary mt-1">두레이 태스크와 일정을 분석하여 보고서를 작성합니다</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ReportGenerator
