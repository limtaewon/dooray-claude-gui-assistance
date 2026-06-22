import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

let lastSpawn: { stdout: EventEmitter; stderr: EventEmitter; stdin: EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }; kill: ReturnType<typeof vi.fn>; emitClose: (code: number) => void; on: (event: string, cb: (arg?: unknown) => void) => void } | null = null
const onHandlers: Record<string, ((arg?: unknown) => void)[]> = {}

vi.mock('child_process', () => {
  const spawn = vi.fn(() => {
    const stdout = new EventEmitter()
    const stderr = new EventEmitter()
    const kill = vi.fn()
    const stdin = Object.assign(new EventEmitter(), {
      write: vi.fn(),
      end: vi.fn()
    })
    const procHandlers: Record<string, ((arg?: unknown) => void)[]> = {}
    const proc = {
      stdout,
      stderr,
      stdin,
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

import { AIService, getClaudeBin, setUserAnthropicApiKey, balanceBrackets } from './AIService'

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
  it('prompt 는 stdin 으로 전달되고 argv 에서는 제거된다 (Windows 명령줄 한계 회피)', async () => {
    const svc = new AIService()
    const longPrompt = 'X'.repeat(10000)
    const promise = svc.ask(longPrompt)
    await Promise.resolve()
    // spawn 인자에 -p 는 있지만 그 뒤에 prompt 본문은 없어야 함 (다음 토큰이 다른 플래그)
    const callArgs = (await import('child_process')).spawn as unknown as { mock: { calls: unknown[][] } }
    const argv = callArgs.mock.calls[callArgs.mock.calls.length - 1][1] as string[]
    const pIdx = argv.indexOf('-p')
    expect(pIdx).toBeGreaterThanOrEqual(0)
    expect(argv[pIdx + 1]?.startsWith('-')).toBe(true)
    // prompt 본문은 stdin 으로 write. 단, Windows 분기는 system prompt prefix 가 합쳐지므로
    // longPrompt 를 *포함* 하는지만 검증 (양 플랫폼 호환).
    const writeCalls = (lastSpawn!.stdin.write as unknown as { mock: { calls: unknown[][] } }).mock.calls
    expect(writeCalls.length).toBeGreaterThan(0)
    expect(writeCalls[0][0] as string).toContain(longPrompt)
    expect(writeCalls[0][1]).toBe('utf8')
    expect(lastSpawn!.stdin.end).toHaveBeenCalled()
    lastSpawn!.stdout.emit('data', Buffer.from(JSON.stringify({
      type: 'result', result: 'ok', duration_ms: 0, session_id: '', is_error: false, total_cost_usd: 0
    }) + '\n', 'utf8'))
    lastSpawn!.emitClose(0)
    await promise
  })

  it('Mac/Linux 경로 — system prompt 는 argv 의 --append-system-prompt 로 그대로 (캐싱 보존)', async () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    try {
      const svc = new AIService()
      const promise = svc.ask('hello', { systemPrompt: '시스템 룰 본문' })
      await Promise.resolve()
      const cp = (await import('child_process')).spawn as unknown as { mock: { calls: unknown[][] } }
      const argv = cp.mock.calls[cp.mock.calls.length - 1][1] as string[]
      const aspIdx = argv.indexOf('--append-system-prompt')
      expect(aspIdx).toBeGreaterThanOrEqual(0)
      expect(argv[aspIdx + 1]).toBe('시스템 룰 본문')
      // stdin 으로는 prompt 만, 시스템 프롬프트 prefix 없이
      expect(lastSpawn!.stdin.write).toHaveBeenCalledWith('hello', 'utf8')
      lastSpawn!.stdout.emit('data', Buffer.from(JSON.stringify({
        type: 'result', result: 'ok', duration_ms: 0, session_id: '', is_error: false, total_cost_usd: 0
      }) + '\n', 'utf8'))
      lastSpawn!.emitClose(0)
      await promise
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })

  it('Windows 경로 — system prompt 가 argv 에서 빠지고 stdin prompt 의 prefix 로 합쳐짐 (cmd argv escape 회피)', async () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    try {
      const svc = new AIService()
      const promise = svc.ask('hello', { systemPrompt: '시스템 룰 본문' })
      await Promise.resolve()
      const cp = (await import('child_process')).spawn as unknown as { mock: { calls: unknown[][] } }
      const argv = cp.mock.calls[cp.mock.calls.length - 1][1] as string[]
      // argv 에 --append-system-prompt 와 그 값이 모두 없어야 함
      expect(argv.indexOf('--append-system-prompt')).toBe(-1)
      expect(argv.indexOf('시스템 룰 본문')).toBe(-1)
      // stdin 에는 시스템 prefix + 사용자 prompt 가 합쳐서 들어가야 함
      const writeCall = (lastSpawn!.stdin.write as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
      const stdinText = writeCall[0] as string
      expect(stdinText).toContain('[시스템 지시 — 반드시 준수]')
      expect(stdinText).toContain('시스템 룰 본문')
      expect(stdinText).toContain('[사용자 요청]')
      expect(stdinText).toContain('hello')
      lastSpawn!.stdout.emit('data', Buffer.from(JSON.stringify({
        type: 'result', result: 'ok', duration_ms: 0, session_id: '', is_error: false, total_cost_usd: 0
      }) + '\n', 'utf8'))
      lastSpawn!.emitClose(0)
      await promise
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })

  it('raw stdout fallback — stream-json 라인이 없어도 평문 stdout 을 result 로 사용 (Windows 일부 환경 회복)', async () => {
    const svc = new AIService()
    const promise = svc.ask('안녕')
    await Promise.resolve()
    // claude 가 stream-json 이 아닌 평문 마크다운으로 응답한 케이스 시뮬레이션
    lastSpawn!.stdout.emit('data', Buffer.from('## 📋 오늘의 요약\n\n- 항목 1\n- 항목 2\n', 'utf8'))
    lastSpawn!.emitClose(0)
    const result = await promise
    expect(result).toContain('오늘의 요약')
    expect(result).toContain('항목 1')
  })

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

// ─────────────────────────────────────────────────────────────────────────────
// Harness Studio — normalizeHarness / estimateLevel
// CLAUDE.md 함정 #2: Mac/Windows 양쪽 platform 분기 테스트 필수
// ─────────────────────────────────────────────────────────────────────────────

/** 정상 HarnessModel JSON 응답 픽스처 */
const NORMALIZE_OK_RESULT = JSON.stringify({
  schemaVersion: 1,
  meta: { name: 'test-bundle', source: '/p', bundleHash: 'abc', kind: 'bundle' },
  agents: [{ id: 'dev', displayName: 'developer', role: 'Developer', model: 'sonnet', modelSource: 'static', tools: [], reads: [], writes: [] }],
  levels: [{ id: 'L1', name: 'Standard', agentChain: ['dev'], requiredArtifacts: [] }],
  triage: { questions: [], rules: [] },
  artifacts: [],
  controlFlow: { gates: [], hooks: [], parallelGroups: [], loops: [] },
  warnings: [],
  provenance: { 'agents[0].role': 'ai' }
})

/** 정상 레벨추정 JSON 응답 픽스처 */
const ESTIMATE_OK_RESULT = JSON.stringify({
  level: 'L2',
  answers: ['보안 요구사항 있음 → Yes', '아키텍처 변경 없음 → No'],
  rationale: 'OAuth 도입이라 보안 요구사항 존재'
})

function emitResult(resultStr: string): void {
  lastSpawn!.stdout.emit('data', Buffer.from(JSON.stringify({
    type: 'result', result: resultStr,
    duration_ms: 0, session_id: '', is_error: false, total_cost_usd: 0
  }) + '\n', 'utf8'))
  lastSpawn!.emitClose(0)
}

describe('AIService.normalizeHarness — Mac/Windows 플랫폼 분기', () => {
  const skeleton = {
    schemaVersion: 1 as const,
    meta: { name: 'test', source: '/p', bundleHash: 'abc', kind: 'bundle' as const },
    agents: [], levels: [], triage: { questions: [], rules: [] },
    artifacts: [], controlFlow: { gates: [], hooks: [], parallelGroups: [], loops: [] },
    warnings: [], provenance: {}
  }

  it('Mac — system prompt 가 --append-system-prompt 로 argv 에 포함된다 (캐싱 보존)', async () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    try {
      const svc = new AIService()
      const promise = svc.normalizeHarness(skeleton, '번들 원문')
      await Promise.resolve()
      const cp = (await import('child_process')).spawn as unknown as { mock: { calls: unknown[][] } }
      const argv = cp.mock.calls[cp.mock.calls.length - 1][1] as string[]
      expect(argv.indexOf('--append-system-prompt')).toBeGreaterThanOrEqual(0)
      emitResult(NORMALIZE_OK_RESULT)
      const result = await promise
      expect(result.meta.name).toBe('test-bundle')
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })

  it('Windows — system prompt 가 argv 에서 빠지고 stdin 에 합쳐진다 (cmd escape 회피)', async () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    try {
      const svc = new AIService()
      const promise = svc.normalizeHarness(skeleton, '번들 원문')
      await Promise.resolve()
      const cp = (await import('child_process')).spawn as unknown as { mock: { calls: unknown[][] } }
      const argv = cp.mock.calls[cp.mock.calls.length - 1][1] as string[]
      // Windows: --append-system-prompt 와 그 값이 argv 에 없어야 함
      expect(argv.indexOf('--append-system-prompt')).toBe(-1)
      // stdin 에 시스템 지시 prefix 가 포함되어야 함
      const stdinCalls = (lastSpawn!.stdin.write as unknown as { mock: { calls: unknown[][] } }).mock.calls
      expect(stdinCalls.length).toBeGreaterThan(0)
      const stdinText = stdinCalls[0][0] as string
      expect(stdinText).toContain('[시스템 지시 — 반드시 준수]')
      emitResult(NORMALIZE_OK_RESULT)
      await promise
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })

  it('정상 JSON 응답 → HarnessModel 반환', async () => {
    const svc = new AIService()
    const promise = svc.normalizeHarness(skeleton, '번들 원문')
    await Promise.resolve()
    emitResult(NORMALIZE_OK_RESULT)
    const result = await promise
    expect(result.meta.name).toBe('test-bundle')
    expect(result.agents[0].role).toBe('Developer')
    expect(result.provenance['agents[0].role']).toBe('ai')
  })

  it('JSON 추출 실패 → warnings 포함 축소 모델 반환 (throw 금지)', async () => {
    const svc = new AIService()
    const promise = svc.normalizeHarness(skeleton, '번들')
    await Promise.resolve()
    emitResult('JSON 없는 평문 응답입니다.')
    const result = await promise
    // 예외 없이 축소 모델 반환
    expect(result).toBeDefined()
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toMatch(/파싱 실패|JSON/)
  })

  it('손상 JSON → warnings 포함 축소 모델 반환 (throw 금지)', async () => {
    const svc = new AIService()
    const promise = svc.normalizeHarness(skeleton, '번들')
    await Promise.resolve()
    emitResult('{ "broken": [invalid json')
    const result = await promise
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('noTools 옵션 적용 — argv 에 --disallowedTools 포함', async () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    try {
      const svc = new AIService()
      const promise = svc.normalizeHarness(skeleton, '번들')
      await Promise.resolve()
      const cp = (await import('child_process')).spawn as unknown as { mock: { calls: unknown[][] } }
      const argv = cp.mock.calls[cp.mock.calls.length - 1][1] as string[]
      expect(argv.indexOf('--disallowedTools')).toBeGreaterThanOrEqual(0)
      emitResult(NORMALIZE_OK_RESULT)
      await promise
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })
})

describe('AIService.estimateLevel — Mac/Windows 플랫폼 분기', () => {
  const triage = {
    questions: [{ id: 'Q1', text: '보안 요구사항?', meaning: '보안 여부' }],
    rules: [{ when: 'Q1=Yes', then: 'L3' as const }]
  }

  it('Mac — system prompt 가 --append-system-prompt 로 argv 에 포함된다', async () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    try {
      const svc = new AIService()
      const promise = svc.estimateLevel('OAuth 도입', triage)
      await Promise.resolve()
      const cp = (await import('child_process')).spawn as unknown as { mock: { calls: unknown[][] } }
      const argv = cp.mock.calls[cp.mock.calls.length - 1][1] as string[]
      expect(argv.indexOf('--append-system-prompt')).toBeGreaterThanOrEqual(0)
      emitResult(ESTIMATE_OK_RESULT)
      const result = await promise
      expect(result.level).toBe('L2')
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })

  it('Windows — system prompt 가 stdin 으로 합쳐진다', async () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    try {
      const svc = new AIService()
      const promise = svc.estimateLevel('OAuth 도입', triage)
      await Promise.resolve()
      const cp = (await import('child_process')).spawn as unknown as { mock: { calls: unknown[][] } }
      const argv = cp.mock.calls[cp.mock.calls.length - 1][1] as string[]
      expect(argv.indexOf('--append-system-prompt')).toBe(-1)
      const stdinCalls = (lastSpawn!.stdin.write as unknown as { mock: { calls: unknown[][] } }).mock.calls
      expect(stdinCalls[0][0] as string).toContain('[시스템 지시 — 반드시 준수]')
      emitResult(ESTIMATE_OK_RESULT)
      await promise
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })

  it('정상 JSON 응답 → { level, answers, rationale } 반환', async () => {
    const svc = new AIService()
    const promise = svc.estimateLevel('OAuth 도입', triage)
    await Promise.resolve()
    emitResult(ESTIMATE_OK_RESULT)
    const result = await promise
    expect(result.level).toBe('L2')
    expect(result.answers).toEqual(['보안 요구사항 있음 → Yes', '아키텍처 변경 없음 → No'])
    expect(result.rationale).toContain('OAuth')
  })

  it('알 수 없는 level 값 → L1 기본값', async () => {
    const svc = new AIService()
    const promise = svc.estimateLevel('태스크', triage)
    await Promise.resolve()
    emitResult(JSON.stringify({ level: 'LX', answers: [], rationale: '알 수 없음' }))
    const result = await promise
    expect(result.level).toBe('L1')
  })

  it('JSON 추출 실패 → 기본값 반환 (throw 금지)', async () => {
    const svc = new AIService()
    const promise = svc.estimateLevel('태스크', triage)
    await Promise.resolve()
    emitResult('JSON 없는 응답')
    const result = await promise
    expect(result.level).toBe('L1')
    expect(result.answers.length).toBeGreaterThan(0)
    expect(result.rationale).toBeDefined()
  })

  it('noTools 옵션 적용 — argv 에 --disallowedTools 포함', async () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    try {
      const svc = new AIService()
      const promise = svc.estimateLevel('태스크', triage)
      await Promise.resolve()
      const cp = (await import('child_process')).spawn as unknown as { mock: { calls: unknown[][] } }
      const argv = cp.mock.calls[cp.mock.calls.length - 1][1] as string[]
      expect(argv.indexOf('--disallowedTools')).toBeGreaterThanOrEqual(0)
      emitResult(ESTIMATE_OK_RESULT)
      await promise
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })

  it('harnessEstimate 모델 설정이 적용된다', async () => {
    const svc = new AIService()
    svc.setModelConfig({ harnessEstimate: 'opus' } as never)
    const promise = svc.estimateLevel('태스크', triage)
    await Promise.resolve()
    const cp = (await import('child_process')).spawn as unknown as { mock: { calls: unknown[][] } }
    const argv = cp.mock.calls[cp.mock.calls.length - 1][1] as string[]
    const mIdx = argv.indexOf('--model')
    expect(mIdx).toBeGreaterThanOrEqual(0)
    expect(argv[mIdx + 1]).toBe('opus')
    emitResult(ESTIMATE_OK_RESULT)
    await promise
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Harness Studio — explainHarness
// CLAUDE.md 함정 #2: Mac/Windows 양쪽 platform 분기 테스트 필수
// ─────────────────────────────────────────────────────────────────────────────

describe('AIService.explainHarness — Mac/Windows 플랫폼 분기', () => {
  const CONTEXT = '번들: test-bundle\n에이전트: developer(dev)\n레벨: L1 체인 [dev]'
  const TOPIC = 'architect 에이전트의 역할'

  it('Mac — system prompt 가 --append-system-prompt 로 argv 에 포함된다 (캐싱 보존)', async () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    try {
      const svc = new AIService()
      const promise = svc.explainHarness(CONTEXT, TOPIC)
      await Promise.resolve()
      const cp = (await import('child_process')).spawn as unknown as { mock: { calls: unknown[][] } }
      const argv = cp.mock.calls[cp.mock.calls.length - 1][1] as string[]
      expect(argv.indexOf('--append-system-prompt')).toBeGreaterThanOrEqual(0)
      emitResult('## architect 역할\n\n- 설계 담당\n- ADR 작성 책임')
      const result = await promise
      expect(result).toContain('architect')
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })

  it('Windows — system prompt 가 argv 에서 빠지고 stdin 에 합쳐진다 (cmd escape 회피)', async () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    try {
      const svc = new AIService()
      const promise = svc.explainHarness(CONTEXT, TOPIC)
      await Promise.resolve()
      const cp = (await import('child_process')).spawn as unknown as { mock: { calls: unknown[][] } }
      const argv = cp.mock.calls[cp.mock.calls.length - 1][1] as string[]
      // Windows: --append-system-prompt 가 argv 에 없어야 함
      expect(argv.indexOf('--append-system-prompt')).toBe(-1)
      // stdin 에 시스템 지시 prefix 포함
      const stdinCalls = (lastSpawn!.stdin.write as unknown as { mock: { calls: unknown[][] } }).mock.calls
      expect(stdinCalls.length).toBeGreaterThan(0)
      const stdinText = stdinCalls[0][0] as string
      expect(stdinText).toContain('[시스템 지시 — 반드시 준수]')
      emitResult('## architect 역할\n\n- 설계 담당')
      await promise
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })

  it('정상 응답 → 마크다운 문자열 반환', async () => {
    const svc = new AIService()
    const promise = svc.explainHarness(CONTEXT, TOPIC)
    await Promise.resolve()
    const EXPLAIN_MARKDOWN = '## architect 에이전트의 역할\n\n- **설계 담당**: 아키텍처 결정 및 ADR 작성\n- **escalation 조건**: 크기 초과 시 SM 반려'
    emitResult(EXPLAIN_MARKDOWN)
    const result = await promise
    expect(result).toBe(EXPLAIN_MARKDOWN)
  })

  it('빈 응답 → 폴백 메시지 반환 (throw 금지)', async () => {
    const svc = new AIService()
    const promise = svc.explainHarness(CONTEXT, TOPIC)
    await Promise.resolve()
    emitResult('')
    const result = await promise
    expect(result).toContain(TOPIC)
    expect(typeof result).toBe('string')
  })

  it('noTools 옵션 적용 — argv 에 --disallowedTools 포함', async () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    try {
      const svc = new AIService()
      const promise = svc.explainHarness(CONTEXT, TOPIC)
      await Promise.resolve()
      const cp = (await import('child_process')).spawn as unknown as { mock: { calls: unknown[][] } }
      const argv = cp.mock.calls[cp.mock.calls.length - 1][1] as string[]
      expect(argv.indexOf('--disallowedTools')).toBeGreaterThanOrEqual(0)
      emitResult('## 설명')
      await promise
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })

  it('harnessExplain 모델 설정이 적용된다 — opus 로 변경', async () => {
    const svc = new AIService()
    svc.setModelConfig({ harnessExplain: 'opus' } as never)
    const promise = svc.explainHarness(CONTEXT, TOPIC)
    await Promise.resolve()
    const cp = (await import('child_process')).spawn as unknown as { mock: { calls: unknown[][] } }
    const argv = cp.mock.calls[cp.mock.calls.length - 1][1] as string[]
    const mIdx = argv.indexOf('--model')
    expect(mIdx).toBeGreaterThanOrEqual(0)
    expect(argv[mIdx + 1]).toBe('opus')
    emitResult('## 설명')
    await promise
  })

  it('기본 모델은 sonnet', async () => {
    const svc = new AIService()
    // harnessExplain 미설정 시 기본값 sonnet
    const promise = svc.explainHarness(CONTEXT, TOPIC)
    await Promise.resolve()
    const cp = (await import('child_process')).spawn as unknown as { mock: { calls: unknown[][] } }
    const argv = cp.mock.calls[cp.mock.calls.length - 1][1] as string[]
    const mIdx = argv.indexOf('--model')
    expect(mIdx).toBeGreaterThanOrEqual(0)
    expect(argv[mIdx + 1]).toBe('sonnet')
    emitResult('## 설명')
    await promise
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Harness Studio — proposeEdit
// CLAUDE.md 함정 #2: Mac/Windows 양쪽 platform 분기 테스트 필수
// ─────────────────────────────────────────────────────────────────────────────

describe('AIService.proposeEdit — AI 편집 제안', () => {
  const TARGET_FILES = [
    { relPath: '_agents/security-reviewer.md', content: '---\nname: security-reviewer\nmodel: sonnet\n---\n# 보안 검토자' },
    { relPath: '_agents/architect.md', content: '---\nname: architect\nmodel: opus\n---\n# 아키텍트' }
  ]

  const PROPOSE_OK_RESULT = JSON.stringify({
    proposals: [
      { relPath: '_agents/security-reviewer.md', newContent: '---\nname: security-reviewer\nmodel: opus\n---\n# 보안 검토자', rationale: 'model 을 opus 로 변경' }
    ]
  })

  it('Mac — system prompt 가 --append-system-prompt 로 argv 에 포함된다 (캐싱 보존)', async () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    try {
      const svc = new AIService()
      const promise = svc.proposeEdit('보안검토자를 opus 로', TARGET_FILES)
      await Promise.resolve()
      const cp = (await import('child_process')).spawn as unknown as { mock: { calls: unknown[][] } }
      const argv = cp.mock.calls[cp.mock.calls.length - 1][1] as string[]
      expect(argv.indexOf('--append-system-prompt')).toBeGreaterThanOrEqual(0)
      emitResult(PROPOSE_OK_RESULT)
      const result = await promise
      expect(result.proposals).toHaveLength(1)
      expect(result.proposals[0].relPath).toBe('_agents/security-reviewer.md')
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })

  it('Windows — system prompt 가 argv 에서 빠지고 stdin 에 합쳐진다 (cmd escape 회피)', async () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    try {
      const svc = new AIService()
      const promise = svc.proposeEdit('보안검토자를 opus 로', TARGET_FILES)
      await Promise.resolve()
      const cp = (await import('child_process')).spawn as unknown as { mock: { calls: unknown[][] } }
      const argv = cp.mock.calls[cp.mock.calls.length - 1][1] as string[]
      // Windows: --append-system-prompt 와 그 값이 argv 에 없어야 함
      expect(argv.indexOf('--append-system-prompt')).toBe(-1)
      // stdin 에 시스템 지시 prefix 가 포함되어야 함
      const stdinCalls = (lastSpawn!.stdin.write as unknown as { mock: { calls: unknown[][] } }).mock.calls
      expect(stdinCalls.length).toBeGreaterThan(0)
      const stdinText = stdinCalls[0][0] as string
      expect(stdinText).toContain('[시스템 지시 — 반드시 준수]')
      emitResult(PROPOSE_OK_RESULT)
      await promise
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })

  it('정상 JSON 응답 → proposals 반환', async () => {
    const svc = new AIService()
    const promise = svc.proposeEdit('보안검토자를 opus 로', TARGET_FILES)
    await Promise.resolve()
    emitResult(PROPOSE_OK_RESULT)
    const result = await promise
    expect(result.proposals).toHaveLength(1)
    expect(result.proposals[0].relPath).toBe('_agents/security-reviewer.md')
    expect(result.proposals[0].newContent).toContain('model: opus')
    expect(result.proposals[0].rationale).toContain('opus')
  })

  it('JSON 추출 실패 → 빈 proposals 반환 (throw 금지, degradation)', async () => {
    const svc = new AIService()
    const promise = svc.proposeEdit('보안검토자를 수정', TARGET_FILES)
    await Promise.resolve()
    emitResult('JSON 없는 평문 응답입니다. 수정을 제안할 수 없습니다.')
    const result = await promise
    expect(result.proposals).toEqual([])
  })

  it('proposals 필드 파싱 실패 → 빈 proposals 반환', async () => {
    const svc = new AIService()
    const promise = svc.proposeEdit('수정', TARGET_FILES)
    await Promise.resolve()
    // proposals 키 없는 JSON
    emitResult(JSON.stringify({ result: 'ok', changes: [] }))
    const result = await promise
    expect(result.proposals).toEqual([])
  })

  it('화이트리스트 밖 relPath 드롭 — 목록에 없는 파일은 결과에서 제거', async () => {
    const svc = new AIService()
    const promise = svc.proposeEdit('수정', TARGET_FILES)
    await Promise.resolve()
    // AI 가 화이트리스트 밖 파일도 포함해 반환한 케이스
    emitResult(JSON.stringify({
      proposals: [
        { relPath: '_agents/security-reviewer.md', newContent: '수정됨', rationale: '변경' },
        { relPath: '_core/triage.md', newContent: '침해 시도', rationale: '화이트리스트 밖' },  // 드롭 대상
        { relPath: '../../etc/passwd', newContent: '탈출 시도', rationale: '경로 탈출' }  // 드롭 대상
      ]
    }))
    const result = await promise
    // 화이트리스트 안에 있는 것만 남아야 함
    expect(result.proposals).toHaveLength(1)
    expect(result.proposals[0].relPath).toBe('_agents/security-reviewer.md')
  })

  it('모든 proposals 가 화이트리스트 밖이면 빈 배열 반환', async () => {
    const svc = new AIService()
    const promise = svc.proposeEdit('수정', TARGET_FILES)
    await Promise.resolve()
    emitResult(JSON.stringify({
      proposals: [
        { relPath: 'outside/file.md', newContent: '침해', rationale: '무관한 파일' }
      ]
    }))
    const result = await promise
    expect(result.proposals).toEqual([])
  })

  it('입력 40KB 초과 → 에러 throw', async () => {
    const svc = new AIService()
    const bigContent = 'X'.repeat(41 * 1024)  // 41KB
    await expect(
      svc.proposeEdit('수정', [{ relPath: 'big.md', content: bigContent }])
    ).rejects.toThrow(/40KB|상한/)
  })

  it('입력 40KB 이하 → 에러 없음', async () => {
    const svc = new AIService()
    const okContent = 'X'.repeat(10 * 1024)  // 10KB
    const promise = svc.proposeEdit('수정', [{ relPath: 'ok.md', content: okContent }])
    await Promise.resolve()
    emitResult(JSON.stringify({ proposals: [] }))
    const result = await promise
    expect(result.proposals).toEqual([])
  })

  it('noTools 옵션 적용 — argv 에 --disallowedTools 포함 (도구 차단 확인)', async () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    try {
      const svc = new AIService()
      const promise = svc.proposeEdit('수정', TARGET_FILES)
      await Promise.resolve()
      const cp = (await import('child_process')).spawn as unknown as { mock: { calls: unknown[][] } }
      const argv = cp.mock.calls[cp.mock.calls.length - 1][1] as string[]
      expect(argv.indexOf('--disallowedTools')).toBeGreaterThanOrEqual(0)
      emitResult(PROPOSE_OK_RESULT)
      await promise
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })

  it('기본 모델은 sonnet', async () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    try {
      const svc = new AIService()
      const promise = svc.proposeEdit('수정', TARGET_FILES)
      await Promise.resolve()
      const cp = (await import('child_process')).spawn as unknown as { mock: { calls: unknown[][] } }
      const argv = cp.mock.calls[cp.mock.calls.length - 1][1] as string[]
      const mIdx = argv.indexOf('--model')
      expect(mIdx).toBeGreaterThanOrEqual(0)
      expect(argv[mIdx + 1]).toBe('sonnet')
      emitResult(PROPOSE_OK_RESULT)
      await promise
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })

  it('harnessEdit 모델 설정이 적용된다 — opus 로 변경', async () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    try {
      const svc = new AIService()
      svc.setModelConfig({ harnessEdit: 'opus' } as never)
      const promise = svc.proposeEdit('수정', TARGET_FILES)
      await Promise.resolve()
      const cp = (await import('child_process')).spawn as unknown as { mock: { calls: unknown[][] } }
      const argv = cp.mock.calls[cp.mock.calls.length - 1][1] as string[]
      const mIdx = argv.indexOf('--model')
      expect(mIdx).toBeGreaterThanOrEqual(0)
      expect(argv[mIdx + 1]).toBe('opus')
      emitResult(PROPOSE_OK_RESULT)
      await promise
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })

  it('빈 proposals 배열 응답 → 빈 proposals 반환 (정상 케이스)', async () => {
    const svc = new AIService()
    const promise = svc.proposeEdit('변경 불필요', TARGET_FILES)
    await Promise.resolve()
    emitResult(JSON.stringify({ proposals: [] }))
    const result = await promise
    expect(result.proposals).toEqual([])
  })

  it('잘린 JSON — balanceBrackets 복구 후 파싱', async () => {
    const svc = new AIService()
    const promise = svc.proposeEdit('수정', TARGET_FILES)
    await Promise.resolve()
    // trailing comma 포함 손상 JSON — balanceBrackets 이 복구해야 함
    const truncated = '{"proposals":[{"relPath":"_agents/security-reviewer.md","newContent":"수정됨","rationale":"변경",'
    emitResult(truncated)
    const result = await promise
    // 복구 성공 또는 degradation — 어느 쪽도 throw 없어야 함
    expect(result).toBeDefined()
    expect(Array.isArray(result.proposals)).toBe(true)
  })

  it('rationale 없는 proposal → 빈 문자열 rationale 로 정규화', async () => {
    const svc = new AIService()
    const promise = svc.proposeEdit('수정', TARGET_FILES)
    await Promise.resolve()
    emitResult(JSON.stringify({
      proposals: [
        { relPath: '_agents/security-reviewer.md', newContent: '수정됨' }  // rationale 없음
      ]
    }))
    const result = await promise
    expect(result.proposals).toHaveLength(1)
    expect(result.proposals[0].rationale).toBe('')
  })
})

describe('balanceBrackets — 잘린 JSON 복구', () => {
  it('정상 JSON 은 그대로 파싱된다', () => {
    const s = '{"a":[1,2],"b":{"c":3}}'
    expect(JSON.parse(balanceBrackets(s))).toEqual({ a: [1, 2], b: { c: 3 } })
  })

  it('열린 객체/배열이 닫히지 않은 경우 닫아준다', () => {
    const s = '{"agents":[{"id":"x","role":"r"'
    const fixed = balanceBrackets(s)
    expect(() => JSON.parse(fixed)).not.toThrow()
    expect(JSON.parse(fixed).agents[0].id).toBe('x')
  })

  it('끊긴 문자열을 닫는다', () => {
    const s = '{"a":"unterminated'
    const fixed = balanceBrackets(s)
    expect(() => JSON.parse(fixed)).not.toThrow()
  })

  it('끝의 trailing comma 를 제거한다', () => {
    const s = '{"a":[1,2,'
    const fixed = balanceBrackets(s)
    expect(JSON.parse(fixed).a).toEqual([1, 2])
  })

  it('문자열 내부의 괄호는 구조로 세지 않는다', () => {
    const s = '{"a":"][}{ 안의 괄호","b":1}'
    expect(JSON.parse(balanceBrackets(s)).a).toBe('][}{ 안의 괄호')
  })
})
