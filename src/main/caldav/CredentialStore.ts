import { safeStorage } from 'electron'
import Store from 'electron-store'

interface StoredCredsRaw {
  username?: string
  /** safeStorage.encryptString 의 base64 인코딩 */
  passwordEnc?: string
}

const store = new Store<{ caldav?: StoredCredsRaw }>({ name: 'caldav-credentials' })

/**
 * CalDAV 자격증명 영속 저장소.
 * - 사용자명은 평문 저장 (UI 표시용)
 * - 비밀번호는 Electron safeStorage 로 OS 키체인 기반 암호화 후 저장
 */
export const CalDAVCredentialStore = {
  save(username: string, password: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('OS 키체인 접근 실패 — safeStorage 암호화를 사용할 수 없습니다.')
    }
    const enc = safeStorage.encryptString(password)
    store.set('caldav', { username, passwordEnc: enc.toString('base64') })
  },

  load(): { username: string; password: string } | null {
    const raw = store.get('caldav')
    if (!raw?.username || !raw?.passwordEnc) return null
    try {
      const buf = Buffer.from(raw.passwordEnc, 'base64')
      const password = safeStorage.decryptString(buf)
      return { username: raw.username, password }
    } catch (e) {
      console.warn('[CalDAVCredentialStore] decrypt 실패 — OS 키체인이 변경됐거나 데이터가 손상됨. 재입력 필요:', e instanceof Error ? e.message : e)
      return null
    }
  },

  /**
   * 실제 load() 가 성공해야 true.
   * (단순히 store 에 username/passwordEnc 가 있는지가 아니라, safeStorage decrypt 까지 성공해야)
   * OS 키체인이 바뀌어 decrypt 가 실패하면 false → UI 가 정확히 "미연결" 로 표시되고 사용자에게 재입력 유도.
   */
  has(): boolean {
    return this.load() !== null
  },

  getUsername(): string | null {
    return store.get('caldav')?.username || null
  },

  clear(): void {
    store.delete('caldav')
  }
}
