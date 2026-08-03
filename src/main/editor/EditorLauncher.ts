import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { homedir } from 'os'
import { isAbsolute, join } from 'path'
import type { DetectedEditor, EditorId } from '../../shared/types/editor'
import { EDITOR_SPECS, commandCandidates, macAppSearchDirs, type EditorSpec } from './editorCatalog'

interface LauncherOptions {
  platform?: NodeJS.Platform
  home?: string
  /** macOS 앱 번들을 찾을 디렉터리 — 기본은 /Applications 와 홈 아래 (테스트 격리용 주입점) */
  appSearchDirs?: string[]
  /** PATH 대신 뒤질 값 — 테스트가 실제 PATH 에 깔린 에디터에 영향받지 않게 한다 */
  pathEnv?: string
  /** 테스트 대역 주입점 — 실제로는 spawn 으로 프로세스를 띄운다. */
  launch?: (command: string, args: string[]) => void
}

/**
 * 워크트리·저장소 폴더를 외부 에디터에서 프로젝트로 여는 실행기.
 *
 * 설치된 것만 목록에 올린다 — 없는 IDE 버튼을 눌러 아무 일도 안 일어나는 것보다, 애초에
 * 안 보이는 편이 낫다. 감지 결과는 캐시하되 `detect(true)` 로 다시 훑을 수 있다.
 */
export class EditorLauncher {
  private readonly platform: NodeJS.Platform
  private readonly appSearchDirs: string[]
  private readonly pathEnv: string | undefined
  private readonly launch: (command: string, args: string[]) => void
  private cache: DetectedEditor[] | null = null

  constructor(opts: LauncherOptions = {}) {
    this.platform = opts.platform ?? process.platform
    this.appSearchDirs = opts.appSearchDirs ?? macAppSearchDirs(opts.home ?? homedir())
    this.pathEnv = opts.pathEnv ?? process.env.PATH
    this.launch =
      opts.launch ??
      ((command, args) => {
        // shell: false — 경로에 공백이나 따옴표가 있어도 인자로 그대로 전달된다.
        const child = spawn(command, args, { detached: true, stdio: 'ignore', shell: false })
        child.unref()
      })
  }

  async detect(force = false): Promise<DetectedEditor[]> {
    if (!force && this.cache) return this.cache
    const found: DetectedEditor[] = []
    for (const spec of EDITOR_SPECS) {
      const editor = await this.detectOne(spec)
      if (editor) found.push(editor)
    }
    this.cache = found
    return found
  }

  /** 폴더를 그 에디터에서 연다. 폴더가 없거나 에디터를 못 찾으면 예외 — 조용히 넘기지 않는다. */
  async open(editorId: EditorId, path: string): Promise<void> {
    if (!path || !isAbsolute(path)) {
      throw new Error(`절대 경로가 아닙니다: ${path}`)
    }
    const stat = await fs.stat(path).catch(() => null)
    if (!stat?.isDirectory()) {
      throw new Error(`폴더가 없습니다: ${path}`)
    }

    const editors = await this.detect()
    const editor = editors.find((e) => e.id === editorId)
    if (!editor) {
      throw new Error(`설치를 찾지 못했습니다: ${editorId}`)
    }

    if (editor.kind === 'app') this.launch('open', ['-a', editor.target, path])
    else this.launch(editor.target, [path])
  }

  private async detectOne(spec: EditorSpec): Promise<DetectedEditor | null> {
    if (this.platform === 'darwin') {
      for (const dir of this.appSearchDirs) {
        for (const appName of spec.macAppNames) {
          const target = join(dir, appName)
          if (await exists(target)) {
            return { id: spec.id, name: spec.name, target, kind: 'app' }
          }
        }
      }
    }

    if (this.platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA
      if (localAppData) {
        for (const segments of spec.windowsRelativeSegments) {
          const target = join(localAppData, ...segments)
          if (await exists(target)) {
            return { id: spec.id, name: spec.name, target, kind: 'exec' }
          }
        }
      }
    }

    for (const command of spec.commands) {
      for (const candidate of commandCandidates(command, this.pathEnv, this.platform)) {
        if (await exists(candidate)) {
          return { id: spec.id, name: spec.name, target: candidate, kind: 'exec' }
        }
      }
    }

    return null
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}
