import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ILink, Terminal } from '@xterm/xterm'
import { createFakeBuffer } from '../../../../../../test/helpers/fakeXtermBuffer'
import { createFilePathLinkProvider } from './filePathLinkProvider'
import type { CachedPathResolution } from './pathExistsCache'

function provideLinksAsync(
  provider: ReturnType<typeof createFilePathLinkProvider>,
  lineNumber: number
): Promise<ILink[] | undefined> {
  return new Promise((resolve) => provider.provideLinks(lineNumber, resolve))
}

function makeTerminal(buffer: ReturnType<typeof createFakeBuffer>): { terminal: Terminal; clearSelection: ReturnType<typeof vi.fn> } {
  const clearSelection = vi.fn()
  const terminal = { buffer: { active: buffer }, clearSelection } as unknown as Terminal
  return { terminal, clearSelection }
}

function makeDeps(overrides: Partial<Parameters<typeof createFilePathLinkProvider>[1]> = {}): {
  deps: Parameters<typeof createFilePathLinkProvider>[1]
  openPath: ReturnType<typeof vi.fn>
  resolvePath: ReturnType<typeof vi.fn>
} {
  const openPath = vi.fn()
  const resolvePath = vi.fn()
  const deps = {
    sessionId: 's1',
    getCwdHint: () => '/repo',
    cache: new Map<string, CachedPathResolution>(),
    resolvePath,
    openPath,
    tooltip: { show: vi.fn(), hide: vi.fn() },
    ...overrides
  }
  return { deps, openPath, resolvePath }
}

describe('createFilePathLinkProvider', () => {
  beforeEach(() => { vi.stubGlobal('navigator', { platform: 'MacIntel' }) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('상대 경로가 존재하면 링크가 생성되고, Cmd+클릭에서 openPath 가 resolved 경로로 호출된다', async () => {
    const buffer = createFakeBuffer([{ text: 'M src/main/index.ts' }])
    const { terminal, clearSelection } = makeTerminal(buffer)
    const { deps, openPath, resolvePath } = makeDeps()
    resolvePath.mockResolvedValue([{ candidate: 'src/main/index.ts', resolved: '/repo/src/main/index.ts', kind: 'file' }])

    const provider = createFilePathLinkProvider(terminal, deps)
    const links = await provideLinksAsync(provider, 1)

    expect(links).toHaveLength(1)
    const link = links![0]
    expect(link.text).toBe('src/main/index.ts')

    link.activate(new MouseEvent('click', { metaKey: true }) as MouseEvent, link.text)
    expect(openPath).toHaveBeenCalledWith('/repo/src/main/index.ts', { preferExternal: false, line: null })
    expect(clearSelection).toHaveBeenCalledTimes(1)
  })

  // 앱 안 파일 탭이 기본이 되면서, OS 기본 앱으로 나가는 탈출구가 ⌥⌘ 다.
  it('⌥⌘클릭은 preferExternal 로 알린다 — OS 기본 앱 탈출구', async () => {
    const buffer = createFakeBuffer([{ text: 'M src/main/index.ts' }])
    const { terminal } = makeTerminal(buffer)
    const { deps, openPath, resolvePath } = makeDeps()
    resolvePath.mockResolvedValue([{ candidate: 'src/main/index.ts', resolved: '/repo/src/main/index.ts', kind: 'file' }])
    const provider = createFilePathLinkProvider(terminal, deps)
    const links = await provideLinksAsync(provider, 1)

    links![0].activate(new MouseEvent('click', { metaKey: true, altKey: true }) as MouseEvent, links![0].text)

    expect(openPath).toHaveBeenCalledWith('/repo/src/main/index.ts', { preferExternal: true, line: null })
  })

  it('파일.ts:120 형태면 line 을 함께 넘긴다 — 앱 안에서 그 줄로 간다', async () => {
    const buffer = createFakeBuffer([{ text: 'at src/main/index.ts:120:8' }])
    const { terminal } = makeTerminal(buffer)
    const { deps, openPath, resolvePath } = makeDeps()
    resolvePath.mockResolvedValue([{ candidate: 'src/main/index.ts', resolved: '/repo/src/main/index.ts', kind: 'file' }])
    const provider = createFilePathLinkProvider(terminal, deps)
    const links = await provideLinksAsync(provider, 1)

    links![0].activate(new MouseEvent('click', { metaKey: true }) as MouseEvent, links![0].text)

    expect(openPath).toHaveBeenCalledWith('/repo/src/main/index.ts', { preferExternal: false, line: 120 })
  })

  it('modifier 없는 클릭은 activate 되어도 openPath 를 호출하지 않는다', async () => {
    const buffer = createFakeBuffer([{ text: 'src/main/index.ts' }])
    const { terminal } = makeTerminal(buffer)
    const { deps, openPath, resolvePath } = makeDeps()
    resolvePath.mockResolvedValue([{ candidate: 'src/main/index.ts', resolved: '/repo/src/main/index.ts', kind: 'file' }])
    const provider = createFilePathLinkProvider(terminal, deps)
    const links = await provideLinksAsync(provider, 1)
    links![0].activate(new MouseEvent('click', { metaKey: false, ctrlKey: false }) as MouseEvent, links![0].text)
    expect(openPath).not.toHaveBeenCalled()
  })

  it('존재하지 않는 경로(kind:null)는 링크가 되지 않는다 — G16', async () => {
    const buffer = createFakeBuffer([{ text: 'src/ghost.ts' }])
    const { terminal } = makeTerminal(buffer)
    const { deps, resolvePath } = makeDeps()
    resolvePath.mockResolvedValue([{ candidate: 'src/ghost.ts', resolved: '/repo/src/ghost.ts', kind: null }])
    const provider = createFilePathLinkProvider(terminal, deps)
    const links = await provideLinksAsync(provider, 1)
    expect(links).toBeUndefined()
  })

  it('확장자 없는 디렉터리를 인식한다 — 사용자 보고 케이스 ③', async () => {
    const buffer = createFakeBuffer([{ text: 'cd /Users/x/My Project' }])
    const { terminal } = makeTerminal(buffer)
    const { deps, resolvePath } = makeDeps()
    resolvePath.mockImplementation(async ({ candidates }: { candidates: string[] }) =>
      candidates.map((candidate) => ({
        candidate,
        resolved: `/resolved${candidate.startsWith('/') ? candidate : '/' + candidate}`,
        kind: candidate === '/Users/x/My Project' ? 'directory' : null
      }))
    )
    const provider = createFilePathLinkProvider(terminal, deps)
    const links = await provideLinksAsync(provider, 1)
    expect(links?.some((l) => l.text === '/Users/x/My Project')).toBe(true)
  })

  it('공백 포함 절대 경로를 인식한다 — 사용자 보고 케이스 ④', async () => {
    const buffer = createFakeBuffer([{ text: 'saved to /Users/x/Application Support/log.txt' }])
    const { terminal } = makeTerminal(buffer)
    const { deps, resolvePath } = makeDeps()
    resolvePath.mockImplementation(async ({ candidates }: { candidates: string[] }) =>
      candidates.map((candidate) => ({
        candidate,
        resolved: candidate,
        kind: candidate === '/Users/x/Application Support/log.txt' ? 'file' : null
      }))
    )
    const provider = createFilePathLinkProvider(terminal, deps)
    const links = await provideLinksAsync(provider, 1)
    expect(links?.some((l) => l.text === '/Users/x/Application Support/log.txt')).toBe(true)
  })

  it('hard wrap 으로 쪼개진 경로를 한 링크로 이어붙인다 — 사용자 보고 케이스 ②', async () => {
    const buffer = createFakeBuffer([
      { text: 'Reading /Users/dev/projects/dooray-claude-gui-' },
      { text: 'assistance/src/main/index.ts' }
    ])
    const { terminal } = makeTerminal(buffer)
    const { deps, resolvePath } = makeDeps()
    resolvePath.mockImplementation(async ({ candidates }: { candidates: string[] }) =>
      candidates.map((candidate) => ({
        candidate,
        resolved: candidate,
        kind: candidate === '/Users/dev/projects/dooray-claude-gui-assistance/src/main/index.ts' ? 'file' : null
      }))
    )
    const provider = createFilePathLinkProvider(terminal, deps)
    const links = await provideLinksAsync(provider, 2)
    expect(links?.some((l) => l.text.includes('dooray-claude-gui-assistance/src/main/index.ts'))).toBe(true)
    const wrapped = links!.find((l) => l.text.includes('dooray-claude-gui-assistance'))!
    // 두 물리적 행에 걸쳐 있으므로 시작 y 와 끝 y 가 다르다.
    expect(wrapped.range.start.y).not.toBe(wrapped.range.end.y)
  })

  it('검증 완료 시점에 라인이 바뀌었으면(stale) 결과를 폐기한다', async () => {
    // fingerprint 재계산이 실제로 버퍼를 다시 읽도록, getLine 이 반환하는 라인 자체를 바꿔치기한다
    // (createFakeBuffer 는 고정 배열이라 이 시나리오 전용으로 가변 버퍼를 직접 구성한다).
    let currentLine = createFakeBuffer([{ text: 'src/main/index.ts' }]).getLine(0)
    const mutableBuffer = { getLine: (y: number) => (y === 0 ? currentLine : undefined) }
    const { terminal } = makeTerminal(mutableBuffer as ReturnType<typeof createFakeBuffer>)
    const { deps, resolvePath } = makeDeps()
    let resolveIpc: (v: unknown) => void = () => {}
    resolvePath.mockReturnValue(new Promise((resolve) => { resolveIpc = resolve }))

    const provider = createFilePathLinkProvider(terminal, deps)
    const pending = provideLinksAsync(provider, 1)

    // IPC 가 응답하기 전에 버퍼 내용이 바뀐다(예: 스크롤/새 출력) — fingerprint 가 달라진다.
    currentLine = createFakeBuffer([{ text: 'completely different line now' }]).getLine(0)
    resolveIpc([{ candidate: 'src/main/index.ts', resolved: '/repo/src/main/index.ts', kind: 'file' }])

    const links = await pending
    expect(links).toBeUndefined()
  })

  it('후보가 없으면 undefined 콜백 — 링크 provider 로직이 아무 것도 하지 않는다', async () => {
    const buffer = createFakeBuffer([{ text: 'no separators or bare words 123' }])
    const { terminal } = makeTerminal(buffer)
    const { deps, resolvePath } = makeDeps()
    const provider = createFilePathLinkProvider(terminal, deps)
    const links = await provideLinksAsync(provider, 1)
    expect(links).toBeUndefined()
    expect(resolvePath).not.toHaveBeenCalled()
  })

  it('hover/leave 는 tooltip.show/hide 를 호출한다 — line:col 이 있으면 함께 표기', async () => {
    const buffer = createFakeBuffer([{ text: 'src/main/index.ts:120:8' }])
    const { terminal } = makeTerminal(buffer)
    const { deps, resolvePath } = makeDeps()
    resolvePath.mockResolvedValue([{ candidate: 'src/main/index.ts', resolved: '/repo/src/main/index.ts', kind: 'file' }])
    const provider = createFilePathLinkProvider(terminal, deps)
    const links = await provideLinksAsync(provider, 1)
    const link = links![0]
    const event = new MouseEvent('mousemove') as MouseEvent
    link.hover?.(event, link.text)
    expect(deps.tooltip.show).toHaveBeenCalledWith('/repo/src/main/index.ts:120:8', event)
    link.leave?.(event, link.text)
    expect(deps.tooltip.hide).toHaveBeenCalledTimes(1)
  })
})
