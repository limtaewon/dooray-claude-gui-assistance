# 도메인: Claude Code 채팅 & 세션 관리

Claude Code 통합은 두 부분으로 나뉜다: (1) 세션 메타 관리, (2) 메시지 스트리밍 & 채팅 UI.

## 진입점

| 파일 | 역할 |
|-----|------|
| `src/main/claude/ClaudeSessionService.ts` | 세션 메타 로드/저장 |
| `src/main/claude/ClaudeChatService.ts` | `claude` CLI spawn + 스트리밍 |
| `src/main/claude/AttachmentService.ts` | 첨부 파일 저장 |

## ClaudeSessionService

Claude Code는 `~/.claude/projects/` 디렉토리에 jsonl 형식으로 세션을 저장합니다.

```typescript
export class ClaudeSessionService {
  /**
   * 디스크의 모든 Claude 세션 목록 로드.
   * ~/.claude/projects/**/*.jsonl 파일들을 파싱.
   */
  async listSessions(cwd?: string): Promise<ClaudeSessionMeta[]> {
    // 1) 프로젝트 디렉토리 스캔
    const projectsDir = join(homedir(), '.claude', 'projects')
    const files = await glob(join(projectsDir, '**/*.jsonl'))
    
    // 2) 각 파일의 첫 줄 읽기 (session metadata)
    const sessions: ClaudeSessionMeta[] = []
    for (const file of files) {
      const firstLine = readFileSync(file, 'utf-8').split('\n')[0]
      const { id, cwd, title, timestamp } = JSON.parse(firstLine)
      
      // 3) cwd 필터 (선택사항)
      if (cwd && !file.includes(cwd)) continue
      
      sessions.push({ id, cwd, title, timestamp })
    }
    
    return sessions.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  }

  /**
   * 세션의 메시지 목록 로드.
   */
  async loadSession(
    sessionId: string,
    cwd: string
  ): Promise<ClaudeSessionMessage[]> {
    const file = join(homedir(), '.claude', 'projects', cwd, `${sessionId}.jsonl`)
    const lines = readFileSync(file, 'utf-8').split('\n')
    
    return lines
      .filter(line => line.trim())
      .map(line => {
        const msg = JSON.parse(line)
        return {
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp
        }
      })
  }

  /**
   * 세션 사용자 정의 제목 저장.
   * ~/.claude-sessions.json에 매핑 저장.
   */
  async renameSession(sessionId: string, title: string): Promise<void> {
    const store = new Store({ name: 'claude-sessions' })
    const titles = store.get('titles', {}) as Record<string, string>
    titles[sessionId] = title
    store.set('titles', titles)
  }
}
```

## ClaudeChatService

Claude Code CLI를 spawn하고 메시지를 스트리밍합니다.

```typescript
export class ClaudeChatService {
  private claudeBin: string
  
  async chat(
    request: ClaudeChatSendRequest
  ): Promise<string> {
    const {
      sessionId,
      message,
      cwd,
      model,
      mcpServers
    } = request

    // 1) claude CLI 환경 보강
    const env = enrichedClaudeEnv()

    // 2) resume 옵션
    const args = ['chat', '--json']
    if (sessionId) {
      args.push('--resume', sessionId)
    }

    // 3) spawn
    const proc = spawn(this.claudeBin, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    // 4) 스트리밍 수신 (JSON lines)
    let chatId = ''
    proc.stdout.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        
        try {
          const ev = JSON.parse(line)
          
          // 첫 이벤트에서 chatId 추출
          if (!chatId && ev.chat_id) chatId = ev.chat_id
          
          // Renderer로 전송
          mainWindow?.webContents.send(IPC_CHANNELS.CLAUDE_CHAT_EVENT, {
            chatId,
            type: ev.type,  // 'thinking', 'assistant_message', 'tool_call', etc.
            content: ev.content
          })
        } catch (err) {
          console.error('[ClaudeChatService] 파싱 실패:', line)
        }
      }
    })

    // 5) stdin으로 메시지 전송
    proc.stdin.write(JSON.stringify({ message }))
    proc.stdin.end()

    // 6) 프로세스 완료 대기
    return new Promise((resolve, reject) => {
      proc.on('close', code => {
        if (code === 0) resolve(chatId)
        else reject(new Error(`Claude CLI exit code ${code}`))
      })
    })
  }

  /**
   * 진행 중인 chat 취소.
   */
  async cancel(chatId: string): Promise<void> {
    // SIGTERM 전송
    // (또는 별도의 cancel 엔드포인트 호출)
  }
}
```

## ClaudeChatSendRequest 타입

```typescript
// shared/types/claude-chat.ts
export interface ClaudeChatSendRequest {
  sessionId?: string        // resume할 세션 ID
  message: string           // 사용자 메시지
  cwd: string              // 작업 디렉토리
  model?: AIModelName      // 모델 지정 (기본값 Sonnet)
  mcpServers?: string[]    // MCP 서버 명시
}

export type ClaudeChatEvent =
  | { type: 'thinking'; content: string }
  | { type: 'assistant_message'; content: string }
  | { type: 'tool_call'; tool_name: string; tool_input: any }
  | { type: 'tool_result'; result: string }
  | { type: 'error'; message: string }
```

## AttachmentService

채팅 UI에서 이미지/파일을 첨부할 때 저장.

```typescript
export class AttachmentService {
  async save(
    name: string,
    data: ArrayBuffer | Uint8Array
  ): Promise<string> {
    // 저장 경로: ~/.claude-attachments/{uuid}
    const id = randomUUID()
    const dir = join(homedir(), '.claude-attachments')
    
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    
    const path = join(dir, id, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, Buffer.from(data))
    
    return path  // 절대 경로 반환
  }
}
```

## IPC 핸들러

```typescript
// src/main/index.ts

const claudeChat = new ClaudeChatService(getClaudeBin())
const claudeSessions = new ClaudeSessionService()
const claudeAttachments = new AttachmentService()

// 세션 목록
ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_LIST, async (_, cwd?: string) => {
  return claudeSessions.listSessions(cwd)
})

// 세션 로드
ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_LOAD, async (_, { sessionId, cwd }) => {
  return claudeSessions.loadSession(sessionId, cwd)
})

// 세션 이름 변경
ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_RENAME, async (_, { sessionId, title }) => {
  await claudeSessions.renameSession(sessionId, title)
})

// 채팅 메시지 전송
ipcMain.handle(IPC_CHANNELS.CLAUDE_CHAT_SEND, async (_, req: ClaudeChatSendRequest) => {
  return await claudeChat.chat(req)
})

// 채팅 취소
ipcMain.handle(IPC_CHANNELS.CLAUDE_CHAT_CANCEL, async (_, chatId: string) => {
  return await claudeChat.cancel(chatId)
})

// 첨부 파일 저장
ipcMain.handle(IPC_CHANNELS.CLAUDE_ATTACHMENT_SAVE, async (_, { name, data }) => {
  return await claudeAttachments.save(name, data)
})
```

## Renderer: 채팅 UI

### 세션 사이드바

```typescript
// ClaudeChatPane.tsx
export function ClaudeChatPane() {
  const [sessions, setSessions] = useState<ClaudeSessionMeta[]>([])
  const [activeSession, setActiveSession] = useState<string | null>(null)
  const [messages, setMessages] = useState<ClaudeSessionMessage[]>([])

  // 세션 목록 로드
  useEffect(() => {
    window.api.claude.sessionList().then(setSessions)
  }, [])

  // 세션 선택 시 메시지 로드
  const selectSession = async (sessionId: string) => {
    setActiveSession(sessionId)
    const msgs = await window.api.claude.sessionLoad(sessionId, process.cwd())
    setMessages(msgs)
  }

  return (
    <div className="flex">
      {/* Sidebar */}
      <aside className="w-64">
        <button onClick={() => {/* 새 세션 */ }}>
          + 새 대화
        </button>
        
        {sessions.map(s => (
          <div
            key={s.id}
            onClick={() => selectSession(s.id)}
            className={activeSession === s.id ? 'active' : ''}
          >
            {s.title || s.id.slice(0, 8)}
          </div>
        ))}
      </aside>

      {/* Chat */}
      <ChatWindow
        sessionId={activeSession}
        messages={messages}
        onSendMessage={handleSend}
      />
    </div>
  )
}

// ChatWindow.tsx
function ChatWindow({ sessionId, messages, onSendMessage }: Props) {
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [displayMessages, setDisplayMessages] = useState(messages)

  const handleSend = async () => {
    if (!input.trim() || !sessionId) return
    
    setStreaming(true)
    const userMsg = input
    setInput('')

    try {
      await window.api.claude.chatSend({
        sessionId,
        message: userMsg,
        cwd: process.cwd()
      })

      // 스트리밍 이벤트 구독
      const unsub = window.api.claude.onChatEvent((ev) => {
        if (ev.type === 'assistant_message') {
          setDisplayMessages(prev => [...prev, {
            role: 'assistant',
            content: ev.content,
            timestamp: new Date().toISOString()
          }])
        }
      })

      return () => unsub()
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* 메시지 목록 */}
      <div className="flex-1 overflow-auto">
        {displayMessages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
      </div>

      {/* 입력창 */}
      <div className="input-area">
        <input
          value={input}
          onChange={e => setInput(e.currentTarget.value)}
          placeholder="메시지 입력..."
          disabled={streaming}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              handleSend()
            }
          }}
        />
        <button onClick={handleSend} disabled={streaming}>
          전송
        </button>
      </div>
    </div>
  )
}
```

## 권한 자동 허가

Claude Code가 MCP 또는 스킬을 호출할 때 사용자 승인 다이얼로그가 나타날 수 있습니다. 앱은 자동으로 허가합니다.

```typescript
// src/main/index.ts

// claude CLI 환경에 권한 허가 설정
function enrichedClaudeEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CLAUDE_SKIP_APPROVAL: '1',  // MCP 권한 자동 허가
    CLAUDE_ALLOW_MCP: '1',      // MCP 호출 가능
    CLAUDE_ALLOW_SKILLS: '1'    // 스킬 호출 가능
  }
}
```

## 캐시 토큰 표시

Claude의 prompt caching을 활용하면 반복 호출 시 비용을 절감할 수 있습니다.

```typescript
// 스트리밍 이벤트에서
export type ClaudeChatEvent =
  | { type: 'cache_read'; tokens: number }
  | { type: 'cache_creation'; tokens: number }
  | // ...
```

Renderer에서 캐시 히트율 표시:
```typescript
<div className="cache-stats">
  Cache hit: {cacheReadTokens} / Creation: {cacheCreationTokens}
</div>
```

## 진행 상황 표시

```typescript
// useAIProgress hook 참고
const progressUnsub = window.api.ai.onProgress((ev) => {
  setProgress({
    stage: ev.stage,  // 'collecting' | 'thinking' | 'responding' | 'parsing'
    message: ev.message
  })
})
```

## 주의사항

1. **세션 경로**: `cwd`가 정확해야 세션 로드 가능
2. **Resume 한계**: 24시간 이상 된 세션은 resume 실패 가능
3. **메모리**: 대용량 세션(수천 메시지)은 로드 시간 길어짐
4. **stdin 닫기**: 필수 (claude CLI가 입력 완료 인지)

## 참고

더 자세한 내용:
- [Claude Code CLI 문서](https://docs.anthropic.com/claude/reference/claude-code)
- [shared/types/claude-chat.ts](../../../src/shared/types/claude-chat.ts)
