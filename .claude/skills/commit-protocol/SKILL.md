---
name: commit-protocol
description: Clauday 의 커밋 메시지 형식 + Definition of Done (DOD) 게이트. integrator 가 커밋 직전 반드시 트리거.
---

# commit-protocol

> 커밋 전에 *반드시* 통과해야 할 게이트 + 표준 메시지 형식.

## DOD 게이트 (Definition of Done)

순서대로 검증. 실패 = 커밋 금지.

### 1. 코드 품질 게이트
```bash
npx tsc --noEmit       # 타입 통과
npm test               # vitest 전체 통과 + 커버리지 70% (신규 모듈)
npm run build          # 빌드 통과
```

> `npm run build` 는 *타입 검증 안 함* (electron-vite 만). 그래서 `npx tsc --noEmit` 가 별도.

### 2. 산출물 정합
- `feature/<도메인>/<task-id>/` 안:
  - `prd.md` — frontmatter + 수락 기준 ≥ 1 (L2+)
  - `adr.md` — frontmatter + 대안 ≥ 1 (L2+)
  - `plan.md` — 모든 체크박스 [x]
  - `impl-log.md` — 변경 파일 목록 + 결정/제약/참조 3섹션
  - `qa-report.md` — verdict = PASS

### 3. Wiki 갱신
- `.agent/wiki/decisions-log.md` 에 신규 ADR 1줄 추가됐는지
- 영향받은 `.agent/wiki/domain-*.md` 본문 갱신 (해당하는 경우만)

### 4. 사용자 매뉴얼 갱신 (DOD 필수)
사용자 가시 변경이면:
- `src/renderer/src/components/ClaudeManual/ClaudeManual.tsx` 의 `SECTIONS` 갱신

내부 리팩터/버그 수정만은 면제.

### 5. 미사용 / 잔여
- `console.log` 디버깅 잔여 제거
- TODO 주석은 issue 로 빼거나 명시적 PR 코멘트로
- `// @ts-ignore` 신규 금지 (architect ADR 로 정당화된 경우만)

## 커밋 메시지 형식

```
<type>(<scope>): <짧은 제목>

<본문 — 왜, 어떻게, 영향. 빈 줄 위에 위치>

PRD: feature/<도메인>/<task-id>/prd.md
ADR: feature/<도메인>/<task-id>/adr.md
Closes: #<issue-N>  (해당하는 경우만)
Dooray: <task URL>  (해당하는 경우만)
```

### type

| type | 의미 |
|---|---|
| `feat` | 사용자 가시 신규 기능 |
| `fix` | 버그 수정 |
| `refactor` | 동작 변경 없는 내부 재구성 |
| `docs` | 문서 (코드 외) |
| `test` | 테스트 추가/수정만 |
| `chore` | 빌드/툴/의존성 |
| `perf` | 성능 개선 |
| `style` | 포맷팅만 (린트 등) |

### scope (Clauday 도메인)

- `electron-ipc` / `terminal` / `dooray-bot` / `claude-chat` / `caldav` / `mcp-skills` / `ai-service` / `renderer`
- 다중 도메인이면 콤마 구분 또는 `multi`

### 제목

- 한국어 OK
- 명령형 ("추가했다" X → "추가") — 영어 git convention 의 영향이지만 한국어에선 종결어미 생략으로 충분
- 50자 이내 권장

### 본문

- 빈 줄 한 줄 띄우고 시작
- *왜* 가 핵심. 무엇을 했는지는 diff 가 안다.
- 80자 wrap 권장 (필수 아님)
- 마지막에 PRD/ADR/Closes/Dooray 메타 라인

### 예시

```
feat(terminal): 한글 IME 입력 폭 보정 (Unicode11)

xterm 의 wcwidth 가 이모지·CJK 일부에서 폭 계산 어긋남. Unicode11 폭 데이터로
보정해 한글/이모지 줄바꿈 안 잘리도록.

영향: terminal 도메인만. 다른 도메인 회귀 없음.
크로스 플랫폼: macOS/Windows 양쪽에서 vitest 통과 확인.

PRD: feature/terminal/issue-42/prd.md
ADR: feature/terminal/issue-42/adr.md
Closes: #42
```

```
fix(ai-service): Windows 에서 stream-json 잘림 (system prompt 길이 영향)

cmd 의 argv 파싱이 큰 --append-system-prompt 값의 공백/개행에서 끊기면서
뒤의 --output-format stream-json 옵션이 잘려나가는 문제. Windows 한정으로
system prompt 를 stdin prefix 로 옮김. Mac 은 기존 경로 유지 (캐싱 보존).

PRD: feature/ai-service/task-12345/prd.md
ADR: feature/ai-service/task-12345/adr.md
Dooray: https://nhnent.dooray.com/task/.../12345
```

## 분할 기준

- 도메인 1개 + 단일 변경 → 1 커밋
- 도메인 여러 개 → 도메인별 1 커밋. 각 커밋이 독립 빌드/테스트 통과해야.
- Wiki/매뉴얼 갱신만 → 별도 커밋 가능 (`docs: ...`).

## 절대 금지

- `git commit --no-verify` — hook 우회 금지
- `git push --force` / `--force-with-lease` (단, 본인 PR 의 첫 push 후 rebase 정도는 협의)
- `git push origin main` — main 직접 push 금지
- `--amend` 후 push (이미 푸시된 commit) — 협업자 혼란

## 푸시 + PR

```bash
git push -u origin <branch>
gh pr create --base main --head <branch> --title "..." --body "..."
```

PR 본문 템플릿은 `integrator.md` 참조.
