import { describe, it, expect } from 'vitest'
import { PREVIEW_SCHEME, previewUrlForPath, pathFromPreviewUrl } from './previewUrl'

describe('미리보기 URL 왕복', () => {
  const roundTrips = [
    '/Users/nhn/Desktop/repo/docs/spec.html',
    '/Users/nhn/문서/보고서.html',
    '/Users/nhn/My Notes/index.html',
    '/Users/nhn/résumé/naïve.html',
    '/a/b/c#d.html',
    '/a/b/물음표?.html',
    '/a/b/퍼센트%20.html'
  ]

  it.each(roundTrips)('%s 는 왕복해도 그대로다', (path) => {
    expect(pathFromPreviewUrl(previewUrlForPath(path))).toBe(path)
  })

  it('전용 스킴과 고정 host 를 쓴다 — 출처가 갈리면 상대 경로가 깨진다', () => {
    const url = previewUrlForPath('/a/b.html')
    expect(url.startsWith(`${PREVIEW_SCHEME}://local/`)).toBe(true)
  })

  it('상대 경로 리소스가 같은 규칙으로 풀리도록 경로를 URL path 에 싣는다', () => {
    const url = previewUrlForPath('/docs/dev/spec.html')
    // 브라우저가 style.css 를 형제 경로로 풀 수 있어야 한다.
    const sibling = new URL('style.css', url).toString()
    expect(pathFromPreviewUrl(sibling)).toBe('/docs/dev/style.css')
  })

  it('페이지 안 앵커는 경로를 바꾸지 않는다 — 백지가 되던 원인', () => {
    const url = previewUrlForPath('/docs/dev/spec.html')
    const anchored = new URL('#envelope', url).toString()
    expect(pathFromPreviewUrl(anchored)).toBe('/docs/dev/spec.html')
  })

  it('윈도우 경로는 /C:/ 로 정규화하고 되돌린다', () => {
    const url = previewUrlForPath('C:\\Users\\nhn\\docs\\spec.html')
    expect(pathFromPreviewUrl(url)).toBe('C:/Users/nhn/docs/spec.html')
  })

  it('다른 스킴은 받지 않는다', () => {
    expect(pathFromPreviewUrl('file:///a/b.html')).toBeNull()
    expect(pathFromPreviewUrl('https://evil.com/a')).toBeNull()
  })

  it('URL 이 아니면 null (throw 금지)', () => {
    expect(pathFromPreviewUrl('그냥 문자열')).toBeNull()
    expect(pathFromPreviewUrl('')).toBeNull()
  })
})
