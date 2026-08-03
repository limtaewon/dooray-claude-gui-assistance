import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { EditorLauncher } from './EditorLauncher'
import { commandCandidates } from './editorCatalog'

let home: string
let workdir: string
let launched: { command: string; args: string[] }[]

/** 실제 /Applications 와 PATH 를 보지 않도록 탐색 범위를 임시 홈으로 가둔다. */
function launcher(platform: NodeJS.Platform): EditorLauncher {
  return new EditorLauncher({
    platform,
    home,
    appSearchDirs: [join(home, 'Applications'), join(home, 'Applications', 'JetBrains Toolbox')],
    pathEnv: '',
    launch: (command, args) => launched.push({ command, args })
  })
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'clauday-editor-home-'))
  workdir = mkdtempSync(join(tmpdir(), 'clauday-editor-work-'))
  launched = []
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  rmSync(workdir, { recursive: true, force: true })
})

describe('commandCandidates', () => {
  it('PATH 를 실행 파일 후보로 편다', () => {
    expect(commandCandidates('idea', '/usr/bin:/usr/local/bin', 'darwin')).toEqual([
      '/usr/bin/idea',
      '/usr/local/bin/idea'
    ])
  })

  it('Windows 는 확장자를 붙여 찾는다 — idea 는 idea.cmd 로 깔린다', () => {
    expect(commandCandidates('idea', 'C:\\bin', 'win32')).toEqual([
      'C:\\bin\\idea.cmd',
      'C:\\bin\\idea.exe',
      'C:\\bin\\idea.bat'
    ])
  })

  it('PATH 가 없으면 후보도 없다', () => {
    expect(commandCandidates('idea', undefined, 'darwin')).toEqual([])
  })
})

describe('EditorLauncher — 감지', () => {
  it('macOS 는 앱 번들이 있으면 CLI 없이도 찾는다 — Toolbox 는 idea 명령을 안 깔아준다', async () => {
    mkdirSync(join(home, 'Applications', 'IntelliJ IDEA.app'), { recursive: true })

    const found = await launcher('darwin').detect()

    expect(found).toEqual([
      {
        id: 'intellij',
        name: 'IntelliJ IDEA',
        target: join(home, 'Applications', 'IntelliJ IDEA.app'),
        kind: 'app'
      }
    ])
  })

  it('Toolbox 폴더 아래 배포판 이름도 잡는다', async () => {
    mkdirSync(join(home, 'Applications', 'JetBrains Toolbox', 'IntelliJ IDEA Ultimate.app'), {
      recursive: true
    })

    const found = await launcher('darwin').detect()

    expect(found.map((e) => e.id)).toEqual(['intellij'])
  })

  it('설치된 것이 없으면 빈 목록 — 없는 버튼을 그리지 않는다', async () => {
    expect(await launcher('darwin').detect()).toEqual([])
  })

  it('두 번째 호출은 캐시를 쓰고 force 면 다시 훑는다', async () => {
    const l = launcher('darwin')
    expect(await l.detect()).toEqual([])

    mkdirSync(join(home, 'Applications', 'Cursor.app'), { recursive: true })
    expect(await l.detect()).toEqual([])
    expect((await l.detect(true)).map((e) => e.id)).toEqual(['cursor'])
  })
})

describe('EditorLauncher — 열기', () => {
  beforeEach(() => {
    mkdirSync(join(home, 'Applications', 'IntelliJ IDEA.app'), { recursive: true })
  })

  it('macOS 앱 번들은 open -a 로 띄운다', async () => {
    await launcher('darwin').open('intellij', workdir)

    expect(launched).toEqual([
      { command: 'open', args: ['-a', join(home, 'Applications', 'IntelliJ IDEA.app'), workdir] }
    ])
  })

  it('없는 폴더는 열지 않는다', async () => {
    await expect(launcher('darwin').open('intellij', join(workdir, 'nope'))).rejects.toThrow(
      /폴더가 없습니다/
    )
    expect(launched).toEqual([])
  })

  it('파일을 주면 거절한다 — 프로젝트로 여는 건 폴더다', async () => {
    const file = join(workdir, 'a.txt')
    writeFileSync(file, 'x')

    await expect(launcher('darwin').open('intellij', file)).rejects.toThrow(/폴더가 없습니다/)
  })

  it('상대 경로는 거절한다', async () => {
    await expect(launcher('darwin').open('intellij', 'relative/path')).rejects.toThrow(
      /절대 경로가 아닙니다/
    )
  })

  it('설치되지 않은 에디터는 이유를 알린다', async () => {
    await expect(launcher('darwin').open('vscode', workdir)).rejects.toThrow(/설치를 찾지 못했습니다/)
  })
})

describe('EditorLauncher — Windows', () => {
  const original = process.env.LOCALAPPDATA

  afterEach(() => {
    if (original === undefined) delete process.env.LOCALAPPDATA
    else process.env.LOCALAPPDATA = original
  })

  it('Toolbox 스크립트를 찾아 직접 실행한다', async () => {
    const localAppData = join(home, 'AppData', 'Local')
    const script = join(localAppData, 'JetBrains', 'Toolbox', 'scripts', 'idea.cmd')
    mkdirSync(join(localAppData, 'JetBrains', 'Toolbox', 'scripts'), { recursive: true })
    writeFileSync(script, '@echo off')
    process.env.LOCALAPPDATA = localAppData

    const l = new EditorLauncher({
      platform: 'win32',
      home,
      pathEnv: '',
      launch: (command, args) => launched.push({ command, args })
    })
    await l.open('intellij', workdir)

    expect(launched).toEqual([{ command: script, args: [workdir] }])
  })
})
