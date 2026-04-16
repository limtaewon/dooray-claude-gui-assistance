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
  async request<T>(path: string, options: { method?: string; body?: string } = {}): Promise<T> {
    const token = await this.getToken()
    if (!token) throw new Error('Dooray API 토큰이 설정되지 않았습니다')

    const url = `${BASE_URL}${path}`

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
            reject(new Error(`Dooray API 오류 (${statusCode}): ${errorMsg}`))
            return
          }

          try {
            resolve(JSON.parse(responseBody) as T)
          } catch {
            reject(new Error(`응답 파싱 오류: ${responseBody.substring(0, 200)}`))
          }
        })

        response.on('error', (err: Error) => {
          reject(new Error(`응답 오류: ${err.message}`))
        })
      })

      req.on('error', (err: Error) => {
        reject(new Error(`네트워크 오류: ${err.message}`))
      })

      if (options.body) req.write(options.body)
      req.end()
    })
  }
}
