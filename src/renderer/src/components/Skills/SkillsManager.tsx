import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Save, Sparkles, Search, X, Download, Upload, User, Loader2, RefreshCw, Trash2, CheckSquare } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import SkillCard from './SkillCard'
import SkillEditor from './SkillEditor'
import SkillCreateModal from './SkillCreateModal'
import type { Skill } from '../../../../shared/types/skills'
import { Button, Modal, SegTabs, useToast } from '../common/ds'

import { DEFAULT_WIKIS } from '../../../../shared/wiki-storage-defaults'
import WikiStoragePicker from '../common/WikiStoragePicker'

type FilterTab = 'mine' | 'wiki'

interface WikiStorageEntry { pageId: string; name: string; content: string; updatedAt: number }

/** SKILL.md frontmatter 의 description 만 추출. 카드 노출용. */
function extractFrontmatterDescription(body: string): string | undefined {
  if (!body) return undefined
  const m = body.match(/^\s*---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return undefined
  const d = m[1].match(/^\s*description\s*:\s*(.+?)\s*$/m)
  if (!d) return undefined
  return d[1].trim().replace(/^["']|["']$/g, '')
}

function SkillsManager(): JSX.Element {
  const toast = useToast()
  const [skills, setSkills] = useState<Skill[]>([])
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<FilterTab>('mine')
  // 공유 탭 — "내 스킬 공유하기" picker 모달 (로컬 스킬을 골라 위키에 업로드)
  const [sharePickerOpen, setSharePickerOpen] = useState(false)
  // picker 다중 선택 — filename Set
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set())
  // picker 내부 검색어
  const [pickerSearch, setPickerSearch] = useState('')

  // 다중 선택 (내 스킬 탭 한정)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // 내 위키 저장소 — 사용자가 등록한 위키 목록 + 활성 위키 선택.
  const [registeredWikis, setRegisteredWikis] = useState<Array<{ wikiId: string; wikiName: string; parentPageId?: string }>>([])
  const [activeWikiId, setActiveWikiId] = useState<string>('')
  const [wikiItems, setWikiItems] = useState<WikiStorageEntry[]>([])
  const [wikiLoading, setWikiLoading] = useState(false)

  // 위키 스킬 미리보기 모달
  const [previewShared, setPreviewShared] = useState<{
    postId: string; filename: string; name: string; content: string;
    description?: string; authorName: string; createdAt: string; updatedAt: string; isMine: boolean
  } | null>(null)

  /** 업로드 진행 상태 — null 이면 idle, 객체면 진행 중 */
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; wikiName: string; currentName: string } | null>(null)

  const loadSkills = useCallback(async () => {
    try {
      const list = await window.api.skills.list()
      setSkills(list)
    } catch (err) {
      console.error('Failed to load skills:', err)
    }
  }, [])

  useEffect(() => {
    loadSkills()
    const cleanup = window.api.onConfigChanged(() => { loadSkills() })
    return cleanup
  }, [loadSkills])

  // 등록된 위키 목록 + 활성 위키 로드. 비어있으면 Clauday 기본값 자동 주입.
  useEffect(() => {
    Promise.all([
      window.api.settings.get('skillWikiStorageWikis'),
      window.api.settings.get('skillWikiStorageActive')
    ]).then(([listRaw, activeRaw]) => {
      let list: Array<{ wikiId: string; wikiName: string }> = []
      if (typeof listRaw === 'string') {
        try { list = JSON.parse(listRaw) } catch { list = [] }
      } else if (Array.isArray(listRaw)) {
        list = listRaw as Array<{ wikiId: string; wikiName: string }>
      }
      // Clauday 등 기본 위키가 목록에 없으면 추가 (사용자가 명시적으로 제거한 경우는 다시 안 들어옴 — 빈 배열일 때만 채움).
      if (list.length === 0) {
        list = [...DEFAULT_WIKIS]
        window.api.settings.set('skillWikiStorageWikis', JSON.stringify(list)).catch(() => { /* ok */ })
      }
      setRegisteredWikis(list)
      if (typeof activeRaw === 'string' && list.some((w) => w.wikiId === activeRaw)) {
        setActiveWikiId(activeRaw)
      } else if (list.length > 0) {
        setActiveWikiId(list[0].wikiId)
        window.api.settings.set('skillWikiStorageActive', list[0].wikiId).catch(() => { /* ok */ })
      }
    }).catch(() => { /* ok */ })
  }, [])

  const persistWikis = async (list: Array<{ wikiId: string; wikiName: string }>, active: string): Promise<void> => {
    await Promise.all([
      window.api.settings.set('skillWikiStorageWikis', JSON.stringify(list)),
      window.api.settings.set('skillWikiStorageActive', active)
    ]).catch(() => { /* ok */ })
  }

  const loadWikiItems = useCallback(async (): Promise<void> => {
    if (!activeWikiId) { setWikiItems([]); return }
    setWikiLoading(true)
    try {
      const target = registeredWikis.find((w) => w.wikiId === activeWikiId)
      const list = await window.api.dooray.wiki.storageList(activeWikiId, 'skills', target?.parentPageId)
      setWikiItems(list)
    } catch (err) {
      console.error('[Skills] storageList failed:', err)
      toast.error(err instanceof Error ? err.message : '위키 저장소 로드 실패')
    } finally {
      setWikiLoading(false)
    }
  }, [activeWikiId, registeredWikis, toast])

  useEffect(() => {
    if (tab === 'wiki' && activeWikiId) loadWikiItems()
  }, [tab, activeWikiId, loadWikiItems])

  /** picker 가 호출하는 통합 변경 핸들러 — 추가/제거 모두 처리. */
  const handleWikiListChange = async (next: Array<{ wikiId: string; wikiName: string }>): Promise<void> => {
    setRegisteredWikis(next)
    // 활성 위키가 빠졌으면 첫 항목으로 이동
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
    await window.api.settings.set('skillWikiStorageActive', wikiId).catch(() => { /* ok */ })
  }

  /** 공유 위키 타겟 picker — 등록 위키 2개 이상일 때 노출 */
  const [shareTargetPicker, setShareTargetPicker] = useState<{ skills: Skill[] } | null>(null)
  // ESC 로 picker 닫기
  useEffect(() => {
    if (!shareTargetPicker) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setShareTargetPicker(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shareTargetPicker])

  const uploadSkillsToWiki = async (skillsToUpload: Skill[], wikiId: string): Promise<void> => {
    const target = registeredWikis.find((w) => w.wikiId === wikiId)
    const wikiLabel = target?.wikiName || wikiId
    let okCount = 0
    let failCount = 0
    for (let i = 0; i < skillsToUpload.length; i++) {
      const skill = skillsToUpload[i]
      setUploadProgress({ current: i + 1, total: skillsToUpload.length, wikiName: wikiLabel, currentName: skill.name })
      try {
        await window.api.dooray.wiki.storageUpload({
          wikiId, kind: 'skills', name: skill.name, content: skill.content,
          parentPageIdHint: target?.parentPageId
        })
        okCount++
      } catch (err) {
        failCount++
        console.error('[Skills] upload failed:', skill.name, err)
      }
    }
    setUploadProgress(null)
    if (okCount > 0) {
      toast.success(`${okCount}개 ${wikiLabel} 에 업로드됨`)
      if (tab === 'wiki' && wikiId === activeWikiId) await loadWikiItems()
    }
    if (failCount > 0) toast.error(`${failCount}개 업로드 실패`)
  }

  const handleShareToWiki = async (skillsToUpload: Skill[]): Promise<void> => {
    if (registeredWikis.length === 0) {
      toast.warn('등록된 위키가 없습니다', "'공유' 탭에서 먼저 위키를 등록하세요")
      return
    }
    if (registeredWikis.length === 1) {
      await uploadSkillsToWiki(skillsToUpload, registeredWikis[0].wikiId)
    } else {
      setShareTargetPicker({ skills: skillsToUpload })
    }
  }

  const handleUploadToWiki = (skill: Skill): Promise<void> => handleShareToWiki([skill])

  const handleDownloadFromWiki = async (item: WikiStorageEntry): Promise<void> => {
    if (!activeWikiId) return
    try {
      let content = item.content
      if (!content) {
        const full = await window.api.dooray.wiki.storageGet(activeWikiId, item.pageId)
        content = full.content
      }
      await window.api.skills.save({ filename: item.name, content })
      toast.success(`"${item.name}" 내려받음`)
      await loadSkills()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '내려받기 실패')
    }
  }

  const handleDeleteFromWiki = async (item: WikiStorageEntry): Promise<void> => {
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

  const handleOpen = (skill: Skill): void => {
    setActiveSkill(skill)
    setEditorContent(skill.content)
    setIsDirty(false)
  }

  const closeEditor = (): void => {
    if (isDirty && !window.confirm('저장하지 않은 변경사항이 있습니다. 닫을까요?')) return
    setActiveSkill(null)
    setEditorContent('')
    setIsDirty(false)
  }

  const handleCreated = async (skill: Skill): Promise<void> => {
    setCreating(false)
    setActiveSkill(skill)
    setEditorContent(skill.content)
    setIsDirty(false)
    // Optimistic: 새 스킬을 목록에 즉시 반영 — fs 동기화 지연으로 list() 가 빈 결과를 반환해도
    // 사용자가 방금 추가한 스킬이 사라지지 않도록 보장.
    setSkills((prev) => {
      const exists = prev.some((s) => s.filename === skill.filename)
      return exists ? prev : [...prev, skill].sort((a, b) => a.name.localeCompare(b.name))
    })
    await loadSkills()
  }

  const handleSave = async (): Promise<void> => {
    if (!activeSkill) return
    try {
      await window.api.skills.save({
        filename: activeSkill.filename,
        content: editorContent
      })
      setIsDirty(false)
      await loadSkills()
    } catch (err) {
      console.error('Failed to save skill:', err)
    }
  }

  const handleDelete = async (skill: Skill): Promise<void> => {
    const ok = window.confirm(`"${skill.name}" 스킬을 삭제할까요?\n삭제 후에는 복구할 수 없습니다.`)
    if (!ok) return
    try {
      await window.api.skills.delete(skill.filename)
      if (activeSkill?.filename === skill.filename) {
        setActiveSkill(null)
        setEditorContent('')
      }
      await loadSkills()
    } catch (err) {
      console.error('Failed to delete skill:', err)
    }
  }

  const filteredSkills = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = skills
    if (q) {
      list = list.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        s.filename.toLowerCase().includes(q) ||
        s.content.toLowerCase().includes(q)
      )
    }
    return list
  }, [skills, search])

  // 공유(위키) 탭 검색 — 이름/본문 기준 필터
  const filteredWikiItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return wikiItems
    return wikiItems.filter((i) =>
      i.name.toLowerCase().includes(q) ||
      (i.content || '').toLowerCase().includes(q)
    )
  }, [wikiItems, search])

  // "내 스킬 공유하기" picker 내부 검색 — 이름/파일명 기준 필터
  const pickerVisibleSkills = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase()
    if (!q) return skills
    return skills.filter((s) =>
      s.name.toLowerCase().includes(q) || s.filename.toLowerCase().includes(q)
    )
  }, [skills, pickerSearch])
  const pickerAllVisibleSelected = pickerVisibleSkills.length > 0 &&
    pickerVisibleSkills.every((s) => pickerSelected.has(s.filename))

  const handleEditorChange = (value: string): void => {
    setEditorContent(value)
    setIsDirty(true)
  }

  const toggleSelected = (filename: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(filename)) next.delete(filename)
      else next.add(filename)
      return next
    })
  }

  const exitSelectMode = (): void => {
    setSelectMode(false)
    setSelected(new Set())
  }

  const handleBulkDelete = async (): Promise<void> => {
    if (selected.size === 0) return
    const ok = window.confirm(`선택한 ${selected.size}개 스킬을 삭제할까요?\n복구할 수 없습니다.`)
    if (!ok) return
    try {
      const res = await window.api.skills.deleteMany(Array.from(selected))
      toast.success(`${res.deleted}개 삭제됨`)
      exitSelectMode()
      await loadSkills()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '삭제 실패')
    }
  }

  const handleBulkExport = async (): Promise<void> => {
    if (selected.size === 0) return
    try {
      const res = await window.api.skills.exportToFolder(Array.from(selected))
      if (res.cancelled) return
      toast.success(`${res.exported}개 내보냄`, res.folder || '')
      exitSelectMode()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '내보내기 실패')
    }
  }

  const handleBulkShare = async (): Promise<void> => {
    if (selected.size === 0) return
    const targets = filteredSkills.filter((s) => selected.has(s.filename))
    await handleShareToWiki(targets)
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
        await window.api.skills.save({ filename: item.name, content })
        okCount++
      } catch (err) {
        failCount++
        console.error('[Skills] bulk download failed:', item.name, err)
      }
    }
    if (okCount > 0) toast.success(`${okCount}개 내려받음`)
    if (failCount > 0) toast.error(`${failCount}개 실패`)
    exitSelectMode()
    await loadSkills()
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
        console.error('[Skills] bulk delete failed:', item.name, err)
      }
    }
    if (okCount > 0) toast.success(`${okCount}개 삭제됨`)
    if (failCount > 0) toast.error(`${failCount}개 실패 (본인 페이지가 아닐 수 있음)`)
    exitSelectMode()
    await loadWikiItems()
  }

  const handleImport = async (): Promise<void> => {
    try {
      const res = await window.api.skills.importFromFiles()
      if (res.cancelled) return
      if (res.imported === 0) {
        toast.warn('가져온 파일이 없습니다')
        return
      }
      toast.success(`${res.imported}개 가져옴`)
      await loadSkills()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '가져오기 실패')
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      {uploadProgress && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-lg shadow-2xl border border-clauday-blue/40"
          style={{ background: 'var(--bg-surface-raised)' }}>
          <Loader2 size={14} className="animate-spin text-clauday-blue" />
          <div className="flex flex-col">
            <span className="text-[calc(12px_*_var(--app-font-scale,1))] text-text-primary font-medium">
              {uploadProgress.wikiName} 에 업로드 중 ({uploadProgress.current}/{uploadProgress.total})
            </span>
            <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary truncate max-w-[260px]">{uploadProgress.currentName}</span>
          </div>
        </div>
      )}
      <div className="px-5 py-4 space-y-3">
        {/* PageHeader */}
        <div className="flex items-center gap-3 flex-wrap">
          <Sparkles size={18} className="text-clauday-blue" />
          <h2 className="text-[calc(14px_*_var(--app-font-scale,1))] font-semibold text-text-primary">Claude 스킬</h2>
          <span className="ds-chip neutral">
            {tab === 'mine' ? `${skills.length}개` : `${wikiItems.length}개 공유됨`}
          </span>
          <SegTabs<FilterTab>
            value={tab}
            onChange={(t) => { setTab(t); exitSelectMode() }}
            items={[
              { key: 'mine', label: '내 스킬' },
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
          {tab === 'mine' && (
            <>
              <Button variant="secondary" onClick={() => loadSkills()} leftIcon={<RefreshCw size={13} />}>
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
              <Button variant="primary" onClick={() => setCreating(true)} leftIcon={<Plus size={13} />}>
                스킬 추가
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
              <Button variant="primary" onClick={() => { setPickerSelected(new Set()); setPickerSearch(''); setSharePickerOpen(true) }} leftIcon={<Upload size={13} />}>
                내 스킬 공유하기
              </Button>
            </>
          )}
        </div>

        {/* 다중 선택 액션바 — mine / wiki 탭 별도 액션 */}
        {selectMode && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-clauday-orange/8 border border-clauday-orange/30">
            <span className="text-xs text-text-primary font-medium">{selected.size}개 선택됨</span>
            <button
              type="button"
              onClick={() => {
                const all = tab === 'mine' ? filteredSkills.map((s) => s.filename) : filteredWikiItems.map((i) => i.pageId)
                if (selected.size === all.length) setSelected(new Set())
                else setSelected(new Set(all))
              }}
              className="text-[calc(11px_*_var(--app-font-scale,1))] text-clauday-orange hover:underline"
            >
              {(() => {
                const all = tab === 'mine' ? filteredSkills.length : filteredWikiItems.length
                return selected.size === all && all > 0 ? '전체 해제' : '전체 선택'
              })()}
            </button>
            <div className="flex-1" />
            {tab === 'mine' && (
              <>
                {registeredWikis.length > 0 && (
                  <Button variant="primary" onClick={handleBulkShare} disabled={selected.size === 0} leftIcon={<Upload size={13} />}>
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

        {/* Search */}
        {(tab === 'mine' ? skills.length > 0 : wikiItems.length > 0) && (
          <div className="relative max-w-md">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === 'mine' ? '이름·내용 검색...' : '공유 스킬 이름·내용 검색...'}
              className="ds-input sm"
              style={{ paddingLeft: 28, paddingRight: 28 }}
            />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary">
                <X size={12} />
              </button>
            )}
          </div>
        )}

        {/* Grid */}
        {tab === 'mine' ? (
          skills.length === 0 ? (
            <div className="py-16 text-center">
              <Sparkles size={32} className="mx-auto text-text-tertiary mb-3" />
              <p className="text-sm font-medium text-text-primary mb-1">스킬이 없습니다</p>
              <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary mb-4">'스킬 추가' 버튼으로 첫 스킬을 만들어보세요</p>
              <Button variant="primary" onClick={() => setCreating(true)} leftIcon={<Plus size={13} />}>
                스킬 추가
              </Button>
            </div>
          ) : filteredSkills.length === 0 ? (
            <div className="py-12 text-center text-[calc(12px_*_var(--app-font-scale,1))] text-text-tertiary">
              "{search}"에 일치하는 스킬이 없습니다
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredSkills.map((skill) => (
                <SkillCard
                  key={skill.filename}
                  skill={skill}
                  onOpen={() => handleOpen(skill)}
                  onDelete={() => handleDelete(skill)}
                  onUploadToWiki={registeredWikis.length > 0 ? () => handleUploadToWiki(skill) : undefined}
                  selectable={selectMode}
                  selected={selected.has(skill.filename)}
                  onToggleSelect={() => toggleSelected(skill.filename)}
                />
              ))}
            </div>
          )
        ) : (
          // 공유 탭 (위키 저장소 기반)
          !activeWikiId ? (
            <div className="py-16 text-center">
              <Sparkles size={32} className="mx-auto text-text-tertiary mb-3" />
              <p className="text-sm font-medium text-text-primary mb-1">위키를 등록하세요</p>
              <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary">상단 톱니바퀴 → 위키를 체크하거나 수동 추가로 등록하면, 해당 위키에서 공유 중인 스킬이 여기 표시됩니다</p>
            </div>
          ) : wikiLoading ? (
            <div className="py-12 text-center text-[calc(12px_*_var(--app-font-scale,1))] text-text-tertiary">공유 스킬 불러오는 중...</div>
          ) : wikiItems.length === 0 ? (
            <div className="py-16 text-center">
              <Upload size={32} className="mx-auto text-text-tertiary mb-3" />
              <p className="text-sm font-medium text-text-primary mb-1">아직 공유된 스킬이 없습니다</p>
              <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary">'내 스킬 공유하기' 버튼으로 위키에 스킬을 업로드해보세요</p>
            </div>
          ) : filteredWikiItems.length === 0 ? (
            <div className="py-12 text-center text-[calc(12px_*_var(--app-font-scale,1))] text-text-tertiary">
              "{search}"에 일치하는 공유 스킬이 없습니다
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredWikiItems.map((item) => {
                const isSelected = selectMode && selected.has(item.pageId)
                const description = extractFrontmatterDescription(item.content)
                const openPreview = (): void => {
                  setPreviewShared({
                    postId: item.pageId,
                    filename: item.name,
                    name: item.name,
                    content: item.content,
                    description,
                    authorName: '',
                    createdAt: '',
                    updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : '',
                    isMine: false
                  })
                }
                return (
                  <div
                    key={item.pageId}
                    onClick={selectMode ? () => toggleSelected(item.pageId) : openPreview}
                    className="ds-card cursor-pointer transition-all hover:border-clauday-blue/40"
                    style={{
                      padding: '12px 14px',
                      ...(isSelected
                        ? { boxShadow: '0 0 0 2px var(--accent-orange, #FB923C)', borderColor: 'var(--accent-orange, #FB923C)' }
                        : {})
                    }}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-[6px] flex-none flex items-center justify-center bg-clauday-blue/10">
                        <Sparkles size={15} className="text-clauday-blue" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[calc(13px_*_var(--app-font-scale,1))] font-semibold text-text-primary truncate">{item.name}</div>
                        {description ? (
                          <div className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary mt-0.5 leading-relaxed line-clamp-2">
                            {description}
                          </div>
                        ) : null}
                        <div className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mt-1">
                          {item.updatedAt ? new Date(item.updatedAt).toLocaleString('ko-KR') : '날짜 없음'}
                        </div>
                      </div>
                    </div>
                    {!selectMode && (
                      <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-bg-border/60">
                        <div className="flex-1" />
                        <button onClick={(e) => { e.stopPropagation(); handleDownloadFromWiki(item) }}
                          className="flex items-center gap-1 text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary hover:text-clauday-blue">
                          <Download size={11} /> 내려받기
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
      </div>

      {creating && (
        <SkillCreateModal onClose={() => setCreating(false)} onCreated={handleCreated} />
      )}

      {/* 공유 탭 — "내 스킬 공유하기" picker. 로컬 스킬을 (여러 개) 골라 위키에 업로드. */}
      <Modal
        open={sharePickerOpen}
        onClose={() => setSharePickerOpen(false)}
        width="min(560px, 92vw)"
        icon={<Upload size={14} className="text-clauday-blue" />}
        title="내 스킬 공유하기"
        footer={skills.length > 0 ? (
          <div className="flex items-center justify-between w-full gap-2">
            <button
              onClick={() => setPickerSelected((prev) => {
                const next = new Set(prev)
                if (pickerAllVisibleSelected) pickerVisibleSkills.forEach((s) => next.delete(s.filename))
                else pickerVisibleSkills.forEach((s) => next.add(s.filename))
                return next
              })}
              disabled={pickerVisibleSkills.length === 0}
              className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary hover:text-text-primary px-2 py-1 disabled:opacity-40">
              {pickerAllVisibleSelected ? '전체 해제' : '전체 선택'}
            </button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="md" onClick={() => setSharePickerOpen(false)} disabled={uploadProgress !== null}>취소</Button>
              <Button
                variant="primary"
                size="md"
                disabled={pickerSelected.size === 0 || uploadProgress !== null}
                leftIcon={uploadProgress !== null ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                onClick={async () => {
                  const targets = skills.filter((s) => pickerSelected.has(s.filename))
                  if (targets.length === 0) return
                  await handleShareToWiki(targets)
                  setSharePickerOpen(false)
                }}>
                {uploadProgress !== null
                  ? `업로드 중… (${uploadProgress.current}/${uploadProgress.total})`
                  : `선택한 ${pickerSelected.size}개 공유`}
              </Button>
            </div>
          </div>
        ) : undefined}
      >
        <div className="p-4">
          <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary mb-3">
            위키에 공유할 내 스킬을 선택하세요. 여러 개를 한 번에 올릴 수 있습니다.
          </p>
          {skills.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-secondary">공유할 내 스킬이 없습니다.</div>
          ) : (
            <>
              {/* picker 내부 검색 */}
              <div className="relative mb-2">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
                <input
                  type="text"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="스킬 이름 검색..."
                  className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-bg-surface border border-bg-border text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clauday-blue"
                />
                {pickerSearch && (
                  <button onClick={() => setPickerSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary">
                    <X size={12} />
                  </button>
                )}
              </div>
              {pickerVisibleSkills.length === 0 ? (
                <div className="py-8 text-center text-xs text-text-secondary">"{pickerSearch}"에 일치하는 스킬이 없습니다.</div>
              ) : (
            <div className="flex flex-col gap-1.5 max-h-[50vh] overflow-y-auto">
              {pickerVisibleSkills.map((skill) => {
                // 활성 위키에 이미 공유된 스킬인지 확인
                const alreadyShared = wikiItems.some((i) => i.name === skill.name)
                const checked = pickerSelected.has(skill.filename)
                const toggle = (): void => setPickerSelected((prev) => {
                  const next = new Set(prev)
                  if (next.has(skill.filename)) next.delete(skill.filename); else next.add(skill.filename)
                  return next
                })
                return (
                  <label key={skill.filename}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer select-none transition-colors ${
                      checked ? 'bg-clauday-blue/10 border-clauday-blue/40' : 'bg-bg-surface border-bg-border hover:bg-bg-surface-hover'
                    }`}>
                    <input type="checkbox" className="accent-clauday-blue flex-shrink-0" checked={checked} onChange={toggle} />
                    <Sparkles size={13} className="text-clauday-blue flex-shrink-0" />
                    <span className="text-sm text-text-primary truncate flex-1" title={skill.name}>{skill.name}</span>
                    {alreadyShared && <span className="ds-chip neutral flex-shrink-0">공유됨</span>}
                  </label>
                )
              })}
            </div>
              )}
            </>
          )}
        </div>
      </Modal>

      {/* Editor modal (내 스킬 편집) */}
      <Modal
        open={!!activeSkill}
        onClose={closeEditor}
        width="min(1000px, 92vw)"
        icon={<Sparkles size={14} className="text-clauday-blue" />}
        title={activeSkill ? `스킬 편집 — ${activeSkill.name}` : ''}
        footer={
          <>
            <div style={{ flex: 1 }} />
            <Button variant="ghost" onClick={closeEditor}>닫기</Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={!isDirty}
              leftIcon={<Save size={12} />}
            >
              저장
            </Button>
          </>
        }
      >
        {activeSkill && (
          <div style={{ height: '70vh', display: 'flex', flexDirection: 'column' }}>
            <SkillEditor
              filename={activeSkill.filename}
              content={editorContent}
              onChange={handleEditorChange}
            />
          </div>
        )}
      </Modal>

      {/* 위키 공유 스킬 미리보기 */}
      <Modal
        open={!!previewShared}
        onClose={() => setPreviewShared(null)}
        width="min(900px, 92vw)"
        icon={<Sparkles size={14} className="text-clauday-blue" />}
        title={previewShared?.name}
        footer={
          <>
            {previewShared && previewShared.authorName && (
              <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary flex items-center gap-1">
                <User size={11} />
                {previewShared.authorName}
              </span>
            )}
            <div style={{ flex: 1 }} />
            <Button variant="ghost" onClick={() => setPreviewShared(null)}>닫기</Button>
            {previewShared && (
              <Button
                variant="primary"
                onClick={async () => {
                  if (previewShared) {
                    await handleDownloadFromWiki({
                      pageId: previewShared.postId,
                      name: previewShared.name,
                      content: previewShared.content,
                      updatedAt: previewShared.updatedAt ? new Date(previewShared.updatedAt).getTime() : 0
                    })
                    setPreviewShared(null)
                  }
                }}
                leftIcon={<Download size={12} />}
              >
                다운로드
              </Button>
            )}
          </>
        }
      >
        {previewShared && (
          !previewShared.content ? (
            <div className="text-[calc(12px_*_var(--app-font-scale,1))] text-text-tertiary py-8 text-center">(본문 없음)</div>
          ) : (
            // 스킬은 frontmatter(---) + 마크다운 본문 형식 — GFM 으로 렌더
            <div className="markdown-body text-[calc(12px_*_var(--app-font-scale,1))] leading-relaxed text-text-primary"
              style={{ maxHeight: '60vh', overflow: 'auto' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {previewShared.content}
              </ReactMarkdown>
            </div>
          )
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
                {shareTargetPicker.skills.length}개 스킬을 어느 위키에 올릴까요?
              </div>
            </div>
            <div className="py-1 max-h-80 overflow-y-auto">
              {registeredWikis.map((w) => (
                <button
                  key={w.wikiId}
                  onClick={async () => {
                    const skillsToUpload = shareTargetPicker.skills
                    setShareTargetPicker(null)
                    await uploadSkillsToWiki(skillsToUpload, w.wikiId)
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-left text-[calc(12px_*_var(--app-font-scale,1))] text-text-secondary hover:bg-bg-surface-hover transition-colors"
                  type="button"
                >
                  <Sparkles size={12} className="text-clauday-blue" />
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

export default SkillsManager
