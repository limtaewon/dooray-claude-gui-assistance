import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron-store', async () => {
  const { MemElectronStore } = await import('../../../test/mocks/electron-store')
  return { default: MemElectronStore }
})

import { ClaudeSessionService } from './ClaudeSessionService'

let svc: ClaudeSessionService
let projectsRoot: string
let tmpHome: string

function encodeCwd(cwd: string): string {
  return cwd.replace(/\//g, '-')
}

function writeJsonlSession(cwd: string, sessionId: string, entries: unknown[]): void {
  const dir = join(projectsRoot, encodeCwd(cwd))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${sessionId}.jsonl`), entries.map((e) => JSON.stringify(e)).join('\n'), 'utf8')
}

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'claude-home-'))
  projectsRoot = join(tmpHome, '.claude', 'projects')
  mkdirSync(projectsRoot, { recursive: true })
  svc = new ClaudeSessionService()
  // cwd 가 주어지면 projectDir(cwd) 를 사용하므로 이를 임시 디렉토리로 라우팅
  ;(svc as unknown as { projectDir: (cwd: string) => string }).projectDir = (cwd: string): string => join(projectsRoot, encodeCwd(cwd))
})
afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true })
})

describe('ClaudeSessionService — title/star storage', () => {
  it('setCustomTitle / getCustomTitle / clearCustomTitle', () => {
    svc.setCustomTitle('s1', '내 제목')
    expect(svc.getCustomTitle('s1')).toBe('내 제목')
    svc.clearCustomTitle('s1')
    expect(svc.getCustomTitle('s1')).toBeUndefined()
  })

  it('빈 제목은 저장하지 않고 삭제', () => {
    svc.setCustomTitle('s1', 'X')
    svc.setCustomTitle('s1', '   ')
    expect(svc.getCustomTitle('s1')).toBeUndefined()
  })

  it('setStarred / isStarred', () => {
    expect(svc.isStarred('s1')).toBe(false)
    svc.setStarred('s1', true)
    expect(svc.isStarred('s1')).toBe(true)
    svc.setStarred('s1', false)
    expect(svc.isStarred('s1')).toBe(false)
  })
})

describe('ClaudeSessionService.listSessions', () => {
  it('cwd 지정 시 해당 디렉토리만', async () => {
    writeJsonlSession('/proj/a', 'sess-A', [
      { type: 'user', cwd: '/proj/a', timestamp: '2026-05-13T09:00:00Z', uuid: 'u1', message: { role: 'user', content: '안녕하세요' } },
      { type: 'assistant', timestamp: '2026-05-13T09:00:01Z', uuid: 'a1', message: { role: 'assistant', content: '반갑습니다' } }
    ])
    writeJsonlSession('/proj/b', 'sess-B', [
      { type: 'user', cwd: '/proj/b', timestamp: '2026-05-13T08:00:00Z', uuid: 'u2', message: { role: 'user', content: 'X' } }
    ])
    const list = await svc.listSessions('/proj/a')
    expect(list).toHaveLength(1)
    expect(list[0].sessionId).toBe('sess-A')
    expect(list[0].messageCount).toBe(2)
  })

  // (전체 프로젝트 탐색은 PROJECTS_DIR module-const 의존이라 단위 테스트에서 격리 어려움 — 생략)

  it('메시지 0개면 제외', async () => {
    writeJsonlSession('/proj/a', 'empty', [
      { type: 'summary', timestamp: '2026-05-13T09:00:00Z' }
    ])
    const list = await svc.listSessions('/proj/a')
    expect(list).toHaveLength(0)
  })

  it('customTitle / starred 메타가 첨부됨', async () => {
    writeJsonlSession('/proj/a', 'sess-A', [
      { type: 'user', cwd: '/proj/a', timestamp: '2026-05-13T09:00:00Z', uuid: 'u', message: { role: 'user', content: '첫 메시지' } }
    ])
    svc.setCustomTitle('sess-A', '내 이름')
    svc.setStarred('sess-A', true)
    const list = await svc.listSessions('/proj/a')
    expect(list[0].customTitle).toBe('내 이름')
    expect(list[0].starred).toBe(true)
  })

  it('cwd 의 프로젝트 디렉토리 없으면 빈 배열', async () => {
    expect(await svc.listSessions('/never-exists')).toEqual([])
  })

  it('JSON parse 실패 라인은 skip', async () => {
    const dir = join(projectsRoot, encodeCwd('/proj/a'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 's.jsonl'),
      'broken-line\n' + JSON.stringify({ type: 'user', cwd: '/proj/a', timestamp: '2026-05-13T09:00:00Z', message: { role: 'user', content: 'ok' } }),
      'utf8'
    )
    const list = await svc.listSessions('/proj/a')
    expect(list).toHaveLength(1)
  })
})

describe('ClaudeSessionService.loadSession', () => {
  it('user/assistant 메시지 시간순 반환', async () => {
    writeJsonlSession('/proj/a', 'sess-A', [
      { type: 'user', cwd: '/proj/a', timestamp: '2026-05-13T09:00:00Z', uuid: 'u1', message: { role: 'user', content: '질문' } },
      { type: 'assistant', timestamp: '2026-05-13T09:00:01Z', uuid: 'a1', message: { role: 'assistant', content: '답변' } }
    ])
    const messages = await svc.loadSession('sess-A', '/proj/a')
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('user')
    expect(messages[0].text).toBe('질문')
    expect(messages[1].role).toBe('assistant')
  })

  it('assistant 메시지가 여러 line 으로 쪼개진 경우 합침', async () => {
    writeJsonlSession('/proj/a', 's', [
      { type: 'assistant', timestamp: '2026-05-13T09:00:01Z', uuid: 'a1', message: { role: 'assistant', content: '안녕' } },
      { type: 'assistant', timestamp: '2026-05-13T09:00:02Z', uuid: 'a1', message: { role: 'assistant', content: ', 반갑습니다' } }
    ])
    const messages = await svc.loadSession('s', '/proj/a')
    expect(messages).toHaveLength(1)
    expect(messages[0].text).toBe('안녕, 반갑습니다')
  })

  it('text 블록 + tool_use 섞인 content', async () => {
    writeJsonlSession('/proj/a', 's', [
      { type: 'assistant', uuid: 'a1', message: { role: 'assistant', content: [
        { type: 'tool_use', name: 'X' },
        { type: 'text', text: '결과는' }
      ] } }
    ])
    const messages = await svc.loadSession('s', '/proj/a')
    expect(messages[0].text).toBe('결과는')
  })

  it('파일 없으면 빈 배열', async () => {
    expect(await svc.loadSession('absent', '/proj/x')).toEqual([])
  })

  it('빈 텍스트 메시지는 skip', async () => {
    writeJsonlSession('/proj/a', 's', [
      { type: 'user', uuid: 'u1', message: { role: 'user', content: '' } },
      { type: 'user', uuid: 'u2', message: { role: 'user', content: '실제' } }
    ])
    const messages = await svc.loadSession('s', '/proj/a')
    expect(messages.map((m) => m.text)).toEqual(['실제'])
  })
})
