import type { EnrichedFeedbackPayload, FeedbackSubmitResult } from '../../shared/types/feedback'

function getHookUrl(): string {
  const url = process.env.VITE_FEEDBACK_HOOK_URL || process.env.FEEDBACK_HOOK_URL
  // undefined 나 null 은 빈 문자열로 처리
  if (!url || url === '' || url.trim() === '') {
    return ''
  }
  return url
}

interface DoorayAttachment {
  title: string
  /** Dooray Incoming Hook 의 attachment 본문 필드 — `text` 가 맞음 (`description` 은 무시됨) */
  text?: string
  color?: string
}

interface DoorayHookPayload {
  botName: string
  text: string
  attachments: DoorayAttachment[]
}

function getCategoryColor(category: string): string {
  switch (category) {
    case 'bug': return 'orange'
    case 'feature': return 'blue'
    case 'improvement': return 'green'
    default: return 'gray'
  }
}

function buildHookPayload(payload: EnrichedFeedbackPayload): DoorayHookPayload {
  const attachments: DoorayAttachment[] = []

  // 사용자 정보 — 항상 포함 (ADR 준수). 텍스트만 userEmail 유무에 따라 분기.
  const userInfoText = payload.userEmail
    ? `${payload.userEmail} · Clauday v${payload.appVersion} · ${payload.platform}`
    : `Clauday v${payload.appVersion} · ${payload.platform}`
  attachments.push({
    title: '제보자',
    text: userInfoText,
  })

  // 콘텐츠 (카테고리별 색상)
  const categoryLabel = {
    bug: '🐞 오류',
    feature: '✨ 기능요청',
    improvement: '💡 개선',
  }[payload.category]

  attachments.push({
    title: categoryLabel,
    text: payload.subject,
    color: getCategoryColor(payload.category),
  })

  // 진단 정보 (bug 만)
  if (payload.category === 'bug' && payload.diagnostic) {
    attachments.push({
      title: '진단 정보',
      text: payload.diagnostic,
    })
  }

  // Ultra 지시
  attachments.push({
    title: '처리 안내',
    text: '@ultra 위 피드백 검토 후 작업 가치 있으면 브랜치 따서 PR 생성해주세요. (카테고리 / 본문 / (bug 면) 진단정보 위 attachment 참조)',
    color: 'green',
  })

  return {
    botName: 'Feedback',
    text: payload.userNote,
    attachments,
  }
}

export class FeedbackService {
  async submit(payload: EnrichedFeedbackPayload): Promise<FeedbackSubmitResult> {
    // 환경변수 미설정 체크
    const hookUrl = getHookUrl()
    if (!hookUrl || hookUrl.trim() === '') {
      return { ok: false, reason: 'hook-url-missing' }
    }

    try {
      const hookPayload = buildHookPayload(payload)
      const response = await fetch(hookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(hookPayload),
      })

      if (!response.ok) {
        return {
          ok: false,
          reason: 'http-error',
          error: response.statusText || `HTTP ${response.status}`,
        }
      }

      return { ok: true }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      return {
        ok: false,
        reason: 'network-error',
        error: errorMessage,
      }
    }
  }
}

export const feedbackService = new FeedbackService()
