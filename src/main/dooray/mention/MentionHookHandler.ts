import { basename, relative, sep } from 'path'
import { readLastAssistantText, truncateForMessenger } from './transcriptReader'
import type { HookRoute } from '../../hooks/ClaudeHookRouter'
import type { HookEventPayload } from './HookServer'
import type { ChannelSessionStore } from './ChannelSessionStore'
import type { ClaudayResponder } from './ClaudayResponder'

export const MENTION_HOOK_KIND = 'mention'

export interface MentionHookDeps {
  /** agentRoot 는 부팅 후 사용자 커스텀 설정으로 바뀔 수 있어 값이 아닌 thunk 로 받는다 */
  getAgentRoot: () => string
  sessions: Pick<ChannelSessionStore, 'get' | 'setClaudeSessionId' | 'markIdle'>
  responder: Pick<ClaudayResponder, 'send'>
  readTranscript?: (path: string) => string
}

/**
 * @clauday 멘션 채널의 claude code hook(PostToolUse/Stop) 처리.
 * resolve 로 cwd → channelId 를 판별하고, handle 이 도구 사용을 모아 두레이로 회신한다.
 */
export class MentionHookHandler {
  /** turn 단위 도구 사용 누적 (channelId → list) — Stop hook에서 비우면서 요약 송신 */
  private turnBuffers = new Map<string, Array<{ tool: string; detail: string }>>()
  private readonly deps: Required<MentionHookDeps>

  constructor(deps: MentionHookDeps) {
    this.deps = { readTranscript: readLastAssistantText, ...deps }
  }

  /** cwd 가 agentRoot 하위 채널 폴더면 { kind: MENTION_HOOK_KIND, id: channelId }, 아니면 null. */
  resolve(cwd: string): HookRoute | null {
    if (!cwd) return null
    const agentRoot = this.deps.getAgentRoot()
    if (!cwd.startsWith(agentRoot)) return null
    const rel = relative(agentRoot, cwd)
    const seg = rel.split(sep)[0]
    const channelId = seg || null
    if (!channelId) return null
    return { kind: MENTION_HOOK_KIND, id: channelId }
  }

  /** claude code hook → 두레이 알림 라우터.
   *  - cwd로 channelId 추출 (~/Clauday-Workspaces/agent/{channelId}/...)
   *  - PostToolUse: turnBuffers에 누적
   *  - Stop: 누적 요약을 [Clauday] 메시지로 송신 + markIdle */
  async handle(ev: HookEventPayload, route: HookRoute): Promise<void> {
    const channelId = route.id

    if (ev.event === 'post_tool_use') {
      const detail = formatToolDetail(ev.tool_name, ev.tool_input)
      const buf = this.turnBuffers.get(channelId) || []
      buf.push({ tool: ev.tool_name || '?', detail })
      this.turnBuffers.set(channelId, buf)
      return
    }

    if (ev.event === 'stop') {
      const buf = this.turnBuffers.get(channelId) || []
      this.turnBuffers.delete(channelId)
      const session = this.deps.sessions.get(channelId)
      const orgId = session?.organizationId

      // claude code가 hook payload에 last_assistant_message를 직접 넣어준다 (raw keys 확인됨).
      // transcript 파일을 읽는 것보다 단순하고 정확.
      let assistantText = extractAssistantMessage(ev.raw.last_assistant_message)

      const transcriptPath = (ev.raw.transcript_path as string | undefined) || ''
      // last_assistant_message가 비어있으면 transcript 파일에서 fallback 추출
      if (!assistantText && transcriptPath) {
        assistantText = this.deps.readTranscript(transcriptPath)
      }

      // transcript 파일명이 곧 claude session id (xxx.jsonl) — 다음 spawn 시 --resume에 사용
      if (transcriptPath) {
        const sid = basename(transcriptPath).replace(/\.jsonl$/, '')
        if (sid) this.deps.sessions.setClaudeSessionId(channelId, sid)
      }

      const body = composeStopMessage(assistantText, buf)
      await this.deps.responder.send(channelId, body, orgId)
      this.deps.sessions.markIdle(channelId)
    }
  }
}

/** Stop 시 두레이로 보낼 메시지 본문 구성.
 *  주: claude의 응답 텍스트 (사용자에게 보여진 그 글). 없으면 "응답 완료" 폴백.
 *  부: 사용한 도구 짧은 목록 (turn 안에서 큰 변화가 있었는지 한눈에 보이게). */
export function composeStopMessage(assistantText: string, buf: Array<{ tool: string; detail: string }>): string {
  const main = assistantText.trim()
    ? truncateForMessenger(assistantText.trim())
    : '응답 완료.'

  if (buf.length === 0) return main
  const items = buf.slice(0, 8).map((b) => b.detail ? `${b.tool}(${b.detail})` : b.tool)
  const more = buf.length > 8 ? ` 외 ${buf.length - 8}건` : ''
  return `${main}\n\n— 사용 도구: ${items.join(', ')}${more}`
}

/** claude code가 hook payload에 넣어주는 last_assistant_message → 평문 텍스트.
 *  형식 후보: string / { content: [{type:'text', text}] } / { text: string } */
export function extractAssistantMessage(raw: unknown): string {
  if (!raw) return ''
  if (typeof raw === 'string') return raw.trim()
  if (typeof raw !== 'object') return ''
  const m = raw as { content?: unknown; text?: unknown; message?: unknown }
  if (typeof m.text === 'string') return m.text.trim()
  if (m.message && typeof m.message === 'object') {
    return extractAssistantMessage(m.message)
  }
  if (Array.isArray(m.content)) {
    const parts: string[] = []
    for (const b of m.content) {
      if (b && typeof b === 'object') {
        const blk = b as { type?: string; text?: unknown }
        if (blk.type === 'text' && typeof blk.text === 'string') parts.push(blk.text)
      } else if (typeof b === 'string') {
        parts.push(b)
      }
    }
    return parts.join('\n').trim()
  }
  if (typeof m.content === 'string') return m.content.trim()
  return ''
}

export function formatToolDetail(tool: string | undefined, input: Record<string, unknown> | undefined): string {
  if (!tool || !input) return ''
  const filePath = (input.file_path as string | undefined) || ''
  switch (tool) {
    case 'Edit':
    case 'Write':
    case 'Read':
      return filePath ? basename(filePath) : ''
    case 'Bash': {
      const cmd = (input.command as string | undefined) || ''
      return cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd
    }
    case 'Glob':
    case 'Grep':
      return ((input.pattern as string | undefined) || '').slice(0, 40)
    default:
      return ''
  }
}
