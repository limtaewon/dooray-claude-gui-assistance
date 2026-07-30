import { basename } from 'path'
import { extractAssistantMessage } from '../dooray/mention/MentionHookHandler'
import { readLastAssistantText } from '../dooray/mention/transcriptReader'
import type { HookRoute } from '../hooks/ClaudeHookRouter'
import type { HookEventPayload } from '../dooray/mention/HookServer'
import type { WorkspaceService } from './WorkspaceService'

export const WORKSPACE_HOOK_KIND = 'workspace-run'

export interface WorkspaceHookDeps {
  workspaceService: Pick<WorkspaceService, 'resolveRunByCwd' | 'recordStop' | 'recordToolActivity'>
  readTranscript?: (path: string) => string
}

/**
 * 워크트리에서 도는 claude code 의 hook(PostToolUse/Stop) 처리.
 * `ClaudeHookRouter` 의 2번째(멘션 다음) resolver — ADR-v2-workspace-p1-05.
 * 상태 전이/스토어 쓰기는 전부 `WorkspaceService` 에 위임하는 얇은 어댑터.
 */
export class WorkspaceHookHandler {
  private readonly readTranscript: (path: string) => string

  constructor(private deps: WorkspaceHookDeps) {
    this.readTranscript = deps.readTranscript ?? readLastAssistantText
  }

  /** cwd 가 어떤 활성 run 의 워크트리(또는 그 하위) 인지 판정. 없으면 null(무로그 무시). */
  resolve(cwd: string): HookRoute | null {
    if (!cwd) return null
    const found = this.deps.workspaceService.resolveRunByCwd(cwd)
    if (!found) return null
    return {
      kind: WORKSPACE_HOOK_KIND,
      id: found.run.runId,
      meta: { workspaceId: found.workspace.id, worktreePath: found.run.worktreePath }
    }
  }

  handle(ev: HookEventPayload, route: HookRoute): void {
    if (ev.event === 'stop') {
      const transcriptPath = (ev.raw.transcript_path as string | undefined) || ''
      const claudeSessionId = transcriptPath ? basename(transcriptPath).replace(/\.jsonl$/, '') : undefined

      let lastAssistantText = extractAssistantMessage(ev.raw.last_assistant_message)
      if (!lastAssistantText && transcriptPath) {
        lastAssistantText = this.readTranscript(transcriptPath)
      }

      this.deps.workspaceService.recordStop(route.id, {
        claudeSessionId: claudeSessionId || undefined,
        lastAssistantText: lastAssistantText || undefined
      })
      return
    }

    if (ev.event === 'post_tool_use') {
      this.deps.workspaceService.recordToolActivity(route.id)
    }
  }
}
