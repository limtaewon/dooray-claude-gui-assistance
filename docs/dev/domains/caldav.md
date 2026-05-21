# 도메인: CalDAV 캘린더 통합 (v1.5)

v1.5부터 두레이의 네이티브 캘린더 API 대신 CalDAV(표준 프로토콜)를 사용합니다. 이제 Google Calendar, Outlook, iCloud 등과도 통합 가능합니다.

## 아키텍처

```
UnifiedCalendarService (통합 인터페이스)
├─ CalDAVClient (원격 CalDAV 서버)
│  ├─ 자격증명 저장 (keytar)
│  ├─ 일정 동기화 (fullSync/incremental)
│  └─ CRUD 작업
├─ LocalEventStore (로컬 저장소)
│  └─ 앱 시작 후 생성된 일정
└─ CTagPoller (변경 감지)
   └─ 주기적 폴링 (30초)
```

## 진입점

| 파일 | 역할 |
|-----|------|
| `src/main/caldav/UnifiedCalendarService.ts` | 통합 인터페이스 |
| `src/main/caldav/CalDAVClient.ts` | tsdav 래퍼 |
| `src/main/caldav/CredentialStore.ts` | 자격증명 (keytar) |
| `src/main/caldav/LocalEventStore.ts` | 로컬 일정 저장소 |
| `src/main/caldav/CTagPoller.ts` | 변경 감지 |
| `src/main/caldav/ical.ts` | iCalendar 파싱 |

## CalDAVClient (tsdav 래퍼)

```typescript
export class CalDAVClient {
  private client: DAVClient | null = null
  
  async testConnect(input: CalDAVSaveCredentialsInput): Promise<CalDAVTestResult> {
    // 1) 엔드포인트 연결 테스트
    try {
      const client = new DAVClient({
        serverUrl: input.serverUrl,
        credentials: {
          username: input.username,
          password: input.password
        }
      })
      
      // 2) 캘린더 목록 조회 (권한 확인)
      const calendars = await client.fetchCalendars()
      
      return {
        ok: true,
        calendars: calendars.map(c => ({ name: c.displayName, url: c.url }))
      }
    } catch (err) {
      return {
        ok: false,
        error: (err as Error).message
      }
    }
  }

  async fetchCalendars(): Promise<CalDAVCalendar[]> {
    if (!this.client) throw new Error('Not connected')
    
    const cals = await this.client.fetchCalendars()
    return cals.map(c => ({
      id: c.url,
      name: c.displayName,
      color: c.calendarColor,
      url: c.url
    }))
  }

  async fetchEvents(query: CalDAVEventQuery): Promise<CalDAVEvent[]> {
    if (!this.client) throw new Error('Not connected')
    
    // 시간 범위 + 캘린더 필터링
    const objects = await this.client.fetchCalendarObjects({
      calendar: { url: query.calendarUrl },
      timeRange: {
        start: new Date(query.from),
        end: new Date(query.to)
      }
    })
    
    return objects.map(o => parseICalendar(o.data))
  }

  async createEvent(input: CalDAVEventCreate): Promise<void> {
    if (!this.client) throw new Error('Not connected')
    
    // iCalendar 형식으로 변환
    const ical = buildICalendar(input)
    
    await this.client.createCalendarObject({
      calendar: { url: input.calendarUrl },
      filename: `${input.eventId}.ics`,
      iCalString: ical
    })
  }

  async deleteEvent(p: { url: string; etag?: string }): Promise<void> {
    if (!this.client) throw new Error('Not connected')
    
    await this.client.deleteCalendarObject({
      calendarObject: { url: p.url, etag: p.etag }
    })
  }
}
```

## CredentialStore (keytar)

자격증명은 OS 키체인에 암호화되어 저장됩니다.

```typescript
export class CredentialStore {
  private readonly SERVICE = 'clauday'
  
  async saveCredentials(input: CalDAVSaveCredentialsInput): Promise<void> {
    // keytar를 사용해 OS 키체인에 저장
    await keytar.setPassword(
      this.SERVICE,
      `caldav-username`,
      input.username
    )
    await keytar.setPassword(
      this.SERVICE,
      `caldav-password`,
      input.password
    )
    await keytar.setPassword(
      this.SERVICE,
      `caldav-endpoint`,
      input.serverUrl
    )
  }

  async getCredentials(): Promise<CalDAVSaveCredentialsInput | null> {
    const username = await keytar.getPassword(this.SERVICE, 'caldav-username')
    const password = await keytar.getPassword(this.SERVICE, 'caldav-password')
    const serverUrl = await keytar.getPassword(this.SERVICE, 'caldav-endpoint')
    
    if (!username || !password || !serverUrl) return null
    
    return { username, password, serverUrl }
  }

  async deleteCredentials(): Promise<void> {
    await keytar.deletePassword(this.SERVICE, 'caldav-username')
    await keytar.deletePassword(this.SERVICE, 'caldav-password')
    await keytar.deletePassword(this.SERVICE, 'caldav-endpoint')
  }

  static has(): boolean {
    // 자격증명 존재 여부 (동기)
    try {
      const stored = getStorageSync()  // native getPassword의 동기 버전
      return !!stored.username && !!stored.password
    } catch {
      return false
    }
  }
}
```

## LocalEventStore (앱 내 일정)

```typescript
export class LocalEventStore {
  private filePath = join(homedir(), '.clauday', 'local-events.json')
  
  async list(from: string, to: string): Promise<UnifiedEvent[]> {
    const data = this.readFile()
    const fromTime = new Date(from).getTime()
    const toTime = new Date(to).getTime()
    
    return data.events.filter(e => {
      const startTime = new Date(e.start).getTime()
      return startTime >= fromTime && startTime <= toTime
    })
  }

  async create(input: LocalCalendarCreate): Promise<UnifiedEvent> {
    const data = this.readFile()
    const event: UnifiedEvent = {
      id: randomUUID(),
      source: 'local',
      summary: input.summary,
      start: input.start,
      end: input.end,
      description: input.description,
      allDay: input.allDay || false,
      calendarId: input.calendarId
    }
    
    data.events.push(event)
    this.writeFile(data)
    
    return event
  }

  async delete(id: string): Promise<void> {
    const data = this.readFile()
    data.events = data.events.filter(e => e.id !== id)
    this.writeFile(data)
  }

  private readFile(): { events: UnifiedEvent[] } {
    if (!existsSync(this.filePath)) {
      return { events: [] }
    }
    return JSON.parse(readFileSync(this.filePath, 'utf-8'))
  }

  private writeFile(data: any): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(data, null, 2))
  }
}
```

## CTagPoller (변경 감지)

CalDAV는 CTag(calendar tag)로 변경을 감지합니다.

```typescript
export class CTagPoller {
  private interval: NodeJS.Timeout | null = null
  private lastCtags: Map<string, string> = new Map()

  start(): void {
    this.interval = setInterval(() => {
      this.poll().catch(err => console.error('[CTagPoller]:', err))
    }, 30000)  // 30초마다
  }

  private async poll(): Promise<void> {
    const calendars = await caldavClient.fetchCalendars()
    
    for (const cal of calendars) {
      const lastCTag = this.lastCtags.get(cal.id)
      const currentCTag = cal.ctag
      
      // CTag가 변경됨 = 캘린더 수정됨
      if (lastCTag && currentCTag !== lastCTag) {
        console.log(`[CTagPoller] ${cal.name} 변경 감지`)
        
        // incremental sync
        await unifiedCalendar.incrementalSync()
        
        // Renderer에 알림
        mainWindow?.webContents.send('caldav-updated')
      }
      
      this.lastCtags.set(cal.id, currentCTag || '')
    }
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval)
  }
}
```

## UnifiedCalendarService (통합 인터페이스)

```typescript
export class UnifiedCalendarService {
  constructor(
    private caldav: CalDAVClient,
    private local: LocalEventStore,
    private holidays: HolidayService
  ) {}

  async listCalendars(): Promise<UnifiedCalendar[]> {
    const caldavCals = await this.caldav.fetchCalendars()
    const localCals = [{ id: 'local', name: '로컬 캘린더' }]
    
    return [...caldavCals, ...localCals]
  }

  async listEvents(query: UnifiedEventQuery): Promise<UnifiedEvent[]> {
    const from = query.from
    const to = query.to

    const [caldavEvents, localEvents, holidays] = await Promise.all([
      this.caldav.fetchEvents({ from, to, calendarUrl: '*' }),
      this.local.list(from, to),
      this.holidays.getHolidays()
    ])

    // 공휴일을 일정으로 추가
    const holidayEvents = holidays.map(h => ({
      id: `holiday-${h.date}`,
      source: 'system',
      summary: h.name,
      start: h.date,
      end: h.date,
      allDay: true,
      calendarId: 'holidays'
    }))

    return [...caldavEvents, ...localEvents, ...holidayEvents]
  }

  async createEvent(input: UnifiedEventCreate): Promise<UnifiedEvent> {
    if (input.source === 'local') {
      return await this.local.create(input as LocalCalendarCreate)
    } else if (input.source === 'caldav') {
      await this.caldav.createEvent(input as CalDAVEventCreate)
      // API에서 응답 안 하므로 메모리에만 저장
      return { ...input, id: randomUUID() }
    }
    throw new Error('Invalid source')
  }

  async deleteEvent(p: UnifiedEventDeleteRequest): Promise<void> {
    if (p.source === 'local') {
      await this.local.delete(p.id)
    } else if (p.source === 'caldav') {
      await this.caldav.deleteEvent({
        url: p.caldavUrl!,
        etag: p.etag
      })
    }
  }

  async fullSync(): Promise<{ totalObjects: number }> {
    // 초기 동기화: 전체 일정 다운로드
    const result = await caldavObjectsStore.fullSync()
    mainWindow?.webContents.send('caldav-updated')
    return result
  }

  async incrementalSync(): Promise<boolean> {
    // 변경분만 동기화
    const changed = await caldavObjectsStore.incrementalSync()
    if (changed) {
      mainWindow?.webContents.send('caldav-updated')
    }
    return changed
  }
}
```

## IPC 핸들러

```typescript
// CalDAV 설정
ipcMain.handle(IPC_CHANNELS.CALDAV_TEST_CONNECT, async (_, input) => {
  return caldavClient.testConnect(input)
})

ipcMain.handle(IPC_CHANNELS.CALDAV_SAVE_CREDENTIALS, async (_, input) => {
  await credentialStore.saveCredentials(input)
  return { ok: true }
})

ipcMain.handle(IPC_CHANNELS.CALDAV_STATUS, async () => {
  const creds = await credentialStore.getCredentials()
  return { connected: !!creds }
})

// 일정 조회
ipcMain.handle(IPC_CHANNELS.CALENDAR_LIST_CALENDARS, async () => {
  return unifiedCalendar.listCalendars()
})

ipcMain.handle(IPC_CHANNELS.CALENDAR_LIST_EVENTS, async (_, query) => {
  return unifiedCalendar.listEvents(query)
})

// 일정 생성/삭제
ipcMain.handle(IPC_CHANNELS.CALENDAR_CREATE_EVENT, async (_, input) => {
  return unifiedCalendar.createEvent(input)
})

ipcMain.handle(IPC_CHANNELS.CALENDAR_DELETE_EVENT, async (_, p) => {
  await unifiedCalendar.deleteEvent(p)
})

// 동기화
ipcMain.handle(IPC_CHANNELS.CALDAV_FULL_SYNC, async () => {
  return unifiedCalendar.fullSync()
})

ipcMain.handle(IPC_CHANNELS.CALDAV_INCREMENTAL_SYNC, async () => {
  return unifiedCalendar.incrementalSync()
})
```

## Renderer: Settings 페이지

```typescript
// CalendarSettings.tsx
export function CalendarSettings() {
  const [status, setStatus] = useState<CalDAVCredentialStatus>({ connected: false })
  const [form, setForm] = useState<CalDAVSaveCredentialsInput>({
    serverUrl: '',
    username: '',
    password: ''
  })
  const [syncProgress, setSyncProgress] = useState<SyncProgressPayload | null>(null)

  useEffect(() => {
    window.api.caldav.status().then(setStatus)
    
    // 동기화 진행률 구독
    const unsub = window.api.caldav.onSyncProgress(setSyncProgress)
    return unsub
  }, [])

  const handleConnect = async () => {
    const result = await window.api.caldav.testConnect(form)
    if (result.ok) {
      await window.api.caldav.saveCredentials(form)
      setStatus({ connected: true })
      
      // 전체 동기화 시작
      const result = await window.api.caldav.fullSync()
      console.log('동기화 완료:', result)
    }
  }

  return (
    <div>
      <h3>CalDAV 설정</h3>
      
      <input
        placeholder="예: https://caldav.google.com/calendar/dav/"
        value={form.serverUrl}
        onChange={e => setForm({ ...form, serverUrl: e.target.value })}
      />
      
      <input
        placeholder="사용자명"
        value={form.username}
        onChange={e => setForm({ ...form, username: e.target.value })}
      />
      
      <input
        type="password"
        placeholder="비밀번호"
        value={form.password}
        onChange={e => setForm({ ...form, password: e.target.value })}
      />
      
      <button onClick={handleConnect} disabled={!form.serverUrl}>
        연결
      </button>
      
      {syncProgress && 'current' in syncProgress && (
        <div>
          동기화 중: {syncProgress.current}/{syncProgress.total}
        </div>
      )}
      
      {status.connected && (
        <div>
          <p>연결됨</p>
          <button onClick={() => window.api.caldav.disconnect()}>
            연결 해제
          </button>
        </div>
      )}
    </div>
  )
}
```

## 마이그레이션 (v1.4 → v1.5)

기존 두레이 일정은 자동으로 마이그레이션되지 않습니다.

**사용자가 해야 할 일**:
1. Settings → Calendar에서 CalDAV 엔드포인트 설정
2. 필요시 기존 두레이 일정을 로컬 캘린더에 수동 복사

## 참고

- [CalDAV RFC 4791](https://tools.ietf.org/html/rfc4791)
- [tsdav 문서](https://github.com/ndom91/tsdav)
- [iCalendar 포맷 (RFC 5545)](https://tools.ietf.org/html/rfc5545)
