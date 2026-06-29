import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, RefreshCw, Server, Sparkles, Download, Trash2, Upload, X, CheckSquare, FolderOpen, Globe } from 'lucide-react'
import MCPCard from './MCPCard'
import MCPForm from './MCPForm'
import type { McpServerConfig } from '../../../../shared/types/mcp'
import { getMcpTransport } from '../../../../shared/types/mcp'
import { Button, EmptyView, LoadingView, Modal, SegTabs, useToast } from '../common/ds'
import { DEFAULT_WIKIS } from '../../../../shared/wiki-storage-defaults'
import WikiStoragePicker from '../common/WikiStoragePicker'

type FormState =
  | { mode: 'closed' }
  | { mode: 'add' }
  | { mode: 'edit'; name: string; config: McpServerConfig }

type Tab = 'local' | 'wiki'

interface WikiMcpEntry { pageId: string; name: string; content: string; updatedAt: number }

/** MCP 정의를 위키 페이지 본문(markdown) 으로 직렬화. 다운로드 시 다시 파싱. */
function serializeMcp(name: string, config: McpServerConfig): string {
  return `# MCP: ${name}\n\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\`\n`
}

function parseMcpFromWiki(content: string): McpServerConfig | null {
  const m = content.match(/```json\s*([\s\S]*?)\s*```/)
  if (!m) return null
  try { return JSON.parse(m[1]) as McpServerConfig } catch { return null }
}

function MCPManager(): JSX.Element {
  const toast = useToast()
  const [servers, setServers] = useState<Record<string, McpServerConfig>>({})
  const [formState, setFormState] = useState<FormState>({ mode: 'closed' })
  const [loading, setLoading] = useState(true)

  // 위키 저장소 — 등록된 위키 목록 + 활성 위키 선택.
  const [tab, setTab] = useState<Tab>('local')
  const [registeredWikis, setRegisteredWikis] = useState<Array<{ wikiId: string; wikiName: string; parentPageId?: string }>>([])
  const [activeWikiId, setActiveWikiId] = useState<string>('')
  const [wikiItems, setWikiItems] = useState<WikiMcpEntry[]>([])
  const [wikiLoading, setWikiLoading] = useState(false)

  // 다중 선택 (로컬 탭 한정)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // #1 공유 카드 클릭 시 상세 모달 (JSON config 본문 노출)
  const [previewItem, setPreviewItem] = useState<WikiMcpEntry | null>(null)

  // 공유에 올릴 위키 타겟 선택 popup — 등록 위키 2개 이상일 때 노출.
  const [shareTargetPicker, setShareTargetPicker] = useState<{ names: string[] } | null>(null)
  useEffect(() => {
    if (!shareTargetPicker) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setShareTargetPicker(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shareTargetPicker])

  const loadServers = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.api.mcp.list()
      setServers(list)
    } catch (err) {
      console.error('MCP 서버 목록 로드 실패:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadServers()
    const cleanup = window.api.onConfigChanged(() => loadServers())
    return cleanup
  }, [loadServers])

  const handleSave = async (name: string, config: McpServerConfig): Promise<void> => {
    try {
      if (formState.mode === 'edit') {
        await window.api.mcp.update(name, config)
      } else {
        await window.api.mcp.add(name, config)
      }
      setFormState({ mode: 'closed' })
      await loadServers()
    } catch (err) {
      console.error('MCP 서버 저장 실패:', err)
    }
  }

  const handleDelete = async (name: string): Promise<void> => {
    if (!window.confirm(`"${name}" MCP 서버를 삭제할까요?\n설정 파일에서 제거되며 복구할 수 없습니다.`)) return
    try {
      await window.api.mcp.delete(name)
      await loadServers()
    } catch (err) {
      console.error('MCP 서버 삭제 실패:', err)
    }
  }

  const entries = useMemo(() => Object.entries(servers), [servers])
  const activeCount = useMemo(() => entries.filter(([, c]) => !c.disabled).length, [entries])

  const handleToggle = async (name: string, config: McpServerConfig): Promise<void> => {
    try {
      await window.api.mcp.update(name, { ...config, disabled: !config.disabled })
      await loadServers()
    } catch (err) {
      console.error('MCP 서버 토글 실패:', err)
    }
  }

  // === 위키 저장소 === — 비어있으면 Clauday 기본값 자동 주입
  useEffect(() => {
    Promise.all([
      window.api.settings.get('mcpWikiStorageWikis'),
      window.api.settings.get('mcpWikiStorageActive')
    ]).then(([listRaw, activeRaw]) => {
      let list: Array<{ wikiId: string; wikiName: string }> = []
      if (typeof listRaw === 'string') {
        try { list = JSON.parse(listRaw) } catch { list = [] }
      } else if (Array.isArray(listRaw)) {
        list = listRaw as Array<{ wikiId: string; wikiName: string }>
      }
      if (list.length === 0) {
        list = [...DEFAULT_WIKIS]
        window.api.settings.set('mcpWikiStorageWikis', JSON.stringify(list)).catch(() => { /* ok */ })
      }
      setRegisteredWikis(list)
      if (typeof activeRaw === 'string' && list.some((w) => w.wikiId === activeRaw)) {
        setActiveWikiId(activeRaw)
      } else if (list.length > 0) {
        setActiveWikiId(list[0].wikiId)
        window.api.settings.set('mcpWikiStorageActive', list[0].wikiId).catch(() => { /* ok */ })
      }
    }).catch(() => { /* ok */ })
  }, [])

  const persistWikis = async (list: Array<{ wikiId: string; wikiName: string }>, active: string): Promise<void> => {
    await Promise.all([
      window.api.settings.set('mcpWikiStorageWikis', JSON.stringify(list)),
      window.api.settings.set('mcpWikiStorageActive', active)
    ]).catch(() => { /* ok */ })
  }

  const loadWikiItems = useCallback(async (): Promise<void> => {
    if (!activeWikiId) { setWikiItems([]); return }
    setWikiLoading(true)
    try {
      const target = registeredWikis.find((w) => w.wikiId === activeWikiId)
      const list = await window.api.dooray.wiki.storageList(activeWikiId, 'mcps', target?.parentPageId)
      setWikiItems(list)
    } catch (err) {
      console.error('[MCP] storageList failed:', err)
      toast.error(err instanceof Error ? err.message : '위키 저장소 로드 실패')
    } finally {
      setWikiLoading(false)
    }
  }, [activeWikiId, registeredWikis, toast])

  useEffect(() => {
    if (tab === 'wiki' && activeWikiId) loadWikiItems()
  }, [tab, activeWikiId, loadWikiItems])

  const handleWikiListChange = async (next: Array<{ wikiId: string; wikiName: string }>): Promise<void> => {
    setRegisteredWikis(next)
    let newActive = activeWikiId
    if (!next.some((w) => w.wikiId === activeWikiId)) {
      newActive = next.length > 0 ? next[0].wikiId : ''
      setActiveWikiId(newActive)
      if (!newActive) setWikiItems([])
    }
    await persistWikis(next, newActive)
  }

  const switchActiveWiki = async (wikiId: string): Promise<void> => {
    setActiveWikiId(wikiId)
    await window.api.settings.set('mcpWikiStorageActive', wikiId).catch(() => { /* ok */ })
  }

  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; wikiName: string; currentName: string } | null>(null)

  /** 단일 또는 다중 MCP 를 특정 위키에 업로드. */
  const uploadNamesToWiki = async (names: string[], wikiId: string): Promise<void> => {
    const target = registeredWikis.find((w) => w.wikiId === wikiId)
    const wikiLabel = target?.wikiName || wikiId
    let okCount = 0
    let failCount = 0
    for (let i = 0; i < names.length; i++) {
      const name = names[i]
      const config = servers[name]
      if (!config) continue
      setUploadProgress({ current: i + 1, total: names.length, wikiName: wikiLabel, currentName: name })
      try {
        await window.api.dooray.wiki.storageUpload({
          wikiId,
          kind: 'mcps',
          name,
          content: serializeMcp(name, config),
          parentPageIdHint: target?.parentPageId
        })
        okCount++
      } catch (err) {
        failCount++
        console.error('[MCP] upload failed:', name, err)
      }
    }
    setUploadProgress(null)
    if (okCount > 0) {
      toast.success(`${okCount}개 ${wikiLabel} 에 업로드됨`)
      if (tab === 'wiki' && wikiId === activeWikiId) await loadWikiItems()
    }
    if (failCount > 0) {
      toast.error(`${failCount}개 업로드 실패`)
    }
  }

  /** 카드 / bulk 양쪽에서 호출. 등록 위키가 1개면 즉시, 2개 이상이면 picker 띄움. */
  const handleShareToWiki = async (names: string[]): Promise<void> => {
    if (registeredWikis.length === 0) {
      toast.warn('등록된 위키가 없습니다', "'공유' 탭에서 먼저 위키를 등록하세요")
      return
    }
    if (registeredWikis.length === 1) {
      await uploadNamesToWiki(names, registeredWikis[0].wikiId)
    } else {
      setShareTargetPicker({ names })
    }
  }

  const handleDownloadFromWiki = async (item: WikiMcpEntry): Promise<void> => {
    if (!activeWikiId) return
    try {
      let content = item.content
      if (!content) {
        const full = await window.api.dooray.wiki.storageGet(activeWikiId, item.pageId)
        content = full.content
      }
      const config = parseMcpFromWiki(content)
      if (!config) {
        toast.error('파싱 실패', '페이지에서 JSON 코드블록을 찾지 못했습니다')
        return
      }
      if (servers[item.name]) {
        await window.api.mcp.update(item.name, config)
      } else {
        await window.api.mcp.add(item.name, config)
      }
      toast.success(`"${item.name}" 적용됨`)
      await loadServers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '내려받기 실패')
    }
  }

  const handleDeleteFromWiki = async (item: WikiMcpEntry): Promise<void> => {
    if (!activeWikiId) return
    const ok = window.confirm(`위키 저장소에서 "${item.name}" 을(를) 삭제할까요?\n위키 페이지가 완전히 삭제되며 복구할 수 없습니다.`)
    if (!ok) return
    try {
      await window.api.dooray.wiki.storageSoftDelete(activeWikiId, item.pageId)
      toast.success('삭제됨')
      await loadWikiItems()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '삭제 실패')
    }
  }

  // 다중 선택 핸들러 ===
  const toggleSelected = (name: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }
  const exitSelectMode = (): void => {
    setSelectMode(false)
    setSelected(new Set())
  }
  const handleBulkDelete = async (): Promise<void> => {
    if (selected.size === 0) return
    const names = Array.from(selected)
    if (!window.confirm(`선택한 ${names.length}개 MCP 를 삭제할까요?\n복구할 수 없습니다.`)) return
    let okCount = 0
    for (const name of names) {
      try { await window.api.mcp.delete(name); okCount++ } catch { /* skip */ }
    }
    toast.success(`${okCount}개 삭제됨`)
    exitSelectMode()
    await loadServers()
  }
  const handleBulkShare = async (): Promise<void> => {
    if (selected.size === 0) return
    const names = Array.from(selected)
    await handleShareToWiki(names)
    exitSelectMode()
  }

  const handleBulkDownloadFromWiki = async (): Promise<void> => {
    if (selected.size === 0 || !activeWikiId) return
    const targets = wikiItems.filter((it) => selected.has(it.pageId))
    let okCount = 0
    let failCount = 0
    for (const item of targets) {
      try {
        let content = item.content
        if (!content) {
          const full = await window.api.dooray.wiki.storageGet(activeWikiId, item.pageId)
          content = full.content
        }
        const config = parseMcpFromWiki(content)
        if (!config) { failCount++; continue }
        if (servers[item.name]) await window.api.mcp.update(item.name, config)
        else await window.api.mcp.add(item.name, config)
        okCount++
      } catch (err) {
        failCount++
        console.error('[MCP] bulk download failed:', item.name, err)
      }
    }
    if (okCount > 0) toast.success(`${okCount}개 적용됨`)
    if (failCount > 0) toast.error(`${failCount}개 실패`)
    exitSelectMode()
    await loadServers()
  }

  const handleBulkDeleteFromWiki = async (): Promise<void> => {
    if (selected.size === 0 || !activeWikiId) return
    const targets = wikiItems.filter((it) => selected.has(it.pageId))
    if (!window.confirm(`선택한 ${targets.length}개를 위키에서 삭제할까요?\n위키 페이지가 완전히 삭제되며 복구할 수 없습니다.`)) return
    let okCount = 0
    let failCount = 0
    for (const item of targets) {
      try {
        await window.api.dooray.wiki.storageSoftDelete(activeWikiId, item.pageId)
        okCount++
      } catch (err) {
        failCount++
        console.error('[MCP] bulk delete failed:', item.name, err)
      }
    }
    if (okCount > 0) toast.success(`${okCount}개 삭제됨`)
    if (failCount > 0) toast.error(`${failCount}개 실패 (본인 페이지가 아닐 수 있음)`)
    exitSelectMode()
    await loadWikiItems()
  }
  const handleBulkExport = async (): Promise<void> => {
    if (selected.size === 0) return
    // 한 파일에 합쳐 export — JSON 객체 { name: config, ... }
    const names = Array.from(selected)
    const out: Record<string, McpServerConfig> = {}
    for (const name of names) {
      const c = servers[name]
      if (c) out[name] = c
    }
    try {
      const json = JSON.stringify(out, null, 2)
      // electron 다이얼로그 — 일단 클립보드 복사로 처리. 실제 파일 export 가 필요하면 IPC 추가.
      await navigator.clipboard.writeText(json)
      toast.success(`${names.length}개 MCP JSON 클립보드 복사됨`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '내보내기 실패')
    }
  }
  const handleImport = async (): Promise<void> => {
    // 파일 선택 → JSON 파싱 → 각 키를 mcp.add. 충돌은 update.
    const inputEl = document.createElement('input')
    inputEl.type = 'file'
    inputEl.accept = 'application/json,.json'
    inputEl.multiple = true
    inputEl.onchange = async (): Promise<void> => {
      const files = Array.from(inputEl.files || [])
      let added = 0
      for (const f of files) {
        try {
          const txt = await f.text()
          const parsed = JSON.parse(txt) as Record<string, McpServerConfig> | { mcpServers: Record<string, McpServerConfig> }
          // .claude.json 형식 또는 단순 객체 둘 다 허용
          const map = (parsed as { mcpServers?: Record<string, McpServerConfig> }).mcpServers
            ?? (parsed as Record<string, McpServerConfig>)
          for (const [name, cfg] of Object.entries(map)) {
            if (!cfg || typeof cfg !== 'object') continue
            try {
              if (servers[name]) await window.api.mcp.update(name, cfg)
              else await window.api.mcp.add(name, cfg)
              added++
            } catch { /* skip */ }
          }
        } catch (err) {
          console.error('[MCP] import parse failed:', err)
        }
      }
      if (added > 0) {
        toast.success(`${added}개 MCP 가져옴`)
        await loadServers()
      } else {
        toast.warn('가져온 항목이 없습니다')
      }
    }
    inputEl.click()
  }

  return (
    <div className="h-full overflow-y-auto">
      {uploadProgress && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-lg shadow-2xl border border-clauday-blue/40"
          style={{ background: 'var(--bg-surface-raised)' }}>
          <RefreshCw size={14} className="animate-spin text-clauday-blue" />
          <div className="flex flex-col">
            <span className="text-[calc(12px_*_var(--app-font-scale,1))] text-text-primary font-medium">
              {uploadProgress.wikiName} 에 업로드 중 ({uploadProgress.current}/{uploadProgress.total})
            </span>
            <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary truncate max-w-[260px]">{uploadProgress.currentName}</span>
          </div>
        </div>
      )}
      <div className="px-5 py-4 space-y-4">
        {/* DS PageHeader */}
        <div className="flex items-center gap-3 flex-wrap">
          <Server size={18} className="text-clauday-blue" />
          <h2 className="text-[calc(14px_*_var(--app-font-scale,1))] font-semibold text-text-primary">MCP 서버</h2>
          <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary">
            · {entries.length}개 · 활성 {activeCount}
          </span>
          <SegTabs<Tab>
            value={tab}
            onChange={(t) => { setTab(t); exitSelectMode() }}
            items={[
              { key: 'local', label: '로컬' },
              { key: 'wiki', label: '공유' }
            ]}
          />
          {tab === 'wiki' && (
            <WikiStoragePicker
              registered={registeredWikis}
              lockedIds={DEFAULT_WIKIS.map((w) => w.wikiId)}
              activeWikiId={activeWikiId}
              onChange={handleWikiListChange}
              onActiveChange={switchActiveWiki}
            />
          )}
          <div className="flex-1" />
          {tab === 'local' && (
            <>
              <Button variant="secondary" onClick={loadServers} leftIcon={<RefreshCw size={12} />} title="새로고침">
                새로고침
              </Button>
              <Button
                variant={selectMode ? 'orange' : 'secondary'}
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                leftIcon={selectMode ? <X size={13} /> : <CheckSquare size={13} />}
              >
                {selectMode ? '선택 종료' : '선택'}
              </Button>
              <Button variant="secondary" onClick={handleImport} leftIcon={<Upload size={13} />}>
                가져오기
              </Button>
              <Button variant="primary" onClick={() => setFormState({ mode: 'add' })} leftIcon={<Plus size={12} />}>
                서버 추가
              </Button>
            </>
          )}
          {tab === 'wiki' && activeWikiId && (
            <>
              <Button variant="secondary" onClick={() => loadWikiItems()} disabled={wikiLoading}
                leftIcon={<RefreshCw size={12} className={wikiLoading ? 'animate-spin' : ''} />}>
                새로고침
              </Button>
              <Button
                variant={selectMode ? 'orange' : 'secondary'}
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                leftIcon={selectMode ? <X size={13} /> : <CheckSquare size={13} />}
              >
                {selectMode ? '선택 종료' : '선택'}
              </Button>
            </>
          )}
        </div>

        {formState.mode !== 'closed' && (
          <MCPForm
            editName={formState.mode === 'edit' ? formState.name : undefined}
            editConfig={formState.mode === 'edit' ? formState.config : undefined}
            onSave={handleSave}
            onCancel={() => setFormState({ mode: 'closed' })}
          />
        )}

        {/* 다중 선택 액션바 — local + wiki 둘 다 */}
        {selectMode && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-clauday-orange/8 border border-clauday-orange/30">
            <span className="text-xs text-text-primary font-medium">{selected.size}개 선택됨</span>
            <button
              type="button"
              onClick={() => {
                const all = tab === 'local' ? entries.map(([n]) => n) : wikiItems.map((i) => i.pageId)
                if (selected.size === all.length) setSelected(new Set())
                else setSelected(new Set(all))
              }}
              className="text-[calc(11px_*_var(--app-font-scale,1))] text-clauday-orange hover:underline"
            >
              {(() => {
                const all = tab === 'local' ? entries.length : wikiItems.length
                return selected.size === all && all > 0 ? '전체 해제' : '전체 선택'
              })()}
            </button>
            <div className="flex-1" />
            {tab === 'local' && (
              <>
                {registeredWikis.length > 0 && (
                  <Button variant="primary" onClick={handleBulkShare} disabled={selected.size === 0} leftIcon={<FolderOpen size={13} />}>
                    공유에 올리기
                  </Button>
                )}
                <Button variant="secondary" onClick={handleBulkExport} disabled={selected.size === 0} leftIcon={<Download size={13} />}>
                  내보내기
                </Button>
                <Button variant="danger" onClick={handleBulkDelete} disabled={selected.size === 0} leftIcon={<Trash2 size={13} />}>
                  삭제
                </Button>
              </>
            )}
            {tab === 'wiki' && (
              <>
                <Button variant="success" onClick={handleBulkDownloadFromWiki} disabled={selected.size === 0} leftIcon={<Download size={13} />}>
                  내려받기
                </Button>
                <Button variant="danger" onClick={handleBulkDeleteFromWiki} disabled={selected.size === 0} leftIcon={<Trash2 size={13} />}>
                  삭제
                </Button>
              </>
            )}
          </div>
        )}

        {tab === 'local' ? (
          loading ? (
            <LoadingView label="MCP 서버 목록을 불러오는 중..." />
          ) : entries.length === 0 ? (
            <EmptyView
              icon={Server}
              title="등록된 MCP 서버가 없습니다"
              body="'서버 추가' 버튼을 눌러 시작하세요"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {entries.map(([name, config]) => (
                <MCPCard
                  key={name}
                  name={name}
                  config={config}
                  onEdit={() => setFormState({ mode: 'edit', name, config })}
                  onDelete={() => handleDelete(name)}
                  onToggle={() => handleToggle(name, config)}
                  onShareToWiki={registeredWikis.length > 0 ? () => handleShareToWiki([name]) : undefined}
                  selectable={selectMode}
                  selected={selected.has(name)}
                  onToggleSelect={() => toggleSelected(name)}
                />
              ))}
            </div>
          )
        ) : (
          // Wiki tab
          !activeWikiId ? (
            <EmptyView
              icon={Sparkles}
              title="위키를 등록하세요"
              body="상단 톱니바퀴 → 위키를 체크하거나 수동 추가로 등록하면, 해당 위키에서 공유 중인 MCP 정의가 여기 표시됩니다"
            />
          ) : wikiLoading ? (
            <LoadingView label="위키 저장소 불러오는 중..." />
          ) : wikiItems.length === 0 ? (
            <EmptyView
              icon={Upload}
              title="저장된 MCP가 없습니다"
              body="'로컬' 탭에서 카드 우측 상단 폴더↑ 아이콘으로 업로드하세요"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {wikiItems.map((item) => {
                const isSelected = selectMode && selected.has(item.pageId)
                // 공유 위키 본문(item.content)에서 config 파싱 — 로컬 카드와 동일한 정보 노출 (transport/url/args 등)
                const config = parseMcpFromWiki(item.content)
                const transport = config ? getMcpTransport(config) : null
                const isRemote = transport === 'http' || transport === 'sse'
                const headerCount = config?.headers ? Object.keys(config.headers).length : 0
                return (
                  <div
                    key={item.pageId}
                    onClick={selectMode ? () => toggleSelected(item.pageId) : () => setPreviewItem(item)}
                    className={`ds-card transition-all cursor-pointer hover:border-clauday-blue/40`}
                    style={{
                      padding: '12px 14px',
                      ...(isSelected
                        ? { boxShadow: '0 0 0 2px var(--accent-orange, #FB923C)', borderColor: 'var(--accent-orange, #FB923C)' }
                        : {})
                    }}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-[6px] flex-none flex items-center justify-center bg-clauday-blue/10">
                        {isRemote
                          ? <Globe size={16} className="text-clauday-blue" />
                          : <Server size={16} className="text-clauday-blue" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="text-[calc(13px_*_var(--app-font-scale,1))] font-semibold text-text-primary truncate">{item.name}</h3>
                          {transport && (
                            <span
                              className="px-1.5 py-0.5 rounded-[4px] text-[calc(9px_*_var(--app-font-scale,1))] font-mono uppercase bg-bg-surface-hover text-text-tertiary border border-bg-border"
                              style={{ flex: 'none' }}
                            >
                              {transport}
                            </span>
                          )}
                        </div>
                        {config && (
                          <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary font-mono mt-0.5 truncate">
                            {isRemote ? (
                              <>
                                {config.url || <span className="text-text-tertiary">URL 없음</span>}
                                {headerCount > 0 && (
                                  <span className="text-text-tertiary"> · 헤더 {headerCount}개</span>
                                )}
                              </>
                            ) : (
                              <>
                                {config.command || <span className="text-text-tertiary">커맨드 없음</span>}
                                {config.args && config.args.length > 0 && (
                                  <span className="text-text-tertiary"> · {config.args.length}개 인자</span>
                                )}
                              </>
                            )}
                          </p>
                        )}
                        <div className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mt-1">
                          {item.updatedAt ? new Date(item.updatedAt).toLocaleString('ko-KR') : '날짜 없음'}
                        </div>
                      </div>
                    </div>
                    {config && !isRemote && config.args && config.args.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {config.args.map((arg, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded-[4px] text-[calc(10px_*_var(--app-font-scale,1))] font-mono bg-bg-surface-hover text-text-secondary border border-bg-border"
                          >
                            {arg}
                          </span>
                        ))}
                      </div>
                    )}
                    {config && isRemote && headerCount > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {Object.keys(config.headers || {}).map((h) => (
                          <span
                            key={h}
                            className="px-1.5 py-0.5 rounded-[4px] text-[calc(10px_*_var(--app-font-scale,1))] font-mono bg-bg-surface-hover text-text-secondary border border-bg-border"
                          >
                            {h}
                          </span>
                        ))}
                      </div>
                    )}
                    {!selectMode && (
                      <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-bg-border/60">
                        <div className="flex-1" />
                        <button onClick={(e) => { e.stopPropagation(); handleDownloadFromWiki(item) }}
                          className="flex items-center gap-1 text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary hover:text-clauday-blue">
                          <Download size={11} /> 적용
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteFromWiki(item) }}
                          className="flex items-center gap-1 text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary hover:text-red-400">
                          <Trash2 size={11} /> 삭제
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}

        <div className="flex items-center gap-2 text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary pt-1">
          <span>💡</span>
          <span>
            설정은 <span className="font-mono text-text-secondary">~/.claude.json</span>에 저장됩니다. 새로고침으로 외부 변경 반영.
          </span>
        </div>
      </div>

      {/* #1 MCP 공유 카드 상세 모달 — 본문(JSON config) 렌더 + 적용/삭제 */}
      <Modal
        open={!!previewItem}
        onClose={() => setPreviewItem(null)}
        width="min(800px, 92vw)"
        icon={<Server size={14} className="text-clauday-blue" />}
        title={previewItem?.name}
        footer={
          <>
            {previewItem && (
              <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary">
                {previewItem.updatedAt ? new Date(previewItem.updatedAt).toLocaleString('ko-KR') : ''}
              </span>
            )}
            <div style={{ flex: 1 }} />
            <Button variant="ghost" onClick={() => setPreviewItem(null)}>닫기</Button>
            {previewItem && (
              <Button
                variant="primary"
                onClick={async () => {
                  const it = previewItem
                  setPreviewItem(null)
                  await handleDownloadFromWiki(it)
                }}
                leftIcon={<Download size={12} />}
              >
                적용
              </Button>
            )}
          </>
        }
      >
        {previewItem && (
          <pre className="font-mono text-[calc(11.5px_*_var(--app-font-scale,1))] leading-relaxed text-text-primary whitespace-pre-wrap break-words"
            style={{ maxHeight: '60vh', overflow: 'auto' }}>
            {previewItem.content || '(본문 없음)'}
          </pre>
        )}
      </Modal>

      {/* 공유 위키 타겟 선택 — 등록 위키 2개 이상일 때 */}
      {shareTargetPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'var(--overlay-bg, rgba(0,0,0,0.5))' }}
          onClick={() => setShareTargetPicker(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-bg-border shadow-2xl overflow-hidden"
            style={{ background: 'var(--bg-surface-raised)' }}
          >
            <div className="px-4 py-3 border-b border-bg-border">
              <div className="text-[calc(13px_*_var(--app-font-scale,1))] font-semibold text-text-primary">공유할 위키 선택</div>
              <div className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5">
                {shareTargetPicker.names.length}개 MCP 를 어느 위키에 올릴까요?
              </div>
            </div>
            <div className="py-1 max-h-80 overflow-y-auto">
              {registeredWikis.map((w) => (
                <button
                  key={w.wikiId}
                  onClick={async () => {
                    const names = shareTargetPicker.names
                    setShareTargetPicker(null)
                    await uploadNamesToWiki(names, w.wikiId)
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-left text-[calc(12px_*_var(--app-font-scale,1))] text-text-secondary hover:bg-bg-surface-hover transition-colors"
                  type="button"
                >
                  <FolderOpen size={12} className="text-clauday-blue" />
                  <span className="flex-1">{w.wikiName || w.wikiId}</span>
                </button>
              ))}
            </div>
            <div className="px-4 py-2 border-t border-bg-border flex justify-end">
              <Button variant="ghost" onClick={() => setShareTargetPicker(null)}>취소</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MCPManager
