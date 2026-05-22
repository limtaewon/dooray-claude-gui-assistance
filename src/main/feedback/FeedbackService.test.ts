import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// process.env 를 mock 하여 환경변수 제어
vi.mock('./FeedbackService', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('./FeedbackService')
  return {
    ...actual,
    // 환경변수는 테스트에서 직접 설정
  }
})

import { FeedbackService } from './FeedbackService'

// fetch 전역 mock
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('FeedbackService', () => {
  let service: FeedbackService

  beforeEach(() => {
    service = new FeedbackService()
    mockFetch.mockReset()
    // 환경변수 설정
    process.env.VITE_FEEDBACK_HOOK_URL = 'https://hook.example.com/feedback'
  })

  afterEach(() => {
    delete process.env.VITE_FEEDBACK_HOOK_URL
    delete process.env.FEEDBACK_HOOK_URL
  })

  describe('submit - 성공', () => {
    it('200 응답 시 ok: true 반환', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      })

      const result = await service.submit({
        category: 'bug',
        subject: '테스트 버그',
        userNote: '테스트 내용',
        appVersion: '1.6.0',
        platform: 'darwin',
      })

      expect(result).toEqual({ ok: true })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('페이로드 구조 검증 (bug 카테고리)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      })

      await service.submit({
        category: 'bug',
        subject: '버그 제목',
        userNote: '사용자 메모',
        diagnostic: '진단 정보',
        appVersion: '1.6.0',
        platform: 'linux',
        userEmail: 'test@example.com',
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const callArgs = mockFetch.mock.calls[0]
      // callArgs = [url, options] 형태
      const options = callArgs[1] as RequestInit
      const body = JSON.parse(options.body as string)

      expect(body.botName).toBe('Feedback')
      expect(body.text).toBe('사용자 메모')
      expect(body.attachments).toHaveLength(4)
      expect(body.attachments[1].color).toBe('orange')
      expect(body.attachments[1].title).toBe('🐞 오류')
    })

    it('feature 카테고리는 파란색', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })

      await service.submit({
        category: 'feature',
        subject: '기능 요청',
        userNote: '내용',
        appVersion: '1.6.0',
        platform: 'win32',
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const callArgs = mockFetch.mock.calls[0]
      const options = callArgs[1] as RequestInit
      const body = JSON.parse(options.body as string)

      expect(body.attachments[1].color).toBe('blue')
      expect(body.attachments[1].title).toBe('✨ 기능요청')
    })

    it('improvement 카테고리는 초록색', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })

      await service.submit({
        category: 'improvement',
        subject: '개선 제안',
        userNote: '내용',
        appVersion: '1.6.0',
        platform: 'darwin',
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const callArgs = mockFetch.mock.calls[0]
      const options = callArgs[1] as RequestInit
      const body = JSON.parse(options.body as string)

      expect(body.attachments[1].color).toBe('green')
      expect(body.attachments[1].title).toBe('💡 개선')
    })

    it('bug 카테고리가 아니면 진단 정보 제외', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })

      await service.submit({
        category: 'feature',
        subject: '기능',
        userNote: '내용',
        diagnostic: '진단 (무시됨)',
        appVersion: '1.6.0',
        platform: 'darwin',
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const callArgs = mockFetch.mock.calls[0]
      const options = callArgs[1] as RequestInit
      const body = JSON.parse(options.body as string)

      expect(body.attachments).toHaveLength(3)
      expect(body.attachments.find((a: any) => a.title === '진단 정보')).toBeUndefined()
    })
  })

  describe('submit - HTTP 에러', () => {
    it('500 응답 시 reason: http-error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      const result = await service.submit({
        category: 'bug',
        subject: '테스트',
        userNote: '내용',
        appVersion: '1.6.0',
        platform: 'darwin',
      })

      expect(result).toEqual({
        ok: false,
        reason: 'http-error',
        error: 'Internal Server Error',
      })
    })

    it('404 응답 시 reason: http-error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })

      const result = await service.submit({
        category: 'feature',
        subject: '테스트',
        userNote: '내용',
        appVersion: '1.6.0',
        platform: 'win32',
      })

      expect(result).toEqual({
        ok: false,
        reason: 'http-error',
        error: 'Not Found',
      })
    })
  })

  describe('submit - 네트워크 에러', () => {
    it('fetch throw 시 reason: network-error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'))

      const result = await service.submit({
        category: 'bug',
        subject: '테스트',
        userNote: '내용',
        appVersion: '1.6.0',
        platform: 'darwin',
      })

      expect(result).toEqual({
        ok: false,
        reason: 'network-error',
        error: 'Network timeout',
      })
    })

    it('DNS 에러 시 reason: network-error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND hook.example.com'))

      const result = await service.submit({
        category: 'improvement',
        subject: '테스트',
        userNote: '내용',
        appVersion: '1.6.0',
        platform: 'linux',
      })

      expect(result).toEqual({
        ok: false,
        reason: 'network-error',
        error: 'getaddrinfo ENOTFOUND hook.example.com',
      })
    })
  })

  describe('submit - 환경변수 미설정', () => {
    it('VITE_FEEDBACK_HOOK_URL 빈 문자열 시 reason: hook-url-missing', async () => {
      process.env.VITE_FEEDBACK_HOOK_URL = ''

      const result = await service.submit({
        category: 'bug',
        subject: '테스트',
        userNote: '내용',
        appVersion: '1.6.0',
        platform: 'darwin',
      })

      expect(result).toEqual({ ok: false, reason: 'hook-url-missing' })
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('VITE_FEEDBACK_HOOK_URL 미설정 시 reason: hook-url-missing', async () => {
      delete process.env.VITE_FEEDBACK_HOOK_URL

      const result = await service.submit({
        category: 'bug',
        subject: '테스트',
        userNote: '내용',
        appVersion: '1.6.0',
        platform: 'darwin',
      })

      expect(result).toEqual({ ok: false, reason: 'hook-url-missing' })
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('공백만 있는 URL 시 reason: hook-url-missing', async () => {
      process.env.VITE_FEEDBACK_HOOK_URL = '   '

      const result = await service.submit({
        category: 'bug',
        subject: '테스트',
        userNote: '내용',
        appVersion: '1.6.0',
        platform: 'darwin',
      })

      expect(result).toEqual({ ok: false, reason: 'hook-url-missing' })
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})
