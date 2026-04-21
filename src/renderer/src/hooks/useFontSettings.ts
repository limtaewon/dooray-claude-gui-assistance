import { useEffect, useState, useCallback } from 'react'

export type FontFamily = 'default' | 'pretendard' | 'appleSystem' | 'notoSansKr' | 'sans' | 'serif'

export interface FontSettings {
  family: FontFamily
  /** 글자 크기 배율 (1.0 = 기본). 0.85 ~ 1.4 권장 */
  scale: number
}

const STORAGE_KEY = 'fontSettings'
const DEFAULT: FontSettings = { family: 'default', scale: 1.0 }

const FAMILY_STACKS: Record<FontFamily, string> = {
  default: "Inter, 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Malgun Gothic', system-ui, sans-serif",
  pretendard: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  appleSystem: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  notoSansKr: "'Noto Sans KR', 'Malgun Gothic', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  sans: "Inter, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif",
  serif: "'Noto Serif KR', 'Apple SD Gothic Neo', Georgia, serif"
}

export const FONT_FAMILY_LABELS: Record<FontFamily, string> = {
  default: '기본 (Inter + 시스템 한글)',
  pretendard: 'Pretendard',
  appleSystem: '애플 시스템',
  notoSansKr: 'Noto Sans KR',
  sans: 'Sans-serif',
  serif: 'Serif'
}

function readStored(): FontSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT }
    const parsed = JSON.parse(raw) as Partial<FontSettings>
    const family = (parsed.family && parsed.family in FAMILY_STACKS ? parsed.family : 'default') as FontFamily
    const scaleNum = Number(parsed.scale)
    const scale = Number.isFinite(scaleNum) ? Math.max(0.75, Math.min(1.6, scaleNum)) : 1.0
    return { family, scale }
  } catch {
    return { ...DEFAULT }
  }
}

function applyFont(settings: FontSettings): void {
  const root = document.documentElement
  root.style.setProperty('--app-font-family', FAMILY_STACKS[settings.family])
  root.style.setProperty('--app-font-scale', String(settings.scale))
}

/** 공유 폰트 설정 상태.
 * useFontSettings 여러 인스턴스가 독립 state를 가지면 stale 값이
 * localStorage로 덮어써질 수 있어 모듈 레벨 단일 source of truth + pub/sub. */
let sharedSettings: FontSettings = readStored()
const listeners = new Set<(s: FontSettings) => void>()

function setShared(next: FontSettings): void {
  if (sharedSettings.family === next.family && sharedSettings.scale === next.scale) return
  sharedSettings = next
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  applyFont(next)
  for (const fn of listeners) fn(next)
}

export function useFontSettings(): {
  settings: FontSettings
  setFamily: (f: FontFamily) => void
  setScale: (s: number) => void
  reset: () => void
} {
  const [settings, setLocal] = useState<FontSettings>(sharedSettings)

  useEffect(() => {
    if (sharedSettings !== settings) setLocal(sharedSettings)
    const listener = (s: FontSettings): void => setLocal(s)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setFamily = useCallback((family: FontFamily) => {
    setShared({ ...sharedSettings, family })
  }, [])

  const setScale = useCallback((scale: number) => {
    const clamped = Math.max(0.75, Math.min(1.6, scale))
    setShared({ ...sharedSettings, scale: clamped })
  }, [])

  const reset = useCallback(() => {
    setShared({ ...DEFAULT })
  }, [])

  return { settings, setFamily, setScale, reset }
}

// App 부트스트랩에서 호출 — FOUC 방지
export function initFontSettings(): void {
  sharedSettings = readStored()
  applyFont(sharedSettings)
}
