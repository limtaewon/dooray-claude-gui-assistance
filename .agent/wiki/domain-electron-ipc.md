# Domain — Electron IPC

> main ↔ renderer 경계. 모든 IPC 는 *반드시* 이 도메인의 규약을 따른다.

## 핵심 파일

- `src/shared/types/ipc.ts` — `IPC_CHANNELS` 단일 카탈로그 (모든 채널 키)
- `src/preload/index.ts` — `contextBridge.exposeInMainWorld('api', ...)` — 렌더러가 보는 단일 입구
- `src/main/index.ts` — `ipcMain.handle(channel, handler)` 등록 (≈1700줄)

## 채널 명명 규칙

`<도메인>:<액션>` 또는 `<도메인>:<리소스>:<액션>`. 예:
- `mcp:list`, `mcp:add`, `mcp:update`, `mcp:delete`
- `dooray:tasks:list`, `dooray:wiki:get`, `caldav:full-sync`
- `terminal:create`, `terminal:input`, `terminal:resize`, `terminal:kill`
- `claude:chat:send`, `claude:chat:event`, `claude:session:list`

채널 키는 *항상* `IPC_CHANNELS` 상수로 참조. 문자열 리터럴 직접 쓰지 말 것.

## 핸들러 추가 절차 (Definition of Done 포함)

새 IPC 한 개 추가는 *반드시* 다음 3+1 단계:

1. **`src/shared/types/ipc.ts`** — `IPC_CHANNELS` 에 키 추가 + 필요한 payload/result 타입을 `src/shared/types/<domain>.ts` 에 정의
2. **`src/preload/index.ts`** — `api.<도메인>.<메서드>` 형태로 expose. `ipcRenderer.invoke(IPC_CHANNELS.XXX, args)` 래핑.
3. **`src/main/index.ts`** — `ipcMain.handle(IPC_CHANNELS.XXX, (e, args) => service.method(args))` 등록.
4. **테스트**: 메인 로직은 service 클래스에 두고 vitest 단위 추가 (electron 의존 없이 순수 함수/클래스로 테스트). IPC 핸들러 자체는 얇은 어댑터로 유지.

> ⚠ 3곳을 모두 동기화하지 않으면:
> - shared 키 빠뜨림 → 타입 에러 (좋음, 컴파일 단계에서 잡힘)
> - preload 빠뜨림 → 렌더러에서 `window.api.foo is not a function`
> - main handle 빠뜨림 → "No handler registered for 'foo'" 런타임 에러

## 메인 → 렌더러 (push)

요청-응답이 아니라 메인에서 렌더러로 *알리는* 경우는 `mainWindow.webContents.send(channel, payload)` 사용. 예:

- `IPC_CHANNELS.TERMINAL_OUTPUT` — PTY 출력 청크
- `IPC_CHANNELS.CLAUDE_CHAT_EVENT` — Claude CLI 스트림 이벤트
- `IPC_CHANNELS.WATCHER_NEW_MESSAGES` — 채널 모니터 신규 메시지
- `IPC_CHANNELS.BOT_STATE_UPDATE` — Socket Mode 연결 상태
- `IPC_CHANNELS.MENTION_RECEIVED` — @clauday 멘션 알림

이런 push 채널은 preload 에서 `ipcRenderer.on(channel, listener)` 형태로 노출. **반드시 unsubscribe 함수도 함께 반환**.

## 디자인 결정 (왜 이렇게?)

- **하나의 거대한 `main/index.ts`**: 1700줄. 일견 무겁지만 *핸들러 등록만* 모여 있어 검색하기 쉽다. 비즈니스 로직은 각 service 클래스로 위임.
- **shared 타입 우선 정의**: main↔renderer 양쪽 컴파일러가 같은 타입을 본다 → 런타임 미스매치 0.
- **renderer 별칭 (`@`, `@shared`) 만 사용**: main/preload 는 일반 상대 경로. 이유 — vite alias 는 renderer 빌드에만 적용됨.

## 함정

- **`null/undefined` 전송**: IPC payload 는 구조적 클론 — `undefined` 값은 사라짐. 옵셔널 필드에 `null` 사용 권장.
- **Buffer/Date 직렬화**: Date 는 string 으로 변환됨. Buffer 는 Uint8Array 로. 양쪽 타입 정의에서 명시할 것.
- **handler 가 throw 하면**: 렌더러 측 `await ...` 가 reject. 절대 try/catch 안 하고 그냥 throw 해서 호출자가 처리하게 둘 것 (메인에서 swallow 하면 디버깅 지옥).

## 공용 IPC 도메인 한눈에

`IPC_CHANNELS` 에서 묶음 단위로 보면:
- MCP / Skills / Clauday Skills / Shared Skills
- Terminal (+ mention 터미널 알림)
- Claude Chat / Claude Sessions / Claude Insights / Claude CLI Info
- Dooray (REST + Task + Wiki + Calendar + Messenger + Bot/Socket + Watcher)
- CalDAV + Calendar (unified)
- AI (ask / briefing / report / generate-* / recommend / compose-message)
- Settings / Briefing Store / Analytics / Dialog / Error report / Config watcher
- Git Worktree
- Shell utilities

## 갱신 정책

- 채널 추가/삭제마다 본 문서 §"공용 IPC 도메인 한눈에" 묶음 그대로 유지 (개별 채널은 안 적고 *카테고리* 만)
- IPC 디자인 결정이 바뀌면 §"디자인 결정" 갱신
