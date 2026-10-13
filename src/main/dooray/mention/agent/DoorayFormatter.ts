/**
 * 마크다운 → 두레이 메신저 text.
 *
 * 두레이 text 는 인라인 코드·맨 URL·`[텍스트](url)`·이모지·언어 지정 코드 펜스만 렌더하고
 * 헤더·굵게·리스트·표는 기호 그대로 보인다(2026-10-13 실측, 기획 §3).
 * 그래서 기호를 읽히는 평문 기호(▍ •)로 바꾸고, 렌더되는 것(링크·인라인 코드·코드 펜스)은 살린다.
 */

/** 두레이 한 메시지에 담을 최대 글자 수 — 이보다 길면 나눠 보낸다. */
export const MESSAGE_CHUNK_LIMIT = 2000

const FENCE_RE = /^(\s*)(`{3,}|~{3,})\s*([\w+-]*)\s*$/

/** 마크다운 본문을 두레이 text 로 바꾼다. 코드 펜스 안은 건드리지 않는다. */
export function formatForDooray(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let fence: { marker: string; unwrap: boolean } | null = null
  let tableBuf: string[] = []

  const flushTable = (): void => {
    if (tableBuf.length > 0) out.push(...tableToBlocks(tableBuf))
    tableBuf = []
  }

  for (const line of lines) {
    const fm = FENCE_RE.exec(line)
    if (fence) {
      if (fm && fm[2].startsWith(fence.marker[0]) && fm[2].length >= fence.marker.length && !fm[3]) {
        if (!fence.unwrap) out.push('```')
        fence = null
        continue
      }
      out.push(fence.unwrap ? formatLine(line) : line)
      continue
    }
    if (fm) {
      flushTable()
      const lang = fm[3].toLowerCase()
      // ```md 로 감싼 본문은 코드가 아니라 글이다 — 펜스를 벗기고 평문으로 바꾼다(줄번호 코드블록 방지).
      const unwrap = lang === 'md' || lang === 'markdown'
      fence = { marker: fm[2], unwrap }
      if (!unwrap) out.push('```' + fm[3])
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      tableBuf.push(line)
      continue
    }
    flushTable()
    out.push(formatLine(line))
  }
  flushTable()
  // 닫히지 않은 펜스는 닫아 준다 — 열린 채로 보내면 뒤의 모든 메시지가 코드로 보인다.
  if (fence && !fence.unwrap) out.push('```')

  return collapseBlankLines(spaceOutMultilineItems(out.join('\n').split('\n')).join('\n')).trim()
}

function formatLine(line: string): string {
  const heading = /^\s{0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/.exec(line)
  if (heading) return `▍${formatInline(heading[1])}`
  if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) return '―――'
  const quote = /^\s*>\s?(.*)$/.exec(line)
  if (quote) return `│ ${formatInline(quote[1])}`
  const bullet = /^(\s*)[-*+]\s+(\[[ xX]\]\s+)?(.*)$/.exec(line)
  if (bullet) {
    const indent = '  '.repeat(Math.floor(bullet[1].replace(/\t/g, '  ').length / 2))
    const check = bullet[2] ? (/x/i.test(bullet[2]) ? '☑ ' : '☐ ') : ''
    return splitLabeledItem(`${indent}• ${check}`, formatInline(bullet[3]))
  }
  const numbered = /^(\s*)(\d{1,2}[.)])\s+(.*)$/.exec(line)
  if (numbered) return splitLabeledItem(`${numbered[1]}${numbered[2]} `, formatInline(numbered[3]))
  return formatInline(line)
}

/**
 * 좁은 메신저 폭에서 "제목: 긴 설명" 한 줄은 줄이 계속 꺾여 읽히지 않는다(2026-10-13 실사용).
 * 길면 제목과 설명을 두 줄로 나눈다 — 설명은 제목 글머리만큼 들여 쓴다.
 */
function splitLabeledItem(marker: string, text: string): string {
  const m = /^([^:：`\n]{2,24}?)\s*[:：]\s+(\S.{9,})$/.exec(text)
  if (!m || marker.length + text.length <= 30) return marker + text
  return `${marker}${m[1]}\n${' '.repeat(marker.length)}${m[2]}`
}

const ITEM_START = /^\s*(?:•|\d{1,2}[.)])\s/

/** 여러 줄짜리 항목이 붙어 있으면 항목 사이에 빈 줄을 넣는다 — 어디서 다음 항목이 시작되는지 보이게. */
function spaceOutMultilineItems(lines: string[]): string[] {
  const out: string[] = []
  let prevItemMultiline = false
  let inItem = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (ITEM_START.test(line)) {
      let j = i + 1
      while (j < lines.length && lines[j].trim() && !ITEM_START.test(lines[j]) && /^\s/.test(lines[j])) j++
      const multiline = j - i > 1
      if (inItem && (multiline || prevItemMultiline) && out[out.length - 1]?.trim()) out.push('')
      prevItemMultiline = multiline
      inItem = true
    } else if (!line.trim() || !/^\s/.test(line)) {
      inItem = false
      prevItemMultiline = false
    }
    out.push(line)
  }
  return out
}

/** 인라인 서식 기호를 벗긴다. 인라인 코드 안은 그대로 둔다. */
function formatInline(text: string): string {
  return text
    .split(/(`[^`\n]+`)/)
    .map((part, i) => {
      if (i % 2 === 1) return part
      return part
        .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, url: string) => `[${alt || '이미지'}](${url})`)
        .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, '$1')
        .replace(/__(?=\S)([^_\n]*?\S)__/g, '$1')
        .replace(/~~(?=\S)([^~\n]*?\S)~~/g, '$1')
        // *기울임* 만 벗긴다. _기울임_ 은 snake_case 식별자를 망가뜨릴 수 있어 그대로 둔다.
        .replace(/(^|[\s(])\*(?=\S)([^*\n]*?\S)\*(?=[\s).,!?:;]|$)/g, '$1$2')
        .replace(/<br\s*\/?>/gi, ' ')
    })
    .join('')
}

/** 마크다운 표 → 행마다 한 줄 블록. 좁은 메신저 폭에서 열 정렬은 깨지므로 "첫 열 — 머리: 값" 으로 풀어 쓴다. */
function tableToBlocks(rows: string[]): string[] {
  const cells = rows
    .map((r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => formatInline(c.trim())))
    .filter((c) => !c.every((v) => /^:?-{2,}:?$/.test(v) || v === ''))
  if (cells.length === 0) return []
  const [header, ...body] = cells
  if (body.length === 0) return [`• ${header.join(' · ')}`]
  return body.map((row) => {
    const head = row[0] || ''
    const rest = row
      .slice(1)
      .map((v, i) => (header[i + 1] ? `${header[i + 1]}: ${v}` : v))
      .filter((v) => v.trim() && !/:\s*$/.test(v))
    return rest.length > 0 ? `• ${head} — ${rest.join(' · ')}` : `• ${head}`
  })
}

function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n')
}

/** 묻는 답이라도 이보다 길면 글타래로 보낸다 */
const QUESTION_INLINE_LIMIT = 1500

/** 마지막 문단이 사용자에게 묻는 말인지 — 질문은 글타래에 숨기지 않고 채널에 바로 보낸다. */
export function endsWithQuestion(markdown: string): boolean {
  const paragraphs = markdown.trim().split(/\n\s*\n/)
  const last = (paragraphs[paragraphs.length - 1] || '').trim()
  return /[?？]\s*$/.test(last) || /(주세요|주실래요|할까요|될까요|알려\s*줘|골라|선택해|정해\s*주|확인\s*부탁)[^\n]{0,12}$/.test(last)
}

/** 표·긴 코드가 있거나 길면 채널이 아니라 글타래로 보낼 "긴 답" 이다. 사용자에게 묻는 답은 길어도 아니다. */
export function isLongAnswer(markdown: string, formatted: string, limit = 600): boolean {
  // 묻는 답은 채널에 둔다 — 단 너무 길면(여러 조각) 채널을 덮으니 카드 + 글타래로
  if (endsWithQuestion(markdown) && formatted.length <= QUESTION_INLINE_LIMIT) return false
  if (formatted.length > limit) return true
  if (/^\s*\|.*\|\s*$/m.test(markdown)) return true
  const codeLines = countCodeLines(markdown)
  return codeLines > 15
}

function countCodeLines(markdown: string): number {
  let inFence = false
  let n = 0
  for (const line of markdown.split('\n')) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) n++
  }
  return n
}

/**
 * 메시지 크기 단위로 나눈다. 빈 줄(문단) 경계를 우선하고, 코드 펜스가 걸치면
 * 앞 조각에서 닫고 다음 조각에서 같은 언어로 다시 연다.
 */
export function splitForMessenger(text: string, limit = MESSAGE_CHUNK_LIMIT): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (trimmed.length <= limit) return [trimmed]

  // 닫는 펜스(```)를 붙일 자리를 남긴다.
  const max = limit - 8
  const lines = trimmed.split('\n').flatMap((l) => hardWrap(l, max - 24))
  const chunks: string[] = []
  let cur: string[] = []
  let len = 0
  let fenceLang: string | null = null
  /** cur[0] 이 이전 조각에서 이어 연 펜스 줄인지 — 내용 없이 펜스만 남은 조각을 버리기 위해. */
  let reopened = false

  const flush = (): void => {
    const content = reopened ? cur.slice(1) : cur
    if (content.some((l) => l.trim())) {
      const body = fenceLang !== null ? [...cur, '```'] : cur
      chunks.push(body.join('\n').trim())
    }
    reopened = fenceLang !== null
    cur = reopened ? ['```' + fenceLang] : []
    len = reopened ? cur[0].length + 1 : 0
  }

  for (const line of lines) {
    if (len + line.length + 1 > max && cur.length > 0) flush()
    cur.push(line)
    len += line.length + 1
    const fm = FENCE_RE.exec(line)
    if (fm) fenceLang = fenceLang === null ? fm[3] : null
    // 문단 경계에서 한도의 80% 를 넘겼으면 미리 끊어 읽기 좋은 단위를 만든다.
    if (line.trim() === '' && fenceLang === null && len > limit * 0.8) flush()
  }
  if (cur.length > 0) {
    const content = reopened ? cur.slice(1) : cur
    if (content.some((l) => l.trim())) chunks.push(cur.join('\n').trim())
  }
  return chunks
}

function hardWrap(line: string, width: number): string[] {
  if (line.length <= width) return [line]
  const out: string[] = []
  for (let i = 0; i < line.length; i += width) out.push(line.slice(i, i + width))
  return out
}

/** 응답에서 카드 제목을 뽑는다 — 첫 헤더, 없으면 첫 문장. */
export function extractTitle(markdown: string, max = 48): string {
  const heading = /^\s{0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/m.exec(markdown)
  const raw = heading ? heading[1] : (firstPlainLines(markdown, 1)[0] ?? '')
  return clip(plainText(raw), max) || '작업 결과'
}

/** 카드 요약용 평문 줄 — 헤더·코드·표·인용을 건너뛴 앞쪽 문장 몇 줄. */
export function extractSummaryLines(markdown: string, count = 3, maxLineLen = 90): string[] {
  return firstPlainLines(markdown, count).map((l) => clip(plainText(l), maxLineLen))
}

function firstPlainLines(markdown: string, count: number): string[] {
  const out: string[] = []
  let inFence = false
  for (const line of markdown.split('\n')) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const t = line.trim()
    if (!t || /^#{1,6}\s/.test(t) || /^\|/.test(t) || /^>/.test(t) || /^([-*_])(\s*\1){2,}$/.test(t)) continue
    out.push(t.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, ''))
    if (out.length >= count) break
  }
  return out
}

/** 카드 안은 완전 평문만 렌더된다 — 링크는 글자만, 인라인 코드는 백틱을 벗긴다. */
export function plainText(text: string): string {
  return formatInline(text)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

/** 경과 시간 m:ss (1시간 이상이면 h:mm:ss). */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = s.toString().padStart(2, '0')
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
