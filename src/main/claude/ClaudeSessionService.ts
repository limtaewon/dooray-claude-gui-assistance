import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import Store from 'electron-store'

const PROJECTS_DIR = join(homedir(), '.claude', 'projects')

export interface ClaudeSessionMeta {
  sessionId: string
  cwd: string
  /** 첫 user 메시지 일부 (title fallback) */
  title: string
  /** 사용자가 직접 정한 이름 (있으면 우선 표시) */
  customTitle?: string
  /** 즐겨찾기 표시 여부 */
  starred?: boolean
  /** 마지막 entry timestamp (ISO) */
  lastActivityAt: string
  /** 메시지 개수 (user + assistant) */
  messageCount: number
}

interface TitleStoreShape {
  /** sessionId → 사용자 정의 이름 매핑 */
  titles: Record<string, string>
  /** 즐겨찾기로 표시한 sessionId 목록 */
  starred: string[]
}

export interface ClaudeSessionMessage {
  /** uuid 또는 entry uuid (key 용도). 없으면 fallback hash 가능. */
  id: string
  role: 'user' | 'assistant'
  text: string
  /** ISO timestamp */
  at?: string
}

interface JsonlEntry {
  type?: string
  sessionId?: string
  cwd?: string
  timestamp?: string
  uuid?: string
  message?: {
    role?: string
    content?: unknown
  }
}

/**
 * Claude Code 가 디스크에 남기는 세션 jsonl 을 읽어 메타/메시지로 변환.
 * 위치: ~/.claude/projects/{encodedCwd}/{sessionId}.jsonl
 *
 * - encodedCwd: '/Users/nhn/Desktop/foo' → '-Users-nhn-Desktop-foo' (slash → dash)
 * - 한 line 이 한 event. type 이 'user'/'assistant' 인 것만 채팅 메시지로 취급.
 */
export class ClaudeSessionService {
  private titleStore: Store<TitleStoreShape>

  constructor() {
    this.titleStore = new Store<TitleStoreShape>({
      name: 'clauday-session-titles',
      defaults: { titles: {}, starred: [] }
    })
  }

  /** cwd 를 claude code 가 쓰는 디렉토리명 형태로 변환 */
  private encodeCwd(cwd: string): string {
    return cwd.replace(/\//g, '-')
  }

  // ===== 사용자 정의 세션 이름 =====

  setCustomTitle(sessionId: string, title: string): void {
    const titles = this.titleStore.get('titles', {})
    if (title.trim()) titles[sessionId] = title.trim()
    else delete titles[sessionId]
    this.titleStore.set('titles', titles)
  }

  getCustomTitle(sessionId: string): string | undefined {
    return this.titleStore.get('titles', {})[sessionId]
  }

  /** 사용자 정의 이름 단건 삭제 */
  clearCustomTitle(sessionId: string): void {
    const titles = this.titleStore.get('titles', {})
    delete titles[sessionId]
    this.titleStore.set('titles', titles)
  }

  // ===== 즐겨찾기 =====

  setStarred(sessionId: string, starred: boolean): void {
    const list = new Set(this.titleStore.get('starred', []))
    if (starred) list.add(sessionId)
    else list.delete(sessionId)
    this.titleStore.set('starred', Array.from(list))
  }

  isStarred(sessionId: string): boolean {
    return this.titleStore.get('starred', []).includes(sessionId)
  }

  private projectDir(cwd: string): string {
    return join(PROJECTS_DIR, this.encodeCwd(cwd))
  }

  /**
   * 특정 cwd 의 세션 목록 (최근 활동 순).
   * cwd 가 없으면 모든 프로젝트 디렉토리를 훑음.
   */
  async listSessions(cwd?: string): Promise<ClaudeSessionMeta[]> {
    const projectDirs: string[] = []
    if (cwd) {
      projectDirs.push(this.projectDir(cwd))
    } else {
      try {
        const entries = await fs.readdir(PROJECTS_DIR)
        for (const e of entries) projectDirs.push(join(PROJECTS_DIR, e))
      } catch {
        return []
      }
    }

    const all: ClaudeSessionMeta[] = []
    const titles = this.titleStore.get('titles', {})
    const starred = new Set(this.titleStore.get('starred', []))
    for (const dir of projectDirs) {
      try {
        const files = await fs.readdir(dir)
        for (const f of files) {
          if (!f.endsWith('.jsonl')) continue
          const sessionId = f.replace(/\.jsonl$/, '')
          const meta = await this.readMeta(join(dir, f), sessionId)
          if (meta) {
            if (titles[sessionId]) meta.customTitle = titles[sessionId]
            if (starred.has(sessionId)) meta.starred = true
            all.push(meta)
          }
        }
      } catch {
        // 디렉토리 없거나 권한 문제 — skip
      }
    }

    // 최근 활동 내림차순
    all.sort((a, b) => (b.lastActivityAt || '').localeCompare(a.lastActivityAt || ''))
    return all
  }

  /**
   * 한 세션의 채팅 메시지(user/assistant) 만 시간순으로 반환.
   * Tool 사용/결과는 일단 skip (대화 흐름 위주 표시).
   */
  async loadSession(sessionId: string, cwd: string): Promise<ClaudeSessionMessage[]> {
    const file = join(this.projectDir(cwd), `${sessionId}.jsonl`)
    let raw: string
    try {
      raw = await fs.readFile(file, 'utf-8')
    } catch {
      return []
    }

    const messages: ClaudeSessionMessage[] = []
    const lines = raw.split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
      let entry: JsonlEntry
      try {
        entry = JSON.parse(line) as JsonlEntry
      } catch {
        continue
      }
      const role = entry.message?.role
      if (entry.type === 'user' && role === 'user') {
        const text = extractText(entry.message?.content)
        if (text) {
          messages.push({
            id: entry.uuid || `u-${entry.timestamp || Math.random()}`,
            role: 'user',
            text,
            at: entry.timestamp
          })
        }
      } else if (entry.type === 'assistant' && role === 'assistant') {
        const text = extractText(entry.message?.content)
        if (text) {
          // 같은 assistant message 가 여러 line 으로 쪼개지지 않게 마지막 entry 와 합치기
          const last = messages[messages.length - 1]
          if (last && last.role === 'assistant' && last.id === (entry.uuid || last.id)) {
            last.text += text
          } else {
            messages.push({
              id: entry.uuid || `a-${entry.timestamp || Math.random()}`,
              role: 'assistant',
              text,
              at: entry.timestamp
            })
          }
        }
      }
    }
    return messages
  }

  /** 단일 세션 파일의 meta 추출 (head 일부만 읽어 제목/메시지수 빠르게 판정) */
  private async readMeta(filePath: string, sessionId: string): Promise<ClaudeSessionMeta | null> {
    let raw: string
    try {
      raw = await fs.readFile(filePath, 'utf-8')
    } catch {
      return null
    }
    if (!raw.trim()) return null

    const lines = raw.split('\n')
    let cwd = ''
    let firstUserText = ''
    let lastTs = ''
    let messageCount = 0

    for (const line of lines) {
      if (!line.trim()) continue
      let entry: JsonlEntry
      try {
        entry = JSON.parse(line) as JsonlEntry
      } catch {
        continue
      }
      if (entry.cwd && !cwd) cwd = entry.cwd
      if (entry.timestamp) lastTs = entry.timestamp
      const role = entry.message?.role
      if ((entry.type === 'user' && role === 'user') || (entry.type === 'assistant' && role === 'assistant')) {
        messageCount++
        if (!firstUserText && role === 'user') {
          firstUserText = extractText(entry.message?.content).slice(0, 80)
        }
      }
    }

    if (messageCount === 0) return null

    return {
      sessionId,
      cwd,
      title: firstUserText || '(제목 없음)',
      lastActivityAt: lastTs,
      messageCount
    }
  }
}

/** Claude message.content 는 string 또는 [{type:'text',text:'...'}, ...] 형태. 텍스트만 모아서 반환. */
function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const b = block as Record<string, unknown>
    if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text)
  }
  return parts.join('')
}
