# Harness Studio — 편집(저작) 아키텍처 설계

> 대상: GitHub Issue #26 후속 / 기존 PRD `harness-studio-prd.md` §3 비목표(편집)를 **명시적으로 번복**
> 브랜치 가정: `feature/harness-studio-edit` (feature/harness-studio 기준)
> 작성: architect (Clauday) · 2026-06-22
> 전제(사용자 승인 확정 3건):
> 1. 반영 모델 = **초안(draft) → 명시적 '파일에 적용'** (diff 승인 게이트 필수)
> 2. 수동 편집 = **구조화 필드 폼 + 원본 파일 텍스트 에디터(Monaco) 둘 다**
> 3. AI 편집 = **자연어 명령 → diff 제안 → 사용자 승인 → draft 반영**

이 문서는 **무엇을 만들지(구조)** 와 **왜 그렇게 나누는지(근거)** 를 정의한다.
실행 순서/체크리스트는 `harness-studio-edit-plan.md`, 불변 결정은 `harness-studio-edit-adr-*.md`.

기존 read-only 파이프라인(`harness-studio-arch.md`)은 **그대로 보존**되며, 편집 레이어는 그 위에 얹힌다. 편집 모드를 끄면 동작은 기존과 100% 동일해야 한다(회귀 0).

---

## 0. 근거 — 실제 코드/번들을 열어본 결과 (추측 아님)

설계의 모든 매핑/제약은 아래 **실측**에 기반한다.

### 0.1 번들 구조 (재확인)

| 항목 | reined-bmad | neon-bmad | 편집 관점 함의 |
|---|---|---|---|
| 에이전트 `model:` 보유 위치 | `_agents/reined-bmad-*.md` frontmatter (`model: sonnet`) | 파이프라인 에이전트엔 **없음**, `<role>/SKILL.md` 에도 model 키 없음 | model 편집은 **reined 는 `_agents/*.md` 로 역매핑 가능, neon 은 frontmatter 위치 부재 → 신규 키 추가 정책 필요** |
| `tools:` / `allowed-tools:` 위치 | `_agents/*.md` 는 `tools:`, `<role>/SKILL.md` 는 `allowed-tools:` | `<role>/SKILL.md` 의 `allowed-tools:` 만 | tools 편집 = **두 파일에 흩어짐**. 한 stub 의 tools 가 어느 파일에서 왔는지 현재 스캐너가 **추적 안 함**(병합 손실) |
| `name:` (agent id) | 두 파일 모두 `name:` 동일 | `<role>/SKILL.md` 의 `name:` | id 편집은 **파급이 큼**(레벨 체인·산출물 producer/consumer 가 id 참조) → 편집 범위에서 제외 권장 |
| 게이트 규칙 | `_hooks/gate.sh` 의 `R5xx "메시지"` | `_hooks/neon-bmad-gate-check.sh` 의 `NEON-Gxx "메시지"` | 게이트 텍스트 편집 = **`.sh` raw 편집으로만**. 규칙코드 추가/메시지 수정은 정규식 역추출 대상이지만 구조화 폼은 위험 |
| 레벨/triage/체인/role/reads/writes/persist/score | 산문(`_core/*.md`)·표·스크립트에 흩어짐, **AI 추론값** | 동일하게 산문/스크립트 분산 | **역매핑 1:1 불가** — 구조화 폼으로 편집 불가, raw 에디터 또는 AI 편집으로만 |

### 0.2 코드 측 실측 (편집 설계가 의존하는 사실)

- `BundleScanner.scan()` 은 `_agents/*.md` 와 `<role>/SKILL.md` 의 frontmatter 를 **하나의 `AgentStub` 로 병합**한다(`agentStubMap`, BundleScanner.ts L466~491). **어느 필드가 어느 파일에서 왔는지 출처 파일 경로를 보존하지 않는다.** → 편집을 위해 `RawBundle` 에 **파일별 frontmatter 출처 인덱스**가 추가로 필요(아래 §2.2 SourceMap).
- `HarnessModel.provenance` 는 필드별 `static|ai|inferred|absent` 출처만 기록할 뿐 **"어느 파일의 어느 줄"** 은 모른다. → 구조화 폼 편집 대상 필드는 별도 **편집 매핑 테이블(EditMap)** 이 필요하다.
- `pathGate.ts` 는 **읽기 전용** 게이트다(`assertPathAllowed` 가 realpath 해소 + skills 루트/세션 allowlist 검사). 쓰기에는 추가 제약(번들 디렉터리 하위 한정 + 확장자 화이트리스트 `.md`/`.sh`)이 필요하다.
- `HarnessCache` 는 `bundleHash`(파일 mtime+size+frontmatter sha256)로 무효화한다(ADR-004). **파일에 쓰면 mtime 이 바뀌어 bundleHash 가 자동 변경**되므로, 적용 후 재스캔/재정규화가 자연스럽게 트리거된다(설계가 이 메커니즘을 재사용).
- `AIService` 의 `normalizeHarness/estimateLevel/explainHarness` 는 모두 `runClaudeStream` 플랫폼 분기(Windows stdin combine / Mac `--append-system-prompt`)를 **수정 없이 재사용**한다. 신규 편집제안 메서드도 동일 패턴(`buildArgs`+`pickModel`+`runWithProgress`)을 따른다.
- `HarnessStudioView` 는 `model` 보유 + `STUDIO_TABS` SegTabs 셸. 편집 모드는 이 셸에 토글을 얹는다.

**핵심 결론**: 번들은 두 종류의 편집 대상으로 갈린다.
1. **파일로 깔끔히 역매핑되는 것** — agent frontmatter(`model`/`tools`), 게이트 스크립트 텍스트, 템플릿 파일 텍스트, README/GUIDE 산문. → 구조화 폼(일부) + raw 에디터.
2. **AI 가 산문/스크립트에서 추론한 해석값** — `role/reads/writes/phaseClass/levels/triage/score/persist/stateMachine` 등. **원본 파일에 1:1 대응 위치가 없다.** → 구조화 폼으로 **편집 불가**. raw 에디터로 원본 산문을 고치거나, AI 편집으로 "이렇게 바꿔줘" → AI 가 해당 파일 변경안 제시.

이 분담이 **ADR-edit-003(구조화 폼 편집 범위 한정)** 의 근거다.

---

## 1. Draft 데이터 모델 — file-centric (권장안)

### 1.1 결정: draft = "파일 경로 → 새 내용" 집합 (file-centric)

```ts
// src/shared/types/harness-edit.ts (신규)

/** 단일 파일에 대한 편집 초안 1건 */
export interface DraftFileEdit {
  /** 번들 루트 기준 상대경로 (POSIX '/'); BundleScanner.fileTree 와 동일 키 */
  relPath: string
  /** 파일 디스크 원본 내용 (draft 생성 시점 스냅샷 — 충돌 감지 기준) */
  baseContent: string
  /** draft 가 제안하는 새 내용 (전체 파일 텍스트) */
  draftContent: string
  /** 이 편집을 만든 출처 */
  origin: 'form' | 'raw' | 'ai'
  /** form 편집일 때 어떤 구조화 필드에서 왔는지 (감사/표시용) */
  fieldPath?: string
  /** AI 편집일 때 사용자 명령 원문 (감사 추적) */
  aiCommand?: string
  /** draft 생성 시각 (ISO 8601) */
  editedAt: string
}

/** 한 번들에 대한 편집 세션 전체 draft */
export interface HarnessDraft {
  /** 대상 번들 루트 절대경로 */
  bundlePath: string
  /** draft 생성 기준 bundleHash — 적용 직전 충돌 감지에 사용 */
  baseBundleHash: string
  /** relPath → DraftFileEdit (한 파일 최신 편집만 유지; 누적은 draftContent 갱신) */
  edits: Record<string, DraftFileEdit>
}
```

### 1.2 왜 file-centric 인가 (근거)

대안 **model-patch**(HarnessModel 필드를 직접 패치)는 다음 이유로 기각한다(상세는 ADR-edit-001):

1. **역매핑 비1:1 — 치명적**: `levels/triage/role/reads/score` 등 [AI] 필드는 원본 파일에 1:1 대응 위치가 없다. model-patch 로 `levels[1].agentChain` 을 바꿔도 **어느 파일에 어떻게 쓸지 결정 불가** → 적용 단계에서 막힌다. file-centric 은 "무엇을 파일에 쓰는가"가 draft 자체에 담겨 항상 적용 가능하다.
2. **단일 진실 = 파일**: 번들의 진짜 소스는 파일이다. HarnessModel 은 그 *파생 해석*(특히 AI 부분). 파생값을 편집 단위로 삼으면 "파일↔모델" 이중 진실이 생긴다. file-centric 은 파일이 유일 진실이고 모델은 재스캔으로 항상 재생성된다.
3. **diff 가 자연스럽다**: 사용자에게 보여줄 것은 결국 **파일 diff**(Monaco diff editor). file-centric 은 draft 자체가 `baseContent`↔`draftContent` 라 diff 가 직접 도출된다. model-patch 는 "모델 패치 → 파일 변경"을 역으로 합성해야 diff 가 나온다.
4. **재스캔/재정규화 일관성**: 적용 후 파일이 바뀌면 bundleHash 가 바뀌고 → 기존 normalize 파이프라인이 그대로 새 모델을 만든다. model-patch 는 "패치된 모델"과 "재스캔 모델"이 갈라질 위험이 있다.
5. **구조화 폼도 결국 파일 변경으로 환원**: 폼에서 `agent.model` 을 바꿔도 내부적으로는 `_agents/x.md` 의 frontmatter 텍스트를 치환한 `DraftFileEdit` 를 만든다(§3). 즉 폼/raw/AI **세 입력 경로 모두 동일한 file-centric draft 로 수렴** → 적용 로직 1개로 통일.

> **트레이드오프**: 구조화 폼이 "필드 → 파일 텍스트 치환"을 정확히 해야 한다(YAML frontmatter 안전 치환). 이는 순수함수 `applyFieldEdit()` 로 떼어 테스트로 방어한다.

### 1.3 draft 누적 규칙

- 한 파일(`relPath`)에 대한 편집은 **최신 1건**만 유지. 폼→raw→AI 어느 경로든 같은 파일을 또 고치면 `draftContent` 를 갱신(이전 draft 위에 누적). `baseContent` 는 최초 스냅샷 고정(충돌 감지 기준 불변).
- draft 는 **in-memory(renderer 상태) + main 미러링 없음**이 기본. 단, 적용(apply)은 main 으로 draft 전체를 넘겨 원자적으로 처리. (영속 draft 는 비목표 — 앱 재시작 시 draft 소멸. 잔여 결정 §11.)

---

## 2. 구조화 필드 ↔ 파일 매핑 표

각 HarnessModel 필드가 **구조화 폼으로 편집 가능한지**, 가능하면 **어느 파일/위치**로 가는지 명시. `[FORM]`=구조화 폼 편집 가능 / `[RAW]`=raw 에디터로만 / `[AI]`=AI 편집 제안으로만(또는 raw) / `[LOCK]`=편집 금지.

### 2.1 매핑 표

| 필드 | 편집 경로 | 대상 파일 / 위치 | 근거 |
|---|---|---|---|
| `agents[].model` | **[FORM]** | reined: `_agents/<id>.md` frontmatter `model:` / neon: `<role>/SKILL.md` frontmatter (model 키 **없으면 신규 추가**) | frontmatter 정형, 안전 치환 가능. neon 은 키 부재 → "frontmatter 에 model 추가" 정책 |
| `agents[].tools` | **[FORM]** | tools 출처 파일(`_agents/*.md` `tools:` 또는 `<role>/SKILL.md` `allowed-tools:`) | 정형 리스트. **단 출처 파일 추적 필요**(SourceMap, §2.2) |
| `agents[].id` (name) | **[LOCK]** | (frontmatter `name:`) | id 변경은 levels/artifacts 의 참조를 깨뜨림. 편집 금지(rename 은 후속 별도 기능) |
| `agents[].role` | **[RAW]/[AI]** | `<role>/SKILL.md` `## 역할 한 줄` 본문 | AI 추론값. 원본 산문 위치는 있으나 정확한 치환 범위 비고정 → 폼 금지 |
| `agents[].reads/writes` | **[AI]** | `<role>/SKILL.md` `## 역할 카드`/`필독 파일` 산문 | 산문에서 AI 가 정규화. 1:1 위치 없음 → AI 편집/raw |
| `agents[].phaseClass/escalation/signals/riskNote` | **[AI]** | 산문 분산 | 순수 AI 해석값. 폼 금지 |
| `levels[].*` (name/chain/parallel/artifacts) | **[AI]** | `_core/triage.md`/`concepts.md` 산문·표 | 위치·형식 번들마다 다름. 폼 금지 |
| `triage.*` (questions/rules/securityOverride) | **[AI]** | `_core/triage.md`/`concepts.md` | 동일 |
| `artifacts[].template.{frontmatter,sections}` | **[RAW]** | `_templates/<id>.md` (frontmatter/헤더) | 템플릿 파일 직접 편집 가능 |
| `artifacts[].producer/consumers/location/persist` | **[AI]** | concepts §4 산문 | AI 분류값. 폼 금지 |
| `controlFlow.gates[].ruleCodes/ruleDetails` | **[RAW]** | `_hooks/*gate*.sh` (텍스트) | 게이트 스크립트 텍스트. **`.sh` 절대 실행 안 함**. 구조화 폼은 위험(스크립트 의미론) → raw 만 |
| `controlFlow.gates[].description` | **[AI]** | (모델 해석값, 파일 위치 없음) | 순수 AI 라벨. 파일에 안 씀 — 편집 무의미(재정규화로 갱신) |
| `controlFlow.hooks[].enforces` | **[AI]** | (해석값) | 동일 |
| `controlFlow.parallelGroups/loops/stateMachine/signalEnum` | **[AI]** | 산문/스크립트 | AI 해석. 폼 금지 |
| `score.*` | **[LOCK]** | (computeScore 결정론 계산) | `HarnessNormalizer` 가 `computeHarnessScore` 로 **구조에서 계산**(AI 아님). 직접 편집 무의미 — 구조 바뀌면 자동 재계산 |
| `meta.author/tagline` | **[RAW]** | README/GUIDE 산문 | AI 추출값이나 원본은 README. raw 편집 |
| `overlay.*` | **[RAW]** | `config.md`/`_overlays/*.md` | 정형이면 향후 [FORM] 승격 가능, 초기 raw |

### 2.2 SourceMap — 폼 편집을 위한 출처 파일 추적 (신규 필요)

현재 스캐너는 agent stub 병합 시 출처 파일을 버린다. `[FORM]` 편집(model/tools)을 가능하게 하려면 `RawBundle` 에 다음을 추가한다:

```ts
// BundleScanner.ts RawBundle 확장
export interface AgentSourceMap {
  /** agent id → frontmatter 필드별 출처 파일 상대경로 */
  [agentId: string]: {
    /** name 이 정의된 파일 (정규화 기준 파일) */
    nameFile: string
    /** model: 키가 실재하는 파일 (없으면 undefined → 신규 추가 대상 파일은 nameFile) */
    modelFile?: string
    /** tools/allowed-tools 가 정의된 파일 */
    toolsFile?: string
  }
}
```

구조화 폼은 이 SourceMap 으로 "어느 파일의 frontmatter 를 고칠지"를 결정론적으로 안다. **AI 없음, 순수 정적.**

---

## 3. 데이터 흐름 — 편집 → draft → diff → 승인 → 백업+쓰기 → 재스캔

```
[편집 입력 — 3경로]
 ┌─ (A) 구조화 폼 (model/tools 등 [FORM])
 │     필드 변경 → applyFieldEdit(원본파일텍스트, fieldPath, newValue) → 새 파일텍스트
 │     → DraftFileEdit{ origin:'form', fieldPath } 생성/갱신
 ├─ (B) Monaco raw 에디터 ([RAW])
 │     파일 선택 → 원문 편집 → DraftFileEdit{ origin:'raw' }
 └─ (C) AI 명령 ([AI])
       NL 명령 + 대상 파일 컨텍스트 → HARNESS_AI_EDIT
        → AIService.proposeEdit() → { relPath, newContent, rationale }[]
        → 사용자에게 **제안 diff** 표시 → 승인 시 DraftFileEdit{ origin:'ai', aiCommand }
            │
            ▼
[renderer] HarnessDraft (in-memory, relPath→DraftFileEdit 누적)
            │  편집 모드 패널에 "변경된 파일 N개" 뱃지
            ▼
[diff 뷰] DraftDiffView — relPath 별 Monaco DiffEditor (baseContent ↔ draftContent)
            │  사용자가 각 파일 승인/되돌리기
            ▼
[적용] HARNESS_APPLY_DRAFT(bundlePath, draft)
            │
            ▼
[main] HarnessEditService.apply()
   1. 경로 게이트(쓰기) — assertWritablePath: 번들 하위 + 확장자 .md/.sh 만, 심링크 탈출 차단
   2. 충돌 감지 — 현재 디스크 내용 sha == DraftFileEdit.baseContent sha ? (아니면 STALE 거부)
   3. 백업 — <userData>/harness-backups/<bundleName>/<ISO타임스탬프>/<relPath> 로 원본 복사
   4. 원자적 쓰기 — 임시파일 write → rename (파일 단위 원자성)
   5. 캐시 무효화 — HARNESS_CACHE_CLEAR(bundlePath) (어차피 bundleHash 변경되나 명시 폐기)
            ▼
[main] 재스캔 + 재정규화 — normalize(bundlePath, force=true)
   파일이 바뀌었으니 새 bundleHash → 새 HarnessModel
            ▼
[renderer] 새 HarnessModel 로 모든 read-only 뷰 갱신 + draft 비움 + 백업 위치 안내(복원 가능)
```

> **.sh 절대 비실행**: 적용은 텍스트 파일 쓰기만 한다. 게이트/hook `.sh` 도 텍스트로 기록될 뿐 spawn/exec 하지 않는다. 기존 `BundleScanner` 의 "텍스트로만 파싱" 원칙(arch.md §8)을 쓰기 경로까지 확장 유지.

---

## 4. 신규 IPC 채널 설계 (3+1 규칙)

`src/shared/types/ipc.ts` `IPC_CHANNELS` 에 추가. 기존 `harness:*` 컨벤션 준수.

| 채널 상수 | 문자열 | 요청 | 응답 | 비고 |
|---|---|---|---|---|
| `HARNESS_READ_FILE` | `harness:edit:read-file` | `{ path: string; relPath: string }` | `{ content: string; sourceMap?: AgentSourceMap }` | raw 에디터/폼 초기값. **읽기 게이트 재사용** |
| `HARNESS_DIFF_DRAFT` | `harness:edit:diff` | `{ path: string; draft: HarnessDraft }` | `DraftDiffSummary` (relPath별 changed/added 줄수, 충돌여부) | 적용 전 미리보기 검증 (디스크 대조) |
| `HARNESS_APPLY_DRAFT` | `harness:edit:apply` | `{ path: string; draft: HarnessDraft }` | `{ applied: string[]; backupDir: string; model: HarnessModel }` | 백업+쓰기+재정규화 원자 처리 |
| `HARNESS_AI_EDIT` | `harness:edit:ai-propose` | `{ path: string; command: string; targetRelPaths: string[]; requestId?: string }` | `{ proposals: { relPath; newContent; rationale }[] }` | NL→파일 변경안. **승인 전 자동 쓰기 금지** |
| `HARNESS_LIST_BACKUPS` | `harness:edit:list-backups` | `{ path: string }` | `{ backupDir; createdAt; files: string[] }[]` | 복원 진입점 |
| `HARNESS_RESTORE_BACKUP` | `harness:edit:restore` | `{ path: string; backupDir: string }` | `{ restored: string[]; model: HarnessModel }` | 백업 → 원본 되돌리기 + 재정규화 |

**+1 (이벤트)**: AI 편집제안 진행률은 기존 `AI_PROGRESS` 채널 재사용(requestId 로 구분). 신규 push 채널 없음.

**3+1 적용**: ① `harness-edit.ts` 타입 → ② `preload/index.ts` `api.harness.edit.{readFile,diff,apply,aiPropose,listBackups,restore}` 노출 → ③ `main/index.ts` `ipcMain.handle` 등록. (`api.harness.edit` 하위 네임스페이스로 기존 `api.harness.*` 와 분리.)

### 4.1 쓰기 경로 게이트 확장 (pathGate.ts)

기존 읽기 게이트(`assertPathAllowed`)에 더해 **쓰기 전용 검증** 추가:

```ts
// pathGate.ts 신규 함수 (순수/Node fs 최소)
export async function assertWritablePath(
  bundleRoot: string,    // 적용 대상 번들 루트 (allowlist 통과한 realpath)
  relPath: string,       // 쓰려는 상대경로
): Promise<string>        // 검증된 절대경로 반환, 위반 시 HarnessPathDeniedError
```

검증 단계 (모두 통과해야 쓰기 허용):
1. `relPath` 정규화 후 `..` 세그먼트 포함 거부 (디렉터리 탈출 차단).
2. 확장자 화이트리스트: **`.md`/`.sh`/`.txt`/`VERSION`** 만 허용 (실행파일/바이너리 쓰기 금지).
3. 대상 절대경로 = `realpath(join(bundleRoot, relPath))` → **반드시 bundleRoot 하위** (심링크 탈출 차단 — 기존 `isUnderAllowedRoot` 재사용).
4. bundleRoot 자체는 세션 allowlist 또는 skills 하위여야 함(기존 읽기 게이트 통과 전제).

> **신규 파일 생성**: 적용 대상이 디스크에 없는 신규 relPath 면 부모 디렉터리도 bundleRoot 하위여야 함. realpath 가 실패(미존재)하므로 **부모 디렉터리 realpath** 로 검증.

---

## 5. AIService 편집제안 메서드 설계

```ts
// AIService.ts 신규 — 기존 패턴(buildArgs+pickModel+runWithProgress) 재사용
async proposeEdit(
  command: string,                          // 사용자 NL 명령
  targetFiles: { relPath: string; content: string }[],  // 편집 대상 파일 원문
  requestId?: string
): Promise<{ proposals: { relPath: string; newContent: string; rationale: string }[] }>
```

### 5.1 입력 설계

- **어느 파일을 줄 것인가**: renderer 가 명령 성격에 따라 `targetRelPaths` 를 선택해 보낸다. 1차 휴리스틱(renderer 순수함수 `pickEditTargets()`):
  - 명령에 에이전트명 포함("보안검토자를 opus로") → 해당 agent 의 SourceMap 파일(`modelFile` 또는 `nameFile`).
  - 명령에 게이트/페이즈 포함("dev 게이트에 규칙 추가") → 해당 gate 의 `scriptFile`.
  - 모호하면 사용자가 raw 에디터에서 파일을 명시 선택 후 "이 파일에 대해 AI 편집" 진입.
- **컨텍스트 크기**: 대상 파일 원문만 전달(번들 전체 금지 — 토큰/유출 최소화). 합산 상한 `MAX_AI_EDIT_BYTES = 40KB`, 초과 시 도메인 에러.
- **모델**: `pickModel('harnessEdit', 'sonnet')`. 편집은 정밀 텍스트 변환이므로 Sonnet 기본(설계 변경 수준이면 사용자가 Opus 로 승격 가능). `AIModelConfig` 에 `harnessEdit?` 키 추가(`src/shared/types/ai.ts`).

### 5.2 출력 형식 — **전체 파일 내용** (unified diff 아님)

- AI 는 변경된 파일별로 **전체 새 내용**을 JSON 으로 반환:
  ```json
  { "proposals": [{ "relPath": "_agents/x.md", "newContent": "<전체 파일>", "rationale": "model 을 opus 로 변경" }] }
  ```
- **unified diff 기각 이유**: LLM 의 diff hunk 라인번호/컨텍스트는 부정확하기로 악명. 전체 내용은 적용이 결정론적(파일 통째 교체)이고, diff 는 main/renderer 가 `baseContent`↔`newContent` 로 **직접 계산**(Monaco DiffEditor)하므로 정확하다.
- **검증**: `proposeEdit` 결과는 `normalizeHarness` 와 동일한 lenient JSON 파싱(코드블록 제거 + balanceBrackets). 파싱 실패 시 빈 proposals + warning(throw 금지, degradation). `relPath` 는 `targetRelPaths` 화이트리스트 안에 있는 것만 채택(AI 가 엉뚱한 파일을 만들지 못하게).
- **적용 방식**: 제안은 **자동 쓰기 안 함**. 반드시 사용자 승인 → draft 반영 → 일반 apply 흐름(백업/쓰기/재정규화)을 탄다. 즉 AI 편집도 수동 편집과 동일한 안전 게이트를 통과.

### 5.3 플랫폼 분기 재사용 (CLAUDE.md 함정 준수)

- `proposeEdit` 의 system prompt 는 큰 스키마/지시가 아니라 "이 파일들을 명령대로 고쳐 전체 내용을 JSON 으로" 수준이라 중간 크기. 그래도 **Windows stdin combine 경로 영향이 있으므로 양쪽 플랫폼 테스트 필수**(함정 #2).
- `runClaudeStream` 분기 코드는 **손대지 않는다**. `buildArgs(userPrompt, { model, systemPrompt, noTools:true, ... })` 만 구성(함정 #1·#3). 진단 로그(`cliLogger`)에 platform/argv 자연 기록 확인(함정 #4).

---

## 6. Renderer 구성

### 6.1 편집 모드 토글과 기존 read-only 뷰의 관계

- `HarnessStudioView` 에 **편집 모드 토글**(`editMode: boolean`) 추가. 기본 OFF = 기존 read-only 동작 100% 보존(회귀 0).
- ON 시 새 탭 `'edit'` 가 `STUDIO_TABS` 에 노출(또는 별도 우측 패널). 기존 8뷰는 그대로 read-only 로 모델을 보여주고, edit 탭에서만 draft 를 만든다.
- draft 가 1건 이상이면 헤더에 **"변경 N개 · 적용/취소"** 영구 표시(미적용 draft 유실 경고).

### 6.2 신규 컴포넌트

```
src/renderer/src/components/HarnessStudio/edit/
  EditPanel.tsx           # 편집 모드 셸 — 좌(파일 트리/필드 폼) · 우(Monaco) · 하(draft 목록)
  StructuredFieldForm.tsx # [FORM] 필드만 노출 (agent model 드롭다운/tools 멀티셀렉트). editMap 기반
  RawFileEditor.tsx       # @monaco-editor/react — 파일 선택 후 원문 편집
  AICommandBar.tsx        # NL 명령 입력 → proposeEdit → 제안 diff 모달
  DraftDiffView.tsx       # relPath별 Monaco DiffEditor (baseContent↔draftContent) + 파일별 승인/되돌리기
  ApplyDialog.tsx         # 최종 적용 확인 (백업 안내 + 충돌 경고 + .sh 변경 경고 배너)
  BackupRestorePanel.tsx  # listBackups → 복원
  editMap.ts              # [순수] HarnessModel + SourceMap → "어떤 필드가 어떤 파일/경로로 가나" (테스트 대상)
  applyFieldEdit.ts       # [순수] (파일텍스트, fieldPath, newValue) → 새 파일텍스트 (frontmatter 안전 치환, 테스트 핵심)
  pickEditTargets.ts      # [순수] NL 명령 + model → AI 편집 대상 relPath 추정 (테스트 대상)
  draftReducer.ts         # [순수] draft 누적/되돌리기/충돌표시 리듀서 (테스트 대상)
  __tests__/              # editMap/applyFieldEdit/pickEditTargets/draftReducer 순수로직 vitest
```

> **Monaco 재사용**: `@monaco-editor/react` 이미 deps 존재(에디터 도메인). `DiffEditor` 서브컴포넌트로 diff 뷰 구현(신규 의존 0).

### 6.3 승인 UX

1. 폼/raw 편집 → draft 즉시 누적, 하단 draft 목록에 파일 표시.
2. AI 명령 → 제안 diff **모달**에서 먼저 보여주고 "이 변경 추가" 승인해야 draft 진입(2단계 승인: AI 제안 승인 → 최종 apply 승인).
3. "적용" 클릭 → `ApplyDialog`: 변경 파일 목록 + **백업 생성 안내** + `.sh` 변경 시 빨간 경고("게이트 스크립트가 바뀝니다") + 충돌 파일 있으면 차단.
4. 적용 성공 → 토스트 + 백업 위치 + 모델 자동 갱신. 실패(충돌/게이트 거부) → 명확한 사유 + draft 보존.

---

## 7. 안전 / 비가역 대응

| 위험 | 대응 |
|---|---|
| 원본 파괴(비가역) | 적용 전 **자동 백업** `<userData>/harness-backups/<bundleName>/<ISO타임스탬프>/`. `HARNESS_LIST_BACKUPS`/`HARNESS_RESTORE_BACKUP` 로 복원 |
| 경로 탈출(심링크/`..`) | `assertWritablePath` — realpath 후 bundleRoot 하위 강제 + `..` 거부 + 확장자 화이트리스트 |
| .sh 실행 위험 | 적용은 **텍스트 쓰기만**. spawn/exec 절대 없음. `.sh` 변경 시 UI 빨간 경고 배너 |
| 동시 수정 충돌(외부 편집기) | 적용 직전 디스크 내용 sha ↔ `baseContent` sha 대조. 불일치 시 STALE 거부 → 사용자 재로드 유도 |
| AI 가 엉뚱한 파일 생성 | proposals 의 relPath 는 `targetRelPaths` 화이트리스트 교집합만 채택 |
| 미적용 draft 유실 | 헤더 영구 배지 + 모드 종료/탭 이탈 시 확인 다이얼로그 |
| 부분 쓰기 실패(원자성) | 파일 단위 temp-write→rename. 다중 파일 중 일부 실패 시 이미 쓴 것은 백업으로 복원 가능(applied[] 로 추적) |
| 캐시 staleness | 적용 후 `force=true` 재정규화 — 새 bundleHash 로 모델 강제 갱신 |

**보안 리뷰 포인트(security-reviewer 대상)**: ① `assertWritablePath` 의 심링크/`..`/확장자 우회 가능성, ② AI proposals 의 relPath 화이트리스트 검증 누락 시 임의 파일 쓰기, ③ 백업 디렉터리 경로 주입(bundleName 에 `/` 포함 시), ④ STALE 검사의 TOCTOU(검사~쓰기 사이 변경) — rename 직전 재검사로 창 최소화.

---

## 8. 모듈 분해 (신규/수정 파일)

### shared
```
src/shared/types/harness-edit.ts   # [신규] HarnessDraft, DraftFileEdit, DraftDiffSummary, AgentSourceMap
src/shared/types/ipc.ts            # [수정] HARNESS_READ_FILE/DIFF_DRAFT/APPLY_DRAFT/AI_EDIT/LIST_BACKUPS/RESTORE_BACKUP 추가
src/shared/types/ai.ts             # [수정] AIModelConfig 에 harnessEdit? 추가
```
### main
```
src/main/harness/BundleScanner.ts  # [수정] RawBundle 에 AgentSourceMap 추가 (출처 파일 추적; read-only 회귀 주의)
src/main/harness/pathGate.ts       # [수정] assertWritablePath 추가 (순수 검증)
src/main/harness/HarnessEditService.ts  # [신규] readFile/diff/apply/listBackups/restore 파사드 (백업+원자쓰기+재정규화)
src/main/harness/backup.ts         # [순수 가까이] 백업 경로 계산 + 복사 (테스트 대상: 경로 계산 순수부)
src/main/harness/draftDiff.ts      # [순수] baseContent↔draftContent diff 요약 계산 (테스트 대상)
src/main/ai/AIService.ts           # [수정] proposeEdit() 추가 (runClaudeStream 분기 재사용, 손대지 않음)
src/main/ai/harnessEditPrompt.ts   # [순수] proposeEdit system/user 프롬프트 빌더 (테스트 대상)
src/main/index.ts                  # [수정] HARNESS_* 편집 핸들러 등록 + HarnessEditService 인스턴스화
```
### preload
```
src/preload/index.ts               # [수정] api.harness.edit.* 노출
```
### renderer
```
src/renderer/src/components/HarnessStudio/edit/   # [신규] §6.2 전체
src/renderer/src/components/HarnessStudio/HarnessStudioView.tsx  # [수정] editMode 토글 + edit 탭
```
### DOD
```
src/renderer/src/components/ClaudeManual/ClaudeManual.tsx  # [수정] 편집 모드 매뉴얼 섹션
CHANGELOG.md                                                # [수정] v1.8(또는 차기) 편집 기능 항목
```

> **분리 원칙(기존 유지)**: electron 의존(app.getPath/dialog/fs 쓰기)은 `HarnessEditService`/IPC 핸들러에만. `editMap/applyFieldEdit/pickEditTargets/draftReducer/draftDiff/backup(경로계산)/harnessEditPrompt` 는 **순수함수**로 떼어 70% 커버리지 안전 확보(CLAUDE.md DOD). AI 호출은 `AIService` 주입 모킹.

---

## 9. ADR 목록 (별도 파일)

- `harness-studio-edit-adr-001-draft-representation.md` — draft 표현: **file-centric** 채택, model-patch 기각
- `harness-studio-edit-adr-002-write-path-gate-backup.md` — 쓰기 경로 게이트 + 자동 백업/복원 전략
- `harness-studio-edit-adr-003-structured-form-scope.md` — 구조화 폼 편집 범위 = **역매핑 가능 필드(model/tools/템플릿/raw)만**, AI 해석값 폼 금지

---

## 10. read-only 회귀 방지

- 편집 모드 OFF 가 기본 — `BundleScanner`/`HarnessNormalizer`/8뷰 동작은 변경 전과 동일해야 한다. `RawBundle` 에 `AgentSourceMap` 을 **추가**할 뿐 기존 필드 시그니처/값은 불변(append-only). 기존 BundleScanner 테스트 전량 통과가 게이트.
- `pathGate` 는 기존 `assertPathAllowed`(읽기)를 변경하지 않고 `assertWritablePath`(쓰기)를 신규 추가.
- 적용 후 재정규화는 기존 `normalize(force=true)` 를 그대로 호출 — 새 경로 없음.

---

## 11. 잔여 결정 (사용자 확인 필요)

§ `harness-studio-edit-plan.md` 끝과 동일 — 본 작업 반환 요약 참조.
