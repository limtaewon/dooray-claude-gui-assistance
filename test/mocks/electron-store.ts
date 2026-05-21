/**
 * 인메모리 electron-store 대체.
 * 테스트에서 `vi.mock('electron-store', () => ...)` 로 주입.
 * 각 store 인스턴스는 독립 메모리.
 */
export class MemElectronStore<T extends Record<string, unknown>> {
  private data: T
  constructor(opts: { defaults?: T; name?: string } = {}) {
    this.data = (opts.defaults ? { ...opts.defaults } : {}) as T
  }
  get(key: string, fallback?: unknown): unknown {
    const v = (this.data as Record<string, unknown>)[key]
    return v === undefined ? fallback : v
  }
  set(key: string, value: unknown): void {
    ;(this.data as Record<string, unknown>)[key] = value
  }
  delete(key: string): void {
    delete (this.data as Record<string, unknown>)[key]
  }
  clear(): void {
    this.data = {} as T
  }
}
