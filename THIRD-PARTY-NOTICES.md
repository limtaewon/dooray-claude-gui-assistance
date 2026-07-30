# Third-Party Notices

Clauday 는 아래 서드파티 프로젝트의 소스 코드 일부를 그대로(verbatim) 또는 변형(adapted)하여
포함합니다. 각 프로젝트는 MIT License 로 배포되며, MIT 는 원 저작권 고지와 라이선스 전문을
파생물에도 함께 포함할 것을 요구합니다. 이 문서가 그 요구를 충족합니다.

번들에 포함된 npm 의존성 전체 목록/라이선스는 `package.json` 을 참조하세요. 이 문서는 그중에서도
**소스 코드 수준에서 로직을 이식한 항목**만 별도로 추적합니다.

## 프로젝트별 저작권

- **Orca** — https://github.com/stablyai/orca — Copyright (c) 2026 Lovecast Inc. — MIT License
- **Visual Studio Code** — https://github.com/microsoft/vscode — Copyright (c) Microsoft Corporation. — MIT License
  (Orca 가 VSCode 의 터미널 링크 파싱 로직을 포팅한 것을 Clauday 가 다시 이식 — 이중 고지 대상)
- **dnd-kit** — https://github.com/clauderic/dnd-kit — Copyright (c) 2021 Claudéric Demers — MIT License
- **xterm.js** (및 `@xterm/addon-*`) — https://github.com/xtermjs/xterm.js — Copyright (c) 2017-2022, The xterm.js authors. — MIT License

## MIT License 전문

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## 이식 파일 표

| 로컬 경로 | 원본 프로젝트 | 원본 경로 | 정도 |
|---|---|---|---|
| `src/renderer/src/components/Terminal/tabDragSensor.ts` | dnd-kit | `packages/core/src/sensors/pointer/PointerSensor.ts` (`PointerSensor` 상속) | adapted |
| `src/renderer/src/components/Terminal/paneDividerDrag.ts` | Orca | `src/renderer/terminal/pane-divider-drag.ts` | adapted |
| `src/renderer/src/components/Terminal/pasteTargetState.ts` | Orca | `src/renderer/terminal/terminal-paste-target-state.ts` | adapted |
| `src/renderer/src/components/Terminal/serializeAbsoluteCursor.ts` | Orca | `terminal-serialize-absolute-cursor.ts` | adapted |
| `src/renderer/src/components/Terminal/replay.ts` | Orca | `replay-guard.ts` / `terminal-snapshot-replay-paint.ts` | adapted |
| `src/renderer/src/components/Terminal/links/terminalLinkProviderGuard.ts` | Orca | `src/renderer/src/lib/pane-manager/terminal-link-provider-guard.ts` | adapted (사내 진단 모듈 호출 → `console.warn` 로 대체, 로직은 동일) |
| `src/renderer/src/components/Terminal/links/lineColumn.ts` | Orca | `src/renderer/src/lib/explicit-file-link-target.ts` | adapted (cwd 결합/`~` 확장 로직 제거 — main `TERMINAL_RESOLVE_PATH` 로 이관, line:col 파싱과 bare-root 거부만 남김) |
| `src/renderer/src/components/Terminal/links/terminalPathRegex.ts` | Orca ← VSCode | Orca: `src/renderer/src/lib/terminal-links.ts` / VSCode: `terminalLocalLinkDetector.ts` | adapted (이중 고지 — worktree/SSH/file URI 분기 제거, cwd 결합은 main `TERMINAL_RESOLVE_PATH` 로 이관) |
| `src/renderer/src/components/Terminal/links/bareFileLink.ts` | Orca ← VSCode | Orca: `src/renderer/src/lib/terminal-bare-file-link-detection.ts` / VSCode: `terminalWordLinkDetector.ts` | adapted (이중 고지 — 판정 로직은 동일) |
| `src/renderer/src/components/Terminal/links/wrappedLinkRanges.ts` | Orca | `wrapped-terminal-link-ranges.ts` + `hard-wrapped-terminal-path-fragments.ts` (두 파일을 하나로 병합) | adapted |
| `src/renderer/src/components/Terminal/links/pathExistsCache.ts` | Orca | `src/renderer/src/components/terminal-pane/terminal-path-exists-cache.ts` | adapted (SSH/원격 런타임 키 분기 제거, `cwd + '\0' + candidate` 단일 키로 단순화) |
| `src/renderer/src/components/Terminal/links/resolveLinks.ts` | Orca | `terminal-link-handlers.ts` — `preferLongestNonOverlappingLinks` 함수만 | adapted (파일 나머지는 Clauday 고유의 배치 invoke 오케스트레이션 — 이식 대상 아님) |
| `src/renderer/src/components/Terminal/links/parseOsc7.ts` | Orca | `src/renderer/src/components/terminal-pane/parse-osc7.ts` | adapted (원격 런타임 UNC 호스트 옵션 제거) |
| `src/renderer/src/components/Terminal/links/linkClickPriming.ts` | Orca | `terminal-linkifier-click-priming.ts` | adapted (활성화 판정 helper 를 Clauday `linkActivation.ts` 로 교체) |
| `src/renderer/src/components/Terminal/links/ptyMouseSuppression.ts` | Orca | `terminal-link-pty-mouse-suppression.ts` | adapted — **동작 방식 변경**: 원본은 xterm 6.1-beta 패치가 추가한 `terminal.options.mouseEventsRequireAlt` 를 토글하는데, `@xterm/xterm@5.5.0` stable 번들엔 그 옵션이 없다(grep 으로 부재 확인). 대신 캡처 단계 `mousedown` 리스너에서 `stopPropagation()` 으로 xterm 내부(버블 단계) 마우스 리포팅 리스너에 이벤트가 도달하지 못하게 막는다. `mouseup` 은 막지 않는다(링크 activate 판정이 거기서 일어나므로). |
| `src/renderer/src/components/Terminal/terminalUnicodeProvider.ts` | Orca | `src/shared/terminal-unicode-provider.ts` | adapted (버전 상수/클래스명만 브랜딩에 맞춰 변경, 폭 보정 로직은 동일) |
| `src/shared/git/cquotedPath.ts` | Orca | `src/shared/git-cquoted-path.ts` | verbatim |
| `src/shared/git/nulFields.ts` | Orca | `src/shared/nul-delimited-fields.ts` | verbatim |
| `src/shared/git/statusLimit.ts` | Orca | `src/shared/git-status-limit.ts` | verbatim |
| `src/shared/git/statusTypes.ts` | Orca | `src/shared/git-status-types.ts` | adapted (서브모듈 내부 엔트리 `submoduleRoot` / SSH 세션 출처 `conflictStatusSource` 필드 제거) |
| `src/shared/git/porcelainV2Parser.ts` | Orca | `src/shared/git-status-porcelain-parser.ts` + `src/main/git/status.ts` 의 `parseUnmergedEntry`/`parseConflictKind` | adapted (두 파일 병합 — 충돌 u 레코드 해석을 파서 안으로 흡수, `submoduleRoot` 제거) |
| `src/shared/git/historyTypes.ts` | Orca | `src/shared/git-history-types.ts` | adapted (`allBranches` / `skip` 추가 — Orca 는 HEAD-only + 페이지네이션 없음) |
| `src/shared/git/historyLogParser.ts` | Orca | `src/shared/git-history-log-parser.ts` | verbatim (빈 메시지 문구만 한국어화) |
| `src/shared/git/history.ts` | Orca | `src/shared/git-history.ts` | adapted (전 브랜치 `--all` + `--skip` 페이지네이션 추가, incoming/outgoing 판정 제거) |
| `src/shared/git/historyGraph.ts` | Orca | `src/shared/git-history-graph.ts` | adapted (경계 행 합성 `git-history-boundary-rows.ts` 제거, 머지 부모 색 조회를 선형 탐색 → Map 인덱스) |
| `src/shared/git/remoteError.ts` | Orca | `src/shared/git-remote-error.ts` | adapted (서브모듈 재귀 push 분기 제거, 메시지 한국어화, `isGitAuthFailure` 분리) |
| `src/shared/git/largeDiffLimit.ts` | Orca | `src/shared/large-diff-render-limit.ts` | adapted (조기 종료 라인 카운트만 유지, 이미지/노트북 뷰어 분기 제거) |
| `src/main/git/credentialEnv.ts` | Orca | `src/shared/git-credential-prompt-env.ts` + `src/main/git/runner.ts` 의 `nonInteractiveGitEnv` | adapted (WSL `WSLENV` 전파 제거, 출력 로케일 고정을 같은 함수로 흡수) |
| `src/main/git/scmRunner.ts` | Orca | `src/main/git/runner.ts` (`DEFAULT_GIT_MAX_BUFFER`/`killSpawnedCommandTree`/`execFileCapture`/`gitStreamStdout`) + `src/main/git/max-buffer-overflow.ts` | adapted (WSL 라우팅·gh/glab 러너·사내 observability 제거, 로컬 git 실행만 유지) |
| `src/main/git/GitScmService.ts` | Orca | `src/main/git/status.ts` / `remote.ts` / `checkout.ts` — 커맨드 형태와 방어 패턴(`:(literal)` pathspec, `--end-of-options`, 충돌 판정, discard 2분기) | adapted (오케스트레이션은 Clauday 고유. diff 는 Orca 와 같은 content 방식이나 서브모듈/SSH/AI 커밋메시지 경로 없음) |

> 표의 진실은 이 문서입니다. `feature/terminal/v2-terminal-p2/adr-06-third-party-notices.md` 의 표는
> 착수 시점 스냅샷이며, 실제 이식 파일이 늘어나면(B-5~B-7) 이 표에 행이 추가됩니다.

## 절차

새 이식 파일을 추가할 때:
1. 파일 상단에 4요소 고지 블록(원 프로젝트 / 원본 경로+버전 / 저작권+라이선스 / 변경 요약 1줄)을 남긴다.
2. 이 문서의 표에 행을 추가한다.
3. 두 작업은 같은 커밋에서 수행한다 — 이식 파일만 먼저 들어가는 커밋을 만들지 않는다.

VSCode 파생 파일(`terminalPathRegex.ts`, `bareFileLink.ts` — B-7)은 Orca 경유 사실과 VSCode
원본 저작권 두 가지를 파일 상단에 연달아 적는 이중 고지 대상입니다(각 파일 상단에 반영됨).
