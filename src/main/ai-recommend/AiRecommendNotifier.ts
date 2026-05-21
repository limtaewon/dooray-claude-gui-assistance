import Store from 'electron-store'
import { Notification, BrowserWindow } from 'electron'
import type { TaskService } from '../dooray/TaskService'

/**
 * #7 AI 추천 새 글 OS 알림.
 *
 * 두레이 "AI 활용 사례 공유 프로젝트" 의 최근 글을 1시간마다 폴링하고,
 * 마지막으로 본 글 id 이후의 새 글이 있으면 데스크톱 알림을 띄운다.
 *
 * - 첫 폴링은 silent (lastSeen 초기화만)
 * - KST 22:00 ~ 09:00 은 알림 보류 (lastSeen 도 갱신 안 함 → 다음 폴링에서 다시 검출)
 * - 사용자 토글 (enabled=false) 시 폴링 자체를 멈춤
 * - 알림 클릭 → BrowserWindow focus + renderer 의 `goto-ai-recommend` 이벤트 발사
 *
 * 폴링 주기/silent hours 는 const 로 박혀있음 — 사용자가 추후 조정 원하면 Settings UI 로 노출.
 */

/** Renderer 의 AIRecommendView 와 동일 — 추후 shared/constants 로 빼면 좋음 */
const AI_SHARING_PROJECT_ID = '4138743749699736544'
const POLL_INTERVAL_MS = 60 * 60 * 1000 // 1시간
/** 22 ~ 익일 09 시는 알림 skip */
const SILENT_HOUR_START = 22
const SILENT_HOUR_END = 9

interface NotifierDB {
  lastSeenPostId?: string
  lastSeenAt?: number
  enabled?: boolean
}

export class AiRecommendNotifier {
  private store: Store<NotifierDB>
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly taskService: TaskService) {
    this.store = new Store<NotifierDB>({
      name: 'ai-recommend-notifier',
      defaults: { enabled: true }
    })
  }

  isEnabled(): boolean {
    return this.store.get('enabled', true) ?? true
  }

  setEnabled(v: boolean): void {
    this.store.set('enabled', v)
    if (!v) this.stop()
    else if (!this.timer) void this.start()
  }

  async start(): Promise<void> {
    if (!this.isEnabled()) return
    if (this.timer) return
    // 즉시 1회 — silent 초기화 (이전에 본 글이 없으면 lastSeenPostId 만 채움)
    await this.poll(true).catch((e) => console.warn('[AiRecommendNotifier] initial poll 실패:', e))
    this.timer = setInterval(() => {
      this.poll(false).catch((e) => console.warn('[AiRecommendNotifier] poll 실패:', e))
    }, POLL_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** KST(=시스템 로컬 가정) 기준 yes/no — silent 시간대인지 */
  private isInSilentHours(): boolean {
    const h = new Date().getHours()
    return h >= SILENT_HOUR_START || h < SILENT_HOUR_END
  }

  private async poll(silent: boolean): Promise<void> {
    let posts: Array<{ id: string; subject?: string }> = []
    try {
      const r = await this.taskService.listCommunityPosts(AI_SHARING_PROJECT_ID, 0, 10)
      posts = r.posts
    } catch (e) {
      // 토큰 미설정 / 네트워크 등 — 다음 폴링에서 재시도
      console.warn('[AiRecommendNotifier] listCommunityPosts 실패:', e)
      return
    }
    if (posts.length === 0) return

    const lastSeenId = this.store.get('lastSeenPostId')

    // 첫 호출 또는 silent 초기화 — 알림은 보내지 않고 cursor 만 잡음
    if (!lastSeenId || silent) {
      this.store.set('lastSeenPostId', posts[0].id)
      this.store.set('lastSeenAt', Date.now())
      return
    }

    // 새 글 추출 — posts 는 createdAt desc 정렬이므로 lastSeenId 만날 때까지 push
    const newOnes: typeof posts = []
    for (const p of posts) {
      if (p.id === lastSeenId) break
      newOnes.push(p)
    }
    if (newOnes.length === 0) return

    // Silent hours 면 알림 skip — lastSeen 도 갱신하지 않아 다음 폴링에서 다시 잡힘
    if (this.isInSilentHours()) {
      console.log(`[AiRecommendNotifier] silent hours — ${newOnes.length}건 알림 보류`)
      return
    }

    const title = newOnes.length === 1 ? '새 AI 사례' : `새 AI 사례 ${newOnes.length}건`
    const body = newOnes
      .map((p) => `· ${(p.subject || '(제목 없음)').slice(0, 60)}`)
      .join('\n')
      .slice(0, 240)

    try {
      const n = new Notification({ title, body, silent: false })
      n.on('click', () => {
        const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
        if (!win) return
        if (win.isMinimized()) win.restore()
        win.focus()
        win.webContents.send('goto-ai-recommend')
      })
      n.show()
    } catch (e) {
      console.warn('[AiRecommendNotifier] Notification 실패:', e)
    }

    this.store.set('lastSeenPostId', posts[0].id)
    this.store.set('lastSeenAt', Date.now())
  }
}
