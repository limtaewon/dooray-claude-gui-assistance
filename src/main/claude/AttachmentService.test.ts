import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let userData: string

vi.mock('electron', () => ({
  app: { getPath: (_k: string) => userData }
}))

import { AttachmentService } from './AttachmentService'

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'attach-userdata-'))
})
afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

describe('AttachmentService', () => {
  it('ArrayBuffer 저장 후 절대경로 반환', async () => {
    const svc = new AttachmentService()
    const buf = new TextEncoder().encode('hello').buffer
    const path = await svc.save('test.txt', buf)
    expect(path).toContain(userData)
    expect(path.endsWith('.txt')).toBe(true)
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, 'utf8')).toBe('hello')
  })

  it('Uint8Array 도 허용', async () => {
    const svc = new AttachmentService()
    const buf = new Uint8Array([0x41, 0x42, 0x43])
    const path = await svc.save('a.bin', buf)
    expect(readFileSync(path)).toEqual(Buffer.from('ABC'))
  })

  it('확장자 없는 이름은 .bin 처럼 끝에 안전 처리', async () => {
    const svc = new AttachmentService()
    const path = await svc.save('noext', new Uint8Array([1, 2]))
    expect(existsSync(path)).toBe(true)
  })

  it('attachments 디렉토리 자동 생성', async () => {
    const svc = new AttachmentService()
    await svc.save('x.txt', new Uint8Array([1]))
    expect(existsSync(join(userData, 'attachments'))).toBe(true)
  })

  it('한글 파일명도 처리', async () => {
    const svc = new AttachmentService()
    const path = await svc.save('첨부파일.png', new Uint8Array([1, 2, 3]))
    expect(existsSync(path)).toBe(true)
  })

  it('이름에 비안전 문자 sanitize', async () => {
    const svc = new AttachmentService()
    const path = await svc.save('a/../b<>.txt', new Uint8Array([1]))
    // path 의 마지막 segment 에 .., <, > 가 그대로 있지는 않아야 함
    const base = path.split('/').pop() || ''
    expect(base).not.toContain('<')
    expect(base).not.toContain('>')
  })

  it('ensureDir 호출 시 idempotent', async () => {
    const svc = new AttachmentService()
    await svc.ensureDir()
    await svc.ensureDir()
    expect(existsSync(join(userData, 'attachments'))).toBe(true)
  })
})
