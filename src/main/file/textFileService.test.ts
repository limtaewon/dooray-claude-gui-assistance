import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, statSync, utimesSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { readTextFile, writeTextFile, looksBinary } from './textFileService'
import { TEXT_FILE_MAX_BYTES } from '../../shared/types/textFile'

describe('looksBinary', () => {
  it('NUL 바이트가 있으면 이진', () => {
    expect(looksBinary(Buffer.from([0x68, 0x00, 0x69]))).toBe(true)
  })

  it('평범한 UTF-8 텍스트는 이진이 아니다 — 한글 포함', () => {
    expect(looksBinary(Buffer.from('안녕하세요 hello\n', 'utf8'))).toBe(false)
  })

  it('빈 파일은 이진이 아니다', () => {
    expect(looksBinary(Buffer.alloc(0))).toBe(false)
  })
})

describe('readTextFile', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'textfile-')) })

  it('텍스트 파일을 내용·mtime 과 함께 읽는다', async () => {
    const path = join(dir, 'a.ts')
    writeFileSync(path, 'export const a = 1\n')

    const result = await readTextFile(path)

    expect(result.ok).toBe(true)
    expect(result.content).toBe('export const a = 1\n')
    expect(result.mtimeMs).toBeCloseTo(statSync(path).mtimeMs, 0)
  })

  it('한글 파일명·한글 내용도 그대로 읽는다', async () => {
    const path = join(dir, '보고서.md')
    writeFileSync(path, '# 제목\n본문\n')

    const result = await readTextFile(path)

    expect(result.ok).toBe(true)
    expect(result.content).toBe('# 제목\n본문\n')
  })

  it('UTF-8 BOM 은 떼어낸다 — Monaco 에 그대로 넣으면 첫 글자로 보인다', async () => {
    const path = join(dir, 'bom.txt')
    writeFileSync(path, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hi', 'utf8')]))

    const result = await readTextFile(path)

    expect(result.content).toBe('hi')
  })

  it('없는 파일 → not-found (throw 금지)', async () => {
    const result = await readTextFile(join(dir, '없음.txt'))
    expect(result).toEqual({ ok: false, reason: 'not-found' })
  })

  it('폴더 → not-a-file — 호출자가 OS 로 넘겨야 한다', async () => {
    const sub = join(dir, 'sub')
    mkdirSync(sub)
    expect(await readTextFile(sub)).toEqual({ ok: false, reason: 'not-a-file' })
  })

  it('이진 파일 → binary', async () => {
    const path = join(dir, 'img.png')
    writeFileSync(path, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]))

    const result = await readTextFile(path)

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('binary')
  })

  it('상한을 넘는 파일 → too-large + 크기를 함께 알린다', async () => {
    const path = join(dir, 'big.log')
    writeFileSync(path, Buffer.alloc(TEXT_FILE_MAX_BYTES + 1, 0x61))

    const result = await readTextFile(path)

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('too-large')
    expect(result.size).toBe(TEXT_FILE_MAX_BYTES + 1)
  })
})

describe('writeTextFile', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'textfile-w-')) })

  it('저장하고 새 mtime 을 돌려준다', async () => {
    const path = join(dir, 'a.txt')
    writeFileSync(path, 'old')
    const read = await readTextFile(path)

    const result = await writeTextFile({ path, content: 'new', expectedMtimeMs: read.mtimeMs })

    expect(result.ok).toBe(true)
    expect(result.mtimeMs).toBeDefined()
    expect((await readTextFile(path)).content).toBe('new')
  })

  // 터미널에서 돌린 스크립트·git 이 같은 파일을 건드리는 화면이라 조용한 덮어쓰기는 위험하다.
  it('읽은 뒤 파일이 바뀌었으면 덮어쓰지 않고 conflict', async () => {
    const path = join(dir, 'b.txt')
    writeFileSync(path, 'old')
    const read = await readTextFile(path)
    // 외부에서 고친 상황을 mtime 을 밀어 재현한다.
    const future = new Date(Date.now() + 5_000)
    writeFileSync(path, '남이 고친 내용')
    utimesSync(path, future, future)

    const result = await writeTextFile({ path, content: '내 내용', expectedMtimeMs: read.mtimeMs })

    expect(result).toEqual({ ok: false, reason: 'conflict' })
    expect((await readTextFile(path)).content).toBe('남이 고친 내용')
  })

  it('expectedMtimeMs 를 안 주면 검사 없이 저장한다', async () => {
    const path = join(dir, 'c.txt')
    writeFileSync(path, 'old')

    const result = await writeTextFile({ path, content: 'forced' })

    expect(result.ok).toBe(true)
    expect((await readTextFile(path)).content).toBe('forced')
  })

  it('없는 파일에 mtime 검사를 걸면 not-found', async () => {
    const result = await writeTextFile({
      path: join(dir, '없음.txt'),
      content: 'x',
      expectedMtimeMs: 123
    })
    expect(result).toEqual({ ok: false, reason: 'not-found' })
  })

  it('쓸 수 없는 경로 → write-failed (throw 금지)', async () => {
    const result = await writeTextFile({ path: join(dir, '없는폴더', 'x.txt'), content: 'x' })
    expect(result).toEqual({ ok: false, reason: 'write-failed' })
  })
})
