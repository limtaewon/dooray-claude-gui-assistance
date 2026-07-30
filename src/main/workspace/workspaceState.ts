import { normalizePathForCompare } from '../utils/paths'
import { DEFAULT_BRANCH_TEMPLATE } from '../../shared/workspace/branchName'
import type {
  RepoRegistryEntry,
  TaskWorkspace,
  TaskSessionLink,
  WorkspaceKey,
  WorkspaceSettings
} from '../../shared/types/workspace'

/** `WorkspaceStore` 가 영속화하는 상태 문서 전체. 키 하나(`state`) 아래에 통째로 저장된다. */
export interface WorkspaceState {
  schemaVersion: number
  repos: RepoRegistryEntry[]
  projectRepoMap: Record<string, string>
  workspaces: Record<WorkspaceKey, TaskWorkspace>
  taskSessionLinks: Record<WorkspaceKey, TaskSessionLink>
  settings: WorkspaceSettings
}

/** ADR-v2-workspace-p1-01 (e) — 전환 ON / 댓글 OFF, 자동 승인 OFF 가 기본. */
export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  branchTemplate: DEFAULT_BRANCH_TEMPLATE,
  maxConcurrentRuns: 4,
  autoApproveDefault: false,
  transitionDoorayDefault: true,
  commentBranchDefault: false
}

function emptyState(): WorkspaceState {
  return {
    schemaVersion: 1,
    repos: [],
    projectRepoMap: {},
    workspaces: {},
    taskSessionLinks: {},
    settings: { ...DEFAULT_WORKSPACE_SETTINGS }
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * 경로의 마지막 세그먼트. Node 의 `path.basename` 은 실행 중인 OS 기준으로 구분자를 해석해서
 * `platform` 파라미터와 어긋날 수 있다(예: darwin 프로세스에서 win32 경로를 다룰 때) — 항상 `\`/`` 를
 * 구분자로 인정하는 방식으로 직접 계산해 `platform` 인자와 일관되게 만든다.
 */
function lastPathSegment(p: string): string {
  const unified = p.replace(/\\/g, '/').replace(/\/+$/, '')
  const idx = unified.lastIndexOf('/')
  return idx === -1 ? unified : unified.slice(idx + 1)
}

function slugifyRepoName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'repo'
}

const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193

function fnv1a32Hex(str: string): string {
  let hash = FNV_OFFSET_BASIS
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * 저장소 경로로부터 결정적 repoId 를 만든다. `randomUUID` 대신 경로 기반이라 같은 경로를
 * 두 번 등록해도 중복이 안 생기고 마이그레이션이 몇 번 돌아도 멱등하다 (ADR-v2-workspace-p1-03 (c)).
 */
export function makeRepoId(absPath: string, platform: NodeJS.Platform = process.platform): string {
  const normalized = normalizePathForCompare(absPath, platform)
  return `${slugifyRepoName(lastPathSegment(absPath))}-${fnv1a32Hex(normalized)}`
}

/**
 * 저장된 원시 상태를 현재 스키마로 마이그레이션한다. 형태가 깨졌으면 throw 하지 않고 빈 상태로 시작한다.
 * `legacyGitRepoPath` 가 있고 레지스트리가 비어 있으면 첫 저장소로 승격한다(멱등, `gitRepoPath` 키는 지우지 않음).
 */
export function migrateWorkspaceState(raw: unknown, opts: { legacyGitRepoPath?: string } = {}): WorkspaceState {
  const state: WorkspaceState = isPlainObject(raw)
    ? {
        schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0,
        repos: Array.isArray(raw.repos) ? (raw.repos as RepoRegistryEntry[]) : [],
        projectRepoMap: isPlainObject(raw.projectRepoMap) ? (raw.projectRepoMap as Record<string, string>) : {},
        workspaces: isPlainObject(raw.workspaces) ? (raw.workspaces as Record<WorkspaceKey, TaskWorkspace>) : {},
        taskSessionLinks: isPlainObject(raw.taskSessionLinks)
          ? (raw.taskSessionLinks as Record<WorkspaceKey, TaskSessionLink>)
          : {},
        settings: isPlainObject(raw.settings)
          ? { ...DEFAULT_WORKSPACE_SETTINGS, ...(raw.settings as Partial<WorkspaceSettings>) }
          : { ...DEFAULT_WORKSPACE_SETTINGS }
      }
    : emptyState()

  // 승격 조건: legacyGitRepoPath 존재 + repos 가 비어 있음. repos 가 비어 있다는 것 자체가
  // "같은 경로 미등록"을 함의하므로(비어 있으니 무엇이든 미등록) 별도 중복 검사는 불필요하다.
  // 두 번째 호출부터는 repos.length > 0 이라 이 분기 자체가 스킵되어 멱등이 보장된다.
  const legacyPath = opts.legacyGitRepoPath?.trim()
  if (legacyPath && state.repos.length === 0) {
    state.repos = [{ id: makeRepoId(legacyPath), path: legacyPath, name: lastPathSegment(legacyPath) }]
  }

  state.schemaVersion = 1
  return state
}
