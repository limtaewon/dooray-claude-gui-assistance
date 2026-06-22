/**
 * HarnessService — 정적 스캔 / AI 정규화 / 캐시 / Dry-run / 자동 발견 을 묶는 파사드.
 *
 * IPC 핸들러가 직접 호출하는 단일 진입점.
 * electron 의존(app.getPath, dialog)은 이 클래스와 IPC 핸들러에만 존재한다.
 *
 * 제공 메서드:
 * - scan(path): 정적 스캔 → RawBundleSummary (AI 없음, 즉시)
 * - normalize(path, force?): 캐시 hit → HarnessModel 즉시 / miss → scan + normalize + cache.set
 * - dryrun(path, taskText): DryRunEstimator 로 레벨 추정 + levelPath 결합 (M7 구현)
 * - discover(): ~/.claude/skills/* 자동 발견
 * - clearCache(path?): 캐시 삭제
 * - listCached(): 캐시된 번들 목록
 */

import { promises as fs } from 'fs'
import * as path from 'path'
import { homedir } from 'os'
import { BundleScanner } from './BundleScanner'
import { HarnessNormalizer } from './HarnessNormalizer'
import { HarnessCache } from './HarnessCache'
import { DryRunEstimator } from './DryRunEstimator'
import type { IAIServiceForNormalizer } from './HarnessNormalizer'
import type { RawBundleSummary, HarnessModel, DryRunResult, DiscoveredHarness } from '../../shared/types/harness'
import { detectBundleKind } from './bundleDetect'
import { PathAllowlist, assertPathAllowed, getSkillsRoot, HarnessPathDeniedError } from './pathGate'

// ─────────────────────────────────────────────
// AIService 인터페이스
// ─────────────────────────────────────────────

/**
 * HarnessService 가 사용하는 AIService 의 최소 인터페이스.
 * normalizeHarness + estimateLevel + explainHarness 세 메서드를 포함한다.
 */
export interface IAIServiceForHarness extends IAIServiceForNormalizer {
  estimateLevel(
    taskText: string,
    triage: import('../../shared/types/harness').HarnessTriage,
    requestId?: string
  ): Promise<Pick<DryRunResult, 'level' | 'answers' | 'rationale'>>

  /**
   * 번들 컨텍스트와 토픽을 받아 한국어 마크다운 설명을 생성한다.
   *
   * @param rawContext - 번들 관련 컨텍스트 요약
   * @param topic - 설명 요청 토픽
   * @param requestId - AI_PROGRESS 이벤트 구분 ID (선택)
   * @returns 한국어 마크다운 설명 문자열
   */
  explainHarness(
    rawContext: string,
    topic: string,
    requestId?: string
  ): Promise<string>
}

// ─────────────────────────────────────────────
// HarnessService
// ─────────────────────────────────────────────

/**
 * Harness Studio 의 주 파사드 서비스.
 *
 * IPC 핸들러가 직접 호출하는 단일 진입점이며,
 * BundleScanner / HarnessNormalizer / HarnessCache 를 조율한다.
 *
 * electron 의존(userDataPath)은 생성자 주입으로 격리해
 * 테스트 시 임시 디렉터리를 주입할 수 있다.
 */
export class HarnessService {
  private readonly scanner: BundleScanner
  private readonly normalizer: HarnessNormalizer
  private readonly cache: HarnessCache
  private readonly estimator: DryRunEstimator
  /** explainHarness 호출용으로 보관 (explain 메서드에서 직접 접근) */
  private readonly aiService: IAIServiceForHarness

  /**
   * 세션 단위 경로 allowlist.
   * scan 성공 시 경로를 등록하고, AI 전송 전 반드시 검증한다.
   *
   * 제약: ~/.claude/skills 하위 경로는 항상 허용 (등록 불필요).
   * 그 외 경로는 scan 을 먼저 호출해 등록해야 normalize/dryrun/explain 이 허용된다.
   */
  private readonly allowlist: PathAllowlist = new PathAllowlist()

  /**
   * @param userDataPath - electron app.getPath('userData') 값
   * @param aiService - AIService 인스턴스 (normalizeHarness + estimateLevel + explainHarness 포함)
   */
  constructor(userDataPath: string, aiService: IAIServiceForHarness) {
    this.aiService = aiService
    this.scanner = new BundleScanner()
    this.normalizer = new HarnessNormalizer(aiService)
    this.cache = new HarnessCache(userDataPath)
    this.estimator = new DryRunEstimator(aiService, this.cache)
  }

  // ─────────────────────────────────────────────
  // scan — 정적 스캔 (AI 없음, 즉시)
  // ─────────────────────────────────────────────

  /**
   * 번들 경로를 정적으로 스캔하여 RawBundleSummary 를 반환한다.
   *
   * AI 없음. 즉시 반환. ImportWizard 의 ScanStep 에서 사용한다.
   *
   * 보안:
   * - 스캔 성공 후 bundlePath 를 세션 allowlist 에 등록한다.
   * - 이 등록이 완료돼야 같은 경로에 대한 normalize/dryrun/explain 이 허용된다.
   * - ~/.claude/skills 하위 경로는 scan 없이도 항상 허용된다.
   *
   * @param bundlePath - 번들 루트 절대경로 (사용자가 다이얼로그/드롭으로 선택한 경로)
   * @returns RawBundleSummary (kind, fileTree, agentStubs, warnings)
   */
  async scan(bundlePath: string): Promise<RawBundleSummary> {
    const raw = await this.scanner.scan(bundlePath)
    const summary = this.scanner.toSummary(raw)

    // scan 이 성공했으면 세션 allowlist 에 등록
    // (심링크 해소: realpath 실패 시 등록 생략, 이후 AI 전송에서 검증 거부)
    try {
      const realResolved = await fs.realpath(path.resolve(bundlePath))
      this.allowlist.register(realResolved)
    } catch {
      // realpath 실패 — 등록 생략. normalize 단계에서 assertPathAllowed 가 거부한다.
    }

    return summary
  }

  // ─────────────────────────────────────────────
  // normalize — 캐시 hit/miss + AI 정규화
  // ─────────────────────────────────────────────

  /**
   * 번들 경로를 AI 로 정규화하여 HarnessModel 을 반환한다.
   *
   * 처리 순서:
   * 1. BundleScanner.scan 으로 RawBundle + bundleHash 획득.
   * 2. HarnessCache.getBundle(bundleHash) 로 캐시 조회.
   *    - hit (force=false): 캐시된 HarnessModel 즉시 반환.
   *    - miss (또는 force=true): HarnessNormalizer.normalize 호출 → cache.setBundle.
   *
   * @param bundlePath - 번들 루트 절대경로
   * @param force - true 면 캐시 무시하고 재정규화
   * @param requestId - AI_PROGRESS 이벤트 구분 ID (선택)
   * @returns HarnessModel
   */
  async normalize(bundlePath: string, force = false, requestId?: string): Promise<HarnessModel> {
    // 0. 경로 게이트 — AI 전송 전 필수 검증.
    //    skills 하위이거나 scan 으로 등록된 경로만 허용(미등록 임의 경로의 silent AI 전송 차단).
    //    dryrun/explain 은 이 normalize 를 경유하므로 함께 보호된다.
    //    skills root 도 realpath 로 해소 — 등록 경로(realpath)와 비교 기준을 일치시킨다
    //    (~/.claude 가 심링크인 환경 대비; 미존재 시 resolve 폴백).
    const skillsRoot = await fs.realpath(getSkillsRoot()).catch(() => path.resolve(getSkillsRoot()))
    await assertPathAllowed(bundlePath, this.allowlist.toAllowedRoots(skillsRoot))

    // 1. 정적 스캔 → RawBundle
    const raw = await this.scanner.scan(bundlePath)

    // 2. 캐시 조회
    if (!force) {
      const cached = this.cache.getBundle(raw.bundleHash)
      if (cached !== null) {
        return cached
      }
    }

    // 3. AI 정규화
    const model = await this.normalizer.normalize(raw, requestId)

    // 4. 캐시 저장
    this.cache.setBundle(raw.bundleHash, model, {
      path: bundlePath,
      name: raw.bundleHash ? path.basename(bundlePath) : 'unknown',
    })

    return model
  }

  // ─────────────────────────────────────────────
  // dryrun — Dry-run 레벨 추정 + 경로 계산 (M7)
  // ─────────────────────────────────────────────

  /**
   * 태스크 평문을 받아 번들의 레벨(L0~L3)을 추정하고
   * levelPath 로 결정론적 경로/병렬/게이트/비용을 계산한다.
   *
   * 처리 순서:
   * 1. normalize(bundlePath) 로 HarnessModel 획득 (캐시 hit 우선).
   * 2. DryRunEstimator.estimate(model, taskText) 호출.
   *    - taskHash 캐시 조회 → hit 이면 즉시 반환.
   *    - miss: AIService.estimateLevel(Haiku) + levelPath(결정론적) 결합.
   * 3. 결과 반환.
   *
   * @param bundlePath - 번들 루트 절대경로
   * @param taskText - 태스크 설명 평문 또는 두레이 URL
   * @param requestId - AI_PROGRESS 이벤트 구분 ID (선택)
   * @returns DryRunResult
   */
  async dryrun(bundlePath: string, taskText: string, requestId?: string): Promise<DryRunResult> {
    const model = await this.normalize(bundlePath, false, requestId)
    return this.estimator.estimate(model, taskText, requestId)
  }

  // ─────────────────────────────────────────────
  // explain — 온디맨드 설명/용어번역 (HARNESS_EXPLAIN)
  // ─────────────────────────────────────────────

  /**
   * 번들 경로 + 토픽을 받아 온디맨드 한국어 설명을 반환한다.
   *
   * 처리 순서:
   * 1. normalize(bundlePath) 로 HarnessModel 획득 (캐시 hit 우선, 정규화 없이 즉시).
   * 2. HarnessModel 에서 토픽과 관련된 컨텍스트를 요약 구성.
   * 3. AIService.explainHarness(rawContext, topic) 호출 → 마크다운 반환.
   *
   * 이 메서드는 캐시를 적용하지 않는다(온디맨드).
   * bundlePath 가 정규화된 적 없으면 캐시 miss → normalize 도 실행된다.
   *
   * @param bundlePath - 번들 루트 절대경로
   * @param topic - 설명 요청 토픽 (예: "architect 에이전트 역할", "L2 레벨 진입 조건")
   * @param requestId - AI_PROGRESS 이벤트 구분 ID (선택)
   * @returns { markdown: string }
   */
  async explain(
    bundlePath: string,
    topic: string,
    requestId?: string
  ): Promise<{ markdown: string }> {
    // 1. 번들 모델 획득 (캐시 우선, 없으면 정규화)
    const model = await this.normalize(bundlePath, false, requestId)

    // 2. 토픽 관련 컨텍스트 요약 구성
    //    번들 전체를 AI 에 주면 너무 크므로, 핵심 구조 정보만 요약해 전달한다.
    const contextParts: string[] = [
      `번들 이름: ${model.meta.name}`,
      `번들 종류: ${model.meta.kind}`,
    ]

    if (model.agents.length > 0) {
      const agentSummary = model.agents
        .map((a) => `  - ${a.id} (${a.phaseClass ?? 'unknown'}): ${a.role ?? '역할 미정'}`)
        .join('\n')
      contextParts.push(`에이전트 목록 (${model.agents.length}개):\n${agentSummary}`)
    }

    if (model.levels.length > 0) {
      const levelSummary = model.levels
        .map((l) => `  - ${l.id} ${l.name}: 체인 [${l.agentChain.join(' → ')}]`)
        .join('\n')
      contextParts.push(`레벨 체인:\n${levelSummary}`)
    }

    if (model.triage.rules.length > 0) {
      const ruleSummary = model.triage.rules
        .map((r) => `  - when(${r.when}) → ${r.then}`)
        .join('\n')
      contextParts.push(`트리아지 규칙:\n${ruleSummary}`)
    }

    if (model.controlFlow.gates.length > 0) {
      const gateSummary = model.controlFlow.gates
        .map((g) => `  - 페이즈(${g.phase}): 규칙코드 [${g.ruleCodes.join(', ')}] 차단=${g.blocking}${g.description ? ' — ' + g.description : ''}`)
        .join('\n')
      contextParts.push(`게이트:\n${gateSummary}`)
    }

    if (model.controlFlow.hooks.length > 0) {
      const hookSummary = model.controlFlow.hooks
        .map((h) => `  - ${h.file}${h.event ? ' (' + h.event + ')' : ''}${h.enforces ? ': ' + h.enforces : ''}`)
        .join('\n')
      contextParts.push(`훅:\n${hookSummary}`)
    }

    if (model.warnings.length > 0) {
      contextParts.push(`번들 경고: ${model.warnings.slice(0, 3).join('; ')}`)
    }

    const rawContext = contextParts.join('\n\n')

    // 3. AI 설명 생성
    const markdown = await this.aiService.explainHarness(rawContext, topic, requestId)
    return { markdown }
  }

  // ─────────────────────────────────────────────
  // discover — ~/.claude/skills/* 자동 발견
  // ─────────────────────────────────────────────

  /**
   * ~/.claude/skills/* 를 정적으로 스캔해 발견된 번들 목록을 반환한다.
   *
   * 각 하위 디렉터리를 번들 후보로 간주하고,
   * detectBundleKind 로 kind 를 판정한다.
   * 오류 발생 시 해당 항목을 스킵하고 계속 진행한다.
   *
   * @returns DiscoveredHarness 배열
   */
  async discover(): Promise<DiscoveredHarness[]> {
    const skillsRoot = path.join(homedir(), '.claude', 'skills')
    const results: DiscoveredHarness[] = []

    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(skillsRoot, { withFileTypes: true })
    } catch {
      // ~/.claude/skills 가 없으면 빈 배열 반환
      return []
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const bundlePath = path.join(skillsRoot, entry.name)
      try {
        // 파일 목록만 간단히 읽어 kind 판정 (전체 scan 은 비용이 크므로 최소화)
        const subEntries = await fs.readdir(bundlePath, { encoding: 'utf-8' })
        const filePaths = subEntries
        const kind = detectBundleKind({ filePaths })
        results.push({
          path: bundlePath,
          name: entry.name,
          kind,
        })
      } catch {
        // 해당 항목 스킵
      }
    }

    return results
  }

  // ─────────────────────────────────────────────
  // clearCache / listCached
  // ─────────────────────────────────────────────

  /**
   * 캐시를 삭제한다.
   *
   * bundlePath 지정 시 해당 번들만, 생략 시 전체 삭제.
   *
   * @param bundlePath - 특정 번들 경로 (optional)
   * @returns 삭제된 항목 수
   */
  clearCache(bundlePath?: string): number {
    return this.cache.clear(bundlePath)
  }

  /**
   * 캐시된 번들 목록을 반환한다 (최근 정규화 순).
   *
   * 최근 정규화한 번들을 빠르게 재오픈할 때 사용한다.
   *
   * @returns CachedHarnessEntry 배열
   */
  listCached(): import('../../shared/types/harness').CachedHarnessEntry[] {
    return this.cache.listCached()
  }
}
