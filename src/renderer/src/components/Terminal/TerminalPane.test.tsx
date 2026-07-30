/**
 * TerminalPane 단위 테스트 — v2.0 B-1 종료 오버레이 · 입력 차단 회귀 게이트.
 *
 * xterm(@xterm/xterm, @xterm/addon-*)은 canvas/native 렌더러에 의존해 jsdom 에서 신뢰할 수
 * 없다 — TerminalManager.test.ts 의 node-pty mock 과 동일하게 boundary 에서 대체한다.
 * ResizeObserver 도 jsdom 에 없어 mount effect 가 실패하지 않도록 폴리필한다.
 *
 * 초점 — ADR-v2-terminal-p1-02 §결정 4 (exitInfoRef stale 클로저 함정):
 * mount effect(onData/attachCustomKeyEventHandler)의 클로저는 한 번만 만들어지므로,
 * exitInfo prop 을 직접 읽으면 이후 prop 변경이 입력 차단에 반영되지 않는 회귀가 생긴다.
 * 아래 테스트는 "마운트 시점엔 exitInfo 가 없다가 리렌더로 생기는" 순서를 재현해 이 함정을 고정한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, waitFor } from '@testing-library/react'
import { installMockWindowApi, resetMockWindowApi } from '../../../../../test/helpers/mockWindowApi'
import { renderWithDs } from '../../../../../test/helpers/renderWithDs'

interface FakeKeyEvent {
  type: string
  key: string
  shiftKey?: boolean
  altKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  isComposing?: boolean
  keyCode?: number
  preventDefault: () => void
}

interface FakeTerminalHandle {
  emitData: (data: string) => void
  emitKey: (event: FakeKeyEvent) => boolean
}

// 마지막으로 생성된 Terminal mock 인스턴스 핸들 — TerminalManager.test.ts 의 `lastPty` 패턴과 동일.
let lastTerminal: FakeTerminalHandle | null = null

vi.mock('@xterm/xterm', () => {
  class FakeTerminal {
    buffer = { active: { viewportY: 0, baseY: 0, cursorX: 0, cursorY: 0 } }
    unicode = { activeVersion: '6' }
    private dataHandler: ((data: string) => void) | null = null
    private keyHandler: ((event: FakeKeyEvent) => boolean) | null = null

    constructor() {
      lastTerminal = {
        emitData: (data: string) => this.dataHandler?.(data),
        emitKey: (event: FakeKeyEvent) => (this.keyHandler ? this.keyHandler(event) : true)
      }
    }
    loadAddon(): void {}
    open(): void {}
    write(_data: string, cb?: () => void): void { cb?.() }
    reset(): void {}
    dispose(): void {}
    focus(): void {}
    clear(): void {}
    selectAll(): void {}
    select(): void {}
    clearSelection(): void {}
    getSelection(): string { return '' }
    scrollToBottom(): void {}
    registerLinkProvider(): { dispose: () => void } { return { dispose: () => {} } }
    onData(cb: (data: string) => void): { dispose: () => void } {
      this.dataHandler = cb
      return { dispose: () => { this.dataHandler = null } }
    }
    attachCustomKeyEventHandler(fn: (event: FakeKeyEvent) => boolean): void {
      this.keyHandler = fn
    }
  }
  return { Terminal: FakeTerminal }
})

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit(): void {}
    proposeDimensions(): undefined { return undefined }
  }
}))

vi.mock('@xterm/addon-search', () => ({
  SearchAddon: class {
    onDidChangeResults(): { dispose: () => void } { return { dispose: () => {} } }
    findNext(): boolean { return false }
    findPrevious(): boolean { return false }
    clearDecorations(): void {}
  }
}))

vi.mock('@xterm/addon-unicode11', () => ({
  Unicode11Addon: class {}
}))

// jsdom 에는 ResizeObserver 가 없다 (mount effect 의 debouncedSafeResize 배선에 필요).
class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

import TerminalPane from './TerminalPane'

function currentTerminal(): FakeTerminalHandle {
  if (!lastTerminal) throw new Error('Terminal mock 인스턴스가 아직 생성되지 않았다')
  return lastTerminal
}

const multilineKeyEvent: FakeKeyEvent = {
  type: 'keydown',
  key: 'Enter',
  shiftKey: true,
  altKey: false,
  metaKey: false,
  ctrlKey: false,
  isComposing: false,
  keyCode: 13,
  preventDefault: () => {}
}

describe('TerminalPane — v2.0 B-1 종료 오버레이 / 입력 차단', () => {
  beforeEach(() => {
    installMockWindowApi()
    // @ts-expect-error jsdom 폴리필 — 프로덕션 전역엔 존재
    globalThis.ResizeObserver = FakeResizeObserver
    lastTerminal = null
  })

  afterEach(() => {
    resetMockWindowApi()
    vi.clearAllMocks()
  })

  describe('종료 오버레이 렌더링', () => {
    it('exitInfo 가 없으면 오버레이가 보이지 않는다', () => {
      const { queryByText } = renderWithDs(<TerminalPane sessionId="s1" isActive />)
      expect(queryByText(/세션이 종료되었습니다/)).not.toBeInTheDocument()
    })

    it('exitInfo 가 있으면 exit code 와 함께 오버레이가 보이고 exit 0 은 초록 dot', () => {
      const { getByText, container } = renderWithDs(
        <TerminalPane sessionId="s1" isActive exitInfo={{ exitCode: 0, signal: null }} />
      )
      expect(getByText(/세션이 종료되었습니다/)).toBeInTheDocument()
      expect(getByText('(exit 0)')).toBeInTheDocument()
      expect(container.innerHTML).toContain('--c-emerald-solid')
    })

    it('exit code 가 0 이 아니면 빨강 dot', () => {
      const { getByText, container } = renderWithDs(
        <TerminalPane sessionId="s1" isActive exitInfo={{ exitCode: 3, signal: null }} />
      )
      expect(getByText('(exit 3)')).toBeInTheDocument()
      expect(container.innerHTML).toContain('--c-red-solid')
    })

    it('onRequestClose 가 없으면 닫기 버튼을 렌더링하지 않는다', () => {
      const { queryByRole } = renderWithDs(
        <TerminalPane sessionId="s1" isActive exitInfo={{ exitCode: 0, signal: null }} />
      )
      expect(queryByRole('button', { name: '닫기' })).not.toBeInTheDocument()
    })

    it('onRequestClose 가 있으면 닫기 버튼 클릭 시 호출된다', async () => {
      const onRequestClose = vi.fn()
      const { findByRole } = renderWithDs(
        <TerminalPane
          sessionId="s1"
          isActive
          exitInfo={{ exitCode: 1, signal: null }}
          onRequestClose={onRequestClose}
        />
      )
      const btn = await findByRole('button', { name: '닫기' })
      fireEvent.click(btn)
      expect(onRequestClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('입력 차단 — terminal.onData 경로', () => {
    it('exitInfo 없으면 타이핑이 PTY 로 전달된다', () => {
      renderWithDs(<TerminalPane sessionId="s1" isActive />)
      currentTerminal().emitData('ls\n')
      expect(window.api.terminal.input).toHaveBeenCalledWith('s1', 'ls\n')
    })

    it('exitInfo 가 마운트 시점부터 있으면 타이핑이 차단된다', () => {
      renderWithDs(<TerminalPane sessionId="s1" isActive exitInfo={{ exitCode: 0, signal: null }} />)
      currentTerminal().emitData('ls\n')
      expect(window.api.terminal.input).not.toHaveBeenCalled()
    })

    it('[stale 클로저 회귀] 마운트 후 exitInfo 가 나중에 채워지면 그 시점부터 입력이 차단된다', () => {
      const { rerender } = renderWithDs(<TerminalPane sessionId="s1" isActive exitInfo={null} />)
      const term = currentTerminal()

      // exit 이전 — 정상 입력
      term.emitData('echo before\n')
      expect(window.api.terminal.input).toHaveBeenCalledWith('s1', 'echo before\n')

      // 같은 mount 를 유지한 채(re-render, 재마운트 아님) exitInfo prop 만 갱신 — mount effect 는 재실행되지 않는다.
      rerender(<TerminalPane sessionId="s1" isActive exitInfo={{ exitCode: 1, signal: null }} />)
      vi.mocked(window.api.terminal.input).mockClear()

      term.emitData('echo after\n')
      expect(window.api.terminal.input).not.toHaveBeenCalled()
    })
  })

  describe('입력 차단 — attachCustomKeyEventHandler 경로', () => {
    it('exitInfo 없으면 제어 시퀀스가 PTY 로 전달된다 (Shift+Enter → multiline)', () => {
      renderWithDs(<TerminalPane sessionId="s1" isActive />)
      currentTerminal().emitKey(multilineKeyEvent)
      expect(window.api.terminal.input).toHaveBeenCalledWith('s1', '\x1b\r')
    })

    it('exitInfo 가 있으면 제어 시퀀스도 차단된다', () => {
      renderWithDs(<TerminalPane sessionId="s1" isActive exitInfo={{ exitCode: 0, signal: null }} />)
      currentTerminal().emitKey(multilineKeyEvent)
      expect(window.api.terminal.input).not.toHaveBeenCalled()
    })

    it('[stale 클로저 회귀] 리렌더로 채워진 exitInfo 이후엔 키 입력도 차단된다', () => {
      const { rerender } = renderWithDs(<TerminalPane sessionId="s1" isActive exitInfo={null} />)
      const term = currentTerminal()

      rerender(<TerminalPane sessionId="s1" isActive exitInfo={{ exitCode: 0, signal: null }} />)
      term.emitKey(multilineKeyEvent)

      expect(window.api.terminal.input).not.toHaveBeenCalled()
    })
  })

  describe('입력 차단 — 파일 드롭 경로', () => {
    function makeDroppedFile(path: string): File {
      const file = new File(['x'], 'shot.png', { type: 'image/png' })
      Object.defineProperty(file, 'path', { value: path })
      return file
    }

    it('exitInfo 없으면 드롭된 파일 경로가 입력으로 전달된다', async () => {
      const { container } = renderWithDs(<TerminalPane sessionId="s1" isActive />)
      const root = container.firstChild as HTMLElement
      fireEvent.drop(root, { dataTransfer: { files: [makeDroppedFile('/tmp/shot.png')] } })

      await waitFor(() => {
        expect(window.api.terminal.input).toHaveBeenCalledWith('s1', '/tmp/shot.png ')
      })
    })

    it('exitInfo 가 있으면 드롭된 파일이 무시된다', async () => {
      const { container } = renderWithDs(
        <TerminalPane sessionId="s1" isActive exitInfo={{ exitCode: 0, signal: null }} />
      )
      const root = container.firstChild as HTMLElement
      fireEvent.drop(root, { dataTransfer: { files: [makeDroppedFile('/tmp/shot.png')] } })

      // 비동기 no-op 이 조용히 끝날 시간을 준다 — 이후에도 input 은 호출되지 않아야 한다.
      await new Promise((r) => setTimeout(r, 0))
      expect(window.api.terminal.input).not.toHaveBeenCalled()
    })
  })
})
