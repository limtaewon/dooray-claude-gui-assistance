/**
 * 앱 안에서 여는 텍스트 파일 탭의 IPC 계약.
 * 터미널에서 ⌘클릭한 경로를 OS 기본 앱 대신 앱 안 탭으로 열기 위한 최소 표면이다.
 */

/** 앱에서 편집할 수 없는 이유 — 호출자는 이걸 보고 OS 기본 앱으로 넘긴다. */
export type TextFileRejectReason =
  | 'not-found'
  | 'not-a-file'
  | 'too-large'
  | 'binary'
  | 'read-failed'

export interface TextFileReadResult {
  ok: boolean
  content?: string
  /** 저장 시 외부 변경 감지의 기준. 읽은 시점의 mtime. */
  mtimeMs?: number
  /** 바이트 크기 — 거절 사유가 too-large 일 때 사용자에게 알려주기 위해 함께 준다. */
  size?: number
  reason?: TextFileRejectReason
}

export type TextFileWriteReason = 'conflict' | 'not-found' | 'write-failed'

export interface TextFileWriteResult {
  ok: boolean
  /** 저장 후 갱신된 mtime — 다음 저장의 기준이 된다. */
  mtimeMs?: number
  reason?: TextFileWriteReason
}

export interface TextFileWriteRequest {
  path: string
  content: string
  /**
   * 읽었을 때의 mtime. 지금 디스크의 mtime 과 다르면 그 사이 다른 곳에서 고친 것이므로
   * 덮어쓰지 않고 `conflict` 로 돌려준다. 생략하면 검사하지 않는다(새로 만드는 경우).
   */
  expectedMtimeMs?: number
}

/**
 * 앱 안에서 여는 파일 탭의 요청.
 * `line` 은 터미널 링크가 `파일.ts:120` 형태였을 때만 채워진다 — 열자마자 그 줄로 간다.
 */
export interface FileTabRequest {
  path: string
  line?: number | null
}

/** Monaco 에 밀어 넣기엔 너무 큰 파일의 상한. 이보다 크면 OS 기본 앱으로 넘긴다. */
export const TEXT_FILE_MAX_BYTES = 2 * 1024 * 1024
