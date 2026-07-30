import { describe, it, expect, vi, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  encodeCwd,
  claudeProjectsRoot,
  readSessionCwd,
  findProjectDir,
  findProjectDirDetailed
} from './claudeProjects'
import { MEASURED_CLAUDE_PROJECT_DIRS, BOUNDARY_CLAUDE_PROJECT_DIRS } from './__fixtures__/claudeProjectDirs'

let workDirs: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(workDirs.map((d) => fs.rm(d, { recursive: true, force: true })))
  workDirs = []
})

async function makeTmpDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), prefix))
  workDirs.push(dir)
  return dir
}

describe('encodeCwd — 실측 채집표 (adr.md §2)', () => {
  it.each(MEASURED_CLAUDE_PROJECT_DIRS)('$cwd → $dir ($note)', ({ cwd, dir }) => {
    expect(encodeCwd(cwd)).toBe(dir)
  })
})

describe('encodeCwd — 경계 케이스 (plan.md §1-3, 미검증 표기)', () => {
  it.each(BOUNDARY_CLAUDE_PROJECT_DIRS)('$cwd → $dir ($note)', ({ cwd, dir }) => {
    expect(encodeCwd(cwd)).toBe(dir)
  })
})

describe('encodeCwd — NFC 정규화', () => {
  it('NFD 입력도 NFC 결과와 동일 (한글 자모 분해 보정)', () => {
    const nfd = '/Users/nhn/Desktop/발표'.normalize('NFD')
    expect(encodeCwd(nfd)).toBe('-Users-nhn-Desktop---')
    expect(encodeCwd(nfd)).toBe(encodeCwd('/Users/nhn/Desktop/발표'))
  })
})

describe('encodeCwd — 200자 경계', () => {
  it('199자 → 캡 없음, 단순 치환 결과 그대로', () => {
    const cwd = '/' + 'a'.repeat(198) // 치환 후 길이 199
    const result = encodeCwd(cwd)
    expect(result.length).toBe(199)
    expect(result).toBe('-' + 'a'.repeat(198))
  })

  it('정확히 200자 → 캡 없음 (해시 접미 없음)', () => {
    const cwd = '/' + 'a'.repeat(199) // 치환 후 길이 200
    const result = encodeCwd(cwd)
    expect(result.length).toBe(200)
    expect(result).toBe('-' + 'a'.repeat(199))
  })

  it('201자 → 캡 + 해시 접미 (base36 문자만 포함)', () => {
    const cwd = '/' + 'a'.repeat(200) // 치환 후 길이 201
    const result = encodeCwd(cwd)
    expect(result.startsWith('-' + 'a'.repeat(199))).toBe(true)
    const suffix = result.slice(200) // '-' + hash
    expect(suffix.startsWith('-')).toBe(true)
    expect(suffix.slice(1)).toMatch(/^[0-9a-z]+$/)
    expect(suffix.slice(1).length).toBeGreaterThan(0)
  })

  it('같은 200자 prefix 를 갖는 서로 다른 긴 경로는 다른 결과를 낸다', () => {
    const base = '/' + 'a'.repeat(200)
    const a = encodeCwd(base + '/one')
    const b = encodeCwd(base + '/two')
    expect(a).not.toBe(b)
    expect(a.slice(0, 200)).toBe(b.slice(0, 200))
  })
})

describe('claudeProjectsRoot', () => {
  const orig = process.env.CLAUDE_CONFIG_DIR

  afterEach(() => {
    if (orig === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = orig
  })

  it('CLAUDE_CONFIG_DIR 미설정 시 ~/.claude/projects', () => {
    delete process.env.CLAUDE_CONFIG_DIR
    expect(claudeProjectsRoot()).toContain(join('.claude', 'projects'))
  })

  it('CLAUDE_CONFIG_DIR 설정 시 그 경로/projects', () => {
    process.env.CLAUDE_CONFIG_DIR = '/custom/config'
    expect(claudeProjectsRoot()).toBe(join('/custom/config', 'projects'))
  })

  it('configDir 파라미터가 env 보다 우선', () => {
    process.env.CLAUDE_CONFIG_DIR = '/custom/config'
    expect(claudeProjectsRoot({ configDir: '/explicit' })).toBe(join('/explicit', 'projects'))
  })
})

function jsonlLine(obj: unknown): string {
  return JSON.stringify(obj) + '\n'
}

describe('readSessionCwd', () => {
  it('선두 3줄에 cwd 없고 4번째 줄(type:user)에 있는 실측 스키마', async () => {
    const dir = await makeTmpDir('clauday-readcwd-')
    const file = join(dir, 's.jsonl')
    await fs.writeFile(
      file,
      jsonlLine({ type: 'mode', mode: 'default' }) +
        jsonlLine({ type: 'permission-mode', mode: 'default' }) +
        jsonlLine({ type: 'file-history-snapshot', snapshot: {} }) +
        jsonlLine({ type: 'user', cwd: '/Users/nhn/project', message: { role: 'user', content: 'hi' } })
    )
    await expect(readSessionCwd(file)).resolves.toBe('/Users/nhn/project')
  })

  it('cwd 없는 파일 → undefined, throw 안 함', async () => {
    const dir = await makeTmpDir('clauday-readcwd-')
    const file = join(dir, 's.jsonl')
    await fs.writeFile(file, jsonlLine({ type: 'mode', mode: 'default' }))
    await expect(readSessionCwd(file)).resolves.toBeUndefined()
  })

  it('빈 파일 → undefined, throw 안 함', async () => {
    const dir = await makeTmpDir('clauday-readcwd-')
    const file = join(dir, 's.jsonl')
    await fs.writeFile(file, '')
    await expect(readSessionCwd(file)).resolves.toBeUndefined()
  })

  it('깨진 JSON 줄이 섞여도 skip 하고 계속 진행 ("cwd" 를 포함하지 않는 줄 — 사전 필터에서 걸러짐)', async () => {
    const dir = await makeTmpDir('clauday-readcwd-')
    const file = join(dir, 's.jsonl')
    await fs.writeFile(
      file,
      '{not valid json\n' + jsonlLine({ type: 'user', cwd: '/ok/path' })
    )
    await expect(readSessionCwd(file)).resolves.toBe('/ok/path')
  })

  it('"cwd" 문자열은 포함하지만 JSON 파싱에 실패하는 줄도 skip 하고 계속 진행 (JSON.parse 실패 경로)', async () => {
    const dir = await makeTmpDir('clauday-readcwd-')
    const file = join(dir, 's.jsonl')
    await fs.writeFile(
      file,
      '{"type":"user","cwd": 이건-json-이-아님\n' + jsonlLine({ type: 'user', cwd: '/ok/path2' })
    )
    await expect(readSessionCwd(file)).resolves.toBe('/ok/path2')
  })

  it('상한(maxLines) 초과 시 undefined + warn 호출', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dir = await makeTmpDir('clauday-readcwd-')
    const file = join(dir, 's.jsonl')
    const lines = Array.from({ length: 5 }, (_, i) => jsonlLine({ type: 'noise', i })).join('')
      + jsonlLine({ type: 'user', cwd: '/too/late' })
    await fs.writeFile(file, lines)
    await expect(readSessionCwd(file, { maxLines: 2 })).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})

async function writeSessionJsonl(dirPath: string, cwd: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
  await fs.writeFile(
    join(dirPath, 'session.jsonl'),
    jsonlLine({ type: 'mode', mode: 'default' }) + jsonlLine({ type: 'user', cwd })
  )
}

describe('findProjectDir', () => {
  it('1단 정확 일치 — warn 없이 히트', async () => {
    const configDir = await makeTmpDir('clauday-findproj-')
    const root = join(configDir, 'projects')
    const cwd = '/Users/tester/exact-hit-project'
    await fs.mkdir(join(root, encodeCwd(cwd)), { recursive: true })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const hit = await findProjectDirDetailed(cwd, { configDir })
    expect(hit?.via).toBe('exact')
    expect(hit?.dir).toBe(join(root, encodeCwd(cwd)))
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('1단 미스 + 3단 히트 — warn 1회 + via=scan', async () => {
    const configDir = await makeTmpDir('clauday-findproj-')
    const root = join(configDir, 'projects')
    const cwd = '/Users/tester/scan-only-project'
    // 인코딩 규칙이 바뀐 것처럼, 실제 디렉터리명은 cwd 로 계산한 이름과 다르게 만든다.
    await writeSessionJsonl(join(root, 'renamed-by-newer-claude'), cwd)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const hit = await findProjectDirDetailed(cwd, { configDir })
    expect(hit?.via).toBe('scan')
    expect(hit?.dir).toBe(join(root, 'renamed-by-newer-claude'))
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('via=scan')
  })

  it('2단 히트 — 200자 초과 + 해시 접미가 다른 디렉터리', async () => {
    const configDir = await makeTmpDir('clauday-findproj-')
    const root = join(configDir, 'projects')
    const cwd = '/' + 'b'.repeat(220)
    const encoded = encodeCwd(cwd)
    const prefix = encoded.slice(0, 200) + '-'
    const driftedName = prefix + 'zzzz9999' // 실제 해시와 다른 접미 (드리프트 시뮬레이션)
    await fs.mkdir(join(root, driftedName), { recursive: true })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const hit = await findProjectDirDetailed(cwd, { configDir })
    expect(hit?.via).toBe('hashPrefix')
    expect(hit?.dir).toBe(join(root, driftedName))
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('via=hashPrefix')
  })

  it('전부 미스 → undefined (throw 안 함)', async () => {
    const configDir = await makeTmpDir('clauday-findproj-')
    const root = join(configDir, 'projects')
    await fs.mkdir(root, { recursive: true })
    await expect(findProjectDir('/nowhere/to/be/found', { configDir })).resolves.toBeUndefined()
  })

  it('root 자체가 없어도 throw 안 함', async () => {
    const configDir = await makeTmpDir('clauday-findproj-')
    await expect(findProjectDir('/nowhere', { configDir })).resolves.toBeUndefined()
  })

  it('fullScan:false 면 3단(전체 스캔) 을 타지 않는다', async () => {
    const configDir = await makeTmpDir('clauday-findproj-')
    const root = join(configDir, 'projects')
    const cwd = '/Users/tester/would-be-found-by-scan'
    await writeSessionJsonl(join(root, 'renamed-by-newer-claude'), cwd)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const hit = await findProjectDir(cwd, { configDir, fullScan: false })
    expect(hit).toBeUndefined()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('jsonl 없는 디렉터리가 섞여 있어도 크래시 없음', async () => {
    const configDir = await makeTmpDir('clauday-findproj-')
    const root = join(configDir, 'projects')
    await fs.mkdir(join(root, 'memory-only'), { recursive: true })
    await fs.writeFile(join(root, 'memory-only', 'notes.md'), '# no jsonl here')
    await fs.mkdir(join(root, 'empty-dir'), { recursive: true })
    const cwd = '/Users/tester/needle'
    await writeSessionJsonl(join(root, 'has-the-needle'), cwd)

    const hit = await findProjectDirDetailed(cwd, { configDir })
    expect(hit?.via).toBe('scan')
    expect(hit?.dir).toBe(join(root, 'has-the-needle'))
  })

  it('root 바로 아래에 디렉터리가 아닌 파일만 있으면(readdir 대상이 디렉터리 아님) 크래시 없이 undefined', async () => {
    const configDir = await makeTmpDir('clauday-findproj-')
    const root = join(configDir, 'projects')
    await fs.mkdir(root, { recursive: true })
    // 프로젝트 디렉터리 목록에 파일이 섞여 있으면 그 이름으로 readdir 시도 시 ENOTDIR 이 난다 (latestJsonlPath 의 방어 분기).
    await fs.writeFile(join(root, 'stray-file.txt'), 'not a directory')

    await expect(findProjectDir('/Users/tester/nowhere', { configDir })).resolves.toBeUndefined()
  })

  it('1단 정확 일치 미스 + realpath 재시도 히트 — via=realpath (mac /tmp 심볼릭 케이스, ADR-01 R6)', async () => {
    const tmpBase = await makeTmpDir('clauday-findproj-')
    // mkdtemp 가 돌려주는 경로 자체가 이미 심볼릭(예: macOS /var -> /private/var)을 포함할 수 있으므로,
    // 먼저 완전히 해석한 경로를 기준 삼아야 root 계산과 realpath 계산이 어긋나지 않는다.
    const resolvedBase = await fs.realpath(tmpBase)
    const root = join(resolvedBase, 'projects')
    const realTargetDir = join(resolvedBase, 'real-target')
    const symlinkCwd = join(resolvedBase, 'sym-link-cwd')
    await fs.mkdir(realTargetDir, { recursive: true })
    await fs.symlink(realTargetDir, symlinkCwd, 'dir')

    const expectedDir = join(root, encodeCwd(realTargetDir))
    await fs.mkdir(expectedDir, { recursive: true })

    const hit = await findProjectDirDetailed(symlinkCwd, { configDir: resolvedBase })
    expect(hit?.via).toBe('realpath')
    expect(hit?.dir).toBe(expectedDir)
  })

  it('root 자체가 없고 cwd 가 200자 초과여도 throw 안 하고 undefined (2단 readdir 실패 + 3단 readdir 실패 동시 방어)', async () => {
    const configDir = await makeTmpDir('clauday-findproj-')
    // root(=configDir/projects) 디렉터리를 만들지 않은 채로 진행 — 2단 해시 prefix 스캔의 readdir 과
    // 3단 전체 스캔의 readdir 이 모두 ENOENT 로 실패하는 경로를 같이 방어하는지 확인.
    const cwd = '/' + 'c'.repeat(220)
    await expect(findProjectDir(cwd, { configDir })).resolves.toBeUndefined()
  })
})
