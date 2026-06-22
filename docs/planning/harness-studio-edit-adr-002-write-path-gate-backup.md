---
id: ADR-harness-studio-edit-002
title: 쓰기 경로 게이트 확장 + 자동 백업/복원 전략
status: proposed
date: 2026-06-22
supersedes: []
domain: electron-ipc, ai-service
---

# 쓰기 경로 게이트 확장 + 자동 백업/복원 전략

## 컨텍스트

편집 적용은 사용자의 실제 번들 파일(`~/.claude/skills/<bundle>/...` 의 `.md`/`.sh`)을 **덮어쓰는 비가역 작업**이다. 기존 `pathGate.ts` 는 읽기 전용(`assertPathAllowed`: skills 루트/세션 allowlist + realpath 심링크 차단)이라 쓰기 안전성을 보장하지 못한다. 게이트/hook `.sh` 가 쓰기 대상에 포함되며, 잘못된 경로(`..`/심링크)나 실행 파일 쓰기는 시스템 손상으로 이어질 수 있다. 또한 원본을 덮어쓰면 사용자가 되돌릴 수단이 없다.

## 결정

### 쓰기 경로 게이트 (`assertWritablePath`)
기존 읽기 게이트는 변경하지 않고, **쓰기 전용 검증 함수**를 신규 추가한다. 쓰기는 다음을 **모두** 통과해야 한다:

1. bundleRoot 가 기존 읽기 게이트(skills 하위 또는 세션 allowlist)를 이미 통과한 realpath 일 것.
2. `relPath` 정규화 후 `..` 세그먼트 포함 거부 (디렉터리 탈출 차단).
3. 확장자 화이트리스트: `.md` / `.sh` / `.txt` / `VERSION` 만 허용.
4. 대상 절대경로(또는 신규 파일이면 부모 디렉터리)를 `realpath` 로 해소한 뒤 **반드시 bundleRoot 하위**(기존 `isUnderAllowedRoot` 재사용 — 심링크 탈출 차단).

### 자동 백업/복원
적용 직전 변경 대상 원본을 **백업**한다:
```
<userData>/harness-backups/<sanitized(bundleName)>/<ISO타임스탬프>/<relPath>
```
- `HARNESS_LIST_BACKUPS` / `HARNESS_RESTORE_BACKUP` IPC 로 복원 진입.
- 쓰기는 파일 단위 **temp-write → rename**(원자성). 다중 파일 중 일부 실패 시 이미 쓴 파일은 백업으로 복원 가능(applied[] 추적).
- 적용 직전 디스크 내용 sha ↔ `DraftFileEdit.baseContent` sha 대조 → 불일치 시 STALE 거부(외부 동시 편집 보호). rename 직전 재검사로 TOCTOU 창 최소화.
- **`.sh` 는 텍스트로만 기록**하며 절대 spawn/exec 하지 않는다(기존 arch.md §8 비실행 원칙을 쓰기 경로까지 확장).

## 대안과 기각 이유

1. **백업 없이 직접 덮어쓰기** — 기각: 저자가 번들을 수정하며 점검하는 핵심 페르소나(PRD §4)에서 잘못된 편집은 비가역 손실. 복원 불가는 채택 불가.
2. **git stash/commit 으로 백업** — 기각: 번들이 git 저장소가 아닐 수 있고(`~/.claude/skills` 는 보통 비-git), git 의존을 강제하면 일반성 깨짐. 파일 복사 백업이 무조건 동작.
3. **확장자 제한 없이 임의 파일 쓰기** — 기각: AI 제안이나 raw 편집이 실수로 실행 파일/설정을 만들 수 있어 신뢰경계 붕괴. `.md`/`.sh` 화이트리스트로 표면 최소화.
4. **STALE 검사 생략(항상 덮어쓰기)** — 기각: draft 생성 후 사용자가 외부 에디터로 같은 파일을 고치면 그 변경이 silent 하게 사라진다(silent failure 금지 원칙). sha 대조로 명시 거부.
5. **in-place 쓰기(temp-rename 없이)** — 기각: 쓰기 중 크래시 시 파일 절단(half-written). temp-write→rename 으로 원자성 확보.

## 결과 (Consequences)

- 긍정: 비가역성 완화(백업/복원), 경로/확장자/심링크 공격 표면 최소화, 동시 편집 충돌 명시 처리, `.sh` 비실행 유지.
- 부정/트레이드오프: 백업 디렉터리 용량 누적(LRU/상한 정책은 잔여 결정 — 초기엔 무제한 + 수동 정리). 백업 복사 I/O 가 적용 지연을 약간 증가(파일 수가 적어 무시 가능).
- 부정: STALE 거부 시 사용자가 재로드해야 함(UX 마찰) — 명확한 안내로 완화.
- 모니터링: 적용 성공/STALE 거부/게이트 거부 건수, 백업 생성 건수·총 용량 로깅. 게이트 거부가 정상 사용에서 발생하면 화이트리스트 과협소 신호.
