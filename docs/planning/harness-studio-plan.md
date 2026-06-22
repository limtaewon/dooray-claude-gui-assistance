# Harness Studio — 단계별 구현 계획 (Milestones)

> 설계: `harness-studio-arch.md` · 결정: `harness-studio-adr-001~004` · PRD: `harness-studio-prd.md`
> 범위: P1+P2+P3 전체. 아래는 의존성 순서로 쪼갠 **현실적 실행 단위(Milestone)**.
> 담당 에이전트 표기: **MPE**=main-process-engineer, **RE**=renderer-engineer, **TE**=test-engineer.
> DOD(전 마일스톤 공통): 신규 순수모듈 vitest(70% 라인), 사용자가시 기능은 ClaudeManual SECTIONS 갱신, 큰 사이클 종료 시 CHANGELOG.

---

## 의존성 개요 (실행 순서)

```
M0 (타입/스캐폴드)
  └─> M1 (정적 스캐너)              ── 병렬가능: M2 와 동시 착수 가능 (둘 다 M0 의존)
  └─> M2 (AIService 확장 + 캐시)
        └─> M3 (정규화 파이프라인 + IPC)   ← M1 + M2 필요
              └─> M4 (Import 위저드 + 셸뷰)  ← M3 IPC 필요
                    ├─> M5 (Flow Canvas + Inspector)   ── react-flow
                    ├─> M6 (정적 5뷰: Skills/Gates/Artifacts/Score)  ── 병렬: M5 와 동시
                    └─> M7 (Dry-run)            ← M5(경로 하이라이트) + M2(추정) 필요
                          └─> M8 (P3: 오버레이/Export/비교/Doctor/매뉴얼·릴리즈)
```
병렬 구간: **M1∥M2**, **M5∥M6**. 직렬 핵심경로: M0→M2→M3→M4→M5→M7→M8.

---

## M0 — 타입 & 스캐폴드 (기반)

| # | 작업 | 도메인 | 담당 | 영향 파일 | 산출물 |
|---|---|---|---|---|---|
| 0.1 | `HarnessModel` 외 전체 타입 정의 | shared | MPE | `src/shared/types/harness.ts`(신규) | arch §1 스키마 그대로 |
| 0.2 | `IPC_CHANNELS` 에 `HARNESS_*` 7개 추가 | shared | MPE | `src/shared/types/ipc.ts` | arch §4 표 |
| 0.3 | `AIModelConfig` 에 `harnessNormalize?`/`harnessEstimate?` 키 추가 | shared | MPE | `src/shared/types/ai.ts` | 기능별 모델 라우팅 키 |
| 0.4 | `View` 유니온에 `'harness'` 추가 + Sidebar 항목 + 빈 `HarnessStudioView` 마운트 | renderer | RE | `App.tsx`(L31 union, vis 라우팅), `Layout/Sidebar.tsx`, `HarnessStudio/HarnessStudioView.tsx`(신규 placeholder) | 사이드바 진입 가능 |

- 의존: 없음 (시작점)
- 테스트(TE): 타입은 컴파일 검증. Sidebar 항목 추가는 `Sidebar.test.tsx` 케이스 보강.
- 리스크: 낮음. `App.tsx` View union·vis() 패턴 정확히 따를 것(기존 라인 31·305 참조).

---

## M1 — 정적 번들 스캐너 (AI 없음) ∥ M2

| # | 작업 | 도메인 | 담당 | 영향 파일 | 산출물 |
|---|---|---|---|---|---|
| 1.1 | frontmatter YAML 파서(순수) | main | MPE | `harness/frontmatter.ts` | name/tools/allowed-tools/model/description 추출 |
| 1.2 | `bundleHash`(순수, 정렬 안정 sha256) | main | MPE | `harness/bundleHash.ts` | arch §6 해시 규칙 |
| 1.3 | `bundleDetect`(순수) — kind 감지 | main | MPE | `harness/bundleDetect.ts` | bundle/overlay/partial-skill/task (ADR-002) |
| 1.4 | `BundleScanner` — 트리 walk + frontmatter + 템플릿/hook/gate 스크립트 텍스트 수집 → `RawBundle` | main | MPE | `harness/BundleScanner.ts` | **`.sh` 비실행, 텍스트만**(ADR-002) |
| 1.5 | gate 스크립트 정적 파서 — `R5xx`/`NEON-Gxx`/`AOP01` 규칙코드 + phase case + exit 추출 | main | MPE | `harness/BundleScanner.ts` 내 헬퍼 | gate phase/ruleCodes/blocking [S] |

- 의존: M0 (타입)
- 테스트(TE, 70% 필수): `frontmatter.test.ts`(neon 무model/reined model 양쪽 fixture), `bundleHash.test.ts`(파일변경 시 해시변경/순서무관), `bundleDetect.test.ts`(4 kind + 오판 경계), `BundleScanner.test.ts`(reined·neon 축소 fixture로 agent stub/gate 코드 추출). **fixture는 실제 두 번들 구조 축소본**.
- 리스크 ⚠: neon `model:` 부재 → matrix 폴백 경로를 1.4에 포함(없으면 `unknown`+provenance). gate 스크립트 prefix 다양성 → 정규식을 코드셋 union 으로.

---

## M2 — AIService 확장 + 캐시 ∥ M1

| # | 작업 | 도메인 | 담당 | 영향 파일 | 산출물 |
|---|---|---|---|---|---|
| 2.1 | `normalizePrompt.ts`(순수) — 스키마강제 system + "비어있는 [AI]필드만 JSON" user 빌더 | main | MPE | `harness/normalizePrompt.ts` | ADR-001 계약 |
| 2.2 | `AIService.normalizeHarness(rawBundle)` — `pickModel('harnessNormalize','sonnet')`, `runClaudeStream` 재사용 | ai-service | MPE | `src/main/ai/AIService.ts` | ⚠ 분기 가이드 |
| 2.3 | `AIService.estimateLevel(taskText, triage)` — `pickModel('harnessEstimate','haiku')` | ai-service | MPE | `src/main/ai/AIService.ts` | 레벨추정(Q코드 미노출 자연어) |
| 2.4 | `HarnessCache`(파일 JSON, schemaVersion 무효화) | main | MPE | `harness/HarnessCache.ts` | ADR-004 |
| 2.5 | `taskHash`(순수) | main | MPE | `harness/HarnessCache.ts` 또는 별 모듈 | bundleHash+taskText |

- 의존: M0 (타입)
- 테스트(TE): `normalizePrompt.test.ts`(빈 필드만 요청하는지·스키마 포함), `HarnessCache.test.ts`(hit/miss/schemaVersion 무효화/손상JSON 무효화 — `<userData>` 모킹). AIService 메서드는 `runClaudeStream` 모킹해 **Mac/Windows 양쪽 platform 분기 테스트**(CLAUDE.md 함정 #2 — `Object.defineProperty(process,'platform',...)`).
- 리스크 ⚠⚠: **AIService 플랫폼 분기**. 큰 system prompt(스키마)가 Windows stdin combine 경로에 들어가므로 회귀 위험. 분기 코드 *변경 금지*, args 빌드만 추가. 양쪽 케이스 회귀테스트 필수. 진단로그(cliLogger) platform/argv 확인(함정 #4).

---

## M3 — 정규화 파이프라인 조립 + IPC 핸들러 (직렬 핵심)

| # | 작업 | 도메인 | 담당 | 영향 파일 | 산출물 |
|---|---|---|---|---|---|
| 3.1 | `HarnessNormalizer` — 정적스켈레톤 + AI보강 머지(+ provenance/warnings) | main | MPE | `harness/HarnessNormalizer.ts` | ADR-001 머지규칙(AI가 [S] 못덮음) |
| 3.2 | `HarnessService` 파사드 — scanner+normalizer+cache 묶기 | main | MPE | `harness/HarnessService.ts` | IPC가 호출할 단일 진입 |
| 3.3 | IPC 핸들러 등록 (`HARNESS_SCAN/DISCOVER/NORMALIZE/CACHE_CLEAR/LIST_CACHED`) | electron-ipc | MPE | `src/main/index.ts` | 3+1 ③단계 |
| 3.4 | preload 노출 `window.api.harness.*` | electron-ipc | MPE | `src/preload/index.ts` | 3+1 ②단계 |
| 3.5 | 진행률은 기존 `AI_PROGRESS`/`useAIProgress` 재사용 배선 | electron-ipc | MPE | (이벤트 emit in 2.2/3.1) | 신규 push채널 없음 |

- 의존: **M1 + M2**
- 테스트(TE): `HarnessNormalizer.test.ts`(AI가 [S]필드 덮어쓰기 시도 → 무시되는지, JSON파싱 실패 → 축소모델+warnings, provenance 정확성). IPC 핸들러는 `HarnessService` 핵심 로직이 순수/주입형이라 서비스 단위로 테스트.
- 리스크: 머지 로직이 ADR-001의 핵심 — 정적 우선·AI 보강만. 여기서 틀리면 신뢰도 무너짐.

---

## M4 — Import 위저드 + 스튜디오 셸

| # | 작업 | 도메인 | 담당 | 영향 파일 | 산출물 |
|---|---|---|---|---|---|
| 4.1 | `ImportWizard`(4-step 컨테이너) | renderer | RE | `HarnessStudio/import/ImportWizard.tsx` | PRD §5 |
| 4.2 | `SourceStep`(드롭/폴더선택/자동발견) | renderer | RE | `import/SourceStep.tsx` | `harness.discover/scan` 호출 |
| 4.3 | `ScanStep`(정적결과 kind/트리, AI전 0초, kind 수동교정) | renderer | RE | `import/ScanStep.tsx` | ADR-002 kind 교정 |
| 4.4 | `NormalizeStep`(useAIProgress + provenance 프리뷰) | renderer | RE | `import/NormalizeStep.tsx`, `shared/ProvenanceBadge.tsx` | |
| 4.5 | `ConfirmStep`(오버레이/용어번역 토글) + `HarnessStudioView` 상태배선 | renderer | RE | `import/ConfirmStep.tsx`, `HarnessStudioView.tsx` | model 보유 |
| 4.6 | `LIST_CACHED` 로 최근 하네스 빠른 재오픈 UI | renderer | RE | `HarnessStudioView.tsx` | 재오픈 0초 UX |

- 의존: M3 (IPC)
- 테스트(TE): `ProvenanceBadge.test.tsx`, 위저드 step 전이 로직(순수 추출분). ds 컴포넌트(SegTabs/Button/Card/Modal) 재사용.
- 리스크: 드롭/폴더선택은 main dialog 경유(SHELL 패턴 참조). 자동발견은 `~/.claude/skills` 읽기 권한.

---

## M5 — Flow Canvas + Agent Inspector (react-flow) ∥ M6

| # | 작업 | 도메인 | 담당 | 영향 파일 | 산출물 |
|---|---|---|---|---|---|
| 5.1 | `@xyflow/react` 의존 추가(lazy import 권장) | renderer | RE | `package.json` | ADR-003 |
| 5.2 | `buildGraph(model, levelId)`(순수) → nodes/edges + 컬럼배치 | renderer | RE | `flow/buildGraph.ts` | L0~L3 토글 재구성 |
| 5.3 | `PhaseColor`(순수) phaseClass→DS토큰, `flowTheme.ts` CSS변수 바인딩 | renderer | RE | `flow/flowTheme.ts`, `shared/PhaseColor.ts` | 다크/라이트 |
| 5.4 | 커스텀 노드 `AgentNode`(페이즈색·모델배지·위험·provenance), `GateNode` | renderer | RE | `flow/nodes/*.tsx` | PRD 7-1 |
| 5.5 | 커스텀 엣지 `HandoffEdge`(산출물라벨·점선·RETURN) | renderer | RE | `flow/edges/HandoffEdge.tsx` | |
| 5.6 | `FlowCanvas`(토글·줌팬·클릭) + `AgentInspector`(모델/역할/도구/입출력/에스컬레이션) | renderer | RE | `flow/FlowCanvas.tsx`, `inspector/AgentInspector.tsx` | PRD 7-1 |

- 의존: M4 (model 보유)
- 테스트(TE, 70%): `buildGraph.test.ts`(L0~L3별 활성노드/병렬그룹/엣지, 빈 체인 degradation), `PhaseColor.test.ts`. react-flow 컴포넌트는 스냅샷 대신 buildGraph 순수로직 집중.
- 리스크 ⚠: react-flow 테마 바인딩(CSS변수)이 useTheme 전환 시 즉시 반영되는지 수동 QA. 큰 번들 노드수 렌더 성능.

---

## M6 — 정적 5뷰 (Skills/Blocks · Gates · Artifacts · Score) ∥ M5

| # | 작업 | 도메인 | 담당 | 영향 파일 | 산출물 |
|---|---|---|---|---|---|
| 6.1 | `SkillsBlocksPanel` — SKILL해부·역할카드·합리화방어테이블·blocks 매핑 | renderer | RE | `views/SkillsBlocksPanel.tsx` | PRD 7-3 |
| 6.2 | `GatesPanel` — 4계층 제약·게이트 규칙코드·hook 3종·상태기계 | renderer | RE | `views/GatesPanel.tsx` | PRD 7-4 |
| 6.3 | `ArtifactsPanel` — 산출물 트리·persist 배지(git/ignore/dooray)·템플릿 스켈레톤 | renderer | RE | `views/ArtifactsPanel.tsx` | PRD 7-5 |
| 6.4 | `ScorePanel` — 6축 레이더(recharts 재사용)·점수여정·**score 없으면 안내** | renderer | RE | `views/ScorePanel.tsx` | PRD 7-6, score=AI/optional |
| 6.5 | 6뷰 전환 SegTabs 셸 (Flow + 5뷰) | renderer | RE | `HarnessStudioView.tsx` | |

- 의존: M4 (model). M5와 독립 → 병렬.
- 테스트(TE): 각 패널의 표시 가공 순수함수(예: 산출물 트리 빌더, persist 분류 매핑)를 분리해 테스트. recharts 데이터 변환 테스트.
- 리스크: `score?` optional — 없을 때 빈 상태(StateViews) + "AI 재생성" 안내(절대 빈 레이더 깨짐 X). warnings 노출.

---

## M7 — Dry-run (P2)

| # | 작업 | 도메인 | 담당 | 영향 파일 | 산출물 |
|---|---|---|---|---|---|
| 7.1 | `levelPath(model, levelId)`(순수) → 하이라이트경로·병렬그룹·게이트·예상시간/상대비용 | main | MPE | `harness/levelPath.ts` | PRD §2 결정론 |
| 7.2 | `DryRunEstimator` — estimateLevel(Haiku)+levelPath+taskHash 캐시 | main | MPE | `harness/DryRunEstimator.ts` | |
| 7.3 | `HARNESS_DRYRUN` IPC + preload + service 배선 | electron-ipc | MPE | `index.ts`, `preload/index.ts`, `HarnessService.ts` | 3+1 |
| 7.4 | `DryRunPanel`(태스크입력/URL·레벨결과·타임라인·게이트·비용) + Flow 경로하이라이트 연동 | renderer | RE | `views/DryRunPanel.tsx`, `flow/FlowCanvas.tsx`(하이라이트 prop) | PRD 7-2 |

- 의존: **M5(하이라이트) + M2(estimate)**
- 테스트(TE, 70%): `levelPath.test.ts`(triage rules 적용 결정론 — reined "Q4→L3", neon "L3 OR Q3=Yes" securityOverride 양쪽, 병렬그룹/예상시간 계산). estimateLevel 은 AI 모킹.
- 리스크: 비용/시간은 *상대 추정*(절대값 아님) 임을 UI 명시. Q코드 미노출(자연어) 준수.

---

## M8 — P3 (개인화 · Export · 비교 · Doctor) + 매뉴얼/릴리즈

| # | 작업 | 도메인 | 담당 | 영향 파일 | 산출물 |
|---|---|---|---|---|---|
| 8.1 | 오버레이 반영(개인화) — overlay 의 modelOverrides/disabledAgents 를 그래프/뷰에 적용 | renderer+main | RE/MPE | `buildGraph.ts`, 뷰들 | PRD §5 ④ |
| 8.2 | `HARNESS_EXPLAIN`(온디맨드 Sonnet 설명/용어번역) | ai-service+ipc | MPE | `AIService.ts`, `index.ts`, `preload` | PRD §8 |
| 8.3 | 공유 Export(이미지/HTML) | renderer | RE | `HarnessStudio/export/*` | PRD §11 P3 |
| 8.4 | 하네스 비교 뷰(neon↔reined diff) | renderer | RE | `views/CompareView.tsx` | 두 model diff |
| 8.5 | Doctor 패널(정합 PASS/WARN/FAIL + 6축 약점) | renderer | RE | `views/DoctorPanel.tsx` | PRD §12-7 |
| 8.6 | **ClaudeManual SECTIONS 에 Harness Studio 항목** (DOD) | renderer | RE/writer | `ClaudeManual/ClaudeManual.tsx` | 사용자 가시 기능 |
| 8.7 | CHANGELOG v1.7 항목 + README 점검 | docs | writer | `CHANGELOG.md`, `README.md` | DOD |

- 의존: M5/M6/M7
- 테스트(TE): diff 로직·doctor 정합 판정 순수함수 테스트. Export 직렬화 테스트.
- 리스크: Export 이미지(react-flow → png)는 라이브러리 기능 + 테마 캡처 정합. Doctor 정합은 정적 점검(파일 존재/체인 소비자 없는 산출물 등).

---

## 권장 실행 순서 & 병렬화 요약

1. **M0** (단독, 빠름) — 타입/스캐폴드 먼저.
2. **M1 ∥ M2** (병렬 2 트랙: 정적스캐너 / AI+캐시). 둘 다 M0만 의존.
3. **M3** — M1+M2 합류해 정규화 파이프라인+IPC.
4. **M4** — 위저드/셸.
5. **M5 ∥ M6** (병렬: Flow / 정적5뷰).
6. **M7** — Dry-run (M5+M2 필요).
7. **M8** — P3 + 매뉴얼/릴리즈.

## 전역 리스크 플래그

- ⚠⚠ **AIService 플랫폼 분기**(M2): Windows stdin combine 경로에 큰 스키마 prompt → 회귀 위험. 분기 코드 손대지 말 것, 양쪽 테스트 필수.
- ⚠ **번들 일반화**(M1): reined/neon 구조 차이(`_agents` 유무, model 유무, gate prefix). 실제 두 번들 축소 fixture로 검증.
- ⚠ **AI 머지 신뢰도**(M3): 정적 우선·AI 보강만. provenance/warnings 정확성이 저자 페르소나 신뢰의 핵심.
- ⚠ **react-flow 테마**(M5): useTheme 전환 즉시반영 수동 QA.
- 신규 의존 `@xyflow/react` 만 추가(네이티브 아님, asarUnpack 불필요). recharts·dialog 는 기존 재사용.

## DOD 체크 (마일스톤 누적)

- [ ] 신규 순수모듈 전부 vitest 70% (frontmatter/bundleHash/bundleDetect/normalizePrompt/HarnessCache/HarnessNormalizer/levelPath/buildGraph/PhaseColor 등)
- [ ] AIService 신규 메서드 Mac/Windows 양쪽 platform 분기 테스트
- [ ] ClaudeManual SECTIONS Harness Studio 항목 (M8.6)
- [ ] CHANGELOG v1.7 + README 점검 (M8.7)
