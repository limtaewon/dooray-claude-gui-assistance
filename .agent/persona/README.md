# `.agent/persona/` — Ultra Agent 페르소나 오버레이

> 두레이 메신저 채널의 Ultra Agent (워터루클로) 가 본 레포 작업을 위해 *추가로* 적용하는 채팅별 지침.

## 파일

- [`AGENTS-clauday.md`](AGENTS-clauday.md) — 본 레포의 Ultra Agent 작업 행동 양식 (채팅 `4304498306184200915` 한정)

## 적용 방법

Ultra 측 시스템에서 채팅별 `AGENTS.md` 는 다음 경로에서 자동 로드됨:

```
/app/data/runtime/groups/<chat_id>/AGENTS.md
```

본 레포의 `AGENTS-clauday.md` 가 *진실의 원천*. 변경 시:

1. 본 파일 수정 → PR → 머지
2. Ultra 가 자기 `/app/data/runtime/groups/4304498306184200915/AGENTS.md` 를 새 본문으로 덮어쓰기

## 절대 금지

- **Ultra 의 전역 `SOUL.md` 수정 금지** — 본 채팅 외 다른 사용자 인터랙션까지 영향.
- 본 페르소나의 안전/언어/메모리 규칙은 SOUL.md 가 *기본*. AGENTS-clauday.md 는 *추가* 만.

## 로드 메커니즘 (Ultra 측)

`packages/server/dist/agent_engine/system_prompt.js` 의 `build_system_prompt()`:

```
SOUL.md (전역)  +  AGENTS.md (전역, 있으면)  +  AGENTS.md (채팅별, 있으면)  +  skill sections
```

→ 본 파일이 채팅별 AGENTS.md 의 본문이 된다. 전역 SOUL/AGENTS 는 그대로.
