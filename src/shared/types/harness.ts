/**
 * Harness Studio — HarnessModel 스키마 및 IPC 보조 타입
 *
 * 정적 스캐너(BundleScanner)가 채우는 [S] 필드와
 * AI 정규화기(HarnessNormalizer, Opus)가 채우는 [AI] 필드를
 * provenance 맵으로 구분한다. 렌더러는 번들 종류와 무관하게
 * HarnessModel 하나만 그린다(번들-agnostic).
 *
 * 스키마 변경 시 schemaVersion 을 올리면 캐시가 자동 무효화된다.
 * ADR-harness-studio-001 참조.
 */

// ─────────────────────────────────────────────
// 기반 열거/리터럴 타입
// ─────────────────────────────────────────────

/**
 * 하네스 에이전트가 사용할 AI 모델 이름.
 * 'unknown' 은 frontmatter 에도 없고 매트릭스에도 없어
 * AI 가 추정했거나 아직 채워지지 않은 상태를 나타낸다.
 */
export type HarnessModelName = 'haiku' | 'sonnet' | 'opus' | 'unknown'

/**
 * Dry-run 레벨 식별자 (L0 = 최소 / L3 = 최대 복잡도).
 * 실제 레벨 이름·에이전트 체인은 HarnessLevel 참조.
 */
export type HarnessLevelId = 'L0' | 'L1' | 'L2' | 'L3'

/**
 * 필드 값의 출처.
 * - 'static'   : 정적 스캐너가 파일/frontmatter 에서 직접 읽음 (가장 신뢰도 높음)
 * - 'ai'       : AI 정규화기가 산문/스크립트를 분석해 추정함
 * - 'inferred' : 정적 데이터에서 규칙 기반으로 파생(AI 없음, 간접 추론)
 * - 'absent'   : 번들에 해당 정보가 없어 채울 수 없음
 *
 * UI 는 이 값으로 "AI 추정" / "정적" 배지를 정확히 표시한다.
 */
export type FieldSource = 'static' | 'ai' | 'inferred' | 'absent'

// ─────────────────────────────────────────────
// Provenance (필드별 출처 추적)
// ─────────────────────────────────────────────

/**
 * 필드 경로(JSON Path 스타일) → 출처 매핑.
 * 예) { 'agents[0].model': 'ai', 'meta.name': 'static' }
 *
 * HarnessModel.provenance 에 저장되며, 렌더러의 ProvenanceBadge 가
 * 이 맵을 참조해 각 필드 옆에 신뢰도 배지를 붙인다.
 * 신뢰도 투명성(ADR-001)을 위해 모든 [AI] 필드는 반드시 기록해야 한다.
 */
export interface Provenance {
  [fieldPath: string]: FieldSource
}

// ─────────────────────────────────────────────
// 하네스 메타 (번들 식별·캐시 키)
// ─────────────────────────────────────────────

/**
 * 번들 수준 메타데이터.
 * bundleHash 는 정규화 캐시 키로 사용된다 — 파일 내용+mtime 기반 SHA-256.
 * kind 는 정적 토폴로지 감지(BundleDetect)로 확정한다(AI 없음).
 */
export interface HarnessMeta {
  /** [S] 번들 디렉터리명 (예: reined-bmad) */
  name: string
  /** [S] VERSION 파일 또는 frontmatter 에서 읽은 버전 문자열 */
  version?: string
  /** [S] import 절대경로 — 사용자가 선택한 폴더의 절대경로 */
  source: string
  /**
   * [S] 정규화 캐시 키.
   * SHA-256(정렬된 [상대경로+mtimeMs+size] 목록 + frontmatter 내용).
   * 파일 추가/수정/삭제 시 자동 무효화된다.
   */
  bundleHash: string
  /** [AI] README/GUIDE 산문에서 추출한 저자 정보 */
  author?: string
  /** [AI] 번들 한 줄 설명 */
  tagline?: string
  /**
   * [S] 번들 종류 — 정적 토폴로지 신호로 확정.
   * - 'bundle'       : _core/ + (_agents/ 또는 <role>/SKILL.md) + (_templates/|blocks/) 존재
   * - 'overlay'      : config.md / _overlays/*.md 중심 구조
   * - 'partial-skill': SKILL.md / frontmatter 만 존재
   * - 'task'         : 단일 태스크 정의 파일
   */
  kind: 'bundle' | 'overlay' | 'partial-skill' | 'task'
  /**
   * 이 결과를 생성한 AI 정규화 모델명(haiku/sonnet/opus/fable 등).
   * 캐시된 모델과 현재 설정 모델이 다르면(AI 버전 업글·모델 변경 시) 재정규화를 트리거한다.
   * 파일/스키마 변경(bundleHash·schemaVersion)으로는 못 잡는 "모델만 바뀐" 케이스 대응.
   */
  normalizedBy?: string
}

// ─────────────────────────────────────────────
// 에이전트
// ─────────────────────────────────────────────

/**
 * 번들 내 단일 에이전트 정의.
 *
 * id / displayName / tools 는 정적으로 100% 확실하다(frontmatter).
 * model 은 frontmatter 있으면 정적, 없으면 _core/models.md 매트릭스 폴백,
 * 그래도 없으면 AI 추정 + modelSource='ai' 기록.
 * role/reads/writes/phaseClass 등 SKILL.md 산문 파생 필드는 AI 전담.
 */
export interface HarnessAgent {
  /** [S] frontmatter name (예: reined-bmad-developer) */
  id: string
  /** [S] id 에서 번들 접두어를 제거한 표시 이름 (예: developer) */
  displayName: string
  /** [AI] 한 줄 역할 설명 (SKILL.md ## 역할 한 줄 / 역할 카드에서 추출) */
  role: string
  /**
   * [S→AI] 에이전트가 사용하는 AI 모델.
   * frontmatter model: 있으면 정적(static), 없으면 _core/models.md 매트릭스
   * 파싱 시도(inferred), 그래도 없으면 AI 추정(ai) 또는 unknown.
   */
  model: HarnessModelName
  /**
   * [S] model 값을 어디서 얻었는지 출처.
   * 'static'  = frontmatter, 'inferred' = 매트릭스, 'ai' = AI 추정, 'absent' = 미확인
   */
  modelSource: FieldSource
  /** [S] tools: / allowed-tools: 목록 (mcp__... 형태 MCP 도구명 포함) */
  tools: string[]
  /** [AI] SKILL.md "필독 파일" 산문에서 정규화한 읽기 파일 경로/패턴 목록 */
  reads: string[]
  /** [AI] 역할카드 "도구 권한"/concepts §3 산문에서 정규화한 쓰기 경로 패턴 */
  writes: string[]
  /**
   * [AI] 에이전트 역할 분류 — Flow Canvas 노드 색상에 사용.
   * 'analyst'|'pm'|'architect'|'sm'|'dev'|'qa'|'security'|'release'|'orchestrator'|'other'
   */
  phaseClass?: string
  /** [AI] 에스컬레이션 조건 산문 (예: "크기 초과 시 SM 반려", "SIGNAL: ESCALATE") */
  escalation?: string
  /**
   * [S→AI] 이 에이전트에 허용된 SIGNAL enum 값 목록.
   * signals.md 표에서 해당 에이전트 행을 정적으로 추출; 없으면 AI 추정.
   * 예) ['IMPL_COMPLETE', 'BLOCKED', 'ESCALATE']
   */
  signals?: string[]
  /** [AI] 역할카드 "주된 위험" 항목 (Flow 노드 경고 아이콘 표시 기준) */
  riskNote?: string
}

// ─────────────────────────────────────────────
// 레벨 (L0~L3 작업 복잡도)
// ─────────────────────────────────────────────

/**
 * 단일 레벨 정의.
 * 레벨 ID 토큰(L0~L3)은 정적으로 확인 가능하지만, 이름/체인/병렬구간/필수산출물은
 * triage.md / concepts.md 산문·표에서 AI 가 추출한다.
 * agentChain 의 순서는 핸드오프 순서를 의미한다.
 */
export interface HarnessLevel {
  /** [S] 레벨 식별자 (L0~L3 토큰은 정적, 의미 매핑은 AI) */
  id: HarnessLevelId
  /** [AI] 레벨 표시 이름 (예: "Standard Feature (2두 마차)") */
  name: string
  /**
   * [AI] 이 레벨에서 실행되는 에이전트 ID 배열 (순서 = 핸드오프 순서).
   * triage.md / concepts.md 체인 표현을 AI 가 정규화한 결과.
   */
  agentChain: string[]
  /**
   * [AI] 체인 안에서 병렬 실행되는 에이전트 그룹.
   * 예) [['qa', 'security']] — QA와 Security가 동시 진행
   */
  parallelInChain?: string[][]
  /**
   * [AI] 이 레벨에서 생성해야 하는 산출물 ID 목록.
   * 예) ["ADR ≥ 1", "story", "impl-log"] → artifact id 배열
   */
  requiredArtifacts: string[]
}

// ─────────────────────────────────────────────
// Triage (레벨 자동 판정)
// ─────────────────────────────────────────────

/**
 * Triage 판정 질문 하나.
 * id는 Q1~Q6 같은 코드이지만, UI에는 text(자연어)만 표시한다.
 * meaning은 AI가 질문 의도를 한 줄로 요약한 메타 설명이다.
 */
export interface TriageQuestion {
  /** [AI] 질문 코드 (예: Q1, Q4) */
  id: string
  /** [AI] 사용자에게 보이는 질문 본문 */
  text: string
  /** [AI] 질문이 측정하는 복잡도 축 또는 의도 설명 */
  meaning: string
}

/**
 * Triage 판정 규칙 하나 — "when 조건이면 then 레벨로 분류".
 * triage.md / concepts.md 의 코드블록/표에서 AI 가 정규화한다.
 * 예) { when: 'Q4=Yes', then: 'L3' }
 */
export interface TriageRule {
  /** [AI] 판정 조건 (자연어 또는 Q코드 표현, 예: "Q4=Yes AND Q2=Yes") */
  when: string
  /** [AI] 판정 결과 레벨 */
  then: HarnessLevelId
}

/**
 * 레벨 자동 판정 전체 구조.
 * questions + rules 를 합성해 DryRunEstimator 가 레벨을 추정한다.
 * securityOverride 는 레벨과 독립적으로 강제되는 보안 조건.
 */
export interface HarnessTriage {
  /** [AI] Q1~Q6 판정 질문 목록 */
  questions: TriageQuestion[]
  /** [AI] 레벨 판정 규칙 목록 (순서대로 평가, 첫 번째 match 가 우선) */
  rules: TriageRule[]
  /**
   * [AI] 레벨 독립 보안 오버라이드 조건.
   * 예) "L3 OR Q3=Yes 이면 security 에이전트 필수"
   */
  securityOverride?: string
}

// ─────────────────────────────────────────────
// 산출물 (Artifact)
// ─────────────────────────────────────────────

/**
 * 산출물 템플릿 파일에서 정적으로 읽은 구조.
 * _templates/*.md 가 존재할 때만 채워진다.
 */
export interface ArtifactTemplate {
  /** [S] _templates/*.md 의 frontmatter 키 목록 */
  frontmatter: string[]
  /** [S] ## 결정 사항 등 마크다운 헤더 목록 */
  sections: string[]
}

/**
 * 번들 내 단일 산출물 정의.
 * id 는 _templates 가 있으면 파일명 stem(정적), 없으면 AI 가 산문에서 추출.
 * persist 분류는 concepts §4 산문(git 추적 vs gitignore) 을 AI 가 분석한다.
 */
export interface HarnessArtifact {
  /**
   * [S] 템플릿 파일명 stem (예: story, impl-log) —
   * _templates 디렉터리 없으면 [AI] 산문 파싱
   */
  id: string
  /** [AI] 이 산출물을 생성하는 에이전트 ID (handoff 표/SKILL 출력 섹션에서 추출) */
  producer?: string
  /** [AI] 이 산출물을 읽는 에이전트 ID 목록 */
  consumers: string[]
  /** [AI] 산출물이 저장되는 경로 패턴 (예: .reined-bmad/docs/stories/...) */
  location?: string
  /**
   * [AI] 산출물 영속화 방식 — concepts §4 산문 분류.
   * - 'git'    : git 추적 대상 (버전 관리 필요)
   * - 'ignore' : .gitignore 대상 (임시/개인 파일)
   * - 'dooray' : 두레이 태스크/댓글로 업로드
   * - 'unknown': 판정 불가
   */
  persist: 'git' | 'ignore' | 'dooray' | 'unknown'
  /** [S] 템플릿 파일이 존재할 때만 채워지는 구조 정보 */
  template?: ArtifactTemplate
}

// ─────────────────────────────────────────────
// 제어흐름 (Gate / Hook / ControlFlow)
// ─────────────────────────────────────────────

/**
 * 게이트 스크립트 하나의 분석 결과.
 * phase / ruleCodes / blocking 은 스크립트 정적 파싱으로 채우고,
 * description 은 AI 가 "무엇을 차단하는지" 설명한다.
 * 주의: 게이트 스크립트는 텍스트로만 파싱하며 절대 실행하지 않는다(보안).
 */
export interface HarnessGate {
  /** [S] gate.sh case 라벨 (예: dev, qa, release) — 정적 스크립트 파싱 */
  phase: string
  /**
   * [S] 규칙 코드 목록 — 정규식으로 추출.
   * 예) ['R501', 'R502'] (reined) / ['NEON-G01', 'AOP01'] (neon)
   */
  ruleCodes: string[]
  /**
   * [S] 규칙 코드별 검사 내용 — 게이트 스크립트의 `<코드> "메시지"` 에서 추출.
   * 예) [{ code:'R510', message:"'## 결정 사항' 섹션 누락" }]
   * 코드만으로는 의미를 알 수 없으므로 스크립트 원문 메시지를 그대로 노출(이해도).
   */
  ruleDetails?: { code: string; message: string }[]
  /** [AI] 이 게이트가 차단하는 내용 한 줄 설명 */
  description?: string
  /**
   * [S] 진짜 차단(blocking) 여부.
   * exit 1 / exit 2 존재 시 true — 단순 경고(exit 0)와 구분.
   */
  blocking: boolean
}

/**
 * hook 스크립트 하나의 분석 결과.
 * file 은 정적, event 는 스크립트/설정 grep 으로 1차 시도,
 * enforces 는 AI 가 분석한다.
 */
export interface HarnessHook {
  /** [S] _hooks/*.sh 파일명 */
  file: string
  /**
   * [S→AI] hook 이벤트 종류.
   * 스크립트/설정 파일에서 정적 grep 시도 후 없으면 AI.
   * 예) 'SubagentStop' | 'PreToolUse' | 'Stop'
   */
  event?: string
  /** [AI] 이 hook 이 강제하는 내용 한 줄 설명 */
  enforces?: string
}

/**
 * 번들 전체 제어흐름 구조.
 * gates / hooks 는 정적 스캔으로 골격을 만들고 AI 가 의미를 채운다.
 * parallelGroups / loops / stateMachine 은 AI 전담.
 */
export interface HarnessControlFlow {
  /** [S→AI] 게이트 목록 — 스크립트 정적 파싱 + AI 라벨링 */
  gates: HarnessGate[]
  /** [S→AI] hook 목록 — 파일 존재 정적 감지 + AI 의미 분석 */
  hooks: HarnessHook[]
  /**
   * [AI] 병렬 실행 그룹 설명 목록.
   * 예) ["Developer 병렬", "QA||Security"]
   */
  parallelGroups: string[]
  /**
   * [AI] 루프/피드백 구간 설명 목록.
   * 예) ["QA RETURN 루프 3회 → PM 에스컬레이션"]
   */
  loops: string[]
  /**
   * [S→AI] 에이전트별 허용 SIGNAL enum 맵.
   * signals.md 표가 정형이면 정적, 없으면 AI.
   * 예) { 'developer': ['IMPL_COMPLETE', 'BLOCKED'] }
   */
  signalEnum?: Record<string, string[]>
  /**
   * [AI] 상태기계 전이 목록 — pipeline.sh/loop.md 분석.
   * 예) { transitions: [{ from: 'dev', on: 'IMPL_COMPLETE', to: 'qa' }] }
   */
  stateMachine?: {
    transitions: Array<{ from: string; on: string; to: string }>
  }
}

// ─────────────────────────────────────────────
// 점수 (6축 레이더)
// ─────────────────────────────────────────────

/**
 * 6축 레이더 차트의 단일 축 점수.
 * 6축: 강제력 / 제어흐름 / 상태 / 차단게이트 / 피드백루프 / 관측가능성
 */
export interface HarnessScoreAxis {
  /** 축 식별 키 (예: 'enforcement', 'controlFlow', 'observability') */
  key: string
  /** AI 추정 점수 */
  value: number
  /** 축 최대 점수 */
  max: number
  /** [AI] 이 점수 근거 한 줄 (투명성) */
  note?: string
}

/**
 * 6축 레이더 점수 전체 — 기계가독 소스가 없어 전부 AI 추정.
 * score 가 absent 면 ScorePanel 에 "추정 불가 / AI 재생성" 안내를 표시한다.
 * rationale 은 점수 산정 근거로, 저자 점검 페르소나가 AI 추정을 검증할 때 사용한다.
 */
export interface HarnessScore {
  /** [AI] 6축 점수 배열 */
  axes: HarnessScoreAxis[]
  /** [AI] 합산 총점 */
  total: number
  /** [AI] 점수 산정 근거 산문 (투명성용, UI 툴팁/패널에 노출) */
  rationale?: string
}

// ─────────────────────────────────────────────
// 오버레이 (번들 위에 쌓는 커스터마이징 레이어)
// ─────────────────────────────────────────────

/**
 * 번들 위에 쌓는 오버레이 정의.
 * config.md / _overlays/*.md 에서 정적 파싱 우선, 비정형이면 AI.
 * 비활성 에이전트는 렌더러 Flow Canvas 에서 흐림 처리된다.
 */
export interface HarnessOverlay {
  /** [AI] 오버레이가 타겟으로 하는 기술 스택 (예: "NestJS + TypeORM") */
  stack?: string
  /** [AI] 적용 도메인 목록 (예: ["backend", "api"]) */
  domains: string[]
  /**
   * [S→AI] 모델 오버라이드 맵 — "## 모델 오버라이드" 표가 정형이면 정적.
   * 예) { 'developer': 'opus' }
   */
  modelOverrides: Record<string, HarnessModelName>
  /**
   * [S→AI] 이 오버레이에서 비활성화된 에이전트 ID 목록.
   * "## 비활성 에이전트" 표가 정형이면 정적, 아니면 AI.
   */
  disabledAgents: string[]
}

// ─────────────────────────────────────────────
// HarnessModel — 최상위 모델 (렌더러가 소비하는 단일 진실 소스)
// ─────────────────────────────────────────────

/**
 * 번들 하나를 정규화한 결과 — Harness Studio 의 핵심 데이터 모델.
 *
 * 정적 스캐너(BundleScanner)가 [S] 필드로 스켈레톤을 먼저 채우고,
 * AI 정규화기(HarnessNormalizer, Opus)가 비어있는 [AI] 필드만 채운다.
 * AI 는 [S] 필드를 절대 덮어쓰지 않는다(ADR-001).
 *
 * schemaVersion 은 캐시 무효화에 사용된다 — 스키마 변경 시 반드시 올린다.
 * warnings 는 degradation 상황(체인 추출 실패 등)을 사용자에게 고지한다.
 * provenance 는 필드별 출처를 기록해 UI 의 신뢰도 배지 표시를 지원한다.
 */
export interface HarnessModel {
  /**
   * 모델 스키마 버전 — 초기값 1.
   * 스키마 변경 시 이 값을 올리면 이전 캐시가 자동 폐기된다.
   * 캐시 읽기 시 저장된 schemaVersion 과 비교해 불일치면 무효화.
   */
  schemaVersion: number
  /** 번들 식별·캐시 키 메타 */
  meta: HarnessMeta
  /** 번들 내 에이전트 목록 */
  agents: HarnessAgent[]
  /** L0~L3 레벨 정의 목록 */
  levels: HarnessLevel[]
  /** 레벨 자동 판정(triage) 구조 */
  triage: HarnessTriage
  /** 번들 산출물 목록 */
  artifacts: HarnessArtifact[]
  /** 게이트/hook/병렬/루프/상태기계 제어흐름 */
  controlFlow: HarnessControlFlow
  /**
   * 6축 레이더 점수 — optional.
   * absent 면 ScorePanel 에 "추정 불가/AI 재생성" 안내를 표시한다.
   */
  score?: HarnessScore
  /**
   * 번들 위에 적용된 오버레이 — optional.
   * 오버레이 없는 번들은 undefined.
   */
  overlay?: HarnessOverlay
  /**
   * degradation 경고 메시지 목록.
   * 정규화 실패, 부분 스킬, AI 파싱 오류 등의 사유를 사용자에게 고지한다.
   * 예) ["체인 추출 실패: triage.md 없음", "AI 정규화 부분 실패: levels[1].agentChain"]
   */
  warnings: string[]
  /**
   * 필드별 출처 맵 — UI 신뢰도 배지 표시에 사용.
   * ProvenanceBadge 컴포넌트가 이 맵을 참조한다.
   */
  provenance: Provenance
}

// ─────────────────────────────────────────────
// IPC 보조 타입
// ─────────────────────────────────────────────

/**
 * HARNESS_SCAN 응답 — 정적 스캔 요약.
 * AI 호출 없이 즉시 반환되며, ScanStep 에서 사용자 확인에 사용된다.
 *
 * fileTree 는 번들 내 파일 경로 목록(상대경로),
 * agentStubs 는 frontmatter 만으로 채운 에이전트 목록 요약,
 * warnings 는 스캔 중 발견한 이상 상황이다.
 */
export interface RawBundleSummary {
  /** [S] 감지된 번들 종류 */
  kind: HarnessMeta['kind']
  /** [S] 번들 내 파일 상대경로 목록 */
  fileTree: string[]
  /**
   * [S] frontmatter 만으로 채운 에이전트 스텁 목록.
   * id / displayName / model / tools 만 포함, role 등 AI 필드는 빈 값.
   */
  agentStubs: Pick<HarnessAgent, 'id' | 'displayName' | 'model' | 'modelSource' | 'tools'>[]
  /** 스캔 중 발견한 경고 메시지 목록 (예: "VERSION 파일 없음") */
  warnings: string[]
}

/**
 * HARNESS_DRYRUN 응답 — 태스크 레벨 추정 결과.
 *
 * level 은 AI(Haiku) 가 triage 구조를 보고 추정한 레벨,
 * highlightPath / parallelGroups / gates 는 levelPath 순수함수가
 * HarnessModel + level 로 결정론적으로 계산한다(AI 없음).
 * estTimeRel / estCostRel 은 L0 기준 상대값(1.0 = L0 기준).
 *
 * 근거: arch.md §3.2 — AI는 레벨 추정값만, 나머지는 모델에서 계산.
 */
export interface DryRunResult {
  /** AI(Haiku) 가 추정한 레벨 */
  level: HarnessLevelId
  /**
   * AI 가 triage 질문에 답한 내용 — Q 코드를 노출하지 않고 자연어로 표현.
   * 예) ["보안 요구사항 있음 → Yes", "아키텍처 변경 없음 → No"]
   */
  answers: string[]
  /** AI 가 레벨을 추정한 근거 산문 */
  rationale: string
  /**
   * levelPath 가 계산한 하이라이트 경로 — 에이전트 ID 배열(순서).
   * FlowCanvas 에서 이 경로를 강조 표시한다.
   */
  highlightPath: string[]
  /**
   * levelPath 가 계산한 병렬 실행 그룹.
   * 예) [['qa', 'security']]
   */
  parallelGroups: string[][]
  /**
   * 이 레벨에서 통과해야 하는 게이트 phase 목록.
   * HarnessModel.controlFlow.gates 에서 해당 에이전트 체인에 속하는 것만.
   */
  gates: string[]
  /**
   * L0 대비 예상 소요 시간 상대값 (1.0 = L0).
   * levelPath 가 level 에 따라 결정론적으로 산출한다.
   */
  estTimeRel: number
  /**
   * L0 대비 예상 AI 호출 비용 상대값 (1.0 = L0).
   * levelPath 가 level + agentChain 길이 기반으로 산출한다.
   */
  estCostRel: number
}

/**
 * HARNESS_DISCOVER 응답 단일 항목 — 자동 발견된 번들 정보.
 * ~/ .claude/skills/* 를 정적으로 스캔해 반환한다.
 */
export interface DiscoveredHarness {
  /** 번들 디렉터리 절대경로 */
  path: string
  /** 번들 이름 (디렉터리명) */
  name: string
  /** 감지된 번들 종류 */
  kind: HarnessMeta['kind']
}

/**
 * HARNESS_LIST_CACHED 응답 단일 항목 — 캐시에 저장된 번들 항목.
 * 최근 정규화한 번들을 빠르게 재오픈할 때 사용한다.
 * schemaVersion 불일치 항목은 캐시 read 시 자동 폐기된다.
 */
export interface CachedHarnessEntry {
  /** 번들 디렉터리 절대경로 */
  path: string
  /** 번들 이름 */
  name: string
  /** 캐시 저장 시각 (ISO 8601) */
  cachedAt: string
  /** 캐시된 HarnessModel 의 schemaVersion */
  schemaVersion: number
}
