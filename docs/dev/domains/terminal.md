# 도메인: Terminal & node-pty 관리

Terminal은 Clauday의 가장 복잡한 도메인 중 하나입니다. node-pty로 OS 터미널을 에뮬레이션하고, 한글 IME, 화면 복원, 세션 영속화까지 담당합니다.

## 진입점

**파일**: `src/main/terminal/TerminalManager.ts` (~400줄)

**주요 클래스**: `TerminalManager`

```typescript
export class TerminalManager {
  private sessions: Map<string, PtySession> = new Map()
  private mainWindow: BrowserWindow | null = null

  // 세션 생성
  create(opts?: TerminalCreateOptions): TerminalSession

  // 입력/출력
  input(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void

  // 세션 관리
  kill(id: string): void
  list(): TerminalSession[]

  // 영속화
  save(id: string): Promise<string>
  restoreSaved(): Promise<TerminalSession[]>
}
```

## 주요 기능

### 1. PTY 세션 생성

```typescript
create(opts?: TerminalCreateOptions): TerminalSession {
  const id = randomUUID()
  const cwd = opts?.cwd || homedir()
  const name = opts?.name || 'Terminal'
  
  // node-pty로 셸 프로세스 생성
  const ptyProcess = pty.spawn(
    shell,           // /bin/zsh (로그인 셸)
    [],
    {
      cwd,
      env: {
        ...process.env,
        PATH: enrichedTerminalPath(),  // 보강된 PATH
        LANG: 'ko_KR.UTF-8'           // 한글 강제
      },
      cols: 80,
      rows: 24
    }
  )

  // 데이터 이벤트 → Renderer로 브로드캐스트
  ptyProcess.on('data', (data: string) => {
    outputBuffer.push(data)
    mainWindow?.webContents.send(IPC_CHANNELS.TERMINAL_OUTPUT, { id, data })
  })

  // 세션 메타 저장
  const session: TerminalSession = { id, name, cwd, pid: ptyProcess.pid }
  sessions.set(id, { pty: ptyProcess, meta: session, outputBuffer: [] })

  return session
}
```

### 2. 로그인 셸 & 환경 보강

**enrichedTerminalPath()** (라인:52-78):
```typescript
function enrichedTerminalPath(): string {
  // 문제: Electron GUI에서 실행되므로 ~/.zshrc가 제대로 로드 안 될 수 있음
  // 해결: Homebrew, .claude/local, npm-global 등을 미리 PATH에 추가
  
  const extraPaths = [
    join(home, '.claude', 'local'),
    join(home, '.claude', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',  // M1/M2 Mac
    join(home, '.npm-global', 'bin'),
    join(home, '.nvm', 'versions', 'node', 'current', 'bin')
  ]
  
  // 사용자 PATH 우선 (앞에 붙이지 않고 뒤에 붙임)
  return [process.env.PATH, ...extraPaths].join(':')
}
```

**LANG 강제**:
```typescript
env: {
  LANG: 'ko_KR.UTF-8'  // 한글 깨짐 방지
}
```

### 3. 한글 IME & Unicode 11 지원

**문제**: 한글 IME 입력 시 셀 폭 계산 오류로 글자가 겹침

**해결책** (라인:400~):

1. **@xterm/addon-unicode11 도입**
   ```typescript
   import { Unicode11Addon } from '@xterm/addon-unicode11'
   
   const term = new Terminal()
   term.loadAddon(new Unicode11Addon())
   term.unicode.activeVersion = '11'  // 유니코드 11 표준 적용
   ```

2. **한글 폰트 Fallback** (Renderer)
   ```css
   .xterm {
     font-family: 
       'Monaco',
       'Menlo',
       'Apple SD Gothic Neo',  /* macOS 한글 */
       'Malgun Gothic',        /* Windows 한글 */
       'Noto Sans Mono CJK KR', /* Linux 한글 */
       monospace;
   }
   ```

### 4. 입력 핸들링 (IME 합성 안정화)

**문제**: Shift+Enter 입력 시 IME 합성 중 desync

**해결책** (Renderer):
```typescript
// Terminal.tsx
term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
  // IME 합성 중이면 브라우저 기본 동작 실행
  if ((event as any).isComposing) {
    return true  // 브라우저가 처리
  }

  // ESC/화살표는 항상 전달 (팔레트용)
  if (event.key === 'Escape' || event.key.startsWith('Arrow')) {
    return false  // terminal.ts가 처리
  }

  // 일반 키는 terminal.ts가 처리
  return false
})
```

### 5. 앱 재시작 후 화면 복원

**문제**: 앱 종료 후 재시작하면 이전 터미널 내용이 깨짐

**원인**:
1. TUI 앱(vim, htop, claude TUI)이 alternate screen 사용 후 나가며 화면 redraw 남김
2. ANSI escape sequence가 청크 경계에서 끊김

**해결책** (sanitizeForRestore, 라인:29-44):
```typescript
function sanitizeForRestore(raw: string): string {
  // 1) alternate screen exit 이후만 남김
  const altExit = /\x1b\[\?(?:1049|47|1047)l/g
  let lastEnd = -1
  let m
  while ((m = altExit.exec(raw)) !== null) lastEnd = m.index + m[0].length
  let out = lastEnd >= 0 ? raw.slice(lastEnd) : raw
  
  // 2) 끝이 미완성 ESC 시퀀스면 자르기
  const lastEsc = out.lastIndexOf('\x1b')
  if (lastEsc >= 0) {
    const trail = out.slice(lastEsc)
    const finalized = /[\x40-\x7E]/.test(trail.slice(2)) || trail.includes('\x07')
    if (!finalized) out = out.slice(0, lastEsc)
  }
  return out
}
```

**복원 프로세스**:
```typescript
async restoreSaved(): Promise<TerminalSession[]> {
  const sessions = store.get('terminal-sessions') || []
  
  for (const saved of sessions) {
    const { output } = saved
    
    // 1) 기존 세션과 동일한 환경에서 새 PTY 생성
    const newPty = pty.spawn(shell, [], {
      cwd: saved.cwd,
      cols: 80,
      rows: 24
    })
    
    // 2) 정리된 output 복원
    const cleaned = sanitizeForRestore(output)
    
    // 3) PTY 리셋 후 기존 내용 write
    newPty.write('[2J[0;0H')  // 화면 지우기
    newPty.write(cleaned)
    
    // 4) 후속 입력 대기
  }
}
```

### 6. 세션 영속화 (electron-store)

**저장 구조**:
```typescript
interface TerminalSessionMeta {
  id: string
  name: string
  cwd: string
  createdAt: number
}

// 저장
store.set('terminal-sessions', [
  { ...meta, output: outputBuffer.join('') }
])

// 복원
const saved = store.get('terminal-sessions') || []
this.restoreSaved().then(restored => {
  restored.forEach(session => {
    // Renderer에 전달
    mainWindow?.webContents.send(IPC_CHANNELS.TERMINAL_RESTORE, session)
  })
})
```

### 7. 세션 이름 변경 & 영속화

```typescript
async rename(id: string, name: string): Promise<boolean> {
  const session = this.sessions.get(id)
  if (!session) return false
  
  session.meta.name = name
  
  // 즉시 저장 (재시작 후에도 유지)
  const all = Array.from(this.sessions.values()).map(s => s.meta)
  store.set('terminal-sessions-meta', all)
  
  return true
}
```

## IPC 채널

| 채널 | 형식 | 설명 |
|-----|------|------|
| `terminal:create` | invoke | 세션 생성 |
| `terminal:input` | send | 입력 전송 (응답 불필요) |
| `terminal:resize` | send | 터미널 크기 조정 |
| `terminal:kill` | invoke | 세션 종료 |
| `terminal:list` | invoke | 활성 세션 목록 |
| `terminal:output` | on | 출력 스트림 구독 |
| `terminal:restore` | invoke | 저장된 세션 복원 |
| `terminal:rename` | invoke | 세션 이름 변경 |
| `mention:terminal:opened` | on | 멘션이 새 터미널 열었을 때 |
| `mention:terminal:focus` | on | 기존 채널 탭 재사용 요청 |

## UI 통합 (Renderer)

### Terminal Pane 구조

```typescript
// TerminalPane.tsx
export function TerminalPane() {
  const [terminals, setTerminals] = useState<TerminalSession[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const termRefs = useRef<Map<string, XTerminal>>(new Map())

  // 1) 저장된 세션 복원
  useEffect(() => {
    window.api.terminal.restoreSaved().then(restored => {
      setTerminals(restored)
      if (restored.length > 0) setActiveId(restored[0].id)
    })
  }, [])

  // 2) 멘션이 새 터미널 열었을 때
  useEffect(() => {
    const unsub = window.api.terminal.onMentionOpened((meta) => {
      setTerminals(prev => [...prev, meta])
      setActiveId(meta.id)
    })
    return unsub
  }, [])

  // 3) 기존 채널 탭 재사용 요청
  useEffect(() => {
    const unsub = window.api.terminal.onMentionFocus(({ id }) => {
      setActiveId(id)
    })
    return unsub
  }, [])

  // 4) 터미널 출력 구독
  useEffect(() => {
    const unsub = window.api.terminal.onOutput(({ id, data }) => {
      const xterm = termRefs.current.get(id)
      if (xterm) {
        xterm.write(data)
      }
    })
    return unsub
  }, [])

  return (
    <div>
      {/* 탭바 */}
      <div className="tab-bar">
        {terminals.map(t => (
          <div
            key={t.id}
            className={activeId === t.id ? 'active' : ''}
            onClick={() => setActiveId(t.id)}
          >
            {t.name}
          </div>
        ))}
      </div>

      {/* 터미널들 */}
      {terminals.map(t => (
        <TerminalTab
          key={t.id}
          session={t}
          visible={activeId === t.id}
          onRef={ref => termRefs.current.set(t.id, ref)}
        />
      ))}
    </div>
  )
}

// TerminalTab.tsx
function TerminalTab({ session, visible, onRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerminal | null>(null)

  useEffect(() => {
    if (!visible) return
    
    const xterm = new Terminal({
      fontFamily: '...',  // 한글 폰트 포함
      fontSize: 12
    })
    
    // Unicode 11 addon
    xterm.loadAddon(new Unicode11Addon())
    xterm.unicode.activeVersion = '11'
    
    // xterm 마운트
    xterm.open(containerRef.current!)
    termRef.current = xterm
    
    // Resize
    const fit = new FitAddon()
    xterm.loadAddon(fit)
    fit.fit()
    
    // 입력 이벤트
    xterm.onData(data => {
      window.api.terminal.input(session.id, data)
    })
    
    // 크기 변경 시 PTY에 알림
    window.addEventListener('resize', () => {
      fit.fit()
      const { cols, rows } = xterm
      window.api.terminal.resize({ id: session.id, cols, rows })
    })
    
    // 콜백
    onRef(xterm)
    
    return () => xterm.dispose()
  }, [visible])

  return <div ref={containerRef} style={{ height: '100%' }} />
}
```

## 디버깅 팁

### 1. 한글 입력 문제

```bash
# PTY 환경 확인
echo $LANG  # ko_KR.UTF-8 이어야 함

# xterm Unicode 11 활성화 확인
# Renderer 개발자 도구 → Console
// Terminal.ts 초기화 로그 확인
```

### 2. 입력 지연

```typescript
// Input event throttling (선택사항)
const sendInput = useMemo(
  () => debounce((id: string, data: string) => {
    window.api.terminal.input(id, data)
  }, 50),
  []
)

xterm.onData(data => sendInput(session.id, data))
```

### 3. 메모리 누수 확인

```bash
# 터미널 여러 개 열기 → 종료 → DevTools Performance
# 메모리가 해제되는지 확인

# kill 후 정리 확인
window.api.terminal.kill(id).then(() => {
  console.log('[Terminal] 세션 종료:', id)
})
```

## 제약사항

1. **초기 크기 고정** (80×24) — 첫 창 열 때만 설정 가능
2. **폰트 변경** — xterm 리렌더링 필요
3. **대용량 버퍼** — 5000줄 제한 (메모리)
4. **Windows에서 특수 키** — 일부 키 바인딩 미지원

## 참고

- [node-pty 문서](https://github.com/microsoft/node-pty)
- [xterm.js 문서](https://xtermjs.org/)
- [Unicode 11 Addon](https://github.com/xtermjs/xterm.js/tree/master/addons/xterm-addon-unicode11)
