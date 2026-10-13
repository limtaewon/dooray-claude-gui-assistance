import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { dirname } from 'path'

export type BotSocketLogKind = 'state' | 'catch-up' | 'power'

export interface BotSocketLogEntry {
  /** epoch ms */
  t: number
  kind: BotSocketLogKind
  /** state: 연결 상태 / catch-up: 결과 요약 / power: 잠자기 방지 변화 */
  detail: string
  data?: Record<string, unknown>
}

/** 파일이 이보다 커지면 최근 줄만 남긴다 */
const MAX_BYTES = 1024 * 1024
const KEEP_LINES = 2000
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 봇 소켓 연결 이력(JSONL) — 잠자기·외출 중 @clauday 가 왜 안 됐는지 사후에 확인할 근거(기획 §5.8-3).
 * 지금까지는 콘솔에만 찍혀 끊김 여부를 알 수 없었다.
 */
export class BotSocketLog {
  constructor(private filePath: string) {}

  append(entry: Omit<BotSocketLogEntry, 't'> & { t?: number }): void {
    const line = JSON.stringify({ t: entry.t ?? Date.now(), kind: entry.kind, detail: entry.detail, data: entry.data })
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      appendFileSync(this.filePath, line + '\n', 'utf8')
      this.rotateIfLarge()
    } catch (err) {
      console.warn(`[BotSocketLog] 기록 실패 path=${this.filePath}:`, err)
    }
  }

  /** 최근 항목 (시간 오름차순) */
  recent(sinceMs: number): BotSocketLogEntry[] {
    if (!existsSync(this.filePath)) return []
    let raw: string
    try {
      raw = readFileSync(this.filePath, 'utf8')
    } catch (err) {
      console.warn(`[BotSocketLog] 읽기 실패 path=${this.filePath}:`, err)
      return []
    }
    const out: BotSocketLogEntry[] = []
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue
      try {
        const e = JSON.parse(line) as BotSocketLogEntry
        if (typeof e.t === 'number' && e.t >= sinceMs) out.push(e)
      } catch {
        // 쓰다 끊긴 줄 — 다음 줄부터 정상이라 건너뛴다
      }
    }
    return out
  }

  /** 최근 24시간 동안 ACTIVE 에서 다른 상태로 떨어진 횟수와 마지막 catch-up 결과 */
  summary(now = Date.now()): { disconnects24h: number; lastCatchUp: BotSocketLogEntry | null } {
    const entries = this.recent(now - DAY_MS)
    let disconnects = 0
    let prev: string | null = null
    let lastCatchUp: BotSocketLogEntry | null = null
    for (const e of entries) {
      if (e.kind === 'state') {
        if (prev === 'ACTIVE' && e.detail !== 'ACTIVE') disconnects++
        prev = e.detail
      } else if (e.kind === 'catch-up') {
        lastCatchUp = e
      }
    }
    return { disconnects24h: disconnects, lastCatchUp }
  }

  private rotateIfLarge(): void {
    if (statSync(this.filePath).size <= MAX_BYTES) return
    const lines = readFileSync(this.filePath, 'utf8').split('\n').filter((l) => l.trim())
    writeFileSync(this.filePath, lines.slice(-KEEP_LINES).join('\n') + '\n', 'utf8')
  }
}
