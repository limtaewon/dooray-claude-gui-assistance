/**
 * flowTheme — @xyflow/react 배경/그리드/컨트롤/미니맵 색상 설정.
 *
 * react-flow 의 Background/MiniMap/Controls 컴포넌트에 전달할
 * 색상 값을 Clauday DS CSS 변수로 바인딩한다.
 *
 * 다크/라이트 전환 시 CSS 변수가 자동으로 갱신되므로
 * 이 함수는 마운트 시 한 번만 호출하면 된다.
 * useTheme 변경 → CSS 변수 상속 → react-flow 컴포넌트 재렌더 없이 자동 반영.
 *
 * ADR-003 §테마 연동 참조.
 */

/** react-flow BackgroundVariant 에 해당하는 string literal */
export type BackgroundVariantStr = 'dots' | 'lines' | 'cross'

export interface FlowTheme {
  /** react-flow Background 컴포넌트 색 */
  bgColor: string
  /** react-flow Background 점/선 색 */
  patternColor: string
  /** react-flow MiniMap 배경색 */
  miniMapBg: string
  /** react-flow MiniMap 노드 기본색 */
  miniMapNodeColor: string
  /** react-flow MiniMap 마스크(외곽) 색 */
  miniMapMaskColor: string
  /** react-flow Controls 버튼 배경 */
  controlsBg: string
  /** react-flow Controls 버튼 테두리 */
  controlsBorder: string
  /** react-flow Controls 버튼 아이콘/텍스트 색 */
  controlsColor: string
  /** react-flow 전체 컨테이너 배경 */
  containerBg: string
}

/**
 * CSS 변수 기반 FlowTheme 객체를 반환한다.
 *
 * 반환된 문자열 값들은 모두 `var(--token)` 형식이므로
 * 런타임에 실제 색상으로 해석된다.
 */
export function getFlowTheme(): FlowTheme {
  return {
    bgColor: 'var(--bg-primary)',
    patternColor: 'var(--bg-border)',
    miniMapBg: 'var(--bg-surface)',
    miniMapNodeColor: 'var(--bg-border)',
    miniMapMaskColor: 'color-mix(in oklab, var(--bg-primary) 70%, transparent)',
    controlsBg: 'var(--bg-surface)',
    controlsBorder: 'var(--bg-border)',
    controlsColor: 'var(--text-secondary)',
    containerBg: 'var(--bg-primary)'
  }
}

/**
 * react-flow 루트 요소에 인라인으로 주입할 스타일 속성을 반환한다.
 *
 * react-flow 내부 CSS 변수(`--xy-*`)를 Clauday DS 변수로 오버라이드한다.
 * 이 방식으로 react-flow 기본 스타일이 DS 토큰을 따르게 된다.
 */
export function getFlowCSSVarOverrides(): React.CSSProperties {
  return {
    '--xy-background-color': 'var(--bg-primary)',
    '--xy-edge-stroke': 'var(--bg-border)',
    '--xy-edge-stroke-selected': 'var(--c-blue-solid)',
    '--xy-selection-background-color': 'color-mix(in oklab, var(--c-blue-bg) 60%, transparent)',
    '--xy-selection-border-color': 'var(--c-blue-solid)',
    '--xy-controls-button-background-color': 'var(--bg-surface)',
    '--xy-controls-button-background-color-hover': 'var(--bg-surface-hover)',
    '--xy-controls-button-color': 'var(--text-secondary)',
    '--xy-controls-button-border-color': 'var(--bg-border)',
    '--xy-minimap-background-color': 'var(--bg-surface)',
    '--xy-minimap-mask-background-color': 'color-mix(in oklab, var(--bg-primary) 70%, transparent)'
  } as React.CSSProperties
}

// CSSProperties 타입 참조용 — tree-shaking 안전
import type React from 'react'
