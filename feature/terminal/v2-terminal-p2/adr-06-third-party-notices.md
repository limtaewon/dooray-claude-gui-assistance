---
id: ADR-v2-terminal-p2-06
title: 외부 코드 이식은 파일 상단 고지 + THIRD-PARTY-NOTICES.md 이중 등재를 같은 커밋에서 수행한다
status: proposed
date: 2026-07-30
supersedes: []
domain: terminal, renderer-only
---

# 외부 코드 이식은 파일 상단 고지 + THIRD-PARTY-NOTICES.md 이중 등재를 같은 커밋에서 수행한다

## 컨텍스트

Phase 2 는 Orca(stablyai/orca, MIT, Copyright (c) 2026 Lovecast Inc.)의 검증된 모듈을 여러 개 이식한다. 그중 일부는 **verbatim 급**(로직을 그대로 옮김)이고, 두 파일은 Orca 자신이 **VSCode(Microsoft, MIT) 파생**이다. p1 에서 도입한 `@dnd-kit` 커스텀 센서도 라이브러리 클래스를 상속한 파생물이다.

MIT 라이선스는 "the above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software" 를 요구한다. 즉 **파생 코드를 배포하는 순간 원 저작권 표시와 라이선스 전문을 함께 배포해야 한다.** 지금 레포에는 `THIRD-PARTY-NOTICES.md` 가 없다.

이건 "나중에 정리" 가 통하지 않는 종류의 부채다. 이식 파일이 먼저 머지되고 고지가 다음 PR 로 밀리면, 그 사이의 모든 커밋·태그·릴리즈 아티팩트가 위반 상태로 남는다.

## 결정

**이식 파일과 고지는 하나의 커밋에서만 함께 들어온다. 고지는 파일 상단과 루트 문서 두 곳에 남긴다.**

### 1. 파일 상단 고지 블록

모든 이식 파일의 첫 블록:

```ts
/*
 * Portions adapted from Orca (https://github.com/stablyai/orca)
 * Original: src/renderer/terminal/pane-divider-drag.ts (v1.4.162)
 * Copyright (c) 2026 Lovecast Inc. — MIT License
 * See THIRD-PARTY-NOTICES.md
 *
 * 변경: Clauday 의 SplitLayout ratio 모델에 맞춰 sizes[] → ratio 단일 값으로 조정.
 */
```

4요소 필수: **원 프로젝트/원본 경로+버전 / 저작권 / 라이선스 / 변경 요약 1줄**. 변경이 없으면 `변경: 없음(verbatim)`.

VSCode 파생 2파일(`terminalPathRegex.ts`, bare filename 판정)은 **두 블록을 연달아** 적는다 — Orca 경유 사실과 VSCode 원본 저작권 둘 다.

### 2. 루트 `THIRD-PARTY-NOTICES.md`

섹션 구성:
1. 서문 1문단(이 문서의 목적, 번들 의존성의 라이선스는 `package.json` 참조).
2. **프로젝트별 저작권 줄** — Orca / Microsoft(VSCode) / dnd-kit / xterm.js 및 addons.
3. **MIT 전문 1회** — 위 프로젝트가 모두 MIT 이므로 전문은 한 번만 싣고 저작권 줄만 개별 나열한다(관례적 표기).
4. **이식 파일 표** — `로컬 경로 | 원본 프로젝트 | 원본 경로 | verbatim / adapted`. 이 표가 감사 시 단일 진입점이 된다.

`README.md` 하단에서 이 파일을 링크한다.

### 3. 절차 게이트

- 이식 파일을 만드는 **plan 단계의 첫 체크박스**가 항상 "고지 블록 작성" 이고, 그 단계의 마지막 체크박스가 "`THIRD-PARTY-NOTICES.md` 표에 행 추가" 다.
- `THIRD-PARTY-NOTICES.md` 가 없는 상태에서 이식 파일이 포함된 커밋을 만들지 않는다. 문서 신설은 B-4 의 첫 커밋(= 첫 이식이 일어나는 단계)에서 한다.
- **verbatim / adapted 구분을 기록한다.** 나중에 원본이 버그를 고쳤을 때 어떤 파일을 다시 봐야 하는지 판단하는 근거다.

### 4. 이식 대상 (현재 예정 목록)

| 로컬 | 원본 | 정도 |
|---|---|---|
| `Terminal/paneDividerDrag.ts` | Orca `pane-divider-drag.ts` | adapted |
| `Terminal/pasteTargetState.ts` | Orca `terminal-paste-target-state.ts` | adapted |
| `Terminal/serializeAbsoluteCursor.ts` | Orca `terminal-serialize-absolute-cursor.ts` | adapted |
| `Terminal/replay.ts`(guard + 상수) | Orca `replay-guard.ts` / `terminal-snapshot-replay-paint.ts` | adapted |
| `Terminal/links/terminalLinkProviderGuard.ts` | Orca `terminal-link-provider-guard.ts` | verbatim |
| `Terminal/links/terminalPathRegex.ts` | Orca `terminal-links.ts` ← **VSCode** `terminalLinkParsing` | adapted (이중 고지) |
| `Terminal/links/bareFileLink.ts` | Orca `terminal-bare-file-link-detection.ts` ← **VSCode** | adapted (이중 고지) |
| `Terminal/links/wrappedLinkRanges.ts` | Orca `wrapped-terminal-link-ranges.ts` | adapted |
| `Terminal/links/pathExistsCache.ts` | Orca `terminal-path-exists-cache.ts` | verbatim |
| `Terminal/links/parseOsc7.ts` | Orca `parse-osc7.ts` | verbatim |
| `Terminal/links/linkClickPriming.ts` | Orca `terminal-linkifier-click-priming.ts` | adapted |
| `Terminal/links/ptyMouseSuppression.ts` | Orca `terminal-link-pty-mouse-suppression.ts` | adapted |
| `Terminal/terminalUnicodeProvider.ts` | Orca `terminal-unicode-provider.ts` | verbatim |
| `Terminal/tabDragSensor.ts` (p1 기존) | dnd-kit `PointerSensor` 상속 | adapted |

목록은 구현 중 늘거나 줄 수 있다. **표의 진실은 `THIRD-PARTY-NOTICES.md`** 이고 본 ADR 의 표는 착수 시점 스냅샷이다.

## 대안과 기각 이유

1. **고지 없이 "참고만 하고 재작성"** — *기각*: 실제로는 로직·상수·경계 조건을 그대로 옮긴다. 그건 파생물이다. 반대로 진짜 재작성을 하면 Orca 가 이미 밟은 함정(pointer capture 이중화, resize 홀드, wrap 판정 술어)을 우리가 다시 밟는다 — 이식하는 이유 자체가 사라진다.
2. **파일 상단 주석만** — *기각*: 배포되는 앱(asar)에서 소스 주석은 사실상 발견 불가능하다. 사용자·감사자가 볼 수 있는 위치에 문서가 필요하다.
3. **루트 문서만, 파일 주석 생략** — *기각*: 코드를 고치는 사람이 그 파일이 외부 파생인지 모른다. "왜 이렇게 이상하게 짰지" 하고 리팩터하다가 원본의 함정 회피 로직을 지운다. 주석은 라이선스 목적이자 **유지보수 경고문**이다.
4. **`licenses/` 폴더에 각 프로젝트 LICENSE 원문 파일을 개별 복사** — *기각*: 네 프로젝트 모두 동일한 MIT 전문이라 중복이다. 저작권 줄만 개별 나열하고 전문 1회가 관례이며 요건도 충족한다.
5. **고지를 별도 후속 PR 로** — *기각*: 그 사이 생성되는 태그/릴리즈가 위반 상태가 된다. 커밋 단위로 항상 합법이어야 한다.
6. **`electron-builder` 로 앱 About 화면에 라이선스 뷰어 추가** — *기각(이번 스코프)*: 요건 충족에 필요하지 않고 UI 작업이 붙는다. 레포 루트 문서 + README 링크로 시작하고, 필요해지면 별도 트랙.

## 결과 (Consequences)

### 긍정
- 이식이 늘어도 감사 진입점이 파일 하나다.
- `verbatim/adapted` 구분 덕에 원본 업데이트 추적이 가능하다.
- 파일 상단 주석이 "이 코드는 함부로 정리하지 말 것" 이라는 유지보수 신호로 이중 작동한다.
- p1 에서 애매하게 남겨 둔 dnd-kit 고지 여부가 함께 정리된다.

### 부정 / 트레이드오프
- 이식 파일마다 6~8줄의 고지 블록이 붙는다(파일 상단이 길어진다).
- 표를 갱신하지 않고 파일만 추가하는 실수가 가능하다 — plan 의 체크박스와 PR 리뷰가 유일한 방어선이다(자동 검사는 만들지 않는다).
- 원본 경로/버전을 적으려면 이식 시점에 Orca 저장소를 다시 확인해야 한다. 로컬 클론이 세션 scratchpad 에 있었으므로 필요 시 재클론(`docs/dev/orca-absorption-notes.md` 서문).

### 모니터링
- PR 체크리스트: "이식 파일 N개 ↔ `THIRD-PARTY-NOTICES.md` 표 N행" 수동 대조.
- integrator 단계에서 `grep -rl "Portions adapted from" src/` 결과 개수와 표 행 수를 비교해 impl-log 에 기록.
</content>
