/**
 * 채널 와처 — 특정 두레이 메신저 채널에서 조건에 맞는 메시지만 수집.
 */
export interface FilterRule {
  /** 이 중 하나라도 포함 (contains, 대소문자 무시) */
  anyOf?: string[]
  /** 모두 포함해야 함 (대소문자 무시) */
  allOf?: string[]
  /** 정규식 — 어느 하나라도 매치 */
  regex?: string[]
  /** 이 단어 중 하나라도 포함되면 제외 */
  exclude?: string[]
  /** 제외 정규식 */
  excludeRegex?: string[]
  /** AI가 생성한 한줄 설명 (사용자에게 보여줄 요약) */
  description: string
}

export interface Watcher {
  id: string
  name: string
  /** 원본 사용자 자연어 지시 (재생성/디버깅용) */
  instruction: string
  channelIds: string[]
  channelNames: string[] // 표시용 (채널 목록 재조회 없이 바로 표시)
  filter: FilterRule
  enabled: boolean
  createdAt: string
  updatedAt: string
  /** 마지막으로 폴링한 시점 (이 이후 메시지만 가져옴) */
  lastCheckedAt?: string
}

export interface CollectedMessage {
  id: string // hash(watcherId + channelId + messageId)
  watcherId: string
  channelId: string
  channelName: string
  messageId: string
  text: string
  authorName: string
  authorId?: string
  createdAt: string
  /** 매치된 키워드/규칙 (UI 하이라이트용) */
  matchedTerms: string[]
  /** 사용자가 확인했는지 */
  read: boolean
}

export interface WatcherCreateRequest {
  name: string
  instruction: string
  channelIds: string[]
  channelNames: string[]
  filter: FilterRule
}

export interface WatcherUpdateRequest extends Partial<WatcherCreateRequest> {
  enabled?: boolean
}
