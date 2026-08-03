import { join, posix, win32 } from 'path'
import type { EditorId } from '../../shared/types/editor'

/**
 * 에디터별로 "어디를 뒤져볼지" 만 담은 표 — 파일 시스템은 건드리지 않는다.
 *
 * 왜 CLI 만으로는 안 되나: JetBrains 는 Toolbox 를 쓰면 `idea` 명령이 PATH 에 없는 경우가
 * 흔하다(설치 시 별도 동의 필요). macOS 는 앱 번들이 있으면 `open -a` 로 열 수 있으므로
 * 번들 경로를 먼저 본다.
 */
export interface EditorSpec {
  id: EditorId
  name: string
  /** macOS 앱 번들 이름 후보 (Ultimate/CE 등 배포판 차이) */
  macAppNames: string[]
  /** PATH 에서 찾아볼 실행 파일 이름 후보 */
  commands: string[]
  /**
   * Windows 에서 뒤져볼 실행 파일 위치 (LOCALAPPDATA 기준 경로 조각).
   * 한 문자열에 `\` 로 이어붙이면 macOS 에서 도는 테스트가 이를 파일명으로 읽는다 — 조각으로 둔다.
   */
  windowsRelativeSegments: string[][]
}

export const EDITOR_SPECS: EditorSpec[] = [
  {
    id: 'intellij',
    name: 'IntelliJ IDEA',
    macAppNames: [
      'IntelliJ IDEA.app',
      'IntelliJ IDEA Ultimate.app',
      'IntelliJ IDEA Community Edition.app',
      'IntelliJ IDEA CE.app'
    ],
    commands: ['idea', 'idea-ultimate', 'idea-ce'],
    windowsRelativeSegments: [
      ['JetBrains', 'Toolbox', 'scripts', 'idea.cmd'],
      ['Programs', 'IntelliJ IDEA Ultimate', 'bin', 'idea64.exe'],
      ['Programs', 'IntelliJ IDEA Community Edition', 'bin', 'idea64.exe']
    ]
  },
  {
    id: 'webstorm',
    name: 'WebStorm',
    macAppNames: ['WebStorm.app'],
    commands: ['webstorm'],
    windowsRelativeSegments: [
      ['JetBrains', 'Toolbox', 'scripts', 'webstorm.cmd'],
      ['Programs', 'WebStorm', 'bin', 'webstorm64.exe']
    ]
  },
  {
    id: 'pycharm',
    name: 'PyCharm',
    macAppNames: [
      'PyCharm.app',
      'PyCharm Professional.app',
      'PyCharm Community Edition.app',
      'PyCharm CE.app'
    ],
    commands: ['pycharm', 'charm'],
    windowsRelativeSegments: [
      ['JetBrains', 'Toolbox', 'scripts', 'pycharm.cmd'],
      ['Programs', 'PyCharm', 'bin', 'pycharm64.exe']
    ]
  },
  {
    id: 'vscode',
    name: 'VS Code',
    macAppNames: ['Visual Studio Code.app'],
    commands: ['code'],
    windowsRelativeSegments: [['Programs', 'Microsoft VS Code', 'bin', 'code.cmd']]
  },
  {
    id: 'cursor',
    name: 'Cursor',
    macAppNames: ['Cursor.app'],
    commands: ['cursor'],
    windowsRelativeSegments: [['Programs', 'cursor', 'resources', 'app', 'bin', 'cursor.cmd']]
  }
]

/** macOS 에서 앱 번들을 찾아볼 디렉터리 — Toolbox 는 사용자 홈 아래에 깐다. */
export function macAppSearchDirs(home: string): string[] {
  return [
    '/Applications',
    join(home, 'Applications'),
    join(home, 'Applications', 'JetBrains Toolbox')
  ]
}

/**
 * PATH 를 실행 파일 후보 경로 목록으로 편다. Windows 는 확장자까지 붙인다.
 * 경로 조립도 대상 플랫폼 규칙을 쓴다 — 그래야 macOS 에서 도는 테스트가 Windows 경로를 검증한다.
 */
export function commandCandidates(
  command: string,
  pathEnv: string | undefined,
  platform: NodeJS.Platform
): string[] {
  if (!pathEnv) return []
  const windows = platform === 'win32'
  const separator = windows ? ';' : ':'
  const extensions = windows ? ['.cmd', '.exe', '.bat'] : ['']
  const joinPath = windows ? win32.join : posix.join
  const dirs = pathEnv.split(separator).filter((dir) => dir.length > 0)
  return dirs.flatMap((dir) => extensions.map((ext) => joinPath(dir, `${command}${ext}`)))
}
