/** Electron powerSaveBlocker / powerMonitor 중 쓰는 부분 — 테스트에서 대체 주입한다. */
export interface PowerApi {
  startBlocker: () => number
  stopBlocker: (id: number) => void
  isOnBattery: () => boolean
  onPowerSourceChange: (listener: () => void) => void
}

export interface AwakeStatus {
  /** 사용자 설정 (기본 켬) */
  enabled: boolean
  /** 지금 잠자기를 막고 있는지 */
  holding: boolean
  onAC: boolean
  botActive: boolean
}

/**
 * @clauday 를 기다리는 동안 노트북이 잠들지 않게 한다(기획 §5.8-2).
 * 대표 상황은 "충전 중 + 덮개 열림 + 화면 꺼짐" — 화면이 꺼지면 App Nap 이 소켓 ping 을 늦춰 연결이 끊길 수 있다.
 * 봇이 연결돼 있고 **전원 연결 중일 때만** 잡는다. 배터리로 바뀌면 풀어 사용자 전원 설정을 존중한다.
 * 덮개를 닫으면 이것으로도 잠든다(클램쉘 모드 제외).
 */
export class AwakeKeeper {
  private enabled = true
  private botActive = false
  private blockerId: number | null = null
  private listeners = new Set<(s: AwakeStatus) => void>()

  constructor(private power: PowerApi) {
    power.onPowerSourceChange(() => this.evaluate())
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.evaluate()
  }

  setBotActive(active: boolean): void {
    if (this.botActive === active) return
    this.botActive = active
    this.evaluate()
  }

  getStatus(): AwakeStatus {
    return { enabled: this.enabled, holding: this.blockerId !== null, onAC: !this.power.isOnBattery(), botActive: this.botActive }
  }

  onChange(listener: (s: AwakeStatus) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  dispose(): void {
    this.release()
  }

  private evaluate(): void {
    const should = this.enabled && this.botActive && !this.power.isOnBattery()
    if (should && this.blockerId === null) {
      this.blockerId = this.power.startBlocker()
      console.log(`[AwakeKeeper] 잠자기 방지 시작 id=${this.blockerId}`)
    } else if (!should && this.blockerId !== null) {
      this.release()
    } else {
      return
    }
    const status = this.getStatus()
    for (const l of this.listeners) {
      try { l(status) } catch (err) { console.error('[AwakeKeeper] listener 에러:', err) }
    }
  }

  private release(): void {
    if (this.blockerId === null) return
    this.power.stopBlocker(this.blockerId)
    console.log(`[AwakeKeeper] 잠자기 방지 해제 id=${this.blockerId}`)
    this.blockerId = null
  }
}
