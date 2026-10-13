import type { KeyValueStorage } from '../MentionCatchUp'

const KEY = 'alwaysAllow'
/** 채널당 기억할 서명 수 상한 */
const PER_CHANNEL_CAP = 200

/**
 * "항상 승인" 기억 — 채널별 위험 동작 서명(DangerGate) 목록. 앱 재시작을 넘어 유지된다.
 * 권한 확인 없이 도는 모드라 Claude Code 설정 파일의 allow 규칙은 쓰지 않는다.
 */
export class AlwaysAllowStore {
  constructor(private storage: KeyValueStorage) {}

  has(channelId: string, signature: string): boolean {
    return this.all()[channelId]?.includes(signature) ?? false
  }

  add(channelId: string, signature: string): void {
    const all = this.all()
    const list = all[channelId] ?? []
    if (list.includes(signature)) return
    all[channelId] = [...list, signature].slice(-PER_CHANNEL_CAP)
    this.storage.set(KEY, all)
  }

  private all(): Record<string, string[]> {
    const v = this.storage.get(KEY, {})
    return v && typeof v === 'object' ? (v as Record<string, string[]>) : {}
  }
}
