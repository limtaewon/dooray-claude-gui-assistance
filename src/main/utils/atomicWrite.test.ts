import { describe, it, expect, vi, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileAtomic, writeJsonAtomic, type AtomicWriteFsImpl } from './atomicWrite'

let workDir: string

afterEach(async () => {
  if (workDir) await fs.rm(workDir, { recursive: true, force: true })
})

async function makeWorkDir(): Promise<string> {
  workDir = await fs.mkdtemp(join(tmpdir(), 'clauday-atomic-'))
  return workDir
}

describe('writeFileAtomic — 정상 경로 (실제 파일시스템)', () => {
  it('정상 쓰기 → 내용 일치 + tmp 파일 잔존 없음', async () => {
    const dir = await makeWorkDir()
    const target = join(dir, 'out.txt')
    await writeFileAtomic(target, 'hello')
    expect(await fs.readFile(target, 'utf-8')).toBe('hello')
    await expect(fs.access(`${target}.clauday-tmp`)).rejects.toThrow()
  })

  it('기존 파일 덮어쓰기', async () => {
    const dir = await makeWorkDir()
    const target = join(dir, 'out.txt')
    await fs.writeFile(target, 'old')
    await writeFileAtomic(target, 'new')
    expect(await fs.readFile(target, 'utf-8')).toBe('new')
  })

  it('writeJsonAtomic 라운드트립', async () => {
    const dir = await makeWorkDir()
    const target = join(dir, 'out.json')
    await writeJsonAtomic(target, { a: 1, b: 'x' })
    const parsed = JSON.parse(await fs.readFile(target, 'utf-8'))
    expect(parsed).toEqual({ a: 1, b: 'x' })
  })
})

describe('writeFileAtomic — rename 실패 재현 (fsImpl 주입)', () => {
  it('rename 1차 EPERM → 재시도 성공', async () => {
    let attempt = 0
    const written: Array<[string, unknown]> = []
    const renamed: Array<[string, string]> = []
    const fsImpl: AtomicWriteFsImpl = {
      writeFile: (async (p: string, d: unknown) => { written.push([p, d]) }) as AtomicWriteFsImpl['writeFile'],
      rename: (async (from: string, to: string) => {
        attempt++
        if (attempt === 1) {
          const err = new Error('perm denied') as NodeJS.ErrnoException
          err.code = 'EPERM'
          throw err
        }
        renamed.push([from, to])
      }) as AtomicWriteFsImpl['rename'],
      unlink: vi.fn(async () => {}) as unknown as AtomicWriteFsImpl['unlink']
    }
    await writeFileAtomic('/virtual/out.txt', 'data', { fsImpl, retryDelayMs: 0 })
    expect(attempt).toBe(2)
    expect(renamed).toEqual([['/virtual/out.txt.clauday-tmp', '/virtual/out.txt']])
    expect(fsImpl.unlink).not.toHaveBeenCalled()
  })

  it('rename 2회 연속 EPERM → throw + tmp 정리됨', async () => {
    const unlinkCalls: string[] = []
    const fsImpl: AtomicWriteFsImpl = {
      writeFile: (async () => {}) as AtomicWriteFsImpl['writeFile'],
      rename: (async () => {
        const err = new Error('perm denied') as NodeJS.ErrnoException
        err.code = 'EPERM'
        throw err
      }) as AtomicWriteFsImpl['rename'],
      unlink: (async (p: string) => { unlinkCalls.push(p) }) as AtomicWriteFsImpl['unlink']
    }
    await expect(
      writeFileAtomic('/virtual/out.txt', 'data', { fsImpl, retryDelayMs: 0 })
    ).rejects.toMatchObject({ code: 'EPERM' })
    expect(unlinkCalls).toEqual(['/virtual/out.txt.clauday-tmp'])
  })

  it('재시도 불가능한 에러코드는 즉시 throw + tmp 정리', async () => {
    const unlinkCalls: string[] = []
    const fsImpl: AtomicWriteFsImpl = {
      writeFile: (async () => {}) as AtomicWriteFsImpl['writeFile'],
      rename: (async () => {
        const err = new Error('no such file') as NodeJS.ErrnoException
        err.code = 'ENOENT'
        throw err
      }) as AtomicWriteFsImpl['rename'],
      unlink: (async (p: string) => { unlinkCalls.push(p) }) as AtomicWriteFsImpl['unlink']
    }
    await expect(
      writeFileAtomic('/virtual/out.txt', 'data', { fsImpl, retryDelayMs: 0 })
    ).rejects.toMatchObject({ code: 'ENOENT' })
    expect(unlinkCalls).toEqual(['/virtual/out.txt.clauday-tmp'])
  })

  it('쓰기 단계 실패 → tmp 정리됨, rename 은 호출 안 됨', async () => {
    const unlinkCalls: string[] = []
    const renameFn = vi.fn()
    const fsImpl: AtomicWriteFsImpl = {
      writeFile: (async () => { throw new Error('disk full') }) as AtomicWriteFsImpl['writeFile'],
      rename: renameFn as unknown as AtomicWriteFsImpl['rename'],
      unlink: (async (p: string) => { unlinkCalls.push(p) }) as AtomicWriteFsImpl['unlink']
    }
    await expect(
      writeFileAtomic('/virtual/out.txt', 'data', { fsImpl, retryDelayMs: 0 })
    ).rejects.toThrow('disk full')
    expect(unlinkCalls).toEqual(['/virtual/out.txt.clauday-tmp'])
    expect(renameFn).not.toHaveBeenCalled()
  })

  it('tmp 정리(unlink) 자체가 실패해도 원래 에러를 그대로 throw (정리 실패를 삼키지 않되 원인 에러를 가리지 않는다)', async () => {
    const fsImpl: AtomicWriteFsImpl = {
      writeFile: (async () => {}) as AtomicWriteFsImpl['writeFile'],
      rename: (async () => {
        const err = new Error('no such file') as NodeJS.ErrnoException
        err.code = 'ENOENT'
        throw err
      }) as AtomicWriteFsImpl['rename'],
      unlink: (async () => {
        throw new Error('tmp 도 이미 없어짐')
      }) as AtomicWriteFsImpl['unlink']
    }
    await expect(
      writeFileAtomic('/virtual/out.txt', 'data', { fsImpl, retryDelayMs: 0 })
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('재시도 지연은 주입한 값(0) 을 즉시 사용 — 테스트가 느려지지 않는다', async () => {
    let attempt = 0
    const fsImpl: AtomicWriteFsImpl = {
      writeFile: (async () => {}) as AtomicWriteFsImpl['writeFile'],
      rename: (async () => {
        attempt++
        if (attempt === 1) {
          const err = new Error('busy') as NodeJS.ErrnoException
          err.code = 'EBUSY'
          throw err
        }
      }) as AtomicWriteFsImpl['rename'],
      unlink: vi.fn(async () => {}) as unknown as AtomicWriteFsImpl['unlink']
    }
    const started = Date.now()
    await writeFileAtomic('/virtual/out.txt', 'data', { fsImpl, retryDelayMs: 0 })
    expect(Date.now() - started).toBeLessThan(100)
  })
})
