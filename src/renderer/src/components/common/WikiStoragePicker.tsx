import { useState, useEffect, useCallback, useRef } from 'react'
import { Check, FolderOpen, Search, X, Plus, Link, Trash2, Lock, Loader2, ChevronDown } from 'lucide-react'

interface WikiEntry { wikiId: string; wikiName: string; parentPageId?: string }

interface WikiStoragePickerProps {
  /** 현재 등록된 위키 목록 — 체크박스 ON 상태 기준 */
  registered: WikiEntry[]
  /** 잠금된(삭제 불가) 기본 위키 wikiId 목록 */
  lockedIds: string[]
  /** 현재 활성 위키 ID */
  activeWikiId: string
  /** 등록 목록 변경 콜백 */
  onChange: (next: WikiEntry[]) => void
  /** 활성 위키 변경 콜백 */
  onActiveChange: (wikiId: string) => void
}

type PopoverMode = 'closed' | 'switcher' | 'manage'

/**
 * 헤더 inline 트리거 + 2단 popover.
 *
 *   [📁 Clauday ▾]
 *
 * 1단(switcher): 클릭 시 등록된 위키 목록 + 행 클릭 = 활성 전환 + 우상단 [+] 버튼.
 * 2단(manage):  [+] 클릭 시 두레이 위키 도메인 체크박스 + 검색 + 수동 추가.
 */
function WikiStoragePicker({
  registered, lockedIds, activeWikiId, onChange, onActiveChange
}: WikiStoragePickerProps): JSX.Element {
  const [mode, setMode] = useState<PopoverMode>('closed')
  const [domains, setDomains] = useState<WikiEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [showAddForm, setShowAddForm] = useState(false)
  const [addInput, setAddInput] = useState('')
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)

  const lockedSet = new Set(lockedIds)
  const registeredById = new Map(registered.map((w) => [w.wikiId, w]))
  const activeWiki = registered.find((w) => w.wikiId === activeWikiId) || null

  const loadDomains = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.api.dooray.wiki.domains()
      setDomains((list || []).map((d) => ({ wikiId: d.id, wikiName: d.name })))
    } catch {
      setDomains([])
    } finally {
      setLoading(false)
    }
  }, [])

  // manage 모드 진입 시에만 도메인 로드
  useEffect(() => {
    if (mode === 'manage') {
      loadDomains()
      setSearchQuery('')
      setShowAddForm(false)
      setAddError('')
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [mode, loadDomains])

  // ESC 로 popover 닫기 (manage → switcher 한 단계 뒤로, switcher → 닫힘).
  useEffect(() => {
    if (mode === 'closed') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (mode === 'manage') setMode('switcher')
      else setMode('closed')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  const close = (): void => setMode('closed')

  const handleSelectActive = (wikiId: string): void => {
    onActiveChange(wikiId)
    close()
  }

  const toggle = (wiki: WikiEntry): void => {
    const isOn = registeredById.has(wiki.wikiId)
    if (isOn && lockedSet.has(wiki.wikiId)) return
    if (isOn) {
      onChange(registered.filter((w) => w.wikiId !== wiki.wikiId))
    } else {
      onChange([...registered, wiki])
    }
  }

  const handleManualAdd = async (): Promise<void> => {
    if (!addInput.trim()) return
    setAdding(true)
    setAddError('')
    try {
      const resolved = await window.api.dooray.wiki.storageResolve(addInput.trim())
      if (registeredById.has(resolved.wikiId)) {
        setAddError('이미 등록된 위키입니다')
        return
      }
      onChange([...registered, resolved])
      setAddInput('')
      setShowAddForm(false)
    } catch (err) {
      setAddError(err instanceof Error ? err.message : '등록 실패')
    } finally {
      setAdding(false)
    }
  }

  // domains + registered 병합 (수동 추가 항목 포함)
  const merged: Array<WikiEntry & { isCustom: boolean }> = []
  for (const d of domains) merged.push({ ...d, isCustom: false })
  for (const r of registered) {
    if (!domains.some((d) => d.wikiId === r.wikiId)) merged.push({ ...r, isCustom: true })
  }
  const filtered = merged.filter((m) =>
    !searchQuery || m.wikiName.toLowerCase().includes(searchQuery.toLowerCase()) || m.wikiId.includes(searchQuery)
  )

  const triggerLabel = activeWiki?.wikiName || '위키 선택'

  return (
    <div className="relative inline-flex">
      <button
        onClick={() => setMode(mode === 'closed' ? 'switcher' : 'closed')}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-bg-border bg-bg-surface hover:border-clauday-blue/40 text-[calc(11px_*_var(--app-font-scale,1))] text-text-primary"
        type="button"
        title="위키 저장소 전환"
      >
        <FolderOpen size={11} className="text-clauday-blue" />
        <span className="font-medium max-w-[120px] truncate">{triggerLabel}</span>
        {registered.length > 1 && (
          <span className="text-[calc(9px_*_var(--app-font-scale,1))] text-text-tertiary">({registered.length})</span>
        )}
        <ChevronDown size={10} className="text-text-tertiary" />
      </button>

      {mode !== 'closed' && (
        <>
          <div className="fixed inset-0 z-30" onClick={close} />

          {mode === 'switcher' && (
            <div className="absolute left-0 top-full mt-1 w-64 bg-bg-surface border border-bg-border rounded-xl shadow-2xl z-40 overflow-hidden">
              <div className="px-3 py-2 border-b border-bg-border bg-bg-surface-hover flex items-center justify-between">
                <span className="text-[calc(11px_*_var(--app-font-scale,1))] font-semibold text-text-primary">위키 저장소</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setMode('manage') }}
                  className="p-1 rounded hover:bg-bg-primary text-text-tertiary hover:text-clauday-blue"
                  title="위키 추가/관리"
                  type="button"
                >
                  <Plus size={12} />
                </button>
              </div>
              <div className="py-1 max-h-80 overflow-y-auto">
                {registered.length === 0 ? (
                  <div className="px-3 py-6 text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary text-center">
                    등록된 위키가 없습니다
                    <br/>
                    <span className="text-clauday-blue">우상단 + 로 추가</span>
                  </div>
                ) : registered.map((w) => {
                  const isActive = w.wikiId === activeWikiId
                  const isLocked = lockedSet.has(w.wikiId)
                  return (
                    <button
                      key={w.wikiId}
                      onClick={() => handleSelectActive(w.wikiId)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[calc(11px_*_var(--app-font-scale,1))] transition-colors ${
                        isActive
                          ? 'bg-clauday-blue/15 text-text-primary font-medium'
                          : 'text-text-secondary hover:bg-bg-surface-hover'
                      }`}
                      type="button"
                    >
                      <FolderOpen size={11} className={isActive ? 'text-clauday-blue' : 'text-text-tertiary'} />
                      <span className="truncate flex-1">{w.wikiName || w.wikiId}</span>
                      {isLocked && <Lock size={9} className="text-text-tertiary" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {mode === 'manage' && (
            <div className="absolute left-0 top-full mt-1 w-80 bg-bg-surface border border-bg-border rounded-xl shadow-2xl z-40 overflow-hidden">
              <div className="px-3 py-2 border-b border-bg-border bg-bg-surface-hover flex items-center justify-between">
                <button
                  onClick={(e) => { e.stopPropagation(); setMode('switcher') }}
                  className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary hover:text-text-primary"
                  type="button"
                >
                  ← 뒤로
                </button>
                <span className="text-[calc(11px_*_var(--app-font-scale,1))] font-semibold text-text-primary">위키 추가/관리</span>
                <span className="text-[calc(9px_*_var(--app-font-scale,1))] text-text-tertiary">{registered.length}개 등록</span>
              </div>
              {/* 검색 */}
              <div className="px-2 py-1.5 border-b border-bg-border">
                <div className="relative">
                  <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="위키 검색..."
                    className="w-full pl-6 pr-6 py-1 bg-bg-primary border border-bg-border rounded text-[calc(11px_*_var(--app-font-scale,1))] text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clauday-blue"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary" type="button">
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>
              {/* 위키 목록 */}
              <div className="max-h-72 overflow-y-auto py-1">
                {loading ? (
                  <div className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary text-center py-4">로딩...</div>
                ) : filtered.length === 0 ? (
                  <div className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary text-center py-4">검색 결과 없음</div>
                ) : filtered.map((w) => {
                  const checked = registeredById.has(w.wikiId)
                  const isLocked = lockedSet.has(w.wikiId)
                  const isActive = w.wikiId === activeWikiId
                  return (
                    <div key={w.wikiId} className="flex items-center group">
                      <button
                        onClick={() => toggle(w)}
                        className={`flex-1 flex items-center gap-2 px-3 py-1.5 transition-colors text-left ${
                          isLocked && checked ? 'cursor-default' : 'hover:bg-bg-surface-hover'
                        }`}
                        type="button"
                      >
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                          checked ? 'bg-clauday-blue border-clauday-blue' : 'border-bg-border-light'
                        }`}>
                          {checked && <Check size={9} className="text-white" />}
                        </div>
                        {w.isCustom ? (
                          <Link size={11} className={`flex-shrink-0 ${checked ? 'text-clauday-orange' : 'text-text-tertiary'}`} />
                        ) : (
                          <FolderOpen size={11} className={`flex-shrink-0 ${checked ? 'text-clauday-blue' : 'text-text-tertiary'}`} />
                        )}
                        <span className={`text-[calc(11px_*_var(--app-font-scale,1))] truncate min-w-0 flex-1 ${checked ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
                          {w.wikiName || w.wikiId}
                        </span>
                        {isLocked && <Lock size={9} className="text-text-tertiary flex-shrink-0" />}
                        {isActive && (
                          <span className="text-[calc(9px_*_var(--app-font-scale,1))] px-1.5 py-0.5 rounded bg-clauday-blue text-white">활성</span>
                        )}
                      </button>
                      {w.isCustom && !isLocked && checked && (
                        <button
                          onClick={() => onChange(registered.filter((r) => r.wikiId !== w.wikiId))}
                          className="px-1.5 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                          title="수동 추가 위키 제거"
                          type="button"
                        >
                          <Trash2 size={10} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              {/* 수동 추가 */}
              <div className="border-t border-bg-border">
                {showAddForm ? (
                  <div className="px-2 py-2 space-y-1.5">
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={addInput}
                        onChange={(e) => { setAddInput(e.target.value); setAddError('') }}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleManualAdd() }}
                        placeholder="위키 URL 또는 wikiId"
                        className="flex-1 px-2 py-1 bg-bg-primary border border-bg-border rounded text-[calc(11px_*_var(--app-font-scale,1))] text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clauday-blue"
                        autoFocus
                      />
                      <button
                        onClick={handleManualAdd}
                        disabled={adding || !addInput.trim()}
                        className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-text-tertiary rounded text-[calc(10px_*_var(--app-font-scale,1))] text-white transition-colors flex items-center gap-1"
                        type="button"
                      >
                        {adding ? <Loader2 size={10} className="animate-spin" /> : null}
                        {adding ? '확인' : '추가'}
                      </button>
                    </div>
                    {addError && <div className="text-[calc(9px_*_var(--app-font-scale,1))] text-red-400 px-1">{addError}</div>}
                    <div className="text-[calc(9px_*_var(--app-font-scale,1))] text-gray-600 px-1">예: https://nhnent.dooray.com/project/wiki/{'{'}wikiId{'}'} 또는 wikiId 숫자</div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary hover:text-text-secondary hover:bg-bg-surface-hover transition-colors"
                    type="button"
                  >
                    <Plus size={10} />
                    위키 수동 추가 (URL/wikiId)
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default WikiStoragePicker
