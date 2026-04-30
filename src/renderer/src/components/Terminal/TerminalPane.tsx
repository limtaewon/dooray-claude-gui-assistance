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

    // 텍스트 편집기 스타일 키바인딩 (cross-platform).
    // xterm 은 키를 그대로 PTY 로 보내는데, Cmd/Option/Win 같은 modifier 는 별도 매핑이 없으면 무시된다.
    // bash/zsh readline · Claude Code TUI · vim 등 어디서든 자연스럽게 편집되도록 변환.
    //  - macOS:  Cmd ←/→/⌫/⌦  ·  Option ←/→/⌫/⌦
    //  - Win/Linux:  Home/End/Ctrl+Backspace/Ctrl+Delete/Ctrl+←→ — 이미 PTY 가 받지만 Ctrl+Backspace
    //    같은 일부는 기본적으로 \x7f 만 보내므로 word-delete 로 보강.
    const isMac = navigator.platform.toUpperCase().includes('MAC')
    const send = (s: string): void => { try { window.api.terminal.input(sessionId, s) } catch { /* ok */ } }
    terminal.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      const meta = e.metaKey
      const alt = e.altKey
      const shift = e.shiftKey
      const ctrl = e.ctrlKey
      const k = e.key

      // 멀티라인: Shift+Enter / Alt+Enter → ESC+CR (TUI 의 multiline newline)
      if (k === 'Enter' && (shift || alt)) { e.preventDefault(); send('\x1b\r'); return false }

      if (isMac) {
        // ===== Cmd 단축키 (macOS) =====
        if (meta && !alt && !ctrl) {
          switch (k) {
            case 'ArrowLeft':  e.preventDefault(); send('\x01'); return false   // 줄 처음 (Ctrl-A)
            case 'ArrowRight': e.preventDefault(); send('\x05'); return false   // 줄 끝   (Ctrl-E)
            case 'Backspace':  e.preventDefault(); send('\x15'); return false   // 줄 앞 삭제 (Ctrl-U)
            case 'Delete':     e.preventDefault(); send('\x0b'); return false   // 줄 뒤 삭제 (Ctrl-K)
            case 'k':
            case 'K':          e.preventDefault(); terminal.clear(); return false
            case 'a':
            case 'A': {
              // 전체 버퍼 말고 "현재 입력줄" 만 선택 — 커서가 있는 줄의 시작~커서 위치.
              // Shift+Cmd+A 는 전체 버퍼 선택으로 fallback.
              e.preventDefault()
              if (shift) {
                terminal.selectAll()
              } else {
                const buf = terminal.buffer.active
                const row = buf.baseY + buf.cursorY
                const col = buf.cursorX
                if (col > 0) terminal.select(0, row, col)
                else terminal.clearSelection()
              }
              return false
            }
            case 'c':
            case 'C': {
              // 선택 영역이 있으면 클립보드 복사. 없으면 무시 (PTY 로 'c' 가 새지 않게).
              e.preventDefault()
              const sel = terminal.getSelection()
              if (sel) navigator.clipboard.writeText(sel).catch(() => { /* ok */ })
              return false
            }
            case 'v':
            case 'V': {
              // 클립보드 → PTY 로 paste
              e.preventDefault()
              navigator.clipboard.readText().then((t) => { if (t) send(t) }).catch(() => { /* ok */ })
              return false
            }
            case 'x':
            case 'X': {
              // 터미널 출력은 잘라낼 수 없음 — 선택만 복사
              e.preventDefault()
              const sel2 = terminal.getSelection()
              if (sel2) navigator.clipboard.writeText(sel2).catch(() => { /* ok */ })
              return false
            }
          }
        }
        // ===== Option(Alt) 단축키 — 단어 단위 =====
        if (alt && !meta && !ctrl) {
          switch (k) {
            case 'ArrowLeft':  e.preventDefault(); send('\x1bb'); return false  // 한 단어 뒤
            case 'ArrowRight': e.preventDefault(); send('\x1bf'); return false  // 한 단어 앞
            case 'Backspace':  e.preventDefault(); send('\x17'); return false   // 한 단어 삭제 (Ctrl-W)
            case 'Delete':     e.preventDefault(); send('\x1bd'); return false  // 한 단어 앞 삭제 (Meta-d)
          }
        }
      } else {
        // ===== Windows / Linux 단축키 =====
        // Ctrl+A/E/K/U/W · Home/End · Ctrl+←→ 등은 이미 readline 표준이라 native pass-through 로 동작.
        // 다만 Ctrl+Backspace / Ctrl+Delete 는 기본 키 신호가 미흡해서 직접 word-delete 로 매핑.
        if (ctrl && !meta && !alt) {
          switch (k) {
            case 'Backspace':  e.preventDefault(); send('\x17'); return false   // 한 단어 삭제 (Ctrl-W)
            case 'Delete':     e.preventDefault(); send('\x1bd'); return false  // 한 단어 앞 삭제 (Meta-d)
            // Ctrl+A/E/K/U/W/L 은 그대로 PTY 로 가도록 둠 (native readline 동작)
          }
        }
        // Shift+Insert (paste) — 일부 환경에서 기본 동작 안 되는 경우 보강
        if (shift && k === 'Insert') {
          // xterm 의 기본 paste 시도 — 실패하면 그냥 통과
          e.preventDefault()
          navigator.clipboard.readText().then((t) => send(t)).catch(() => { /* ok */ })
          return false
        }
        // Ctrl+A 가 브라우저의 select-all 로 가로채지지 않도록 명시적으로 control char 송신
        if (ctrl && !meta && !alt && (k === 'a' || k === 'A')) {
          e.preventDefault(); send('\x01'); return false
        }
      }

      return true
    })

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
