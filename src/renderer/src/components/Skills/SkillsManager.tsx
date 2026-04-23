import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Save, Sparkles, Search, X, Download, Upload, User, Loader2, RefreshCw } from 'lucide-react'
import SkillCard from './SkillCard'
import SharedSkillCard from './SharedSkillCard'
import SkillEditor from './SkillEditor'
import SkillCreateModal from './SkillCreateModal'
import type { Skill } from '../../../../shared/types/skills'
import type { SharedSkill } from '../../../../shared/types/shared-skills'
import { Button, Modal, SegTabs, useToast } from '../common/ds'

type FilterTab = 'mine' | 'shared'

function SkillsManager(): JSX.Element {
  const toast = useToast()
  const [skills, setSkills] = useState<Skill[]>([])
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<FilterTab>('mine')

  // 공유소 상태
  const [sharedSkills, setSharedSkills] = useState<SharedSkill[]>([])
  const [sharedLoading, setSharedLoading] = useState(false)
  const [previewShared, setPreviewShared] = useState<SharedSkill | null>(null)
  const [sharedBusy, setSharedBusy] = useState<string | null>(null)
  const [uploadingSkill, setUploadingSkill] = useState<string | null>(null) // filename of uploading skill
  const [previewLoading, setPreviewLoading] = useState(false)

  const loadSkills = useCallback(async () => {
    try {
      const list = await window.api.skills.list()
      setSkills(list)
    } catch (err) {
      console.error('Failed to load skills:', err)
    }
  }, [])

  const loadSharedSkills = useCallback(async () => {
    setSharedLoading(true)
    try {
      if (!window.api.sharedSkills) {
        throw new Error('앱 업데이트 반영 필요 — 앱을 완전히 종료 후 다시 실행하세요')
      }
      const list = await window.api.sharedSkills.list()
      setSharedSkills(list)
    } catch (err) {
      console.error('Failed to load shared skills:', err)
      toast.error(err instanceof Error ? err.message : '공유 스킬 로드 실패')
    } finally {
      setSharedLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadSkills()
    const cleanup = window.api.onConfigChanged(() => { loadSkills() })
    return cleanup
  }, [loadSkills])

  useEffect(() => {
    if (tab === 'shared' && sharedSkills.length === 0) loadSharedSkills()
  }, [tab, sharedSkills.length, loadSharedSkills])

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

  const handleShareUpload = async (skill: Skill): Promise<void> => {
    if (uploadingSkill) return // 중복 업로드 방지
    if (!window.api.sharedSkills) {
      toast.error('앱 업데이트 반영 필요 — 앱을 완전히 종료 후 다시 실행하세요')
      return
    }
    const ok = window.confirm(
      `"${skill.name}" 스킬을 공유소에 업로드할까요?\n\n` +
      `업로드된 스킬은 모든 동료가 다운로드할 수 있습니다.\n` +
      `본문에 민감한 정보(토큰/API 키 등)가 포함돼 있지 않은지 먼저 확인해주세요.`
    )
    if (!ok) return
    setUploadingSkill(skill.filename)
    toast.info(`"${skill.name}" 업로드 중...`)
    try {
      await window.api.sharedSkills.upload({
        filename: skill.filename,
        name: skill.name,
        content: skill.content
      })
      toast.success(`"${skill.name}" 공유소에 업로드 완료`)
      setTab('shared')
      loadSharedSkills()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '업로드 실패 — 두레이 로그인 상태를 확인하세요')
    } finally {
      setUploadingSkill(null)
    }
  }

  const handleSharedDownload = async (shared: SharedSkill): Promise<void> => {
    setSharedBusy(shared.postId)
    try {
      const { filename } = await window.api.sharedSkills.download(shared.postId)
      toast.success(`"${filename}" 내 스킬에 추가됨`)
      await loadSkills()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '다운로드 실패')
    } finally {
      setSharedBusy(null)
    }
  }

  const handleSharedDelete = async (shared: SharedSkill): Promise<void> => {
    const ok = window.confirm(`"${shared.name}"의 공유를 해제할까요?\n\n공유소(두레이 위키)에서 제거됩니다.`)
    if (!ok) return
    setSharedBusy(shared.postId)
    try {
      await window.api.sharedSkills.delete(shared.postId)
      toast.success('공유 해제 완료')
      await loadSharedSkills()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '공유 해제 실패')
    } finally {
      setSharedBusy(null)
    }
  }

  const handleOpenSharedPreview = async (shared: SharedSkill): Promise<void> => {
    // 본문이 비어있으면 상세 조회 — 먼저 모달 열고 로딩 상태 표시
    setPreviewShared(shared)
    if (!shared.content) {
      setPreviewLoading(true)
      try {
        const full = await window.api.sharedSkills.get(shared.postId)
        setPreviewShared(full)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '상세 조회 실패')
        setPreviewShared(null)
      } finally {
        setPreviewLoading(false)
      }
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

  const filteredShared = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sharedSkills
    return sharedSkills.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.authorName.toLowerCase().includes(q)
    )
  }, [sharedSkills, search])

  const handleEditorChange = (value: string): void => {
    setEditorContent(value)
    setIsDirty(true)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 py-4 space-y-3">
        {/* PageHeader */}
        <div className="flex items-center gap-3 flex-wrap">
          <Sparkles size={18} className="text-clover-blue" />
          <h2 className="text-[14px] font-semibold text-text-primary">Claude 스킬</h2>
          <span className="ds-chip neutral">
            {tab === 'mine' ? `${skills.length}개` : `${sharedSkills.length}개 공유됨`}
          </span>
          <div className="flex-1" />
          <SegTabs<FilterTab>
            value={tab}
            onChange={setTab}
            items={[
              { key: 'mine', label: '내 스킬' },
              { key: 'shared', label: '공유' }
            ]}
          />
          {tab === 'mine' && (
            <Button variant="primary" onClick={() => setCreating(true)} leftIcon={<Plus size={13} />}>
              스킬 추가
            </Button>
          )}
          {tab === 'shared' && (
            <Button variant="primary" onClick={loadSharedSkills} disabled={sharedLoading}
              leftIcon={<RefreshCw size={12} className={sharedLoading ? 'animate-spin' : ''} />}>
              새로고침
            </Button>
          )}
        </div>

        {/* Search */}
        {(tab === 'mine' ? skills.length : sharedSkills.length) > 0 && (
          <div className="relative max-w-md">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === 'mine' ? '이름·내용 검색...' : '이름·작성자 검색...'}
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
              <p className="text-[11px] text-text-tertiary mb-4">'스킬 추가' 버튼으로 첫 스킬을 만들어보세요</p>
              <Button variant="primary" onClick={() => setCreating(true)} leftIcon={<Plus size={13} />}>
                스킬 추가
              </Button>
            </div>
          ) : filteredSkills.length === 0 ? (
            <div className="py-12 text-center text-[12px] text-text-tertiary">
              "{search}"에 일치하는 스킬이 없습니다
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredSkills.map((skill) => (
                <SkillCard
                  key={skill.filename}
                  skill={skill}
                  uploading={uploadingSkill === skill.filename}
                  onOpen={() => handleOpen(skill)}
                  onShare={() => handleShareUpload(skill)}
                  onDelete={() => handleDelete(skill)}
                />
              ))}
            </div>
          )
        ) : (
          // Shared tab
          sharedLoading ? (
            <div className="py-12 text-center text-[12px] text-text-tertiary">공유 스킬 불러오는 중...</div>
          ) : sharedSkills.length === 0 ? (
            <div className="py-16 text-center">
              <Upload size={32} className="mx-auto text-text-tertiary mb-3" />
              <p className="text-sm font-medium text-text-primary mb-1">공유된 스킬이 없습니다</p>
              <p className="text-[11px] text-text-tertiary">'내 스킬'에서 카드 메뉴 → '공유 업로드'로 첫 공유를 시작하세요</p>
            </div>
          ) : filteredShared.length === 0 ? (
            <div className="py-12 text-center text-[12px] text-text-tertiary">
              "{search}"에 일치하는 공유 스킬이 없습니다
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredShared.map((shared) => (
                <SharedSkillCard
                  key={shared.postId}
                  skill={shared}
                  busy={sharedBusy === shared.postId}
                  onOpen={() => handleOpenSharedPreview(shared)}
                  onDownload={() => handleSharedDownload(shared)}
                  onDelete={shared.isMine ? () => handleSharedDelete(shared) : undefined}
                />
              ))}
            </div>
          )
        )}
      </div>

      {creating && (
        <SkillCreateModal onClose={() => setCreating(false)} onCreated={handleCreated} />
      )}

      {/* Editor modal (내 스킬 편집) */}
      <Modal
        open={!!activeSkill}
        onClose={closeEditor}
        width="min(1000px, 92vw)"
        icon={<Sparkles size={14} className="text-clover-blue" />}
        title={activeSkill?.name}
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

      {/* 공유 스킬 미리보기 */}
      <Modal
        open={!!previewShared}
        onClose={() => setPreviewShared(null)}
        width="min(900px, 92vw)"
        icon={<Sparkles size={14} className="text-clover-blue" />}
        title={previewShared?.name}
        footer={
          <>
            {previewShared && (
              <span className="text-[11px] text-text-tertiary flex items-center gap-1">
                <User size={11} />
                {previewShared.authorName}{previewShared.isMine && ' · 나'}
              </span>
            )}
            <div style={{ flex: 1 }} />
            <Button variant="ghost" onClick={() => setPreviewShared(null)}>닫기</Button>
            {previewShared && (
              <Button
                variant="primary"
                onClick={async () => {
                  await handleSharedDownload(previewShared)
                  setPreviewShared(null)
                }}
                disabled={sharedBusy === previewShared.postId}
                leftIcon={<Download size={12} />}
              >
                다운로드
              </Button>
            )}
          </>
        }
      >
        {previewShared && (
          previewLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[12px] text-text-tertiary">
              <Loader2 size={14} className="animate-spin text-clover-blue" />
              스킬 내용 불러오는 중...
            </div>
          ) : (
            <pre className="font-mono text-[11.5px] leading-relaxed text-text-primary whitespace-pre-wrap break-words"
              style={{ maxHeight: '60vh', overflow: 'auto' }}>
              {previewShared.content || '(본문 없음)'}
            </pre>
          )
        )}
      </Modal>
    </div>
  )
}

export default SkillsManager
