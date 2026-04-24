import { useState, useEffect, useCallback } from 'react'
import { FileText, Copy, Check, Download, ChevronDown, Trash2, Clock } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { AIReport } from '../../../../shared/types/ai'
import SkillQuickToggle from './SkillQuickToggle'
import AIToolsPopover from '../common/AIToolsPopover'
import { Button } from '../common/ds'
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
    const t0 = Date.now()
    window.api.analytics.track('ai.report.start', { meta: { type: reportType } })
    try {
      const mcpServers = await AIToolsPopover.loadSelected('report')
      const result = await window.api.ai.generateReport(reportType, reqId, mcpServers)
      setReport(result)
      const updated = [{ ...result, savedAt: new Date().toISOString() }, ...history].slice(0, 20)
      await window.api.settings.set('reportHistory', updated)
      setHistory(updated)
      window.api.analytics.track('ai.report.success', { durationMs: Date.now() - t0, success: true, meta: { type: reportType } })
    } catch (err) {
      setReport({
        title: '오류',
        content: err instanceof Error ? err.message : '보고서 생성에 실패했습니다.',
        generatedAt: new Date().toISOString()
      })
      window.api.analytics.track('ai.report.error', { durationMs: Date.now() - t0, success: false })
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-bg-border flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <FileText size={16} className="text-clover-orange" />
          <span className="text-sm font-semibold text-text-primary">AI 업무 보고서</span>
          {/* 세그먼트 유형 선택 */}
          <div className="ds-seg ml-1">
            {(['daily', 'weekly'] as const).map((type) => (
              <button key={type} onClick={() => setReportType(type)}
                className={`seg-item${reportType === type ? ' active' : ''}`}>
                {type === 'daily' ? '일일' : '주간'}
              </button>
            ))}
          </div>
          {history.length > 0 && (
            <div className="relative">
              <button onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-secondary px-1.5 py-0.5 rounded bg-bg-surface">
                <Clock size={10} /> 히스토리 {history.length}개
                <ChevronDown size={10} className={`transition-transform ${showHistory ? 'rotate-180' : ''}`} />
              </button>
              {showHistory && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowHistory(false)} />
                  <div className="absolute left-0 top-full mt-1 w-72 bg-bg-surface border border-bg-border rounded-xl shadow-2xl z-30 py-1 max-h-60 overflow-y-auto">
                    {history.map((r, i) => (
                      <div key={i} onClick={() => selectHistory(r)}
                        className="flex items-center justify-between px-3 py-2 hover:bg-bg-surface-hover cursor-pointer">
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
          {report && (
            <span className="text-[10px] text-text-tertiary">· {new Date(report.generatedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 생성</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SkillQuickToggle target="report" feature="report" />
          <Button
            variant="ai"
            onClick={handleGenerate}
            disabled={isActive}
            leftIcon={<FileText size={12} />}
          >
            {isActive ? '생성 중...' : '보고서 생성'}
          </Button>
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto">
        {isActive && (
          <div className="px-6 py-6 flex flex-col items-center gap-3">
            <AIProgressIndicator
              progress={progress}
              showStreamPreview
              size="large"
              expectedTime="보통 30초 ~ 2분 걸립니다. 스킬+MCP 위임 모드는 더 오래 걸릴 수 있어요."
              className="w-full max-w-3xl"
            />
          </div>
        )}

        {report && !isActive && (
          <div className="px-6 py-4 space-y-3">
            {/* Hero 요약 카드 (brief-style gradient) */}
            <div
              className="rounded-xl px-4 py-3.5"
              style={{
                background: 'linear-gradient(90deg, rgba(234,88,12,0.06), rgba(37,99,235,0.06))',
                border: '1px solid transparent'
              }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <FileText size={14} className="text-clover-orange" />
                <span className="text-[13px] font-semibold text-text-primary">{report.title}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  reportType === 'daily' ? 'bg-clover-blue/15 text-clover-blue' : 'bg-clover-orange/15 text-clover-orange'
                }`}>
                  {reportType === 'daily' ? '일일' : '주간'}
                </span>
                <span className="text-[10px] text-text-tertiary ml-auto">
                  {new Date(report.generatedAt).toLocaleString('ko-KR')}
                </span>
              </div>
            </div>

            {/* 도구 바 */}
            <div className="flex items-center justify-end gap-1.5">
              <button onClick={() => editMode ? setEditMode(false) : startEdit()}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] transition-colors border ${
                  editMode
                    ? 'bg-clover-blue/10 border-clover-blue/30 text-clover-blue'
                    : 'bg-bg-surface border-bg-border text-text-secondary hover:text-text-primary hover:border-bg-border-light'
                }`}>
                {editMode ? '미리보기' : '편집'}
              </button>
              <button onClick={handleCopy}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] text-text-secondary hover:text-text-primary bg-bg-surface border border-bg-border hover:border-bg-border-light">
                {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                {copied ? '복사됨' : '복사'}
              </button>
              <button onClick={handleDownload}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] text-text-secondary hover:text-text-primary bg-bg-surface border border-bg-border hover:border-bg-border-light">
                <Download size={11} /> .md 저장
              </button>
            </div>

            {/* 본문 카드 */}
            <div className="bg-bg-surface border border-bg-border rounded-xl overflow-hidden">
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
            </div>
          </div>
        )}

        {!report && !isActive && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'linear-gradient(135deg, rgba(234,88,12,0.12), rgba(37,99,235,0.12))' }}>
              <FileText size={26} className="text-clover-orange" />
            </div>
            <p className="text-sm font-medium text-text-primary">AI 업무 보고서</p>
            <p className="text-xs text-text-secondary mt-1">{reportType === 'daily' ? '일일' : '주간'} 보고서 유형을 선택하고 생성 버튼을 누르세요</p>
            <p className="text-[10px] text-text-tertiary mt-2">두레이 태스크와 일정을 분석하여 보고서 초안을 자동 생성합니다</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ReportGenerator
