---
id: ADR-v2-windows-fix-05
title: 스킬 파일명 — 샌타이즈는 쓰기 경계에서만, 읽기/삭제는 경로 봉쇄 검증. delete 는 디렉터리까지 제거하고 심볼릭 링크는 링크만
status: proposed
date: 2026-07-30
supersedes: []
domain: mcp-skills
---

# 스킬 파일명 경계와 삭제 의미론

## 컨텍스트

스킬은 `~/.claude/skills/<name>/SKILL.md` 로 저장된다. `<name>` 의 출처가 셋인데 **셋 다 사용자가 자유롭게 정한 문자열**이다.

- 편집기에서 사용자가 직접 입력 (`SkillsManager.tsx:259`)
- 두레이 위키 페이지 제목 (`SkillsManager.tsx:208`, `:383` — 위키에서 내려받기)
- 로컬 `.md` 파일명 (`SkillsManager.importFromFiles`)

`src/main/config/SkillsManager.ts` 는 이 문자열을 **검증 없이 `join(skillsDir, filename)`** 한다. Windows 에서 `<>:"/\|?*` 는 파일명에 못 쓰고, `CON`/`PRN`/`NUL`/`COM1` 은 예약어이며, 후행 점·공백은 조용히 잘린다. 두레이 위키 제목에 `2026/07 회고` 나 `Q&A: 정리` 가 오는 것은 전혀 특별한 일이 아니다 → Windows 에서 저장 실패. `../../` 가 오면 스킬 디렉터리 밖에 쓴다.

Phase 1 이 `sanitizeSkillFilename`(`src/shared/utils/filename.ts`)을 만들어 뒀지만 **아무도 안 쓴다**.

동시에 별개의 결함이 하나 더 있다.

```ts
async delete(filename: string): Promise<void> {
  const skillFile = join(this.skillsDir, filename, 'SKILL.md')
  if (existsSync(skillFile)) await unlink(skillFile)      // 디렉터리는 남는다
}
```

`list()` 는 `SKILL.md` 가 있는 디렉터리만 스킬로 치므로 목록에서는 사라진다. 그러나 디렉터리는 남아서 ①같은 이름 재저장 시 기존 잔여물(다른 파일들)과 섞이고 ②`~/.claude/skills` 가 빈 디렉터리로 오염된다. 스킬 공유 기능이 심볼릭 링크로 스킬을 거는 경로가 있어(`SkillStore`) 링크와 실디렉터리를 구분해 지워야 한다.

세 번째로 `ConfigWatcher.start()` 는 `~/.claude/skills`·`commands` 를 watch 하는데 **디렉터리가 없으면 chokidar 가 조용히 무시**한다. 신규 사용자는 스킬을 처음 만들 때까지 변경 감지가 죽어 있고, 그 사실이 어디에도 안 보인다(`error` 이벤트 미구독).

## 결정

### 1. 샌타이즈는 **쓰기 경계에서만**

`sanitizeSkillFilename` 을 적용하는 곳:

| 위치 | 이유 |
|---|---|
| `SkillsManager.save`(main) | 최종 권위. 어떤 경로로 들어와도 여기서 정규화된다 |
| `SkillsManager.importFromFiles` | `basename` 결과가 곧 디렉터리명 → `save` 경유로 자동 적용 |
| `SkillsManager.exportToFolder` | 내보낼 `.md` 파일명 (사용자 선택 폴더에 쓴다) |
| renderer `SkillsManager.tsx:208`, `:383` | 위키 제목 → **저장 요청 전에** 정제. 토스트에 실제 저장된 이름을 보여주기 위함 (main 만 정제하면 UI 가 거짓말을 한다) |

### 2. 읽기/삭제는 이름을 **변형하지 않고 봉쇄만 검증**

`read`/`delete` 에 sanitize 를 적용하면 **기존 스킬에 접근할 수 없게 된다**. mac/Linux 에서는 `Q&A: 정리` 같은 디렉터리가 정상적으로 존재할 수 있는데, 읽을 때 이름을 `Q&A_ 정리` 로 바꾸면 ENOENT 다. 사용자 입장에서는 "업데이트했더니 스킬이 사라졌다".

대신 traversal 만 막는다 — 그리고 이것은 sanitize 보다 **강한** 보증이다.

```ts
/** skillsDir 하위 경로임을 보장한다. 벗어나면 throw. 이름은 변형하지 않는다. */
private resolveSkillDir(filename: string): string {
  const dir = resolve(this.skillsDir, filename)
  const root = resolve(this.skillsDir)
  if (dir !== root && !dir.startsWith(root + sep)) throw new Error('잘못된 스킬 이름')
  if (dir === root) throw new Error('잘못된 스킬 이름')
  return dir
}
```

`save` 도 sanitize **후에** 이 검증을 한 번 더 통과시킨다(이중 방어 — sanitize 규칙에 구멍이 나도 파일시스템 경계는 지켜진다).

즉: **sanitize = Windows 호환을 위한 정규화, 봉쇄 검증 = 보안 경계.** 둘은 목적이 다르고 적용 지점도 다르다.

### 3. `delete` 의미론 — 링크는 링크만, 디렉터리는 재귀

```
lstat(target)
  ├ 심볼릭 링크  → unlink(target)          // 링크 대상(원본 스킬)은 보존
  ├ 디렉터리     → rm(target, { recursive: true, force: true })
  └ 없음         → no-op (현행과 동일, throw 안 함)
```

`deleteMany` 는 현행대로 항목별 best-effort 지만, **실패를 조용히 삼키지 않는다** — 실패 건수를 세어 반환값에 포함하고 `warn` 로그를 남긴다(사용자 CLAUDE.md §4). 반환 타입은 `{ deleted: number; failed: number }` 로 확장.

### 4. `ConfigWatcher` — watch 전 선생성 + error 구독

```ts
for (const dir of [skillsDir, commandsDir]) {
  try { mkdirSync(dir, { recursive: true }) }
  catch (error) { console.warn('[ConfigWatcher] 디렉터리 생성 실패', { dir, error }) }
}
this.watcher = chokidar.watch(watchPaths, { ... })
this.watcher.on('error', (error) => console.warn('[ConfigWatcher] watch 오류', { error }))
```

`settings.json` 은 **파일**이므로 선생성하지 않는다(빈 파일을 만들면 claude 본체가 그것을 설정으로 읽는다 — 우리가 남의 설정 파일을 만들면 안 된다).

## 대안과 기각 이유

1. **read/delete 에도 sanitize 적용 (마스터 계획 문면 그대로)** — 기각: §2. 기존 비정규 이름 스킬이 접근 불가가 된다. 마스터 계획의 의도(traversal 차단)는 봉쇄 검증이 더 정확하게 달성한다. **계획보다 정확한 수단이 있으면 수단을 바꾼다** — 다만 이 편차는 여기에 명시적으로 기록한다.
2. **read/delete 에서 원본 이름 우선, 없으면 sanitize 결과로 재시도** — 기각: 레거시 호환은 되지만 `../../etc` 가 실존하면 그것을 열어준다. 봉쇄 검증 없이 "존재하면 통과" 는 정확히 traversal 취약점이다.
3. **저장 시 이름 변경 없이 거부 (에러 반환)** — 기각: 위키에서 내려받는 흐름은 사용자가 이름을 고를 기회가 없다. "제목에 `:` 가 있어서 못 받습니다" 는 해결 불가능한 오류다.
4. **디렉터리명 대신 해시/UUID 를 쓰고 표시명은 메타데이터로** — 기각: `~/.claude/skills/<name>/SKILL.md` 는 **claude 본체가 정한 규약**이다. 디렉터리명이 곧 스킬 이름이고 claude 가 그것을 읽는다. 우리가 바꿀 수 있는 값이 아니다.
5. **`delete` 를 `rm -rf` 만 하고 심볼릭 링크 구분 안 함** — 기각: `rm(recursive)` 를 심볼릭 링크에 걸면 링크 자체는 지워지지만, 구현/플랫폼에 따라 대상까지 따라갈 위험이 있다. 스킬 공유가 링크를 거는 구조라 원본(다른 스킬의 실체)이 지워지면 복구 불가다. `lstat` 분기가 3줄이고 위험은 크다.
6. **`ConfigWatcher` 에서 `settings.json` 도 빈 파일로 선생성** — 기각: §4. 남의 설정 파일을 우리가 만드는 것은 침습적이다. 파일이 없으면 chokidar 가 상위 디렉터리 변화로 생성을 감지한다.
7. **renderer 는 정제하지 않고 main 결과를 받아 표시** — 기각: `skills.save` 는 `void` 를 반환한다. 반환 타입을 바꾸면 IPC 계약 변경이고, 그럴 바에는 shared 유틸을 renderer 가 직접 부르는 편이 왕복 0 이다(Phase 1 이 `filename.ts` 를 `shared` 에 둔 이유가 정확히 이것 — ADR-v2-utils PRD R5).

## 결과 (Consequences)

- **긍정**
  - Windows 에서 위키 스킬 내려받기가 동작한다. 두레이 제목에 `/`·`:` 가 있어도 저장된다.
  - traversal 이 3개 진입점 모두에서 막힌다 — 그것도 이름 변형이 아니라 파일시스템 경계 검증으로.
  - 스킬 삭제 후 디렉터리가 남지 않는다. 공유 링크 원본은 보존된다.
  - 신규 사용자도 스킬/커맨드 변경 감지가 처음부터 동작한다.
  - `sanitizeSkillFilename` 이 죽은 코드에서 벗어난다.

- **부정 / 트레이드오프**
  - **이름이 조용히 바뀐다.** `Q&A: 정리` → `Q&A_ 정리`. 사용자는 위키와 로컬의 이름이 다른 것을 보게 된다. renderer 가 정제된 이름으로 토스트를 띄우는 것이 유일한 완화책이고, 편집기 입력(`:259`)에는 실시간 힌트를 붙이는 것을 권장(P2).
  - 위키 제목이 다른 두 스킬이 같은 이름으로 정제되면 **덮어쓴다**(예: `A/B` 와 `A:B` → `A_B`). 충돌 감지·번호 접미는 이번 스코프 밖 — 발생 빈도가 낮고, 감지하려면 목록 조회가 선행돼야 해서 저장 경로가 복잡해진다. 백로그.
  - `delete` 가 재귀 삭제로 바뀐다. 사용자가 스킬 디렉터리 안에 직접 넣어둔 보조 파일(참고 자료 등)이 같이 사라진다 — 스킬 단위 삭제의 자연스러운 의미이긴 하나 현행보다 파괴적이다. 확인 다이얼로그는 이미 renderer 에 있다.
  - `deleteMany` 반환 타입 확장 → preload/renderer/mock 동반 수정.

- **모니터링**
  - `[ConfigWatcher] watch 오류` 가 찍히면 권한/경로 문제 — 지금까지 안 보이던 실패가 드디어 보이게 된다(초기에 로그가 늘 수 있음).
  - `[SkillsManager] 삭제 실패` warn 빈도.
  - Windows VM: ①`Q&A: 정리` 제목 위키 스킬 내려받기 ②삭제 후 `dir %USERPROFILE%\.claude\skills` 로 잔존 확인 ③신규 사용자(스킬 0개)에서 변경 감지.
