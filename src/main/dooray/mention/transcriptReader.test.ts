import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { readLastAssistantText } from './transcriptReader'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'transcript-test-'))
})
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function writeTranscript(lines: unknown[]): string {
  const path = join(tmpDir, 'transcript.jsonl')
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join('\n'), 'utf8')
  return path
}

describe('readLastAssistantText', () => {
  it('마지막 assistant text 만 추출 (앞 assistant 무시)', () => {
    const path = writeTranscript([
      { type: 'user', message: { content: 'hi' } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'old' }] } },
      { type: 'user', message: { content: 'again' } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'final' }] } }
    ])
    expect(readLastAssistantText(path)).toBe('final')
  })

  it('content 가 string 인 경우도 허용', () => {
    const path = writeTranscript([
      { type: 'assistant', message: { content: 'bare string' } }
    ])
    expect(readLastAssistantText(path)).toBe('bare string')
  })

  it('tool_use 블록은 무시하고 text 블록만 모은다', () => {
    const path = writeTranscript([
      { type: 'assistant', message: { content: [
        { type: 'tool_use', name: 'Bash' },
        { type: 'text', text: '결과는' },
        { type: 'text', text: '이것입니다.' }
      ] } }
    ])
    expect(readLastAssistantText(path)).toBe('결과는\n이것입니다.')
  })

  it('JSON parse 실패 라인은 skip', () => {
    const path = join(tmpDir, 'bad.jsonl')
    writeFileSync(path, 'not-json\n' + JSON.stringify({ type: 'assistant', message: { content: 'ok' } }), 'utf8')
    expect(readLastAssistantText(path)).toBe('ok')
  })

  it('assistant 응답 없으면 빈 문자열', () => {
    const path = writeTranscript([{ type: 'user', message: { content: 'hi' } }])
    expect(readLastAssistantText(path)).toBe('')
  })

  it('파일 없으면 빈 문자열', () => {
    expect(readLastAssistantText(join(tmpDir, 'missing.jsonl'))).toBe('')
  })

  it('content 가 배열도 아니고 string 도 아니면 빈 문자열로 처리', () => {
    const path = writeTranscript([
      { type: 'assistant', message: { content: 42 } },
      { type: 'assistant', message: { content: null } }
    ])
    expect(readLastAssistantText(path)).toBe('')
  })
})
