import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

/**
 * claude code transcript JSONL의 마지막 assistant 메시지 텍스트 추출.
 * 형식 예시:
 *  {"type":"user","message":{...}}
 *  {"type":"assistant","message":{"content":[{"type":"text","text":"..."}, {"type":"tool_use", ...}]}}
 *
 * tool_use 등 비텍스트 블록은 제외, text 블록만 join.
 * 마지막 assistant turn의 텍스트가 곧 사용자에게 보여진 응답.
 */
export function readLastAssistantText(transcriptPath: string): string {
  let raw: string
  try {
    raw = readFileSync(transcriptPath, 'utf8')
  } catch {
    return ''
  }
  const lines = raw.split('\n').filter((l) => l.trim().length > 0)
  for (let i = lines.length - 1; i >= 0; i--) {
    let parsed: unknown
    try { parsed = JSON.parse(lines[i]) } catch { continue }
    if (!isAssistantMessage(parsed)) continue
    const text = extractText(parsed)
    if (text) return text
  }
  return ''
}

interface AssistantNode {
  type: 'assistant'
  message?: { content?: unknown }
}

function isAssistantMessage(x: unknown): x is AssistantNode {
  return !!x && typeof x === 'object' && (x as { type?: unknown }).type === 'assistant'
}

function extractText(node: AssistantNode): string {
  const content = node.message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const out: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const b = block as { type?: string; text?: unknown }
    if (b.type === 'text' && typeof b.text === 'string') out.push(b.text)
  }
  return out.join('\n').trim()
}

/** 두레이 메시지 길이 제한을 고려해 적절히 자름. */
export function truncateForMessenger(text: string, maxLen = 1500): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 3) + '...'
}
