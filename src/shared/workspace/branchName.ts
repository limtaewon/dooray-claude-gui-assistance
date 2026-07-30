import { isSafeGitRef } from './gitRef'

/** 기본 브랜치 템플릿. `{taskNumber}` 는 값이 없으면 `{taskId6}` 로 자동 대체된다. */
export const DEFAULT_BRANCH_TEMPLATE = 'feature/{projectCode}-{taskNumber}'

export interface BranchNameInput {
  template: string
  projectCode?: string
  taskNumber?: number
  taskId: string
  subject?: string
  /** repo.branchPrefix — 템플릿에 `{prefix}` 로 노출 */
  prefix?: string
}

const ALLOWED_CHARS_RE = /[^A-Za-z0-9._/-]+/g
const REPEATED_DASH_RE = /-{2,}/g
const TRIM_EDGE_RE = /^[-._]+|[-._]+$/g
const TOKEN_RE = /\{(\w+)\}/g

function taskId6Of(taskId: string): string {
  return taskId.slice(-6)
}

/** 세그먼트(경로 `/` 로 나뉜 한 조각) sanitize — 허용 문자 외 `-` 로 접고, 연속 `-`/가장자리 `-._` 를 정리한다. */
function sanitizeSegment(segment: string): string {
  return segment
    .replace(ALLOWED_CHARS_RE, '-')
    .replace(REPEATED_DASH_RE, '-')
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
