import { app, shell, BrowserWindow } from 'electron'
import { createWriteStream } from 'fs'
import { mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import type { GithubRelease, UpdateState } from '../../shared/types/update'
import { IPC_CHANNELS } from '../../shared/types/ipc'
import { isNewerVersion, pickLatestStable, pickAssetForPlatform } from './version'

const REPO = 'limtaewon/dooray-claude-gui-assistance'
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases?per_page=20`
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`

/**
 * 앱 업데이트. **플랫폼마다 의도적으로 다른 경로를 탄다** — 한쪽만 보고 양쪽에 같은 변경을
 * 적용하면 다른 쪽이 깨진다.
 *
 * ## Windows
 * `electron-updater` 의 autoUpdater 가 `latest.yml` 을 읽어 배경 다운로드하고,
 * `quitAndInstall()` 로 재시작하며 NSIS 설치까지 끝낸다. 코드 서명이 없어도 동작한다.
 *
 * ## macOS
 * autoUpdater 를 **쓰지 않는다.** Squirrel.Mac 은 업데이트를 적용하기 직전에 새 번들의 서명이
 * 현재 실행 중인 앱과 같은 주체인지 검사하는데, 이 앱은 ad-hoc 서명(`identity: "-"`)이라
 * 그 검사를 통과하지 못한다. 다운로드는 끝나고 재시작하면 예전 버전 그대로인 — 원인을 찾기
 * 어려운 방식으로 실패한다. 그래서 GitHub Releases API 를 직접 읽어 새 버전을 알리고,
 * dmg 를 내려받아 Finder 에서 열어주는 데까지만 한다. 마지막 드래그는 사용자 몫이다.
 * 정식 Developer ID 서명 + notarization 을 붙이면 Windows 와 같은 경로로 바꿀 수 있다.
 */
export class UpdateService {
  private state: UpdateState
  private checking = false
  /** macOS 에서 내려받아 둔 dmg 경로. 「받기」를 다시 눌렀을 때 재다운로드를 막는다. */
  private downloadedDmgPath: string | null = null

  // 생성자는 모듈 로드 시점에 돌기 때문에 여기서 electron app 을 건드리지 않는다.
  // 버전은 실제로 필요해지는 check() 에서 읽는다.
  constructor(private readonly getWindow: () => BrowserWindow | null) {
    this.state = {
      stage: 'idle',
      currentVersion: '',
      latestVersion: null,
      releaseUrl: null,
      progressPercent: 0,
      message: null,
      canInstallInPlace: process.platform === 'win32'
    }
  }

  getState(): UpdateState {
    return { ...this.state }
  }

  private patch(next: Partial<UpdateState>): void {
    this.state = { ...this.state, ...next }
    this.getWindow()?.webContents.send(IPC_CHANNELS.UPDATE_STATUS, this.state)
  }

  /**
   * 최신 릴리즈를 조회해 상태를 갱신한다.
   * 네트워크 실패는 사용자에게 굳이 알리지 않는다 — 오프라인이나 사내망 차단은 흔하고,
   * 업데이트 확인 실패가 앱 사용을 막지 않기 때문이다. 대신 로그는 남긴다.
   */
  async check(): Promise<UpdateState> {
    if (this.checking) return this.getState()
    this.checking = true
    this.patch({ stage: 'checking', message: null, currentVersion: app.getVersion() })

    try {
      const response = await fetch(RELEASES_API, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Clauday' }
      })
      if (!response.ok) throw new Error(`GitHub API ${response.status}`)

      const releases = (await response.json()) as GithubRelease[]
      const latest = pickLatestStable(releases)

      if (!latest || !isNewerVersion(latest.tag_name, this.state.currentVersion)) {
        this.patch({ stage: 'up-to-date', latestVersion: latest?.tag_name.replace(/^v/, '') ?? null })
        return this.getState()
      }

      this.patch({
        stage: 'available',
        latestVersion: latest.tag_name.replace(/^v/, ''),
        releaseUrl: latest.html_url,
        progressPercent: 0
      })
      return this.getState()
    } catch (err) {
      console.warn('[Update] 업데이트 확인 실패 (무시하고 계속):', err)
      this.patch({ stage: 'idle', message: null })
      return this.getState()
    } finally {
      this.checking = false
    }
  }

  /** 새 버전을 내려받는다. 플랫폼별로 경로가 갈린다 — 클래스 주석 참고. */
  async download(): Promise<UpdateState> {
    if (this.state.stage !== 'available') return this.getState()

    if (process.platform === 'win32') {
      await this.downloadWithAutoUpdater()
    } else {
      await this.downloadDmg()
    }
    return this.getState()
  }

  /** Windows — electron-updater 가 latest.yml 을 보고 받아 둔다. */
  private async downloadWithAutoUpdater(): Promise<void> {
    this.patch({ stage: 'downloading', progressPercent: 0 })
    try {
      const { autoUpdater } = await import('electron-updater')
      autoUpdater.autoDownload = false
      autoUpdater.removeAllListeners()

      autoUpdater.on('download-progress', (p: { percent: number }) => {
        this.patch({ stage: 'downloading', progressPercent: Math.round(p.percent) })
      })
      autoUpdater.on('update-downloaded', () => {
        this.patch({ stage: 'downloaded', progressPercent: 100 })
      })
      autoUpdater.on('error', (err: Error) => {
        console.error('[Update] autoUpdater 오류:', err)
        this.patch({ stage: 'error', message: '업데이트를 받지 못했습니다. 잠시 후 다시 시도해 주세요.' })
      })

      await autoUpdater.checkForUpdates()
      await autoUpdater.downloadUpdate()
    } catch (err) {
      console.error('[Update] Windows 다운로드 실패:', err)
      this.patch({ stage: 'error', message: '업데이트를 받지 못했습니다. 릴리즈 페이지에서 직접 받아 주세요.' })
    }
  }

  /** macOS — dmg 를 직접 받아 임시 폴더에 둔다. 설치는 사용자가 Finder 에서 드래그. */
  private async downloadDmg(): Promise<void> {
    this.patch({ stage: 'downloading', progressPercent: 0 })
    try {
      const response = await fetch(RELEASES_API, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Clauday' }
      })
      if (!response.ok) throw new Error(`GitHub API ${response.status}`)

      const latest = pickLatestStable((await response.json()) as GithubRelease[])
      if (!latest) throw new Error('릴리즈를 찾지 못했습니다')

      const asset = pickAssetForPlatform(latest, process.platform, process.arch)
      if (!asset) throw new Error('이 플랫폼용 설치 파일이 릴리즈에 없습니다')

      const dir = join(app.getPath('temp'), 'clauday-update')
      await rm(dir, { recursive: true, force: true })
      await mkdir(dir, { recursive: true })
      const target = join(dir, asset.name)

      const fileRes = await fetch(asset.url, { headers: { 'User-Agent': 'Clauday' } })
      if (!fileRes.ok || !fileRes.body) throw new Error(`다운로드 실패 (${fileRes.status})`)

      const total = Number(fileRes.headers.get('content-length') ?? 0)
      let received = 0
      const source = Readable.fromWeb(fileRes.body as Parameters<typeof Readable.fromWeb>[0])
      source.on('data', (chunk: Buffer) => {
        received += chunk.length
        if (total > 0) this.patch({ stage: 'downloading', progressPercent: Math.round((received / total) * 100) })
      })

      await pipeline(source, createWriteStream(target))
      this.downloadedDmgPath = target
      this.patch({ stage: 'downloaded', progressPercent: 100 })
    } catch (err) {
      console.error('[Update] dmg 다운로드 실패:', err)
      this.patch({ stage: 'error', message: '설치 파일을 받지 못했습니다. 릴리즈 페이지에서 직접 받아 주세요.' })
    }
  }

  /**
   * 설치 단계. Windows 는 재시작하며 자동 설치하고, macOS 는 dmg 를 Finder 에서 연다.
   * macOS 에서 dmg 가 준비되지 않았으면 릴리즈 페이지를 대신 연다.
   */
  async install(): Promise<void> {
    if (process.platform === 'win32') {
      const { autoUpdater } = await import('electron-updater')
      autoUpdater.quitAndInstall()
      return
    }

    if (this.downloadedDmgPath) {
      const error = await shell.openPath(this.downloadedDmgPath)
      if (error) {
        console.warn('[Update] dmg 열기 실패, 릴리즈 페이지로 대체:', error)
        await shell.openExternal(this.state.releaseUrl ?? RELEASES_PAGE)
      }
      return
    }
    await shell.openExternal(this.state.releaseUrl ?? RELEASES_PAGE)
  }

  /** 릴리즈 노트 페이지를 브라우저로 연다 */
  async openReleasePage(): Promise<void> {
    await shell.openExternal(this.state.releaseUrl ?? RELEASES_PAGE)
  }
}
