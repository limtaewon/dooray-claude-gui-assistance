import { useCallback, useRef } from 'react'

interface ResizeHandleProps {
  onResize: (delta: number) => void
  direction?: 'horizontal' | 'vertical'
}

function ResizeHandle({ onResize, direction = 'horizontal' }: ResizeHandleProps): JSX.Element {
  const dragging = useRef(false)
  const lastPos = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    lastPos.current = direction === 'horizontal' ? e.clientX : e.clientY
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (ev: MouseEvent): void => {
      if (!dragging.current) return
      const current = direction === 'horizontal' ? ev.clientX : ev.clientY
      const delta = current - lastPos.current
      lastPos.current = current
      onResize(delta)
    }

    const handleMouseUp = (): void => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [onResize, direction])

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`flex-shrink-0 group ${
        direction === 'horizontal'
          ? 'w-1 cursor-col-resize hover:bg-clover-blue/30 active:bg-clover-blue/50'
          : 'h-1 cursor-row-resize hover:bg-clover-blue/30 active:bg-clover-blue/50'
      } transition-colors`}
    >
      <div className={`${
        direction === 'horizontal' ? 'w-px h-full mx-auto' : 'h-px w-full my-auto'
      } bg-bg-border group-hover:bg-clover-blue/50`} />
    </div>
  )
}

export default ResizeHandle
