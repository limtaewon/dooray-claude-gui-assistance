/**
 * StructuredFieldForm.tsx — 구조화 필드 폼 컴포넌트
 *
 * editMap(model, sourceMap) 기반으로 각 필드의 편집 가능 여부를 결정한다.
 * - [FORM] 필드: model 드롭다운, tools 멀티셀렉트 — 직접 편집 가능
 * - [RAW] 필드: "파일 에디터로 편집" 안내 + 파일 열기 버튼
 * - [AI] 필드: "AI 명령으로 편집" 안내
 * - [LOCK] 필드: 읽기전용 + 사유 표시
 *
 * 편집 시 applyFieldEdit 로 파일 텍스트를 생성한 뒤 DraftFileEdit 를 만들어
 * onEdit 콜백으로 반환한다 (draft 관리는 EditPanel 이 담당).
 */

import { useState, useCallback } from 'react'
import { Lock, Wand2, FileCode, ChevronDown, ChevronUp, Check, X } from 'lucide-react'
import type { HarnessModel } from '@shared/types/harness'
import type { AgentSourceMap, HarnessDraft, DraftFileEdit } from '@shared/types/harness-edit'
import Button from '@/components/common/ds/Button'
import Chip from '@/components/common/ds/Chip'
import { buildEditMap, MODEL_OPTIONS } from './editMap'
import type { EditFieldEntry } from './editMap'
import { applyFieldEdit } from './applyFieldEdit'
import type { FieldLocator } from './applyFieldEdit'

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export interface StructuredFieldFormProps {
  model: HarnessModel
  sourceMap: AgentSourceMap
  bundlePath: string
  draft: HarnessDraft
  /** 편집 완료 시 새 DraftFileEdit 반환 */
  onEdit: (edit: DraftFileEdit) => void
  /** raw 에디터로 파일 열기 요청 */
  onSelectFile: (relPath: string) => void
}

// ─────────────────────────────────────────────
// 내부 컴포넌트: 단일 필드 행
// ─────────────────────────────────────────────

interface FieldRowProps {
  entry: EditFieldEntry
  bundlePath: string
  draft: HarnessDraft
  onEdit: (edit: DraftFileEdit) => void
  onSelectFile: (relPath: string) => void
}

/** FORM 편집 필드 행 — model 드롭다운 또는 tools 멀티셀렉트 */
function FormFieldRow({ entry, bundlePath, draft, onEdit, onSelectFile }: FieldRowProps): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [localValue, setLocalValue] = useState<string | string[]>(entry.currentValue)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // draft 에 이미 편집이 있으면 시각 표시
  const isDirty = entry.target ? (entry.target.relPath in draft.edits) : false

  const handleSave = useCallback(async () => {
    if (!entry.target) return
    setLoading(true)
    setError(null)
    try {
      // 파일 원본 읽기 (baseContent 확보)
      const { content: baseContent } = await window.api.harness.edit.readFile(
        bundlePath,
        entry.target.relPath
      )
      // applyFieldEdit 로 새 파일 내용 생성
      const locator = (entry.target.locator ?? 'model') as FieldLocator
      const newContent = applyFieldEdit(baseContent, locator, localValue)
      const edit: DraftFileEdit = {
        relPath: entry.target.relPath,
        baseContent,
        draftContent: newContent,
        origin: 'form',
        fieldPath: entry.fieldPath,
        editedAt: new Date().toISOString(),
      }
      onEdit(edit)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [entry, bundlePath, localValue, onEdit])

  const handleCancel = useCallback(() => {
    setLocalValue(entry.currentValue)
    setEditing(false)
    setError(null)
  }, [entry.currentValue])

  const isModelField = entry.target?.locator === 'model'
  const isToolsField = entry.target?.locator === 'tools' || entry.target?.locator === 'allowed-tools'

  return (
    <div className={`border border-[color:var(--bg-border)] rounded-lg p-3 ${isDirty ? 'border-[color:var(--c-blue-solid)] bg-[color:var(--c-blue-bg)]' : 'bg-[color:var(--bg-surface)]'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-medium text-[color:var(--text-primary)]">{entry.label}</span>
            {isDirty && <Chip tone="blue" square>변경됨</Chip>}
          </div>
          {!editing && (
            <p className="text-xs text-[color:var(--text-secondary)] font-mono truncate">
              {Array.isArray(entry.currentValue)
                ? entry.currentValue.join(', ') || '(없음)'
                : entry.currentValue || '(없음)'}
            </p>
          )}
          {editing && isModelField && (
            <div className="mt-2">
              <select
                className="ds-input sm w-full text-xs"
                value={localValue as string}
                onChange={(e) => setLocalValue(e.target.value)}
                disabled={loading}
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}
          {editing && isToolsField && (
            <ToolsEditor
              value={localValue as string[]}
              onChange={setLocalValue}
              disabled={loading}
            />
          )}
          {error && (
            <p className="mt-1 text-xs text-[color:var(--c-red-fg)]">{error}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-none">
          {!editing && (
            <Button variant="ghost" size="xs" onClick={() => setEditing(true)}>
              편집
            </Button>
          )}
          {editing && (
            <>
              <Button
                variant="primary"
                size="xs"
                leftIcon={<Check size={10} />}
                onClick={() => { void handleSave() }}
                disabled={loading}
              >
                {loading ? '처리 중...' : '저장'}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                leftIcon={<X size={10} />}
                onClick={handleCancel}
                disabled={loading}
              >
                취소
              </Button>
            </>
          )}
          {entry.target && (
            <Button
              variant="ghost"
              size="xs"
              leftIcon={<FileCode size={10} />}
              onClick={() => onSelectFile(entry.target!.relPath)}
              title="raw 에디터로 파일 열기"
            />
          )}
        </div>
      </div>
      {entry.target && (
        <p className="mt-1 text-xs text-[color:var(--text-tertiary)]">
          파일: <span className="font-mono">{entry.target.relPath}</span>
        </p>
      )}
    </div>
  )
}

/** tools 멀티셀렉트 에디터 */
function ToolsEditor({
  value,
  onChange,
  disabled,
}: {
  value: string[]
  onChange: (v: string[]) => void
  disabled?: boolean
}): JSX.Element {
  const [input, setInput] = useState('')

  const handleAdd = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || value.includes(trimmed)) return
    onChange([...value, trimmed])
    setInput('')
  }, [input, value, onChange])

  const handleRemove = useCallback((tool: string) => {
    onChange(value.filter((t) => t !== tool))
  }, [value, onChange])

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-1 mb-2">
        {value.map((tool) => (
          <span
            key={tool}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[color:var(--c-blue-bg)] text-[color:var(--c-blue-fg)] border border-[color:var(--bg-border)]"
          >
            {tool}
            <button
              onClick={() => handleRemove(tool)}
              disabled={disabled}
              className="opacity-70 hover:opacity-100"
              aria-label={`${tool} 제거`}
            >
              <X size={9} />
            </button>
          </span>
        ))}
        {value.length === 0 && (
          <span className="text-xs text-[color:var(--text-tertiary)] italic">(도구 없음)</span>
        )}
      </div>
      <div className="flex gap-1.5">
        <input
          className="ds-input sm flex-1 text-xs"
          placeholder="도구 이름 추가 (예: Read)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
          disabled={disabled}
        />
        <Button variant="secondary" size="xs" onClick={handleAdd} disabled={disabled || !input.trim()}>
          추가
        </Button>
      </div>
    </div>
  )
}

/** RAW/AI/LOCK 모드 필드 행 */
function ReadonlyFieldRow({ entry, onSelectFile }: Pick<FieldRowProps, 'entry' | 'onSelectFile'>): JSX.Element {
  const [collapsed, setCollapsed] = useState(true)
  const currentDisplay = Array.isArray(entry.currentValue)
    ? entry.currentValue.join(', ')
    : entry.currentValue

  const toggle = () => setCollapsed((v) => !v)

  return (
    <div className="border border-[color:var(--bg-border)] rounded-lg bg-[color:var(--bg-surface)]">
      {/* 헤더 행 전체가 클릭 타겟 — 내부 인터랙티브 요소는 stopPropagation */}
      <div
        className="flex items-center justify-between gap-2 p-3 cursor-pointer select-none hover:bg-[color:var(--bg-surface-hover)] rounded-lg transition-colors"
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {entry.mode === 'lock' && <Lock size={11} className="text-[color:var(--text-tertiary)] flex-none" />}
          {entry.mode === 'ai' && <Wand2 size={11} className="text-[color:var(--c-violet-fg)] flex-none" />}
          {entry.mode === 'raw' && <FileCode size={11} className="text-[color:var(--text-tertiary)] flex-none" />}
          <span className="text-xs font-medium text-[color:var(--text-primary)] truncate">{entry.label}</span>
          <Chip tone={entry.mode === 'lock' ? 'neutral' : entry.mode === 'ai' ? 'violet' : 'neutral'} square>
            {entry.mode === 'lock' ? '편집 불가' : entry.mode === 'ai' ? 'AI 전용' : '원본 파일'}
          </Chip>
        </div>
        <div className="flex items-center gap-1 flex-none">
          {entry.mode === 'raw' && entry.target && (
            <Button
              variant="ghost"
              size="xs"
              leftIcon={<FileCode size={10} />}
              onClick={(e) => { e.stopPropagation(); onSelectFile(entry.target!.relPath) }}
            >
              파일 열기
            </Button>
          )}
          <span
            className="text-[color:var(--text-tertiary)]"
            aria-hidden
          >
            {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </span>
        </div>
      </div>
      {!collapsed && (
        <div className="px-3 pb-3">
          <p className="text-xs text-[color:var(--text-secondary)] font-mono break-all">
            {currentDisplay || '(없음)'}
          </p>
          {entry.reason && (
            <p className="mt-1 text-xs text-[color:var(--text-tertiary)] italic">{entry.reason}</p>
          )}
          {entry.target && (
            <p className="mt-1 text-xs text-[color:var(--text-tertiary)]">
              파일: <span className="font-mono">{entry.target.relPath}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────

/**
 * 구조화 폼 편집 패널.
 *
 * buildEditMap 으로 생성된 EditMap 을 순회해 각 필드의 편집 컨트롤을 렌더링한다.
 * [FORM] 필드만 편집 가능하며, [RAW]/[AI]/[LOCK] 필드는 읽기전용 안내를 표시한다.
 */
export function StructuredFieldForm({
  model,
  sourceMap,
  bundlePath,
  draft,
  onEdit,
  onSelectFile,
}: StructuredFieldFormProps): JSX.Element {
  const editMap = buildEditMap(model, sourceMap)

  const formEntries = editMap.entries.filter((e) => e.mode === 'form')
  const rawEntries = editMap.entries.filter((e) => e.mode === 'raw')
  const aiEntries = editMap.entries.filter((e) => e.mode === 'ai')
  const lockEntries = editMap.entries.filter((e) => e.mode === 'lock')

  const [showReadonly, setShowReadonly] = useState(false)

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* 편집 가능 필드 섹션 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
            편집 가능 필드
          </h3>
          <Chip tone="blue" square>{editMap.formEditableCount}개</Chip>
        </div>
        {formEntries.length === 0 ? (
          <p className="text-xs text-[color:var(--text-tertiary)] italic py-2">
            이 번들에서 구조화 폼으로 편집 가능한 필드가 없습니다. AgentSourceMap 이 없거나 모든 필드가 lock 상태입니다.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {formEntries.map((entry) => (
              <FormFieldRow
                key={entry.fieldPath}
                entry={entry}
                bundlePath={bundlePath}
                draft={draft}
                onEdit={onEdit}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        )}
      </div>

      {/* RAW 편집 파일 섹션 */}
      {rawEntries.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider mb-2">
            원본 파일 편집
          </h3>
          <div className="flex flex-col gap-2">
            {rawEntries.map((entry) => (
              <ReadonlyFieldRow
                key={entry.fieldPath}
                entry={entry}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        </div>
      )}

      {/* 읽기전용 AI/LOCK 필드 (접혀 있음) */}
      <div>
        <button
          className="flex items-center gap-2 w-full text-left"
          onClick={() => setShowReadonly(!showReadonly)}
        >
          <h3 className="text-xs font-semibold text-[color:var(--text-tertiary)] uppercase tracking-wider">
            읽기전용 필드 (AI 해석값 / 편집 불가)
          </h3>
          <Chip tone="neutral" square>{aiEntries.length + lockEntries.length}개</Chip>
          {showReadonly ? <ChevronUp size={12} className="text-[color:var(--text-tertiary)]" /> : <ChevronDown size={12} className="text-[color:var(--text-tertiary)]" />}
        </button>
        {showReadonly && (
          <div className="flex flex-col gap-2 mt-2">
            {aiEntries.map((entry) => (
              <ReadonlyFieldRow key={entry.fieldPath} entry={entry} onSelectFile={onSelectFile} />
            ))}
            {lockEntries.map((entry) => (
              <ReadonlyFieldRow key={entry.fieldPath} entry={entry} onSelectFile={onSelectFile} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
