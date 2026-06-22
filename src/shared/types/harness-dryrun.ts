/**
 * Harness Studio — Dry-run 프로젝트 프로파일 타입
 *
 * gatherProjectProfile() 이 수집하는 로컬 프로젝트 맥락 데이터.
 * Dry-run 레벨 추정 시 AI 에 "## 프로젝트 맥락" 섹션으로 전달된다.
 *
 * 설계 원칙:
 * - 파일 내용은 package.json / CLAUDE.md / README.md 머리 ~2KB 에 한정.
 * - 나머지 정보는 경로/이름만(내용 X) — 최소한의 신호만 수집.
 * - gatherProjectProfile 는 완전히 정적(AI 없음), bound(수초 내 완료).
 */

// ─────────────────────────────────────────────
// 기술스택 신호
// ─────────────────────────────────────────────

/**
 * 감지된 기술스택 신호.
 * package.json 존재 여부 + 의존성 키 목록, 주요 빌드 파일 존재 여부로 결정한다.
 */
export interface TechStackSignal {
  /**
   * package.json 이 발견된 경우 name + 의존성 키 목록.
   * 의존성 목록은 dependencies + devDependencies 의 키만(버전 X) — 프라이버시·크기 절감.
   */
  packageJson?: {
    name?: string
    /** dependencies + devDependencies 키 병합 목록 (중복 제거) */
    dependencyKeys: string[]
  }
  /** 감지된 빌드 시스템 마커 파일 목록. 예: ['build.gradle', 'pom.xml'] */
  buildMarkers: string[]
  /** CLAUDE.md 머리 ~2KB (없으면 undefined) */
  claudeMdHead?: string
  /** README.md 머리 ~2KB (없으면 undefined) */
  readmeMdHead?: string
}

// ─────────────────────────────────────────────
// 도메인/모듈 신호
// ─────────────────────────────────────────────

/**
 * 프로젝트 상위 디렉터리 구조 신호.
 * 상위 1~2 depth 디렉터리명 목록 — node_modules/.git/dist/out/build/.* 등 제외.
 */
export interface ModuleSignal {
  /**
   * 1~2 depth 디렉터리명 목록 (최대 150개 cap).
   * 예: ['src', 'src/main', 'src/renderer', 'src/shared', 'test', 'scripts']
   */
  topDirs: string[]
  /** 총 디렉터리 수가 cap(150)을 초과해 중단된 경우 true */
  truncated: boolean
}

// ─────────────────────────────────────────────
// 범위 신호 (태스크 키워드 매칭)
// ─────────────────────────────────────────────

/**
 * 태스크 텍스트 키워드를 파일 경로/이름에 매칭한 결과.
 * 파일 내용은 읽지 않고 경로/이름만 비교한다.
 */
export interface ScopeSignal {
  /**
   * 추출된 키워드 목록 (최대 12개).
   * taskText 에서 공백/특수문자로 분리 후 불용어·길이<3 제거.
   */
  keywords: string[]
  /**
   * 키워드에 매칭된 파일 경로 목록 (최대 40개, 경로만).
   * 매칭 기준: 파일 경로(소문자)에 키워드(소문자)가 포함되는 경우.
   */
  matchedFiles: string[]
  /** 실제 총 매칭 수 (matchedFiles 가 cap 초과 전체 수) */
  totalMatches: number
  /**
   * 파일트리 walk 가 cap(최대 8000 파일 또는 깊이 6)을 초과해 중단된 경우 true.
   * matchedFiles 는 중단 시점까지의 결과만 포함한다.
   */
  truncated: boolean
}

// ─────────────────────────────────────────────
// ProjectProfile — 최상위 타입
// ─────────────────────────────────────────────

/**
 * gatherProjectProfile() 이 반환하는 프로젝트 맥락 요약.
 *
 * 이 구조를 toPromptText(profile) 로 텍스트 요약으로 변환하면
 * AIService.estimateLevel 의 projectContext 인자로 전달된다.
 */
export interface ProjectProfile {
  /** 스캔한 프로젝트 루트 절대경로 */
  projectPath: string
  /** 기술스택 신호 */
  techStack: TechStackSignal
  /** 도메인/모듈 신호 */
  modules: ModuleSignal
  /** 범위 신호 */
  scope: ScopeSignal
  /**
   * 수집 시각 (ISO 8601).
   * taskHash 에 포함되지 않음 — 맥락 내용(projectPath + 의존성 + 디렉터리)만 캐시 키에 사용.
   */
  collectedAt: string
}

// ─────────────────────────────────────────────
// toPromptText — AI 입력용 요약 문자열
// ─────────────────────────────────────────────

/**
 * ProjectProfile 을 AI 프롬프트에 삽입할 텍스트 요약으로 변환한다.
 *
 * 결과는 AIService.estimateLevel 의 userPrompt 안
 * "## 프로젝트 맥락" 섹션으로 삽입된다.
 *
 * 제약:
 * - 파일 내용(package.json 전체, CLAUDE.md 전체 등)은 포함하지 않는다.
 * - 경로/이름/키워드/키 목록만 나열해 토큰 절약.
 *
 * @param profile - gatherProjectProfile() 반환 값
 * @returns 마크다운 형식의 프로젝트 맥락 문자열
 */
export function toPromptText(profile: ProjectProfile): string {
  const lines: string[] = []

  lines.push(`프로젝트 경로: ${profile.projectPath}`)

  // 기술스택
  const ts = profile.techStack
  if (ts.packageJson) {
    const name = ts.packageJson.name ? ` (${ts.packageJson.name})` : ''
    lines.push(`package.json 감지됨${name}`)
    if (ts.packageJson.dependencyKeys.length > 0) {
      lines.push(`주요 의존성 키: ${ts.packageJson.dependencyKeys.slice(0, 40).join(', ')}`)
    }
  }
  if (ts.buildMarkers.length > 0) {
    lines.push(`빌드 마커 파일: ${ts.buildMarkers.join(', ')}`)
  }
  if (ts.claudeMdHead) {
    lines.push(`CLAUDE.md 요약:\n${ts.claudeMdHead.substring(0, 600)}`)
  } else if (ts.readmeMdHead) {
    lines.push(`README.md 요약:\n${ts.readmeMdHead.substring(0, 600)}`)
  }

  // 도메인/모듈
  if (profile.modules.topDirs.length > 0) {
    const truncNote = profile.modules.truncated ? ' (cap 초과, 일부만 표시)' : ''
    lines.push(`상위 디렉터리 구조${truncNote}: ${profile.modules.topDirs.slice(0, 60).join(', ')}`)
  }

  // 범위 신호
  const sc = profile.scope
  if (sc.keywords.length > 0) {
    lines.push(`태스크 키워드: ${sc.keywords.join(', ')}`)
  }
  if (sc.matchedFiles.length > 0) {
    const truncNote = sc.truncated ? ` (총 ${sc.totalMatches}건 중 일부)` : ''
    lines.push(`키워드 매칭 파일${truncNote}:\n${sc.matchedFiles.slice(0, 40).join('\n')}`)
  }

  return lines.join('\n')
}

// ─────────────────────────────────────────────
// profileSignature — 캐시 키용 서명
// ─────────────────────────────────────────────

/**
 * ProjectProfile 의 핵심 내용 기반 서명 문자열.
 * taskHash 에 projectPath + 이 서명을 포함해, 맥락이 달라지면 캐시가 분리된다.
 *
 * 수집 시각(collectedAt)은 포함하지 않는다 — 내용이 같으면 캐시 hit 를 유지해야 함.
 *
 * @param profile - gatherProjectProfile() 반환 값
 * @returns 서명 문자열 (변경 감지용, 해시 입력 소재)
 */
export function profileSignature(profile: ProjectProfile): string {
  const parts: string[] = [
    profile.projectPath,
    profile.techStack.packageJson?.name ?? '',
    profile.techStack.packageJson?.dependencyKeys.slice(0, 20).join(',') ?? '',
    profile.techStack.buildMarkers.join(','),
    profile.modules.topDirs.slice(0, 30).join(','),
    profile.scope.keywords.join(','),
  ]
  return parts.join('|')
}
