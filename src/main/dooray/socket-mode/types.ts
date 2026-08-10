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

/**
 * 소켓을 닫은 뒤 서버가 세션을 정리할 때까지 기다리는 시간.
 * 곧장 새로 붙으면 서버가 아직 옛 세션을 들고 있어 '세션 중복' 으로 막고, 그러면 STANDBY 로
 * 빠져 15초를 더 기다리게 된다 — 재연결 버튼이 바로 안 듣던 원인.
 */
export const CLOSE_GRACE_MS = 1_500

/**
 * 연결이 끊겼을 때 다시 붙기까지의 대기 — 시도할수록 늘어난다(지수 백오프).
 * 네트워크가 잠깐 끊긴 경우엔 1초 만에 붙고, 서버가 오래 죽어 있으면 30초 간격으로 두드린다.
 */
export const RECONNECT_BASE_DELAY_MS = 1_000
export const RECONNECT_MAX_DELAY_MS = 30_000

/** 지수 백오프 대기 시간 — 같은 순간에 몰리지 않게 지터를 섞는다. */
export function reconnectDelayMs(attempt: number, random = Math.random): number {
  const exponential = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1), RECONNECT_MAX_DELAY_MS)
  // 지터 ±20% — 여러 클라이언트가 동시에 재연결을 시도해 서버를 때리지 않게.
  const jitter = exponential * 0.2 * (random() * 2 - 1)
  return Math.max(RECONNECT_BASE_DELAY_MS, Math.round(exponential + jitter))
}

/** Ping 주기 */
export const PING_INTERVAL_MS = 30_000

/**
 * 연결 유지의 핵심 — "영영 CONNECTING" 을 만드는 구간에는 전부 상한을 둔다.
 *
 * 재연결 루프는 소켓의 close 를 기다려 다음 시도로 넘어간다. 그래서 close 가 오지 않는 상태
 * (토큰 요청이 응답 없음 · 핸드셰이크가 끝나지 않음 · 붙었는데 sessionInfo 가 안 옴 · 회선이
 * 조용히 끊긴 half-open)에 빠지면 루프가 그 자리에 매달린 채 상태만 CONNECTING 으로 남는다.
 * 아래 상한들이 그 구간을 끊어 루프가 다시 돌게 한다.
 */

/** 토큰 발급 POST 응답 대기 상한. 넘으면 요청을 끊고 재시도로 넘어간다. */
export const TOKEN_FETCH_TIMEOUT_MS = 10_000

/** WebSocket 업그레이드 완료 대기 상한 (ws 의 handshakeTimeout). */
export const HANDSHAKE_TIMEOUT_MS = 10_000

/**
 * 핸드셰이크 성공(open) 후 서버의 sessionInfo 대기 상한.
 * sessionInfo 가 와야 ACTIVE 다 — 안 오면 소켓은 열려 있어도 아무것도 못 받는 상태로 남는다.
 */
export const SESSION_INFO_TIMEOUT_MS = 15_000

/**
 * 마지막 수신으로부터 이 시간이 지나면 죽은 회선으로 보고 끊는다.
 * 우리가 30초마다 ping 을 보내고 서버가 pong 을 주므로, 조용한 채널이라도 수신은 계속된다.
 * 회선이 FIN 없이 끊기면(무선 전환·VPN 재접속) 소켓은 OPEN 인 채 남아 close 가 오지 않는다.
 */
export const INBOUND_IDLE_TIMEOUT_MS = PING_INTERVAL_MS * 2 + 5_000

/** WebSocket path */
export const WS_PATH = '/messenger/v5/ws'

/** Token 발급 endpoint */
export const SOCKET_MODE_TOKEN_PATH = '/common/v1/socket-mode/tokens'
