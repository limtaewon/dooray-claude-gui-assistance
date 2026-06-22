/**
 * HarnessNormalizer — RawBundle → HarnessModel 정규화 파이프라인
 *
 * 처리 순서:
 *  1. RawBundle 의 정적([S]) 데이터로 HarnessModel 스켈레톤을 먼저 구성한다.
 *  2. AIService.normalizeHarness 를 호출해 비어있는 [AI] 필드만 보강한다.
 *  3. AI 응답을 스켈레톤과 머지할 때 [S] 필드를 절대 덮어쓰지 않는다 (ADR-001).
 *  4. 각 필드에 provenance('static'|'ai'|'inferred'|'absent') 를 기록한다.
 *  5. AI JSON 파싱 실패/부분 실패 시 크래시하지 않고 정적 스켈레톤만으로 축소 모델 + warnings 를 반환한다.
 *
 * AIService 는 constructor 에 주입해 테스트 시 모킹 가능하게 한다.
 *
 * 제약:
 * - electron app 의존 없음 (app.getPath 는 HarnessService/IPC 핸들러에만).
 * - runClaudeStream 분기 수정 금지 (AIService 의 분기 가이드 참조).
 */

import * as path from 'path'
import { promises as fs } from 'fs'
import type {
  HarnessModel,
  HarnessMeta,
  HarnessAgent,
  HarnessLevel,
  HarnessTriage,
  HarnessArtifact,
  HarnessControlFlow,
  Provenance,
  FieldSource,
  HarnessModelName,
  HarnessLevelId,
  TriageQuestion,
  TriageRule
} from '../../shared/types/harness'
import type { RawBundle, RawGate, RawHook } from './BundleScanner'
import { CURRENT_SCHEMA_VERSION } from './HarnessCache'
import { computeHarnessScore } from './computeScore'

// ─────────────────────────────────────────────
// AIService 인터페이스 (주입 추상화 — 테스트 모킹용)
// ─────────────────────────────────────────────

/**
 * HarnessNormalizer 가 사용하는 AIService 의 최소 인터페이스.
 * 실제 AIService 의 메서드 시그니처와 일치해야 한다.
 *
 * 테스트에서는 이 인터페이스를 구현한 mock 을 주입한다.
 */
export interface IAIServiceForNormalizer {
  normalizeHarness(
    skeleton: Partial<HarnessModel>,
    rawBundleText: string,
    requestId?: string
  ): Promise<HarnessModel>
}

// ─────────────────────────────────────────────
// 스켈레톤 빌드 헬퍼
// ─────────────────────────────────────────────

/**
 * RawBundle 에서 HarnessMeta 스켈레톤을 구성한다 ([S] 필드만).
 * author/tagline 은 AI 몫이므로 포함하지 않는다.
 */
function buildMetaSkeleton(raw: RawBundle): HarnessMeta {
  return {
    name: path.basename(raw.bundlePath),
    source: raw.bundlePath,
    bundleHash: raw.bundleHash,
    kind: raw.kind,
    ...(raw.version !== undefined ? { version: raw.version } : {}),
  }
}

/**
 * RawBundle 의 agentStubs 에서 HarnessAgent 목록 스켈레톤을 구성한다.
 *
 * 정적으로 알 수 있는 필드: id, displayName, model, modelSource, tools.
 * AI 필드(role, reads, writes, phaseClass, escalation, signals, riskNote) 는 빈 값으로 채워두고
 * provenance 에 'absent' 를 기록한다.
 */
function buildAgentsSkeleton(raw: RawBundle): HarnessAgent[] {
  return raw.agentStubs.map((stub) => ({
    id: stub.id,
    displayName: stub.displayName,
    model: stub.model,
    modelSource: stub.modelSource,
    tools: stub.tools,
    // AI 필드 — 빈 값, AI 가 채울 것
    role: '',
    reads: [],
    writes: [],
  }))
}

/** 스켈레톤용 내부 게이트 타입 — [S] 필드를 보호하기 위해 RawGate 를 그대로 사용 */
type SkeletonGate = RawGate
/** 스켈레톤용 내부 훅 타입 — [S] 필드를 보호하기 위해 RawHook 을 그대로 사용 */
type SkeletonHook = RawHook

/** 스켈레톤 controlFlow 의 내부 타입 — RawGate/RawHook 으로 확장 필드 포함 */
interface SkeletonControlFlow extends Omit<HarnessControlFlow, 'gates' | 'hooks'> {
  gates: SkeletonGate[]
  hooks: SkeletonHook[]
}

/** 스켈레톤 내부 타입 — controlFlow 에 SkeletonControlFlow 를 사용 */
type HarnessModelSkeleton = Omit<Partial<HarnessModel>, 'controlFlow'> & {
  controlFlow?: SkeletonControlFlow
}

/**
 * 정적 게이트/훅 정보로 HarnessControlFlow 스켈레톤을 구성한다.
 *
 * gates: phase/ruleCodes/blocking/scriptFile 은 정적 ([S]).
 * hooks: file/event/absolutePath 는 정적 ([S] 또는 [S→AI]).
 * parallelGroups, loops, signalEnum, stateMachine 은 AI 몫 (빈 값).
 */
function buildControlFlowSkeleton(raw: RawBundle): SkeletonControlFlow {
  return {
    gates: raw.gates.map((g) => ({ ...g })),
    hooks: raw.hooks.map((h) => ({ ...h })),
    parallelGroups: [],
    loops: [],
  }
}

/**
 * _templates 정보에서 HarnessArtifact 스켈레톤을 구성한다.
 * id/template 은 정적 ([S]).
 * producer/consumers/location/persist 는 AI 몫.
 */
function buildArtifactsSkeleton(raw: RawBundle): HarnessArtifact[] {
  return raw.templates.map((t) => ({
    id: t.stem,
    consumers: [],
    persist: 'unknown' as const,
    template: {
      frontmatter: t.frontmatterKeys,
      sections: t.sections,
    },
  }))
}

/**
 * 스켈레톤 전체의 provenance 초기값을 구성한다.
 *
 * [S] 필드: 'static'
 * [AI] 필드(아직 빈 값): 'absent' (아직 채워지지 않음을 명시)
 */
function buildInitialProvenance(skeleton: HarnessModelSkeleton): Provenance {
  const p: Provenance = {}

  // meta [S] 필드
  p['meta.name'] = 'static'
  p['meta.source'] = 'static'
  p['meta.bundleHash'] = 'static'
  p['meta.kind'] = 'static'
  if (skeleton.meta?.version !== undefined) p['meta.version'] = 'static'
  // meta [AI] 필드
  p['meta.author'] = 'absent'
  p['meta.tagline'] = 'absent'

  // agents [S] 필드
  if (skeleton.agents) {
    skeleton.agents.forEach((agent, i) => {
      p[`agents[${i}].id`] = 'static'
      p[`agents[${i}].displayName`] = 'static'
      p[`agents[${i}].model`] = agent.modelSource as FieldSource
      p[`agents[${i}].modelSource`] = 'static'
      p[`agents[${i}].tools`] = 'static'
      // [AI] 필드
      p[`agents[${i}].role`] = 'absent'
      p[`agents[${i}].reads`] = 'absent'
      p[`agents[${i}].writes`] = 'absent'
      p[`agents[${i}].phaseClass`] = 'absent'
    })
  }

  // controlFlow [S] 필드
  if (skeleton.controlFlow) {
    skeleton.controlFlow.gates.forEach((_, i) => {
      p[`controlFlow.gates[${i}].phase`] = 'static'
      p[`controlFlow.gates[${i}].ruleCodes`] = 'static'
      p[`controlFlow.gates[${i}].blocking`] = 'static'
      p[`controlFlow.gates[${i}].description`] = 'absent'
    })
    skeleton.controlFlow.hooks.forEach((h, i) => {
      p[`controlFlow.hooks[${i}].file`] = 'static'
      p[`controlFlow.hooks[${i}].event`] = h.event !== undefined ? 'static' : 'absent'
      p[`controlFlow.hooks[${i}].enforces`] = 'absent'
    })
  }

  // artifacts [S] 필드
  if (skeleton.artifacts) {
    skeleton.artifacts.forEach((_, i) => {
      p[`artifacts[${i}].id`] = 'static'
      p[`artifacts[${i}].template`] = 'static'
      p[`artifacts[${i}].producer`] = 'absent'
      p[`artifacts[${i}].consumers`] = 'absent'
      p[`artifacts[${i}].persist`] = 'absent'
    })
  }

  // levels, triage — 전부 AI 몫
  p['levels'] = 'absent'
  p['triage'] = 'absent'
  p['score'] = 'absent'

  return p
}

// ─────────────────────────────────────────────
// 번들 텍스트 수집 (AI 에 전달할 원문)
// ─────────────────────────────────────────────

/** AI 정규화 프롬프트에 포함할 파일 목록 우선순위 패턴 */
const PRIORITY_PATTERNS = [
  /^README/i,
  /^GUIDE/i,
  /^CHANGELOG/i,
  /_core\//,
  /_agents\//,
  /SKILL\.md$/,
  /_templates\//,
  /_hooks\//,
  /signals\.md$/,
  /triage\.md$/,
  /concepts\.md$/,
  /loop\.md$/,
]

/** 번들 내 주요 파일 내용을 합쳐 AI 프롬프트용 텍스트를 만든다.
 *  총 크기를 약 60KB 이하로 제한해 토큰 낭비를 방지한다.
 */
async function collectBundleText(
  bundlePath: string,
  fileTree: string[],
  maxBytes = 60 * 1024
): Promise<string> {
  // 우선순위 점수 계산
  const scored = fileTree.map((relPath) => {
    let score = 0
    for (let i = 0; i < PRIORITY_PATTERNS.length; i++) {
      if (PRIORITY_PATTERNS[i].test(relPath)) {
        score = PRIORITY_PATTERNS.length - i
        break
      }
    }
    return { relPath, score }
  })
  scored.sort((a, b) => b.score - a.score || a.relPath.localeCompare(b.relPath))

  const parts: string[] = []
  let totalBytes = 0

  for (const { relPath } of scored) {
    if (totalBytes >= maxBytes) break
    try {
      const content = await fs.readFile(path.join(bundlePath, relPath), 'utf-8')
      const header = `\n### ${relPath}\n`
      const chunk = header + content
      if (totalBytes + chunk.length > maxBytes) {
        // 남은 공간만큼 잘라서 추가
        const remaining = maxBytes - totalBytes
        parts.push(chunk.slice(0, remaining) + '\n...(truncated)')
        totalBytes = maxBytes
        break
      }
      parts.push(chunk)
      totalBytes += chunk.length
    } catch {
      // 파일 읽기 실패 시 스킵
    }
  }

  return parts.join('\n')
}

// ─────────────────────────────────────────────
// AI 출력 enum 화이트리스트 검증
// ─────────────────────────────────────────────

/** agents[].model 허용 값 (HarnessModelName 과 동일) */
const VALID_AGENT_MODELS: readonly HarnessModelName[] = ['haiku', 'sonnet', 'opus', 'unknown']

/** artifacts[].persist 허용 값 (HarnessArtifact.persist 와 동일) */
const VALID_PERSIST_VALUES: readonly HarnessArtifact['persist'][] = ['git', 'ignore', 'dooray', 'unknown']

/** levels[].id / triage rule then 허용 값 (HarnessLevelId 와 동일) */
const VALID_LEVEL_IDS: readonly HarnessLevelId[] = ['L0', 'L1', 'L2', 'L3']

/**
 * AI 가 반환한 agent model 값을 화이트리스트로 검증한다.
 * 벗어나면 'unknown' 으로 안전화하고 warnings 에 기록한다.
 */
function sanitizeAgentModel(value: unknown, agentId: string, warnings: string[]): HarnessModelName {
  if (VALID_AGENT_MODELS.includes(value as HarnessModelName)) {
    return value as HarnessModelName
  }
  warnings.push(`AI 출력 검증: agents[id=${agentId}].model 값 "${String(value)}" 이 화이트리스트에 없어 'unknown' 으로 대체됨`)
  return 'unknown'
}

/**
 * AI 가 반환한 artifact persist 값을 화이트리스트로 검증한다.
 * 벗어나면 'unknown' 으로 안전화하고 warnings 에 기록한다.
 */
function sanitizePersist(value: unknown, artifactId: string, warnings: string[]): HarnessArtifact['persist'] {
  if (VALID_PERSIST_VALUES.includes(value as HarnessArtifact['persist'])) {
    return value as HarnessArtifact['persist']
  }
  warnings.push(`AI 출력 검증: artifacts[id=${artifactId}].persist 값 "${String(value)}" 이 화이트리스트에 없어 'unknown' 으로 대체됨`)
  return 'unknown'
}

/**
 * AI 가 반환한 level id 를 화이트리스트로 검증한다.
 * 벗어나면 null 반환 — 호출자가 드롭 처리한다.
 */
function validateLevelId(value: unknown): HarnessLevelId | null {
  if (VALID_LEVEL_IDS.includes(value as HarnessLevelId)) {
    return value as HarnessLevelId
  }
  return null
}

/**
 * 배열이어야 할 필드가 비배열이면 빈 배열로 안전화한다.
 * 호출부에서 타입을 명시적으로 지정해야 한다.
 */
function ensureArray<T>(value: T[] | undefined | null | unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

// ─────────────────────────────────────────────
// AI 응답 머지 — [S] 필드 보호
// ─────────────────────────────────────────────

/**
 * AI 가 반환한 HarnessModel 과 정적 스켈레톤을 머지한다.
 *
 * ADR-001 머지 계약:
 * - [S] 필드(정적으로 채워진 것)는 절대 AI 응답 값으로 덮어쓰지 않는다.
 * - [AI] 필드(스켈레톤에서 빈 값이었던 것)는 AI 응답 값으로 채운다.
 * - provenance 를 업데이트한다: AI 가 채운 필드는 'ai' 로 표시.
 *
 * @param skeleton - 정적으로 채워진 스켈레톤 (보호 대상)
 * @param aiResult - AI 가 반환한 HarnessModel
 * @returns 머지된 HarnessModel
 */
function mergeWithStatic(
  skeleton: HarnessModelSkeleton,
  aiResult: HarnessModel,
  baseProvenance: Provenance
): HarnessModel {
  const provenance: Provenance = { ...baseProvenance }
  // AI 출력 검증 경고 누적 — 머지 완료 후 warnings 에 합산
  const aiValidationWarnings: string[] = []

  // 배열이어야 할 최상위 필드 안전화 — AI 가 잘못된 타입으로 채운 경우
  const safeAIAgents = ensureArray<HarnessAgent>(aiResult.agents)
  const safeAILevels = ensureArray<HarnessLevel>(aiResult.levels)
  const safeAIArtifacts = ensureArray<HarnessArtifact>(aiResult.artifacts)
  const safeAITriageQuestions = ensureArray<TriageQuestion>(aiResult.triage?.questions)
  const safeAITriageRules = ensureArray<TriageRule>(aiResult.triage?.rules)

  // ── meta 머지 ──────────────────────────────
  const meta: HarnessMeta = {
    // [S] 필드 — skeleton 값 우선 (덮어쓰기 금지)
    name: skeleton.meta!.name,
    source: skeleton.meta!.source,
    bundleHash: skeleton.meta!.bundleHash,
    kind: skeleton.meta!.kind,
    // [S] optional
    ...(skeleton.meta?.version !== undefined ? { version: skeleton.meta.version } : {}),
    // [AI] 필드 — AI 응답에서 채움
    ...(aiResult.meta?.author ? { author: aiResult.meta.author } : {}),
    ...(aiResult.meta?.tagline ? { tagline: aiResult.meta.tagline } : {}),
  }
  if (aiResult.meta?.author) provenance['meta.author'] = 'ai'
  if (aiResult.meta?.tagline) provenance['meta.tagline'] = 'ai'

  // ── agents 머지 ────────────────────────────
  // 스켈레톤 에이전트를 기준으로 AI 가 같은 id 의 에이전트를 반환했으면 [AI] 필드를 채운다.
  const aiAgentMap = new Map(safeAIAgents.map((a) => [a.id, a]))
  const agents: HarnessAgent[] = (skeleton.agents ?? []).map((stub, i) => {
    const aiAgent = aiAgentMap.get(stub.id)
    // model 병합 규칙:
    // - 정적으로 확정된 model(frontmatter/matrix, modelSource !== 'absent')은 [S] 라 덮어쓰지 않는다.
    // - 정적으로 못 찾은 경우(modelSource === 'absent', model='unknown')에 한해 AI 가 채운다.
    //   neon-bmad 처럼 frontmatter 에 model 이 없고 _core/models.md 매트릭스로 관리하는 번들 대응.
    const aiFilledModel =
      stub.modelSource === 'absent' && aiAgent?.model
        ? sanitizeAgentModel(aiAgent.model, stub.id, aiValidationWarnings)
        : null
    const useAIModel = aiFilledModel !== null && aiFilledModel !== 'unknown'
    const merged: HarnessAgent = {
      // [S] 필드 — 덮어쓰기 금지
      id: stub.id,
      displayName: stub.displayName,
      model: useAIModel ? aiFilledModel : stub.model,
      modelSource: useAIModel ? 'ai' : stub.modelSource,
      tools: stub.tools,
      // [AI] 필드 — AI 에서 채움 (없으면 빈 값 유지)
      role: aiAgent?.role || '',
      reads: ensureArray<string>(aiAgent?.reads),
      writes: ensureArray<string>(aiAgent?.writes),
      ...(aiAgent?.phaseClass ? { phaseClass: aiAgent.phaseClass } : {}),
      ...(aiAgent?.escalation ? { escalation: aiAgent.escalation } : {}),
      ...(aiAgent?.signals ? { signals: aiAgent.signals } : {}),
      ...(aiAgent?.riskNote ? { riskNote: aiAgent.riskNote } : {}),
    }
    if (useAIModel) provenance[`agents[${i}].model`] = 'ai'
    if (aiAgent?.role) provenance[`agents[${i}].role`] = 'ai'
    if (aiAgent?.reads && ensureArray<string>(aiAgent.reads).length) provenance[`agents[${i}].reads`] = 'ai'
    if (aiAgent?.writes && ensureArray<string>(aiAgent.writes).length) provenance[`agents[${i}].writes`] = 'ai'
    if (aiAgent?.phaseClass) provenance[`agents[${i}].phaseClass`] = 'ai'
    if (aiAgent?.escalation) provenance[`agents[${i}].escalation`] = 'ai'
    if (aiAgent?.signals) provenance[`agents[${i}].signals`] = 'ai'
    if (aiAgent?.riskNote) provenance[`agents[${i}].riskNote`] = 'ai'
    return merged
  })

  // AI 가 스켈레톤에 없던 새 에이전트를 추가한 경우 — 포함 (AI 가 산문에서 발견한 에이전트)
  // 단, AI 가 반환한 에이전트라도 이미 skeleton 에 있는 것은 위에서 처리됐으므로 새 것만.
  // 새 에이전트의 model 필드도 화이트리스트 검증 적용.
  const skeletonIds = new Set((skeleton.agents ?? []).map((a) => a.id))
  for (const aiAgent of safeAIAgents) {
    if (!skeletonIds.has(aiAgent.id)) {
      const sanitizedModel = sanitizeAgentModel(aiAgent.model, aiAgent.id, aiValidationWarnings)
      agents.push({ ...aiAgent, model: sanitizedModel })
      const idx = agents.length - 1
      provenance[`agents[${idx}].id`] = 'ai'
      provenance[`agents[${idx}].role`] = 'ai'
    }
  }

  // ── levels — 전부 AI 몫, id 화이트리스트 검증 ──────────────────────────────
  // L0~L3 외의 id 를 가진 레벨은 드롭 + warning
  const levels: HarnessLevel[] = []
  let levelIdx = 0
  for (const l of safeAILevels) {
    const validId = validateLevelId(l.id)
    if (validId === null) {
      aiValidationWarnings.push(`AI 출력 검증: levels[].id 값 "${String(l.id)}" 이 L0~L3 범위 밖이어서 드롭됨`)
      continue
    }
    provenance[`levels[${levelIdx}].id`] = 'ai'
    provenance[`levels[${levelIdx}].name`] = 'ai'
    provenance[`levels[${levelIdx}].agentChain`] = 'ai'
    levels.push({ ...l, id: validId })
    levelIdx++
  }

  // ── triage — 전부 AI 몫, rules[].then 화이트리스트 검증 ───────────────────
  // rules[].then 이 L0~L3 밖이면 해당 rule 드롭 + warning
  const safeRules = safeAITriageRules.filter((r) => {
    const validThen = validateLevelId((r as { then?: unknown }).then)
    if (validThen === null) {
      aiValidationWarnings.push(`AI 출력 검증: triage.rules[].then 값 "${String((r as { then?: unknown }).then)}" 이 L0~L3 범위 밖이어서 해당 규칙 드롭됨`)
      return false
    }
    return true
  })
  const triage: HarnessTriage = aiResult.triage
    ? { ...aiResult.triage, questions: safeAITriageQuestions, rules: safeRules }
    : { questions: [], rules: [] }
  if (aiResult.triage) {
    provenance['triage.questions'] = 'ai'
    provenance['triage.rules'] = 'ai'
    if (aiResult.triage.securityOverride) provenance['triage.securityOverride'] = 'ai'
  }

  // ── artifacts 머지 ─────────────────────────
  // 스켈레톤 artifact(템플릿 파일 기반)는 [S] 필드(id, template) 보호.
  const aiArtifactMap = new Map(safeAIArtifacts.map((a) => [a.id, a]))
  const skeletonArtifacts: HarnessArtifact[] = (skeleton.artifacts ?? []).map((sa, i) => {
    const aiArt = aiArtifactMap.get(sa.id)
    // [AI] persist 화이트리스트 검증 — 허용 값 밖이면 'unknown' 대체
    const safePersist = aiArt?.persist !== undefined
      ? sanitizePersist(aiArt.persist, sa.id, aiValidationWarnings)
      : 'unknown'
    const merged: HarnessArtifact = {
      // [S] 필드
      id: sa.id,
      template: sa.template,
      // [AI] 필드
      consumers: ensureArray<string>(aiArt?.consumers),
      persist: safePersist,
      ...(aiArt?.producer ? { producer: aiArt.producer } : {}),
      ...(aiArt?.location ? { location: aiArt.location } : {}),
    }
    if (aiArt?.producer) provenance[`artifacts[${i}].producer`] = 'ai'
    if (ensureArray<string>(aiArt?.consumers).length) provenance[`artifacts[${i}].consumers`] = 'ai'
    if (safePersist !== 'unknown') provenance[`artifacts[${i}].persist`] = 'ai'
    if (aiArt?.location) provenance[`artifacts[${i}].location`] = 'ai'
    return merged
  })
  // AI 가 템플릿 없는 산출물을 추가한 경우 포함
  const skeletonArtifactIds = new Set((skeleton.artifacts ?? []).map((a) => a.id))
  for (const aiArt of safeAIArtifacts) {
    if (!skeletonArtifactIds.has(aiArt.id)) {
      const safePersist = sanitizePersist(aiArt.persist, aiArt.id, aiValidationWarnings)
      skeletonArtifacts.push({ ...aiArt, persist: safePersist })
      const idx = skeletonArtifacts.length - 1
      provenance[`artifacts[${idx}].id`] = 'ai'
    }
  }

  // ── controlFlow 머지 ──────────────────────
  const aiGates = aiResult.controlFlow?.gates ?? []
  const aiGateMap = new Map(aiGates.map((g) => [g.phase, g]))
  const gates = (skeleton.controlFlow?.gates ?? []).map((sg, i) => {
    const aiGate = aiGateMap.get(sg.phase)
    const merged = {
      // [S] 필드
      phase: sg.phase,
      ruleCodes: sg.ruleCodes,
      ...(sg.ruleDetails ? { ruleDetails: sg.ruleDetails } : {}),
      blocking: sg.blocking,
      scriptFile: sg.scriptFile,
      // [AI] 필드
      ...(aiGate?.description ? { description: aiGate.description } : {}),
    }
    if (aiGate?.description) provenance[`controlFlow.gates[${i}].description`] = 'ai'
    return merged
  })

  const aiHooks = aiResult.controlFlow?.hooks ?? []
  const aiHookMap = new Map(aiHooks.map((h) => [h.file, h]))
  const hooks = (skeleton.controlFlow?.hooks ?? []).map((sh, i) => {
    const aiHook = aiHookMap.get(sh.file)
    const merged = {
      // [S] 필드
      file: sh.file,
      absolutePath: sh.absolutePath,
      event: sh.event ?? aiHook?.event,  // [S→AI]: 정적 없으면 AI 에서
      // [AI] 필드
      ...(aiHook?.enforces ? { enforces: aiHook.enforces } : {}),
    }
    if (!sh.event && aiHook?.event) provenance[`controlFlow.hooks[${i}].event`] = 'ai'
    if (aiHook?.enforces) provenance[`controlFlow.hooks[${i}].enforces`] = 'ai'
    return merged
  })

  const controlFlow: HarnessControlFlow = {
    gates,
    hooks,
    parallelGroups: aiResult.controlFlow?.parallelGroups ?? [],
    loops: aiResult.controlFlow?.loops ?? [],
    ...(aiResult.controlFlow?.signalEnum ? { signalEnum: aiResult.controlFlow.signalEnum } : {}),
    ...(aiResult.controlFlow?.stateMachine ? { stateMachine: aiResult.controlFlow.stateMachine } : {}),
  }
  if (aiResult.controlFlow?.parallelGroups?.length) provenance['controlFlow.parallelGroups'] = 'ai'
  if (aiResult.controlFlow?.loops?.length) provenance['controlFlow.loops'] = 'ai'
  if (aiResult.controlFlow?.signalEnum) provenance['controlFlow.signalEnum'] = 'ai'
  if (aiResult.controlFlow?.stateMachine) provenance['controlFlow.stateMachine'] = 'ai'

  // ── score — 구조 기반 결정론 계산 (AI 추정 아님) ──────────
  // 6축은 정량 신호(게이트/hook/loops/레벨/상태기계 등)로 매길 수 있으므로
  // 모델 구조에서 직접 계산한다. 매 실행 동일·근거(note) 명확. AI score 는 무시.
  const score = computeHarnessScore({ agents, levels, artifacts: skeletonArtifacts, controlFlow })
  provenance['score'] = 'inferred'

  if (aiResult.overlay) {
    provenance['overlay'] = 'ai'
  }

  // ── warnings 합산 ─────────────────────────
  const warnings = [
    ...(skeleton.warnings ?? []),
    ...(aiResult.warnings ?? []),
    ...aiValidationWarnings,
  ]

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta,
    agents,
    levels,
    triage,
    artifacts: skeletonArtifacts,
    controlFlow,
    score,
    ...(aiResult.overlay ? { overlay: aiResult.overlay } : {}),
    warnings,
    provenance,
  }
}

// ─────────────────────────────────────────────
// HarnessNormalizer 클래스
// ─────────────────────────────────────────────

/**
 * RawBundle → HarnessModel 정규화 파이프라인.
 *
 * 1. RawBundle 을 정적 스켈레톤으로 변환한다.
 * 2. AIService.normalizeHarness 로 [AI] 필드를 보강한다.
 * 3. ADR-001 머지 계약에 따라 [S] 필드를 보호하며 머지한다.
 * 4. AI 파싱 실패 시 정적 스켈레톤 + warnings 로 축소 모델을 반환한다.
 */
export class HarnessNormalizer {
  constructor(private readonly aiService: IAIServiceForNormalizer) {}

  /**
   * RawBundle 을 HarnessModel 로 정규화한다.
   *
   * - 정적 스켈레톤을 먼저 구성한다.
   * - AIService.normalizeHarness 를 호출해 [AI] 필드를 보강한다.
   * - AI 응답 파싱 실패 시 정적 스켈레톤만으로 축소 모델을 반환한다 (크래시 금지).
   * - requestId 를 전달하면 AI_PROGRESS 이벤트로 진행률이 emit 된다.
   *
   * @param raw - BundleScanner.scan() 결과
   * @param requestId - 진행률 이벤트 구분 ID (선택)
   * @returns 정규화된 HarnessModel
   */
  async normalize(raw: RawBundle, requestId?: string): Promise<HarnessModel> {
    // ── 1. 정적 스켈레톤 구성 ─────────────────
    const metaSkeleton = buildMetaSkeleton(raw)
    const agentsSkeleton = buildAgentsSkeleton(raw)
    const controlFlowSkeleton = buildControlFlowSkeleton(raw)
    const artifactsSkeleton = buildArtifactsSkeleton(raw)

    const skeleton: HarnessModelSkeleton = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      meta: metaSkeleton,
      agents: agentsSkeleton,
      levels: [],
      triage: { questions: [], rules: [] },
      artifacts: artifactsSkeleton,
      controlFlow: controlFlowSkeleton,
      warnings: [...raw.warnings],
      provenance: {},
    }

    const baseProvenance = buildInitialProvenance(skeleton)
    skeleton.provenance = baseProvenance

    // 폴백 반환 시 controlFlow 를 HarnessControlFlow 로 변환하는 헬퍼
    const toHarnessControlFlow = (cf: SkeletonControlFlow): HarnessControlFlow => ({
      gates: cf.gates.map(({ phase, ruleCodes, blocking, description }) => ({
        phase,
        ruleCodes,
        blocking,
        ...(description ? { description } : {}),
      })),
      hooks: cf.hooks.map(({ file, event, enforces }) => ({
        file,
        ...(event ? { event } : {}),
        ...(enforces ? { enforces } : {}),
      })),
      parallelGroups: cf.parallelGroups,
      loops: cf.loops,
      ...(cf.signalEnum ? { signalEnum: cf.signalEnum } : {}),
      ...(cf.stateMachine ? { stateMachine: cf.stateMachine } : {}),
    })

    // ── 2. 번들 원문 수집 ─────────────────────
    let rawBundleText = ''
    try {
      rawBundleText = await collectBundleText(raw.bundlePath, raw.fileTree)
    } catch (err) {
      const msg = `번들 원문 수집 실패 — AI 정규화 없이 정적 스켈레톤만 반환: ${err instanceof Error ? err.message : String(err)}`
      return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        meta: metaSkeleton,
        agents: agentsSkeleton,
        levels: [],
        triage: { questions: [], rules: [] },
        artifacts: artifactsSkeleton,
        controlFlow: toHarnessControlFlow(controlFlowSkeleton),
        warnings: [...raw.warnings, msg],
        provenance: baseProvenance,
      }
    }

    // ── 3. AI 정규화 호출 ─────────────────────
    let aiResult: HarnessModel
    try {
      // AIService 에 전달할 skeleton 은 Partial<HarnessModel> 로 변환 (호환성)
      const skeletonForAI: Partial<HarnessModel> = {
        ...skeleton,
        controlFlow: toHarnessControlFlow(controlFlowSkeleton),
      }
      aiResult = await this.aiService.normalizeHarness(skeletonForAI, rawBundleText, requestId)
    } catch (err) {
      // AI 호출 실패 — 정적 스켈레톤만으로 축소 반환 (크래시 금지)
      const msg = `AI 정규화 호출 실패 — 정적 스켈레톤만 반환: ${err instanceof Error ? err.message : String(err)}`
      return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        meta: metaSkeleton,
        agents: agentsSkeleton,
        levels: [],
        triage: { questions: [], rules: [] },
        artifacts: artifactsSkeleton,
        controlFlow: toHarnessControlFlow(controlFlowSkeleton),
        warnings: [...raw.warnings, msg],
        provenance: baseProvenance,
      }
    }

    // ── 4. [S] 필드 보호 머지 ─────────────────
    // AI 결과와 스켈레톤을 머지할 때 [S] 필드를 절대 덮어쓰지 않는다 (ADR-001).
    const merged = mergeWithStatic(skeleton, aiResult, baseProvenance)
    return merged
  }
}
