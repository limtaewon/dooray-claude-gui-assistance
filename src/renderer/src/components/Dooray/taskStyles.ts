import { Circle, AlertCircle, Clock, CheckCircle2 } from 'lucide-react'
import type { DoorayTask } from '../../../../shared/types/dooray'

/** 태스크 워크플로 아이콘/색상 + 태그 칩 스타일 헬퍼. ProjectTaskView·TaskRow 공유 자산 (ADR-v2-workspace-p0-03). */

export const WORKFLOW_ICONS: Record<string, typeof Circle> = {
  backlog: Circle, registered: AlertCircle, working: Clock, done: CheckCircle2, closed: CheckCircle2
}
/* 상태 색은 워크플로 시맨틱 토큰(--wf-*) 사용 — 다크 무채색 크롬 정리에서도 상태 컬러는 유지된다. */
export const WORKFLOW_COLORS: Record<string, string> = {
  backlog: 'text-text-tertiary', registered: 'text-[color:var(--wf-registered-dot)]', working: 'text-[color:var(--wf-working-dot)]',
  done: 'text-[color:var(--wf-resolved-dot)]', closed: 'text-text-tertiary'
}
export const WORKFLOW_BG_COLORS: Record<string, string> = {
  backlog: 'bg-[color:var(--wf-backlog-bg)] text-[color:var(--wf-backlog-fg)]', registered: 'bg-[color:var(--wf-registered-bg)] text-[color:var(--wf-registered-fg)]',
  working: 'bg-[color:var(--wf-working-bg)] text-[color:var(--wf-working-fg)]', done: 'bg-[color:var(--wf-resolved-bg)] text-[color:var(--wf-resolved-fg)]',
  closed: 'bg-[color:var(--wf-closed-bg)] text-[color:var(--wf-closed-fg)]'
}

export function getWorkflowName(task: DoorayTask): string {
  return task.workflow?.name || task.workflowName || task.workflowClass || '알 수 없음'
}

/**
 * 태그 칩 스타일.
 * hue는 원색 유지, HSL L값을 테마별 고정 → WCAG AA(4.5:1) 대비 보장.
 */
const TAG_STYLE_CACHE = new Map<string, React.CSSProperties>()
if (typeof window !== 'undefined') {
  window.addEventListener('theme-changed', () => TAG_STYLE_CACHE.clear())
}
function currentTheme(): 'light' | 'dark' {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}
function hexToHsl(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let hue = 0
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) hue = ((b - r) / d + 2) / 6
  else hue = ((r - g) / d + 4) / 6
  return [Math.round(hue * 360), Math.round(s * 100), Math.round(l * 100)]
}
export function tagStyle(color?: string): React.CSSProperties {
  if (!color || color === 'ffffff') return {}
  const theme = currentTheme()
  const key = `${theme}|${color}`
  const cached = TAG_STYLE_CACHE.get(key)
  if (cached) return cached
  const [h, s] = hexToHsl(color)
  const sAdj = Math.min(s, 80)
  const style: React.CSSProperties = theme === 'light'
    ? {
        backgroundColor: `hsl(${h} ${sAdj * 0.25}% 94%)`,
        color: `hsl(${h} ${sAdj}% 25%)`,
        borderColor: `hsl(${h} ${sAdj * 0.5}% 75%)`
      }
    : {
        backgroundColor: `hsl(${h} ${sAdj * 0.2}% 18%)`,
        color: `hsl(${h} ${sAdj}% 80%)`,
        borderColor: `hsl(${h} ${sAdj * 0.35}% 40%)`
      }
  TAG_STYLE_CACHE.set(key, style)
  return style
}
