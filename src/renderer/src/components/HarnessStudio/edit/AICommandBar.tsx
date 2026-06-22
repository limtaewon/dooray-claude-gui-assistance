/**
 * AICommandBar.tsx — AI 자연어 편집 명령 입력 바
 *
 * 사용자가 자연어로 편집 명령을 입력하면:
 * 1. pickEditTargetsWithFileTree 로 대상 파일 추정
 * 2. window.api.harness.edit.aiPropose 로 제안 요청 (useAIProgress 진행 표시)
 * 3. 제안 diff 모달 표시 (2단계 승인: 제안 승인 → 최종 apply 는 별도)
 * 4. 승인된 제안만 draft 에 반영 (onProposalAccepted 콜백)
 *
 * 대상 파일을 추정하지 못한 경우 사용자에게 파일 직접 선택을 유도한다.
 */

import { useState, useCallback } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import { Wand2, Send, ChevronDown, ChevronUp, Check, X, AlertTriangle } from 'lucide-react'
import type { HarnessModel } from '@shared/types/harness'
import type { AgentSourceMap, HarnessDraft, AIEditProposal } from '@shared/types/harness-edit'
import Button from '@/components/common/ds/Button'
import Chip from '@/components/common/ds/Chip'
import Modal from '@/components/common/ds/Modal'
import { useAIProgress, formatElapsed } from '@/hooks/useAIProgress'
import { useTheme } from '@/hooks/useTheme'
import { pickEditTargetsWithFileTree } from './pickEditTargets'

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export interface AICommandBarProps {
  model: HarnessModel
  sourceMap: AgentSourceMap
  fileTree: string[]
  bundlePath: string
  draft: HarnessDraft
  /** 승인된 AI 제안을 draft 에 반영할 콜백 */
  onProposalAccepted: (proposals: AIEditProposal[], command: string) => void
}

/** AI 제안 항목 (baseContent 포함 확장) */
interface ProposalWithBase extends AIEditProposal {
  baseContent: string
  accepted: boolean
}

// ─────────────────────────────────────────────
// 단일 제안 diff 패널
// ─────────────────────────────────────────────

interface ProposalPanelProps {
  proposal: ProposalWithBase
  monacoTheme: string
  onToggle: () => void
}

function ProposalPanel({ proposal, monacoTheme, onToggle }: ProposalPanelProps): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const isShell = proposal.relPath.endsWith('.sh')

  return (
    <div className={`border rounded-lg overflow-hidden mb-3 ${
      proposal.accepted
        ? 'border-[color:var(--c-blue-solid)]'
        : 'border-[color:var(--bg-border)]'
    }`}>
      <div className="flex items-center gap-2 px-3 py-2 bg-[color:var(--bg-surface)]">
        <span className="text-xs font-mono text-[color:var(--text-primary)] flex-1 truncate">
          {proposal.relPath}
        </span>
        {isShell && (
          <Chip tone="orange" square>
            <AlertTriangle size={9} className="mr-0.5" />
            .sh
          </Chip>
        )}
        <button
          className={`p-1 rounded transition-colors ${
            proposal.accepted
              ? 'bg-[color:var(--c-blue-solid)] text-white'
              : 'bg-[color:var(--bg-surface-hover)] text-[color:var(--text-secondary)]'
          }`}
          onClick={onToggle}
          title={proposal.accepted ? '이 제안 제외' : '이 제안 포함'}
        >
          {proposal.accepted ? <Check size={12} /> : <X size={12} />}
        </button>
        <button
          className="text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {proposal.rationale && (
        <div className="px-3 py-1.5 bg-[color:var(--bg-subtle)] border-t border-[color:var(--bg-border)]">
          <p className="text-xs text-[color:var(--text-secondary)] italic">{proposal.rationale}</p>
        </div>
      )}

      {expanded && (
        <div style={{ height: 250 }}>
          <DiffEditor
            original={proposal.baseContent}
            modified={proposal.newContent}
            language={proposal.relPath.endsWith('.md') ? 'markdown' : proposal.relPath.endsWith('.sh') ? 'shell' : 'plaintext'}
            theme={monacoTheme}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 11,
              lineHeight: 17,
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              renderSideBySide: true,
            }}
          />
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────

/**
 * AI 자연어 편집 명령 바.
 *
 * 입력: NL 명령 → pickEditTargetsWithFileTree 로 대상 추정 → aiPropose → 제안 diff 모달.
 * 2단계 승인: 제안 모달에서 승인 → draft 반영 (파일 적용은 ApplyDialog 에서).
 */
export function AICommandBar({
  model,
  sourceMap,
  fileTree,
  bundlePath,
  onProposalAccepted,
}: AICommandBarProps): JSX.Element {
  const { theme } = useTheme()
  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'light'

  const [command, setCommand] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proposals, setProposals] = useState<ProposalWithBase[]>([])
  const [proposalModalOpen, setProposalModalOpen] = useState(false)
  const [targetRelPaths, setTargetRelPaths] = useState<string[]>([])
  const [noTargetWarning, setNoTargetWarning] = useState(false)

  const { progress, start: startProgress, done: doneProgress } = useAIProgress()

  const handleSend = useCallback(async () => {
    const cmd = command.trim()
    if (!cmd || running) return

    setError(null)
    setNoTargetWarning(false)

    // 대상 파일 추정
    const targets = pickEditTargetsWithFileTree(cmd, model, sourceMap, fileTree)

    if (targets.length === 0) {
      setNoTargetWarning(true)
      return
    }

    setRunning(true)
    const requestId = startProgress()

    try {
      const { proposals: rawProposals } = await window.api.harness.edit.aiPropose(
        bundlePath,
        cmd,
        targets,
        requestId
      )

      if (rawProposals.length === 0) {
        setError('AI 가 변경 제안을 생성하지 못했습니다. 명령을 더 구체적으로 입력해 보세요.')
        return
      }

      // baseContent 를 각 파일에서 읽어 proposal 에 첨부
      const enriched: ProposalWithBase[] = await Promise.all(
        rawProposals.map(async (p) => {
          try {
            const { content: baseContent } = await window.api.harness.edit.readFile(bundlePath, p.relPath)
            return { ...p, baseContent, accepted: true }
          } catch {
            return { ...p, baseContent: '', accepted: true }
          }
        })
      )

      setProposals(enriched)
      setTargetRelPaths(targets)
      setProposalModalOpen(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      doneProgress()
      setRunning(false)
    }
  }, [command, running, model, sourceMap, fileTree, bundlePath, startProgress, doneProgress])

  const handleToggleProposal = useCallback((relPath: string) => {
    setProposals((prev) =>
      prev.map((p) => p.relPath === relPath ? { ...p, accepted: !p.accepted } : p)
    )
  }, [])

  const handleAcceptAll = useCallback(() => {
    const accepted = proposals.filter((p) => p.accepted)
    if (accepted.length === 0) return
    onProposalAccepted(accepted, command)
    setProposalModalOpen(false)
    setProposals([])
    setCommand('')
  }, [proposals, command, onProposalAccepted])

  const acceptedCount = proposals.filter((p) => p.accepted).length

  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-2">
        <Wand2 size={13} className="text-[color:var(--c-violet-fg)] flex-none" />
        <input
          className="ds-input sm flex-1 text-xs"
          placeholder="AI 편집 명령 (예: '보안검토자를 opus 로 바꿔줘', 'dev 에서 Read 도구 제거')"
          value={command}
          onChange={(e) => {
            setCommand(e.target.value)
            setNoTargetWarning(false)
            setError(null)
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') { void handleSend() } }}
          disabled={running}
        />
        <Button
          variant="ai"
          size="xs"
          leftIcon={running ? undefined : <Send size={10} />}
          onClick={() => { void handleSend() }}
          disabled={!command.trim() || running}
        >
          {running ? (
            progress.elapsedMs > 0 ? `${formatElapsed(progress.elapsedMs)} 경과...` : '요청 중...'
          ) : 'AI 편집 요청'}
        </Button>
      </div>

      {/* 진행 메시지 */}
      {running && progress.message && (
        <p className="mt-1 text-xs text-[color:var(--text-tertiary)] pl-5">{progress.message}</p>
      )}

      {/* 대상 파일 없음 경고 */}
      {noTargetWarning && (
        <div className="mt-1.5 flex items-center gap-2 text-xs text-[color:var(--c-yellow-fg)] pl-5">
          <AlertTriangle size={11} />
          <span>
            명령에서 편집 대상 파일을 특정할 수 없습니다.
            에이전트 이름이나 게이트 페이즈를 포함하거나, 파일 편집기에서 파일을 직접 선택하세요.
          </span>
        </div>
      )}

      {/* 오류 메시지 */}
      {error && (
        <p className="mt-1 text-xs text-[color:var(--c-red-fg)] pl-5">{error}</p>
      )}

      {/* AI 제안 모달 */}
      <Modal
        open={proposalModalOpen}
        onClose={() => setProposalModalOpen(false)}
        title="AI 편집 제안 — 승인 전 자동 저장 없음"
        icon={<Wand2 size={14} className="text-[color:var(--c-violet-fg)]" />}
        width={800}
        footer={
          <div className="flex items-center justify-between w-full">
            <p className="text-xs text-[color:var(--text-tertiary)]">
              체크 표시된 제안만 draft 에 추가됩니다. 파일 적용은 "파일에 적용" 버튼에서 별도로 진행합니다.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setProposalModalOpen(false)}>
                취소
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Check size={11} />}
                onClick={handleAcceptAll}
                disabled={acceptedCount === 0}
              >
                선택 제안 draft 에 추가 ({acceptedCount}개)
              </Button>
            </div>
          </div>
        }
      >
        <div className="max-h-[60vh] overflow-y-auto">
          <div className="mb-3">
            <p className="text-xs text-[color:var(--text-secondary)]">
              명령: <span className="font-medium text-[color:var(--text-primary)]">"{command}"</span>
            </p>
            <p className="text-xs text-[color:var(--text-tertiary)] mt-0.5">
              대상 파일: {targetRelPaths.join(', ')}
            </p>
          </div>

          {proposals.map((p) => (
            <ProposalPanel
              key={p.relPath}
              proposal={p}
              monacoTheme={monacoTheme}
              onToggle={() => handleToggleProposal(p.relPath)}
            />
          ))}
        </div>
      </Modal>
    </div>
  )
}
