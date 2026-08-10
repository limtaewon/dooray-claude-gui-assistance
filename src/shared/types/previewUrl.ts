/**
 * 파일 미리보기 전용 스킴. main 이 이 스킴으로 파일을 서빙하고 렌더러의 iframe 이 그 URL 을 연다.
 *
 * `srcdoc` 으로 띄우면 문서에 자체 URL 이 없어 페이지 안 앵커(`href="#x"`)가 앱 URL 기준으로
 * 해석된다 — 클릭하는 순간 프레임이 문서를 떠나 백지가 됐다. 자체 URL 을 주면 앵커도, 상대 경로
 * 리소스(CSS·이미지)도 정상 동작한다.
 *
 * 앱과 다른 출처라 프레임이 앱 DOM 에 닿을 수 없다. iframe 은 `allow-scripts` 없이 열어
 * 스크립트 자체를 막고, 응답 CSP 로 한 번 더 막는다.
 */
export const PREVIEW_SCHEME = 'clauday-preview'

/** 출처를 하나로 고정하기 위한 고정 host — 파일마다 출처가 갈리면 상대 경로가 깨진다. */
const PREVIEW_HOST = 'local'

/**
 * 절대 경로 → 미리보기 URL.
 * 경로를 URL path 에 그대로 실어 상대 경로 리소스가 같은 규칙으로 풀리게 한다.
 * 윈도우의 `C:\a\b` 는 `/C:/a/b` 로 정규화한다.
 */
export function previewUrlForPath(absolutePath: string): string {
  const slashed = absolutePath.replace(/\\/g, '/')
  const rooted = slashed.startsWith('/') ? slashed : `/${slashed}`
  const encoded = rooted.split('/').map(encodeURIComponent).join('/')
  return `${PREVIEW_SCHEME}://${PREVIEW_HOST}${encoded}`
}

/**
 * 미리보기 URL → 절대 경로. 형식이 아니면 null.
 * `/C:/a/b` 처럼 드라이브 문자로 시작하면 앞 슬래시를 떼어 윈도우 경로로 되돌린다.
 */
export function pathFromPreviewUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${PREVIEW_SCHEME}:`) return null
  const decoded = decodeURIComponent(parsed.pathname)
  if (!decoded.startsWith('/')) return null
  return /^\/[A-Za-z]:\//.test(decoded) ? decoded.slice(1) : decoded
}
