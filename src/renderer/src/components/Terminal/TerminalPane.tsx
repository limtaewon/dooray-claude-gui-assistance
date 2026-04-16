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
    terminal.open(containerRef.current)

    try { fitAddon.fit() } catch {}

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

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

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        const dims = fitAddon.proposeDimensions()
        if (dims) window.api.terminal.resize({ id: sessionId, cols: dims.cols, rows: dims.rows })
      } catch {}
    })
    resizeObserver.observe(containerRef.current)

    return () => { cleanup(); resizeObserver.disconnect(); terminal.dispose() }
  }, [sessionId])

  useEffect(() => {
    if (isActive && fitAddonRef.current) {
      try { fitAddonRef.current.fit() } catch {}
      terminalRef.current?.focus()
    }
  }, [isActive])

  return (
    <div ref={containerRef}
      className={`h-full w-full ${isActive ? 'block' : 'hidden'}`}
      style={{ padding: '4px 8px' }} />
  )
}

export default TerminalPane
