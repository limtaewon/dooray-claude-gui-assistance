/**
 * 업무 본문·댓글에 붙은 두레이 이미지의 파일 참조를 뽑아낸다.
 *
 * 왜 필요한가: 업무를 터미널에 놓으면 claude 는 본문 *텍스트* 만 받는다. QA 업무는 재현
 * 스크린샷이 본문의 절반인데 그게 `![...](/files/123)` 라는 글자로만 전달돼, claude 는
 * "이미지를 볼 수 없다" 고 답한다. 파일을 로컬로 내려 경로로 넘겨야 실제로 읽힌다.
 *
 * 두레이 본문은 `text/x-markdown` 과 `text/html` 이 섞여 온다 — 두 표기를 모두 훑는다.
 */

/** 본문에서 찾은 이미지 하나. */
export interface TaskImageRef {
  /** 두레이 파일 id — 다운로드 경로 구성과 중복 제거의 키 */
  fileId: string
  /** 마크다운 alt / html alt — 파일 이름을 사람이 읽을 수 있게 만드는 데 쓴다 */
  alt?: string
}

/** `![alt](/files/123)` — 마크다운 이미지. 경로에 쿼리가 붙는 경우까지 받는다. */
const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(\s*([^)\s]*\/files\/(\d+)[^)\s]*)\s*\)/g
/** `<img src="/files/123" alt="...">` — 속성 순서가 뒤바뀌는 경우가 있어 두 번 훑는다. */
const HTML_IMAGE = /<img\b[^>]*>/gi
const HTML_SRC = /\bsrc\s*=\s*["']([^"']*\/files\/(\d+)[^"']*)["']/i
const HTML_ALT = /\balt\s*=\s*["']([^"']*)["']/i

/**
 * 여러 조각(본문 + 댓글들)에서 이미지 참조를 순서대로 모은다.
 *
 * 같은 파일이 본문과 댓글에 겹쳐 나오면 한 번만 남긴다 — 같은 그림을 두 번 내려받아
 * 프롬프트에 두 줄로 붙이면 claude 가 다른 그림인 줄 안다.
 */
export function extractTaskImageRefs(contents: (string | undefined)[]): TaskImageRef[] {
  const found = new Map<string, TaskImageRef>()

  for (const content of contents) {
    if (!content) continue

    for (const match of content.matchAll(MARKDOWN_IMAGE)) {
      const [, alt, , fileId] = match
      if (!found.has(fileId)) found.set(fileId, { fileId, alt: alt.trim() || undefined })
    }

    for (const tag of content.match(HTML_IMAGE) ?? []) {
      const src = tag.match(HTML_SRC)
      if (!src) continue
      const fileId = src[2]
      if (found.has(fileId)) continue
      const alt = tag.match(HTML_ALT)?.[1]?.trim()
      found.set(fileId, { fileId, alt: alt || undefined })
    }
  }

  return Array.from(found.values())
}

/** data URL 의 mime 에서 확장자를 고른다 — claude 는 확장자로 이미지 여부를 가린다. */
export function extensionForMime(mime: string): string {
  const known: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/bmp': '.bmp',
    'image/svg+xml': '.svg'
  }
  return known[mime.toLowerCase()] ?? '.png'
}

/**
 * 저장할 파일 이름. alt 를 쓰되 경로 구분자·제어문자를 걷어낸다.
 *
 * alt 는 사용자가 붙여넣은 파일명(`Inline-image-2026-07-29 21.05.08.770.png`)이 그대로 오는
 * 일이 많아 그냥 쓰면 공백·점이 섞인다. 공백은 claude 프롬프트에서 경로가 끊기는 원인이라
 * 반드시 없앤다.
 */
export function imageFileName(ref: TaskImageRef, mime: string): string {
  const ext = extensionForMime(mime)
  const base = (ref.alt ?? '')
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    // `../..` 같은 값이 그대로 남지 않게 점 연속을 접고 앞뒤 구분자를 턴다.
    // 경로 구분자는 위에서 이미 사라지지만, 이름이 `.` 로 시작하면 숨김 파일이 된다.
    .replace(/\.{2,}/g, '.')
    .replace(/^[.\-]+|[.\-]+$/g, '')
    .slice(0, 60)
  return base ? `${base}-${ref.fileId}${ext}` : `image-${ref.fileId}${ext}`
}

/** `data:image/png;base64,...` 를 mime 과 바이트로 가른다. data URL 이 아니면 null. */
export function parseDataUrl(dataUrl: string): { mime: string; data: Buffer } | null {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl)
  if (!match) return null
  return { mime: match[1], data: Buffer.from(match[2], 'base64') }
}
