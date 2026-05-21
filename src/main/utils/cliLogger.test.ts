import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const tmpDir = mkdtempSync(join(tmpdir(), 'clauday-cli-logger-test-'))

vi.mock('electron', () => ({
  app: {
    getPath: (key: string): string => {
      if (key === 'userData') return tmpDir
      return tmpDir
    }
  }
}))

import { startCliCall, recordCliCall, readRecentCliLogs, getCliLogPath } from './cliLogger'

beforeEach(() => {
  const p = getCliLogPath()
  if (existsSync(p)) rmSync(p)
})

describe('cliLogger', () => {
  it('startCliCall → complete 한 라운드 기록', () => {
    const ctx = startCliCall({ feature: 'briefing', bin: '/usr/local/bin/claude', argv: ['-p', '--model', 'opus'], prompt: '오늘 무엇을 해야할까' })
    ctx.appendStdout('hello')
    ctx.appendStderr('warning')
    ctx.complete({ exitCode: 0 })

    const logs = readRecentCliLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].feature).toBe('briefing')
    expect(logs[0].exitCode).toBe(0)
    expect(logs[0].stdoutHead).toBe('hello')
    expect(logs[0].stderrHead).toBe('warning')
    expect(logs[0].promptHead).toBe('오늘 무엇을 해야할까')
  })

  it('prompt 가 500 자 넘으면 promptHead 는 잘리고 promptLength 는 원본', () => {
    const long = 'A'.repeat(1000)
    const ctx = startCliCall({ feature: 'ask', bin: 'claude', argv: ['-p'], prompt: long })
    ctx.complete({ exitCode: 0 })
    const [entry] = readRecentCliLogs()
    expect(entry.promptHead.length).toBe(500)
    expect(entry.promptLength).toBe(1000)
  })

  it('argv 요약에서 --append-system-prompt 의 큰 값은 길이만', () => {
    const huge = 'X'.repeat(5000)
    const ctx = startCliCall({
      feature: 'ask',
      bin: 'claude',
      argv: ['-p', '--append-system-prompt', huge, '--model', 'opus'],
      prompt: 'hi'
    })
    ctx.complete({ exitCode: 0 })
    const [entry] = readRecentCliLogs()
    expect(entry.argvSummary).toContain('--append-system-prompt')
    expect(entry.argvSummary).toContain('<5000 chars>')
    expect(entry.argvSummary).not.toContain(huge)
  })

  it('ring buffer — 50건 넘으면 오래된 것부터 삭제', () => {
    for (let i = 0; i < 60; i++) {
      recordCliCall({
        feature: `f${i}`,
        bin: 'claude',
        argvSummary: '',
        promptHead: '',
        promptLength: 0,
        exitCode: 0,
        stdoutHead: '',
        stdoutLength: 0,
        stderrHead: '',
        stderrLength: 0,
        durationMs: 0
      })
    }
    const path = getCliLogPath()
    const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean)
    expect(lines.length).toBe(50)
    const first = JSON.parse(lines[0])
    const last = JSON.parse(lines[lines.length - 1])
    expect(first.feature).toBe('f10')
    expect(last.feature).toBe('f59')
  })

  it('errorMessage 기록', () => {
    const ctx = startCliCall({ feature: 'briefing', bin: 'claude', argv: [], prompt: null })
    ctx.complete({ exitCode: 1, errorMessage: 'spawn failed' })
    const [entry] = readRecentCliLogs()
    expect(entry.errorMessage).toBe('spawn failed')
    expect(entry.exitCode).toBe(1)
  })

  it('stdout 누적은 2KB 에서 잘림', () => {
    const ctx = startCliCall({ feature: 'ask', bin: 'claude', argv: [], prompt: null })
    for (let i = 0; i < 100; i++) ctx.appendStdout('X'.repeat(50))  // 5000 chars
    ctx.complete({ exitCode: 0 })
    const [entry] = readRecentCliLogs()
    expect(entry.stdoutHead.length).toBeLessThanOrEqual(2048 + 50)  // 마지막 append 가 한계 직후 추가될 수 있음
  })
})
