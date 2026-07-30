import type { HookEventPayload } from '../dooray/mention/HookServer'

export interface HookRoute {
  kind: string
  id: string
  meta?: Record<string, unknown>
}

export type HookResolver = (cwd: string) => HookRoute | null
export type HookKindHandler = (ev: HookEventPayload, route: HookRoute) => void | Promise<void>

/**
 * claude code hook(cwd 기반)을 소유 도메인으로 라우팅하는 도메인 무지 라우터.
 * resolver 는 등록 순서대로 first-match, kind 핸들러는 소유권 배타적으로 1개.
 */
export class ClaudeHookRouter {
  private resolvers: HookResolver[] = []
  private handlers = new Map<string, HookKindHandler>()

  addResolver(resolver: HookResolver): void {
    this.resolvers.push(resolver)
  }

  setHandler(kind: string, handler: HookKindHandler): void {
    this.handlers.set(kind, handler)
  }

  async dispatch(ev: HookEventPayload): Promise<void> {
    let route: HookRoute | null = null
    for (const resolver of this.resolvers) {
      try {
        route = resolver(ev.cwd)
      } catch (err) {
        console.warn('[ClaudeHookRouter] resolver 에러:', err)
        continue
      }
      if (route) break
    }
    if (!route) return

    const handler = this.handlers.get(route.kind)
    if (!handler) {
      console.warn(`[ClaudeHookRouter] 핸들러 미등록 kind=${route.kind}, id=${route.id}`)
      return
    }
    await handler(ev, route)
  }
}
