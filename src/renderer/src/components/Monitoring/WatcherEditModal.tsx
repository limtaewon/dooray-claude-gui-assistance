import { useState, useEffect, useMemo } from 'react'
import {
  X, Sparkles, Loader2, Check, AlertCircle, Radar, Search, Hash, Lock, Plus
} from 'lucide-react'
import type { Watcher, FilterRule } from '../../../../shared/types/watcher'
import type { DoorayChannel } from '../../../../shared/types/messenger'

interface Props {
  watcher: Watcher | null
  onClose: () => void
  onSaved: () => void
}

function WatcherEditModal({ watcher, onClose, onSaved }: Props): JSX.Element {
  const isEdit = !!watcher
  const [name, setName] = useState(watcher?.name || '')
  const [instruction, setInstruction] = useState(watcher?.instruction || '')
  const [filter, setFilter] = useState<FilterRule | null>(watcher?.filter || null)
  const [channels, setChannels] = useState<DoorayChannel[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(watcher?.channelIds || []))
  const [channelSearch, setChannelSearch] = useState('')

  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.messenger.listChannels().then(setChannels).catch(() => setChannels([]))
  }, [])

  const filteredChannels = useMemo(() => {
    if (!channelSearch) return channels
    const q = channelSearch.toLowerCase()
    return channels.filter((c) => (c.displayName || c.title || '').toLowerCase().includes(q))
  }, [channels, channelSearch])

  const handleGenerate = async (): Promise<void> => {
    if (!instruction.trim()) return
    setGenerating(true); setError(null)
    try {
      const rule = await window.api.watcher.generateFilter(instruction)
      setFilter(rule)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 필터 생성 실패')
    } finally {
      setGenerating(false)
    }
  }

  const toggleChannel = (id: string): void => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const handleSave = async (): Promise<void> => {
    if (!name.trim()) { setError('와처 이름을 입력하세요'); return }
    if (!filter) { setError('AI로 필터 규칙을 먼저 생성하세요'); return }
    if (selectedIds.size === 0) { setError('감시할 채널을 하나 이상 선택하세요'); return }

    setSaving(true); setError(null)
    try {
      const selectedChannels = channels.filter((c) => selectedIds.has(c.id))
      const channelNames = selectedChannels.map((c) => c.displayName || c.title || c.id)
      const payload = {
        name: name.trim(),
        instruction: instruction.trim(),
        channelIds: Array.from(selectedIds),
        channelNames,
        filter
      }
      if (isEdit && watcher) {
        await window.api.watcher.update(watcher.id, payload)
      } else {
        await window.api.watcher.create(payload)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6"
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--bg-primary)', border: '1px solid var(--bg-border)' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-bg-border flex-shrink-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-clauday-orange/15 border border-clauday-orange/30">
            <Radar size={15} className="text-clauday-orange" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-text-primary">{isEdit ? '와처 수정' : '새 와처 만들기'}</h2>
            <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">AI가 자연어를 필터 규칙으로 변환해줍니다</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-surface text-text-tertiary hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* 이름 */}
          <div>
            <label className="text-[calc(11px_*_var(--app-font-scale,1))] font-semibold text-text-secondary block mb-1.5">와처 이름</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="예) 배포 알림, 장애 감지"
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clauday-orange"
            />
          </div>

          {/* AI 필터 생성 */}
          <div>
            <label className="text-[calc(11px_*_var(--app-font-scale,1))] font-semibold text-text-secondary block mb-1.5">
              어떤 메시지를 모으고 싶은가요?
            </label>
            <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)}
              placeholder="예) 배포, 릴리즈, deploy 관련 메시지. 단 테스트 환경은 제외&#10;예) 장애, 오류, error, fail이 포함된 메시지만"
              className="w-full min-h-[80px] px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clauday-orange resize-y"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">
                자연어로 작성하면 AI가 키워드/정규식/제외 규칙을 자동 생성합니다
              </span>
              <div className="flex items-center gap-1.5">
                {!filter && (
                  <button onClick={() => setFilter({ description: '직접 작성한 규칙', anyOf: [], allOf: [], regex: [], exclude: [], excludeRegex: [] })}
                    className="px-2.5 py-1.5 rounded-lg text-xs text-text-secondary border border-bg-border hover:text-text-primary hover:border-clauday-orange">
                    직접 만들기
                  </button>
                )}
                <button onClick={handleGenerate} disabled={generating || !instruction.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-clauday-orange to-clauday-blue disabled:opacity-40 hover:opacity-90">
                  {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {generating ? 'AI 생성 중...' : filter ? '다시 생성' : 'AI로 규칙 만들기'}
                </button>
              </div>
            </div>
          </div>

          {/* 생성된 규칙 — 직접 편집/추가/삭제 가능 */}
          {filter && (
            <div className="rounded-xl bg-clauday-orange/5 border border-clauday-orange/30 p-3 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Check size={11} className="text-clauday-orange" />
                  <span className="text-[calc(11px_*_var(--app-font-scale,1))] font-semibold text-text-primary">{filter.description}</span>
                </div>
                <button onClick={() => setFilter(null)}
                  className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary hover:text-red-400">
                  규칙 비우기
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[calc(10px_*_var(--app-font-scale,1))]">
                <EditableRuleSection label="포함 (OR)" items={filter.anyOf} color="text-emerald-400"
                  onChange={(items) => setFilter({ ...filter, anyOf: items })} />
                <EditableRuleSection label="모두 포함 (AND)" items={filter.allOf} color="text-clauday-blue"
                  onChange={(items) => setFilter({ ...filter, allOf: items })} />
                <EditableRuleSection label="정규식" items={filter.regex} color="text-purple-400" mono
                  onChange={(items) => setFilter({ ...filter, regex: items })} />
                <EditableRuleSection label="제외" items={filter.exclude} color="text-red-400"
                  onChange={(items) => setFilter({ ...filter, exclude: items })} />
                <EditableRuleSection label="제외 정규식" items={filter.excludeRegex} color="text-red-400" mono
                  onChange={(items) => setFilter({ ...filter, excludeRegex: items })} />
              </div>
              <p className="text-[calc(9px_*_var(--app-font-scale,1))] text-text-tertiary pt-1 border-t border-bg-border/50">
                💡 칩의 × 로 삭제, 아래 입력란으로 직접 추가. AI 결과 전체를 바꾸려면 지시사항 수정 후 "다시 생성"
              </p>
            </div>
          )}

          {/* 채널 선택 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[calc(11px_*_var(--app-font-scale,1))] font-semibold text-text-secondary">감시할 채널</label>
              <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">{selectedIds.size}개 선택됨</span>
            </div>
            <div className="relative mb-2">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input type="text" value={channelSearch} onChange={(e) => setChannelSearch(e.target.value)}
                placeholder="채널 검색..."
                className="w-full pl-7 pr-3 py-1.5 rounded-lg text-xs bg-bg-surface border border-bg-border text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clauday-orange"
              />
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-bg-border divide-y divide-bg-border/50">
              {filteredChannels.length === 0 ? (
                <div className="px-3 py-4 text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary text-center">채널이 없습니다</div>
              ) : filteredChannels.map((c) => {
                const Icon = c.type === 'private' ? Lock : Hash
                const selected = selectedIds.has(c.id)
                return (
                  <label key={c.id}
                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                      selected ? 'bg-clauday-orange/10' : 'hover:bg-bg-surface-hover'
                    }`}>
                    <input type="checkbox" checked={selected} onChange={() => toggleChannel(c.id)}
                      className="accent-clauday-orange" />
                    <Icon size={11} className={selected ? 'text-clauday-orange' : 'text-text-tertiary'} />
                    <span className={`text-xs truncate ${selected ? 'text-clauday-orange font-medium' : 'text-text-primary'}`}>
                      {c.displayName || c.title}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-red-500/10 text-red-400 border border-red-500/30">
              <AlertCircle size={13} /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-bg-border flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover">
            취소
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-clauday-orange hover:bg-clauday-orange/90 disabled:opacity-40">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {saving ? '저장 중...' : isEdit ? '수정 완료' : '와처 만들기'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditableRuleSection({ label, items, color, mono, onChange }: {
  label: string
  items?: string[]
  color: string
  mono?: boolean
  onChange: (items: string[]) => void
}): JSX.Element {
  const [draft, setDraft] = useState('')
  const list = items || []
  const removeAt = (i: number): void => {
    onChange(list.filter((_, idx) => idx !== i))
  }
  const add = (): void => {
    const v = draft.trim()
    if (!v) return
    if (list.includes(v)) { setDraft(''); return }
    onChange([...list, v])
    setDraft('')
  }
  return (
    <div>
      <div className={`text-[calc(9px_*_var(--app-font-scale,1))] font-bold mb-0.5 ${color}`}>{label}</div>
      <div className="flex flex-wrap gap-1 mb-1">
        {list.map((t, i) => (
          <span key={i}
            className={`group inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[calc(10px_*_var(--app-font-scale,1))] bg-bg-surface border border-bg-border text-text-primary ${mono ? 'font-mono' : ''}`}>
            {t}
            <button onClick={() => removeAt(i)}
              aria-label={`${t} 삭제`}
              className="opacity-50 group-hover:opacity-100 hover:text-red-400 transition-opacity">
              <X size={9} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'Enter') { e.preventDefault(); add() }
          }}
          placeholder="직접 추가"
          className={`flex-1 min-w-0 px-1.5 py-0.5 rounded text-[calc(10px_*_var(--app-font-scale,1))] bg-bg-surface border border-bg-border text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clauday-orange ${mono ? 'font-mono' : ''}`}
        />
        <button onClick={add} disabled={!draft.trim()}
          aria-label={`${label} 항목 추가`}
          className="p-0.5 rounded text-text-tertiary hover:text-clauday-orange disabled:opacity-30">
          <Plus size={11} />
        </button>
      </div>
    </div>
  )
}

export default WatcherEditModal
