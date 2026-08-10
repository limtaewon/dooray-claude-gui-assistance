import { protocol, net } from 'electron'
import { promises as fs } from 'fs'
import { pathToFileURL } from 'url'
import { PREVIEW_SCHEME, pathFromPreviewUrl } from '../../shared/types/previewUrl'

/**
 * 미리보기 응답에 붙이는 CSP.
 * iframe 을 `allow-scripts` 없이 열어 이미 스크립트가 막혀 있지만, 여기서 한 번 더 막는다.
 * 원격 요청(`default-src 'self'`)도 차단해 문서가 바깥으로 신호를 보내지 못하게 한다.
 * 인라인 `<style>` 은 문서 대부분이 쓰므로 style 만 허용한다.
 */
const PREVIEW_CSP = [
  "default-src 'self' data:",
  "style-src 'self' 'unsafe-inline' data:",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "script-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

/**
 * 스킴 권한 등록 — `app.whenReady()` **이전에** 불러야 한다.
 * `standard: true` 라야 `scheme://host/path` 로 파싱돼 상대 경로가 정상적으로 풀린다.
 */
export function registerPreviewSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: PREVIEW_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: false, corsEnabled: false }
    }
  ])
}

/** 실제 핸들러 등록 — `app.whenReady()` 이후에 부른다. */
export function installPreviewProtocol(): void {
  protocol.handle(PREVIEW_SCHEME, async (request) => {
    const filePath = pathFromPreviewUrl(request.url)
    if (!filePath) return new Response('잘못된 미리보기 주소', { status: 400 })

    try {
      const stat = await fs.stat(filePath)
      // 폴더는 서빙하지 않는다 — 미리보기는 파일 하나를 그리는 화면이다.
      if (!stat.isFile()) return new Response('파일이 아닙니다', { status: 404 })
    } catch {
      return new Response('파일을 찾을 수 없습니다', { status: 404 })
    }

    const upstream = await net.fetch(pathToFileURL(filePath).toString())
    const headers = new Headers(upstream.headers)
    headers.set('Content-Security-Policy', PREVIEW_CSP)
    return new Response(upstream.body, { status: upstream.status, headers })
  })
}
