import type { CollectedContext } from './ContextCollector'

/**
 * 두레이 채팅 컨텍스트 → md 파일 본문.
 *
 * 정책:
 *  - 채팅 흐름은 "배경 컨텍스트"이며, 실제 사용자 요청은 한 줄 입력에서 별도 전달됨
 *  - 따라서 md에는 정형(요약/계획/확인) 가드라인을 박지 않는다 — claude가 자유롭게 답하도록
 *  - 채널 메모리 운영 가이드만 짧게 포함
 */
export function buildPromptFromContext(ctx: CollectedContext): string {
  const lines: string[] = []
  lines.push(`# 두레이 채널 "${ctx.channelName}" 대화 컨텍스트`)
  lines.push('')
  lines.push('이 파일은 사용자 요청을 처리하는 데 참고할 배경 대화입니다.')
  lines.push('실제 수행할 요청은 별도로 전달됩니다.')
  lines.push('')
  lines.push('## 대화 (시간 오름차순)')
  lines.push('')

  if (ctx.messages.length === 0) {
    lines.push('(대화 본문을 가져오지 못했습니다)')
  } else {
    for (const m of ctx.messages) {
      const ts = formatTimestamp(m.sentAt)
      const text = m.text.replace(/\r\n?/g, '\n')
      lines.push(`- **[${ts}] ${m.authorName}**: ${text}`)
    }
  }

  lines.push('')
  lines.push('## 채널 메모리 운영')
  lines.push('현재 작업 디렉토리의 CLAUDE.md 는 이 채널 전용 메모리입니다.')
  lines.push('사용자가 "기억해줘", "꼭 기억해", "앞으로는 ~" 같은 표현으로 사실/규칙을 알려주면')
  lines.push('CLAUDE.md 의 "## 메모" 섹션에 한 줄로 누적해주세요. 다음 세션부터 자동으로 적용됩니다.')

  return lines.join('\n')
}

/**
 * 멘션 텍스트에서 @{trigger} prefix 제거 — 사용자의 실제 요청만 추출.
 *  "@clauday 이 내용 파악해서 알려줘" → "이 내용 파악해서 알려줘"
 *  (앞 공백 + @clauday + 한 칸 공백/탭 까지 흡수)
 */
export function extractUserRequest(text: string, trigger: string): string {
  const re = new RegExp(`^\\s*@${escapeRegExp(trigger)}\\b\\s*`, 'i')
  return text.replace(re, '').trim()
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number): string => n.toString().padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}
