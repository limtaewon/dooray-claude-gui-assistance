import chokidar from 'chokidar'
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
    const watchPaths = [
      join(claudeDir, 'settings.json'),
      join(claudeDir, 'commands')
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
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }
}
