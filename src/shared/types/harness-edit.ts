/**
 * harness-edit.ts — Harness Studio 편집(저작) 기능 공용 타입
 *
 * 설계 근거: harness-studio-edit-arch.md §1, ADR-harness-studio-edit-001
 *
 * 반영 모델: in-memory draft 누적 → diff 승인 게이트 → 파일에 적용.
 * draft 는 "파일 경로 → 새 내용" 집합(file-centric)으로 표현한다.
 * 구조화 폼/raw 에디터/AI 편집 세 입력 경로 모두 DraftFileEdit 으로 수렴한다.
 *
 * 제약:
 * - 이 파일은 shared 타입 정의만 담는다. electron / Node fs 의존 금지.
 * - renderer ↔ main 양쪽에서 import 가능해야 한다.
 * - 기존 harness.ts / ai.ts 타입을 변경하지 않는다(append-only).
 */

// ─────────────────────────────────────────────
// 편집 출처 추적 (SourceMap)
// ─────────────────────────────────────────────

/**
 * 에이전트 ID → frontmatter 필드별 출처 파일 상대경로 맵.
 *
 * BundleScanner 가 frontmatter 병합 시점에 채운다.
 * 구조화 폼은 이 맵으로 "어느 파일의 frontmatter 를 고칠지"를 결정론적으로 안다.
 * AI 없음, 순수 정적.
 *
 * 제약:
 * - relPath 는 번들 루트 기준 POSIX 상대경로 (BundleScanner.fileTree 와 동일 키).
 * - 키 부재(undefined)는 해당 필드가 번들 내 어느 파일에도 없음을 의미.
 *   model 키 부재 → nameFile 에 신규 추가 대상.
 *   tools 키 부재 → nameFile 에 신규 추가 대상.
 */
export interface AgentFileSource {
  /**
   * name: 이 정의된 파일 상대경로 (에이전트 정규화 기준 파일).
   * 항상 존재 — id 가 있으면 name: 을 가진 파일이 반드시 있다.
   */
  nameFile: string
  /**
   * model: 키가 실재하는 파일 상대경로.
   * 없으면 undefined → nameFile 에 신규 추가 대상.
   * reined-bmad: _agents/<id>.md / neon-bmad: <role>/SKILL.md (없는 경우 많음)
   */
  modelFile?: string
  /**
   * tools:/allowed-tools: 가 정의된 파일 상대경로.
   * 없으면 undefined → nameFile 에 신규 추가 대상.
   */
  toolsFile?: string
}

/**
 * 번들 내 에이전트별 frontmatter 필드 출처 파일 인덱스.
 * agentId → AgentFileSource.
 *
 * RawBundle.agentSourceMap 에 저장되며,
 * HarnessEditService / 구조화 폼(renderer)이 편집 대상 파일을 결정할 때 참조한다.
 */
export interface AgentSourceMap {
  [agentId: string]: AgentFileSource
}

// ─────────────────────────────────────────────
// draft 표현 (file-centric)
// ─────────────────────────────────────────────

/**
 * 단일 파일에 대한 편집 초안 1건.
 *
 * 폼/raw/AI 어느 경로로 만들어도 동일한 구조로 수렴한다.
 * 한 파일에 대한 편집은 항상 최신 1건만 유지하며
 * baseContent(최초 스냅샷)는 불변(충돌 감지 기준).
 *
 * 제약:
 * - relPath 는 번들 루트 기준 POSIX 상대경로. 절대경로 금지.
 * - baseContent 는 draft 생성 시점의 디스크 원본 내용 스냅샷.
 *   적용 직전 sha 대조에 사용되므로 편집 후 갱신하지 않는다.
 * - draftContent 는 전체 파일 텍스트. 부분 패치 금지(파일 통째 교체).
 */
export interface DraftFileEdit {
  /**
   * 번들 루트 기준 상대경로 (POSIX '/').
   * BundleScanner.fileTree 와 동일 키 형식.
   */
  relPath: string
  /**
   * 파일 디스크 원본 내용 (draft 생성 시점 스냅샷).
   * 적용 직전 sha 대조로 외부 변경(충돌) 감지에 사용한다.
   * 신규 파일 생성 draft 면 빈 문자열.
   */
  baseContent: string
  /**
   * draft 가 제안하는 새 내용 (전체 파일 텍스트).
   * 적용 시 이 내용을 그대로 파일에 쓴다.
   */
  draftContent: string
  /**
   * 이 편집을 만든 입력 경로.
   * - 'form': 구조화 필드 폼 (model 드롭다운 / tools 멀티셀렉트)
   * - 'raw': Monaco raw 에디터 직접 편집
   * - 'ai': AI 자연어 명령 → 제안 승인
   */
  origin: 'form' | 'raw' | 'ai'
  /**
   * form 편집일 때 어떤 구조화 필드에서 왔는지 (감사/표시용).
   * 예) 'agents[0].model', 'agents[1].tools'
   * origin='form' 일 때만 의미 있음.
   */
  fieldPath?: string
  /**
   * AI 편집일 때 사용자 명령 원문 (감사 추적).
   * origin='ai' 일 때만 의미 있음.
   */
  aiCommand?: string
  /** draft 생성 시각 (ISO 8601) */
  editedAt: string
  /**
   * renderer 가 HARNESS_DIFF_DRAFT 응답으로 표시하는 외부 변경 충돌 플래그.
   *
   * main 의 STALE 감지 결과를 renderer 가 draft 에 기록해 UI 에서
   * 적용 버튼 비활성화 등에 사용한다. IPC 전송 후 main 이 독립적으로
   * 재검증하므로 이 값은 UI 힌트용 — main 은 이 필드를 무시한다.
   *
   * 선택적 필드이므로 기존 DraftFileEdit 직렬화에 영향 없음.
   */
  stale?: boolean
}

/**
 * 한 번들에 대한 편집 세션 전체 draft.
 *
 * renderer 에서 in-memory 로 관리된다.
 * 적용(apply) 시 main 으로 draft 전체를 넘겨 원자적으로 처리한다.
 * 앱 재시작 시 draft 는 소멸한다(영속 저장 미구현 — 잔여 결정 §11).
 *
 * 제약:
 * - edits 의 같은 relPath 에는 항상 최신 편집 1건만 유지.
 *   같은 파일을 재편집하면 draftContent 를 갱신하고 baseContent 는 유지.
 * - 모델을 직접 패치하지 않는다. 적용 후 재스캔/재정규화로 모델을 재생성.
 */
export interface HarnessDraft {
  /**
   * 대상 번들 루트 절대경로.
   * HarnessEditService 가 쓰기 경로 검증의 기준점으로 사용한다.
   */
  bundlePath: string
  /**
   * draft 생성 기준 bundleHash.
   * 적용 직전 현재 해시와 대조해 외부 번들 변경(충돌)을 감지한다.
   * 충돌 시 STALE 에러를 반환하고 사용자에게 재로드를 유도한다.
   */
  baseBundleHash: string
  /**
   * relPath → DraftFileEdit (한 파일 최신 편집만 유지).
   * 동일 relPath 를 재편집하면 값을 갱신(baseContent 고정, draftContent 갱신).
   */
  edits: Record<string, DraftFileEdit>
}

// ─────────────────────────────────────────────
// diff 요약 (적용 전 미리보기)
// ─────────────────────────────────────────────

/**
 * 파일 1건에 대한 diff 요약.
 *
 * HARNESS_DIFF_DRAFT 응답에서 파일별로 반환된다.
 * renderer 의 DraftDiffView 가 이 값으로 "N줄 변경" 뱃지를 표시한다.
 */
export interface FileDiffSummary {
  /** 번들 루트 기준 상대경로 */
  relPath: string
  /** 변경된 줄 수 (baseContent ↔ draftContent 비교) */
  changedLines: number
  /** 추가된 줄 수 */
  addedLines: number
  /** 삭제된 줄 수 */
  removedLines: number
  /**
   * 디스크 현재 내용이 baseContent 와 sha 불일치하면 true.
   * true 이면 적용(apply) 단계에서 STALE 에러가 발생한다.
   * 사용자에게 "외부에서 파일이 변경됐습니다. 재로드 후 재시도해주세요" 안내.
   */
  stale: boolean
  /** 신규 파일 생성 draft (baseContent='')인지 여부 */
  isNew: boolean
}

/**
 * 번들 전체에 대한 draft diff 요약.
 *
 * HARNESS_DIFF_DRAFT 응답 타입.
 * 적용 전 미리보기 화면(DraftDiffView)과 ApplyDialog 에서 사용한다.
 */
export interface DraftDiffSummary {
  /** 파일별 diff 요약 목록 */
  files: FileDiffSummary[]
  /** stale=true 인 파일이 1건 이상 → 적용 불가. ApplyDialog 에서 차단. */
  hasStale: boolean
  /** .sh 파일이 편집 대상에 포함됐는지 (ApplyDialog 빨간 경고 배너 트리거) */
  hasShellEdit: boolean
}

// ─────────────────────────────────────────────
// AI 편집 제안 (HARNESS_AI_EDIT)
// ─────────────────────────────────────────────

/**
 * AI 가 제안한 단일 파일 편집안.
 *
 * HARNESS_AI_EDIT 응답의 proposals 배열 항목.
 * 이 제안은 자동 적용되지 않는다.
 * 사용자 승인 후 DraftFileEdit 으로 변환되어 HarnessDraft 에 반영된다.
 *
 * 제약:
 * - relPath 는 요청한 targetRelPaths 화이트리스트 교집합에서만 채택.
 *   AI 가 화이트리스트 밖 파일을 반환하면 HarnessEditService 가 드롭한다.
 * - newContent 는 전체 파일 텍스트 (unified diff 아님).
 */
export interface AIEditProposal {
  /**
   * 편집 대상 파일 상대경로.
   * targetRelPaths 에 없는 경로는 드롭된다.
   */
  relPath: string
  /** AI 가 제안하는 새 파일 전체 내용 */
  newContent: string
  /**
   * AI 가 설명하는 변경 근거 (한국어 허용).
   * DraftDiffView 에서 사용자에게 표시된다.
   */
  rationale: string
}

// ─────────────────────────────────────────────
// 백업 정보 (HARNESS_LIST_BACKUPS / HARNESS_RESTORE_BACKUP)
// ─────────────────────────────────────────────

/**
 * 단일 백업 항목.
 *
 * HARNESS_LIST_BACKUPS 응답의 배열 항목.
 * 사용자가 BackupRestorePanel 에서 특정 시점으로 복원할 때 backupDir 을 선택한다.
 */
export interface BackupEntry {
  /**
   * 백업 디렉터리 절대경로.
   * `<userData>/harness-backups/<bundleName>/<ISO타임스탬프>/` 형식.
   * HARNESS_RESTORE_BACKUP 요청의 backupDir 로 그대로 사용한다.
   */
  backupDir: string
  /** 백업 생성 시각 (ISO 8601) */
  createdAt: string
  /** 백업된 파일의 상대경로 목록 (번들 루트 기준) */
  files: string[]
}
