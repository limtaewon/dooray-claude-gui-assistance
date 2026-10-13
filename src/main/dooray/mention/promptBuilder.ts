import type { CollectedContext, CollectedMessage } from './ContextCollector'

/**
 * 두레이 채팅 컨텍스트 → md 파일 본문.
 *
 * 정책:
 *  - 채팅 흐름은 "배경 컨텍스트"이며, 실제 사용자 요청은 한 줄 입력에서 별도 전달됨
 *  - 작업 방식은 claude 에게 맡기되, 회신이 두레이 메신저에서 읽히도록 쓰는 규칙만 준다(기획 §5.4)
 *  - 채널 메모리 운영 가이드만 짧게 포함
 */
export function buildPromptFromContext(ctx: CollectedContext): string {
  const lines: string[] = []
  lines.push(`# 두레이 채널 "${ctx.channelName}" 대화 컨텍스트`)
  lines.push('')
  lines.push('이 파일은 사용자 요청을 처리하는 데 참고할 배경 대화입니다.')
  lines.push('실제 수행할 요청은 별도로 전달됩니다.')
  if (ctx.maskedSecrets > 0) {
    lines.push(`대화에 있던 비밀값 ${ctx.maskedSecrets}곳은 \`****\` 로 가렸습니다. 원래 값을 추측하거나 되살리지 마세요.`)
  }
  lines.push('')

  if (ctx.inThread) {
    lines.push('## 글타래 원글')
    lines.push('')
    lines.push(ctx.threadRoot ? formatMessage(ctx.threadRoot) : '- (원글을 찾지 못했습니다 — 답글만으로 판단하고, 맥락이 모자라면 회신에서 그렇다고 밝히세요)')
    lines.push('')
    lines.push('## 글타래 답글 (시간 오름차순)')
  } else {
    lines.push('## 대화 (시간 오름차순)')
  }
  lines.push('')

  if (ctx.messages.length === 0) {
    lines.push('(대화 본문을 가져오지 못했습니다)')
  } else {
    for (const m of ctx.messages) lines.push(formatMessage(m))
  }

  lines.push('')
  lines.push('## 회신 형식 (두레이 메신저)')
  lines.push('자세한 규칙은 `dooray-reply` 스킬, 사내 시스템(Drop 등) 안내는 `internal-systems` 스킬에 있습니다.')
  lines.push('마지막 응답이 그대로 두레이에 올라갑니다. 두레이는 링크·`인라인 코드`·언어를 적은 코드블록만 서식을 살리고,')
  lines.push('헤더·굵게·표는 기호가 그대로 보입니다.')
  lines.push('- 첫 1~2줄에 결론(묻는 답이면 질문)부터. 근거(파일:라인, 조회 결과, 링크)를 붙이고 근거 없는 단정은 하지 않습니다.')
  lines.push('- 메신저 폭이 좁습니다: 한 줄에 정보 하나(40자 안팎), 경로·명령은 그 줄에 혼자, 목록은 "제목 한 줄 + 다음 줄 설명" 에 항목 사이 빈 줄.')
  lines.push('- 응답 전체를 ```md 로 감싸지 않습니다. SQL·코드만 ```sql 처럼 언어를 적은 블록으로.')
  lines.push('- 사용한 도구 목록, 로컬 임시 경로(/private/tmp 등), 비밀값은 쓰지 않습니다. 개인정보 조회 결과는 건수나 가린 값만.')
  lines.push('- 길면 항목 하나를 짧은 줄 2~3개로, 항목 사이엔 빈 줄. 긴 답은 Clauday 가 요약 카드 + 글타래로 나눠 보냅니다.')

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

function formatMessage(m: CollectedMessage): string {
  const ts = formatTimestamp(m.sentAt)
  const parts: string[] = []
  if (m.quote) parts.push(`↪ 인용: "${m.quote}"\n  `)
  const text = m.text.replace(/\r\n?/g, '\n')
  if (text) parts.push(text)
  if (m.attachment) {
    const where = m.attachment.localPath ? ` → \`${m.attachment.localPath}\` (Read 로 열 수 있음)` : ''
    parts.push(`${text ? ' ' : ''}[첨부: ${m.attachment.fileName}${where}]`)
  }
  if (m.threadCount) parts.push(` (글타래 답글 ${m.threadCount}개)`)
  return `- **[${ts}] ${m.authorName}**: ${parts.join('')}`
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
