import chokidar from 'chokidar'
import { mkdirSync } from 'fs'
import { BrowserWindow } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { IPC_CHANNELS } from '../../shared/types/ipc'

export class ConfigWatcher {
  private watcher: chokidar.FSWatcher | null = null
  private mainWindow: BrowserWindow | null = null

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  start(): void {
    const claudeDir = join(homedir(), '.claude')
    const skillsDir = join(claudeDir, 'skills')
    const commandsDir = join(claudeDir, 'commands')

    // chokidar 는 없는 디렉토리를 조용히 무시한다 — 신규 사용자가 스킬을 처음 만들 때까지
    // 변경 감지가 죽어있던 결함 수복 (ADR-v2-windows-fix-05 §4). settings.json 은 파일이라 선생성하지 않는다
    // (빈 파일을 만들면 claude 본체가 그것을 설정으로 읽는다).
    for (const dir of [skillsDir, commandsDir]) {
      try {
        mkdirSync(dir, { recursive: true })
      } catch (error) {
        console.warn('[ConfigWatcher] 디렉토리 생성 실패', { dir, error })
      }
    }

    const watchPaths = [
      join(claudeDir, 'settings.json'),
      commandsDir,
      skillsDir
    ]

    this.watcher = chokidar.watch(watchPaths, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    })

    this.watcher.on('all', (event, path) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(IPC_CHANNELS.CONFIG_CHANGED, { event, path })
      }
    })

    this.watcher.on('error', (error) => {
      console.warn('[ConfigWatcher] watch 오류', error)
    })
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }
}
