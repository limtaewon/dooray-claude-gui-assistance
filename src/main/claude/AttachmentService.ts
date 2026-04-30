import { app } from 'electron'
import { promises as fs } from 'fs'
import { join, extname, basename } from 'path'
import { randomUUID } from 'crypto'

/**
 * Claude 채팅에서 사용할 첨부 파일을 디스크로 저장하고 절대 경로를 돌려준다.
 * 사용 사례:
 *   - 클립보드에서 paste 한 이미지(스크린샷)
 *   - 드래그앤드롭으로 가져온 파일 중 임시 메모리 데이터
 *
 * 디스크상 위치: {userData}/attachments/{timestamp-uuid}.{ext}
 * Claude 가 Read tool 등으로 자유롭게 접근하도록 절대경로를 그대로 prompt 에 노출.
 */
export class AttachmentService {
  private dir: string

  constructor() {
    this.dir = join(app.getPath('userData'), 'attachments')
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
  }

  /** ArrayBuffer 를 attachments 디렉토리에 저장하고 절대경로 반환. */
  async save(name: string, data: ArrayBuffer | Uint8Array): Promise<string> {
    await this.ensureDir()
    const ext = (extname(name) || '.bin').replace(/\.+$/, '')
    const baseName = basename(name, ext).slice(0, 60).replace(/[^\w\-가-힣]+/g, '_') || 'attachment'
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `${ts}-${randomUUID().slice(0, 8)}-${baseName}${ext || ''}`
    const fullPath = join(this.dir, fileName)
    const buffer = data instanceof ArrayBuffer ? Buffer.from(data) : Buffer.from(data)
    await fs.writeFile(fullPath, buffer)
    return fullPath
  }
}
