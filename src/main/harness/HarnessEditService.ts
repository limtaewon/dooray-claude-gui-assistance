/**
 * HarnessEditService — Harness Studio 편집 파사드 (M3)
 *
 * IPC 핸들러가 호출하는 단일 진입점.
 * 읽기(readFile) / diff / 적용(apply) / 백업 목록 / 복원 을 제공한다.
 *
 * 설계 원칙 (ADR-harness-studio-edit-002):
 * - 쓰기는 번들 루트 하위로만. `assertWritablePath` 로 모든 쓰기 경로를 검증한다.
 * - 적용 직전 STALE 대조 — 외부 편집 감지 시 거부.
 * - 쓰기 전 백업 필수. 부분 실패 시 이미 쓴 파일은 백업으로 복원 가능.
 * - temp-write → rename 원자적 쓰기.
 * - 적용 후 HarnessService.normalize(force=true) 로 재정규화.
 * - `.sh` 는 텍스트로만 쓴다. 절대 spawn/exec 없음.
 *
 * electron 의존(app.getPath, fs 쓰기)은 이 클래스에만 존재한다.
 */

import { promises as fs } from 'fs'
import * as path from 'path'
import {
  assertPathAllowed,
  assertWritablePath,
  HarnessPathDeniedError,
  getSkillsRoot,
  PathAllowlist,
} from './pathGate'
import {
  computeBackupDir,
  getBackupRoot,
  backupFiles,
  listBackupEntries,
  restoreFromBackup,
} from './backup'
import { computeDraftDiffSummary, sha256 } from './draftDiff'
import type { HarnessService } from './HarnessService'
import type {
  HarnessDraft,
  DraftDiffSummary,
  BackupEntry,
  AgentSourceMap,
} from '../../shared/types/harness-edit'
import type { HarnessModel } from '../../shared/types/harness'

// ─────────────────────────────────────────────
// 도메인 에러
// ─────────────────────────────────────────────

/**
 * 편집 대상 파일이 외부에서 변경되어 draft 와 충돌할 때 throw 되는 에러.
 *
 * apply 는 STALE 파일이 있으면 진행하지 않는다.
 * 사용자에게 "재로드 후 재시도" 를 안내한다.
 */
export class HarnessStaleEditError extends Error {
  readonly code = 'HARNESS_STALE_EDIT'
  constructor(
    /** STALE 판정된 relPath 목록 */
    readonly stalePaths: string[]
  ) {
    super(`편집 대상 파일이 외부에서 변경됐습니다. 재로드 후 다시 시도해주세요. (${stalePaths.join(', ')})`)
    this.name = 'HarnessStaleEditError'
  }
}

/**
 * draft 가 비어있을 때 throw 되는 에러.
 */
export class HarnessEmptyDraftError extends Error {
  readonly code = 'HARNESS_EMPTY_DRAFT'
  constructor() {
    super('적용할 편집이 없습니다. draft 가 비어있습니다.')
    this.name = 'HarnessEmptyDraftError'
  }
}

/**
 * 백업 디렉터리가 허용 루트 외부에 있을 때 throw 되는 에러 (경로 주입 방어).
 */
export class HarnessBackupPathDeniedError extends Error {
  readonly code = 'HARNESS_BACKUP_PATH_DENIED'
  constructor(readonly backupDir: string) {
    super(`백업 디렉터리가 허용 범위 외부에 있습니다: ${backupDir}`)
    this.name = 'HarnessBackupPathDeniedError'
  }
}

// ─────────────────────────────────────────────
// HarnessEditService
// ─────────────────────────────────────────────

/**
 * Harness Studio 편집(저작) 기능 파사드.
 *
 * IPC 핸들러가 직접 호출하는 단일 진입점.
 * 모든 쓰기는 이 클래스를 통과하며 게이트·백업·원자 쓰기·재정규화를 보장한다.
 *
 * 생성자에 userDataPath 와 harnessService 를 주입받아
 * electron 런타임과 분리할 수 있다. 테스트 시 임시 디렉터리를 주입 가능.
 */
export class HarnessEditService {
  private readonly backupRoot: string
  private readonly allowlist: PathAllowlist = new PathAllowlist()

  /**
   * @param userDataPath - Electron app.getPath('userData')
   * @param harnessService - HarnessService 인스턴스 (normalize, clearCache 사용)
   */
  constructor(
    private readonly userDataPath: string,
    private readonly harnessService: HarnessService
  ) {
    this.backupRoot = getBackupRoot(userDataPath)
  }

  // ─────────────────────────────────────────────
  // 읽기 게이트 통과 (편집 세션 등록)
  // ─────────────────────────────────────────────

  /**
   * 번들 루트 경로를 읽기 게이트로 검증하고 편집 allowlist 에 등록한다.
   * readFile/diff/apply 호출 전 번들 scan/normalize 가 선행되어 등록됐는지 확인.
   *
   * @param bundlePath - 번들 루트 절대경로
   * @returns realpath 해소된 번들 루트 절대경로
   * @throws HarnessPathDeniedError
   */
  private async verifiedBundleRoot(bundlePath: string): Promise<string> {
    const skillsRoot = await fs.realpath(getSkillsRoot()).catch(() =>
      path.resolve(getSkillsRoot())
    )
    // skills 루트 + allowlist 둘 다 허용
    return assertPathAllowed(bundlePath, this.allowlist.toAllowedRoots(skillsRoot))
  }

  /**
   * 번들 경로를 편집 allowlist 에 등록한다.
   * HarnessService.scan 이 성공한 뒤 IPC 핸들러에서 호출한다.
   *
   * @param realBundlePath - realpath 해소된 번들 루트 절대경로
   */
  registerBundle(realBundlePath: string): void {
    this.allowlist.register(realBundlePath)
  }

  // ─────────────────────────────────────────────
  // readFile — 파일 원본 내용 + SourceMap 반환
  // ─────────────────────────────────────────────

  /**
   * 번들 내 단일 파일의 원본 내용과 AgentSourceMap 을 반환한다.
   *
   * raw 에디터 초기값 및 구조화 폼 대상 파일 결정에 사용한다.
   * 기존 읽기 게이트를 재사용하며 쓰기는 없다.
   *
   * @param bundlePath - 번들 루트 절대경로
   * @param relPath - 번들 루트 기준 파일 상대경로
   * @returns { content: string; sourceMap?: AgentSourceMap }
   * @throws HarnessPathDeniedError — 경로 검증 실패
   */
  async readFile(
    bundlePath: string,
    relPath: string
  ): Promise<{ content: string; sourceMap?: AgentSourceMap }> {
    const bundleRoot = await this.verifiedBundleRoot(bundlePath)

    // 읽기 대상 파일도 bundleRoot 하위인지 검증 (경로 탈출 방어)
    const absTarget = path.join(bundleRoot, relPath)
    let realTarget: string
    try {
      realTarget = await fs.realpath(absTarget)
    } catch {
      throw new HarnessPathDeniedError(relPath, `파일 realpath 실패 — 존재하지 않거나 접근 불가: ${absTarget}`)
    }

    // 경로 이탈 방지: realpath 가 bundleRoot 하위여야 함
    const rel = path.relative(bundleRoot, realTarget)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new HarnessPathDeniedError(relPath, `번들 루트 외부 경로: ${realTarget}`)
    }

    const content = await fs.readFile(realTarget, 'utf-8')

    // AgentSourceMap 은 최근 scan 결과에서 가져온다.
    // HarnessService.scan() 이 RawBundle.agentSourceMap 을 채우지만
    // scan 결과는 HarnessService 내부에 있어 직접 접근 불가.
    // sourceMap 은 caller 가 RawBundleSummary 와 함께 관리하므로 여기서는 undefined.
    // (M5 IPC 핸들러에서 RawBundle.agentSourceMap 을 함께 반환한다.)
    return { content, sourceMap: undefined }
  }

  // ─────────────────────────────────────────────
  // diff — draft 적용 전 미리보기
  // ─────────────────────────────────────────────

  /**
   * draft 와 디스크 현재 내용을 대조해 DraftDiffSummary 를 반환한다.
   *
   * 적용 전 미리보기 및 STALE 감지 용도.
   * 쓰기 없음.
   *
   * @param bundlePath - 번들 루트 절대경로
   * @param draft - 편집 세션 draft
   * @returns DraftDiffSummary
   */
  async diff(bundlePath: string, draft: HarnessDraft): Promise<DraftDiffSummary> {
    const bundleRoot = await this.verifiedBundleRoot(bundlePath)

    // 디스크 현재 내용 수집
    const diskContents: Record<string, string> = {}
    for (const relPath of Object.keys(draft.edits)) {
      const absPath = path.join(bundleRoot, relPath)
      try {
        diskContents[relPath] = await fs.readFile(absPath, 'utf-8')
      } catch {
        // 파일 없음 → 신규 파일 draft — 빈 문자열
        diskContents[relPath] = ''
      }
    }

    return computeDraftDiffSummary(draft, diskContents)
  }

  // ─────────────────────────────────────────────
  // apply — 백업 + 원자 쓰기 + 재정규화
  // ─────────────────────────────────────────────

  /**
   * draft 를 파일에 원자적으로 적용한다.
   *
   * 처리 순서:
   * 1. 경로 게이트 — assertWritablePath 로 각 relPath 검증.
   * 2. STALE 대조 — 현재 디스크 sha ≠ baseContent sha 인 파일 존재 시 거부.
   * 3. 백업 — 원본 파일 복사 (backupFiles).
   * 4. temp-write → rename — 파일별 원자적 쓰기.
   * 5. HarnessCache.clear + HarnessService.normalize(force=true) — 재정규화.
   *
   * 부분 실패: 쓰기 중 실패 시 이미 쓴 파일은 applied[] 에 기록됨.
   * 백업에서 수동 복원 가능 (HarnessEditService.restore 또는 BackupRestorePanel).
   *
   * @param bundlePath - 번들 루트 절대경로
   * @param draft - 편집 세션 draft
   * @returns { applied: string[]; backupDir: string; model: HarnessModel }
   * @throws HarnessEmptyDraftError — draft.edits 가 빈 경우
   * @throws HarnessStaleEditError — STALE 파일 존재 시
   * @throws HarnessPathDeniedError — 경로 검증 실패 시
   */
  async apply(
    bundlePath: string,
    draft: HarnessDraft
  ): Promise<{ applied: string[]; backupDir: string; model: HarnessModel }> {
    if (Object.keys(draft.edits).length === 0) {
      throw new HarnessEmptyDraftError()
    }

    const bundleRoot = await this.verifiedBundleRoot(bundlePath)
    const bundleName = path.basename(bundleRoot)

    // 1. 경로 게이트 — 모든 relPath 검증 (실패 시 apply 진행 안 함)
    for (const relPath of Object.keys(draft.edits)) {
      await assertWritablePath(bundleRoot, relPath)
    }

    // 2. STALE 대조 — 디스크 현재 sha ↔ baseContent sha
    const diskContents: Record<string, string> = {}
    for (const relPath of Object.keys(draft.edits)) {
      const absPath = path.join(bundleRoot, relPath)
      try {
        diskContents[relPath] = await fs.readFile(absPath, 'utf-8')
      } catch {
        diskContents[relPath] = '' // 신규 파일
      }
    }

    const stalePaths: string[] = []
    for (const [relPath, fileEdit] of Object.entries(draft.edits)) {
      const baseSha = sha256(fileEdit.baseContent)
      const diskSha = sha256(diskContents[relPath] ?? '')
      if (baseSha !== diskSha) {
        stalePaths.push(relPath)
      }
    }

    if (stalePaths.length > 0) {
      throw new HarnessStaleEditError(stalePaths)
    }

    // 3. 백업 — 원본 복사
    const backupDir = computeBackupDir(this.backupRoot, bundleName)
    await backupFiles(bundleRoot, Object.keys(draft.edits), backupDir)

    // 4. 원자적 쓰기 — temp-write → rename
    const applied: string[] = []
    const tempFiles: string[] = []

    try {
      for (const [relPath, fileEdit] of Object.entries(draft.edits)) {
        const absTarget = path.join(bundleRoot, relPath)
        const tempPath = `${absTarget}.tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`

        // 부모 디렉터리 생성 (신규 파일의 경우)
        await fs.mkdir(path.dirname(absTarget), { recursive: true })

        // temp 파일 쓰기
        await fs.writeFile(tempPath, fileEdit.draftContent, 'utf-8')
        tempFiles.push(tempPath)

        // rename (원자적)
        await fs.rename(tempPath, absTarget)
        tempFiles.pop() // rename 성공 — temp 파일은 absTarget 으로 이동됨
        applied.push(relPath)
      }
    } catch (writeErr) {
      // temp 파일 정리
      for (const tempPath of tempFiles) {
        try {
          await fs.unlink(tempPath)
        } catch {
          // 정리 실패 — 조용히 무시
        }
      }
      throw writeErr
    }

    // 5. 캐시 무효화 + 재정규화
    this.harnessService.clearCache(bundlePath)
    const model = await this.harnessService.normalize(bundlePath, true)

    return { applied, backupDir, model }
  }

  // ─────────────────────────────────────────────
  // listBackups — 백업 목록 조회
  // ─────────────────────────────────────────────

  /**
   * 번들에 대한 백업 항목 목록을 반환한다.
   *
   * BackupRestorePanel 에서 복원 진입점으로 사용한다.
   *
   * @param bundlePath - 번들 루트 절대경로
   * @returns BackupEntry[] (최신 백업 우선 정렬)
   */
  async listBackups(bundlePath: string): Promise<BackupEntry[]> {
    const bundleRoot = await this.verifiedBundleRoot(bundlePath)
    const bundleName = path.basename(bundleRoot)
    return listBackupEntries(this.backupRoot, bundleName)
  }

  // ─────────────────────────────────────────────
  // restore — 백업 → 번들 복원
  // ─────────────────────────────────────────────

  /**
   * 지정한 백업 디렉터리의 파일을 번들로 복원한다.
   *
   * 복원 후 HarnessService.normalize(force=true) 로 재정규화한다.
   *
   * 제약:
   * - backupDir 은 <userData>/harness-backups/ 하위여야 한다 (경로 주입 방어).
   *
   * @param bundlePath - 번들 루트 절대경로
   * @param backupDir - 복원 대상 백업 디렉터리 절대경로 (BackupEntry.backupDir)
   * @returns { restored: string[]; model: HarnessModel }
   * @throws HarnessBackupPathDeniedError — backupDir 이 backupRoot 외부인 경우
   */
  async restore(
    bundlePath: string,
    backupDir: string
  ): Promise<{ restored: string[]; model: HarnessModel }> {
    // 번들 루트 검증
    const bundleRoot = await this.verifiedBundleRoot(bundlePath)

    // backupDir 경로 주입 방어 — backupRoot 하위인지 검증
    const realBackupRoot = await fs.realpath(this.backupRoot).catch(() => this.backupRoot)
    let realBackupDir: string
    try {
      realBackupDir = await fs.realpath(backupDir)
    } catch {
      throw new HarnessBackupPathDeniedError(backupDir)
    }

    const rel = path.relative(realBackupRoot, realBackupDir)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new HarnessBackupPathDeniedError(backupDir)
    }

    // 복원 실행
    const restored = await restoreFromBackup(bundleRoot, realBackupDir)

    // 재정규화
    this.harnessService.clearCache(bundlePath)
    const model = await this.harnessService.normalize(bundlePath, true)

    return { restored, model }
  }
}
