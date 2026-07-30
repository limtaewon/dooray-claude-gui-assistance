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

> 표의 진실은 이 문서입니다. `feature/terminal/v2-terminal-p2/adr-06-third-party-notices.md` 의 표는
> 착수 시점 스냅샷이며, 실제 이식 파일이 늘어나면(B-5~B-7) 이 표에 행이 추가됩니다.

## 절차

새 이식 파일을 추가할 때:
1. 파일 상단에 4요소 고지 블록(원 프로젝트 / 원본 경로+버전 / 저작권+라이선스 / 변경 요약 1줄)을 남긴다.
2. 이 문서의 표에 행을 추가한다.
3. 두 작업은 같은 커밋에서 수행한다 — 이식 파일만 먼저 들어가는 커밋을 만들지 않는다.

VSCode 파생 파일(예정: `terminalPathRegex.ts`, `bareFileLink.ts` — B-7)은 Orca 경유 사실과 VSCode
원본 저작권 두 가지를 파일 상단에 연달아 적는 이중 고지 대상입니다.
