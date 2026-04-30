import type { MessengerService } from '../MessengerService'
import type { SocketModeEvent } from '../socket-mode/types'

const PREFIX = '[Clauday]'

/**
 * 두레이 채널로 자동 응답 송출.
 *
 * 송신 토큰이 봇 토큰이 아니라 사용자 본인 토큰이라, 채널에는 "본인이 쓴 메시지"로 보입니다.
 * 그래서 자동 송출임을 사용자(본인+동료)가 식별할 수 있도록 모든 메시지에
 * [Clauday] prefix를 강제합니다.
 *
 * 두레이 메신저는 ```{lang} ... ``` 코드 펜스 안에서만 syntax highlight 렌더링을 해줍니다.
 * - claude 응답에 ```java, ```sql 같은 코드 블록은 그대로 두면 두레이가 highlight
 * - 그 사이의 markdown(헤더/리스트/테이블)은 ```md 로 감싸야 보기 좋음
 * 따라서 응답을 코드 블록과 일반 영역으로 split해서 일반 영역만 ```md로 감싼다.
 */
export class ClaudayResponder {
  constructor(private messenger: MessengerService) {}

  async send(channelId: string, message: string, organizationId?: string): Promise<void> {
    const cleaned = message.trim()
    const stripped = cleaned.startsWith(PREFIX) ? cleaned.slice(PREFIX.length).trim() : cleaned
    const body = formatForDooray(stripped)
    try {
      await this.messenger.sendMessage(channelId, body, organizationId)
    } catch (err) {
      console.warn('[ClaudayResponder] 송신 실패:', err)
    }
  }
}

/**
 * 두레이 송신용 포매팅:
 *  - 짧은 한 줄 평문 → "[Clauday] {text}" (prefix inline)
 *  - 마크다운/코드 섞인 응답 → "[Clauday]\n{wrapped}" (prefix 별도 라인 + 본문 wrap)
 */
function formatForDooray(text: string): string {
  if (!hasMarkdownOrCode(text)) {
    return `${PREFIX} ${text}`
  }
  return `${PREFIX}\n${wrapMarkdownPreservingCodeFences(text)}`
}

function hasMarkdownOrCode(text: string): boolean {
  return (
    /^```/m.test(text) ||           // 코드 블록 fence
    /^#{1,6}\s/m.test(text) ||      // # 헤더
    /^\s*[-*+]\s/m.test(text) ||    // - 리스트
    /^\s*\d+\.\s/m.test(text) ||    // 1. 번호 리스트
    /\|.+\|/m.test(text) ||         // | 테이블 |
    /\*\*[^*\n]+\*\*/.test(text)    // **굵게**
  )
}

/**
 * 응답을 라인 단위로 훑으며 ``` fence 영역과 일반 영역을 분리.
 * 일반 영역은 ```md ... ``` 로 감싸고, fence 영역(```java 등)은 그대로 둔다.
 *
 * 케이스:
 *   "헤더..."          → ```md\n헤더...\n```
 *   "```java\n코드\n```" → 그대로 (이미 fence)
 *   "헤더\n```sql\n...\n```\n결론" → ```md(헤더)``` ```sql(...)``` ```md(결론)```
 */
function wrapMarkdownPreservingCodeFences(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  const mdBuf: string[] = []
  let inCode = false

  const flushMd = (): void => {
    // 비어있거나 공백뿐이면 skip
    if (!mdBuf.some((l) => l.trim().length > 0)) {
      mdBuf.length = 0
      return
    }
    // 앞뒤 빈 줄 제거
    while (mdBuf.length > 0 && mdBuf[0].trim() === '') mdBuf.shift()
    while (mdBuf.length > 0 && mdBuf[mdBuf.length - 1].trim() === '') mdBuf.pop()
    out.push('```md')
    out.push(...mdBuf)
    out.push('```')
    mdBuf.length = 0
  }

  for (const line of lines) {
    const isFence = /^```/.test(line.trimStart())
    if (isFence) {
      if (!inCode) {
        flushMd()
        out.push(line)
        inCode = true
      } else {
        out.push(line)
        inCode = false
      }
      continue
    }
    if (inCode) out.push(line)
    else mdBuf.push(line)
  }
  flushMd()

  return out.join('\n')
}

/**
 * raw 페이로드의 references.channelMap[channelId].orgId 추출.
 * 두레이 sendMessage가 organizationId 옵션을 받기 때문에 함께 넘기면 안전.
 */
export function extractOrgId(ev: { channelId?: string; raw?: SocketModeEvent['raw'] }): string | undefined {
  if (!ev.raw || !ev.channelId) return undefined
  const raw = ev.raw as Record<string, unknown>
  const channelMap = (raw.references as Record<string, unknown> | undefined)?.channelMap as
    | Record<string, Record<string, unknown>>
    | undefined
  return channelMap?.[ev.channelId]?.orgId as string | undefined
}
