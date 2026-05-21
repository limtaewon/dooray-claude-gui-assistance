import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron-store', async () => {
  const { MemElectronStore } = await import('../../../test/mocks/electron-store')
  return { default: MemElectronStore }
})

vi.mock('electron', () => {
  let available = true
  let shouldDecryptFail = false
  return {
    safeStorage: {
      isEncryptionAvailable: () => available,
      __setAvailable: (v: boolean) => { available = v },
      __setDecryptFail: (v: boolean) => { shouldDecryptFail = v },
      encryptString: (s: string) => Buffer.from(`enc:${s}`, 'utf8'),
      decryptString: (buf: Buffer) => {
        if (shouldDecryptFail) throw new Error('decrypt failed')
        const text = buf.toString('utf8')
        if (!text.startsWith('enc:')) throw new Error('bad format')
        return text.slice(4)
      }
    }
  }
})

import { CalDAVCredentialStore } from './CredentialStore'
import { safeStorage as ss } from 'electron'
const safeStorage = ss as unknown as {
  __setAvailable: (v: boolean) => void
  __setDecryptFail: (v: boolean) => void
}

beforeEach(() => {
  safeStorage.__setAvailable(true)
  safeStorage.__setDecryptFail(false)
  CalDAVCredentialStore.clear()
})

describe('CalDAVCredentialStore', () => {
  it('save → load 라운드트립', () => {
    CalDAVCredentialStore.save('alice', 'secret-pass')
    expect(CalDAVCredentialStore.load()).toEqual({ username: 'alice', password: 'secret-pass' })
  })

  it('safeStorage 사용 불가 시 throw', () => {
    safeStorage.__setAvailable(false)
    expect(() => CalDAVCredentialStore.save('a', 'b')).toThrow(/safeStorage/)
  })

  it('저장 없으면 load=null', () => {
    expect(CalDAVCredentialStore.load()).toBeNull()
  })

  it('decrypt 실패 시 load=null + 경고 로그', () => {
    CalDAVCredentialStore.save('alice', 'pw')
    safeStorage.__setDecryptFail(true)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(CalDAVCredentialStore.load()).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('has() — load 성공 시 true', () => {
    CalDAVCredentialStore.save('a', 'b')
    expect(CalDAVCredentialStore.has()).toBe(true)
  })

  it('has() — decrypt 실패하면 false', () => {
    CalDAVCredentialStore.save('a', 'b')
    safeStorage.__setDecryptFail(true)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(CalDAVCredentialStore.has()).toBe(false)
  })

  it('getUsername — 저장 안 했으면 null', () => {
    expect(CalDAVCredentialStore.getUsername()).toBeNull()
  })

  it('getUsername — 저장 했으면 평문 반환', () => {
    CalDAVCredentialStore.save('alice', 'pw')
    expect(CalDAVCredentialStore.getUsername()).toBe('alice')
  })

  it('clear', () => {
    CalDAVCredentialStore.save('a', 'b')
    CalDAVCredentialStore.clear()
    expect(CalDAVCredentialStore.load()).toBeNull()
  })
})
