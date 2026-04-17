export interface DoorayChannel {
  id: string
  type?: 'direct' | 'private' | 'public' | string
  title?: string
  /** 1:1 대화의 경우 상대방 이름이 들어있을 수 있음 */
  displayName?: string
  /** 읽지 않은 메시지 수 (API 지원 시) */
  unreadCount?: number
  organizationId?: string
  /** 마지막 활동 시각 (정렬용) */
  updatedAt?: string
}

export interface MessengerSendParams {
  channelId: string
  text: string
  organizationId?: string
}
