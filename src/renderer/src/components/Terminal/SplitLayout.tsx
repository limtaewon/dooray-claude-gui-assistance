/**
 * split 트리를 재귀적으로 렌더한다 (v2.0 B-4, ADR-v2-terminal-p2-02 §5).
 *
 * leaf 슬롯은 의도적으로 "빈 div" 다 — 실제 xterm 인스턴스는 `TerminalView` 가 트리 밖
 * `Map<leafId, HTMLDivElement>` 에 보관하고 `createPortal` 로 붙인다. 여기서 `<TerminalPane>` 을
 * 직접 렌더하면 트리 모양이 바뀔 때(split/close) React 재조정으로 컴포넌트가 리마운트되어
 * 스크롤백·alt buffer·PTY 바인딩이 소실된다(ADR-02 §4, 함정 #8). 이 파일이 하는 일은 slot div 를
 * 만들고 effect 에서 host 를 appendChild(reattachPaneHost) 하는 "빈 그릇" 역할뿐이다.
 */
import { useEffect, useRef } from 'react'
import type { SplitNode } from '@shared/types/terminal'
import type { SplitPath } from './splitTree'
import { quantizeRatio } from './splitTree'
import { ratioFromPointer } from './paneDividerDrag'
import { reattachPaneHost } from './reattachPaneHost'
import type { TerminalPaneHandle } from './TerminalPane'

interface SplitLayoutProps {
  tree: SplitNode
  getHost: (leafId: string) => HTMLDivElement
  getHandle: (leafId: string) => TerminalPaneHandle | null
  /** 드래그 완료(드롭) 시 1회 — path 는 대상 분기 노드의 주소. ratio 는 quantizeRatio 를 거친 값. */
  onRatioCommit: (path: SplitPath, ratio: number | undefined) => void
  /** 드래그 시작/종료를 알린다 — 호스트가 이 구간 동안 pane 들의 ResizeObserver 발 PTY resize 를 억제한다(함정 #9). */
  onDragActiveChange?: (active: boolean) => void
}

export default function SplitLayout({ tree, getHost, getHandle, onRatioCommit, onDragActiveChange }: SplitLayoutProps): JSX.Element {
  return (
    <div className="w-full h-full flex overflow-hidden">
      <SplitNodeView
        node={tree}
        path={[]}
        getHost={getHost}
        getHandle={getHandle}
        onRatioCommit={onRatioCommit}
        onDragActiveChange={onDragActiveChange}
      />
    </div>
  )
}

interface NodeViewProps {
  node: SplitNode
  path: SplitPath
  getHost: (leafId: string) => HTMLDivElement
  getHandle: (leafId: string) => TerminalPaneHandle | null
  onRatioCommit: (path: SplitPath, ratio: number | undefined) => void
  onDragActiveChange?: (active: boolean) => void
}

function SplitNodeView({ node, path, getHost, getHandle, onRatioCommit, onDragActiveChange }: NodeViewProps): JSX.Element {
  if (node.type === 'leaf') {
    return <PaneSlot leafId={node.leafId} getHost={getHost} getHandle={getHandle} />
  }
  return (
    <SplitBranchView
      node={node}
      path={path}
      getHost={getHost}
      getHandle={getHandle}
      onRatioCommit={onRatioCommit}
      onDragActiveChange={onDragActiveChange}
    />
  )
}

function PaneSlot({
  leafId,
  getHost,
  getHandle
}: {
  leafId: string
  getHost: (leafId: string) => HTMLDivElement
  getHandle: (leafId: string) => TerminalPaneHandle | null
}): JSX.Element {
  const slotRef = useRef<HTMLDivElement>(null)
  // deps 없이 매 렌더 실행 — reattachPaneHost 는 이미 붙어있으면 즉시 반환하므로 비용이 낮고,
  // 트리 재구성으로 slot div 자체가 새로 생기는 경우를 놓치지 않는다.
  useEffect(() => {
    const slot = slotRef.current
    if (!slot) return
    reattachPaneHost(getHost(leafId), slot, getHandle(leafId))
  })
  return <div ref={slotRef} className="relative flex-1 min-w-0 min-h-0" />
}

function SplitBranchView({
  node,
  path,
  getHost,
  getHandle,
  onRatioCommit,
  onDragActiveChange
}: NodeViewProps & { node: Extract<SplitNode, { type: 'split' }> }): JSX.Element {
  const isRow = node.direction === 'row'
  const ratio = node.ratio ?? 0.5
  const containerRef = useRef<HTMLDivElement>(null)
  const firstRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={containerRef} className={`flex ${isRow ? 'flex-row' : 'flex-col'} flex-1 min-w-0 min-h-0`}>
      <div
        ref={firstRef}
        className="relative flex min-w-0 min-h-0"
        style={{ flex: `0 0 ${ratio * 100}%` }}
      >
        <SplitNodeView
          node={node.first}
          path={[...path, 'first']}
          getHost={getHost}
          getHandle={getHandle}
          onRatioCommit={onRatioCommit}
          onDragActiveChange={onDragActiveChange}
        />
      </div>

      {/* 리사이즈 핸들 — Orca pane-divider-drag.ts adapted (계산부는 paneDividerDrag.ts).
          투명 히트박스 8px(w-2/h-2) + 중앙 1px 시각선. 드래그 중엔 DOM flex-basis 만 직접
          조작한다 — React state·PTY resize 는 건드리지 않고, 드롭 시 onRatioCommit 으로 1회만
          커밋한다(함정 #9). */}
      <div
        role="separator"
        aria-orientation={isRow ? 'vertical' : 'horizontal'}
        title="드래그해서 크기 조절 · 더블클릭으로 50/50"
        className={`group relative flex-none ${isRow ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize'}`}
        onPointerDown={(e) => {
          e.preventDefault()
          const handleEl = e.currentTarget
          handleEl.setPointerCapture(e.pointerId)
          onDragActiveChange?.(true)
          let rafId: number | null = null
          let latestRatio = ratio
          const move = (ev: globalThis.PointerEvent): void => {
            if (rafId !== null) return
            rafId = requestAnimationFrame(() => {
              rafId = null
              const container = containerRef.current
              const first = firstRef.current
              if (!container || !first) return
              const rect = container.getBoundingClientRect()
              const pointerPx = isRow ? ev.clientX : ev.clientY
              const containerStart = isRow ? rect.left : rect.top
              const totalPx = isRow ? rect.width : rect.height
              latestRatio = ratioFromPointer(pointerPx, containerStart, totalPx)
              first.style.flexBasis = `${latestRatio * 100}%`
            })
          }
          const up = (): void => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
            if (rafId !== null) cancelAnimationFrame(rafId)
            onDragActiveChange?.(false)
            onRatioCommit(path, quantizeRatio(latestRatio))
          }
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', up)
        }}
        onDoubleClick={() => {
          if (firstRef.current) firstRef.current.style.flexBasis = '50%'
          onRatioCommit(path, undefined)
        }}
      >
        <div
          className={`absolute bg-bg-border group-hover:bg-clauday-blue transition-colors pointer-events-none ${
            isRow ? 'inset-y-0 left-1/2 -translate-x-1/2 w-px' : 'inset-x-0 top-1/2 -translate-y-1/2 h-px'
          }`}
        />
      </div>

      <div className="relative flex flex-1 min-w-0 min-h-0">
        <SplitNodeView
          node={node.second}
          path={[...path, 'second']}
          getHost={getHost}
          getHandle={getHandle}
          onRatioCommit={onRatioCommit}
          onDragActiveChange={onDragActiveChange}
        />
      </div>
    </div>
  )
}
