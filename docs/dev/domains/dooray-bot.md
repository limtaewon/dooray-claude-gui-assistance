# 도메인: @clauday 에이전트 (두레이 봇 & Socket Mode)

Clauday의 "봇 모드"는 두레이 메신저에서 `@clauday` 멘션을 받으면 자동으로 Claude Code를 실행하는 기능입니다. v1.4에 추가되었으며, 두레이의 Socket Mode WebSocket을 기반으로 합니다.

## 아키텍처 개요

```
두레이 메신저 채팅방
  ↓ "@clauday 분석해주세요" 입력
SocketModeClient (WebSocket)
  ↓ 이벤트 수신
BotService
  ↓ 멘션 이벤트 라우팅
MentionDispatcher
  ↓ 채널/사용자 검증
ContextCollector
  ↓ 최근 메시지 50개 수집
promptBuilder
  ↓ Claude 프롬프트 조립
MentionTerminalSpawner
  ↓ claude CLI spawn
Claude Code (터미널)
  ↓ 작업 수행
HookServer (stop hook)
  ↓ 응답 수집
ClaudayResponder
  ↓ 채팅방 답글로 송신
두레이 메신저 (응답)
```

## 핵심 파일

| 파일 | 역할 | 주요 클래스/함수 |
|-----|------|-----------------|
| `src/main/dooray/socket-mode/SocketModeClient.ts` | WebSocket 연결 관리 | `SocketModeClient` |
| `src/main/dooray/socket-mode/BotService.ts` | 봇 설정/라이프사이클 | `BotService` |
| `src/main/dooray/mention/MentionDispatcher.ts` | 멘션 이벤트 라우팅 | `MentionDispatcher` |
| `src/main/dooray/mention/ContextCollector.ts` | 메시지 수집 | `ContextCollector` |
| `src/main/dooray/mention/promptBuilder.ts` | 프롬프트 조립 | `buildPromptFromContext()`, `extractUserRequest()` |
| `src/main/dooray/mention/MentionTerminalSpawner.ts` | 터미널 생성/spawn | `MentionTerminalSpawner` |
| `src/main/dooray/mention/HookServer.ts` | Claude hook 수신 | `HookServer` |
| `src/main/dooray/mention/ClaudayResponder.ts` | 응답 송신 | `ClaudayResponder` |
| `src/main/dooray/mention/ChannelSessionStore.ts` | 채널별 세션 추적 | `ChannelSessionStore` |
| `src/main/dooray/mention/AgentWorkspaceManager.ts` | 워크스페이스 디렉토리 | `AgentWorkspaceManager` |

## 진입점 & 라이프사이클

### Main에서의 초기화 (src/main/index.ts)

```typescript
// 라인 150
const botService = new BotService(doorayClient)
const mentionDispatcher = new MentionDispatcher(botService, taskService)
const mentionContextCollector = new ContextCollector(messengerService)
const mentionTerminalSpawner = new MentionTerminalSpawner(terminalManager, channelSessionStore)
const claudayResponder = new ClaudayResponder(messengerService)
const hookServer = new HookServer()

// 봇 설정 조회/저장 IPC 핸들러 (라인 850~)
ipcMain.handle(IPC_CHANNELS.BOT_GET_CONFIG, async () => {
  return { domain: botService.getDomain() }
})

ipcMain.handle(IPC_CHANNELS.BOT_SET_CONFIG, async (_, payload) => {
  botService.setDomain(payload.domain || '')
  // 자동 재시작
  const ready = await botService.isReady()
  if (ready) {
    await botService.start()
  } else {
    await botService.stop()
  }
  return botService.getStatus()
})

// 봇 상태 조회
ipcMain.handle(IPC_CHANNELS.BOT_GET_STATUS, async () => {
  return botService.getStatus()
})

// 수동 시작/중지
ipcMain.handle(IPC_CHANNELS.BOT_START, async () => {
  await botService.start()
})

ipcMain.handle(IPC_CHANNELS.BOT_STOP, async () => {
  await botService.stop()
})
```

### 앱 시작 시 봇 자동 활성화

```typescript
// src/main/index.ts (라인 ~900)
;(async () => {
  // CalDAV 초기화 후...
  
  // 봇 모드 자동 활성화
  console.log('[main] 봇 모드 자동 활성화 시도')
  try {
    const ready = await botService.isReady()
    if (ready) {
      await botService.start()
      console.log('[main] 봇 모드 활성화됨')
    } else {
      console.log('[main] 봇 모드 설정 미완료 (도메인 또는 토큰 없음)')
    }
  } catch (err) {
    console.error('[main] 봇 모드 활성화 실패:', err)
  }
})()
```

## 멘션 처리 흐름 (상세)

### 1. WebSocket 연결 & 이벤트 수신

**SocketModeClient.ts**:
```typescript
export class SocketModeClient extends EventEmitter {
  private ws: WebSocket | null = null
  private botToken: string
  private url: string

  async connect(): Promise<void> {
    // 1) Socket Mode 엔드포인트 시작
    const response = await fetch(
      `https://api.dooray.com/v1/bot/connection`,
      { headers: { Authorization: `Bearer ${this.botToken}` } }
    )
    this.url = (await response.json()).url

    // 2) WebSocket 연결
    this.ws = new WebSocket(this.url)
    
    // 3) 메시지 수신
    this.ws.on('message', (data: string) => {
      const payload = JSON.parse(data)
      this.emit('event', payload)  // 이벤트 발행
    })
  }

  send(ack: { envelope_id: string; payload?: any }): void {
    // Socket Mode ack 송신 (WebSocket 응답)
    this.ws?.send(JSON.stringify(ack))
  }
}
```

### 2. 멘션 이벤트 라우팅

**BotService.ts**:
```typescript
async start(): Promise<void> {
  if (this.client) return
  
  const token = await this.getApiToken()
  const domain = this.getDomain()
  
  this.client = new SocketModeClient({ botToken: token, domain })
  
  // 이벤트 핸들러 등록
  this.client.on('event', (ev: SocketModeEvent) => {
    this.handleEvent(ev)  // 라우팅
  })
  
  // WebSocket 연결
  await this.client.connect()
  this.state = 'CONNECTED'
}

private async handleEvent(ev: SocketModeEvent): Promise<void> {
  const { type, content } = ev
  
  // 1) 이벤트 ack 즉시 전송 (Socket Mode 필수)
  this.client.send({ envelope_id: ev.envelope_id })
  
  // 2) 멘션 이벤트만 처리
  if (type === 'message' && content?.text?.includes('@clauday')) {
    // Renderer에 브로드캐스트 (UI 알림용)
    this.mainWindow?.webContents.send(IPC_CHANNELS.BOT_EVENT, {
      type: 'mention',
      channelId: content.channel_id,
      text: content.text,
      senderId: content.sender_id
    })
    
    // MentionDispatcher에 위임
    mentionDispatcher.dispatch(ev)
  }
}
```

### 3. 맨 앞 멘션만 인식

**MentionDispatcher.ts**:
```typescript
dispatch(event: SocketModeEvent): void {
  const text = event.content?.text || ''
  const senderId = event.content?.sender_id
  const channelId = event.content?.channel_id
  
  // 맨 앞 토큰이 @clauday인지 확인
  const firstToken = text.split(/\s+/)[0]
  if (firstToken !== '@clauday') return
  
  // 본인 토큰 멘션만 처리
  const myMemberId = this.getMyMemberId()
  if (senderId === myMemberId) return  // 본인의 응답은 무시
  
  // 처리 시작
  this.processMention({
    channelId,
    senderId,
    text,
    logId: event.content?.log_id
  })
}
```

### 4. 컨텍스트 수집

**ContextCollector.ts**:
```typescript
async collect(channelId: string): Promise<CollectedMessage[]> {
  // 두레이 메신저 API로 최근 메시지 50개 수집
  const messages = await messengerService.getMessages({
    channelId,
    limit: 50,
    order: 'desc'  // 최신순
  })
  
  // 시간순으로 정렬 (오래된 것 → 최신)
  messages.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime())
  
  // 멘션 직전 문맥만 추출 (cutoff logic)
  const beforeMention = messages.filter(m => m.logId !== mentionLogId)
  
  return beforeMention.slice(-50)  // 최근 50개
}
```

**수집 데이터**:
```typescript
interface CollectedMessage {
  senderId: string
  senderName: string
  text: string  // 마크다운: 위키/태스크 링크 포함
  sentAt: string
  type: 'text' | 'file' | 'mention'
}
```

### 5. 프롬프트 조립

**promptBuilder.ts**:
```typescript
export function buildPromptFromContext(
  userRequest: string,
  messages: CollectedMessage[],
  attachments?: { type: 'wiki' | 'task' | 'pr'; content: string }[]
): string {
  // 사용자 요청 추출
  const request = extractUserRequest(userRequest)
  
  const prompt = `
채널 대화 기록:
${messages.map(m => `[${m.senderName}] ${m.text}`).join('\n')}

사용자 요청:
${request}

${attachments ? `첨부 문서:\n${attachments.map(a => a.content).join('\n\n')}` : ''}

이 요청을 대응하세요. 채팅방 문맥을 고려하세요.
`
  
  return prompt
}

export function extractUserRequest(text: string): string {
  // "@clauday " 이후의 본문만 추출
  const match = text.match(/@clauday\s+(.+)/)
  return match?.[1] ?? text
}
```

### 6. 터미널 생성 & Claude CLI Spawn

**MentionTerminalSpawner.ts**:
```typescript
async spawn(mention: MentionEvent): Promise<{ sessionId: string; cwd: string }> {
  // 1) 채널별 작업 디렉토리 확보
  const cwd = agentWorkspace.getOrCreateChannelDirectory(mention.channelId)
  // ~/Clauday-Workspaces/agent/{channelId}/
  
  // 2) 프롬프트를 파일로 저장
  const promptFile = join(cwd, `.mention-${Date.now()}.md`)
  writeFileSync(promptFile, prompt)
  
  // 3) Claude CLI spawn
  const env = {
    ...process.env,
    CLAUDE_WORKDIR: cwd,
    CLAUDE_HOOK_ENABLED: '1',
    CLAUDE_HOOK_ENDPOINT: `http://localhost:9876/hook`
  }
  
  const spawned = spawn(getClaudeBin(), [
    'code',
    '--include-hook-events',
    '--resume',  // 최근 세션 재사용
    promptFile
  ], { cwd, env })
  
  // 4) 터미널 메타 저장 (채널 → claude sessionId)
  channelSessionStore.setActiveMention(mention.channelId, {
    spawnId: spawned.pid,
    sessionId: undefined  // stop hook에서 채워짐
  })
  
  return { cwd, sessionId: undefined }
}
```

**환경 변수**:
- `CLAUDE_WORKDIR`: 작업 폴더 (git 리포지토리 자동 감지용)
- `CLAUDE_HOOK_ENABLED`: Hook 수신 활성화
- `CLAUDE_HOOK_ENDPOINT`: Hook 서버 주소

### 7. Hook 수신 & 응답 수집

**HookServer.ts**:
```typescript
export class HookServer {
  private server: http.Server | null = null
  private listeners: Map<string, (ev: HookEventPayload) => void> = new Map()
  
  start(): void {
    this.server = http.createServer((req, res) => {
      // Claude Code에서 POST /hook 요청
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', async () => {
        const payload = JSON.parse(body) as HookEventPayload
        
        // stop hook 처리
        if (payload.event === 'stop') {
          console.log('[HookServer] stop 훅 수신:', {
            cwd: payload.cwd,
            session_id: payload.session_id
          })
        }
        
        // 핸들러 호출
        const handler = this.listeners.get(payload.cwd)
        await handler?.(payload)
        
        // 응답
        res.writeHead(200)
        res.end(JSON.stringify({ ok: true }))
      })
    })
    
    this.server.listen(9876)
  }
  
  onCwd(cwd: string, handler: (ev: HookEventPayload) => void): void {
    this.listeners.set(cwd, handler)
  }
}
```

**Hook 이벤트 타입**:
```typescript
interface HookEventPayload {
  event: 'post_tool_use' | 'stop' | 'error'
  cwd: string
  tool_name?: string
  tool_input?: Record<string, unknown>
  session_id?: string
  transcript_path?: string
  raw: {
    last_assistant_message?: string | object
    [key: string]: unknown
  }
}
```

### 8. 응답 송신

**src/main/index.ts (라인 ~200)**:
```typescript
async function handleClaudeHook(ev: HookEventPayload): Promise<void> {
  const channelId = extractChannelIdFromCwd(ev.cwd)
  if (!channelId) return

  // post_tool_use 누적
  if (ev.event === 'post_tool_use') {
    const buf = turnBuffers.get(channelId) || []
    buf.push({ tool: ev.tool_name, detail: formatToolDetail(ev.tool_input) })
    turnBuffers.set(channelId, buf)
    return
  }

  // stop: 응답 송신
  if (ev.event === 'stop') {
    const buf = turnBuffers.get(channelId) || []
    turnBuffers.delete(channelId)

    // 최종 텍스트 추출
    let assistantText = extractAssistantMessage(ev.raw.last_assistant_message)
    
    // 메시지 본문 조립
    const body = composeStopMessage(assistantText, buf)
    
    // 두레이 메신저로 송신
    const session = channelSessionStore.get(channelId)
    await claudayResponder.send(channelId, body, session?.organizationId)
    
    // 세션 상태 정리
    channelSessionStore.markIdle(channelId)
  }
}

// Hook 핸들러 등록
hookServer.onCwd('*', handleClaudeHook)
```

## 워크스페이스 구조

### 채널별 작업 디렉토리

```
~/Clauday-Workspaces/
  agent/
    {channelId}/
      .mention-*.md          ← 멘션 프롬프트
      .claude/
        projects/
          {sessionId}.jsonl  ← Claude 세션 저장소
        chat-sessions/       ← Claude CLI 캐시
      .git/                  ← 자동 git repo
      (사용자 작업 파일)
```

**AgentWorkspaceManager.ts**:
```typescript
export class AgentWorkspaceManager {
  getOrCreateChannelDirectory(channelId: string): string {
    const base = join(homedir(), 'Clauday-Workspaces', 'agent', channelId)
    if (!existsSync(base)) {
      mkdirSync(base, { recursive: true })
      
      // 자동 git repo 초기화 (선택사항)
      execSync('git init', { cwd: base })
    }
    return base
  }
}
```

## UI 통합 (Renderer)

### Settings에서 봇 설정

```typescript
// SettingsPanel.tsx
export function BotSettings() {
  const [config, setConfig] = useState({ domain: '' })
  const [status, setStatus] = useState<BotStatus | null>(null)

  // 상태 구독
  useEffect(() => {
    window.api.bot.getStatus().then(setStatus)
    const unsub = window.api.bot.onStateUpdate(setStatus)
    return unsub
  }, [])

  const handleDomainSave = async (domain: string) => {
    const result = await window.api.bot.setConfig({ domain })
    setStatus(result)
  }

  return (
    <div>
      <input
        placeholder="두레이 도메인 (예: nhnent.dooray.com)"
        defaultValue={config.domain}
        onBlur={e => handleDomainSave(e.currentTarget.value)}
      />
      
      <div className={status?.ready ? 'text-green-600' : 'text-red-600'}>
        {status?.state} {status?.lastError && `(${status.lastError})`}
      </div>
      
      <button onClick={() => window.api.bot.start()}>시작</button>
      <button onClick={() => window.api.bot.stop()}>중지</button>
    </div>
  )
}
```

### 멘션 알림 (사이드바)

```typescript
// Sidebar.tsx
export function Sidebar() {
  const [mentionCount, setMentionCount] = useState(0)

  useEffect(() => {
    const unsub = window.api.mention.onReceived(({ channelId, text }) => {
      setMentionCount(prev => prev + 1)
      
      // 알림 표시 + 채널 탭 활성화
      const notif = new Notification('@clauday', {
        body: `[${channelId}] ${text.slice(0, 50)}...`
      })
    })

    return unsub
  }, [])

  return (
    <div className="mention-badge">
      {mentionCount > 0 && <span>{mentionCount}</span>}
    </div>
  )
}
```

## 디버깅 팁

### 1. 로그 확인

```bash
# Main 콘솔
# [BotService] 상태 변화: CONNECTING
# [SocketModeClient] WebSocket 연결
# [MentionDispatcher] 멘션 인식됨
# [HookServer] stop 훅 수신
```

### 2. 채널 워크스페이스 확인

```bash
ls -la ~/Clauday-Workspaces/agent/
# {채널ID}/ 디렉토리가 있는지

cat ~/Clauday-Workspaces/agent/{channelId}/.mention-*.md
# 저장된 프롬프트 내용 확인
```

### 3. Hook 서버 응답 테스트

```bash
curl -X POST http://localhost:9876/hook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "stop",
    "cwd": "~/Clauday-Workspaces/agent/...",
    "raw": {"last_assistant_message": "완료"}
  }'
```

## 제약사항 & 주의

1. **한 번에 하나의 멘션만 처리** — 여러 멘션이 동시에 오면 큐에 쌓임
2. **채널별 독립 세션** — 다른 채널의 문맥은 공유되지 않음
3. **응답 길이 제한** — 두레이 메신저는 약 2000자 limit. `truncateForMessenger()` 사용
4. **WebSocket 재연결** — 네트워크 끊김 시 자동 재시도 필요

## 참고

더 자세한 내용:
- [src/main/dooray/mention/promptBuilder.test.ts](../../../src/main/dooray/mention/promptBuilder.test.ts) — 프롬프트 조립 테스트
- [src/main/index.ts:150-250](../../../src/main/index.ts) — 전체 흐름 통합
