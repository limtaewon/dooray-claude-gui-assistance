---
id: ADR-v2-utils-02
title: findProjectDir 3단 조회 (정확 일치 → 해시 prefix → 전체 스캔) + fallback 히트 시 warn 로그
status: proposed
date: 2026-07-30
supersedes: []
domain: windows-compat
---

# findProjectDir — 3단 조회와 드리프트 관측

## 컨텍스트

ADR-01 이 `encodeCwd` 규칙을 확정했지만, 그 규칙은 **claude 의 비공개 내부 구현**이다. claude 가 규칙을 바꾸는 순간 Clauday 의 세션 기능은 다시 조용히 전멸한다 — 그것도 예외 없이, 빈 목록만 보여주면서.

"규칙을 정확히 안다" 와 "규칙이 계속 맞을 것이다" 는 다른 명제다. 후자를 가정하지 않는 조회 전략이 필요하다.

동시에, 규칙 자체에 이미 다대일 대응이 존재한다:

- 200자 초과 경로는 `slice(0,200)-{hash}` 형태 → **해시 함수가 버전에 따라 바뀌면 같은 prefix 에 다른 접미**를 가진 디렉터리가 공존한다. claude 자신이 이 상황을 상정하고 있다.
- 심볼릭 링크: claude 는 encode 전에 `realpath` 를 적용한다(`GR()`). 우리 호출자가 넘기는 cwd 는 realpath 이전일 수 있다 (mac `/tmp` → `/private/tmp`).

claude 바이너리에서 추출한 자신의 조회 함수가 이미 2단이다:

```js
async function MM(e){
  let t = F7(e), r = []                      // F7 = join(projectsDir, RA(cwd))
  try { await readdir(t); r.push(t) } catch {}
  let n = RA(e)
  if (n.length <= iRt) return r              // 짧으면 정확 일치 후보만
  let o = n.slice(0, iRt) + "-", i = n9()    // 길면 같은 prefix 의 다른 해시도 수집
  try {
    for (let s of await readdir(i, { withFileTypes: true })) {
      if (!s.isDirectory() || !s.name.startsWith(o)) continue
      let a = join(i, s.name); if (a !== t) r.push(a)
    }
  } catch {}
  return r
}
```

또 claude 는 세션 ID 로 찾을 때 **모든 프로젝트 디렉터리를 훑는 경로**(`crossWorktree`, `via: "projectDirScan"`)를 별도로 갖고 있다. 즉 상류도 "디렉터리명 계산만으로는 부족하다" 는 전제로 설계되어 있다.

## 결정

`findProjectDir(cwd)` 를 **3단 캐스케이드**로 구현한다. 앞 단계가 히트하면 즉시 반환하고, 뒤 단계로 내려갈수록 비싸지고 **`warn` 로그를 남긴다**.

```
1단 — 정확 일치 (비용: stat 1~2회)
     join(projectsRoot, encodeCwd(cwd)) 존재?  → 히트, 로그 없음(정상 경로)
     실패 시 realpath(cwd) 로 1회 재시도       → 히트하면 debug 로그

2단 — 해시 prefix 스캔 (비용: readdir 1회, encodeCwd 결과가 200자 초과일 때만)
     projectsRoot 를 readdir 해서 `encoded.slice(0,200) + '-'` 로 시작하는 디렉터리
     → 히트 시 warn: "해시 접미 불일치 — claude 해시 규칙 변경 가능성"

3단 — 전체 스캔 (비용: readdir + 디렉터리당 jsonl 1개 부분 읽기)
     각 프로젝트 디렉터리에서 jsonl 하나를 골라 readSessionCwd 로 실제 cwd 를 읽고
     samePath(cwd, 실제cwd) 비교
     → 히트 시 warn: "인코딩 규칙 드리프트 — cwd={} expected={} actual={}"
     → 미스 시 undefined 반환 (throw 안 함)
```

부수 결정 5가지:

1. **3단은 기본 활성.** "느리니까 옵션으로" 가 아니다. 3단이 꺼져 있으면 드리프트가 사용자에게 "세션 없음" 으로만 보인다. 다만 `findProjectDir(cwd, { fullScan?: boolean })` 로 끌 수 있게 해서, 대량 반복 호출(예: 목록 전체 순회) 에서는 호출자가 판단하게 한다.
2. **3단의 디렉터리당 비용 상한** — 디렉터리마다 jsonl **1개**(가장 최근 mtime)만, `readSessionCwd` 의 스캔 상한 안에서 읽는다. 25개 디렉터리 기준 최악 25회 부분 읽기.
3. **jsonl 이 없는 디렉터리는 조용히 skip.** 실측상 25개 중 13개가 `cwd` 를 못 준다 (`memory/` 나 `sessions-index.json` 만 있음). 이건 오류가 아니라 정상 상태다. → 3단은 "찾으면 좋고" 이지 완전한 커버리지를 주지 않는다. 이 한계를 계약에 명시한다.
4. **`samePath`(ADR-03 이 아닌 `paths.ts` 제공) 로 비교.** 문자열 `===` 로 비교하면 win32 대소문자·구분자 차이로 3단이 무력화된다.
5. **반환 타입은 `string | undefined`.** 존재하지 않는 경로를 반환하지 않는다 (현행 `projectDir()` 는 존재 여부와 무관하게 문자열을 만들어 반환해서, 호출자가 "빈 디렉터리" 와 "잘못 계산된 경로" 를 구분할 수 없다). 어느 단계에서 히트했는지는 `findProjectDirDetailed()` 가 `{ dir, via: 'exact'|'realpath'|'hashPrefix'|'scan' }` 로 반환.

`projectsRoot` 는 `CLAUDE_CONFIG_DIR` 환경변수를 존중한다 (claude 가 인식하는 변수). 기본 `~/.claude`. 테스트를 위해 파라미터 주입 가능.

## 대안과 기각 이유

1. **1단만 (정확 일치) — 규칙을 믿는다** — 기각: 이 프로젝트는 이미 그렇게 해서 Windows 전멸을 겪었다. 실패 모드가 "빈 목록" 이라 사용자도 개발자도 원인을 못 찾는다. 규칙이 정확해진 지금도 상류 변경 리스크는 그대로 남는다.
2. **3단(전체 스캔)만 — 규칙을 아예 안 쓴다** — 기각: 매 조회마다 전 디렉터리 readdir + N개 파일 부분 읽기. 세션 목록은 자주 호출되는 경로다. 게다가 실측상 절반 이상의 디렉터리가 `cwd` 를 주지 못해 **커버리지도 1단보다 나쁘다**. 정확한 규칙이 있는데 안 쓸 이유가 없다.
3. **3단 결과를 디스크에 캐시** (cwd → 디렉터리명 매핑 저장) — 기각: 이번 트랙에서는 과설계. 캐시 무효화(디렉터리 삭제/이동/claude 업데이트) 규칙을 정의해야 하고, 그 자체가 새 오류원이다. 3단이 실제로 자주 히트하기 시작하면(= 드리프트 발생) 그때 도입. warn 로그가 그 판단 근거를 준다.
4. **fallback 히트를 조용히 처리 (로그 없음)** — 기각: fallback 의 존재 이유 절반이 **관측**이다. 조용히 성공하면 규칙이 언제 깨졌는지 영원히 모르고, 3단의 비용만 계속 낸다. 다만 1단 정상 히트에는 로그를 남기지 않는다(핫패스 소음 방지).
5. **못 찾으면 throw** — 기각: 세션 목록은 "아직 이 프로젝트에서 claude 를 쓴 적 없음" 이 완전히 정상인 도메인이다. 정상 상태를 예외로 만들면 호출자가 전부 try/catch 로 덮게 되고, 진짜 오류가 묻힌다. 사용자 CLAUDE.md §4(결과 무시 금지) 는 `warn` 로그로 충족한다.
6. **`sessions-index.json` 을 2단으로 끼워 넣는다** — 기각: ADR-01 §대안3 과 동일 근거(커버리지 8/25, 32/32 stale 실측).

## 결과 (Consequences)

- **긍정**
  - claude 가 인코딩 규칙을 바꿔도 세션 기능이 **완전히** 죽지 않는다 (3단이 살아있는 디렉터리는 건짐).
  - 드리프트가 로그로 관측된다 — 사용자 신고 전에 우리가 먼저 안다.
  - 심볼릭 링크 cwd(mac `/tmp`) 가 1단 재시도에서 흡수된다.
  - 반환 타입이 `undefined` 를 포함해서 호출자가 "없음" 을 1급으로 다루게 된다 (현행 `projectDir()` 의 조용한 오답보다 안전).

- **부정 / 트레이드오프**
  - 조회 경로가 3갈래라 **테스트 표면이 넓다** — 3단 각각 + 각 단계의 미스 케이스까지 커버해야 한다.
  - 3단은 최악의 경우 프로젝트 디렉터리 수만큼 파일 I/O 를 한다. 디렉터리가 수백 개인 사용자에게는 눈에 띄는 지연이 될 수 있다. → `{ fullScan: false }` 탈출구 + 실측(현재 25개)상 당장은 문제 없음.
  - 3단은 jsonl 이 있는 디렉터리만 커버한다(실측 12/25). "fallback 이 있으니 안전하다" 를 과신하면 안 된다 — 커버리지 한계를 계약과 주석에 명시.
  - `findProjectDir` 가 async 가 된다 (현행 `projectDir()` 는 동기). 호출자 시그니처가 바뀌므로 A-1 에서 전파 작업 필요.

- **모니터링**
  - `warn` 로그 태그를 고정한다: `[claudeProjects] fallback hit via=hashPrefix|scan cwd=... actual=...`. 이 태그로 사용자 로그에서 즉시 grep 가능.
  - 3단 미스(= 어디에도 없음) 는 `debug` 수준 — 정상 상태와 구분이 안 되므로 warn 으로 올리지 않는다.
  - 후속: fallback 히트율이 유의미해지면 캐시(대안3) 재검토.
