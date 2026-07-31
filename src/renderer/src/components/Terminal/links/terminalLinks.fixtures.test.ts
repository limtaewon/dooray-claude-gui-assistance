/**
 * 사용자 보고 실패 사례 픽스처 회귀 테스트 (ADR-v2-terminal-p2-05 §모니터링, plan.md R7-2).
 * `__fixtures__/terminal-links/*.txt` 는 실제 Cmd+클릭이 안 먹었던 4가지 케이스를 그대로 담는다 —
 * wrap 분단(claude TUI hard wrap) · 상대 경로 · 확장자 없는 디렉터리 · 공백 포함 경로.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it, expect } from 'vitest'
import { detectLocalPathLinks } from './terminalPathRegex'
import { buildHardWrappedPathLogicalLineCandidates } from './wrappedLinkRanges'
import { createFakeBuffer } from '../../../../../../test/helpers/fakeXtermBuffer'

const FIXTURES_DIR = join(__dirname, '..', '__fixtures__', 'terminal-links')

function readFixtureLines(name: string): string[] {
  return readFileSync(join(FIXTURES_DIR, name), 'utf8').split('\n').filter((l) => l.length > 0)
}

describe('사용자 보고 실패 사례 픽스처', () => {
  it('① wrap 분단 — claude TUI 의 hard-wrap 경로를 하나로 재구성한다 (hard-wrap-claude-path.txt)', () => {
    const lines = readFixtureLines('hard-wrap-claude-path.txt')
    expect(lines).toHaveLength(2)
    const buffer = createFakeBuffer(lines.map((text) => ({ text, isWrapped: false })))
    const candidates = buildHardWrappedPathLogicalLineCandidates(buffer, 2)
    expect(
      candidates.some((c) => c.text.includes('/Users/dev/projects/dooray-claude-gui-assistance/src/main/index.ts'))
    ).toBe(true)
  })

  it('② 상대 경로 — git status 스타일 출력에서 상대 경로를 감지한다 (relative-path.txt)', () => {
    const [line] = readFixtureLines('relative-path.txt')
    const links = detectLocalPathLinks(line)
    expect(links.map((l) => l.pathText)).toContain('src/renderer/src/components/Terminal/TerminalPane.tsx')
  })

  it('③ 확장자 없는 디렉터리 — cd 명령의 공백 포함 디렉터리를 감지한다 (extensionless-directory.txt)', () => {
    const [line] = readFixtureLines('extensionless-directory.txt')
    const links = detectLocalPathLinks(line)
    expect(links.map((l) => l.pathText)).toContain('/Users/dev/My Projects')
  })

  it('④ 공백 포함 경로 — macOS Application Support 경로를 감지한다 (spaced-path.txt)', () => {
    const [line] = readFixtureLines('spaced-path.txt')
    const links = detectLocalPathLinks(line)
    expect(links.map((l) => l.pathText)).toContain('/Users/x/Library/Application Support/Clauday/log.txt')
  })
})
