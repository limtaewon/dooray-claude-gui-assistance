---
id: ADR-v2-windows-fix-01
title: 세션 조회는 findProjectDir 단일 경로, 프로젝트 라벨은 jsonl cwd 에서만 — 역치환 코드 물리적 제거
status: proposed
date: 2026-07-30
supersedes: []
domain: windows-compat
---

# 세션 조회·표시의 단일 경로

## 컨텍스트

Clauday 에는 claude 세션을 읽는 경로가 **두 개**다.

| 경로 | 위치 | cwd → 디렉터리 | 디렉터리 → 표시 |
|---|---|---|---|
| A. 서비스 | `ClaudeSessionService.ts:69-71, 106-108` | `cwd.replace(/\//g,'-')` | 없음 (`readMeta` 가 jsonl 의 `cwd` 를 읽음 — 이미 올바름) |
| B. 인라인 | `index.ts:1193-1288` (`CLAUDE_SESSIONS_LIST`) | 없음 (루트 전체 readdir) | `projDir.replace(/-/g,'/')` (**역치환**) |

Phase 1(ADR-v2-utils-01/02)이 이미 결론을 냈다: 정방향은 `encodeCwd`(NFC → 비영숫자 → 200자 캡+해시), 역방향은 **존재할 수 없다**(다대일 손실 변환). 유틸(`findProjectDir`, `readSessionCwd`)도 만들어져 테스트로 계약이 고정돼 있다. 그런데 **아무도 안 쓴다.**

증상은 두 갈래로 나타난다.

- 경로 A: Windows 에서 `C:\Users\me\proj` 에는 `/` 가 없다 → 무변환 → 실제 디렉터리 `C--Users-me-proj` 를 못 찾음 → `listSessions(cwd)` 영구 빈 배열. **Windows 세션 전멸의 단일 원인.**
- 경로 B: mac 에서도 **지금 틀린 값을 화면에 띄우고 있다**. 이 레포 자신이 반례다 — `-Users-nhn-Desktop-dooray-claude-gui-assistance` → `/Users/nhn/Desktop/dooray/claude/gui/assistance`. 존재하지 않는 경로다.

그리고 경로 A 의 테스트(`ClaudeSessionService.test.ts:17-18`)는 **구현과 같은 로직을 복제**한 뒤 private 메서드를 monkeypatch 해서 tmp 디렉터리로 라우팅한다. 규칙이 틀려도 자기일관으로 통과하는 구조라 CI 가 이 결함을 8개월 넘게 놓쳤다.

## 결정

### 1. cwd → 디렉터리 조회는 `findProjectDir` 하나로 수렴

`ClaudeSessionService` 의 `encodeCwd`/`projectDir` private 메서드를 **삭제**하고, `listSessions(cwd)` / `loadSession(sessionId, cwd)` 가 `findProjectDir(cwd, { configDir })` 를 `await` 한다. 못 찾으면 (`undefined`) 현행과 동일하게 빈 결과를 돌려준다 — "이 프로젝트에서 claude 를 쓴 적 없음" 은 정상 상태다(ADR-v2-utils-02 §대안5).

`fullScan` 은 기본값(활성)을 쓴다. 1단 정확 일치가 히트하면 비용은 stat 1회이고, 3단까지 내려가는 것은 **규칙이 드리프트했을 때뿐**이며 그때는 비용보다 기능이 우선이다.

### 2. 프로젝트 루트는 생성자 주입

```ts
constructor(opts?: { configDir?: string })
```

내부에서 `claudeProjectsRoot({ configDir: opts?.configDir })` 로 루트를 잡고, `findProjectDir` 에도 같은 `configDir` 를 전달한다. 테스트는 tmp 디렉터리를 주입한다 — **private 메서드 monkeypatch 를 금지**한다. 이것이 "테스트가 구현을 복제해서 자기일관으로 통과" 를 구조적으로 막는 유일한 방법이다.

### 3. 역치환 코드는 물리적으로 제거하고, 라벨은 cwd 에서만 만든다

`index.ts:1254-1258` 삭제. 대신:

- 기존 `parseFirstMessage` 스트림 파서가 이미 선두 50줄을 흘려보내고 있으므로, 거기에 **`cwd` 문자열 필드 추출만 얹는다**. 추가 파일 I/O 0.
- 라벨 생성은 순수 함수로 분리한다.

```ts
/** 세션 목록에 표시할 프로젝트 라벨. cwd 를 알면 홈 기준 축약, 모르면 인코딩된 디렉터리명을 그대로 노출한다. */
export function formatProjectLabel(
  params: { cwd?: string; encodedDirName: string },
  opts?: { home?: string; platform?: NodeJS.Platform }
): string
```

- `cwd` 가 있고 홈 하위면 `~/…` 로 축약 (현행 UX 보존). 홈 밖이면 절대경로 그대로.
- **`cwd` 가 없으면 `encodedDirName` 을 그대로 반환한다.** 추측한 경로를 만들지 않는다.
- 홈 비교는 `normalizePathForCompare` 기반(win32 대소문자·구분자 무시). 현행의 `homedir().replace(/\\/g,'/')` 직접 비교를 대체한다.

배치는 `src/main/utils/claudeProjects.ts` — 인코딩된 디렉터리명을 다루는 지식은 이미 그 모듈에 모여 있다.

### 4. 캐시된 세션 메타는 재파싱하지 않는다

`sessionCache` 는 `mtimeMs`/`size` 가 같으면 파싱을 건너뛴다. `project` 라벨은 이미 캐시된 `SessionMeta` 안에 들어 있으므로 그대로 재사용한다. 즉 이 변경으로 **캐시 히트 경로의 비용은 0 증가**다. 단, 기존 캐시(잘못된 라벨)는 프로세스 메모리에만 있으므로 앱 재시작이면 자연 소멸한다 — 마이그레이션 불필요.

### 5. 라벨의 진실은 "파일마다" 가 아니라 "디렉터리마다" 이지만, 파일 단위로 계산한다

한 프로젝트 디렉터리 안 모든 jsonl 은 같은 cwd 를 갖는 것이 구조상 정상이다. 그럼에도 라벨을 **파일별로** 계산한다 — 파일들이 `Promise.all` 로 병렬 파싱되므로 "디렉터리 대표 cwd 를 먼저 정한다" 는 순서 의존을 만들면 비결정적이 된다. 파일별 계산은 같은 값을 중복 계산할 뿐 부작용이 없다.

## 대안과 기각 이유

1. **`ClaudeSessionService.encodeCwd` 만 유틸로 갈아끼우고 조회는 그대로 정확 일치** — 기각: Windows 증상 1건은 닫히지만 ADR-v2-utils-02 가 fallback 을 만든 이유(상류 규칙 드리프트 시 조용한 전멸)가 그대로 남는다. 유틸을 만들어놓고 3단 중 1단만 쓰는 것은 비용만 내고 이득을 안 받는 선택이다.
2. **역치환을 "개선" 해서 유지 (존재하는 경로를 찾을 때까지 `-` 를 `/` 로 백트래킹)** — 기각: ADR-v2-utils-01 §대안2 가 이미 기각. 후보가 2^n 이고 `.`·공백·한글은 그래도 복원 불가. 정답이 jsonl 안에 평문으로 있다.
3. **라벨을 못 구하면 그 세션을 목록에서 숨긴다** — 기각: 실측상 프로젝트 디렉터리의 절반가량이 cwd 를 주지 못한다(ADR-v2-utils-02 §부수결정3). 표시 라벨 하나 때문에 세션 자체를 감추면 "이어하기" 진입점이 사라진다. 못생긴 인코딩 문자열이라도 보여주는 편이 낫다.
4. **`readSessionCwd` 를 파일마다 따로 호출** — 기각: `parseFirstMessage` 가 이미 같은 파일을 스트리밍 중이다. 별도 호출은 파일당 open/read 를 한 번 더 하는 것이고, 세션 수만큼 곱해진다. 스트림 파서에 필드 추출 한 줄 얹는 쪽이 정확히 같은 결과에 비용 0.
5. **두 세션 경로(A/B)를 하나로 통합** — 기각: 매력적이지만 이번 트랙의 스코프를 크게 넘는다. A 는 `ClaudeChatPane` 의 이어하기용 메타, B 는 세션 브라우저용 요약이고 반환 타입·캐시 전략·호출 빈도가 다르다. 통합은 별도 트랙에서 다뤄야 하며, 지금 섞으면 Windows 수복이라는 목적이 리팩터에 묻힌다. **본 ADR 은 두 경로가 같은 유틸을 쓰게 만드는 것까지만** 한다.
6. **`configDir` 대신 환경변수(`CLAUDE_CONFIG_DIR`)로 테스트 라우팅** — 기각: 전역 상태다. 병렬 테스트에서 서로 간섭하고, 프로덕션 코드가 테스트를 위해 환경변수를 읽는 형태가 남는다. 생성자 주입이 명시적이고 국소적이다.

## 결과 (Consequences)

- **긍정**
  - Windows 세션 전멸이 닫힌다. mac 의 잘못된 프로젝트 라벨도 같이 고쳐진다 (사용자가 이 트랙에서 유일하게 mac 에서도 눈으로 보게 될 변화).
  - 테스트가 구현 복제를 그만두므로, 앞으로 인코딩 규칙이 어긋나면 CI 가 잡는다.
  - 규칙 드리프트 시 `warn` 로그(`[claudeProjects] fallback hit via=...`)가 실제로 찍히기 시작한다 — Phase 1 이 만든 관측 장치가 이제야 전원이 들어온다.
  - 역치환 함수가 **코드베이스에서 사라진다**. 다음 사람이 복사할 원본이 없어진다.

- **부정 / 트레이드오프**
  - `listSessions`/`loadSession` 이 내부적으로 async fs 조회를 1~N회 더 한다. 히트 경로는 stat 1회지만 **miss 경로(세션 없는 프로젝트)는 전체 스캔**을 돈다 — 프로젝트 디렉터리가 수백 개인 사용자에게는 체감될 수 있다. PRD R7.
  - cwd 를 못 얻은 세션의 라벨이 `-Users-nhn-Desktop-2NEON` 같은 인코딩 문자열로 보인다. 지금은 (틀렸지만) 경로처럼 보이던 것이 못생겨진다. **의도된 후퇴** — 거짓 정보보다 낫다.
  - `ClaudeSessionService` 생성자 시그니처가 바뀐다. `index.ts` 의 생성 지점 1곳 수정 필요.

- **모니터링**
  - `[claudeProjects] fallback hit via=hashPrefix|scan` 이 mac 에서 찍히면 인코딩 규칙 드리프트 신호 — 채집표를 다시 뜬다.
  - `[claudeProjects] readSessionCwd cwd 없음` 이 대량으로 찍히면 jsonl 스키마 변경 신호. 라벨이 인코딩 문자열로 대량 표시되는 것으로도 같이 관측된다.
  - Windows VM 스모크: 세션 목록에 항목이 뜨는지 / 이어하기(`claude -r`)가 붙는지 / 라벨이 `C:\...` 로 보이는지.
