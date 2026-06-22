/**
 * DryRunEstimator — Dry-run 실행 진입점
 *
 * 처리 흐름:
 * 1. taskHash 캐시 조회 → hit 이면 즉시 반환.
 * 2. AIService.estimateLevel(taskText, model.triage, Haiku) 로 레벨 추정.
 * 3. levelPath(model, level) 로 결정론적 경로/병렬/게이트/비용 계산.
 * 4. DryRunResult 조합 → cache.setTask(taskHash, result).
 *
 * AIService 와 HarnessCache 는 생성자 주입 — 테스트에서 모킹 가능.
 *
 * 참조: arch.md §3.2 / harness-studio-plan.md M7.
 */

import { levelPath } from './levelPath'
import { computeTaskHash } from './taskHash'
import type { HarnessCache } from './HarnessCache'
import type { HarnessModel, HarnessTriage, DryRunResult } from '../../shared/types/harness'

// ─────────────────────────────────────────────────────────────────────────────
// 인터페이스 분리 (테스트 모킹용)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DryRunEstimator 가 AIService 에서 사용하는 최소 인터페이스.
 * estimateLevel 하나만 필요하다.
 */
export interface IAIServiceForEstimator {
  /**
   * 태스크 텍스트와 triage 구조로 레벨을 추정한다.
   *
   * @param taskText - 태스크 설명 평문
   * @param triage - 번들의 HarnessTriage
   * @param requestId - AI_PROGRESS 이벤트 구분 ID (optional)
   * @param projectContext - toPromptText(profile) 로 생성한 프로젝트 맥락 (optional).
   *   지정 시 "## 프로젝트 맥락" 섹션을 user prompt 에 포함.
   * @returns { level, answers, rationale }
   */
  estimateLevel(
    taskText: string,
    triage: HarnessTriage,
    requestId?: string,
    projectContext?: string
  ): Promise<Pick<DryRunResult, 'level' | 'answers' | 'rationale'>>
}

// ─────────────────────────────────────────────────────────────────────────────
// DryRunEstimator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 태스크 텍스트를 받아 레벨 추정 + 경로 계산을 수행하는 서비스.
 *
 * 캐시 전략:
 * - taskHash = sha256(bundleHash + normalizedTaskText).
 * - 동일 번들 + 동일 태스크라면 AI 재호출 없이 캐시에서 반환.
 *
 * 의존성:
 * - AIService.estimateLevel — Haiku 로 레벨 추정 (AI 호출)
 * - levelPath — HarnessModel + levelId → 경로/병렬/게이트/비용 (AI 없음, 순수)
 * - HarnessCache — taskHash 캐시 읽기/쓰기
 */
export class DryRunEstimator {
  constructor(
    private readonly aiService: IAIServiceForEstimator,
    private readonly cache: HarnessCache
  ) {}

  /**
   * 태스크 텍스트와 HarnessModel 로 DryRunResult 를 계산한다.
   *
   * 1. taskHash 캐시 조회 (hit → 즉시 반환).
   * 2. AIService.estimateLevel 으로 레벨 추정 (miss 시).
   * 3. levelPath(model, level) 로 결정론적 경로/병렬/게이트/비용 계산.
   * 4. DryRunResult 조합 + 캐시 저장.
   *
   * @param model - 정규화된 HarnessModel (triage 가 채워져 있어야 함)
   * @param taskText - 태스크 설명 평문 또는 두레이 URL
   * @param requestId - AI_PROGRESS 이벤트 구분 ID (optional)
   * @param projectContext - toPromptText(profile) 로 생성한 프로젝트 맥락 (optional).
   *   지정 시 AIService.estimateLevel 에 전달되어 레벨 추정 정확도를 높인다.
   *   캐시 키(taskHash)에는 포함되지 않음 — 맥락 분리는 caller(HarnessService.dryrun)가 담당.
   * @returns DryRunResult
   */
  async estimate(
    model: HarnessModel,
    taskText: string,
    requestId?: string,
    projectContext?: string,
    projectContextSig?: string
  ): Promise<DryRunResult> {
    // 1. taskHash 캐시 조회
    //    projectContextSig 포함 — 맥락이 다르면 캐시 분리 (동일 번들+태스크라도 별개 결과)
    const taskHash = computeTaskHash(model.meta.bundleHash, taskText, projectContextSig)
    const cached = this.cache.getTask(taskHash)
    if (cached !== null) {
      return cached
    }

    // 2. AI 레벨 추정 (Haiku)
    const estimate = await this.aiService.estimateLevel(
      taskText,
      model.triage,
      requestId,
      projectContext
    )

    // 3. levelPath 로 결정론적 경로 계산
    const path = levelPath(model, estimate.level)

    // 4. DryRunResult 조합
    const result: DryRunResult = {
      level: estimate.level,
      answers: estimate.answers,
      rationale: estimate.rationale,
      highlightPath: path.highlightPath,
      parallelGroups: path.parallelGroups,
      gates: path.gates,
      estTimeRel: path.estTimeRel,
      estCostRel: path.estCostRel,
    }

    // 5. 캐시 저장
    this.cache.setTask(taskHash, result)

    return result
  }
}
