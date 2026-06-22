/**
 * Harness Studio — 정규화/레벨추정 프롬프트 빌더 (순수 함수)
 *
 * AI 정규화기(HarnessNormalizer)가 runClaudeStream 에 전달할
 * system prompt / user prompt 를 구성한다.
 *
 * 머지 계약 (ADR-001):
 * - system prompt 에 HarnessModel 스키마를 JSON only 로 강제한다.
 * - user prompt 는 "비어있는 [AI] 필드만 채워라" 지시 + RawBundle 원문.
 * - AI 가 [S] 필드(정적으로 이미 채워진 필드)를 덮어쓰지 못하도록 명시.
 *
 * 레벨추정 프롬프트(buildEstimatePrompt):
 * - Q 코드를 노출하지 않고 자연어 질문으로 변환한다.
 * - 추정 결과는 { level, answers(자연어), rationale } JSON 만 반환.
 */

import type { HarnessModel, HarnessTriage } from '../../shared/types/harness'

// ─────────────────────────────────────────────────────────────────────────────
// HarnessModel JSON 스키마 강제 system prompt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HarnessModel 의 [AI] 필드 스키마 인라인 문서.
 *
 * AI 가 채워야 할 필드만 열거하고, [S] 필드(정적으로 채워진 것)는
 * "건드리지 말 것"을 명시한다 (ADR-001 머지계약).
 */
const HARNESS_SCHEMA_DESCRIPTION = `
당신은 bmad-style 번들(Claude Code 에이전트 워크플로 번들)을 분석해
HarnessModel JSON 의 비어있는 [AI] 필드를 채우는 전문가입니다.

## 절대 규칙
1. 응답은 **순수 JSON 만** — 설명 텍스트, 마크다운 코드블록, 주석 일절 금지.
2. 이미 값이 있는 [S] 필드(정적으로 채워진 필드)는 절대 덮어쓰지 않는다.
3. 비어있거나(빈 문자열/빈 배열/undefined) [AI] 로 표기된 필드만 채운다.
4. 확신이 없으면 빈 값보다 "absent" 또는 추정 근거를 적는다.
5. 배열 필드가 비어있으면 [] 로 두지 말고 번들 내용에서 추출한다.

## 채워야 할 [AI] 필드 (HarnessModel 구조)

### meta
- author: string           README/GUIDE 산문에서 저자 이름/팀
- tagline: string          번들 한 줄 설명 (무엇을 위한 워크플로인가)

### agents[] (각 에이전트)
- role: string             SKILL.md "역할 한 줄" / 역할 카드에서 추출
- reads: string[]          "필독 파일" 또는 입력 아티팩트 경로 패턴
- writes: string[]         "출력 아티팩트" 또는 쓰기 경로 패턴
- phaseClass: string       analyst|pm|architect|sm|dev|qa|security|release|orchestrator|other 중 하나
- escalation: string|undefined  에스컬레이션 조건 산문
- signals: string[]|undefined   이 에이전트에 허용된 SIGNAL enum 값 (signals.md 에서 추출)
- riskNote: string|undefined    "주된 위험" 항목

### levels[] (L0~L3)
- name: string             레벨 표시 이름 (예: "Standard Feature")
- agentChain: string[]     이 레벨에서 실행되는 에이전트 id 배열 (핸드오프 순서)
- parallelInChain: string[][]|undefined  병렬 실행 그룹
- requiredArtifacts: string[]  이 레벨에서 필수 산출물 id 배열

### triage
- questions: { id, text, meaning }[]   Q1~Q6 판정 질문
- rules: { when, then }[]              판정 규칙 ("Q4=Yes → L3" 등)
- securityOverride: string|undefined   레벨 독립 보안 오버라이드 조건

### artifacts[] (각 산출물)
- producer: string|undefined    생성 에이전트 id
- consumers: string[]           읽는 에이전트 id 목록
- location: string|undefined    저장 경로 패턴
- persist: "git"|"ignore"|"dooray"|"unknown"

### controlFlow
- gates[].description: string|undefined   각 게이트가 차단하는 내용
- hooks[].enforces: string|undefined       각 hook 이 강제하는 내용
- parallelGroups: string[]   병렬 실행 그룹 설명 목록
- loops: string[]            루프/피드백 구간 설명 목록
- stateMachine: { transitions: {from,on,to}[] }|undefined

### score
**score 는 채우지 마세요(생략).** 6축 점수는 앱이 구조 신호로 결정론적으로 계산하므로 AI 추정이 불필요합니다.

### warnings
- degradation 경고 목록 — 번들에서 추출하지 못한 정보를 여기에 기록

### provenance
- 각 채운 필드 경로(JSON path 스타일) → "ai"
- 예: { "meta.author": "ai", "agents[0].role": "ai", ... }
`

/**
 * 번들 정규화용 system prompt.
 *
 * AI 가 HarnessModel 의 [AI] 필드만 채우고,
 * 이미 정적으로 채워진 [S] 필드를 덮어쓰지 못하도록 강제한다.
 */
export function buildNormalizeSystemPrompt(): string {
  return HARNESS_SCHEMA_DESCRIPTION.trim()
}

/**
 * 번들 정규화용 user prompt.
 *
 * 정적 스켈레톤(이미 [S] 필드가 채워진 부분 HarnessModel)과
 * RawBundle 원문 파일 내용을 함께 전달한다.
 *
 * AI 는 스켈레톤을 읽어 어떤 필드가 이미 채워졌는지 파악하고,
 * 비어있는 [AI] 필드만 채운다.
 *
 * @param skeleton - 정적 스캐너가 채운 부분 HarnessModel (JSON 직렬화됨)
 * @param rawBundleText - 번들의 주요 파일 내용 원문 (분석 대상)
 */
export function buildNormalizeUserPrompt(
  skeleton: Partial<HarnessModel>,
  rawBundleText: string
): string {
  const skeletonJson = JSON.stringify(skeleton, null, 2)
  return `## 현재 스켈레톤 (이미 채워진 [S] 필드 — 건드리지 말 것)
\`\`\`json
${skeletonJson}
\`\`\`

## 번들 원문 (분석 대상)
아래 파일 내용에서 비어있는 [AI] 필드를 추출해 채우세요.
[S] 필드(id, tools, model(frontmatter), phase, ruleCodes, blocking 등)는 이미 위에 채워졌으니 그대로 두세요.

**단, agents[].model 이 "unknown" 인 에이전트**(frontmatter 에 model 미선언)는 예외입니다:
번들의 모델 매트릭스(예: _core/models.md, concepts.md 의 모델 배정표)나 각 에이전트 정의에서
해당 역할에 배정된 모델을 찾아 \`haiku\`/\`sonnet\`/\`opus\` 중 하나로 채워주세요.
매트릭스/근거를 못 찾으면 "unknown" 그대로 두세요(임의 추측 금지).

${rawBundleText}

## 출력 형식 (중요 — 크기 최소화로 JSON 잘림/오류 방지)
**[AI] 필드만 담은 컴팩트 JSON** 을 반환하세요. [S] 배열·필드(tools, ruleCodes, blocking, template, displayName, fileTree, bundleHash 등)는 **절대 echo 하지 마세요**. 각 객체에는 머지용 **매칭 키만** 포함:

\`\`\`
{
  "meta": { "author"?, "tagline"? },
  "agents": [ { "id": "<매칭키 필수>", "role", "reads", "writes", "phaseClass", "escalation"?, "signals"?, "riskNote"?, "model"? } ],
  "levels": [ { "id", "name", "agentChain", "parallelInChain"?, "requiredArtifacts" } ],
  "triage": { "questions": [...], "rules": [...], "securityOverride"? },
  "artifacts": [ { "id": "<매칭키 필수>", "producer"?, "consumers", "location"?, "persist" } ],
  "controlFlow": { "gates": [ { "phase": "<매칭키 필수>", "description" } ], "hooks": [ { "file": "<매칭키>", "enforces" } ], "parallelGroups", "loops", "stateMachine"? },
  "warnings": [...], "provenance": {...}
}
\`\`\`

규칙:
- agents/artifacts 는 \`id\`, gates 는 \`phase\`, hooks 는 \`file\` 을 매칭 키로 **반드시** 포함.
- agents[].model 은 기존이 "unknown" 인 항목만 위 매트릭스 규칙대로 채우고, 아니면 생략.
- 채운 [AI] 필드는 provenance 에 {"경로": "ai"} 기록. 추출 실패는 warnings 에.
- **순수 JSON 만** (코드블록·설명 금지). **마지막 요소 뒤 쉼표(trailing comma) 절대 금지**, 모든 괄호/대괄호를 반드시 닫을 것.`
}

// ─────────────────────────────────────────────────────────────────────────────
// 레벨 추정용 프롬프트
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 레벨 추정(Dry-run)용 system prompt.
 *
 * AI 는 triage 구조를 보고 태스크가 L0~L3 중 어디에 해당하는지 추정한다.
 * Q 코드(Q1, Q4 등)는 사용자에게 노출하지 않고 자연어로만 설명한다.
 */
export function buildEstimateSystemPrompt(): string {
  return `당신은 소프트웨어 개발 작업 복잡도를 분석해 워크플로 레벨을 추정하는 전문가입니다.

## 절대 규칙
1. 응답은 **순수 JSON 만** — 설명 텍스트, 마크다운, 코드블록 금지.
2. Q 코드(Q1, Q2, Q3... 같은 식별자)를 응답에 직접 노출하지 말 것.
   answers 배열은 자연어로 작성한다. 예) "보안 요구사항 있음 → Yes" (Q 코드 없이).
3. 추정 근거는 rationale 에 명확하게.

## 출력 형식
{
  "level": "L0"|"L1"|"L2"|"L3",
  "answers": ["자연어 질문 요약 → 판단", ...],
  "rationale": "레벨 판단 근거 산문"
}`
}

/**
 * 레벨 추정(Dry-run)용 user prompt.
 *
 * 태스크 텍스트와 번들의 triage 구조(질문/규칙)를 함께 전달한다.
 * AI 는 질문에 답변하고 규칙에 따라 레벨을 추정한다.
 *
 * @param taskText - 태스크 설명 또는 두레이 태스크 URL/평문
 * @param triage - 번들의 HarnessTriage 구조 (질문 + 판정 규칙)
 */
export function buildEstimateUserPrompt(taskText: string, triage: HarnessTriage): string {
  const questionsText = triage.questions.length > 0
    ? triage.questions.map((q) => `- ${q.text} (${q.meaning})`).join('\n')
    : '(질문 정의 없음 — 태스크 내용만으로 복잡도를 직접 판단)'

  const rulesText = triage.rules.length > 0
    ? triage.rules.map((r) => `- 조건: ${r.when} → 레벨: ${r.then}`).join('\n')
    : '(판정 규칙 정의 없음 — 일반적인 소프트웨어 복잡도 기준으로 판단)'

  const securityNote = triage.securityOverride
    ? `\n## 보안 오버라이드 조건\n${triage.securityOverride}`
    : ''

  return `## 태스크 설명
${taskText}

## 판정 기준 질문
${questionsText}

## 레벨 판정 규칙
${rulesText}${securityNote}

## 요청
위 태스크를 판정 기준에 따라 분석해 레벨(L0~L3)을 추정하세요.
- answers: 각 판정 기준에 대한 답변을 자연어로 (Q 코드 노출 금지)
- level: 최종 추정 레벨
- rationale: 판단 근거 산문`
}
