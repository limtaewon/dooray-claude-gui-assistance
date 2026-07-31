import { describe, it, expect, vi, afterEach } from 'vitest'
import { promises as fsPromises, mkdtempSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
import { resolveCandidates } from './pathResolver'

describe('resolveCandidates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pathresolver-'))
  const filePath = join(dir, 'file.txt')
  writeFileSync(filePath, 'hi')
  const subDir = join(dir, 'sub')
  mkdirSync(subDir)

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('존재하는 파일 → kind file', async () => {
    const [result] = await resolveCandidates({ cwd: dir, candidates: ['file.txt'] })
    expect(result.kind).toBe('file')
    expect(result.resolved).toBe(filePath)
  })

  it('존재하는 디렉터리 → kind directory', async () => {
    const [result] = await resolveCandidates({ cwd: dir, candidates: ['sub'] })
    expect(result.kind).toBe('directory')
  })

  it('미존재 → kind null', async () => {
    const [result] = await resolveCandidates({ cwd: dir, candidates: ['nope.txt'] })
    expect(result.kind).toBeNull()
  })

  it('~ 확장 — homedir 기준으로 resolved 가 만들어진다', async () => {
    const [result] = await resolveCandidates({ cwd: dir, candidates: ['~/definitely-not-existing-xyz'] })
    expect(result.resolved.startsWith(homedir())).toBe(true)
    expect(result.kind).toBeNull()
  })

  it('상대 경로 — cwd 기준으로 해석', async () => {
    const [result] = await resolveCandidates({ cwd: dir, candidates: ['./sub/../file.txt'] })
    expect(result.resolved).toBe(filePath)
    expect(result.kind).toBe('file')
  })

  it('요청과 같은 순서로 반환', async () => {
    const results = await resolveCandidates({ cwd: dir, candidates: ['file.txt', 'nope.txt', 'sub'] })
    expect(results.map((r) => r.candidate)).toEqual(['file.txt', 'nope.txt', 'sub'])
  })

  it('타임아웃 — stat 이 300ms 안에 안 끝나면 미존재 취급 (정지한 네트워크 마운트 방어)', async () => {
    vi.useFakeTimers()
    const hang = new Promise<never>(() => {}) // 영원히 pending
    vi.spyOn(fsPromises, 'stat').mockReturnValue(hang as never)

    const promise = resolveCandidates({ cwd: dir, candidates: ['whatever'] })
    await vi.advanceTimersByTimeAsync(300)
    const [result] = await promise
    expect(result.kind).toBeNull()
  })
})
