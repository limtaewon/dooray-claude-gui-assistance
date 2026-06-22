/**
 * BundleScanner.ts — 번들 디렉터리 트리 워크 + frontmatter 파싱 → RawBundle 생성
 *
 * BundleScanner.scan(bundlePath) 는:
 * 1. 번들 디렉터리를 재귀 탐색하여 파일 목록을 수집한다
 * 2. .md 파일에서 frontmatter 를 파싱한다 (_agents / SKILL.md / _templates 등)
 * 3. gate / hook 스크립트(.sh)의 텍스트를 수집하여 규칙코드를 정적 파싱한다 (절대 실행 금지)
 * 4. bundleDetect 로 kind 를 판정한다
 * 5. bundleHash 를 계산한다
 *
 * 모든 작업은 AI 호출 없이 순수 정적 분석으로 수행된다.
 * AI 가 채우는 [AI] 필드는 비워두고 provenance 에 'absent' 로 기록한다.
 *
 * ADR-harness-studio-001, ADR-harness-studio-002 참조.
 *
 * 제약:
 * - .sh 파일은 텍스트로만 읽으며 절대 실행(spawn/exec) 하지 않는다 (보안).
 * - AI 호출 금지 (M1 범위).
 * - 오류 발생 시 크래시하지 않고 warnings 에 기록하고 계속 진행한다.
 */

import { promises as fs, type Dirent } from 'fs'
import * as path from 'path'
import { parseFrontmatter } from './frontmatter'
import { computeBundleHash, type FileHashEntry } from './bundleHash'
import { detectBundleKind } from './bundleDetect'
import type { RawBundleSummary } from '../../shared/types/harness'
import type { HarnessAgent, HarnessGate, HarnessHook, HarnessMeta, FieldSource } from '../../shared/types/harness'
import type { AgentSourceMap } from '../../shared/types/harness-edit'

// ─────────────────────────────────────────────
// 내부 중간 표현 타입 (AI 정규화 전 정적 데이터)
// ─────────────────────────────────────────────

/** 정적 스캔으로 수집한 에이전트 스텁 (AI 필드 미포함) */
export type AgentStub = Pick<HarnessAgent, 'id' | 'displayName' | 'model' | 'modelSource' | 'tools'>

/** 정적 스캔으로 수집한 게이트 정보 */
export interface RawGate extends HarnessGate {
  /** 게이트 스크립트 파일명 (상대경로) */
  scriptFile: string
}

/** 정적 스캔으로 수집한 hook 정보 */
export interface RawHook extends HarnessHook {
  /** hook 스크립트 절대경로 */
  absolutePath: string
}

/** 템플릿 파일에서 정적으로 수집한 정보 */
export interface RawTemplate {
  /** 파일명 stem (예: story, impl-log) */
  stem: string
  /** frontmatter 키 목록 */
  frontmatterKeys: string[]
  /** ## 헤더 목록 */
  sections: string[]
}

/**
 * BundleScanner.scan() 의 완전한 정적 스캔 결과.
 * HarnessNormalizer 가 이를 받아 AI 로 [AI] 필드를 보강하여 HarnessModel 을 완성한다.
 */
export interface RawBundle {
  /** 번들 루트 절대경로 */
  bundlePath: string
  /** 감지된 번들 kind */
  kind: HarnessMeta['kind']
  /** bundleHash — 캐시 키 */
  bundleHash: string
  /** 번들 내 파일 상대경로 목록 (디렉터리 제외) */
  fileTree: string[]
  /** frontmatter 파싱으로 수집한 에이전트 스텁 목록 */
  agentStubs: AgentStub[]
  /** 정적으로 수집한 게이트 목록 (규칙코드/phase/blocking 포함) */
  gates: RawGate[]
  /** 정적으로 수집한 hook 목록 */
  hooks: RawHook[]
  /** 템플릿 파일 목록 (_templates/*.md) */
  templates: RawTemplate[]
  /** 스캔 중 발견한 경고 메시지 */
  warnings: string[]
  /** VERSION 파일 내용 */
  version?: string
  /** _core/models.md 내용 (model 매트릭스 폴백용) */
  modelsMatrixRaw?: string
  /**
   * 에이전트 ID → frontmatter 필드별 출처 파일 상대경로 인덱스.
   *
   * 편집 기능(M1+)이 "어느 파일의 frontmatter 를 고칠지"를 결정론적으로 파악하기 위해
   * 병합 시점에 기록한다. AI 없음, 순수 정적.
   *
   * 기존 agentStubs 의 model/tools 값은 불변 — SourceMap 은 별도 맵으로 분리.
   * read-only 기능은 이 필드를 무시해도 동작에 영향이 없다(append-only).
   */
  agentSourceMap: AgentSourceMap
}

// ─────────────────────────────────────────────
// 규칙코드 정적 추출 (게이트 스크립트 파싱)
// ─────────────────────────────────────────────

/**
 * 게이트 스크립트(.sh) 텍스트에서 페이즈 case 라벨 목록을 추출한다.
 *
 * 지원 패턴:
 * - bash case 문: `analyst)`, `dev)`, `qa)`, `release)` 등
 */
function extractPhaseLabels(scriptText: string): string[] {
  const labels: string[] = []
  // case "$PHASE" in 블록 내 라벨 패턴: 단어만으로 된 case 항목
  const phasePattern = /^\s{0,8}([a-zA-Z][a-zA-Z0-9_-]*)\)\s*$/gm
  let match: RegExpExecArray | null
  while ((match = phasePattern.exec(scriptText)) !== null) {
    const label = match[1]
    // bash 예약어 및 일반 패턴 제외
    if (!['esac', 'then', 'else', 'fi', 'do', 'done', 'in'].includes(label)) {
      labels.push(label)
    }
  }
  return [...new Set(labels)]
}

/**
 * 게이트 스크립트 텍스트에서 규칙코드를 추출한다.
 *
 * 인식하는 코드 패턴:
 * - R500~R599: reined-bmad 스타일 (R501, R510, R560 등)
 * - NEON-Gxx: neon-bmad 게이트 코드 (NEON-G01, NEON-G51 등)
 * - NEON-AOP01, NEON-LYR01 등: neon-bmad 도메인 코드 (하이픈 포함 복합 코드)
 * - AOP01, LYR01: 단독 약어형
 * - G51 등: 단독 숫자 코드
 *
 * 패턴 설명:
 * - `R[0-9]{2,4}`: R501, R5101 등
 * - `[A-Z]{2,10}-[A-Z]{1,10}[0-9]{1,3}`: NEON-G01, NEON-AOP01, NEON-LYR01 (하이픈 복합)
 * - `[A-Z]{2,10}[0-9]{2,3}`: AOP01, LYR01, G51 (단독 약어)
 */
export function extractRuleCodes(scriptText: string): string[] {
  // 복합 패턴 먼저, 단독 패턴 나중 (longest-match 원칙 유지)
  const pattern = /\b(R[0-9]{2,4}|[A-Z]{2,10}-[A-Z]{1,10}[0-9]{1,3}|[A-Z]{2,10}[0-9]{2,3})\b/g
  const codes = new Set<string>()
  for (const line of scriptText.split('\n')) {
    // 순수 주석 줄 제외 — 주석에 적힌 코드 범위(예: "# 출처: R500~R561")를
    // 실제 강제 규칙으로 오인하지 않도록 한다(메시지 없는 유령 코드 방지).
    if (/^\s*#/.test(line)) continue
    let match: RegExpExecArray | null
    pattern.lastIndex = 0
    while ((match = pattern.exec(line)) !== null) {
      codes.add(match[1])
    }
  }
  return [...codes].sort()
}

/** 규칙 코드 인식 정규식 (단일 코드) */
const RULE_CODE_RE = /\b(R[0-9]{2,4}|[A-Z]{2,10}-[A-Z]{1,10}[0-9]{1,3}|[A-Z]{2,10}[0-9]{2,3})\b/

/**
 * 게이트 스크립트에서 **규칙 코드별 메시지**를 추출한다.
 *
 * 스크립트는 `gate_fail R510 "메시지"` / `block "NEON-PUSH01" "메시지"` /
 * `NEON-G01 "brief.md 없음"` 처럼 코드 뒤에 사람이 읽는 메시지를 둔다.
 * 코드만으로는 의미를 알 수 없으므로 이 메시지를 그대로 살려 이해도를 높인다.
 *
 * 추출 전략(라인 단위, nested `$(basename "$f")` 같은 중첩 따옴표도 보존):
 * - 한 줄에서 코드를 찾고, 코드 뒤 첫 `"` 부터 그 줄 마지막 `"` 까지를 메시지로 본다.
 * - 앞뒤 따옴표/공백/리다이렉트 기호는 정리. 코드별 첫 메시지만 채택(중복 무시).
 *
 * @param scriptText 게이트/hook 스크립트 전체 텍스트
 * @returns 코드→메시지 배열 (메시지가 있는 코드만)
 */
export function extractRuleDetails(scriptText: string): { code: string; message: string }[] {
  const map = new Map<string, string>()
  for (const line of scriptText.split('\n')) {
    // 순수 주석 줄 제외 (주석 속 코드 범위 오인 방지)
    if (/^\s*#/.test(line)) continue
    const m = RULE_CODE_RE.exec(line)
    if (!m) continue
    const code = m[1]
    if (map.has(code)) continue
    const afterCode = line.slice(m.index + m[0].length)
    const first = afterCode.indexOf('"')
    const last = afterCode.lastIndexOf('"')
    if (first < 0 || last <= first) continue
    const message = afterCode
      .slice(first + 1, last)
      .replace(/^["\s>&|]+/, '') // 따옴표/공백/리다이렉트 잔여 제거 (block "CODE" "msg" 형태)
      // 셸 변수 prefix 정리 — "$(basename "$f"): ..." / "${f}: ..." → 본문만 (가독성)
      .replace(/^\$\(basename[^)]*\)\s*:?\s*/, '')
      .replace(/^\$\{?[a-zA-Z_][a-zA-Z0-9_]*\}?\s*:?\s*/, '')
      .replace(/["\s]+$/, '')
      .trim()
    if (message) map.set(code, message)
  }
  return [...map].map(([code, message]) => ({ code, message }))
}

/**
 * 게이트 스크립트 텍스트에서 blocking 여부를 판정한다.
 * exit 1 또는 exit 2 가 있으면 진짜 차단으로 간주한다.
 * exit 0 만 있으면 경고성이므로 false.
 */
export function detectBlocking(scriptText: string): boolean {
  return /\bexit\s+[12]\b/.test(scriptText)
}

/**
 * 게이트 스크립트를 정적으로 파싱하여 phase 별 RawGate 목록을 반환한다.
 *
 * 파싱 전략:
 * - 전체 스크립트에서 규칙코드 전체를 뽑아 phase 별 case 블록으로 배분
 * - 헬퍼 함수 내 코드처럼 phase 블록 바깥에 있는 코드는 각 phase 에 합산 포함
 * - phase 없으면 단일 게이트(phase='*') 반환
 *
 * 주의: 헬퍼 함수(code_domain_checks 등)가 dev) 블록에서 호출될 때, 함수 정의 내
 * 규칙코드도 해당 게이트에 포함되어야 한다. case 블록 바깥의 전체 코드를 base 로
 * 각 phase 코드에 합산한다(union). AI 라벨링이 최종 의미를 정리한다.
 *
 * @param scriptText 게이트 스크립트 전체 텍스트
 * @param scriptFile 상대경로 (RawGate.scriptFile)
 */
export function parseGateScript(scriptText: string, scriptFile: string): RawGate[] {
  const phases = extractPhaseLabels(scriptText)
  const allCodes = extractRuleCodes(scriptText)
  const blocking = detectBlocking(scriptText)
  // 코드→메시지 전역 맵 (각 게이트는 자기 ruleCodes 에 해당하는 메시지만 추려 담는다)
  const detailMap = new Map(extractRuleDetails(scriptText).map((d) => [d.code, d.message]))
  const detailsFor = (codes: string[]): { code: string; message: string }[] =>
    codes.filter((c) => detailMap.has(c)).map((c) => ({ code: c, message: detailMap.get(c)! }))

  if (phases.length === 0) {
    // phase 없음 — 단일 게이트
    return [{
      phase: '*',
      ruleCodes: allCodes,
      ruleDetails: detailsFor(allCodes),
      blocking,
      scriptFile,
    }]
  }

  // case 블록 이전 텍스트(헬퍼 함수 정의 포함) + 이후 텍스트에서 "베이스 코드" 추출
  // 베이스 코드는 모든 phase 에 공통으로 적용될 수 있다
  const caseBlockStart = /\bcase\b.*\bin\b/m
  const caseStart = caseBlockStart.exec(scriptText)
  const preBlockText = caseStart ? scriptText.slice(0, caseStart.index) : ''
  const baseCodes = extractRuleCodes(preBlockText)

  // phase 별로 스크립트 텍스트를 분할하여 해당 블록의 규칙코드를 할당한다
  const gates: RawGate[] = []

  for (const phase of phases) {
    // 해당 phase case 블록 추출
    const phaseStart = new RegExp(`^\\s{0,8}${escapeRegex(phase)}\\)`, 'm')
    const startMatch = phaseStart.exec(scriptText)
    if (!startMatch) {
      gates.push({ phase, ruleCodes: baseCodes, blocking, scriptFile })
      continue
    }

    // 다음 case 항목 또는 esac 까지 블록 추출
    const afterStart = scriptText.slice(startMatch.index + startMatch[0].length)
    const nextCaseOrEsac = /^[\s]{0,8}([a-zA-Z][a-zA-Z0-9_-]*\)|esac)/m
    const endMatch = nextCaseOrEsac.exec(afterStart)
    const blockText = endMatch
      ? afterStart.slice(0, endMatch.index)
      : afterStart

    // phase 블록에서 직접 추출한 코드 + 헬퍼 함수 호출명으로 연결된 baseCodes 합산
    const phaseCodes = extractRuleCodes(blockText)
    const combined = [...new Set([...baseCodes, ...phaseCodes])].sort()

    gates.push({
      phase,
      ruleCodes: combined,
      ruleDetails: detailsFor(combined),
      blocking,
      scriptFile,
    })
  }

  return gates
}

// ─────────────────────────────────────────────
// 파일 트리 워크 헬퍼
// ─────────────────────────────────────────────

/** 재귀 탐색 시 무시할 경로 패턴 (node_modules, .git 등) */
const IGNORE_PATTERNS = [
  /^node_modules$/,
  /^\.git$/,
  /^\.DS_Store$/,
  /^__pycache__$/,
]

/**
 * 디렉터리를 재귀 탐색하여 파일 경로 목록(상대경로)과 fs.Stats 맵을 반환한다.
 *
 * @param rootPath 탐색 시작 절대경로 (번들 루트)
 * @param currentPath 현재 탐색 절대경로
 * @param relativePaths 수집 배열 (상대경로)
 * @param statsMap 경로 → Stats 맵
 * @param depth 현재 깊이 (최대 깊이 제한용)
 */
async function walkDirectory(
  rootPath: string,
  currentPath: string,
  relativePaths: string[],
  statsMap: Map<string, { mtimeMs: number; size: number }>,
  depth = 0,
): Promise<void> {
  // 무한 재귀 방지 (최대 10 레벨)
  if (depth > 10) return

  let entries: Dirent<string>[]
  try {
    entries = await fs.readdir(currentPath, { withFileTypes: true, encoding: 'utf8' })
  } catch {
    return
  }

  for (const entry of entries) {
    // 무시 패턴 체크
    if (IGNORE_PATTERNS.some((p) => p.test(entry.name))) continue

    const absPath = path.join(currentPath, entry.name)
    // 상대경로는 항상 POSIX 구분자('/')로 정규화한다.
    // bundleDetect/agent·템플릿 탐지가 전부 '/' 패턴(^_core/, /SKILL.md, _agents/ 등)으로
    // 매칭하므로, Windows 의 '\' 구분자를 그대로 두면 bundle 오판·스텁 누락이 발생한다(크로스플랫폼 회귀).
    const relPath = path.relative(rootPath, absPath).split(path.sep).join('/')

    if (entry.isDirectory()) {
      await walkDirectory(rootPath, absPath, relativePaths, statsMap, depth + 1)
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(absPath)
        relativePaths.push(relPath)
        statsMap.set(relPath, { mtimeMs: stat.mtimeMs, size: stat.size })
      } catch {
        // stat 실패 시 스킵
      }
    }
  }
}

// ─────────────────────────────────────────────
// 에이전트 스텁 파싱 헬퍼
// ─────────────────────────────────────────────

/**
 * 파일명 또는 frontmatter name 에서 에이전트 displayName 을 추출한다.
 * "reined-bmad-developer" → "developer", "neon-bmad-developer" → "developer"
 *
 * 방법: 번들 이름(디렉터리명)을 접두어로 제거. 없으면 name 그대로.
 */
function extractDisplayName(agentName: string, bundleName: string): string {
  // "reined-bmad-developer" → "developer"
  const prefix = bundleName + '-'
  if (agentName.startsWith(prefix)) {
    return agentName.slice(prefix.length)
  }
  // 접두어 없으면 name 을 '-' 로 분리하여 마지막 세그먼트
  const parts = agentName.split('-')
  if (parts.length > 1) {
    // 길이가 길면 마지막 세그먼트만 (단순 추출)
    return parts[parts.length - 1]
  }
  return agentName
}

/**
 * frontmatter model 문자열을 HarnessModelName 으로 정규화한다.
 * 알 수 없는 값은 'unknown' 으로 반환한다.
 */
function normalizeModel(raw: string | undefined): { model: HarnessAgent['model']; source: FieldSource } {
  if (!raw) return { model: 'unknown', source: 'absent' }
  const lower = raw.toLowerCase()
  if (lower.includes('haiku')) return { model: 'haiku', source: 'static' }
  if (lower.includes('sonnet')) return { model: 'sonnet', source: 'static' }
  if (lower.includes('opus')) return { model: 'opus', source: 'static' }
  return { model: 'unknown', source: 'static' }
}

// ─────────────────────────────────────────────
// 텍스트에서 ## 헤더 추출 헬퍼
// ─────────────────────────────────────────────

/**
 * 마크다운 본문에서 ## 레벨 헤더 목록을 추출한다.
 */
function extractH2Sections(content: string): string[] {
  const sections: string[] = []
  const pattern = /^##\s+(.+)$/gm
  let match: RegExpExecArray | null
  while ((match = pattern.exec(content)) !== null) {
    sections.push(match[1].trim())
  }
  return sections
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─────────────────────────────────────────────
// BundleScanner 클래스
// ─────────────────────────────────────────────

/**
 * 번들 디렉터리 정적 스캐너.
 *
 * scan(bundlePath) 를 호출하면 파일 트리 워크, frontmatter 파싱,
 * 게이트/hook 스크립트 텍스트 수집, bundleHash 계산을 수행하고
 * RawBundle 을 반환한다. AI 호출 없음.
 *
 * 오류는 throw 하지 않고 warnings 에 기록하여 graceful degradation 을 보장한다.
 */
export class BundleScanner {
  /**
   * 번들 디렉터리를 정적으로 스캔하여 RawBundle 을 반환한다.
   *
   * @param bundlePath 번들 루트 절대경로
   */
  async scan(bundlePath: string): Promise<RawBundle> {
    const warnings: string[] = []
    const bundleName = path.basename(bundlePath)

    // ── 1. 파일 트리 워크 ──────────────────────────────
    const relativePaths: string[] = []
    const statsMap = new Map<string, { mtimeMs: number; size: number }>()

    try {
      await walkDirectory(bundlePath, bundlePath, relativePaths, statsMap)
    } catch (err) {
      warnings.push(`파일 트리 탐색 실패: ${err instanceof Error ? err.message : String(err)}`)
    }

    // fs.readdir 순서는 플랫폼마다 다르므로 정렬해 처리 순서를 결정론화한다.
    // 특히 agentSourceMap/스텁 병합 우선순위(_agents/ 가 <role>/SKILL.md 보다 먼저 — '_' 가 앞)가
    // OS 와 무관하게 동일해야 한다(Windows/macOS 회귀 방지).
    relativePaths.sort()

    // ── 2. 콘텐츠 읽기 및 frontmatter 파싱 ────────────
    const agentStubMap = new Map<string, AgentStub>()
    /** agentId → 각 필드의 출처 파일 상대경로 (편집 기능 M1) */
    const sourceMapBuilder = new Map<string, { nameFile: string; modelFile?: string; toolsFile?: string }>()
    const hashEntries: FileHashEntry[] = []
    const templates: RawTemplate[] = []
    let version: string | undefined
    let modelsMatrixRaw: string | undefined
    let configFrontmatterRaw: string | undefined

    for (const relPath of relativePaths) {
      const absPath = path.join(bundlePath, relPath)
      const stats = statsMap.get(relPath) ?? { mtimeMs: 0, size: 0 }
      let content = ''

      try {
        content = await fs.readFile(absPath, 'utf-8')
      } catch (err) {
        warnings.push(`파일 읽기 실패: ${relPath} — ${err instanceof Error ? err.message : String(err)}`)
        continue
      }

      // VERSION 파일
      if (path.basename(relPath) === 'VERSION') {
        version = content.trim()
      }

      // _core/models.md — model 매트릭스 폴백용
      if (relPath === '_core/models.md' || relPath.endsWith('/_core/models.md')) {
        modelsMatrixRaw = content
      }

      // config.md frontmatter — overlay 판정용
      if (path.basename(relPath) === 'config.md' && !relPath.includes('/_')) {
        const fm = parseFrontmatter(content)
        configFrontmatterRaw = fm.raw
      }

      // .md 파일 frontmatter 파싱 (에이전트 스텁 수집)
      if (relPath.endsWith('.md')) {
        const fm = parseFrontmatter(content)

        // 해시 엔트리 추가
        hashEntries.push({
          relativePath: relPath,
          mtimeMs: stats.mtimeMs,
          size: stats.size,
          frontmatterRaw: fm.raw,
        })

        // _agents/ 또는 SKILL.md 에서 에이전트 스텁 수집
        const isAgentDef = relPath.startsWith('_agents/') || path.basename(relPath) === 'SKILL.md'
        if (isAgentDef && fm.name) {
          const { model, source: modelSource } = normalizeModel(fm.model)
          const stub: AgentStub = {
            id: fm.name,
            displayName: extractDisplayName(fm.name, bundleName),
            model,
            modelSource,
            tools: fm.tools,
          }
          // 중복 id 방지 — _agents/ 정의가 있으면 SKILL.md 를 덮어쓰지 않음 (우선순위 보존)
          if (!agentStubMap.has(fm.name)) {
            agentStubMap.set(fm.name, stub)
            // SourceMap: 최초 정의 파일 기록 (nameFile 항상 기록)
            sourceMapBuilder.set(fm.name, {
              nameFile: relPath,
              modelFile: fm.model !== undefined ? relPath : undefined,
              toolsFile: fm.tools.length > 0 ? relPath : undefined,
            })
          } else {
            // _agents/ 정의에 tools 가 없으면 SKILL.md 의 tools 로 보강
            const existing = agentStubMap.get(fm.name)!
            if (existing.tools.length === 0 && stub.tools.length > 0) {
              agentStubMap.set(fm.name, { ...existing, tools: stub.tools })
              // SourceMap: tools 출처를 현 파일로 갱신
              const src = sourceMapBuilder.get(fm.name)
              if (src) sourceMapBuilder.set(fm.name, { ...src, toolsFile: relPath })
            }
            // model 이 absent 면 새 값으로 교체
            if (existing.modelSource === 'absent' && modelSource !== 'absent') {
              agentStubMap.set(fm.name, { ...existing, model, modelSource })
              // SourceMap: model 출처를 현 파일로 갱신
              const src = sourceMapBuilder.get(fm.name)
              if (src) sourceMapBuilder.set(fm.name, { ...src, modelFile: relPath })
            }
          }
        }

        // _templates/ 아래 .md — 템플릿 파싱
        if (relPath.startsWith('_templates/') || relPath.includes('/_templates/')) {
          const stem = path.basename(relPath, '.md')
          const fm2 = parseFrontmatter(content)
          const frontmatterKeys = fm2.raw
            ? fm2.raw.split('\n')
                .map((l) => l.match(/^(\S+)\s*:/)?.[1])
                .filter((k): k is string => Boolean(k))
            : []
          const sections = extractH2Sections(content)
          templates.push({ stem, frontmatterKeys, sections })
        }
      } else {
        // 비-.md 파일도 해시에 포함 (변경 감지)
        hashEntries.push({
          relativePath: relPath,
          mtimeMs: stats.mtimeMs,
          size: stats.size,
          frontmatterRaw: '',
        })
      }
    }

    // ── 3. 게이트 / hook 스크립트 파싱 ────────────────
    const gates: RawGate[] = []
    const hooks: RawHook[] = []

    for (const relPath of relativePaths) {
      if (!relPath.endsWith('.sh')) continue

      const absPath = path.join(bundlePath, relPath)
      let scriptText = ''
      try {
        scriptText = await fs.readFile(absPath, 'utf-8')
      } catch (err) {
        warnings.push(`스크립트 읽기 실패: ${relPath} — ${err instanceof Error ? err.message : String(err)}`)
        continue
      }

      const fileName = path.basename(relPath).toLowerCase()
      const isGate = fileName.includes('gate')

      if (isGate) {
        const parsed = parseGateScript(scriptText, relPath)
        gates.push(...parsed)
      } else {
        // hook 스크립트 — 이벤트 타입 정적 grep 시도
        const event = detectHookEvent(scriptText, fileName)
        hooks.push({
          file: path.basename(relPath),
          event,
          absolutePath: absPath,
        })
      }
    }

    // ── 4. kind 감지 ──────────────────────────────────
    const kind = detectBundleKind({
      filePaths: relativePaths,
      configFrontmatterRaw,
    })

    // kind 에 따른 경고 추가
    if (kind === 'partial-skill') {
      warnings.push('partial-skill: _core/ 또는 _agents/ 없음 — levels/triage/gates 는 추출 불가')
    } else if (kind === 'task') {
      warnings.push('task: 번들 구조 신호 미감지 — Dry-run 입력으로만 사용 가능')
    }

    if (kind === 'bundle' && agentStubMap.size === 0) {
      warnings.push('bundle 로 감지됐으나 에이전트 frontmatter 없음 — _agents/ 또는 SKILL.md 확인 필요')
    }

    // ── 5. bundleHash 계산 ─────────────────────────────
    const bundleHash = hashEntries.length > 0
      ? computeBundleHash(hashEntries)
      : computeBundleHash([{
          relativePath: '_empty',
          mtimeMs: 0,
          size: 0,
          frontmatterRaw: '',
        }])

    return {
      bundlePath,
      kind,
      bundleHash,
      fileTree: relativePaths,
      agentStubs: [...agentStubMap.values()],
      gates,
      hooks,
      templates,
      warnings,
      version,
      modelsMatrixRaw,
      agentSourceMap: Object.fromEntries(sourceMapBuilder),
    }
  }

  /**
   * RawBundle 을 RawBundleSummary (IPC 응답용 경량 형식) 로 변환한다.
   *
   * @param raw scan() 결과
   */
  toSummary(raw: RawBundle): RawBundleSummary {
    return {
      kind: raw.kind,
      fileTree: raw.fileTree,
      agentStubs: raw.agentStubs,
      warnings: raw.warnings,
    }
  }
}

// ─────────────────────────────────────────────
// hook 이벤트 타입 정적 감지 헬퍼
// ─────────────────────────────────────────────

/**
 * hook 스크립트 텍스트와 파일명에서 hook 이벤트 타입을 정적으로 감지한다.
 *
 * 인식 패턴:
 * - 파일명에 'stop', 'subagent-stop' 포함 → SubagentStop
 * - 파일명에 'pretool', 'pre-tool' 포함 → PreToolUse
 * - 파일명에 'posttool', 'post-tool' 포함 → PostToolUse
 * - 스크립트 내 HOOK_TYPE 주석/변수
 */
function detectHookEvent(scriptText: string, fileName: string): string | undefined {
  const lowerName = fileName.toLowerCase()

  if (lowerName.includes('subagent-stop') || lowerName.includes('subagent_stop')) return 'SubagentStop'
  if (lowerName.includes('pretool') || lowerName.includes('pre-tool')) return 'PreToolUse'
  if (lowerName.includes('posttool') || lowerName.includes('post-tool')) return 'PostToolUse'
  if (lowerName.includes('stop')) return 'Stop'

  // 스크립트 내 명시적 이벤트 선언 grep
  const hookTypeMatch = scriptText.match(/HOOK_TYPE[=:]\s*["']?(\w+)["']?/i)
  if (hookTypeMatch) return hookTypeMatch[1]

  return undefined
}
