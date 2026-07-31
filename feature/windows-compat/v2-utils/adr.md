---
id: ADR-v2-utils-01
title: encodeCwd 실규칙 = NFC → [^a-zA-Z0-9]→'-' → 200자 캡 + djb2 base36 해시 접미 (역치환 영구 폐기)
status: proposed
date: 2026-07-30
supersedes: []
domain: windows-compat
---

# encodeCwd 실규칙 확정 — 그리고 "디렉터리명 → 경로" 역치환의 영구 폐기

## 컨텍스트

Clauday 는 `~/.claude/projects/{encodedCwd}/{sessionId}.jsonl` 을 **읽기 전용**으로 소비한다 (세션 목록, 이어하기, 사용량 파싱). 이 디렉터리명을 만드는 주체는 claude CLI 이고 우리는 그 규칙을 *추정*해서 써 왔다. 현재 코드에 두 개의 추정이 박혀 있다.

- `ClaudeSessionService.ts:69-71` — `cwd.replace(/\//g, '-')` (정방향 추정)
- `index.ts:1357` — `projDir.replace(/-/g, '/')` (역방향 추정)

둘 다 틀렸다. 그리고 정방향 추정은 **테스트가 같은 로직을 복제**하고 있어서(`ClaudeSessionService.test.ts:17-18`) 자기일관으로 통과한다 — 규칙이 틀려도 CI 가 잡지 못하는 구조다.

증상:

- Windows: `C:\Users\me\proj` 에 `/` 가 없으니 그대로 통과 → 실제 디렉터리 `C--Users-me-proj` 와 불일치 → `listSessions(cwd)` 영구 빈 배열. **Windows 세션 기능 전멸의 단일 원인**.
- mac: `.` 을 안 바꾸므로 `/Users/nhn/.claude` → `-Users-nhn-.claude` (실제는 `-Users-nhn--claude`). 한글/공백 경로도 전부 불일치.
- mac 역치환: 손실 변환을 역으로 되돌릴 수 없다. 이 레포 자신이 반례 — `-Users-nhn-Desktop-dooray-claude-gui-assistance` → `/Users/nhn/Desktop/dooray/claude/gui/assistance`.

v2.0 의 A-1 ~ A-4 전부가 이 규칙 위에 서기 때문에, 추정을 **사실로 대체**하지 않으면 후속 수정이 전부 추정 위에 쌓인다.

## 결정

### 1. 규칙 (근거 2중 확보)

`encodeCwd` 를 아래 3단으로 확정하고, 이것을 `src/main/utils/claudeProjects.ts` 의 **유일한 정의**로 삼는다.

```ts
const MAX_ENCODED_LEN = 200

/** claude CLI 가 ~/.claude/projects 아래 디렉터리명을 만드는 규칙과 동일하게 cwd 를 인코딩한다. */
export function encodeCwd(cwd: string): string {
  const normalized = cwd.normalize('NFC')
  const dashed = normalized.replace(/[^a-zA-Z0-9]/g, '-')
  if (dashed.length <= MAX_ENCODED_LEN) return dashed
  return `${dashed.slice(0, MAX_ENCODED_LEN)}-${base36Abs(djb2(normalized))}`
}

/** claude CLI 내부 해시(djb2 변형)를 32비트 부호있는 정수 의미까지 동일하게 재현한다. */
function djb2(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return h
}
```

핵심 세부 3가지 (전부 틀리기 쉬운 지점):

- **NFC 정규화가 먼저다.** macOS 파일시스템은 한글 파일명을 NFD(자모 분해)로 돌려주는 경우가 흔하고, NFD 면 대시 개수가 달라진다.
- **해시 입력은 대시 치환 *전* 의 NFC 경로**이지 치환 후 문자열이 아니다.
- **캡은 `<= 200` 이면 그대로**, 초과 시에만 `slice(0,200) + '-' + hash`. 결과 길이가 200 을 넘게 되는 것이 정상이다(캡은 접미 전 부분에만 적용).

### 2. 근거 — 실측 채집표 (mac, 2026-07-30, claude 2.1.220)

`~/.claude/projects` 25개 디렉터리 중 내부 jsonl 의 `cwd` 필드로 원본을 복원할 수 있었던 **12개 전부 일치, 불일치 0**. 이 표를 `claudeProjects.test.ts` 의 픽스처로 **그대로** 사용한다.

| 원본 cwd | 실제 디렉터리명 | 이 케이스가 증명하는 것 |
|---|---|---|
| `/` | `-` | 루트 |
| `/Users/nhn` | `-Users-nhn` | 기본형 |
| `/Users/nhn/Downloads` | `-Users-nhn-Downloads` | 기본형 |
| `/Users/nhn/Desktop/발표` | `-Users-nhn-Desktop---` | **한글 1자 = 대시 1개 → NFC 확정** (NFD 면 대시 6개) |
| `/Users/nhn/.claude` | `-Users-nhn--claude` | **`.` 도 대시** → `/`→`-` 규칙 반증 |
| `/Users/nhn/Desktop/2NEON` | `-Users-nhn-Desktop-2NEON` | 숫자·대문자 보존 (소문자화 없음) |
| `/Users/nhn/Desktop/2NEON/backend` | `-Users-nhn-Desktop-2NEON-backend` | 중첩 |
| `/Users/nhn/Desktop/2NEON/backend/src/main` | `-Users-nhn-Desktop-2NEON-backend-src-main` | 깊은 중첩 |
| `/Users/nhn/Desktop/dooray-mcp` | `-Users-nhn-Desktop-dooray-mcp` | **경로 내 대시는 대시로 남음 → 역치환 불가 증명** |
| `/Users/nhn/Desktop/mcp-clickhouse` | `-Users-nhn-Desktop-mcp-clickhouse` | 동일 |
| `/Users/nhn/Desktop/hi-five` | `-Users-nhn-Desktop-hi-five` | 동일 |
| `/Users/nhn/mcp-servers` | `-Users-nhn-mcp-servers` | 동일 |

`발표` 판정 근거: NFC 는 2 코드포인트 → `-Users-nhn-Desktop---`(대시 3 = 슬래시1 + 글자2), NFD 는 5 코드포인트 → `-Users-nhn-Desktop------`(대시 6). 관측값은 전자.

### 3. 근거 — claude CLI 바이너리(v2.1.220) 내부 함수

`~/.local/share/claude/versions/2.1.220` (번들 JS 를 품은 Mach-O) 의 문자열에서 추출:

```js
function art(e){ let t=0; for(let r=0;r<e.length;r++) t=(t<<5)-t+e.charCodeAt(r)|0; return t }
function o0h(e){ return Math.abs(art(e)).toString(36) }
function RA(e){ let t=e.replace(/[^a-zA-Z0-9]/g,"-");
                if(t.length<=iRt) return t;
                return `${t.slice(0,iRt)}-${o0h(e)}` }          // iRt=200
function n9(){ return join(configDir(),"projects") }
function F7(e){ return join(n9(), RA(e)) }
function Fd(e){ return e.normalize("NFC") }
async function GR(e){ try{ return Fd(await realpath(e)) } catch { return Fd(e) } }
```

실측(①)이 커버하지 못한 **200자 캡 + 해시 접미**는 이 소스가 유일 근거다 (본 머신 최장 디렉터리명 55자). PRD R2 로 리스크 등재.

### 4. 역치환(`-` → `/`)의 영구 폐기

디렉터리명에서 원본 경로를 복원하는 코드를 **금지**한다. 인코딩은 다대일 손실 변환이다 (`a-b`, `a/b`, `a.b`, `a b` 가 전부 `a-b`). 원본 cwd 가 필요하면 **jsonl 안의 `cwd` 필드를 읽는다** — `readSessionCwd(jsonlPath)`.

`readSessionCwd` 의 계약(실측 기반):

- `cwd` 는 **첫 줄에 없다.** 실측한 세션 파일의 선두 3줄은 `type: 'mode'` / `'permission-mode'` / `'file-history-snapshot'` 이고 `cwd` 키가 아예 없다. `type: 'user'` 인 4번째 줄에서 처음 등장. → 첫 줄만 파싱하는 구현은 항상 `undefined` 를 얻는다.
- 따라서 **`cwd` 문자열 필드를 가진 첫 줄까지 스캔**하되 상한(예: 200줄 / 256KB)을 둔다.
- `index.ts` 의 기존 `parseFirstMessage` 는 이미 선두 50줄을 스트리밍하므로, 거기에 cwd 추출만 얹으면 **추가 I/O 0**.

### 5. `encodeCwd` 는 순수 함수 — realpath 는 호출자 책임

claude 는 `GR()` 에서 realpath 후 인코딩한다. 그러나 `encodeCwd` 를 async/fs 의존으로 만들면 테스트와 재사용이 나빠진다. → `encodeCwd` 는 동기 순수 함수로 두고, 심볼릭 링크 보정은 `findProjectDir`(ADR-02)이 **원본 cwd 와 realpath(cwd) 두 후보를 모두 시도**하는 방식으로 흡수한다.

## 대안과 기각 이유

1. **현행 `/`→`-` 유지하고 Windows 만 `\`→`-` 추가** — 기각: 실측 반례 2건(`.claude`, `발표`)에 정면으로 반박된다. 공백·한글·점을 포함한 경로는 mac 에서도 계속 깨진다. 증상 하나를 가리고 원인을 남긴다.
2. **디렉터리명 → 경로 역치환을 개선해서 계속 쓴다** (예: 존재하는 경로를 찾을 때까지 `-` 를 `/` 로 하나씩 바꿔보는 백트래킹) — 기각: 후보가 지수적으로 폭발하고(대시 n개면 최대 2^n), 그러고도 `.`/공백/한글은 복원 불가. 무엇보다 **정답이 jsonl 안에 평문으로 들어있다**.
3. **`sessions-index.json` 의 `projectPath` 를 원본 cwd 의 출처로 삼는다** — claude 2.x 가 일부 프로젝트 디렉터리에 만드는 인덱스 파일에 `projectPath`(=원본 cwd) + `summary` + `messageCount` 가 들어있어 매력적으로 보인다. 기각 근거 2가지, 둘 다 실측:
   - **커버리지 8/25.** 나머지 17개 디렉터리에는 파일 자체가 없다.
   - **신뢰 불가.** `-Users-nhn-Desktop-2NEON-backend/sessions-index.json` 은 **32개 엔트리 전부**가 존재하지 않는 jsonl 을 가리킨다(32/32 stale). 게다가 그 디렉터리 이름과 일치하지 않는 `projectPath: '/private/tmp/chunks'` 엔트리를 포함한다.
   → 1급 소스로 쓸 수 없다. (보조 캐시로서의 활용은 후속 트랙에서 별도 판단.)
4. **claude 에게 물어본다 (`claude --print-project-dir` 류)** — 기각: 그런 공개 옵션이 없다. 있더라도 세션 목록 조회마다 프로세스 스폰은 비용이 과하고, `claude -p` 크레딧 정책 변경(2026-06-15) 이후 스폰 자체를 늘리지 않는 것이 프로젝트 방향이다.
5. **200자 캡·해시를 생략하고 단순 치환만 구현** — 기각: 소스에 명시된 분기를 알면서 빼는 것. v2.0 Workstream C 가 만드는 워크트리 경로(`~/Clauday-Workspaces/workspace/` + 한글 태스크 제목 파생 브랜치명, 한글 1자 = 대시 1개)는 200자에 실제로 도달 가능하다. 그때 세션이 조용히 안 잡히면 원인 추적이 매우 어렵다.
6. **NFC 정규화 생략** — 기각: `발표` 실측이 정확히 이것을 판별한다. macOS 에서 `fs.readdir`/드래그앤드롭으로 얻은 경로는 NFD 일 수 있고, 그 경우 대시 수가 달라져 전부 미스매치.

## 결과 (Consequences)

- **긍정**
  - Windows 세션 전멸의 근본 원인이 제거된다 (A-1 이 이 유틸만 소비하면 됨).
  - mac 의 잠재 버그 3종(점 포함 경로 / 대시 포함 레포명 / 한글·공백 경로)이 같이 해소된다. 특히 이 레포 자신의 세션 목록 표시가 고쳐진다.
  - 테스트가 **구현 복제가 아니라 실측 채집표**를 검증하므로, 규칙이 틀리면 CI 가 잡는다. `ClaudeSessionService.test.ts` 의 복제 `encodeCwd` 제거가 A-1 의 필수 항목이 된다.
  - 200자 캡을 미리 구현해 v2.0 Workstream C(워크트리 + 한글 브랜치명) 의 시한폭탄을 선제 제거.

- **부정 / 트레이드오프**
  - claude 의 **비공개 내부 구현에 결합**한다. claude 가 규칙을 바꾸면 우리가 깨진다. → ADR-02 의 3단 fallback + warn 로그가 이 리스크의 전담 완화책이다. 두 ADR 은 짝으로 읽어야 한다.
  - djb2 해시를 우리 코드에 재현하므로, 상류가 해시 함수를 교체하면 캡 경로만 조용히 어긋난다(짧은 경로는 정상 동작하므로 발견이 늦다). → 캡 경로 전용 회귀 테스트 + fallback warn 로그로 관측.
  - 200자 캡 경로는 **실측 근거가 없다**(소스 근거만). PRD R2.
  - `encodeCwd` 가 순수 함수라 심볼릭 링크 경로는 스스로 못 맞춘다. 보정 책임이 `findProjectDir` 로 넘어간다.

- **모니터링**
  - `findProjectDir` 가 1단(정확 일치)이 아닌 2·3단으로 히트하면 `warn` 로그(`cwd`, `expected`, `actual`). 이 로그가 **규칙 드리프트의 조기 경보**다. 로그가 늘기 시작하면 채집표를 다시 뜬다.
  - `readSessionCwd` 가 상한까지 스캔하고도 `cwd` 를 못 찾으면 `warn` (jsonl 스키마 변경 감지).
  - 채집표 재확인 절차는 `plan.md` 1단계에 명령어까지 기록 — claude 메이저 업데이트 후 재실행.
