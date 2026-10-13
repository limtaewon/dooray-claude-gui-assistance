import type { HookEventPayload } from '../dooray/mention/HookServer'

export interface HookRoute {
  kind: string
  id: string
  meta?: Record<string, unknown>
}

export type HookResolver = (cwd: string) => HookRoute | null
export type HookKindHandler = (ev: HookEventPayload, route: HookRoute) => void | Promise<void>
/** 결정을 돌려주는 hook(PreToolUse) 처리기. null 이면 결정하지 않음 — 도구는 그대로 실행된다 */
export type HookKindDecider = (ev: HookEventPayload, route: HookRoute, signal: AbortSignal) => Promise<Record<string, unknown> | null>

/**
 * claude code hook(cwd 기반)을 소유 도메인으로 라우팅하는 도메인 무지 라우터.
 * resolver 는 등록 순서대로 first-match, kind 핸들러는 소유권 배타적으로 1개.
 */
export class ClaudeHookRouter {
  private resolvers: HookResolver[] = []
  private handlers = new Map<string, HookKindHandler>()
  private deciders = new Map<string, HookKindDecider>()

  addResolver(resolver: HookResolver): void {
    this.resolvers.push(resolver)
  }

  setHandler(kind: string, handler: HookKindHandler): void {
    this.handlers.set(kind, handler)
  }

  setDecider(kind: string, decider: HookKindDecider): void {
    this.deciders.set(kind, decider)
  }

  /** 결정형 hook — 소유 도메인에 결정자가 없으면 null(결정 안 함) */
  async decide(ev: HookEventPayload, signal: AbortSignal): Promise<Record<string, unknown> | null> {
    const route = this.resolve(ev.cwd)
    if (!route) return null
    const decider = this.deciders.get(route.kind)
    return decider ? decider(ev, route, signal) : null
  }

  private resolve(cwd: string): HookRoute | null {
    for (const resolver of this.resolvers) {
      try {
        const route = resolver(cwd)
        if (route) return route
      } catch (err) {
        console.warn('[ClaudeHookRouter] resolver 에러:', err)
      }
    }
    return null
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
