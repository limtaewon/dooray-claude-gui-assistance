/**
 * 소스 제어용 git 실행 래퍼.
 *
 * Portions ported from Orca (https://github.com/stablyai/orca) — orca@1.4.162-rc.0,
 * `src/main/git/runner.ts` 중 `DEFAULT_GIT_MAX_BUFFER` / `killSpawnedCommandTree` /
 * `execFileCapture` / `gitStreamStdout` 및 `src/main/git/max-buffer-overflow.ts`.
 * Copyright (c) 2026 Lovecast Inc. — MIT License.
 * 변경: WSL 라우팅·gh/glab 러너·사내 observability 계측을 전부 제거하고 로컬 git 실행만 남김.
 *
 * 기존 `GitService` 의 `git()` 와 왜 따로 두는가: 소스 제어는 ① status 를 **스트리밍**하며 한도
 * 초과 시 중간에 끊어야 하고 ② push/pull 처럼 네트워크 데드라인이 다른 작업이 있으며
 * ③ 자격증명 프롬프트 가드가 필수다. 워크트리 오케스트레이션용 러너에 이걸 다 얹으면
 * 그쪽 회귀 위험만 커진다.
 */
import { execFile, spawn, type ChildProcess } from 'child_process'
import { StringDecoder } from 'string_decoder'
import { decodeProcessText } from '../utils/procText'
import { nonInteractiveGitEnv } from './credentialEnv'

/**
 * execFile 은 `maxBuffer` 가 undefined 면 상한을 **해제**한다. V8 문자열 상한을 넘는 출력이
 * 오면 main 프로세스가 catch 불가로 죽으므로 항상 명시한다.
 */
export const DEFAULT_GIT_MAX_BUFFER = 10 * 1024 * 1024

/** 로컬 작업 기본 데드라인. */
export const GIT_LOCAL_TIMEOUT_MS = 30_000
/** 네트워크 작업(push/pull/fetch) 데드라인 — 자격증명 가드가 뚫려도 여기서 끊긴다. */
export const GIT_NETWORK_TIMEOUT_MS = 120_000

export interface GitRunOptions {
  timeoutMs?: number
  maxBuffer?: number
  signal?: AbortSignal
}

export interface GitRunResult {
  stdout: string
  stderr: string
}

/** git 이 exit code 비-0 으로 끝났을 때 던지는 에러 — stdout/stderr 를 붙여 상위가 읽게 한다. */
export class GitCommandError extends Error {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number | null

  constructor(message: string, detail: { stdout: string; stderr: string; exitCode: number | null }) {
    super(message)
    this.name = 'GitCommandError'
    this.stdout = detail.stdout
    this.stderr = detail.stderr
    this.exitCode = detail.exitCode
  }
}

/** maxBuffer 초과로 죽은 실행인지 — 호출자는 '바이너리'로 강등해 diff 실패 대신 표시를 살린다. */
export function isMaxBufferOverflowError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  if (code === 'ENOBUFS') return true
  return typeof message === 'string' && /\bmaxBuffer\b/i.test(message)
}

/**
 * 자식 프로세스 트리를 죽인다. Windows 는 `taskkill /t /f` 가 없으면 손자 프로세스가 남는다.
 * (git 은 자주 ssh/credential helper 를 손자로 띄운다)
 */
export function killGitProcessTree(child: ChildProcess): void {
  const pid = child.pid
  if (pid === undefined) return
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' }).unref()
      return
    } catch {
      // taskkill 을 못 띄우면 아래 표준 kill 로 폴백
    }
  }
  try {
    child.kill('SIGKILL')
  } catch {
    // 이미 종료됨
  }
}

function rejectWithGitError(
  reject: (reason: Error) => void,
  err: Error,
  stdout: string,
  stderr: string
): void {
  if (isMaxBufferOverflowError(err)) {
    reject(err)
    return
  }
  const exitCode = (err as { code?: unknown }).code
  reject(
    new GitCommandError(stderr.trim() || stdout.trim() || err.message, {
      stdout,
      stderr,
      exitCode: typeof exitCode === 'number' ? exitCode : null
    })
  )
}

/** git 을 실행하고 stdout/stderr 를 문자열로 받는다. 실패 시 `GitCommandError`. */
export function runGit(args: string[], cwd: string, options: GitRunOptions = {}): Promise<GitRunResult> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        env: nonInteractiveGitEnv(),
        encoding: 'buffer',
        maxBuffer: options.maxBuffer ?? DEFAULT_GIT_MAX_BUFFER,
        timeout: options.timeoutMs ?? GIT_LOCAL_TIMEOUT_MS,
        signal: options.signal,
        windowsHide: true
      },
      (err, stdoutBuf, stderrBuf) => {
        const stdout = decodeProcessText(stdoutBuf as Buffer)
        const stderr = decodeProcessText(stderrBuf as Buffer)
        if (err) {
          rejectWithGitError(reject, err, stdout, stderr)
          return
        }
        resolve({ stdout, stderr })
      }
    )
  })
}

/** blob 을 raw Buffer 로 받는다 (바이너리 판정·이미지 미리보기용). */
export function runGitBuffer(
  args: string[],
  cwd: string,
  options: GitRunOptions = {}
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        env: nonInteractiveGitEnv(),
        encoding: 'buffer',
        maxBuffer: options.maxBuffer ?? DEFAULT_GIT_MAX_BUFFER,
        timeout: options.timeoutMs ?? GIT_LOCAL_TIMEOUT_MS,
        signal: options.signal,
        windowsHide: true
      },
      (err, stdoutBuf, stderrBuf) => {
        if (err) {
          rejectWithGitError(reject, err, '', decodeProcessText(stderrBuf as Buffer))
          return
        }
        resolve(stdoutBuf as Buffer)
      }
    )
  })
}

/**
 * git stdout 을 스트리밍한다. `onChunk` 가 true 를 반환하면 즉시 프로세스 트리를 죽이고
 * 정상 종료로 간주한다(한도 초과 시 status 조기 중단).
 *
 * `StringDecoder` 를 쓰는 이유: 청크 경계에서 잘린 멀티바이트 UTF-8 이 `` 로 깨지지 않게 —
 * 한글 경로에 필수다.
 */
export function streamGitStdout(
  args: string[],
  cwd: string,
  onChunk: (chunk: string) => boolean,
  options: GitRunOptions = {}
): Promise<{ stopped: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      env: nonInteractiveGitEnv(),
      windowsHide: true
    })

    const decoder = new StringDecoder('utf8')
    const maxBytes = options.maxBuffer ?? DEFAULT_GIT_MAX_BUFFER
    let bytes = 0
    let stopped = false
    let settled = false
    let stderr = ''

    const timeoutMs = options.timeoutMs ?? GIT_LOCAL_TIMEOUT_MS
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      killGitProcessTree(child)
      reject(new Error(`git ${args[0]} 시간 초과 (${timeoutMs}ms)`))
    }, timeoutMs)

    const stop = (): void => {
      stopped = true
      killGitProcessTree(child)
    }

    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }

    child.stdout.on('data', (buf: Buffer) => {
      bytes += buf.length
      if (bytes > maxBytes) {
        stop()
        return
      }
      if (stopped) return
      if (onChunk(decoder.write(buf))) stop()
    })
    child.stderr.on('data', (buf: Buffer) => {
      stderr += decodeProcessText(buf)
    })

    child.on('error', (err) => finish(() => reject(err)))
    child.on('close', (code) => {
      const tail = decoder.end()
      if (!stopped && tail) onChunk(tail)
      finish(() => {
        // 조기 중단은 kill 로 인한 비정상 종료 코드가 정상이다.
        if (stopped || code === 0) resolve({ stopped })
        else reject(new GitCommandError(stderr.trim() || `git 종료 코드 ${code}`, { stdout: '', stderr, exitCode: code }))
      })
    })

    options.signal?.addEventListener('abort', () => {
      if (!settled) stop()
    })
  })
}

/**
 * pathspec 을 리터럴로 못박는다. 경로에 `*`, `?`, `[` 가 있으면 git 이 glob 으로 해석해
 * 엉뚱한 파일이 스테이징되거나 대상 파일이 누락된다.
 */
export function literalPathspec(path: string): string {
  return `:(literal)${path.replace(/\\/g, '/')}`
}

/** 40/64 자리 hex 커밋 id 인지 — UI 가 되돌려준 oid 를 그대로 git 에 넘기기 전에 검증한다. */
export function isFullObjectId(value: string): boolean {
  return /^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/.test(value)
}

/** 저장소 루트 기준 상대 경로인지 검증한다 (NUL·절대경로·상위 탈출 거부). */
export function assertRelativeRepoPath(filePath: string): string {
  if (!filePath || filePath.includes('\0')) {
    throw new Error(`유효하지 않은 파일 경로: ${filePath}`)
  }
  const normalized = filePath.replace(/\\/g, '/')
  if (/^([a-zA-Z]:)?\//.test(normalized)) {
    throw new Error(`절대 경로는 허용되지 않습니다: ${filePath}`)
  }
  if (normalized.split('/').some((segment) => segment === '..')) {
    throw new Error(`저장소 밖을 가리키는 경로입니다: ${filePath}`)
  }
  return normalized
}
