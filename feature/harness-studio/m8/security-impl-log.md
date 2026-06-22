---
task: harness-studio-security
agent: main-process-engineer
date: 2026-06-22
---

# Impl Log — Harness Studio 편집 쓰기경로 보안 수정

## 변경한 파일

- `src/main/harness/pathGate.ts` (P1-3, P2-4, P0-2 기반 읽기게이트)
- `src/main/harness/HarnessEditService.ts` (P0-1, P1-1, P2-1, P2-4)
- `src/main/index.ts` (P0-2, P1-2, P2-4)
- `src/main/harness/__tests__/pathGate.writable.test.ts` (P1-3 회귀 테스트 추가)
- `src/main/harness/__tests__/HarnessEditService.test.ts` (P0-1, P2-1 회귀 테스트 추가)

## 항목별 처리 내역

### P0-2 — AI_EDIT 핸들러 파일 읽기 게이트 적용 (처리)
- `index.ts` HARNESS_AI_EDIT 핸들러에서 직접 `editFs.readFile(args.path, relPath)` 하던 코드를
  `HarnessEditService.readFile()` 경유로 교체.
- `readFile` 은 `verifiedBundleRoot + realpath 검증` 을 거치므로 임의 파일 유출 차단.
- 기존 `editFs`, `editPath` 임포트는 index.ts 내 다른 용도가 있어 유지.

### P0-1 — restore 쓰기 게이트 우회 수정 (처리)
- `HarnessEditService.restore` 에서 `restoreFromBackup()` (backup.ts) 을 직접 호출하던 것을
  두 단계로 분리:
  1. `collectBackupRelPaths()` — 복원 대상 파일 목록 수집 (모듈 내 private 헬퍼).
  2. 각 relPath 에 대해 `assertWritablePath(bundleRoot, relPath)` 통과 → `resolvedRestorePaths` 수집.
  3. `restoreFromBackupWithResolvedPaths()` — 검증된 절대경로로만 복사.
- 백업에 악성 파일(.json 등)이 주입돼도 `assertWritablePath` 에서 확장자 거부.

### P1-1 — apply TOCTOU 수정: assertWritablePath 반환값 재사용 (처리)
- `apply` 내부에서 `assertWritablePath` 의 반환값(검증된 resolved 절대경로)을 `resolvedPaths` 맵에 저장.
- STALE 읽기(step 2), temp 쓰기, rename(step 4) 모두 `resolvedPaths[relPath]` 를 사용.
- 기존 `path.join(bundleRoot, relPath)` 재구성 완전 제거 — 검증과 실행 사이 심링크 교체 불가.

### P1-3 — Windows backslash `..` 미차단 수정 (처리)
- `assertWritablePath` 에 0단계 추가: 절대경로 거부 (`isAbsolute` + `/^[A-Za-z]:/`).
- `..` 검사에 `posixNorm` (backslash→/ 치환 후) + `win32Norm` 양쪽 normalize 세그먼트 검사 추가.
- 기존 `posix.normalize(relPath).split('/')` 만으로는 `..\\..\\x.sh` 미탐지 케이스 해결.
- CLAUDE.md 함정 #2 준수: Windows 케이스 테스트 `pathGate.writable.test.ts` 에 직접 명시.

### P1-2 — 쓰기 allowlist 를 dialog 경유 경로로만 제한 (처리)
- `HARNESS_SCAN` 핸들러에서 `fromDialog` 플래그 도입.
- `args.path` 직접 전달 경로는 scan(읽기) 는 허용하나 `registerBundle()` 호출 안 함.
- dialog 경유 경로만 write-allowlist 에 등록. skills 하위 경로는 pathGate 에서 항상 허용.

### P2-1 — apply 다중파일 부분 실패 시 자동 롤백 (처리)
- 쓰기 루프 catch 블록에 롤백 로직 추가:
  `applied[]` 에 이미 rename 된 파일에 대해 `backupDir/relPath → resolvedPaths[relPath]` copyFile.
- 롤백도 실패하면 warn 로그만 (원본 writeErr 를 덮지 않음).

### P2-2 — 신규 파일 apply 직전 존재 여부 재확인 (기존 로직으로 충분, 별도 수정 불필요)
- `baseContent === ''` 신규 파일 의도이나 디스크에 생긴 경우:
  STALE 대조 step 2 에서 `diskContents[relPath]` = 실제 내용 ≠ '' → sha 불일치 → `HarnessStaleEditError`.
  기존 STALE 검사가 이미 방어하고 있어 추가 코드 불필요.

### P2-4 — 에러 절대경로/허용루트 상세 격리 (처리)
- `HarnessPathDeniedError` 생성자를 3-arg 로 변경:
  - `super(userMessage)` — 사용자에게 노출되는 일반화된 메시지 (절대경로 미포함).
  - `internalReason: string` — 로그 전용 상세 (절대경로·허용루트 포함).
- IPC 핸들러(HARNESS_READ_FILE, HARNESS_APPLY_DRAFT, HARNESS_RESTORE_BACKUP)에서
  `e.internalReason` 으로 콘솔 로깅. renderer 로는 `err.message` (일반화) 만 전달.
- 모든 `throw new HarnessPathDeniedError(...)` 사이트에 userMessage 인자 추가.

## 결정 사항

- `collectBackupRelPaths` / `restoreFromBackupWithResolvedPaths` 를 `HarnessEditService.ts` 모듈 레벨 private 헬퍼로 선언. `backup.ts` 의 `collectRelPaths` 는 비공개이므로 복제 불가피. 중복이지만 쓰기 게이트 강제를 위한 최소 복사.
- `restoreFromBackup` (backup.ts) 은 더 이상 `restore` 에서 호출하지 않음 — 쓰기 게이트 우회를 원천 차단하기 위해.
- 기존 `import('./backup')` 동적 임포트 → `backup.ts` 정적 임포트는 이미 있으므로 제거하고 `fs` 직접 사용.

## 제약 (하지 말 것)

- `assertWritablePath` 의 반환값(resolved 절대경로)을 받아쓰지 않고 `path.join(bundleRoot, relPath)` 를 재구성하는 코드 추가 금지 — P1-1 TOCTOU 재발.
- `HARNESS_AI_EDIT` 핸들러에서 `HarnessEditService.readFile` 을 우회해 직접 `fs.readFile` 호출 금지 — P0-2 재발.
- `HARNESS_SCAN` 에서 `args.path` (dialog 미경유) 를 `registerBundle` 에 전달 금지 — P1-2 재발.
- `HarnessPathDeniedError.message` 에 절대경로·허용루트를 포함시키지 않음 — P2-4. 상세는 반드시 `internalReason` 에.
- `runClaudeStream` 분기 미수정 (이번 작업 범위 외).

## 테스트 결과

- 기존 44 tests + 신규 8 tests = **52 tests** (harness security 3개 파일)
- 전체: **103 test files, 1501 tests 통과**
- typecheck: 통과
- build: 통과 (dynamic import 경고 제거 완료)

## 참조

- 보안 리뷰 항목: P0-1, P0-2, P1-1, P1-2, P1-3, P2-1, P2-2(기존 충분), P2-4
- `src/main/harness/pathGate.ts` — 게이트 순수 함수
- `src/main/harness/HarnessEditService.ts` — 편집 파사드
- `src/main/index.ts` — IPC 핸들러 (HARNESS_SCAN, HARNESS_AI_EDIT, HARNESS_READ_FILE, HARNESS_APPLY_DRAFT, HARNESS_RESTORE_BACKUP)
