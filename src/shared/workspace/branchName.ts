import { isSafeGitRef } from './gitRef'

/** 기본 브랜치 템플릿. `{taskNumber}` 는 값이 없으면 `{taskId6}` 로 자동 대체된다. */
export const DEFAULT_BRANCH_TEMPLATE = 'feature/{projectCode}-{taskNumber}'

/** 브랜치 이름 템플릿에 쓸 수 있는 토큰 — 설정 화면이 그대로 보여준다. */
export const BRANCH_NAME_PLACEHOLDERS: { token: string; label: string }[] = [
  { token: '{projectCode}', label: '프로젝트 코드 (예: NEON)' },
  { token: '{taskNumber}', label: '업무 번호 (없으면 taskId6)' },
  { token: '{taskId6}', label: '업무 ID 뒤 6자리' },
  { token: '{subject}', label: '업무 제목' },
  { token: '{prefix}', label: '저장소 프리픽스' }
]

export interface BranchNameInput {
  template: string
  projectCode?: string
  taskNumber?: number
  taskId: string
  subject?: string
  /** repo.branchPrefix — 템플릿에 `{prefix}` 로 노출 */
  prefix?: string
}

/**
 * git ref 로 못 쓰는 문자만 골라 막는다 — 나머지(한글 등 유니코드)는 그대로 둔다.
 *
 * 예전에는 영숫자·`._/-` 만 남기는 화이트리스트였다. 그래서 `feature/MIS-경영정보서비스/...` 가
 * `feature/MIS/...` 로 줄어, 사용자가 템플릿에 적어 넣은 이름이 조용히 사라졌다.
 * git 자체는 UTF-8 ref 를 허용하므로 막을 이유가 없다(check-ref-format 금지 문자 + 셸 메타문자만 제거).
 */
const FORBIDDEN_CHARS_RE = /[\s\x00-\x1f\x7f~^:?*[\]\\{}()<>;|&$`'"!]+/g
const REPEATED_DASH_RE = /-{2,}/g
/** `..` 는 git 이 ref 에서 금지한다 — 하나로 접는다. */
const REPEATED_DOT_RE = /\.{2,}/g
const TRIM_EDGE_RE = /^[-._]+|[-._]+$/g
const TOKEN_RE = /\{(\w+)\}/g

function taskId6Of(taskId: string): string {
  return taskId.slice(-6)
}

/** 세그먼트(경로 `/` 로 나뉜 한 조각) sanitize — 못 쓰는 문자를 `-` 로 접고, 연속 `-`/`.`/가장자리 `-._` 를 정리한다. */
function sanitizeSegment(segment: string): string {
  return segment
    .replace(FORBIDDEN_CHARS_RE, '-')
    .replace(REPEATED_DASH_RE, '-')
    .replace(REPEATED_DOT_RE, '.')
    .replace(TRIM_EDGE_RE, '')
}

function sanitizeBranchName(raw: string): string {
  return raw
    .split('/')
    .map(sanitizeSegment)
    .filter((segment) => segment.length > 0)
    .join('/')
}

function fallbackName(taskId: string): string {
  const cleaned = sanitizeSegment(taskId6Of(taskId))
  return `task-${cleaned || 'x'}`
}

function buildTokenMap(input: BranchNameInput, taskId6: string): Record<string, string> {
  const projectCode = input.projectCode?.trim() ? input.projectCode.trim() : 'task'
  return {
    projectCode,
    taskNumber: input.taskNumber !== undefined ? String(input.taskNumber) : taskId6,
    taskId6,
    subject: input.subject ?? '',
    prefix: input.prefix ?? ''
  }
}

/** 템플릿 토큰 치환 + sanitize. 항상 `isSafeGitRef` 를 만족하는 값을 돌려준다. */
export function buildBranchName(input: BranchNameInput): string {
  const taskId6 = taskId6Of(input.taskId)
  const tokens = buildTokenMap(input, taskId6)
  const substituted = input.template.replace(TOKEN_RE, (_match, key: string) => tokens[key] ?? '')
  const sanitized = sanitizeBranchName(substituted)
  const result = sanitized || fallbackName(input.taskId)
  return isSafeGitRef(result) ? result : fallbackName(input.taskId)
}

/** 이미 쓰이는 이름이면 `-2`, `-3` … 을 붙인다. `taken` 은 로컬 브랜치 + 워크트리 브랜치 합집합. */
export function resolveBranchNameConflict(base: string, taken: Iterable<string>): string {
  const takenSet = new Set(taken)
  if (!takenSet.has(base)) return base
  let n = 2
  while (takenSet.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}
