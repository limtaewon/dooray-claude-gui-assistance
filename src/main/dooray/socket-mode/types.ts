/**
 * Dooray Socket Mode 프로토콜 타입 정의.
 * Python SDK(dooray/python-dooray-sdk)의 SocketModeRequest/Response를 Node.js로 옮겨온 것.
 */

export interface SocketModeTokenInfo {
  /** WebSocket handshake용 JWT (Bearer 인증) */
  accessToken: string
  /** WebSocket URL path 일부 */
  tenantId: string
  /** WebSocket URL path 일부 + 메시지 송신자 식별 */
  organizationMemberId: string
}

/**
 * 서버 → 클라이언트 WebSocket 메시지 (정규화 전 raw).
 * 두레이는 두 가지 포맷을 모두 사용:
 *   - 메신저 포맷: { type, service, action, content: {...}, channelId? }
 *   - Common 포맷: { type, entity: {...}, actor: {...}, action_data: {...} }
 */
export interface RawSocketMessage {
  /** 'sessionInfo' / 'message' / 'task' / 'page' / 'pong' 등 */
  type: string
  service?: string
  /** 'create' / 'update' / 'delete' / 'comment' 등 */
  action?: string
  envelope_id?: string
  /** 메신저 포맷의 페이로드 */
  content?: Record<string, unknown>
  channelId?: string
  /** Common 포맷의 entity */
  entity?: Record<string, unknown>
  actor?: Record<string, unknown>
  action_data?: Record<string, unknown>
  payload?: Record<string, unknown>
  [key: string]: unknown
}

/** 정규화된 이벤트 (renderer/와처 모듈에 전달) */
export interface SocketModeEvent {
  envelopeId: string
  /** 'message' / 'task' / 'page' 등 */
  type: string
  /** 'messenger' / 'task' / 'wiki' */
  service: string
  /** 'create' / 'update' */
  action: string
  /** 메시지 본문 (메신저) — content.text */
  text?: string
  /** 채널 ID (메신저) */
  channelId?: string
  /** 송신자 organizationMemberId */
  senderId?: string
  /** 메시지 log id */
  logId?: string
  /** 메시지 작성 시각 (두레이가 보낸 ISO 형식 그대로 — content.sentAt) */
  sentAt?: string
  /** 원본 content 페이로드 (특수 케이스 직접 접근용) */
  content?: Record<string, unknown>
  /** 원본 메시지 (디버깅용) */
  raw?: RawSocketMessage
}

export type ConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'ACTIVE'
  | 'STANDBY'

/** 서버가 같은 봇 토큰의 다른 세션이 이미 잡혀있을 때 보내는 close code/reason */
export const SESSION_LIMIT_CLOSE_CODE = 1008
export const SESSION_LIMIT_CLOSE_REASON = 'AGENT_ALREADY_CONNECTED'

/** STANDBY 상태에서 재시도 간격 (서버 Redis 락 30초 + 하트비트 10초 고려) */
export const STANDBY_RETRY_INTERVAL_MS = 15_000

/** Ping 주기 */
export const PING_INTERVAL_MS = 30_000

/** WebSocket path */
export const WS_PATH = '/messenger/v5/ws'

/** Token 발급 endpoint */
export const SOCKET_MODE_TOKEN_PATH = '/common/v1/socket-mode/tokens'
