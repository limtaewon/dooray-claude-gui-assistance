import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { FolderOpen, ChevronRight, ChevronDown, RefreshCw, FileText, Sparkles, Loader2, Copy, Check, Search, PanelLeftClose, PanelLeftOpen, Upload, Eye, Edit3 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { DoorayWikiPage } from '../../../../shared/types/dooray'
import ProjectFilter from '../common/ProjectFilter'
import SkillQuickToggle from './SkillQuickToggle'
import { useAIProgress } from '../../hooks/useAIProgress'
import AIProgressIndicator from '../common/AIProgressIndicator'

interface WikiDomain { id: string; name: string; type: string }
interface TreeNode { page: DoorayWikiPage; children: TreeNode[]; loaded: boolean; expanded: boolean }

function pageTitle(p: DoorayWikiPage): string { return p.subject || p.title || '(제목 없음)' }

function WikiManager(): JSX.Element {
  const [domains, setDomains] = useState<WikiDomain[]>([])
  const [selectedDomain, setSelectedDomain] = useState<WikiDomain | null>(null)
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([])
  const [selectedPage, setSelectedPage] = useState<DoorayWikiPage | null>(null)
  const [pageContent, setPageContent] = useState('')
  const [loadingDomains, setLoadingDomains] = useState(true)
  const [loadingPages, setLoadingPages] = useState(false)
  const [loadingContent, setLoadingContent] = useState(false)
  const [domainCollapsed, setDomainCollapsed] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // AI 결과
  const [aiResult, setAiResult] = useState<string | null>(null)
  const [aiAction, setAiAction] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const { progress: aiProgress, start: startAi, done: doneAi, isActive: aiLoading } = useAIProgress()
  // 편집/반영
  const [editMode, setEditMode] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [pushing, setPushing] = useState(false)
  const [pushResult, setPushResult] = useState<string | null>(null)

  const loadDomains = useCallback(async () => {
    setLoadingDomains(true)
    try {
      const [list, pinnedWikis] = await Promise.all([
        window.api.dooray.wiki.domains(),
        window.api.settings.get('pinnedWikis') as Promise<string[] | null>
      ])
      const pinnedIds = pinnedWikis || []
      const filtered = pinnedIds.length > 0 ? list.filter((d) => pinnedIds.includes(d.id)) : list
      const result = filtered.length > 0 ? filtered : list
      setDomains(result)
      if (result.length > 0 && !selectedDomain) setSelectedDomain(result[0])
    } catch {} finally { setLoadingDomains(false) }
  }, [])

  const loadRootPages = useCallback(async (domainId: string) => {
    setLoadingPages(true)
    try {
      const pages = await window.api.dooray.wiki.list(domainId)
      setRootNodes(pages.map((p) => ({ page: p, children: [], loaded: false, expanded: false })))
    } catch { setRootNodes([]) }
    finally { setLoadingPages(false) }
  }, [])

  useEffect(() => { loadDomains() }, [loadDomains])
  useEffect(() => {
    if (selectedDomain) { loadRootPages(selectedDomain.id); setSelectedPage(null); setPageContent(''); setAiResult(null); setSearchQuery(''); setEditMode(false) }
  }, [selectedDomain, loadRootPages])

  const toggleNode = async (nodeId: string): Promise<void> => {
    const findNode = (nodes: TreeNode[]): TreeNode | null => {
      for (const n of nodes) {
        if (n.page.id === nodeId) return n
        const found = findNode(n.children); if (found) return found
      }
      return null
    }
    const target = findNode(rootNodes)
    if (target && !target.loaded && !target.expanded && selectedDomain) {
      try {
        const children = await window.api.dooray.wiki.children(selectedDomain.id, nodeId)
        setRootNodes((prev) => {
          const update = (nodes: TreeNode[]): TreeNode[] =>
            nodes.map((n) => n.page.id === nodeId
              ? { ...n, children: children.map((p) => ({ page: p, children: [], loaded: false, expanded: false })), loaded: true, expanded: true }
              : n.children.length > 0 ? { ...n, children: update(n.children) } : n)
          return update(prev)
        })
        return
      } catch {}
    }
    setRootNodes((prev) => {
      const update = (nodes: TreeNode[]): TreeNode[] =>
        nodes.map((n) => n.page.id === nodeId ? { ...n, expanded: !n.expanded }
          : n.children.length > 0 ? { ...n, children: update(n.children) } : n)
      return update(prev)
    })
  }

  const selectPage = async (page: DoorayWikiPage): Promise<void> => {
    setSelectedPage(page); setAiResult(null); setPageContent(''); setEditMode(false); setPushResult(null)
    if (!selectedDomain) return
    setLoadingContent(true)
    try {
      const full = await window.api.dooray.wiki.get(selectedDomain.id, page.id)
      const body = full.body
      const content = (typeof body === 'object' && body !== null && 'content' in (body as Record<string, unknown>))
        ? (body as { content: string }).content || ''
        : String(body || '')
      setPageContent(content)
    } catch { setPageContent('페이지를 불러올 수 없습니다.') }
    finally { setLoadingContent(false) }
  }

  // AI 도구 (opus 모델)
  const runAi = async (action: string): Promise<void> => {
    if (!pageContent || !selectedPage) return
    setAiResult(null); setAiAction(action); setEditMode(false); setPushResult(null)
    const reqId = startAi()
    try {
      let result: string
      if (action === 'proofread') {
        result = await window.api.ai.wikiProofread(pageTitle(selectedPage), pageContent, reqId)
      } else if (action === 'improve') {
        result = await window.api.ai.wikiImprove(pageTitle(selectedPage), pageContent, reqId)
      } else {
        const prompts: Record<string, string> = {
          summarize: `다음 위키 문서를 3~5줄로 요약하세요.\n\n${pageContent.substring(0, 5000)}`,
          structure: `다음 위키 문서의 구조를 분석하고 개선 방안을 제안하세요.\n\n${pageContent.substring(0, 5000)}`
        }
        result = await window.api.ai.ask({
          prompt: prompts[action] || '',
          feature: action === 'summarize' ? 'wikiSummarize' : 'wikiStructure',
          requestId: reqId
        })
      }
      setAiResult(result)
      setEditContent(result)
    } catch (err) { setAiResult(`오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`) }
    finally { doneAi() }
  }

  // 두레이 위키에 반영
  const pushToWiki = async (): Promise<void> => {
    if (!selectedDomain || !selectedPage) return
    const content = editMode ? editContent : aiResult
    if (!content) return
    setPushing(true); setPushResult(null)
    try {
      await window.api.dooray.wiki.update({
        projectId: selectedDomain.id,
        pageId: selectedPage.id,
        title: pageTitle(selectedPage),
        body: content
      })
      setPageContent(content)
      setAiResult(null)
      setEditMode(false)
      setPushResult('위키에 반영되었습니다')
      setTimeout(() => setPushResult(null), 3000)
    } catch (err) {
      setPushResult(`반영 실패: ${err instanceof Error ? err.message : '오류'}`)
    } finally { setPushing(false) }
  }

  const copyResult = async (): Promise<void> => {
    const content = editMode ? editContent : aiResult
    if (!content) return
    await navigator.clipboard.writeText(content)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  // 검색 필터 (메모화)
  const filteredNodes = useMemo(() => {
    if (!searchQuery) return rootNodes
    const lower = searchQuery.toLowerCase()
    const filter = (nodes: TreeNode[]): TreeNode[] =>
      nodes.filter((n) => pageTitle(n.page).toLowerCase().includes(lower) || (n.children.length > 0 && filter(n.children).length > 0))
    return filter(rootNodes)
  }, [rootNodes, searchQuery])

  const renderTree = (nodes: TreeNode[], depth: number): JSX.Element[] =>
    nodes.map((node) => (
      <TreeRow
        key={node.page.id}
        node={node}
        depth={depth}
        isSelected={selectedPage?.id === node.page.id}
        onToggle={toggleNode}
        onSelect={selectPage}
      >
        {node.expanded && node.children.length > 0 ? renderTree(node.children, depth + 1) : null}
      </TreeRow>
    ))

  const canPush = (aiAction === 'proofread' || aiAction === 'improve') && (aiResult || editMode)

  return (
    <div className="h-full flex">
      {/* 좌측: 위키 도메인 */}
      {!domainCollapsed && (
        <div className="w-44 flex-shrink-0 bg-bg-surface border-r border-bg-border flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-bg-border">
            <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">위키</span>
            <div className="flex items-center gap-0.5">
              <ProjectFilter settingsKey="pinnedWikis" useWikiDomains onChanged={loadDomains} />
              <button onClick={loadDomains} className="p-1 rounded hover:bg-bg-surface-hover text-text-tertiary"><RefreshCw size={11} className={loadingDomains ? 'animate-spin' : ''} /></button>
              <button onClick={() => setDomainCollapsed(true)} className="p-1 rounded hover:bg-bg-surface-hover text-text-tertiary"><PanelLeftClose size={11} /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {domains.map((d) => (
              <button key={d.id} onClick={() => setSelectedDomain(d)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                  selectedDomain?.id === d.id ? 'bg-clover-blue/10 text-clover-blue border-r-2 border-clover-blue' : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
                }`}>
                <FolderOpen size={11} className={`flex-shrink-0 ${selectedDomain?.id === d.id ? 'text-clover-blue' : 'text-text-tertiary'}`} />
                <span className="text-[11px] font-medium truncate min-w-0">{d.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 중앙: 페이지 트리 */}
      <div className="w-60 flex-shrink-0 border-r border-bg-border flex flex-col">
        {domainCollapsed && (
          <button onClick={() => setDomainCollapsed(false)} className="px-2 py-1 border-b border-bg-border text-text-tertiary hover:text-text-primary hover:bg-bg-surface-hover flex items-center gap-1 text-[10px]">
            <PanelLeftOpen size={11} /> 위키 목록
          </button>
        )}
        {selectedDomain && (
          <>
            <div className="px-2 py-2 border-b border-bg-border">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-text-primary truncate">{selectedDomain.name}</span>
                <button onClick={() => loadRootPages(selectedDomain.id)} className="p-1 rounded hover:bg-bg-surface-hover text-text-tertiary"><RefreshCw size={10} className={loadingPages ? 'animate-spin' : ''} /></button>
              </div>
              <div className="relative">
                <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="페이지 검색..."
                  className="w-full pl-6 pr-2 py-1 bg-bg-primary border border-bg-border rounded text-[10px] text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {loadingPages ? <div className="text-[10px] text-text-tertiary text-center py-4">로딩...</div>
                : filteredNodes.length === 0 ? <div className="text-[10px] text-text-tertiary text-center py-4">{searchQuery ? '검색 결과 없음' : '페이지 없음'}</div>
                : renderTree(filteredNodes, 0)}
            </div>
          </>
        )}
      </div>

      {/* 우측: 페이지 내용 + AI */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedPage ? (
          <>
            {/* 헤더 */}
            <div className="px-4 py-3 border-b border-bg-border flex-shrink-0">
              <h3 className="text-sm font-semibold text-text-primary mb-2">{pageTitle(selectedPage)}</h3>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-text-tertiary mr-1">AI (Opus):</span>
                {[
                  { key: 'proofread', label: '교정', desc: '맞춤법·문법 교정' },
                  { key: 'improve', label: '개선', desc: '가독성·구조 개선' },
                  { key: 'summarize', label: '요약', desc: '3~5줄 요약' },
                  { key: 'structure', label: '구조 분석', desc: '구조 개선 제안' }
                ].map((a) => (
                  <button key={a.key} onClick={() => runAi(a.key)} disabled={aiLoading || !pageContent} title={a.desc}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] transition-colors disabled:opacity-40 ${
                      aiAction === a.key && aiResult ? 'bg-clover-orange/10 border-clover-orange/30 text-clover-orange' : 'bg-bg-surface border-bg-border text-text-secondary hover:text-text-primary hover:border-bg-border-light'
                    }`}>
                    <Sparkles size={9} className="text-clover-orange" /> {a.label}
                  </button>
                ))}
                <div className="ml-auto"><SkillQuickToggle target="all" /></div>
              </div>
            </div>

            {/* 콘텐츠 */}
            <div className="flex-1 overflow-hidden flex">
              {/* 원본 */}
              <div className={`${aiResult || aiLoading ? 'w-1/2 border-r border-bg-border' : 'w-full'} overflow-y-auto p-4`}>
                {loadingContent ? (
                  <div className="flex items-center justify-center h-32 text-text-secondary text-sm">로딩 중...</div>
                ) : (
                  <div className="markdown-body text-xs leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{pageContent}</ReactMarkdown>
                  </div>
                )}
              </div>

              {/* AI 결과 */}
              {(aiResult || aiLoading) && (
                <div className="w-1/2 overflow-y-auto flex flex-col">
                  {/* 결과 도구바 */}
                  <div className="flex items-center justify-between px-4 py-2 border-b border-bg-border bg-bg-surface/50 flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={12} className="text-clover-orange" />
                      <span className="text-[11px] font-semibold text-clover-orange">
                        {aiAction === 'proofread' ? '교정 결과' : aiAction === 'improve' ? '개선 결과' : 'AI 결과'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {canPush && (
                        <>
                          <button onClick={() => { if (editMode) setEditMode(false); else { setEditContent(aiResult || ''); setEditMode(true) } }}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] ${editMode ? 'bg-clover-blue/10 text-clover-blue' : 'text-text-secondary hover:text-text-primary'}`}>
                            {editMode ? <><Eye size={9} /> 미리보기</> : <><Edit3 size={9} /> 편집</>}
                          </button>
                          <button onClick={pushToWiki} disabled={pushing}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/20 border border-emerald-500/30 text-[10px] text-emerald-400 font-medium hover:bg-emerald-500/30 disabled:opacity-40">
                            {pushing ? <Loader2 size={9} className="animate-spin" /> : <Upload size={9} />}
                            {pushing ? '반영 중...' : '위키에 반영'}
                          </button>
                        </>
                      )}
                      <button onClick={copyResult} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-text-secondary hover:text-text-primary">
                        {copied ? <Check size={9} className="text-emerald-400" /> : <Copy size={9} />}
                        {copied ? '복사됨' : '복사'}
                      </button>
                    </div>
                  </div>
                  {pushResult && (
                    <div className={`px-4 py-1.5 text-[10px] ${pushResult.includes('실패') ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      {pushResult}
                    </div>
                  )}
                  <div className="flex-1 overflow-y-auto p-4">
                    {aiLoading ? (
                      <AIProgressIndicator progress={aiProgress} showStreamPreview />
                    ) : editMode ? (
                      <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)}
                        className="w-full min-h-[400px] bg-bg-primary border border-bg-border rounded-lg p-3 text-xs text-text-primary font-mono focus:outline-none focus:border-clover-blue resize-y" />
                    ) : (
                      <div className="markdown-body text-xs leading-relaxed">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{aiResult || ''}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm">좌측에서 페이지를 선택하세요</div>
        )}
      </div>
    </div>
  )
}

interface TreeRowProps {
  node: TreeNode
  depth: number
  isSelected: boolean
  onToggle: (id: string) => void
  onSelect: (page: DoorayWikiPage) => void
  children?: React.ReactNode
}

const TreeRow = memo(function TreeRow({ node, depth, isSelected, onToggle, onSelect, children }: TreeRowProps) {
  return (
    <div>
      <div
        style={{ paddingLeft: `${depth * 14 + 6}px`, contentVisibility: 'auto', containIntrinsicSize: '0 24px' }}
        className={`flex items-center gap-1 py-1 cursor-pointer transition-colors rounded ${
          isSelected ? 'bg-clover-blue/10 text-clover-blue' : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
        }`}
      >
        <button onClick={(e) => { e.stopPropagation(); onToggle(node.page.id) }} className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
          {node.expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </button>
        <FileText size={11} className="flex-shrink-0 text-text-tertiary" />
        <span onClick={() => onSelect(node.page)} className="text-[11px] truncate flex-1">{pageTitle(node.page)}</span>
      </div>
      {children}
    </div>
  )
}, (prev, next) =>
  prev.node.page.id === next.node.page.id &&
  prev.node.expanded === next.node.expanded &&
  prev.node.children === next.node.children &&
  prev.depth === next.depth &&
  prev.isSelected === next.isSelected &&
  prev.children === next.children
)

export default WikiManager
