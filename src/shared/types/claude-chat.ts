export type ClaudeChatEvent =
  | { type: 'assistant_text'; chatId: string; msgId: string; delta: string }
  | { type: 'tool_use'; chatId: string; toolId: string; name: string; input: unknown }
  | { type: 'tool_result'; chatId: string; toolId: string; content: string; isError?: boolean }
  | { type: 'result'; chatId: string; sessionId: string; durationMs: number; costUsd: number; isError: boolean }
  | { type: 'error'; chatId: string; message: string }

export interface ClaudeChatSendRequest {
  chatId: string
  prompt: string
  /** 이전 세션 이어받기 (멀티턴) */
  sessionId?: string
  cwd?: string
}
