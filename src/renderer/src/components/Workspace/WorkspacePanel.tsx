import { useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, GitBranch, PlugZap, Trash2 } from 'lucide-react'
import type { AgentRun, TaskWorkspace } from '@shared/types/workspace'
import type { TerminalExitPayload } from '@shared/types/terminal'
import TerminalPane from '../Terminal/TerminalPane'
import { Button, Chip, EmptyView } from '../common/ds'
import { RUN_STATUS_LABEL, RUN_STATUS_TONE, formatElapsed } from './runStatus'

interface WorkspacePanelProps {
  workspace: TaskWorkspace
  run: AgentRun
  isVisible: boolean
  onResume: () => void
  onAdopt: () => void
  onCleanup: () => void
  onOpenDooray?: () => void
}

/** 워크스페이스의 단일 run — 상단 정보 스트립 + PTY 터미널 + 액션 바. */
function WorkspacePanel({
  workspace,
  run,
  isVisible,
  onResume,
  onAdopt,
  onCleanup,
  onOpenDooray
}: WorkspacePanelProps): JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  const [exitInfo, setExitInfo] = useState<TerminalExitPayload | null>(null)

  // 경과 시간 표기 — live run 일 때만 1초 틱
  useEffect(() => {
    if (run.endedAt) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [run.endedAt])

  useEffect(() => {
    setExitInfo(null)
    if (!run.terminalSessionId) return
    return window.api.terminal.onExit((payload) => {
      if (payload.id === run.terminalSessionId) setExitInfo((prev) => prev ?? payload)
    })
  }, [run.terminalSessionId])

  const attached = Boolean(run.terminalSessionId)

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2.5 px-4 py-2 border-b border-bg-border flex-none">
        <GitBranch size={14} className="text-clauday-blue flex-none" />
        <span className="font-mono text-[calc(12.5px_*_var(--app-font-scale,1))] text-text-primary truncate">
          {run.branch}
        </span>
        <Chip tone={RUN_STATUS_TONE[run.status]} dot>
          {RUN_STATUS_LABEL[run.status]}
        </Chip>
        <span className="text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary font-mono truncate">
          base {run.baseBranch || 'HEAD'} · {run.worktreePath}
        </span>
        <span className="ml-auto text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary whitespace-nowrap">
          {formatElapsed(run.startedAt, run.endedAt ?? now)}
        </span>
      </div>

      <div className="relative flex-1 min-h-0">
        {attached ? (
          <TerminalPane
            key={run.terminalSessionId as string}
            sessionId={run.terminalSessionId as string}
            isActive={isVisible}
            exitInfo={exitInfo}
          />
        ) : (
          <EmptyView
            icon={PlugZap}
            title="터미널이 연결되어 있지 않습니다"
            body={
              run.claudeSessionId
                ? '앱을 다시 시작해 세션이 끊겼습니다. 재연결하면 이전 대화를 이어서 진행합니다.'
                : '재연결하면 이 워크트리에서 claude 를 다시 실행합니다.'
            }
            action={
              <Button variant="secondary" onClick={onResume}>
                <PlugZap size={13} /> 재연결
              </Button>
            }
          />
        )}
      </div>

      {run.lastAssistantText && (
        <div className="px-4 py-2 border-t border-bg-border bg-bg-surface flex-none">
          <div className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mb-0.5">마지막 응답</div>
          <p className="text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-secondary line-clamp-2 border-l-2 border-clauday-orange pl-2">
            {run.lastAssistantText}
          </p>
        </div>
      )}

      <div className="flex items-center gap-1.5 px-4 py-2 border-t border-bg-border flex-none">
        {attached && (
          <Button variant="ghost" size="sm" onClick={onResume}>
            <PlugZap size={13} /> 재연결
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onAdopt} disabled={workspace.status === 'adopted'}>
          <CheckCircle2 size={13} /> {workspace.status === 'adopted' ? '채택됨' : '채택'}
        </Button>
        <Button variant="danger" size="sm" onClick={onCleanup}>
          <Trash2 size={13} /> 정리
        </Button>
        {onOpenDooray && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onOpenDooray}>
            <ExternalLink size={13} /> Dooray
          </Button>
        )}
      </div>
    </div>
  )
}

export default WorkspacePanel
