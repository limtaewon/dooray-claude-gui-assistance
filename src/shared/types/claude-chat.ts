export type ClaudeChatEvent =
  | { type: 'assistant_text'; chatId: string; msgId: string; delta: string }
  | { type: 'tool_use'; chatId: string; toolId: string; name: string; input: unknown }
  | { type: 'tool_result'; chatId: string; toolId: string; content: string; isError?: boolean }
  | {
      /** assistant turn 도중에 들어오는 usage 스냅샷. result 가 오기 전에도 ctx 갱신용. */
      type: 'usage'
      chatId: string
      inputTokens?: number
      cacheReadTokens?: number
      cacheCreationTokens?: number
      outputTokens?: number
    }
  | {
      type: 'result'
      chatId: string
      sessionId: string
      durationMs: number
      costUsd: number
      isError: boolean
      /** 마지막 turn 의 input 토큰 (cache 포함). context window 사용량 표시용 */
      inputTokens?: number
      cacheReadTokens?: number
      cacheCreationTokens?: number
      outputTokens?: number
    }
  | { type: 'error'; chatId: string; message: string }

export interface ClaudeChatSendRequest {
  chatId: string
  prompt: string
  /** 이전 세션 이어받기 (멀티턴) */
  sessionId?: string
  cwd?: string
}
