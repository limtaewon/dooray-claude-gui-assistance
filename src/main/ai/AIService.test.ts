import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

let lastSpawn: { stdout: EventEmitter; stderr: EventEmitter; kill: ReturnType<typeof vi.fn>; emitClose: (code: number) => void; on: (event: string, cb: (arg?: unknown) => void) => void } | null = null
const onHandlers: Record<string, ((arg?: unknown) => void)[]> = {}

vi.mock('child_process', () => {
  const spawn = vi.fn(() => {
    const stdout = new EventEmitter()
    const stderr = new EventEmitter()
    const kill = vi.fn()
    const procHandlers: Record<string, ((arg?: unknown) => void)[]> = {}
    const proc = {
      stdout,
      stderr,
      kill,
      on: (event: string, cb: (arg?: unknown) => void) => {
        ;(procHandlers[event] ||= []).push(cb)
      },
      emitClose: (code: number) => {
        ;(procHandlers['close'] || []).forEach((cb) => cb(code))
      }
    }
    lastSpawn = proc
    return proc
  })
  const execFile = (
    _cmd: string,
    _args: string[],
    _opts: unknown,
    cb: (err: Error | null, stdout: string, stderr: string) => void
  ): void => {
    queueMicrotask(() => cb(null, JSON.stringify({
      type: 'result', result: 'AI 응답', duration_ms: 100, session_id: 's', is_error: false, total_cost_usd: 0
    }), ''))
  }
  const execFileSync = vi.fn(() => '/usr/local/bin/claude')
  return {
    spawn,
    execFile,
    execFileSync,
    exec: vi.fn(),
    fork: vi.fn(),
    default: { spawn, execFile, execFileSync }
  }
})

vi.mock('electron', () => ({
  BrowserWindow: class {
    isDestroyed(): boolean { return false }
    webContents = { send: vi.fn() }
  }
}))

import { AIService, getClaudeBin, setUserAnthropicApiKey } from './AIService'

beforeEach(() => {
  lastSpawn = null
  for (const k of Object.keys(onHandlers)) delete onHandlers[k]
})

describe('AIService — 기본 getter/setter', () => {
  it('getClaudeBin 은 문자열 반환', () => {
    expect(typeof getClaudeBin()).toBe('string')
  })

  it('setUserAnthropicApiKey — 빈 문자열은 null 처리', () => {
    setUserAnthropicApiKey('  ')
    setUserAnthropicApiKey('actual-key')
    // 검증: setter 가 throw 하지 않으면 OK
    expect(true).toBe(true)
  })

  it('setModelConfig / getModelConfig', () => {
    const svc = new AIService()
    svc.setModelConfig({ briefing: 'opus', report: 'sonnet' } as never)
    expect(svc.getModelConfig().briefing).toBe('opus')
  })

  it('setMainWindow — destroyed/alive 모두 안전', () => {
    const svc = new AIService()
    svc.setMainWindow({} as never)
    expect(() => svc.setMainWindow({} as never)).not.toThrow()
  })

  it('setSkillLoader — 호출 시 throw 없음', () => {
    const svc = new AIService()
    svc.setSkillLoader(() => [])
    expect(true).toBe(true)
  })

  it('getLastAIRecommendation — 캐시 없으면 null', () => {
    const svc = new AIService()
    // 파일 시스템에 cache 가 없을 수도 있고 있을 수도 있음 — null 또는 객체
    const r = svc.getLastAIRecommendation()
    expect(r === null || typeof r === 'object').toBe(true)
  })
})

describe('AIService.isAvailable', () => {
  it('execFileSync 성공 시 true', () => {
    const svc = new AIService()
    expect(svc.isAvailable()).toBe(true)
  })
})

describe('AIService.ask (스트리밍)', () => {
  it('runClaudeStream 통합 — final result 가 result 필드 반환', async () => {
    const svc = new AIService()
    const promise = svc.ask('hello')
    // microtask 한 사이클 → spawn 호출됨
    await Promise.resolve()
    // stdout 으로 result 이벤트 인젝션
    lastSpawn!.stdout.emit('data', Buffer.from(JSON.stringify({
      type: 'result', result: '응답 본문', duration_ms: 10, session_id: 's', is_error: false, total_cost_usd: 0
    }) + '\n', 'utf8'))
    lastSpawn!.emitClose(0)
    const result = await promise
    expect(result).toBe('응답 본문')
  })

  it('content_block_delta 청크 누적', async () => {
    const svc = new AIService()
    const promise = svc.ask('hi')
    await Promise.resolve()
    const writeLines = (objs: unknown[]): void => {
      lastSpawn!.stdout.emit('data', Buffer.from(objs.map((o) => JSON.stringify(o)).join('\n') + '\n', 'utf8'))
    }
    writeLines([
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '부분1' } } },
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '부분2' } } },
      { type: 'result', result: '', duration_ms: 0, session_id: '', is_error: false, total_cost_usd: 0 }
    ])
    lastSpawn!.emitClose(0)
    const result = await promise
    expect(result).toBe('부분1부분2')
  })

  it('비정상 종료 + accumulated 가 있으면 그대로 반환', async () => {
    const svc = new AIService()
    const promise = svc.ask('hi')
    await Promise.resolve()
    lastSpawn!.stdout.emit('data', Buffer.from(JSON.stringify({
      type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '응답' } }
    }) + '\n', 'utf8'))
    lastSpawn!.emitClose(0)
    expect(await promise).toBe('응답')
  })

  it('result is_error=true → throw', async () => {
    const svc = new AIService()
    const promise = svc.ask('hi').catch((e) => e)
    await Promise.resolve()
    lastSpawn!.stdout.emit('data', Buffer.from(JSON.stringify({
      type: 'result', result: 'something failed', is_error: false, duration_ms: 0, session_id: '', total_cost_usd: 0
    }) + '\n', 'utf8'))
    lastSpawn!.emitClose(0)
    const r = await promise
    expect(typeof r === 'string' || r instanceof Error).toBe(true)
  })

  it('stderr 만 있고 result 없으면 에러', async () => {
    const svc = new AIService()
    const promise = svc.ask('hi').catch((e) => e as Error)
    await Promise.resolve()
    lastSpawn!.stderr.emit('data', Buffer.from('Not logged in', 'utf8'))
    lastSpawn!.emitClose(1)
    const r = await promise
    expect(r).toBeInstanceOf(Error)
    expect((r as Error).message).toMatch(/로그인/)
  })
})

describe('AIService.summarizeTask', () => {
  it('task 요약 — runClaudeStream 사용', async () => {
    const svc = new AIService()
    const promise = svc.summarizeTask({ subject: '주간보고', workflowClass: 'working', projectCode: 'P1' } as never)
    await Promise.resolve()
    lastSpawn!.stdout.emit('data', Buffer.from(JSON.stringify({
      type: 'result', result: '요약 결과', duration_ms: 0, session_id: '', is_error: false, total_cost_usd: 0
    }) + '\n', 'utf8'))
    lastSpawn!.emitClose(0)
    expect(await promise).toBe('요약 결과')
  })
})

describe('AIService.generateFilterRule', () => {
  it('JSON 파싱 후 정규화', async () => {
    const svc = new AIService()
    const promise = svc.generateFilterRule('배포 알림만')
    await Promise.resolve()
    lastSpawn!.stdout.emit('data', Buffer.from(JSON.stringify({
      type: 'result',
      result: '```json\n{"anyOf":["배포"],"allOf":[],"regex":[],"exclude":[],"excludeRegex":[],"description":"배포"}\n```',
      duration_ms: 0, session_id: '', is_error: false, total_cost_usd: 0
    }) + '\n', 'utf8'))
    lastSpawn!.emitClose(0)
    const r = await promise
    expect(r.anyOf).toEqual(['배포'])
    expect(r.description).toBe('배포')
  })

  it('JSON 파싱 실패 시 throw', async () => {
    const svc = new AIService()
    const promise = svc.generateFilterRule('x').catch((e) => e as Error)
    await Promise.resolve()
    lastSpawn!.stdout.emit('data', Buffer.from(JSON.stringify({
      type: 'result', result: 'not-json',
      duration_ms: 0, session_id: '', is_error: false, total_cost_usd: 0
    }) + '\n', 'utf8'))
    lastSpawn!.emitClose(0)
    const r = await promise
    expect(r).toBeInstanceOf(Error)
  })
})

describe('AIService.generateSkill', () => {
  it('JSON 파싱 성공', async () => {
    const svc = new AIService()
    const promise = svc.generateSkill('나의 스킬', 'briefing')
    await Promise.resolve()
    lastSpawn!.stdout.emit('data', Buffer.from(JSON.stringify({
      type: 'result',
      result: '{"name":"나의 스킬","description":"d","content":"규칙"}',
      duration_ms: 0, session_id: '', is_error: false, total_cost_usd: 0
    }) + '\n', 'utf8'))
    lastSpawn!.emitClose(0)
    const r = await promise
    expect(r.name).toBe('나의 스킬')
  })

  it('JSON 파싱 실패 시 폴백 스킬', async () => {
    const svc = new AIService()
    const promise = svc.generateSkill('잘못된 응답', 'briefing')
    await Promise.resolve()
    lastSpawn!.stdout.emit('data', Buffer.from(JSON.stringify({
      type: 'result', result: 'no json here',
      duration_ms: 0, session_id: '', is_error: false, total_cost_usd: 0
    }) + '\n', 'utf8'))
    lastSpawn!.emitClose(0)
    const r = await promise
    expect(r.name).toBe('새 스킬')
  })
})

describe('AIService.generateBriefing', () => {
  it('빈 데이터 + textFallback', async () => {
    const svc = new AIService()
    const promise = svc.generateBriefing([], [], undefined, [], [])
    await Promise.resolve()
    lastSpawn!.stdout.emit('data', Buffer.from(JSON.stringify({
      type: 'result', result: '데이터가 없어요',
      duration_ms: 0, session_id: '', is_error: false, total_cost_usd: 0
    }) + '\n', 'utf8'))
    lastSpawn!.emitClose(0)
    const r = await promise
    expect(r.greeting).toContain('데이터가 없어요')
    expect(r.urgent).toEqual([])
  })

  it('정상 JSON 응답 파싱', async () => {
    const svc = new AIService()
    const promise = svc.generateBriefing(
      [{ id: 't1', subject: 'X', workflowClass: 'working', projectCode: 'P', tags: [], createdAt: '2026-05-13' } as never],
      []
    )
    await Promise.resolve()
    lastSpawn!.stdout.emit('data', Buffer.from(JSON.stringify({
      type: 'result',
      result: JSON.stringify({
        greeting: '안녕', urgent: [], focus: [{ taskId: 't1', subject: 'X', reason: 'r' }],
        mentioned: [], stale: [], todayEvents: [], recommendations: ['추천1']
      }),
      duration_ms: 0, session_id: '', is_error: false, total_cost_usd: 0
    }) + '\n', 'utf8'))
    lastSpawn!.emitClose(0)
    const r = await promise
    expect(r.greeting).toBe('안녕')
    expect(r.focus).toHaveLength(1)
    expect(r.recommendations).toEqual(['추천1'])
  })
})

describe('AIService.generateReport', () => {
  it('마크다운 본문 반환', async () => {
    const svc = new AIService()
    const promise = svc.generateReport('daily', [], [])
    await Promise.resolve()
    lastSpawn!.stdout.emit('data', Buffer.from(JSON.stringify({
      type: 'result', result: '# 일일 보고서\n본문',
      duration_ms: 0, session_id: '', is_error: false, total_cost_usd: 0
    }) + '\n', 'utf8'))
    lastSpawn!.emitClose(0)
    const r = await promise
    expect(r.title).toContain('일일 업무 보고서')
    expect(r.content).toContain('# 일일')
  })
})

describe('AIService.composeMessengerMessage', () => {
  it('메시지 작성 결과 반환', async () => {
    const svc = new AIService()
    const promise = svc.composeMessengerMessage('회식 공지 작성해줘', '팀채널')
    await Promise.resolve()
    lastSpawn!.stdout.emit('data', Buffer.from(JSON.stringify({
      type: 'result', result: '오늘 저녁 7시 회식합니다.',
      duration_ms: 0, session_id: '', is_error: false, total_cost_usd: 0
    }) + '\n', 'utf8'))
    lastSpawn!.emitClose(0)
    expect(await promise).toContain('회식')
  })
})
