import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface TerminalPaneProps {
  sessionId: string
  isActive: boolean
  initialOutput?: string
}

function TerminalPane({ sessionId, isActive, initialOutput }: TerminalPaneProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new Terminal({
      theme: {
        background: '#111827',
        foreground: '#F9FAFB',
        cursor: '#F9FAFB',
        cursorAccent: '#111827',
        selectionBackground: '#3B82F644',
        black: '#111827',
        red: '#EF4444',
        green: '#22C55E',
        yellow: '#FB923C',
        blue: '#3B82F6',
        magenta: '#A855F7',
        cyan: '#06B6D4',
        white: '#F9FAFB',
        brightBlack: '#9CA3AF',
        brightRed: '#FCA5A5',
        brightGreen: '#86EFAC',
        brightYellow: '#FDBA74',
        brightBlue: '#93C5FD',
        brightMagenta: '#D8B4FE',
        brightCyan: '#67E8F9',
        brightWhite: '#FFFFFF'
      },
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 10000,
      allowProposedApi: true
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    try {
      terminal.open(containerRef.current)
    } catch {}

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // 다음 프레임에 fit (open 직후 dimensions 준비가 안 된 타이밍 이슈 회피)
    requestAnimationFrame(() => {
      try { fitAddon.fit() } catch {}
    })

    // 저장된 출력 복원
    if (initialOutput) {
      terminal.write(initialOutput)
    }

    terminal.onData((data) => {
      window.api.terminal.input(sessionId, data)
    })

    const cleanup = window.api.terminal.onOutput(({ id, data }) => {
      if (id === sessionId) terminal.write(data)
    })

    const safeResize = (fa: FitAddon): void => {
      try {
        fa.fit()
        const dims = fa.proposeDimensions()
        // cols/rows가 양수일 때만 전송 (컨테이너 크기가 0이면 node-pty가 에러)
        if (dims && dims.cols > 0 && dims.rows > 0) {
          window.api.terminal.resize({ id: sessionId, cols: dims.cols, rows: dims.rows })
        }
      } catch {}
    }

    const resizeObserver = new ResizeObserver(() => safeResize(fitAddon))
    resizeObserver.observe(containerRef.current)

    return () => { cleanup(); resizeObserver.disconnect(); terminal.dispose() }
  }, [sessionId])

  useEffect(() => {
    if (isActive && fitAddonRef.current) {
      // hidden → block 전환 후 레이아웃 완료를 기다린 뒤 fit
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const fa = fitAddonRef.current
          if (!fa) return
          try {
            fa.fit()
            const dims = fa.proposeDimensions()
            if (dims && dims.cols > 0 && dims.rows > 0) {
              window.api.terminal.resize({ id: sessionId, cols: dims.cols, rows: dims.rows })
            }
          } catch {}
          terminalRef.current?.focus()
        })
      })
    }
  }, [isActive, sessionId])

  return (
    <div ref={containerRef}
      className={`absolute inset-0 ${isActive ? 'z-10' : 'z-0 pointer-events-none invisible'}`}
      style={{ padding: '4px 8px' }} />
  )
}

export default TerminalPane
