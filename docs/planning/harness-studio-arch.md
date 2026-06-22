# Harness Studio — 아키텍처 설계

> 대상: GitHub Issue #26 / PRD `docs/planning/harness-studio-prd.md`
> 브랜치: `feature/harness-studio` (main 기준)
> 작성: architect (Clauday) · 2026-06-19
> 전제(사용자 승인): 범위 = P1+P2+P3 전체(단계 분할 실행), 그래프 = `@xyflow/react` 채택, 디자인 = Clauday DS 준수, DOD = vitest 70% + ClaudeManual.

이 문서는 **무엇을 만들지(구조)** 와 **왜 그렇게 나누는지(근거)** 를 정의한다. 실행 순서/체크리스트는 `harness-studio-plan.md`, 불변 결정은 `harness-studio-adr-*.md`.

---

## 0. 근거 데이터 — 실제 번들을 열어본 결과 (추측 아님)

설계의 모든 분담(정적/AI)은 아래 **실측**에 기반한다.

| 항목 | reined-bmad | neon-bmad | 함의 |
|---|---|---|---|
| 에이전트 정의 위치 | `_agents/reined-bmad-*.md` (Task용) + `<role>/SKILL.md` (allowed-tools) **이중** | `<role>/SKILL.md` **단일** (`_agents/` 없음) | 파서는 *둘 다* 스캔하고 병합해야 함 |
| frontmatter `model:` | **14개 전부 존재** (haiku/sonnet/opus) | 파이프라인 에이전트(developer/qa/...) **전부 없음**, critic/verifier만 `opus` | model 은 *있으면 정적, 없으면* `_core/models.md` 매트릭스 폴백 또는 AI |
| frontmatter `tools:`/`allowed-tools:` | `tools:` (`_agents`), `allowed-tools:` (SKILL) | `allowed-tools:` (SKILL) | 둘 다 인식, MCP 도구명(`mcp__...`)도 포함 → tools 화이트리스트는 **정적 확실** |
| 레벨/triage 위치 | `_core/triage.md` (표 + 판정규칙 코드블록) | `_core/concepts.md §7~8` (다른 파일, 다른 형식) | 레벨/규칙은 **위치·형식 비고정** → 정규식만으로 안전 추출 불가 → AI |
| 레벨→에이전트 체인 | `_core/triage.md` 코드블록 (텍스트 화살표) | `_core/concepts.md §8` 표 | 형식 다름 → AI 정규화 |
| 게이트 | `_hooks/gate.sh` (`R5xx` 규칙, exit 0/1, phase별 case) | `_hooks/neon-bmad-gate-check.sh` (`NEON-Gxx`/`AOP01`/`LYR01`) | 규칙코드 prefix·구조 다름 → 정규식 추출 + AI 라벨링 |
| hooks | `_hooks/subagent-stop.sh` 등 PreToolUse/PostToolUse | `neon-bmad-pretool-guard.sh` / `subagent-guard.sh` | 파일 존재·종류는 정적, "무엇을 강제하나"는 AI |
| 상태기계 | `_core/loop.md` + `signals.md`(SIGNAL enum 표) | `blocks/pipeline.sh` (transition: pass/violation/deviation/redo→escalate) | SIGNAL enum 은 표라서 반정형, 전이는 스크립트 분석 → AI |
| 산출물 템플릿 | `_templates/*.md` (frontmatter + 섹션) | **없음** (템플릿 디렉터리 자체 부재) | 템플릿 frontmatter/섹션은 정적, 생산자/소비자 매핑은 AI |
| 산출물 트리/persist | `_core/concepts.md §4` (git 추적 vs gitignore 산문 설명) | `concepts.md` (`.neon-bmad/` ignore vs 두레이 vs report.html) | persist 분류는 **AI** (산문에 흩어짐) |
| 4계층 제약 | `_core/concepts.md §2` 표 | `_core/concepts.md §2` 유사 표 | 정형 표라 AI 로 안정 추출 가능 |
| 6축 점수(레이더) | 산문(GUIDE/CHANGELOG)에만 언급, **기계가독 소스 없음** | doctor.sh 는 *설치 정합* 점검(6축 아님) | score 는 **순수 AI 추정 또는 생략** (정적 불가) |
| 합리화 방어 테이블 | `<role>/SKILL.md` 의 `## 합리화 방어 테이블` (마크다운 표) | 일부 SKILL.md | 표 위치 비고정 → 정규식 후보탐지 + AI |
| 역할카드(역할/위험/권한) | `<role>/SKILL.md ## 역할 카드` + `_core/concepts.md §3` 표 | SKILL.md `## 역할 카드` | 표는 반정형, role/reads/writes/escalation 은 **AI** |

**결론(핵심)**: frontmatter(`name/tools/model?/description`)와 **파일트리 토폴로지**(어떤 `_core/_templates/_hooks/_agents/blocks`가 있나, 어떤 role 폴더가 있나, 어떤 `.sh`가 있나)는 **정적으로 100% 확실**하다. 그러나 *레벨 규칙·체인·게이트 의미·reads/writes·역할/위험·escalation·상태전이·산출물 persist·6축 점수*는 **위치·형식이 번들마다 다른 산문/스크립트**라 정적 추출이 깨진다 → **AI 정규화가 필수**. 이 분담이 ADR-001/002 의 근거다.

---

## 1. HarnessModel — 최종 스키마 (`src/shared/types/harness.ts`)

PRD §6 초안을 실측 구조로 구체화. 각 필드에 **[S]=정적스캔 / [AI]=AI정규화 / [S→AI]=정적 시도 후 누락분 AI 보강** 표기.

```ts
// src/shared/types/harness.ts

export type HarnessModelName = 'haiku' | 'sonnet' | 'opus' | 'unknown'
export type HarnessLevelId = 'L0' | 'L1' | 'L2' | 'L3'
export type FieldSource = 'static' | 'ai' | 'inferred' | 'absent'

/** 필드 단위 출처 추적 — UI 가 "AI 추정" 배지를 정확히 달기 위함 (신뢰도 투명성) */
export interface Provenance { [fieldPath: string]: FieldSource }

export interface HarnessMeta {
  name: string            // [S] 번들 디렉터리명 (reined-bmad)
  version?: string        // [S] VERSION 파일 또는 frontmatter
  source: string          // [S] import 절대경로
  bundleHash: string      // [S] 정규화 캐시 키 (아래 §6)
  author?: string         // [AI] README/GUIDE 산문
  tagline?: string        // [AI]
  kind: 'bundle' | 'overlay' | 'partial-skill' | 'task'  // [S] 토폴로지 감지 (PRD §5)
}

export interface HarnessAgent {
  id: string                       // [S] frontmatter name (reined-bmad-developer)
  displayName: string              // [S] id 에서 접두어 제거 (developer)
  role: string                     // [AI] 한 줄 역할 (SKILL.md ## 역할 한 줄 / 역할 카드)
  model: HarnessModelName          // [S→AI] frontmatter model: → 없으면 _core/models.md 매트릭스 → AI
  modelSource: FieldSource         // [S] model 을 어디서 얻었는지 (frontmatter/matrix/ai)
  tools: string[]                  // [S] tools:/allowed-tools: (mcp__ 포함)
  reads: string[]                  // [AI] SKILL.md "필독 파일" 산문 → 정규화
  writes: string[]                 // [AI] 역할카드 "도구 권한"/concepts §3 산문 → 경로 패턴
  phaseClass?: string              // [AI] analyst|pm|architect|sm|dev|qa|security|release|orchestrator|other
  escalation?: string              // [AI] "크기 초과 시 SM 반려" / "SIGNAL: ESCALATE" 조건
  signals?: string[]              // [S→AI] signals.md enum 표에서 이 에이전트 행 (IMPL_COMPLETE...)
  riskNote?: string                // [AI] 역할카드 "주된 위험"
}

export interface HarnessLevel {
  id: HarnessLevelId               // [S] (L0~L3 토큰은 정적, 매핑은 AI)
  name: string                     // [AI] "Standard Feature (2두 마차)"
  agentChain: string[]             // [AI] triage.md/concepts.md 체인 → agent id 배열 (순서 의미)
  parallelInChain?: string[][]     // [AI] "QA || Security 병렬" 같은 병렬 구간
  requiredArtifacts: string[]      // [AI] "전체. ADR ≥ 1" → artifact id 배열
}

export interface TriageQuestion { id: string; text: string; meaning: string }  // [AI]
export interface TriageRule { when: string; then: HarnessLevelId }              // [AI] 판정규칙 코드블록 정규화

export interface HarnessTriage {
  questions: TriageQuestion[]      // [AI] Q1~Q6 표
  rules: TriageRule[]              // [AI] "Q4 Yes → L3" 등
  securityOverride?: string        // [AI] neon "L3 OR Q3=Yes" 같은 레벨독립 규칙
}

export interface ArtifactTemplate {
  frontmatter: string[]            // [S] _templates/*.md frontmatter 키 목록
  sections: string[]               // [S] "## 결정 사항" 등 헤더 목록
}
export interface HarnessArtifact {
  id: string                       // [S] 템플릿 파일명 stem (story, impl-log) — 또는 [AI] 산문에서
  producer?: string                // [AI] 어느 에이전트가 생성 (handoff 표/SKILL 출력 섹션)
  consumers: string[]              // [AI] 어느 에이전트가 read
  location?: string                // [AI] ".reined-bmad/docs/stories/..." 경로
  persist: 'git' | 'ignore' | 'dooray' | 'unknown'  // [AI] concepts §4 산문 분류
  template?: ArtifactTemplate      // [S] 템플릿 파일 있으면
}

export interface HarnessGate {       // [S→AI]
  phase: string                    // [S] gate.sh case 라벨 (dev/qa/...) — 스크립트 파싱
  ruleCodes: string[]              // [S] 정규식 R5xx / NEON-Gxx / AOP01
  description?: string             // [AI] 무엇을 차단하나
  blocking: boolean                // [S] exit 1/exit 2 존재 → 진짜 차단인지
}
export interface HarnessHook {       // [S→AI]
  file: string                     // [S] _hooks/*.sh 파일명
  event?: string                   // [S→AI] SubagentStop/PreToolUse/Stop (스크립트/설정 grep)
  enforces?: string                // [AI] 무엇을 강제
}
export interface HarnessControlFlow {
  gates: HarnessGate[]
  hooks: HarnessHook[]
  parallelGroups: string[]         // [AI] "Developer 병렬", "QA||Security"
  loops: string[]                  // [AI] "QA RETURN 루프 3회 → PM 에스컬레이션"
  signalEnum?: Record<string, string[]>  // [S→AI] agent → 허용 SIGNAL (signals.md 표)
  stateMachine?: { transitions: { from: string; on: string; to: string }[] }  // [AI] pipeline.sh
}

export interface HarnessScoreAxis { key: string; value: number; max: number; note?: string }
export interface HarnessScore {      // [AI] 전부 — 기계가독 소스 없음
  axes: HarnessScoreAxis[]         // 6축: 강제력/제어흐름/상태/차단게이트/피드백루프/관측가능성
  total: number
  rationale?: string               // 점수 근거 (투명성)
}

export interface HarnessOverlay {    // [S→AI] config.md / _overlays/*.md
  stack?: string                   // [AI]
  domains: string[]                // [AI]
  modelOverrides: Record<string, HarnessModelName>  // [S→AI] "## 모델 오버라이드" 표
  disabledAgents: string[]         // [S→AI] "## 비활성 에이전트"
}

export interface HarnessModel {
  schemaVersion: number            // 모델 스키마 버전 (마이그레이션용, 초기 1)
  meta: HarnessMeta
  agents: HarnessAgent[]
  levels: HarnessLevel[]
  triage: HarnessTriage
  artifacts: HarnessArtifact[]
  controlFlow: HarnessControlFlow
  score?: HarnessScore             // optional — 없으면 점수 뷰는 "추정 불가/AI 재생성" 안내
  overlay?: HarnessOverlay
  warnings: string[]               // degradation 시 "체인 추출 실패" 등 사용자 고지
  provenance: Provenance           // 필드별 출처 (UI 신뢰도 배지)
}
```

### 정적 vs AI 분담 요약 (실측 기반)

- **[S] 정적으로 확실히 채우는 것**: `meta.name/version/source/kind/bundleHash`, `agents[].id/displayName/tools`, `agents[].model`(frontmatter 있을 때), `artifacts[].template`(`_templates` 존재 시), `controlFlow.gates[].phase/ruleCodes/blocking`, `controlFlow.hooks[].file`, overlay 의 표 항목.
- **[AI] 반드시 AI 가 채우는 것**: `levels`(체인/병렬/필수산출물), `triage`(질문/규칙), `agents[].role/reads/writes/phaseClass/escalation/riskNote`, `artifacts[].producer/consumers/persist`, `controlFlow.gates[].description/parallelGroups/loops/stateMachine`, `score`(전부), `meta.author/tagline`.
- **[S→AI] 정적 시도 후 폴백**: `agents[].model`(neon 파이프라인 에이전트는 매트릭스/AI), `agents[].signals`, `overlay.modelOverrides/disabledAgents`(표가 정형이면 정적, 아니면 AI).

이 분담은 **ADR-001** 로 고정.

---

## 2. 모듈 분해 (파일 경로 제안)

### 2.1 shared (타입 — 단일 진실 소스)
```
src/shared/types/harness.ts          # 위 §1 전체 (HarnessModel + 부속 타입)
src/shared/types/ipc.ts              # IPC_CHANNELS 에 HARNESS_* 추가 (기존 파일 수정)
```

### 2.2 main (Node — 정적스캔 / AI라우팅 / IPC / 캐시)
```
src/main/harness/
  BundleScanner.ts          # [정적] import 경로 → 파일트리 walk + frontmatter 파싱 → RawBundle (AI 없음)
  bundleDetect.ts           # [정적] kind 감지 (bundle/overlay/partial-skill) — PRD §5 신호표
  frontmatter.ts            # [정적] yaml frontmatter 파서 (순수함수, 테스트 용이)
  HarnessNormalizer.ts      # [AI] RawBundle → HarnessModel. AIService 라우팅 + 해시캐시 조율
  normalizePrompt.ts        # [순수] 정규화용 system/user 프롬프트 빌더 (스키마 강제, JSON only)
  HarnessCache.ts           # [정적] bundleHash/taskHash → JSON 캐시 (<userData>/harness-cache/)
  bundleHash.ts             # [순수] 파일 내용+mtime 해시 (정렬 안정)
  DryRunEstimator.ts        # [AI] 태스크 → 레벨추정(Haiku) + 경로계산(정적). taskHash 캐시
  levelPath.ts              # [순수] HarnessModel + levelId → 하이라이트 경로/병렬그룹 (결정론, AI없음)
  HarnessService.ts         # [조립] scanner+normalizer+cache+estimator 묶는 파사드 (IPC 핸들러가 호출)
  __tests__/                # vitest — frontmatter/bundleHash/levelPath/bundleDetect 순수함수 집중
```
> **분리 원칙**: electron 의존(dialog/store)은 `HarnessService`/IPC 핸들러에만. 그 외(`frontmatter/bundleHash/levelPath/normalizePrompt/bundleDetect`)는 **순수함수**로 떼어 70% 커버리지를 안전 확보 (CLAUDE.md DOD). `HarnessNormalizer`/`DryRunEstimator` 의 AI 호출은 `AIService` 를 주입받아 모킹.

### 2.3 main — AIService 확장 (기존 파일, 분기 가이드 준수)
```
src/main/ai/AIService.ts             # normalizeHarness()/estimateLevel() 메서드 추가 (runClaudeStream 재사용)
src/shared/types/ai.ts               # AIModelConfig 에 harnessNormalize?/harnessEstimate? 키 추가
```
> ⚠️ AIService 는 `runClaudeStream` 플랫폼 분기(Windows stdin combine / Mac --append-system-prompt 캐싱)를 **그대로 재사용**한다. 신규 메서드는 `args` 빌드 + `pickModel('harnessNormalize','sonnet')` 호출만 추가하고, 분기 코드는 손대지 않는다 (CLAUDE.md 함정 #1·#3). 정규화는 큰 system prompt(스키마)를 쓰므로 Windows stdin combine 경로 영향이 크다 → 양쪽 테스트 필수.

### 2.4 main — IPC 핸들러 등록 (기존 파일)
```
src/main/index.ts                    # ipcMain.handle(HARNESS_*) 등록 (3+1 규칙 ③단계)
```

### 2.5 preload (기존 파일)
```
src/preload/index.ts                 # window.api.harness.* 노출 (contextBridge, 3+1 규칙 ②단계)
```

### 2.6 renderer (Import 위저드 + 6뷰 + Inspector)
```
src/renderer/src/components/HarnessStudio/
  HarnessStudioView.tsx       # 진입점. activeView==='harness' 시 마운트. import 상태/모델 보유
  import/
    ImportWizard.tsx          # 4-step (소스 → 구조인식 → AI정규화 → 확정·개인화) PRD §5
    SourceStep.tsx            # 드롭/폴더선택/자동발견(~/.claude/skills)
    ScanStep.tsx              # 정적스캔 결과 (kind, 발견 파일 트리) — AI 전, 0초
    NormalizeStep.tsx         # AI 정규화 진행(useAIProgress) + provenance 프리뷰
    ConfirmStep.tsx           # 오버레이/용어번역 토글, 확정
  flow/
    FlowCanvas.tsx            # @xyflow/react. L0~L3 토글 → 그래프 재구성 (PRD 7-1)
    nodes/AgentNode.tsx       # 커스텀 노드: 페이즈색 + 모델배지 + 위험아이콘
    nodes/GateNode.tsx        # 게이트 칩 노드
    edges/HandoffEdge.tsx     # 산출물 라벨 엣지, 조건부=점선
    flowTheme.ts              # DS 토큰 → react-flow 스타일 매핑 (테마연동)
    buildGraph.ts             # [순수] HarnessModel + levelId → nodes/edges (테스트 대상)
  inspector/
    AgentInspector.tsx        # 노드 클릭 → 모델/역할/도구/입출력/에스컬레이션 (PRD 7-1)
  views/
    DryRunPanel.tsx           # 태스크 입력 → 레벨추정 → 경로하이라이트 (PRD 7-2)
    SkillsBlocksPanel.tsx     # SKILL 해부 + 역할카드 + 합리화방어 + blocks (PRD 7-3)
    GatesPanel.tsx            # 4계층 제약 + 게이트 규칙코드 + hook + 상태기계 (PRD 7-4)
    ArtifactsPanel.tsx        # 산출물 트리 + persist 배지 + 템플릿 스켈레톤 (PRD 7-5)
    ScorePanel.tsx            # 6축 레이더(recharts) + 점수 여정 (PRD 7-6)
  shared/
    ProvenanceBadge.tsx       # "AI 추정"/"정적" 배지 (신뢰도 투명성)
    PhaseColor.ts             # phaseClass → DS 시맨틱 토큰 매핑
  __tests__/                  # buildGraph/PhaseColor 순수로직 vitest
```
> 6뷰 전환은 **`SegTabs`(ds) 재사용**. 레이더는 기존 의존 `recharts` 재사용(신규 의존 없음). 아이콘 `lucide-react`. 색/간격은 `design-system.css` 토큰 + `useTheme`.

### 2.7 매뉴얼/체인지로그 (DOD)
```
src/renderer/src/components/ClaudeManual/ClaudeManual.tsx   # SECTIONS 에 Harness Studio 항목
CHANGELOG.md                                                # v1.7 항목
```

---

## 3. 데이터 흐름

### 3.1 Import → 렌더 (정규화 파이프라인)
```
[사용자] 드롭/폴더선택/자동발견
   │  HARNESS_IMPORT_SCAN(path)
   ▼
[main] BundleScanner.scan()  ── 정적: walk + frontmatter + 토폴로지   (AI 0, 즉시)
   │  → RawBundle { files[], agents(frontmatter), templates, hooks, gateScripts, kind }
   ▼
[renderer] ScanStep — kind/파일트리 즉시 표시 (사용자 확인)
   │  HARNESS_NORMALIZE(rawBundleRef)
   ▼
[main] HarnessCache.get(bundleHash) ── hit → 즉시 반환(재오픈 0초)
   │  miss ▼
[main] HarnessNormalizer  ── AIService.normalizeHarness(rawBundle, Opus)
   │      (정적스켈레톤 + AI보강 머지, provenance 기록)
   │  → HarnessModel  → HarnessCache.set(bundleHash, model)
   ▼
[renderer] NormalizeStep(useAIProgress 진행률) → ConfirmStep → HarnessStudioView 가 model 보유
   ▼
[renderer] FlowCanvas/6뷰 가 model 하나만 그림 (하네스-agnostic)
```
> **정적 스켈레톤 우선**: Normalizer 는 RawBundle 의 [S] 필드로 HarnessModel 골격을 먼저 채우고, AI 에는 *비어있는 [AI] 필드만* JSON 으로 요청·머지한다. AI 가 [S] 필드를 덮어쓰지 못하게 한다(정적이 더 신뢰도 높음). 근거: ADR-001.

### 3.2 Dry-run
```
[renderer] DryRunPanel — 태스크 평문/두레이URL 입력
   │  HARNESS_DRYRUN(model.meta.bundleHash, taskText)
   ▼
[main] HarnessCache.get(taskHash) ── hit → 반환
   │  miss ▼
[main] DryRunEstimator
   │   1) AIService.estimateLevel(taskText, model.triage, Haiku) → { level, answers(Q코드 미노출 자연어), rationale }
   │   2) levelPath(model, level) → 결정론적 경로/병렬/게이트/예상시간·상대비용 (AI 없음)
   │  → DryRunResult → cache.set(taskHash)
   ▼
[renderer] FlowCanvas 경로 하이라이트 + DryRunPanel 타임라인/게이트/비용
```
> architect Sonnet↔Opus·security_required 판정은 `model.triage.rules`/`securityOverride` 를 levelPath 가 결정론적으로 적용. AI 는 *레벨 추정값만* 낸다(나머지는 모델에서 계산). 근거: PRD §2 결정론 통찰.

---

## 4. IPC 채널 설계 (3+1 규칙)

`src/shared/types/ipc.ts` `IPC_CHANNELS` 에 추가. 명명은 기존 컨벤션(`도메인:동작`) 준수.

| 채널 상수 | 문자열 | 요청 | 응답 | 비고 |
|---|---|---|---|---|
| `HARNESS_SCAN` | `harness:scan` | `{ path: string }` 또는 `{ pickDialog: true }` | `RawBundleSummary`(kind, fileTree, agentStubs, warnings) | 정적, AI 없음. dialog 옵션은 폴더선택 |
| `HARNESS_DISCOVER` | `harness:discover` | `void` | `{ path; name; kind }[]` | `~/.claude/skills/*` 자동발견 |
| `HARNESS_NORMALIZE` | `harness:normalize` | `{ path: string; force?: boolean }` | `HarnessModel` | 캐시 hit/miss. force=캐시무시 |
| `HARNESS_DRYRUN` | `harness:dryrun` | `{ path: string; taskText: string }` | `DryRunResult` | taskHash 캐시 |
| `HARNESS_EXPLAIN` | `harness:explain` | `{ path; topic: string }` | `{ markdown: string }` | 개인화 설명/용어번역(P3, 온디맨드 Sonnet) |
| `HARNESS_CACHE_CLEAR` | `harness:cache:clear` | `{ path?: string }` | `{ cleared: number }` | 진단/재정규화용 |
| `HARNESS_LIST_CACHED` | `harness:list-cached` | `void` | `{ path; name; cachedAt }[]` | 최근 연 하네스 빠른 재오픈 |

**+1 (이벤트, renderer←main)**: 정규화/Dry-run 진행률은 **기존 `AI_PROGRESS` 이벤트 채널을 재사용**한다(이미 `useAIProgress` 훅 존재). 신규 push 채널을 만들지 않는다 — requestId 로 구분.

> 3+1 적용: ① `harness.ts` 타입 정의 → ② `preload/index.ts` `api.harness.{scan,discover,normalize,dryrun,explain,clearCache,listCached}` 노출 → ③ `main/index.ts` `ipcMain.handle` 등록. 이벤트는 기존 `AI_PROGRESS` 흐름 재사용.

---

## 5. react-flow 통합 방식

`@xyflow/react` 신규 의존(ADR-003). Clauday DS/테마에 입히는 설계:

- **커스텀 노드 타입**: `AgentNode`(에이전트), `GateNode`(게이트 칩). 기본 노드 스타일 미사용 — 전부 DS 토큰 기반 커스텀.
  - `AgentNode`: 배경=`PhaseColor(phaseClass)`(DS 시맨틱 토큰), 우상단 **모델 배지**(`Badge` ds, haiku=중립/sonnet=강조/opus=경고색), 위험 시 `lucide-react` AlertTriangle, model 출처가 AI면 `ProvenanceBadge`.
  - `GateNode`: `Chip`(ds) 형태, 차단게이트는 잠금 아이콘 + 규칙코드.
- **커스텀 엣지 `HandoffEdge`**: 라벨=전달 산출물명, 조건부 핸드오프=`stroke-dasharray` 점선, QA RETURN 루프=곡선 + 회귀색.
- **테마 연동(`flowTheme.ts`)**: react-flow 의 배경/그리드/미니맵/컨트롤 색을 CSS 변수(`--bg-*`, `--border-*`, `--text-*`)로 바인딩. `useTheme` 변경 시 CSS 변수만 갱신되므로 react-flow 재렌더 불필요(변수 상속). 다크/라이트 자동.
- **레이아웃**: 에이전트 체인은 좌→우 단계 진행이 자연스러움. 자동배치는 초기 `dagre`(경량) 또는 수동 좌표 계산(`buildGraph.ts`에서 levelId 별 컬럼 배치). **`dagre` 도입 여부는 잔여 결정 — 우선 `buildGraph.ts` 수동 컬럼 배치로 시작, 복잡해지면 dagre 추가**(추가 의존이라 ADR 갱신 필요).
- **L0~L3 토글**: `buildGraph(model, levelId)` 가 해당 레벨 `agentChain` 만 active, 나머지 노드는 opacity 흐림 + 엣지 숨김. 재구성은 순수함수 결과 교체 → react-flow `nodes/edges` props 갱신.
- **격리**: react-flow 사용을 `flow/` 하위로만 한정. 6뷰 중 Flow/Dry-run 만 의존. 의존 추가 실패/번들 문제 시 영향 국소화.

---

## 6. 캐시 전략

**위치 결정: `<userData>/harness-cache/` (파일 JSON), electron-store 아님.** 근거 ADR-004.

```
<userData>/harness-cache/
  bundles/<bundleHash>.json     # HarnessModel (정규화 결과)
  tasks/<taskHash>.json         # DryRunResult
  index.json                    # { bundleHash → {path,name,cachedAt,schemaVersion} } 최근목록
```

- **bundleHash** = `sha256(정렬된 [상대경로 + mtimeMs + size] 목록 + frontmatter 내용)`. 파일 추가/수정/삭제 시 자동 무효화. 내용 기반이라 경로만 바뀌어도(복사) 재사용 가능 여부는 mtime 포함으로 보수적 처리.
- **taskHash** = `sha256(bundleHash + normalizedTaskText)`. 같은 하네스+같은 태스크면 재추정 안 함.
- **schemaVersion 불일치 시 무효화**: HarnessModel 스키마가 바뀌면 옛 캐시 자동 폐기(읽을 때 버전 비교).
- **electron-store 회피 이유**: 정규화 JSON 은 수 KB~수십 KB, 번들 수가 늘면 store 단일 JSON 비대화 + 매 쓰기 전체 직렬화 비용. 파일 분리가 무효화·용량·진단(파일 삭제로 강제 재정규화)에 유리.

---

## 7. 파서 일반화 / Graceful Degradation (ADR-002 요약)

- **BMAD형 우선**: `_core/` + (`_agents/` 또는 `<role>/SKILL.md`) + (`_templates/`|`blocks/`) 신호로 bundle 확정 → 전 뷰.
- **부분 스킬**(SKILL.md/frontmatter만): 에이전트 카탈로그 + 도구만, levels/triage/gates 는 `warnings` 에 "추출 불가" 기록하고 해당 뷰는 빈 상태(StateViews ds)로 안내.
- **AI 정규화 실패/JSON 파싱 실패**: 정적 스켈레톤만으로 *축소 모델* 반환 + `warnings`. 절대 크래시 금지.
- **provenance + warnings** 로 신뢰도를 UI 에 항상 노출 — "이건 AI 추정", "이 번들은 체인 못 읽음".

---

## 8. 보안/안전 노트

- import 대상은 **로컬 파일 읽기 전용**. 스캐너는 `.sh`/`.md` 를 **실행하지 않고 텍스트로만 파싱**(게이트 스크립트를 절대 spawn 하지 않음). 신뢰경계: 외부 zip 도 텍스트로만 다룸.
- AI 정규화 프롬프트에 번들 원문이 들어가므로, 정규화는 *사용자가 명시 import 한 번들* 에 한정(임의 경로 스캔 금지, dialog 또는 `~/.claude/skills` 자동발견만).
- AIService 진단 로그(`cliLogger`)에 platform/argv 가 남는지 신규 메서드에서도 확인(CLAUDE.md 함정 #4).

---

## 9. ADR 목록 (별도 파일)

- `harness-studio-adr-001-harness-model-schema.md` — HarnessModel 스키마 & 정적/AI 분담
- `harness-studio-adr-002-parser-generalization.md` — BMAD형 우선 + degradation
- `harness-studio-adr-003-react-flow.md` — @xyflow/react 채택 & 테마 통합
- `harness-studio-adr-004-ai-normalization-cache.md` — AI 정규화 캐시(파일 JSON, 해시)
