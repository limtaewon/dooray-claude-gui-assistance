/**
 * pickEditTargets.ts — NL 명령 + HarnessModel → AI 편집 대상 relPath 추정
 *
 * AI 편집(HARNESS_AI_EDIT) 진입 시 "어느 파일을 컨텍스트로 보낼지"를 결정하는
 * 1차 휴리스틱 함수. AI 호출 없음, 순수 정적 텍스트 매칭.
 *
 * 매칭 전략 (arch.md §5.1):
 * 1. 에이전트명/ID 매칭 → AgentSourceMap 의 nameFile / modelFile / toolsFile
 * 2. 게이트 페이즈 키워드 매칭 → RawGate.scriptFile (arch.md 에서 RawGate 에 포함)
 *    단, HarnessModel 은 scriptFile 을 직접 노출하지 않으므로 여기서는 gate.phase 매칭 후
 *    controlFlow.gates 에 연결된 파일 경로를 sourceMap 외부 힌트로 처리.
 * 3. 모호 명령 → 빈 배열 반환 (폴백: 사용자가 raw 에디터에서 파일 직접 선택 유도)
 *
 * 반환:
 * - 추정된 relPath 배열 (중복 제거).
 * - 매칭 없으면 빈 배열.
 *
 * 제약:
 * - 이 파일은 순수 함수만 담는다. electron / Node fs / React 의존 금지.
 * - AgentSourceMap 은 선택 파라미터. 없으면 에이전트 파일 힌트 없이 동작.
 * - 결과는 HarnessEditService 가 targetRelPaths 화이트리스트로 추가 필터링한다.
 */

import type { HarnessModel } from '@shared/types/harness'
import type { AgentSourceMap } from '@shared/types/harness-edit'

// ─────────────────────────────────────────────
// 내부 유틸
// ─────────────────────────────────────────────

/**
 * 명령 텍스트를 소문자+공백 정규화하여 반환한다.
 * 괄호/따옴표 등 특수문자는 공백으로 치환한다.
 */
function normalizeCommand(command: string): string {
  return command.toLowerCase().replace(/[^\w가-힣\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * 에이전트 displayName / id 에서 매칭 가능한 후보 토큰 목록을 생성한다.
 *
 * 예) id='reined-bmad-developer', displayName='developer'
 *   → ['reined-bmad-developer', 'developer', 'reined', 'bmad', 'developer']
 */
function agentTokens(id: string, displayName: string): string[] {
  const tokens = new Set<string>()
  tokens.add(id.toLowerCase())
  tokens.add(displayName.toLowerCase())
  // id 의 '-' 구분 세그먼트도 개별 토큰으로 추가
  for (const seg of id.split('-')) {
    if (seg.length >= 2) tokens.add(seg.toLowerCase())
  }
  return [...tokens]
}

/**
 * 명령 텍스트에 토큰이 포함되어 있는지 검사한다.
 * 단어 경계 또는 공백/문장부호 경계를 고려한다.
 */
function commandContainsToken(normalizedCmd: string, token: string): boolean {
  // 토큰이 단어로 포함 여부 확인 (앞뒤가 비단어 문자 또는 시작/끝)
  // 한글 id 는 경계 없이 포함 여부로만 검사
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(?<![\\w가-힣])${escaped}(?![\\w가-힣])`, 'u')
  return re.test(normalizedCmd)
}

// ─────────────────────────────────────────────
// 게이트 페이즈 힌트 (scriptFile 이 HarnessModel 에 없으므로 fileTree 에서 추정)
// ─────────────────────────────────────────────

/**
 * fileTree 에서 게이트 스크립트 파일 경로를 추출한다.
 * gate.sh 패턴: `_hooks/*gate*.sh` 또는 `*gate*.sh`
 */
function extractGateScriptPaths(fileTree: string[]): string[] {
  return fileTree.filter((p) => {
    const lower = p.toLowerCase()
    return lower.endsWith('.sh') && lower.includes('gate')
  })
}

// ─────────────────────────────────────────────
// 공개 함수
// ─────────────────────────────────────────────

/**
 * NL 명령과 HarnessModel 을 보고 AI 편집 대상 파일의 relPath 배열을 추정한다.
 *
 * 매칭 우선순위:
 * 1. 에이전트 언급: 명령에 에이전트 id / displayName 이 포함되면
 *    해당 에이전트의 SourceMap 파일(modelFile/toolsFile/nameFile) 을 반환.
 * 2. 게이트 언급: '게이트', 'gate', phase 이름이 포함되면
 *    fileTree 에서 게이트 스크립트 경로를 반환.
 * 3. 명령이 범용 model/tools 키워드: 모든 에이전트 파일을 반환
 *    (단, 40KB 상한은 HarnessEditService 가 강제).
 * 4. 모호: 빈 배열 반환 → 사용자에게 파일 직접 선택 유도.
 *
 * @param command    사용자 NL 명령 텍스트 (한국어/영어 혼용 OK)
 * @param model      현재 HarnessModel
 * @param sourceMap  AgentSourceMap (없으면 파일 힌트 없이 동작)
 * @returns          추정 relPath 배열 (중복 제거, 빈 배열=모호)
 */
export function pickEditTargets(
  command: string,
  model: HarnessModel,
  sourceMap?: AgentSourceMap,
): string[] {
  const normCmd = normalizeCommand(command)
  const result = new Set<string>()

  // ── 1. 에이전트명 매칭 ────────────────────────
  for (const agent of model.agents) {
    const tokens = agentTokens(agent.id, agent.displayName)
    const matched = tokens.some((tok) => commandContainsToken(normCmd, tok))
    if (!matched) continue

    // SourceMap 파일 수집
    const src = sourceMap?.[agent.id]
    if (src) {
      result.add(src.nameFile)
      if (src.modelFile) result.add(src.modelFile)
      if (src.toolsFile) result.add(src.toolsFile)
    }
    // SourceMap 없어도 에이전트 언급은 감지됨 (결과가 비어있을 수 있음)
  }

  if (result.size > 0) return [...result]

  // ── 2. 게이트/페이즈 언급 ─────────────────────
  const gateKeywords = ['게이트', 'gate', '규칙', 'rule']
  const phaseNames = model.controlFlow.gates.map((g) => g.phase.toLowerCase())

  const gateHinted =
    gateKeywords.some((kw) => normCmd.includes(kw)) ||
    phaseNames.some((phase) => commandContainsToken(normCmd, phase))

  if (gateHinted) {
    const gateFiles = extractGateScriptPaths(model.meta.source ? [] : [])
    // model.meta.source 는 절대경로 — fileTree 에서 추정
    // HarnessModel 에 fileTree 가 없으므로 controlFlow.gates 의 scriptFile 을 사용할 수 없다.
    // 대신 RawBundle.fileTree 는 UI 컨텍스트에서 직접 넘길 수 있도록 별도 파라미터 오버로드를 제공한다.
    for (const gf of gateFiles) result.add(gf)
    // fileTree 없는 경우 빈 결과 → 폴백으로 진행
    if (result.size > 0) return [...result]
  }

  // ── 3. 범용 model/tools 키워드 ────────────────
  const genericKeywords = ['model', '모델', 'tools', '도구', 'allowed-tools']
  const isGenericEdit = genericKeywords.some((kw) => normCmd.includes(kw))

  if (isGenericEdit && sourceMap) {
    // 모든 에이전트의 파일 수집
    for (const agent of model.agents) {
      const src = sourceMap[agent.id]
      if (src) {
        result.add(src.nameFile)
        if (src.modelFile) result.add(src.modelFile)
        if (src.toolsFile) result.add(src.toolsFile)
      }
    }
    if (result.size > 0) return [...result]
  }

  // ── 4. 모호 → 빈 배열 ─────────────────────────
  return []
}

/**
 * fileTree 를 추가로 제공하는 오버로드.
 * 게이트 스크립트 파일 경로를 추정하기 위해 번들 fileTree 를 함께 전달한다.
 *
 * @param command    사용자 NL 명령 텍스트
 * @param model      현재 HarnessModel
 * @param sourceMap  AgentSourceMap
 * @param fileTree   번들 내 파일 상대경로 목록 (RawBundleSummary.fileTree)
 * @returns          추정 relPath 배열 (중복 제거)
 */
export function pickEditTargetsWithFileTree(
  command: string,
  model: HarnessModel,
  sourceMap: AgentSourceMap | undefined,
  fileTree: string[],
): string[] {
  const normCmd = normalizeCommand(command)
  const result = new Set<string>()

  // ── 1. 에이전트명 매칭 ────────────────────────
  for (const agent of model.agents) {
    const tokens = agentTokens(agent.id, agent.displayName)
    const matched = tokens.some((tok) => commandContainsToken(normCmd, tok))
    if (!matched) continue

    const src = sourceMap?.[agent.id]
    if (src) {
      result.add(src.nameFile)
      if (src.modelFile) result.add(src.modelFile)
      if (src.toolsFile) result.add(src.toolsFile)
    }
  }

  if (result.size > 0) return [...result]

  // ── 2. 게이트/페이즈 언급 ─────────────────────
  const gateKeywords = ['게이트', 'gate', '규칙', 'rule']
  const phaseNames = model.controlFlow.gates.map((g) => g.phase.toLowerCase())

  const gateHinted =
    gateKeywords.some((kw) => normCmd.includes(kw)) ||
    phaseNames.some((phase) => commandContainsToken(normCmd, phase))

  if (gateHinted) {
    const gateFiles = extractGateScriptPaths(fileTree)
    for (const gf of gateFiles) result.add(gf)
    if (result.size > 0) return [...result]
  }

  // ── 3. 범용 model/tools 키워드 ────────────────
  const genericKeywords = ['model', '모델', 'tools', '도구', 'allowed-tools']
  const isGenericEdit = genericKeywords.some((kw) => normCmd.includes(kw))

  if (isGenericEdit && sourceMap) {
    for (const agent of model.agents) {
      const src = sourceMap[agent.id]
      if (src) {
        result.add(src.nameFile)
        if (src.modelFile) result.add(src.modelFile)
        if (src.toolsFile) result.add(src.toolsFile)
      }
    }
    if (result.size > 0) return [...result]
  }

  // ── 4. 모호 → 빈 배열 ─────────────────────────
  return []
}
