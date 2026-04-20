import { net } from 'electron'
import keytar from 'keytar'

const SERVICE_NAME = 'clauday'
const ACCOUNT_NAME = 'dooray-api-token'
// NHN Dooray API 베이스 URL
const BASE_URL = 'https://api.dooray.com'

export class DoorayClient {
  private token: string | null = null

  async setToken(token: string): Promise<void> {
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, token)
    this.token = token
  }

  async deleteToken(): Promise<void> {
    await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME)
    this.token = null
  }

  async getToken(): Promise<string | null> {
    if (!this.token) {
      this.token = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME)
    }
    return this.token
  }

  // 토큰 유효성 검증 - /common/v1/members/me 호출
  async validateToken(): Promise<{ valid: boolean; name?: string; error?: string }> {
    try {
      const res = await this.request<{ header: { isSuccessful: boolean }; result: { name: string } }>(
        '/common/v1/members/me'
      )
      return { valid: true, name: res.result.name }
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // electron.net.request 사용 - fetch와 달리 리다이렉트 시 Authorization 헤더 유지
  async request<T>(path: string, options: { method?: string; body?: string; timeoutMs?: number } = {}): Promise<T> {
    const token = await this.getToken()
    if (!token) throw new Error('Dooray API 토큰이 설정되지 않았습니다')

    const url = `${BASE_URL}${path}`
    const timeoutMs = options.timeoutMs ?? 15000

    return new Promise<T>((resolve, reject) => {
      const req = net.request({
        method: options.method ?? 'GET',
        url,
        redirect: 'follow',
        useSessionCookies: false
      })

      req.setHeader('Authorization', `dooray-api ${token}`)
      req.setHeader('Content-Type', 'application/json')
      req.setHeader('Accept', 'application/json')

      let responseBody = ''
      let statusCode = 0
      let settled = false
      const settle = (fn: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        fn()
      }
      const timer = setTimeout(() => {
        try { req.abort() } catch { /* ok */ }
        settle(() => reject(new Error(`Dooray API 타임아웃 (${timeoutMs}ms): ${path}`)))
      }, timeoutMs)

      req.on('response', (response) => {
        statusCode = response.statusCode!

        response.on('data', (chunk: Buffer) => {
          responseBody += chunk.toString()
        })

        response.on('end', () => {
          if (statusCode >= 400) {
            let errorMsg = `HTTP ${statusCode}`
            try {
              const errBody = JSON.parse(responseBody)
              if (errBody.resultMessage) errorMsg = errBody.resultMessage
              else if (errBody.message) errorMsg = errBody.message
            } catch { /* ignore */ }
            settle(() => reject(new Error(`Dooray API 오류 (${statusCode}): ${errorMsg}`)))
            return
          }

          try {
            const parsed = JSON.parse(responseBody) as T
            settle(() => resolve(parsed))
          } catch {
            settle(() => reject(new Error(`응답 파싱 오류: ${responseBody.substring(0, 200)}`)))
          }
        })

        response.on('error', (err: Error) => {
          settle(() => reject(new Error(`응답 오류: ${err.message}`)))
        })
      })

      req.on('error', (err: Error) => {
        settle(() => reject(new Error(`네트워크 오류: ${err.message}`)))
      })

      if (options.body) req.write(options.body)
      req.end()
    })
  }

  /**
   * 파일/이미지 이진 데이터 요청. data URL 반환.
   * Dooray 마크다운의 /files/{id}는 컨텍스트(태스크/위키)별 API 경로로 시도.
   */
  async fetchBinary(path: string, context?: {
    projectId?: string; postId?: string
    wikiId?: string; pageId?: string
  }): Promise<string> {
    if (typeof path !== 'string' || !path) {
      throw new Error(`잘못된 파일 경로: ${typeof path} (${JSON.stringify(path)?.substring(0, 80)})`)
    }
    const token = await this.getToken()
    if (!token) throw new Error('Dooray API 토큰이 설정되지 않았습니다')

    if (path.startsWith('http')) return this.fetchBinaryUrl(path, token)

    const fileIdMatch = path.match(/\/files\/(\d+)/)
    if (fileIdMatch) {
      const fileId = fileIdMatch[1]
      const candidates: string[] = []

      // 컨텍스트 기반 경로 우선
      if (context?.projectId && context?.postId) {
        candidates.push(`${BASE_URL}/project/v1/projects/${context.projectId}/posts/${context.postId}/files/${fileId}?media=raw`)
      }
      if (context?.wikiId && context?.pageId) {
        candidates.push(`${BASE_URL}/wiki/v1/wikis/${context.wikiId}/pages/${context.pageId}/files/${fileId}?media=raw`)
      }
      // 범용 fallback
      candidates.push(`${BASE_URL}/common/v1/files/${fileId}?media=raw`)
      candidates.push(`${BASE_URL}${path}`)

      const errors: string[] = []
      for (const url of candidates) {
        try {
          return await this.fetchBinaryUrl(url, token)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          errors.push(msg.substring(0, 80))
        }
      }
      const ctxStr = context
        ? `ctx=${JSON.stringify(context)}`
        : 'ctx=없음'
      throw new Error(`파일 로드 실패 [${ctxStr}]\n시도: ${candidates.length}개\n${errors.map((e, i) => `  ${i+1}. ${e}`).join('\n')}`)
    }

    return this.fetchBinaryUrl(`${BASE_URL}${path}`, token)
  }

  /**
   * 태스크/댓글에 파일 업로드 (multipart/form-data).
   * 반환: { id: fileId } — 이 id로 /files/{id} 경로 마크다운에 쓸 수 있음
   */
  async uploadFile(params: {
    projectId: string
    postId: string
    filename: string
    mime: string
    data: ArrayBuffer | Buffer
  }): Promise<{ id: string }> {
    const token = await this.getToken()
    if (!token) throw new Error('Dooray API 토큰이 설정되지 않았습니다')

    const fileBuffer = Buffer.isBuffer(params.data) ? params.data : Buffer.from(params.data)
    const boundary = `----ClaudayBoundary${Date.now()}${Math.random().toString(36).slice(2, 8)}`

    // multipart body 수동 구성
    const head = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${params.filename.replace(/"/g, '')}"\r\n` +
      `Content-Type: ${params.mime}\r\n\r\n`,
      'utf-8'
    )
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8')
    const body = Buffer.concat([head, fileBuffer, tail])

    // Dooray는 api.dooray.com → file-api.dooray.com/uploads 307 redirect.
    // redirect 처리에 이슈가 있어서 직접 file-api로 POST.
    const url = `https://file-api.dooray.com/uploads/project/v1/projects/${params.projectId}/posts/${params.postId}/files`
    return this.postMultipart(url, body, boundary, token, 0)
  }

  /**
   * multipart POST. file-api.dooray.com에 직접 보내서 redirect 없음.
   * Content-Length는 Electron이 자동 계산 (수동 설정 시 ERR_INVALID_ARGUMENT 가능).
   */
  private postMultipart(url: string, body: Buffer, boundary: string, token: string, redirectCount = 0): Promise<{ id: string }> {
    if (redirectCount > 3) return Promise.reject(new Error('업로드 redirect 3회 초과'))

    return new Promise<{ id: string }>((resolve, reject) => {
      const req = net.request({ method: 'POST', url, useSessionCookies: false })
      req.setHeader('Authorization', `dooray-api ${token}`)
      req.setHeader('Content-Type', `multipart/form-data; boundary=${boundary}`)
      req.setHeader('Accept', 'application/json')

      let responseBody = ''
      let settled = false
      const settle = (fn: () => void): void => {
        if (settled) return
        settled = true
        fn()
      }

      req.on('redirect', (_code, _method, redirectUrl) => {
        if (settled) return
        try { req.abort() } catch { /* ok */ }
        settle(() => {
          this.postMultipart(redirectUrl, body, boundary, token, redirectCount + 1).then(resolve).catch(reject)
        })
      })

      req.on('response', (response) => {
        if (settled) return
        const statusCode = response.statusCode!
        response.on('data', (chunk: Buffer) => { responseBody += chunk.toString() })
        response.on('end', () => {
          if (settled) return
          if (statusCode >= 400) {
            settle(() => reject(new Error(`파일 업로드 실패 (${statusCode}): ${responseBody.substring(0, 200)}`)))
            return
          }
          try {
            const parsed = JSON.parse(responseBody)
            const id = parsed?.result?.id || parsed?.result?.fileId
            if (!id) {
              settle(() => reject(new Error(`응답에 id 없음: ${responseBody.substring(0, 200)}`)))
              return
            }
            settle(() => resolve({ id: String(id) }))
          } catch {
            settle(() => reject(new Error(`파싱 오류: ${responseBody.substring(0, 200)}`)))
          }
        })
        response.on('error', (err: Error) => settle(() => reject(err)))
      })

      req.on('error', (err: Error) => {
        if (settled) return
        settle(() => reject(err))
      })

      req.write(body)
      req.end()
    })
  }

  /**
   * Dooray는 api.dooray.com → file-api.dooray.com 307 redirect.
   * 크로스 도메인이라 자동 redirect 시 Authorization 드랍됨.
   * redirect: 'manual' + `redirect` 이벤트로 명시 처리 → 새 요청에 Authorization 재첨부.
   */
  private fetchBinaryUrl(url: string, token: string, redirectCount = 0): Promise<string> {
    if (redirectCount > 5) {
      return Promise.reject(new Error('리다이렉트 5회 초과'))
    }

    return new Promise<string>((resolve, reject) => {
      const req = net.request({
        method: 'GET',
        url,
        redirect: 'manual',
        useSessionCookies: false
      })
      req.setHeader('Authorization', `dooray-api ${token}`)

      let handled = false
      const settle = (fn: () => void): void => {
        if (handled) return
        handled = true
        fn()
      }

      // 3xx 응답 시 Electron이 emit하는 이벤트 — 여기서 명시적으로 새 요청 발행
      req.on('redirect', (_statusCode, _method, redirectUrl) => {
        if (handled) return
        try { req.abort() } catch { /* ok */ }
        settle(() => {
          this.fetchBinaryUrl(redirectUrl, token, redirectCount + 1).then(resolve).catch(reject)
        })
      })

      req.on('response', (response) => {
        if (handled) return
        const statusCode = response.statusCode!
        const ct = response.headers['content-type']
        let mime = 'application/octet-stream'
        if (typeof ct === 'string') mime = ct.split(';')[0]
        else if (Array.isArray(ct) && ct.length > 0) mime = ct[0].split(';')[0]

        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => {
          if (handled) return
          if (statusCode >= 400) {
            const body = Buffer.concat(chunks).toString('utf-8').substring(0, 200)
            const shortUrl = url.replace(BASE_URL, '').replace('https://file-api.dooray.com', 'file-api')
            settle(() => reject(new Error(`HTTP ${statusCode} (${shortUrl}): ${body}`)))
            return
          }
          if (mime.includes('json') || mime.includes('html')) {
            settle(() => reject(new Error(`파일이 아닌 응답: ${mime}`)))
            return
          }
          const buf = Buffer.concat(chunks)
          const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
          settle(() => resolve(dataUrl))
        })
        response.on('error', (err: Error) => settle(() => reject(err)))
      })

      req.on('error', (err: Error) => {
        // redirect 처리 직후 abort()로 인한 에러는 무시
        if (handled) return
        settle(() => reject(err))
      })

      req.end()
    })
  }
}
