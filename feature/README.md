# `feature/` — Raw Sources (PRD/ADR per task)

> Karpathy LLM Wiki 패턴의 *Raw Sources 계층*. **불변** (한번 작성되면 수정 금지, 새 결정으로 supersede).
> 새 기능/수정/리팩터마다 task 단위로 폴더 하나 생성.

## 디렉토리 구조

```
feature/
└── <도메인>/
    └── <task-id>/
        ├── prd.md          # 요구사항 — architect 또는 main session
        ├── adr.md          # 아키텍처 결정 — architect (L2+)
        ├── plan.md         # 구현 계획 — architect
        ├── impl-log.md     # 변경 로그 — engineer (main / renderer)
        └── qa-report.md    # 검증 보고 — test-engineer
```

### 도메인

`.agent/wiki/INDEX.md` 의 도메인 목록과 1:1:
- `electron-ipc/`
- `terminal/`
- `dooray-bot/`
- `claude-chat/`
- `caldav/`
- `mcp-skills/`
- `ai-service/`
- `renderer-only/` (UI 만 영향. main 손 안 댐)
- `multi/` (도메인 3개 이상 걸치는 큰 작업)

### task-id

- GitHub Issue: `issue-<N>` (예: `issue-42`)
- Dooray Task: `task-<post_id>` (예: `task-4316525978676382391`)
- 자유 요청: `<짧은-슬러그>` (예: `terminal-restore-fix`)

## 예시

```
feature/
├── ai-service/
│   ├── task-12345/
│   │   ├── prd.md
│   │   ├── adr.md         # ADR-task-12345-01: Windows stdin combine
│   │   ├── plan.md
│   │   ├── impl-log.md
│   │   └── qa-report.md
│   └── issue-87/
│       ├── prd.md
│       └── ...
└── terminal/
    └── issue-42/
        └── ...
```

## 산출물 규약

- 형식 검증은 `.claude/skills/artifact-validation/SKILL.md` 참조
- 모든 산출물은 *YAML frontmatter* + 본문 필수 섹션
- 결정/제약/참조 3섹션은 *모든* 산출물 공통 (빈 경우 "없음 — 명시적 기록" 명시)

## 갱신 정책

- **불변**. 일단 commit 되면 사후 수정 금지 (오타 빼고). 결정이 바뀌면 *새 ADR* 로 supersede.
- 폴더 자체는 *삭제 금지*. 과거 결정 추적이 자산.
- LLM Wiki 계층 (`.agent/wiki/decisions-log.md`) 에 ADR 한 줄 요약이 자동 누적됨 (integrator).
