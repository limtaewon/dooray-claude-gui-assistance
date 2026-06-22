---
task: harness-studio-edit-m5
agent: main-process-engineer
date: 2026-06-22
---

# Impl Log — Harness Studio 편집 M5: IPC 배선 (main + preload)

## 변경한 파일

- `src/main/index.ts` (HarnessEditService import + lazy 인스턴스 + 6개 ipcMain.handle 등록 + HARNESS_SCAN registerBundle 추가)
- `src/preload/index.ts` (harness-edit 타입 import + api.harness.edit.* 6개 노출)

## 결정 사항

### HarnessEditService lazy 인스턴스 패턴
- `getHarnessService()` 와 동일한 lazy init 패턴으로 `getHarnessEditService()` 구현.
- `HarnessService` 인스턴스는 중복 생성 없이 `getHarnessService()` 반환값을 재주입. `AIService` 도 기존 `aiService` 전역 인스턴스 재사용.

### HARNESS_SCAN 에 registerBundle 추가
- 스캔 성공 후 `getHarnessEditService().registerBundle(realBundlePath)` 호출로 편집 allowlist 에 번들 경로 등록.
- 스캔이 선행되지 않은 번들은 readFile/diff/apply 호출 시 `HarnessPathDeniedError` 가 발생하므로 UX 흐름 상 반드시 스캔 먼저.
- allowlist 등록 실패(fs.realpath 불가 등)는 `catch` 로 조용히 처리 — 이후 서비스 내부에서 재검증.

### HARNESS_AI_EDIT 핸들러 — 파일 읽기 조율
- AIService.proposeEdit 시그니처는 `{ relPath, content }[]` 를 받음.
- IPC 핸들러가 `targetRelPaths` 를 받아 디스크에서 파일 내용을 읽어 배열로 조립한 뒤 위임.
- 파일 읽기 실패(존재하지 않는 relPath 등) 시 해당 항목을 warn 로그 후 스킵 — 전체 실패 방지.
- 40KB 상한 초과는 AIService 내부에서 throw — 핸들러는 try/catch 로 표면화.

### 핸들러는 얇은 어댑터
- 입력 검증·경로 게이트·백업·원자 쓰기는 모두 HarnessEditService(M3) 에 위임.
- 핸들러 역할: try/catch + console.error 로 에러 표면화, 결과 반환.

### preload api.harness.edit 네임스페이스
- 기존 `api.harness` 객체에 `edit` 서브 객체를 추가하는 방식(확장 친화적).
- 시그니처는 IPC 상수 주석의 요청/응답 타입과 정확히 일치시킴.

## 제약 (하지 말 것)

- `src/renderer/**` 수정 금지 — M6 영역.
- `AIService.runClaudeStream` 분기 수정 금지 — Mac/Windows 플랫폼 분기는 의도적.
- HarnessEditService 내부 게이트 우회 코드 추가 금지 — 이유: security-reviewer 리뷰 대상(M7).
- `getHarnessEditService()` 에 AIService 직접 주입 금지 — proposeEdit 는 IPC 핸들러에서 aiService 직접 호출로 조율.

## 검증 결과

- `npm run typecheck` : tsc 양쪽 통과 (exit 0)
- `npm run test:run` : 103 파일, 1493 테스트 전량 통과
- `npm run build` : main 446KB / preload 41KB / renderer 3848KB 빌드 성공

## 노출된 window.api.harness.edit.* 시그니처

```ts
window.api.harness.edit.readFile(
  path: string,
  relPath: string
): Promise<{ content: string; sourceMap?: AgentSourceMap }>

window.api.harness.edit.diff(
  path: string,
  draft: HarnessDraft
): Promise<DraftDiffSummary>

window.api.harness.edit.apply(
  path: string,
  draft: HarnessDraft
): Promise<{ applied: string[]; backupDir: string; model: HarnessModel }>

window.api.harness.edit.aiPropose(
  path: string,
  command: string,
  targetRelPaths: string[],
  requestId?: string
): Promise<{ proposals: AIEditProposal[] }>

window.api.harness.edit.listBackups(
  path: string
): Promise<BackupEntry[]>

window.api.harness.edit.restore(
  path: string,
  backupDir: string
): Promise<{ restored: string[]; model: HarnessModel }>
```

## 참조

- `docs/planning/harness-studio-edit-plan.md` M5 체크리스트
- `docs/planning/harness-studio-edit-arch.md` IPC 절
- ADR-harness-studio-edit-001/002/003
- M3: HarnessEditService (HarnessEditService.ts, pathGate.ts, backup.ts, draftDiff.ts)
- M4: AIService.proposeEdit, harnessEditPrompt.ts
- M0: IPC 상수 (harness:edit:*), harness-edit.ts 타입
