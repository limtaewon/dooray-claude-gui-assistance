# [기획] Harness Studio — AI 개발 방법론(bmad) 시각화 · Dry-run

> 상태: **기획 초안 (리뷰 요청)** · 작성: 임태원(토란) · 대상 버전: v1.7 후보
> 목업(인터랙티브 와이어프레임): `docs/mockups/harness-studio-mockup.html` (neon-bmad v1.6.0 모티브)

## 1. 배경 / 문제

`reined-bmad` · `neon-bmad` 같은 **AI 개발 방법론 하네스**를 만들어 쓰고 있지만, 이게 **추상적으로 받아들여진다** — 만든 사람도, 전달받은 팀원도. "프로젝트와 태스크를 넘기면 실제로 어떻게 진행되는지", "어떤 에이전트가 어떤 모델로 어떤 역할을 하고 어떤 산출물을 내는지", "스크립트가 게이트를 어떻게 거는지"가 문서(마크다운 수십 개)에 흩어져 있어 한눈에 안 들어온다.

→ Clauday에 **방법론을 import 해서 "미리 보고 만져보는" 시각화 도구**를 추가한다.

## 2. 핵심 통찰

하네스는 마크다운으로 기술된 **결정론적 상태기계**다. "태스크를 주면 어떻게 흘러가나"의 거의 전부가 규칙으로 계산된다:

- 레벨 판정 = 6개 질문(Q1~Q6)의 deterministic 규칙
- 레벨 → 에이전트 체인 = 고정 매핑 (L0 dev / L1 sm·dev·qa / L2 풀체인 / L3 +security·병렬·단계배포)
- 에이전트 → 모델 = `_agents/*.md`의 `model:` 필드 (단일 진실 소스)
- 페이즈 → 산출물 = `_templates/` + 의존 흐름

**따라서 실행 없이 정적 시뮬레이션이 가능하다.** AI가 실제로 필요한 곳은 세 군데뿐: ① 임의 하네스 마크다운 → 정규화 JSON(HarnessModel) ② 실제 태스크 → 레벨 추정 ③ 개인화 설명.

> 비용/정책 전제: `claude -p` 사용 제약은 가정하지 않는다 (전부 사용 가능 전제). 캐시는 UX 차원에서만 활용.

## 3. 목표 / 비목표

**목표**
- 임의의 하네스 번들/스킬/태스크를 import → 그 사람 환경에 맞게 해석해 시각화
- "이 태스크를 주면 이렇게 흐른다"를 실행 전에 미리보기(Dry-run)
- 에이전트·모델·역할·산출물·게이트·강제 메커니즘을 직관적으로 노출
- 온보딩(전달받는 팀원)과 저자 자신의 점검을 동시에 지원

**비목표 (이번 범위 밖)**
- 실제 워크플로우 라이브 실행/모니터링 (후속, P3+)
- 하네스 편집/저작 기능 (읽기·시뮬레이션 전용)
- bmad 계열이 아닌 임의 방법론의 완전 일반화 (BMAD 형 우선, 부분 스킬은 graceful degradation)

## 4. 사용자

| 페르소나 | 니즈 | 핵심 뷰 |
|---|---|---|
| 방법론 **저자**(나) | 구조 결함 점검·디버깅 (호출 안 되는 에이전트, 소비자 없는 산출물, 게이트 정합) | Gates, Score, (후속) Doctor |
| **전달받는 팀원** | "이게 뭔지" 빠른 이해 + 공유 | Flow, Skills, Dry-run, (후속) Export |
| Clauday **일반 사용자** | 임의 하네스/스킬 올려 탐색 | Import → 전 뷰 |

## 5. Import 모델 (범용성)

내 것만이 아니라 **누가 무엇을 올리든** 그 사람 환경에 맞게 해석. import 타입 자동 감지:

| import 대상 | 감지 신호 | 해석 결과 |
|---|---|---|
| 방법론 번들 (폴더/zip) | `_core/` `_agents/` `_templates\|blocks/` `*/SKILL.md` | 엔진 전체 → 전 뷰 |
| 프로젝트 오버레이 | `config.md` frontmatter | 번들을 스택·도메인·model_overrides·disabled_agents로 개인화 |
| 태스크 | 두레이 URL / 평문 | Dry-run 입력 |
| 부분 스킬 zip | `SKILL.md`/agent frontmatter만 | 풀 흐름 없이 에이전트 카탈로그 (degradation) |

**Import 단계 UX (4-step 위저드)**: ① 소스(드롭/자동발견/연결) → ② 구조 인식(정적 스캔, AI 없음) → ③ AI 정규화(HarnessModel 추출, Opus, 번들 해시 캐시) → ④ 확정·개인화(오버레이/용어번역 토글).

## 6. 데이터 모델 — `HarnessModel`

렌더러는 이 JSON 하나만 그린다 (하네스-agnostic). `src/shared/types/harness.ts`.

```ts
HarnessModel {
  meta: { name, version, source, author?, tagline? }
  agents: [{ id, role, model, tools[], reads[], writes[], phaseClass, escalation? }]
  levels: [{ id:'L0'|'L1'|'L2'|'L3', name, agentChain[], requiredArtifacts[] }]
  triage: { questions: Q1..Q6, rules[] }
  artifacts: [{ id, producer, consumers[], location, persist:'git'|'ignore'|'dooray', template{frontmatter,sections} }]
  controlFlow: { gates[], hooks[], parallelGroups[], loops[], stateMachine? }
  score?: { axes:[{key,value/2}], total }     // bmad 6축 (있으면)
  overlay?: { stack, domains[], modelOverrides, disabledAgents }   // 개인화 레이어
}
```

정적 패스(glob + frontmatter)로 스켈레톤을 만들고, AI는 "지저분한 규칙 표 정규화 + 설명"만 보강.

## 7. 기능/뷰 명세

### 7-1. Flow Canvas (메인)
- L0│L1│L2│L3 토글 → 생략 페이즈 흐림, 그래프 재구성
- 노드=에이전트(페이즈색·모델배지), 엣지=전달 산출물, 조건부=점선
- 게이트 칩(전환 사이), 자동 차단 배지, QA RETURN 루프, 병렬 그룹
- 노드 클릭 → **Agent Inspector**: 모델·역할·도구(화이트리스트)·입출력·에스컬레이션 조건

### 7-2. Dry-run 미리보기
- 태스크 입력/URL → AI 레벨 추정(6질문, Q코드 미노출·자연어) → 경로 하이라이트
- architect Sonnet↔Opus 판정, security_required, 실행 타임라인(병렬 그룹), 게이트, 예상 시간/상대비용

### 7-3. 스킬 & 블록
- 에이전트 SKILL.md 해부: 역할 카드(위험·쓰기권한)·필독·핵심 규칙(§⚡)·**합리화 방어 테이블**
- `blocks/` 재사용 스크립트·패턴 + 사용 에이전트 매핑

### 7-4. 게이트 & 강제
- 4계층 제약(무엇이 진짜 런타임 강제인가)
- `gate-check.sh` 페이즈별 규칙코드(NEON-G10/AOP01/LYR01/G51…) + exit 2
- 자동 hook 3종(SubagentStop/PreToolUse/Stop hook)
- `pipeline.sh` 상태기계(transition: pass/violation/deviation/redo→escalate)

### 7-5. 산출물
- 출력 트리(`.neon-bmad/` — ADR=git커밋 / docs=gitignore / 두레이 / report.html) + 템플릿 스켈레톤(3섹션 계약)

### 7-6. 하네스 점수
- bmad 6축 레이더(강제력·제어흐름·상태·차단게이트·피드백루프·관측가능성) + 점수 여정

## 8. AI 사용 설계

| 용도 | 모델 | 비고 |
|---|---|---|
| 번들 마크다운 → HarnessModel 정규화 | Opus | 번들 해시 캐시 (재오픈 0초) |
| 태스크 → 레벨 추정 | Haiku | 태스크 해시 캐시 |
| 개인화 설명/용어 번역 | Sonnet | 온디맨드 |

렌더링·시뮬레이션 자체엔 AI 불필요(결정론).

## 9. 디자인 방침

목업(`docs/mockups/harness-studio-mockup.html`)은 **정보구조·인터랙션 검증용 와이어프레임**이며 최종 비주얼이 아니다. 실제 구현은 **Clauday 디자인 시스템**을 따른다:
- 이모지 → `lucide-react`, 임의 hex → `design-system.css` 시맨틱 토큰
- 자체 스타일 → `components/common/ds`(Button/Card/Chip/Modal/SegTabs/CommandPalette)
- 다크/라이트 + 팔레트(useTheme) 양쪽, 토큰 스케일(`--space-*`/`--radius-*`)
- 그래프 렌더링 라이브러리(react-flow vs 직접 SVG)는 P1 착수 시 결정

## 10. 아키텍처 (Clauday 통합)

- 사이드바 새 뷰 **Harness Studio** (`activeView` 라우팅)
- `src/shared/types/harness.ts` — HarnessModel
- main: 번들 파서(정적 스캔) + AIService 라우팅(정규화/레벨추정) + IPC 핸들러(3+1 규칙)
- renderer: `components/HarnessStudio/` (Import 위저드 + 6뷰 + Inspector)
- 산출물/캐시: `electron-store` 또는 `<userData>/harness-cache/`

## 11. 단계

- **P1 (MVP)**: 번들 import(위저드) → HarnessModel 정규화 → Flow Canvas + Agent Inspector + Artifact Tree + Skills&Blocks + Gates + Score (read-only)
- **P2**: Dry-run (태스크 → 레벨추정 → 경로/게이트/비용·시간)
- **P3**: 개인화(오버레이 반영) · 공유 export(이미지/HTML) · 하네스 비교(neon↔reined) · Doctor 패널 · (후속) 라이브 실행 모니터

## 12. 후속 시각화 아이디어 (백로그)

1. ★ 트리아지 결정 트리 (Q1~Q6 직접 토글 → 레벨 분기)
2. ★ 산출물 의존 그래프(핸드오프 DAG, manifest 강조)
3. ★ "고삐 잡힘" 관측 대시보드 (원장 #392: 차단·RETURN·cache_read·토큰)
4. 모델·비용 분해 (레벨별 믹스 도넛 + 상대비용)
5. 도메인/DataSource 맵 (fi/po/…/click/cn ↔ 에이전트 권한)
6. 자율 vs 수동 실행 비교 타임라인
7. 하네스 진단(doctor) 패널 (정합 PASS/WARN/FAIL + 6축 약점)
8. 하네스 비교 뷰 (neon ↔ reined diff)
9. (후속) 라이브 실행 모니터 (state.json/pipeline-state.json 연동)

## 13. 미해결 결정 (리뷰 포인트)

- [ ] MVP 범위 — 시각화(P1)만 vs Dry-run(P2)까지 한 사이클에?
- [ ] 그래프 렌더링 — `react-flow`(@xyflow) 도입 vs 직접 SVG (의존성↔공수)
- [ ] 주 페르소나 무게 — 저자 점검 vs 팀 온보딩(공유 export 우선순위)
- [ ] 다음 목업에 추가할 뷰 — 추천: 1(트리아지 트리) + 3(고삐 관측 대시보드)
- [ ] Definition of Done — 신규 모듈 vitest 단위 테스트 + ClaudeManual 매뉴얼 항목 포함 (프로젝트 규약)

---
*참고: 본 문서는 `docs/planning/harness-studio-prd.md`. 인터랙티브 목업은 `docs/mockups/harness-studio-mockup.html`.*
