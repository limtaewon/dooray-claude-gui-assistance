/**
 * editMap.ts — HarnessModel + AgentSourceMap → 필드별 편집 가능 여부 및 대상 파일 매핑
 *
 * ADR-harness-studio-edit-003(구조화 폼 편집 범위)의 매핑 표를 결정론적 코드로 구현한다.
 * 이 모듈은 순수 함수만 담는다. electron / Node fs / React 의존 금지.
 *
 * 반환 구조 `EditFieldEntry` 를 보고 UI 는 다음을 결정한다:
 * - mode='form'  → 구조화 폼 컨트롤(드롭다운/멀티셀렉트) 표시 + 편집 가능
 * - mode='raw'   → "raw 에디터로 편집" 안내 + 대상 파일 링크
 * - mode='ai'    → "AI 명령으로 편집" 안내 + AI 편집 진입 버튼
 * - mode='lock'  → 편집 금지 배지 + 사유 표시
 *
 * 편집 모드가 OFF 이면 이 함수를 아예 호출하지 않는다(회귀 0).
 *
 * 제약:
 * - AgentSourceMap 이 없거나 특정 에이전트 항목이 없어도 graceful degradation.
 *   (model/tools 가 어느 파일에서 왔는지 모르면 mode='lock' 으로 폴백)
 * - relPath 는 항상 POSIX 슬래시('/') 기준.
 */

import type { HarnessModel } from '@shared/types/harness'
import type { AgentSourceMap } from '@shared/types/harness-edit'

// ─────────────────────────────────────────────
// 반환 타입
// ─────────────────────────────────────────────

/**
 * 단일 필드에 대한 편집 메타 정보.
 * UI 는 이 항목 하나를 받아 해당 필드 옆 컨트롤/배지를 렌더링한다.
 */
export interface EditFieldEntry {
  /**
   * HarnessModel 내 필드 경로 (JSON Path 스타일).
   * 예) 'agents[0].model', 'agents[1].tools', 'score'
   */
  fieldPath: string
  /**
   * 사용자에게 보여줄 필드 레이블 (한국어).
   * 예) 'developer — 모델', 'qa — 도구 목록'
   */
  label: string
  /**
   * 현재 값 (표시용). 문자열 또는 문자열 배열.
   * form 컨트롤의 초기값으로도 사용된다.
   */
  currentValue: string | string[]
  /**
   * 편집 경로 분류.
   * - 'form' : 구조화 폼 컨트롤(드롭다운/멀티셀렉트)로 편집 가능
   * - 'raw'  : raw 파일 에디터로만 편집 가능
   * - 'ai'   : AI 명령으로만 편집 가능 (역매핑 불가)
   * - 'lock' : 편집 금지 (id rename 위험 / score 재계산)
   */
  mode: 'form' | 'raw' | 'ai' | 'lock'
  /**
   * form/raw 모드일 때 대상 파일 정보.
   * mode='ai'|'lock' 이면 undefined.
   */
  target?: {
    /**
     * 편집이 적용될 파일 상대경로 (번들 루트 기준 POSIX).
     * applyFieldEdit 의 입력으로 사용된다.
     */
    relPath: string
    /**
     * 파일 내 치환 대상 YAML 키 이름.
     * 예) 'model', 'tools', 'allowed-tools'
     * raw 모드이면 undefined (파일 전체 편집).
     */
    locator?: string
  }
  /**
   * 편집 불가/제한 사유 (한국어). mode='lock'|'ai'|'raw' 일 때 UI 툴팁/안내에 표시한다.
   * mode='form' 이면 undefined.
   */
  reason?: string
}

/**
 * HarnessModel 전체에 대한 편집 매핑 결과.
 * fieldPath → EditFieldEntry 인덱스로 편의 조회 가능.
 */
export interface EditMap {
  /** 모든 편집 가능/불가 필드 항목 목록 (순서: agents 먼저, 이후 score/meta/controlFlow) */
  entries: EditFieldEntry[]
  /**
   * 구조화 폼으로 편집 가능한 항목 수.
   * StructuredFieldForm 의 "편집 가능 N개" 카운터에 사용한다.
   */
  formEditableCount: number
}

// ─────────────────────────────────────────────
// 매핑 상수
// ─────────────────────────────────────────────

/** model 드롭다운에 표시할 허용값 */
export const MODEL_OPTIONS = ['haiku', 'sonnet', 'opus'] as const

// ─────────────────────────────────────────────
// 핵심 함수
// ─────────────────────────────────────────────

/**
 * HarnessModel 과 AgentSourceMap 을 받아 각 필드의 편집 가능 여부 및 대상 파일 매핑을 반환한다.
 *
 * ADR-003 매핑 표 결정:
 * - agents[].model  → [FORM] SourceMap.modelFile 또는 nameFile 의 'model' 키
 * - agents[].tools  → [FORM] SourceMap.toolsFile 또는 nameFile 의 'tools'/'allowed-tools' 키
 * - agents[].id     → [LOCK] id 변경은 참조 파급 위험
 * - agents[].role 등 AI 해석값 → [AI]
 * - score           → [LOCK] 구조에서 결정론 재계산
 * - controlFlow.gates/hooks → [RAW] 스크립트 텍스트
 * - artifacts[].template → [RAW] 템플릿 파일
 * - meta.author/tagline  → [RAW] README 산문
 *
 * @param model   HarnessNormalizer 가 반환한 모델
 * @param sourceMap BundleScanner 가 채운 출처 파일 인덱스 (없으면 빈 객체)
 * @returns EditMap
 */
export function buildEditMap(model: HarnessModel, sourceMap: AgentSourceMap): EditMap {
  const entries: EditFieldEntry[] = []

  // ── 에이전트 필드 ──────────────────────────────
  for (let i = 0; i < model.agents.length; i++) {
    const agent = model.agents[i]
    const agentSrc = sourceMap[agent.id]

    // [LOCK] agents[].id — rename 은 levels/artifacts 참조 파급으로 별도 기능
    entries.push({
      fieldPath: `agents[${i}].id`,
      label: `${agent.displayName} — 에이전트 ID`,
      currentValue: agent.id,
      mode: 'lock',
      reason: 'ID 변경은 레벨 체인·산출물 참조를 깨뜨립니다. 현재 버전에서는 편집 불가합니다.',
    })

    // [FORM] agents[].model — SourceMap 으로 대상 파일 결정
    const modelRelPath = agentSrc?.modelFile ?? agentSrc?.nameFile
    if (modelRelPath) {
      // tools: 또는 allowed-tools: 중 어느 키인지 파일명 패턴으로 추정
      // SKILL.md 파일은 allowed-tools, _agents/*.md 는 tools
      const modelLocator = 'model'
      entries.push({
        fieldPath: `agents[${i}].model`,
        label: `${agent.displayName} — 모델`,
        currentValue: agent.model,
        mode: 'form',
        target: { relPath: modelRelPath, locator: modelLocator },
      })
    } else {
      // SourceMap 없거나 해당 에이전트 항목 없음 → lock 으로 폴백
      entries.push({
        fieldPath: `agents[${i}].model`,
        label: `${agent.displayName} — 모델`,
        currentValue: agent.model,
        mode: 'lock',
        reason: '이 에이전트의 model 필드 위치를 파악할 수 없습니다. raw 에디터로 편집하세요.',
      })
    }

    // [FORM] agents[].tools — SourceMap 으로 대상 파일 + 키 결정
    const toolsRelPath = agentSrc?.toolsFile ?? agentSrc?.nameFile
    if (toolsRelPath) {
      // SKILL.md 파일이면 allowed-tools 키, 그 외(_agents/*.md 등)는 tools 키
      const isSKILL = toolsRelPath.endsWith('SKILL.md') || toolsRelPath.endsWith('/SKILL.md')
      const toolsLocator = isSKILL ? 'allowed-tools' : 'tools'
      entries.push({
        fieldPath: `agents[${i}].tools`,
        label: `${agent.displayName} — 도구 목록`,
        currentValue: agent.tools,
        mode: 'form',
        target: { relPath: toolsRelPath, locator: toolsLocator },
      })
    } else {
      entries.push({
        fieldPath: `agents[${i}].tools`,
        label: `${agent.displayName} — 도구 목록`,
        currentValue: agent.tools,
        mode: 'lock',
        reason: '이 에이전트의 tools 필드 위치를 파악할 수 없습니다. raw 에디터로 편집하세요.',
      })
    }

    // [AI] agents[].role, reads, writes, phaseClass 등 AI 해석값
    const aiFields: Array<{ key: keyof typeof agent; label: string }> = [
      { key: 'role', label: '역할 설명' },
      { key: 'reads', label: '읽기 경로 목록' },
      { key: 'writes', label: '쓰기 경로 목록' },
      { key: 'phaseClass', label: '페이즈 분류' },
      { key: 'escalation', label: '에스컬레이션 조건' },
      { key: 'signals', label: 'SIGNAL 목록' },
      { key: 'riskNote', label: '주요 위험' },
    ]
    for (const { key, label } of aiFields) {
      const val = agent[key]
      if (val === undefined) continue
      const displayVal = Array.isArray(val) ? val : String(val)
      entries.push({
        fieldPath: `agents[${i}].${key}`,
        label: `${agent.displayName} — ${label}`,
        currentValue: displayVal,
        mode: 'ai',
        reason: 'AI 가 산문에서 추정한 값입니다. AI 명령으로 원본 파일을 수정하거나 raw 에디터를 사용하세요.',
      })
    }
  }

  // ── 점수 [LOCK] ────────────────────────────────
  if (model.score !== undefined) {
    entries.push({
      fieldPath: 'score',
      label: '하네스 점수 (6축)',
      currentValue: String(model.score.total),
      mode: 'lock',
      reason: '점수는 번들 구조에서 자동 계산됩니다. 직접 편집은 무의미하며 재정규화 시 재계산됩니다.',
    })
  }

  // ── 게이트/hook [RAW] ─────────────────────────
  for (const gate of model.controlFlow.gates) {
    entries.push({
      fieldPath: `controlFlow.gates[phase=${gate.phase}]`,
      label: `게이트 — ${gate.phase}`,
      currentValue: gate.ruleCodes,
      mode: 'raw',
      reason: '게이트 스크립트(.sh) 텍스트를 raw 에디터로 수정하세요. 구조화 폼은 스크립트 의미론을 보장할 수 없어 지원하지 않습니다.',
    })
  }

  // ── meta [RAW] ────────────────────────────────
  if (model.meta.author !== undefined) {
    entries.push({
      fieldPath: 'meta.author',
      label: '번들 저자',
      currentValue: model.meta.author,
      mode: 'raw',
      reason: 'README/GUIDE 산문에서 AI 가 추출한 값입니다. 원본 파일을 raw 에디터로 수정하세요.',
    })
  }
  if (model.meta.tagline !== undefined) {
    entries.push({
      fieldPath: 'meta.tagline',
      label: '번들 한 줄 설명',
      currentValue: model.meta.tagline,
      mode: 'raw',
      reason: 'README/GUIDE 산문에서 AI 가 추출한 값입니다. 원본 파일을 raw 에디터로 수정하세요.',
    })
  }

  // ── AI 해석값 필드들 [AI] ─────────────────────
  // levels, triage, artifacts.producer/consumers 등
  for (let i = 0; i < model.levels.length; i++) {
    const level = model.levels[i]
    entries.push({
      fieldPath: `levels[${i}].agentChain`,
      label: `${level.id} (${level.name}) — 에이전트 체인`,
      currentValue: level.agentChain,
      mode: 'ai',
      reason: 'triage.md / concepts.md 산문에서 AI 가 추출한 값입니다. AI 명령으로 원본 파일을 수정하세요.',
    })
  }

  // ── artifacts 템플릿 [RAW] ────────────────────
  for (let i = 0; i < model.artifacts.length; i++) {
    const artifact = model.artifacts[i]
    if (artifact.template !== undefined) {
      entries.push({
        fieldPath: `artifacts[${i}].template`,
        label: `산출물 템플릿 — ${artifact.id}`,
        currentValue: artifact.id,
        mode: 'raw',
        reason: '_templates/ 파일을 raw 에디터로 수정하세요.',
      })
    }
  }

  const formEditableCount = entries.filter((e) => e.mode === 'form').length

  return { entries, formEditableCount }
}

/**
 * EditMap 에서 특정 fieldPath 의 항목을 빠르게 찾는 헬퍼.
 *
 * @param editMap buildEditMap 의 반환값
 * @param fieldPath 조회할 필드 경로
 * @returns 매칭 항목 또는 undefined
 */
export function findEditEntry(editMap: EditMap, fieldPath: string): EditFieldEntry | undefined {
  return editMap.entries.find((e) => e.fieldPath === fieldPath)
}
