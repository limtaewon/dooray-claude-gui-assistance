import { promises as fs } from 'fs'
import type {
  TextFileReadResult,
  TextFileWriteRequest,
  TextFileWriteResult
} from '../../shared/types/textFile'
import { TEXT_FILE_MAX_BYTES } from '../../shared/types/textFile'

/** 이진 판정에 쓰는 선두 표본 크기. 전부 읽고 판정하면 큰 파일에서 손해다. */
const BINARY_SNIFF_BYTES = 8 * 1024

/**
 * NUL 바이트가 있으면 텍스트가 아니다.
 * 확장자 목록으로 판정하지 않는 이유: 확장자 없는 스크립트·낯선 확장자가 흔하고,
 * 목록은 항상 뒤처진다. 내용을 보는 쪽이 정확하다.
 */
export function looksBinary(sample: Buffer): boolean {
  return sample.includes(0)
}

/** UTF-8 BOM 을 떼어낸다 — Monaco 에 그대로 넣으면 첫 글자로 보인다. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * 앱 안 탭에서 열 텍스트 파일을 읽는다.
 * 열 수 없는 경우 throw 하지 않고 `reason` 을 담아 돌려준다 — 호출자가 OS 기본 앱으로
 * 넘기는 판단을 해야 하므로, 실패도 정상 흐름의 한 갈래다.
 */
export async function readTextFile(path: string): Promise<TextFileReadResult> {
  let stat: Awaited<ReturnType<typeof fs.stat>>
  try {
    stat = await fs.stat(path)
  } catch {
    return { ok: false, reason: 'not-found' }
  }
  if (!stat.isFile()) return { ok: false, reason: 'not-a-file' }
  if (stat.size > TEXT_FILE_MAX_BYTES) {
    return { ok: false, reason: 'too-large', size: stat.size }
  }

  let buffer: Buffer
  try {
    buffer = await fs.readFile(path)
  } catch (error) {
    console.warn('[textFile] 읽기 실패', { path, error })
    return { ok: false, reason: 'read-failed' }
  }

  if (looksBinary(buffer.subarray(0, BINARY_SNIFF_BYTES))) {
    return { ok: false, reason: 'binary', size: stat.size }
  }

  return {
    ok: true,
    content: stripBom(buffer.toString('utf8')),
    mtimeMs: stat.mtimeMs,
    size: stat.size
  }
}

/**
 * 편집 내용을 저장한다.
 * `expectedMtimeMs` 가 지금 디스크의 mtime 과 다르면 그 사이 다른 곳(에디터·git·스크립트)에서
 * 고친 것이므로 덮어쓰지 않고 `conflict` 를 돌려준다 — 조용히 남의 변경을 지우지 않는다.
 */
export async function writeTextFile(req: TextFileWriteRequest): Promise<TextFileWriteResult> {
  if (req.expectedMtimeMs !== undefined) {
    let current: Awaited<ReturnType<typeof fs.stat>>
    try {
      current = await fs.stat(req.path)
    } catch {
      return { ok: false, reason: 'not-found' }
    }
    if (current.mtimeMs !== req.expectedMtimeMs) {
      console.warn('[textFile] 저장 중단 — 그 사이 파일이 바뀌었다', {
        path: req.path,
        expected: req.expectedMtimeMs,
        actual: current.mtimeMs
      })
      return { ok: false, reason: 'conflict' }
    }
  }

  try {
    await fs.writeFile(req.path, req.content, 'utf8')
  } catch (error) {
    console.warn('[textFile] 쓰기 실패', { path: req.path, error })
    return { ok: false, reason: 'write-failed' }
  }

  try {
    const after = await fs.stat(req.path)
    return { ok: true, mtimeMs: after.mtimeMs }
  } catch {
    // 쓰기는 됐는데 stat 이 실패한 희귀 케이스 — 저장 자체는 성공으로 본다.
    return { ok: true }
  }
}
