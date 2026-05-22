---
name: feature-develop
description: Clauday 의 기능 개발 오케스트레이터. 두레이 채널 메시지 / GitHub Issue / 자유 요청을 받아 architect → engineer(main/renderer) → test-engineer → integrator 파이프라인을 진행. 메인 세션(=울트라 에이전트)이 직접 수행하는 *역할 주입형* 스킬.
---

# feature-develop — Clauday 개발 오케스트레이터

> 이 스킬은 메인 세션이 *직접* 수행한다 (sub-agent 호출이 아니라 역할 주입). 너는 본 SKILL.md 의 절차를 따라 architect/engineer/test-engineer/integrator 를 `Task()` 로 dispatch 하고, 산출물을 검증하고, 다음 단계로 넘긴다.

## 진입 조건

- 두레이 메신저 채널에 새 메시지 도착, 또는
- 사용자가 명시적으로 "이거 개발해줘" 류 요청

## 입력 정규화 (Step 0)

메시지에서 다음을 추출:

| 필드 | 추출 위치 |
|---|---|
| **trigger source** | botName 이 "GitHub Issue" 면 GH. attachments 에 dooray URL 있으면 Dooray. 둘 다 없으면 freetext. |
| **repo** | GH 면 attachment text 에 `repo: <owner/name>`. 없으면 default `limtaewon/dooray-claude-gui-assistance`. |
| **task identifier** | GH issue#, Dooray post_id, 또는 freetext slug |
| **title** | attachment 의 첫 줄 또는 메시지 첫 줄 |
| **body** | attachment text 본문 |

→ `task-id` 결정:
- GH: `issue-<N>`
- Dooray: `task-<post_id>`
- freetext: `<slug-from-title>`

## Step 1 — Triage (내부 평가, 사용자에 노출 안 함)

`.agent/CLAUDE-AGENT.md` §3 의 6개 질문 그대로 적용. 결과 레벨 (L0/L1/L2/L3) 을 메모.

```
Q1 IPC 채널 추가/변경?
Q2 native 모듈/플랫폼 분기 영향?
Q3 두레이 인증/Socket Mode/CalDAV 인증 변경?
Q4 새 외부 의존성 또는 breaking change?
Q5 도메인 > 2 또는 PR 분할 필요?
Q6 main + renderer 동시 변경 필요?
```

레벨에 따라 다른 파이프라인:

- **L0** — engineer 1명 직접 + commit. PRD/ADR 없음.
- **L1** — engineer 1명 + test-engineer + integrator. PRD 짧게.
- **L2** — architect → engineer(s) → test-engineer → integrator. PRD + ADR ≥ 1.
- **L3** — L2 + 보안/대규모 검토 (현재는 architect 가 ADR 에 보안 섹션 포함하는 식으로 단순화).

## Step 2 — 브랜치 + 폴더 생성

```bash
git fetch origin
git checkout -b feature/<task-id>-<short-slug>
mkdir -p feature/<domain-best-guess>/<task-id>
```

`<domain-best-guess>` 는 메시지 키워드로 추정. 예: "터미널 한글", "두레이 봇", "캘린더 동기화" 등. 모호하면 architect 가 Step 3 에서 확정.

## Step 3 — Architect (L2+)

```
Task(subagent_type="architect", prompt="
요청: <title>
본문:
<body>

trigger: <source>, task-id: <task-id>, repo: <repo>

작업:
1. .agent/wiki/INDEX.md 부터 흡수
2. 영향 도메인 확정 (필요시 폴더 이동)
3. feature/<도메인>/<task-id>/prd.md 작성 (없으면)
4. feature/<도메인>/<task-id>/adr.md 작성 (≥1)
5. feature/<도메인>/<task-id>/plan.md 작성
")
```

산출물 검증 (architect 가 다 했는지):
- prd.md, adr.md, plan.md 모두 존재
- 각 YAML frontmatter 정상
- plan.md 의 체크박스 0개 [x] (아직 구현 안 함)

## Step 4 — Engineer dispatch

`plan.md` 의 영향 영역에 따라:

- main/shared 만 → `main-process-engineer` 단독
- renderer 만 → `renderer-engineer` 단독
- 둘 다 → **둘 다 동시 호출**. plan.md 가 충분히 분리되어 있어야 (architect 의 책임).

```
Task(subagent_type="main-process-engineer", prompt="
brief: feature/<도메인>/<task-id>/
필독: prd.md, adr.md, plan.md
출력: src/main/**, src/shared/**, src/preload/index.ts, src/main/index.ts, impl-log.md (네 차례 분량만)
")

# 병렬로
Task(subagent_type="renderer-engineer", prompt="
brief: feature/<도메인>/<task-id>/
필독: prd.md, adr.md, plan.md
출력: src/renderer/**, ClaudeManual SECTIONS 갱신, impl-log.md (네 차례 분량만)
")
```

> 둘이 같은 impl-log.md 를 동시 수정하면 충돌. 한 명이 main 섹션, 한 명이 renderer 섹션을 *append* 하도록 plan.md 에서 합의.

## Step 5 — Test Engineer

```
Task(subagent_type="test-engineer", prompt="
brief: feature/<도메인>/<task-id>/
필독: prd.md, impl-log.md
출력: *.test.ts, qa-report.md
verdict: PASS | RETURN | BLOCK
")
```

- PASS → Step 6
- RETURN → 해당 engineer 재호출 (RETURN 사유 + impl-log 보강)
- BLOCK → architect 재호출 (설계 결함)

## Step 6 — Integrator

```
Task(subagent_type="integrator", prompt="
brief: feature/<도메인>/<task-id>/
필독: 모든 산출물 + qa-report verdict
작업: Wiki/매뉴얼 갱신 → 품질 게이트 → 커밋 → PR 생성
출력: PR URL
")
```

## Step 7 — 채널 회신

PR URL 을 채널에 1줄로 회신:

```
[Clauday] PR #<N> — <title> — <url>
검증 통과. 머지는 직접 확인 후 진행해주세요.
```

## L0/L1 단축 경로

### L0
1. engineer 1명 호출 (PRD 없이 자유 prompt)
2. integrator (Wiki 갱신은 skip, 단순 commit + PR)

### L1
1. (architect 생략) — prd.md 만 메인 세션이 직접 한 문단으로 작성
2. engineer 1명 호출
3. test-engineer (간이)
4. integrator

## 실패 / 멈춤

- 어느 단계든 *블로커* 발견 → 채널에 "**막힘 — <원인> — <필요한 결정>**" 1메시지 회신. 사용자 답 기다림.
- 권한/토큰 부족 (gh CLI 인증 안 됨 등) → 채널에 진단 + 사용자 액션 가이드.

## 비활성 단계

- intake (Dooray task 생성 본업) — **항상 비활성**. 사용자가 이미 트리거한 메시지를 받기만 함.
- release-manager (자동 머지) — **항상 비활성**. PR 생성까지가 끝.

---

**핵심 인식**: 너의 일은 *순서* 와 *검증 게이트*. 산출물은 sub-agent 들이 만든다. 네가 직접 코드를 짜는 건 L0 단축 경로뿐.
