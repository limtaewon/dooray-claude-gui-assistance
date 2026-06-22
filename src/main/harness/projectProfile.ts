/**
 * Harness Studio — 로컬 프로젝트 프로파일 수집기 (정적, AI 없음)
 *
 * gatherProjectProfile(projectPath, taskText) 는 로컬 프로젝트 폴더를 정적으로 스캔해
 * Dry-run 레벨 추정의 맥락 신호를 수집한다.
 *
 * 설계 원칙:
 * - 완전히 정적(AI 없음), bound(수초 내 완료, depth/파일수 cap 적용).
 * - 파일 내용은 package.json / CLAUDE.md / README.md 머리 ~2KB 에 한정.
 *   나머지는 경로/이름만(내용 X) — LLM 비용·개인정보 보호.
 * - 오류는 graceful: 개별 항목 실패 시 해당 항목을 빈 값으로 두고 계속 진행.
 * - 파일 실행 금지. 대용량 내용 읽기 금지.
 *
 * cap 정책:
 * - 파일트리 walk: 최대 8000 파일 또는 깊이 6 — 초과 시 중단(truncated=true).
 * - 상위 디렉터리: 최대 150개.
 * - 키워드 매칭: 최대 40개 파일 결과, 12개 키워드.
 * - 파일 내용 읽기: 최대 2048 바이트(첫 머리만).
 */

import { promises as fs } from 'fs'
import * as path from 'path'
import type {
  ProjectProfile,
  TechStackSignal,
  ModuleSignal,
  ScopeSignal,
} from '../../shared/types/harness-dryrun'

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

/** 파일 내용 읽기 최대 바이트 수 (2KB) */
const MAX_HEAD_BYTES = 2048

/** 파일트리 walk 최대 파일 수 */
const MAX_WALK_FILES = 8000

/** 파일트리 walk 최대 깊이 */
const MAX_WALK_DEPTH = 6

/** 상위 디렉터리 목록 최대 항목 수 */
const MAX_TOP_DIRS = 150

/** 키워드 최대 수 */
const MAX_KEYWORDS = 12

/** 매칭 파일 최대 수 */
const MAX_MATCHED_FILES = 40

/** 무시할 최상위 디렉터리 패턴 (walk 시 진입 안 함) */
const IGNORE_DIR_PATTERNS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'out',
  'build',
  '.venv',
  '__pycache__',
  '.gradle',
  '.idea',
  '.vscode',
  'coverage',
  '.nyc_output',
  'target', // Maven/Gradle
  'vendor', // Go/PHP
])

/** 숨김 디렉터리(. 시작) 를 무시하는 정규식 */
const HIDDEN_DIR_RE = /^\./

/** 불용어 — 키워드 추출 시 제거 */
const STOP_WORDS = new Set([
  // 한국어 조사/접속사
  '이', '가', '은', '는', '을', '를', '의', '에', '에서', '로', '으로', '와', '과',
  '도', '도', '만', '까지', '부터', '이나', '또는', '및', '그', '이', '저', '것',
  // 영어 관사/전치사/일반 동사
  'the', 'a', 'an', 'in', 'on', 'at', 'to', 'of', 'for', 'and', 'or', 'not',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'with', 'from', 'by', 'as', 'if', 'but', 'so', 'yet', 'nor',
  // 일반 프로그래밍 용어 (너무 광범위해 신호 가치 낮음)
  'that', 'this', 'can', 'use', 'new', 'set', 'get', 'add', 'run',
])

// ─────────────────────────────────────────────
// 기술스택 수집
// ─────────────────────────────────────────────

/**
 * 빌드 시스템 마커 파일 목록 — 존재 여부만 확인.
 */
const BUILD_MARKERS = [
  'build.gradle',
  'build.gradle.kts',
  'pom.xml',
  'pyproject.toml',
  'setup.py',
  'Pipfile',
  'go.mod',
  'Cargo.toml',
  'CMakeLists.txt',
  'Makefile',
]

/**
 * 프로젝트 루트에서 기술스택 신호를 수집한다.
 *
 * - package.json: name + 의존성 키 목록만.
 * - 빌드 마커: 파일 존재 여부.
 * - CLAUDE.md / README.md: 머리 ~2KB.
 *
 * @param projectPath - 프로젝트 루트 절대경로
 * @returns TechStackSignal
 */
async function collectTechStack(projectPath: string): Promise<TechStackSignal> {
  const signal: TechStackSignal = {
    buildMarkers: [],
  }

  // package.json
  try {
    const pkgPath = path.join(projectPath, 'package.json')
    const raw = await fs.readFile(pkgPath, { encoding: 'utf-8' })
    const pkg = JSON.parse(raw) as {
      name?: string
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const depKeys = new Set<string>([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ])
    signal.packageJson = {
      name: typeof pkg.name === 'string' ? pkg.name : undefined,
      dependencyKeys: Array.from(depKeys),
    }
  } catch {
    // package.json 없거나 파싱 실패 — 무시
  }

  // 빌드 마커 존재 여부
  for (const marker of BUILD_MARKERS) {
    try {
      await fs.access(path.join(projectPath, marker))
      signal.buildMarkers.push(marker)
    } catch {
      // 없으면 그냥 넘어감
    }
  }

  // CLAUDE.md 머리
  try {
    const claudeMdPath = path.join(projectPath, 'CLAUDE.md')
    const buf = Buffer.alloc(MAX_HEAD_BYTES)
    const fd = await fs.open(claudeMdPath, 'r')
    try {
      const { bytesRead } = await fd.read(buf, 0, MAX_HEAD_BYTES, 0)
      signal.claudeMdHead = buf.subarray(0, bytesRead).toString('utf-8')
    } finally {
      await fd.close()
    }
  } catch {
    // CLAUDE.md 없거나 읽기 실패
  }

  // README.md 머리 (CLAUDE.md 없을 때)
  if (!signal.claudeMdHead) {
    for (const name of ['README.md', 'README', 'readme.md']) {
      try {
        const readmePath = path.join(projectPath, name)
        const buf = Buffer.alloc(MAX_HEAD_BYTES)
        const fd = await fs.open(readmePath, 'r')
        try {
          const { bytesRead } = await fd.read(buf, 0, MAX_HEAD_BYTES, 0)
          signal.readmeMdHead = buf.subarray(0, bytesRead).toString('utf-8')
        } finally {
          await fd.close()
        }
        break
      } catch {
        // 해당 파일 없음
      }
    }
  }

  return signal
}

// ─────────────────────────────────────────────
// 도메인/모듈 수집
// ─────────────────────────────────────────────

/**
 * 프로젝트 루트의 상위 1~2 depth 디렉터리명 목록을 수집한다.
 *
 * 무시 목록(node_modules, .git, dist 등) + 숨김 디렉터리 제외.
 * 최대 150개 cap.
 *
 * @param projectPath - 프로젝트 루트 절대경로
 * @returns ModuleSignal
 */
async function collectModules(projectPath: string): Promise<ModuleSignal> {
  const topDirs: string[] = []
  let truncated = false

  const collectLevel = async (dir: string, prefix: string, depth: number): Promise<void> => {
    if (topDirs.length >= MAX_TOP_DIRS) {
      truncated = true
      return
    }
    let entries: import('fs').Dirent<string>[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true, encoding: 'utf-8' })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (HIDDEN_DIR_RE.test(entry.name)) continue
      if (IGNORE_DIR_PATTERNS.has(entry.name)) continue
      if (topDirs.length >= MAX_TOP_DIRS) {
        truncated = true
        return
      }
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      topDirs.push(rel)
      // depth 2 까지만 수집
      if (depth < 2) {
        await collectLevel(path.join(dir, entry.name), rel, depth + 1)
      }
    }
  }

  await collectLevel(projectPath, '', 1)

  return { topDirs, truncated }
}

// ─────────────────────────────────────────────
// 키워드 추출
// ─────────────────────────────────────────────

/**
 * taskText 에서 의미 있는 키워드를 추출한다.
 *
 * - 공백 / 특수문자로 분리
 * - 소문자 변환
 * - 불용어 + 길이 < 3 제거
 * - 최대 MAX_KEYWORDS 개
 *
 * @param taskText - 태스크 설명 평문
 * @returns 키워드 배열 (소문자)
 */
export function extractKeywords(taskText: string): string[] {
  const tokens = taskText
    .toLowerCase()
    // 영숫자/한글/하이픈/점 외 모두 공백으로
    .replace(/[^a-z0-9ㄱ-ㅎ가-힣\-_.]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))

  // 중복 제거 후 앞에서 MAX_KEYWORDS 개
  const seen = new Set<string>()
  const result: string[] = []
  for (const t of tokens) {
    if (!seen.has(t)) {
      seen.add(t)
      result.push(t)
    }
    if (result.length >= MAX_KEYWORDS) break
  }
  return result
}

// ─────────────────────────────────────────────
// 파일트리 walk + 키워드 매칭
// ─────────────────────────────────────────────

/**
 * 프로젝트 파일트리를 walk 해 키워드에 매칭되는 파일 경로를 수집한다.
 *
 * - 파일 내용은 읽지 않음 — 경로/이름만 비교.
 * - IGNORE_DIR_PATTERNS + 숨김 디렉터리는 진입하지 않음.
 * - cap: 최대 MAX_WALK_FILES 파일 또는 MAX_WALK_DEPTH 깊이.
 *
 * @param projectPath - 프로젝트 루트 절대경로
 * @param keywords - 소문자 키워드 배열
 * @returns ScopeSignal
 */
async function collectScope(projectPath: string, keywords: string[]): Promise<ScopeSignal> {
  if (keywords.length === 0) {
    return { keywords, matchedFiles: [], totalMatches: 0, truncated: false }
  }

  const matchedFiles: string[] = []
  let totalMatches = 0
  let filesWalked = 0
  let truncated = false

  const walk = async (dir: string, relBase: string, depth: number): Promise<void> => {
    if (filesWalked >= MAX_WALK_FILES || depth > MAX_WALK_DEPTH) {
      truncated = true
      return
    }
    let entries: import('fs').Dirent<string>[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true, encoding: 'utf-8' })
    } catch {
      return
    }
    for (const entry of entries) {
      if (filesWalked >= MAX_WALK_FILES) {
        truncated = true
        return
      }
      if (entry.isDirectory()) {
        if (HIDDEN_DIR_RE.test(entry.name)) continue
        if (IGNORE_DIR_PATTERNS.has(entry.name)) continue
        await walk(path.join(dir, entry.name), relBase ? `${relBase}/${entry.name}` : entry.name, depth + 1)
      } else if (entry.isFile()) {
        filesWalked++
        const relPath = relBase ? `${relBase}/${entry.name}` : entry.name
        const lower = relPath.toLowerCase()
        const matches = keywords.some((kw) => lower.includes(kw))
        if (matches) {
          totalMatches++
          if (matchedFiles.length < MAX_MATCHED_FILES) {
            matchedFiles.push(relPath)
          }
        }
      }
    }
  }

  await walk(projectPath, '', 0)

  return { keywords, matchedFiles, totalMatches, truncated }
}

// ─────────────────────────────────────────────
// 공개 API
// ─────────────────────────────────────────────

/**
 * 로컬 프로젝트 맥락 신호를 정적으로 수집한다.
 *
 * 완전히 정적(AI 없음), bound(수초 내 완료).
 * 파일 내용은 package.json / CLAUDE.md / README.md 머리 ~2KB 에만 접근.
 *
 * 오류는 graceful: 부분 실패 시 해당 항목을 빈 값으로 두고 진행.
 * 프로파일 수집 실패(최상위 오류)는 caller 가 잡아 warning 로그 후 맥락 없이 진행한다.
 *
 * @param projectPath - 프로젝트 루트 절대경로 (사용자가 다이얼로그로 선택한 경로)
 * @param taskText - 태스크 설명 평문 (키워드 추출 용도)
 * @returns ProjectProfile
 */
export async function gatherProjectProfile(
  projectPath: string,
  taskText: string
): Promise<ProjectProfile> {
  const resolvedPath = path.resolve(projectPath)
  const keywords = extractKeywords(taskText)

  // 각 수집 단계를 병렬로 실행. 개별 실패는 catch 로 graceful 처리.
  const [techStack, modules, scope] = await Promise.all([
    collectTechStack(resolvedPath).catch((): TechStackSignal => ({ buildMarkers: [] })),
    collectModules(resolvedPath).catch((): ModuleSignal => ({ topDirs: [], truncated: false })),
    collectScope(resolvedPath, keywords).catch(
      (): ScopeSignal => ({ keywords, matchedFiles: [], totalMatches: 0, truncated: false })
    ),
  ])

  return {
    projectPath: resolvedPath,
    techStack,
    modules,
    scope,
    collectedAt: new Date().toISOString(),
  }
}
