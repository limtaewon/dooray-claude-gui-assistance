/*
 * Portions adapted from Orca (https://github.com/stablyai/orca)
 * Original: src/renderer/src/lib/pane-manager/terminal-link-provider-guard.ts (v1.4.162)
 * Copyright (c) 2026 Lovecast Inc. — MIT License
 * See THIRD-PARTY-NOTICES.md
 *
 * 변경: Orca 는 예외를 `recordRendererCrashBreadcrumb`(사내 진단 파이프라인)로 보고한다 — Clauday 에는
 * 그 모듈이 없어 `console.warn` 으로 강등했다. 그 외 monkey-patch 로직은 원본과 동일하다.
 */

import type { ILink, ILinkProvider, Terminal } from '@xterm/xterm'

/**
 * `provideLinks` 안에서 발생한 동기 throw 를 "이번 hover 는 링크 없음" 으로 강등해 렌더러 전체가
 * 죽는 것을 막는다 (ADR-v2-terminal-p2-05 §레이어 0, 함정 #5) — `@xterm/addon-web-links` 의
 * `LinkComputer` 가 병적인 wrap 라인에서 `RangeError` 를 던진 사례가 있다.
 */
export function guardLinkProvider(provider: ILinkProvider, label: string): ILinkProvider {
  return {
    provideLinks(bufferLineNumber, callback) {
      let callbackInvoked = false
      const trackedCallback = (links: ILink[] | undefined): void => {
        callbackInvoked = true
        callback(links)
      }
      try {
        provider.provideLinks(bufferLineNumber, trackedCallback)
      } catch (error: unknown) {
        console.warn('[terminal-link-guard] provideLinks 예외 — 링크 없음으로 강등', {
          provider: label,
          bufferLineNumber,
          error
        })
        // 콜백이 이미 링크를 전달한 뒤에 던졌다면 다시 호출하지 않는다(이중 호출 방지).
        if (!callbackInvoked) callback(undefined)
      }
    }
  }
}

/**
 * `terminal.registerLinkProvider` 를 monkey-patch 해서 이후 등록되는 모든 provider(addon 내부의
 * `loadAddon` 경유 등록 포함 — 대표적으로 web-links 의 `LinkComputer`)가 {@link guardLinkProvider} 로
 * 감싸지도록 한다. **`new Terminal()` 직후, 어떤 `loadAddon`/`registerLinkProvider` 호출보다도 먼저
 * 호출해야 한다** — 순서가 틀리면 이미 등록된 provider 는 patch 되지 않은 원본으로 남는다.
 */
export function installLinkProviderGuard(terminal: Terminal): void {
  if (typeof terminal.registerLinkProvider !== 'function') return
  const register = terminal.registerLinkProvider.bind(terminal)
  let providerCount = 0
  terminal.registerLinkProvider = (provider: ILinkProvider) => {
    providerCount += 1
    return register(guardLinkProvider(provider, `provider-${providerCount}`))
  }
}
