import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync, appendFileSync, existsSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { BotSocketLog } from './BotSocketLog'

let dir: string
let file: string
let log: BotSocketLog

const HOUR = 3_600_000

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bot-socket-log-'))
  file = join(dir, 'nested', 'bot-socket.jsonl')
  log = new BotSocketLog(file)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

describe('BotSocketLog.append / recent', () => {
  it('없는 디렉터리를 만들며 JSONL 로 기록', () => {
    log.append({ kind: 'state', detail: 'ACTIVE', t: 1000 })
    expect(existsSync(file)).toBe(true)
    expect(JSON.parse(readFileSync(file, 'utf8').trim())).toEqual({ t: 1000, kind: 'state', detail: 'ACTIVE' })
  })

  it('t 를 생략하면 현재 시각', () => {
    vi.useFakeTimers()
    vi.setSystemTime(5555)
    log.append({ kind: 'power', detail: 'hold' })
    vi.useRealTimers()
    expect(log.recent(0)[0].t).toBe(5555)
  })

  it('data 를 보존', () => {
    log.append({ kind: 'catch-up', detail: '2건', t: 1, data: { found: 2 } })
    expect(log.recent(0)[0].data).toEqual({ found: 2 })
  })

  it('recent 는 sinceMs 이상만 시간 오름차순(기록 순서)으로', () => {
    log.append({ kind: 'state', detail: 'A', t: 100 })
    log.append({ kind: 'state', detail: 'B', t: 200 })
    log.append({ kind: 'state', detail: 'C', t: 300 })
    expect(log.recent(200).map((e) => e.detail)).toEqual(['B', 'C'])
  })

  it('파일이 없으면 빈 배열', () => {
    expect(log.recent(0)).toEqual([])
  })

  it('깨진 줄·빈 줄·t 가 숫자가 아닌 줄은 무시하고 나머지는 읽는다', () => {
    log.append({ kind: 'state', detail: 'ACTIVE', t: 100 })
    appendFileSync(file, '{"t":200,"kind":"state","detai\n\n{"t":"x","kind":"state","detail":"Z"}\nnot json\n', 'utf8')
    log.append({ kind: 'state', detail: 'CLOSED', t: 300 })
    expect(log.recent(0).map((e) => e.detail)).toEqual(['ACTIVE', 'CLOSED'])
  })

  it('쓰기에 실패해도 throw 하지 않고 warn', () => {
    // 부모 경로가 파일이라 mkdir 이 실패한다
    writeFileSync(join(dir, 'blocker'), 'x')
    const bad = new BotSocketLog(join(dir, 'blocker', 'sub', 'log.jsonl'))
    expect(() => bad.append({ kind: 'state', detail: 'X' })).not.toThrow()
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('BotSocketLog.summary', () => {
  const NOW = 10 * 24 * HOUR

  it('비어 있으면 0 / null', () => {
    expect(log.summary(NOW)).toEqual({ disconnects24h: 0, lastCatchUp: null })
  })

  it('ACTIVE 에서 다른 상태로 떨어진 횟수만 센다', () => {
    const states = ['CONNECTING', 'ACTIVE', 'RECONNECTING', 'ACTIVE', 'ACTIVE', 'CLOSED', 'ACTIVE']
    states.forEach((detail, i) => log.append({ kind: 'state', detail, t: NOW - 2 * HOUR + i * 1000 }))
    // ACTIVE→RECONNECTING, ACTIVE→CLOSED = 2 (ACTIVE→ACTIVE 는 아님)
    expect(log.summary(NOW).disconnects24h).toBe(2)
  })

  it('24시간 밖 기록은 제외', () => {
    log.append({ kind: 'state', detail: 'ACTIVE', t: NOW - 30 * HOUR })
    log.append({ kind: 'state', detail: 'CLOSED', t: NOW - 29 * HOUR })
    expect(log.summary(NOW).disconnects24h).toBe(0)
  })

  it('가장 최근 catch-up 을 돌려준다', () => {
    log.append({ kind: 'catch-up', detail: '첫번째', t: NOW - 5 * HOUR })
    log.append({ kind: 'catch-up', detail: '두번째', t: NOW - 1 * HOUR })
    log.append({ kind: 'state', detail: 'ACTIVE', t: NOW - 30 * 60_000 })
    expect(log.summary(NOW).lastCatchUp?.detail).toBe('두번째')
  })

  it('state 가 아닌 항목은 끊김 판정에 영향 없음', () => {
    log.append({ kind: 'state', detail: 'ACTIVE', t: NOW - 3 * HOUR })
    log.append({ kind: 'power', detail: 'release', t: NOW - 2 * HOUR })
    log.append({ kind: 'state', detail: 'ACTIVE', t: NOW - 1 * HOUR })
    expect(log.summary(NOW).disconnects24h).toBe(0)
  })

  it('now 미지정이면 Date.now 기준', () => {
    log.append({ kind: 'state', detail: 'ACTIVE', t: Date.now() - 1000 })
    log.append({ kind: 'state', detail: 'CLOSED', t: Date.now() - 500 })
    expect(log.summary().disconnects24h).toBe(1)
  })
})

describe('BotSocketLog 회전', () => {
  it('1MB 를 넘으면 최근 2000줄만 남긴다', () => {
    // 2600줄 * ~500B ≈ 1.3MB 를 직접 깔아 두고 append 로 회전을 유발
    const lines = Array.from({ length: 2600 }, (_, i) => JSON.stringify({ t: i, kind: 'state', detail: 'x'.repeat(480) }))
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, lines.join('\n') + '\n', 'utf8')
    expect(statSync(file).size).toBeGreaterThan(1024 * 1024)

    log.append({ kind: 'state', detail: 'LAST', t: 99_999 })

    const kept = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim())
    expect(kept).toHaveLength(2000)
    expect(JSON.parse(kept[kept.length - 1]).detail).toBe('LAST')
    // 가장 오래된 줄이 버려졌다
    expect(JSON.parse(kept[0]).t).toBe(2600 - 1999)
    expect(statSync(file).size).toBeLessThan(1024 * 1024)
  })

  it('1MB 이하면 회전하지 않는다', () => {
    for (let i = 0; i < 50; i++) log.append({ kind: 'state', detail: 'A', t: i })
    expect(readFileSync(file, 'utf8').split('\n').filter(Boolean)).toHaveLength(50)
  })
})
