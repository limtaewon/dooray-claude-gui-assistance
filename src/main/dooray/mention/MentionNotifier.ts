import { Notification, type BrowserWindow } from 'electron'

export interface NotifyOptions {
  channelName: string
  preview: string
}

/**
 * 두레이 멘션 수신 시 OS 알림.
 * 클릭하면 메인 윈도우 포커스 (새 터미널 탭은 spawn 측에서 이미 활성화됨).
 */
export function notifyMention(mainWindow: BrowserWindow | null, opts: NotifyOptions): void {
  if (!Notification.isSupported()) return
  const body = `#${opts.channelName}${opts.preview ? ' ▸ ' + opts.preview.slice(0, 120) : ''}`
  const n = new Notification({
    title: 'Clauday가 새 작업을 받았습니다',
    body,
    silent: false
  })
  n.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  n.show()
}
