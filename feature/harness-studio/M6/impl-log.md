# impl-log — M6 편집 모드 UI (renderer)

- agent: renderer-engineer
- date: 2026-06-22
- milestone: M6

## 생성/수정 파일

### 신규 생성

| 파일 | 역할 |
|------|------|
| `src/renderer/src/components/HarnessStudio/edit/EditPanel.tsx` | 편집 모드 셸. editMode ON 시 렌더. draft useReducer(draftReducer), 상단 뷰 전환 탭, 하단 파일 요약 바, 종료 확인 모달 |
| `src/renderer/src/components/HarnessStudio/edit/StructuredFieldForm.tsx` | buildEditMap 기반 폼. [FORM] 필드(model 드롭다운/tools 멀티셀렉트) 편집. [RAW]/[AI]/[LOCK] 읽기전용 안내. applyFieldEdit + readFile IPC |
| `src/renderer/src/components/HarnessStudio/edit/RawFileEditor.tsx` | Monaco Editor + 좌측 fileTree 탐색기. .sh 상단 빨간 경고. draft 있으면 draft 내용으로 초기화. "draft 에 추가" 버튼 |
| `src/renderer/src/components/HarnessStudio/edit/DraftDiffView.tsx` | Monaco DiffEditor(baseContent↔draftContent). 파일별 펼치기/접기/되돌리기. stale 충돌/sh 경고 배지 |
| `src/renderer/src/components/HarnessStudio/edit/AICommandBar.tsx` | NL 명령 입력 → pickEditTargetsWithFileTree 대상 추정 → aiPropose IPC → 제안 diff 모달(2단계 승인). useAIProgress 진행 표시 |
| `src/renderer/src/components/HarnessStudio/edit/ApplyDialog.tsx` | 최종 적용 확인 다이얼로그. 백업 안내 + .sh 빨간 경고 + stale 차단. apply IPC 후 성공/실패 표시 |
| `src/renderer/src/components/HarnessStudio/edit/BackupRestorePanel.tsx` | listBackups IPC → 백업 목록. 2단계 확인 후 restore IPC. 복원 성공 시 onRestored(newModel) |

### 수정

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/src/components/HarnessStudio/HarnessStudioView.tsx` | editMode 상태(기본 OFF), AgentSourceMap/fileTree 상태, enterEditMode/exitEditMode/handleModelUpdated 핸들러, 헤더에 "편집" 버튼, editMode ON 시 EditPanel 전체 화면 렌더 |
| `src/renderer/src/components/ClaudeManual/ClaudeManual.tsx` | harness-studio 섹션에 "편집 모드 (v1.8)" 내용 추가 (편집 진입/3가지 경로/구조화 폼 범위/draft 시스템/적용/AI 2단계 승인/diff 뷰/백업 복원) |

## 설계 결정 사항

1. **회귀 0 보장**: editMode 기본값 OFF. EditPanel 은 `editMode === 'on'` 일 때만 마운트. 기존 8뷰/동작은 editMode OFF 시 완전 보존.
2. **draft useReducer**: draftReducer(M2 순수 함수) 를 EditPanel 에서 직접 `useReducer` 로 연결. 상태 리프팅 없이 EditPanel 단위 캡슐화.
3. **enterEditMode 전략**: 편집 진입 시 `readFile('.harness-sourcemap')` 로 AgentSourceMap 시도 + `scan()` 으로 fileTree 수집. 둘 다 실패해도 편집 모드 진입 허용(graceful degradation — form 필드가 lock 으로 폴백, raw 파일 목록 빈 상태).
4. **ApplyDialog 성공 흐름**: apply IPC 응답의 `model.meta.bundleHash` 로 `CLEAR_AFTER_APPLY` 액션 dispatch → draft 초기화. `onSuccess` 콜백으로 상위 HarnessStudioView 의 model 상태 갱신.
5. **Monaco 테마**: useTheme 훅으로 `theme === 'dark' ? 'vs-dark' : 'light'` 연동. Editor(RawFileEditor) + DiffEditor(DraftDiffView, AICommandBar) 모두 동일 패턴.
6. **AI 승인 2단계**: AICommandBar 모달에서 제안 선택 → `onProposalAccepted` 콜백 → EditPanel 의 `ADD_OR_UPDATE` dispatch. 파일에 쓰는 것은 별도 ApplyDialog.

## 검증 결과

- `npm run typecheck`: 통과 (0 errors)
- `npm run test:run`: 1493 tests passed (103 test files) — 기존 테스트 회귀 없음
- `npm run build`: 성공 (renderer 3938 kB)

## DOD 체크

- [x] 편집 모드 OFF 시 기존 8뷰/동작 100% 보존 (editMode 기본 OFF)
- [x] 순수 로직(M2): draftReducer/editMap/applyFieldEdit/pickEditTargets 재사용 (재구현 없음)
- [x] IPC(M5): window.api.harness.edit.{readFile,diff,apply,aiPropose,listBackups,restore} 연결
- [x] Monaco: @monaco-editor/react(기존 deps) Editor + DiffEditor 사용 (신규 의존 0)
- [x] 디자인 토큰: hex 하드코딩 없음. CSS 변수 사용
- [x] 다크/라이트 연동: Monaco 테마 useTheme 연결
- [x] 한국어 문구
- [x] ClaudeManual.tsx 갱신 (편집 모드 v1.8 섹션)
- [x] main/preload/shared 수정 없음
