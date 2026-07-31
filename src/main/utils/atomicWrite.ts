import { promises as fs } from 'fs'

export type AtomicWriteFsImpl = {
  writeFile: typeof fs.writeFile
  rename: typeof fs.rename
  unlink: typeof fs.unlink
}

export type AtomicWriteOptions = {
  /** rename 재시도 전 대기 시간(ms). 테스트에서 0 주입 가능 */
  retryDelayMs?: number
  /** 테스트 주입용 fs 구현 (rename 실패 재현 등) */
  fsImpl?: AtomicWriteFsImpl
}

const RETRYABLE_CODES = new Set(['EPERM', 'EACCES', 'EBUSY'])

function tmpPathFor(filePath: string): string {
  return `${filePath}.clauday-tmp`
}

async function cleanupTmp(fsImpl: AtomicWriteFsImpl, tmpPath: string): Promise<void> {
  try {
    await fsImpl.unlink(tmpPath)
  } catch {
    /* rename 성공 후 이미 없거나, 애초에 쓰기 실패로 생기지 않았을 수 있음 — 무시 */
  }
}

/**
 * tmp 파일에 쓴 뒤 rename 하는 원자적 쓰기.
 * Windows 의 EPERM/EACCES/EBUSY(백신·인덱서의 순간 잠금)는 1회 재시도 후에도 실패하면 throw.
 */
export async function writeFileAtomic(
  filePath: string,
  data: string | NodeJS.ArrayBufferView,
  opts?: AtomicWriteOptions
): Promise<void> {
  const fsImpl = opts?.fsImpl ?? fs
  const delay = opts?.retryDelayMs ?? 50
  const tmpPath = tmpPathFor(filePath)

  try {
    await fsImpl.writeFile(tmpPath, data)
  } catch (err) {
    await cleanupTmp(fsImpl, tmpPath)
    throw err
  }

  try {
    await fsImpl.rename(tmpPath, filePath)
    return
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (!code || !RETRYABLE_CODES.has(code)) {
      await cleanupTmp(fsImpl, tmpPath)
      throw err
    }
  }

  await new Promise<void>((resolve) => setTimeout(resolve, delay))
  try {
    await fsImpl.rename(tmpPath, filePath)
  } catch (retryErr) {
    await cleanupTmp(fsImpl, tmpPath)
    throw retryErr
  }
}

/** writeFileAtomic 의 JSON 편의 함수 (`JSON.stringify(value, null, 2)`). */
export async function writeJsonAtomic(filePath: string, value: unknown, opts?: AtomicWriteOptions): Promise<void> {
  await writeFileAtomic(filePath, JSON.stringify(value, null, 2), opts)
}
