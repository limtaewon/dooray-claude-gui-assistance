import type { MessengerService } from '../../MessengerService'
import { formatElapsed } from './DoorayFormatter'
import { MESSAGE_PREFIX } from './ResultPublisher'

/** 같은 진행 메시지를 이보다 자주 고치지 않는다 — rate limit(초당 5) 보호 */
const MIN_UPDATE_INTERVAL_MS = 5_000
/** 단계 변화가 없어도 경과 시간을 갱신하는 주기 */
const HEARTBEAT_MS = 60_000

export interface ProgressTarget {
  replyChannelId: string
  progressLogId?: string | null
  startedAt: number
}

/**
 * 도구 이름 → 사람이 읽는 단계. 파일명·명령 같은 세부는 두레이에 내보내지 않는다(기획 §5.3).
 * Claude Code 2.1.296 실측: 대화형 세션에 할 일 목록 도구가 노출되지 않아 체크리스트를 데이터 소스로 쓸 수 없다.
 */
export function phaseOfTool(toolName: string): string {
  const mcp = /^mcp__([^_]+(?:[-_][^_]+)*?)__(.+)$/.exec(toolName)
  if (mcp) {
    const server = mcp[1].toLowerCase()
    const op = mcp[2].toLowerCase()
    // execute_select·execute_query 같은 조회 실행은 쓰기가 아니다
    const writes = /^(create|modify|update|send|delete|set|upload|add|move|join|leave|execute_(?!select|query)|drop_publish|drop_upload|drop_commit)/.test(op)
    if (server.includes('dooray')) return writes ? '두레이 작성 중' : '두레이 조회 중'
    if (/mysql|clickhouse|neon|schema|db/.test(server)) return writes ? 'DB 변경 중' : 'DB 조회 중'
    if (server.includes('grafana') || server.includes('langfuse')) return '모니터링 조회 중'
    if (server.includes('drop')) return 'Drop 작업 중'
    return writes ? '외부 도구로 작성 중' : '외부 도구 조회 중'
  }
  switch (toolName) {
    case 'Read':
    case 'Grep':
    case 'Glob':
    case 'LS':
      return '코드 확인 중'
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return '파일 수정 중'
    case 'Bash':
      return '명령 실행 중'
    case 'WebFetch':
    case 'WebSearch':
      return '웹 검색 중'
    case 'Task':
    case 'Agent':
      return '하위 작업 진행 중'
    case 'Skill':
      return '스킬 적용 중'
    default:
      return '작업 중'
  }
}

interface ChannelProgress {
  target: ProgressTarget
  phase: string
  lastSentAt: number
  lastText: string
  pendingTimer: ReturnType<typeof setTimeout> | null
  heartbeat: ReturnType<typeof setInterval> | null
  /** 보내는 중인 갱신 — 완료 표기가 늦게 도착한 "작업 중" 에 덮이지 않도록 stop 이 기다린다 */
  inflight: Promise<void> | null
}

/**
 * 진행 메시지 하나를 PUT 으로 계속 고쳐 쓴다(기획 §5.3). 시작은 MentionPipeline, 완료 표기는 ResultPublisher 가 한다.
 * 진행 메시지는 text 전용이라 고쳐 써도 사라질 카드가 없다.
 */
export class ProgressReporter {
  private channels = new Map<string, ChannelProgress>()

  constructor(
    private messenger: Pick<MessengerService, 'updateMessage'>,
    private now: () => number = Date.now
  ) {}

  /** 진행 메시지가 생기면 추적을 시작한다. */
  start(channelId: string, target: ProgressTarget): void {
    void this.stop(channelId)
    if (!target.progressLogId) return
    const entry: ChannelProgress = {
      target,
      phase: '작업 중',
      lastSentAt: 0,
      lastText: '',
      pendingTimer: null,
      heartbeat: setInterval(() => void this.flush(channelId), HEARTBEAT_MS),
      inflight: null
    }
    this.channels.set(channelId, entry)
  }

  /** 도구 이벤트 → 단계 갱신 */
  onTool(channelId: string, toolName: string): void {
    this.setPhase(channelId, phaseOfTool(toolName))
  }

  /** 단계 문구를 직접 바꾼다 (예: 승인 대기) */
  setPhase(channelId: string, phase: string): void {
    const entry = this.channels.get(channelId)
    if (!entry || entry.phase === phase) return
    entry.phase = phase
    this.schedule(channelId, entry)
  }

  /** 턴이 끝나면 멈춘다 — 완료 표기는 ResultPublisher 몫. 예약은 버리고 보내는 중인 갱신은 끝날 때까지 기다린다. */
  async stop(channelId: string): Promise<void> {
    const entry = this.channels.get(channelId)
    if (!entry) return
    if (entry.pendingTimer) clearTimeout(entry.pendingTimer)
    if (entry.heartbeat) clearInterval(entry.heartbeat)
    this.channels.delete(channelId)
    if (entry.inflight) await entry.inflight
  }

  private schedule(channelId: string, entry: ChannelProgress): void {
    if (entry.pendingTimer) return
    const wait = Math.max(0, entry.lastSentAt + MIN_UPDATE_INTERVAL_MS - this.now())
    entry.pendingTimer = setTimeout(() => {
      entry.pendingTimer = null
      void this.flush(channelId)
    }, wait)
  }

  private async flush(channelId: string): Promise<void> {
    const entry = this.channels.get(channelId)
    if (!entry || !entry.target.progressLogId) return
    const text = `${MESSAGE_PREFIX} ⏳ 작업 중 · ${formatElapsed(this.now() - entry.target.startedAt)} · ${entry.phase}`
    if (text === entry.lastText) return
    entry.lastSentAt = this.now()
    entry.lastText = text
    const logId = entry.target.progressLogId
    entry.inflight = this.messenger
      .updateMessage(entry.target.replyChannelId, logId, text)
      .catch((err) => console.warn(`[ProgressReporter] 진행 메시지 갱신 실패 channelId=${channelId} logId=${logId}:`, err))
      .finally(() => { entry.inflight = null })
    await entry.inflight
  }
}
