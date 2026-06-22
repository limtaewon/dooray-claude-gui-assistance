---
task: harness-studio-m3
agent: main-process-engineer
date: 2026-06-22
---

# Impl Log — Harness Studio Edit M3: 쓰기 게이트 + 백업 + 적용 파사드

## 변경한 파일

- `src/main/harness/pathGate.ts` (수정) — `assertWritablePath`, `isWritableExtension` 추가 (쓰기 경로 게이트)
- `src/main/harness/backup.ts` (신규) — 백업 경로 계산(순수) + 파일 복사 + 목록/복원 유틸
- `src/main/harness/draftDiff.ts` (신규) — `sha256`, `computeLineDiff`, `computeFileDiffSummary`, `computeDraftDiffSummary` [순수]
- `src/main/harness/HarnessEditService.ts` (신규) — 편집 파사드 (readFile/diff/apply/listBackups/restore)
- `src/shared/types/harness-edit.ts` (수정) — `DraftFileEdit.stale?: boolean` 추가 (M2 renderer draftReducer 호환)
- `src/main/harness/__tests__/pathGate.writable.test.ts` (신규) — assertWritablePath 18개 테스트
- `src/main/harness/__tests__/backup.test.ts` (신규) — backup 유틸 20개 테스트
- `src/main/harness/__tests__/draftDiff.test.ts` (신규) — draftDiff 21개 테스트
- `src/main/harness/__tests__/HarnessEditService.test.ts` (신규) — HarnessEditService 14개 테스트

## 결정 사항

### assertWritablePath — 신규 파일 처리 전략
신규 파일(디스크에 없음)은 `fs.realpath`가 실패하므로 부모 디렉터리를 `realpath`로 해소한 뒤 파일명을 결합해 검증한다. 부모가 없어도 실패로 처리(번들 외 임의 경로 생성 차단).

### DraftFileEdit.stale 추가
M2 renderer `draftReducer.ts` 가 `DraftFileEditWithStale.stale` 플래그를 `HarnessDraft.edits` 에 저장하는데, `HarnessDraft.edits` 의 값 타입이 `DraftFileEdit` 이어서 typecheck가 실패했다. `stale` 은 UI-only 힌트 필드이며 main 은 이를 무시하고 독립적으로 STALE 를 재검증한다. append-only 변경으로 공유 타입에 `stale?: boolean` 추가.

### HarnessEditService.registerBundle
HarnessService 의 scan allowlist 와 별도로 HarnessEditService 도 자체 allowlist 를 관리한다. IPC 핸들러(M5)에서 scan/normalize 완료 후 `registerBundle(realPath)` 를 호출해 편집 허용 번들을 등록한다. skills 루트 하위는 항상 허용.

### backupFiles — 신규 파일 스킵
`DraftFileEdit.baseContent = ''` 인 신규 파일 draft 는 백업할 원본이 없다. `fs.access` 로 존재 여부를 확인하고 없으면 건너뛴다. `apply` 에서 신규 파일 생성은 정상 처리.

### STALE 검증 구간
`apply` 에서 디스크 읽기 후 sha 대조, rename 직전 재검사는 구현하지 않았다(TOCTOU 창 최소화는 ADR-002 권장 사항). 현재 구현은 초기 sha 대조 1회. rename 이 파일 단위 원자적이므로 창은 좁다.

### .sh 비실행 단언
`HarnessEditService` 는 `child_process` 를 import 하지 않는다. `.sh` 파일은 `fs.writeFile` + `fs.rename` 으로 텍스트 쓰기만 한다. 테스트에서 `.sh` 쓰기가 내용 변경만 일으키고 실행 부작용이 없음을 `readFile` 로 확인한다.

## 제약 (하지 말 것)

- **IPC 핸들러/preload 등록 금지** — M5 영역. `HarnessEditService` 는 서비스 클래스만.
- **AI 편집제안 구현 금지** — M4 영역. `proposeEdit` 없음.
- **`runClaudeStream` 수정 금지** — M4 에서도 기존 분기 재사용.
- **renderer 수정 금지** — `src/renderer/` 전체.
- **`.sh` 실행(spawn/exec) 절대 금지** — `HarnessEditService`, `backup.ts` 모두 텍스트 I/O 만.

## 테스트 결과

- 전체: 102 파일, 1462 테스트 통과 (기존 94 파일 포함)
- 신규: pathGate.writable(18) + backup(20) + draftDiff(21) + HarnessEditService(14) = 73개
- 커버리지: 94.79% (70% 기준 초과)
- typecheck: `tsc --noEmit` 양쪽 모두 통과 (exit 0)

## 참조

- ADR-harness-studio-edit-002 (쓰기 게이트 + 백업 전략)
- `docs/planning/harness-studio-edit-arch.md` §4(쓰기 게이트), §7(안전 원칙)
- `docs/planning/harness-studio-edit-plan.md` M3 체크리스트
