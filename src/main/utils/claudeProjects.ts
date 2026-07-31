import { createReadStream, promises as fsp } from 'fs'
import { createInterface } from 'readline'
import { homedir } from 'os'
import { join } from 'path'
import { realpath } from 'fs/promises'
import { samePath, normalizePathForCompare } from './paths'

const MAX_ENCODED_LEN = 200

function djb2(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return h
}

function base36Abs(n: number): string {
  return Math.abs(n).toString(36)
}

/** claude CLI 가 ~/.claude/projects 아래 디렉터리명을 만드는 규칙을 재현한다 (NFC → 비영숫자 치환 → 200자 캡+해시, 근거: ADR-v2-utils-01). */
export function encodeCwd(cwd: string): string {
  const normalized = cwd.normalize('NFC')
  const dashed = normalized.replace(/[^a-zA-Z0-9]/g, '-')
  if (dashed.length <= MAX_ENCODED_LEN) return dashed
  return `${dashed.slice(0, MAX_ENCODED_LEN)}-${base36Abs(djb2(normalized))}`
}

/** claude 프로젝트 디렉터리 루트. `CLAUDE_CONFIG_DIR` 를 존중하고 기본은 `~/.claude`. */
export function claudeProjectsRoot(opts?: { configDir?: string }): string {
  const configDir = opts?.configDir ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
  return join(configDir, 'projects')
}

export type ReadSessionCwdOptions = {
  maxLines?: number
  maxBytes?: number
}

const DEFAULT_MAX_LINES = 200
const DEFAULT_MAX_BYTES = 256 * 1024

/**
 * jsonl 세션 파일에서 cwd 문자열 필드를 가진 첫 줄을 찾는다.
 * 실측상 선두 줄들은 mode/permission-mode/file-history-snapshot 타입이라 cwd 가 없다 —
 * 첫 줄만 파싱하면 안 되고 스캔 상한까지 순회해야 한다 (근거: ADR-v2-utils-01 §4).
 */
export async function readSessionCwd(
  jsonlPath: string,
  opts?: ReadSessionCwdOptions
): Promise<string | undefined> {
  const maxLines = opts?.maxLines ?? DEFAULT_MAX_LINES
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES

  const stream = createReadStream(jsonlPath, { encoding: 'utf-8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })

  let lineCount = 0
  let byteCount = 0
  let found: string | undefined

  try {
    for await (const line of rl) {
      lineCount++
      byteCount += Buffer.byteLength(line, 'utf-8')
      if (line.includes('"cwd"')) {
        try {
          const parsed = JSON.parse(line) as { cwd?: unknown }
          if (typeof parsed.cwd === 'string') {
            found = parsed.cwd
            break
          }
        } catch {
          /* 깨진 JSON 줄은 skip — 전체 실패로 만들지 않는다 */
        }
      }
      if (lineCount >= maxLines || byteCount >= maxBytes) break
    }
  } catch {
    /* 파일 접근 실패 등 — found 는 undefined 로 남고 아래 경고 경로로 수렴 */
  } finally {
    rl.close()
    stream.destroy()
  }

  if (found === undefined) {
    console.warn(
      `[claudeProjects] readSessionCwd cwd 없음 (상한 도달 가능) jsonlPath=${jsonlPath} lines=${lineCount} bytes=${byteCount}`
    )
  }
  return found
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.stat(p)
    return true
  } catch {
    return false
  }
}

/** 디렉터리 안에서 mtime 이 가장 최근인 *.jsonl 하나를 고른다. 없으면 undefined. */
async function latestJsonlPath(dirPath: string): Promise<string | undefined> {
  let jsonlNames: string[]
  try {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true })
    jsonlNames = entries.filter((e) => e.isFile() && e.name.endsWith('.jsonl')).map((e) => e.name)
  } catch {
    return undefined
  }
  if (jsonlNames.length === 0) return undefined

  let latestName: string | undefined
  let latestMtime = -Infinity
  for (const name of jsonlNames) {
    try {
      const stat = await fsp.stat(join(dirPath, name))
      if (stat.mtimeMs > latestMtime) {
        latestMtime = stat.mtimeMs
        latestName = name
      }
    } catch {
      /* 경합으로 사라졌을 수 있음 — skip */
    }
  }
  return latestName ? join(dirPath, latestName) : undefined
}

export type FindProjectDirOptions = {
  /** false 면 3단(전체 스캔) 생략. 대량 반복 호출에서 호출자가 비용을 통제하기 위함 */
  fullScan?: boolean
  configDir?: string
}

export type FindProjectDirVia = 'exact' | 'realpath' | 'hashPrefix' | 'scan'

export interface FindProjectDirHit {
  dir: string
  via: FindProjectDirVia
}

/**
 * cwd 에 대응하는 claude 프로젝트 디렉터리를 3단 캐스케이드로 찾는다 (근거: ADR-v2-utils-02).
 * 1단 정확 일치 → 1단 realpath 재시도 → 2단 해시 접미 prefix 스캔 → 3단 전체 스캔.
 * 2·3단 히트는 인코딩 규칙 드리프트 조기 관측을 위해 warn 로그를 남긴다.
 */
export async function findProjectDirDetailed(
  cwd: string,
  opts?: FindProjectDirOptions
): Promise<FindProjectDirHit | undefined> {
  const root = claudeProjectsRoot({ configDir: opts?.configDir })
  const encoded = encodeCwd(cwd)
  const exactDir = join(root, encoded)

  if (await pathExists(exactDir)) return { dir: exactDir, via: 'exact' }

  try {
    const real = await realpath(cwd)
    if (real !== cwd) {
      const realDir = join(root, encodeCwd(real))
      if (await pathExists(realDir)) return { dir: realDir, via: 'realpath' }
    }
  } catch {
    /* cwd 가 실존하지 않을 수 있음 — 정상, 무시 */
  }

  if (encoded.length > MAX_ENCODED_LEN) {
    const prefix = `${encoded.slice(0, MAX_ENCODED_LEN)}-`
    let siblingNames: string[] = []
    try {
      siblingNames = await fsp.readdir(root)
    } catch {
      siblingNames = []
    }
    for (const name of siblingNames) {
      if (name === encoded || !name.startsWith(prefix)) continue
      console.warn(`[claudeProjects] fallback hit via=hashPrefix cwd=${cwd} actual=${name}`)
      return { dir: join(root, name), via: 'hashPrefix' }
    }
  }

  if (opts?.fullScan === false) return undefined

  let allNames: string[] = []
  try {
    allNames = await fsp.readdir(root)
  } catch {
    return undefined
  }

  for (const name of allNames) {
    const dirPath = join(root, name)
    const jsonlPath = await latestJsonlPath(dirPath)
    if (!jsonlPath) continue
    const actualCwd = await readSessionCwd(jsonlPath)
    if (!actualCwd) continue
    if (samePath(cwd, actualCwd)) {
      console.warn(`[claudeProjects] fallback hit via=scan cwd=${cwd} actual=${actualCwd}`)
      return { dir: dirPath, via: 'scan' }
    }
  }

  return undefined
}

/** findProjectDirDetailed 의 디렉터리 경로만 돌려주는 편의 함수. 찾지 못하면 undefined (throw 안 함). */
export async function findProjectDir(cwd: string, opts?: FindProjectDirOptions): Promise<string | undefined> {
  const hit = await findProjectDirDetailed(cwd, opts)
  return hit?.dir
}

/**
 * 세션 목록에 표시할 프로젝트 라벨. cwd 를 알면 홈 기준 `~/...` 로 축약, 모르면
 * 인코딩된 디렉터리명을 그대로 노출한다 — 추측 경로를 만들지 않는다 (근거: ADR-v2-windows-fix-01 §3).
 */
export function formatProjectLabel(
  params: { cwd?: string; encodedDirName: string },
  opts?: { home?: string; platform?: NodeJS.Platform }
): string {
  const { cwd, encodedDirName } = params
  if (!cwd) return encodedDirName

  const platform = opts?.platform ?? process.platform
  const home = opts?.home ?? homedir()
  const normalizedCwd = normalizePathForCompare(cwd, platform)
  const normalizedHome = normalizePathForCompare(home, platform)

  if (normalizedCwd === normalizedHome) return '~'
  if (normalizedCwd.startsWith(`${normalizedHome}/`)) {
    // 비교는 정규화(소문자/구분자 통일)된 값으로 하되, 표시는 원본 cwd 기반 — 정규화가 화면에 새지 않게.
    const suffix = cwd.slice(home.length).replace(/\\/g, '/')
    return `~${suffix}`
  }
  return cwd
}
