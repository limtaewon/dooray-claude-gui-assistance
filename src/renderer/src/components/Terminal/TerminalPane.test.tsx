/**
 * TerminalPane 단위 테스트 — v2.0 B-1 종료 오버레이 · 입력 차단 회귀 게이트 + B-3 isVisible/isFocused 분리.
 *
 * xterm(@xterm/xterm, @xterm/addon-*)은 canvas/native 렌더러에 의존해 jsdom 에서 신뢰할 수
 * 없다 — TerminalManager.test.ts 의 node-pty mock 과 동일하게 boundary 에서 대체한다.
 * ResizeObserver 도 jsdom 에 없어 mount effect 가 실패하지 않도록 폴리필한다.
 *
 * 초점 — ADR-v2-terminal-p1-02 §결정 4 (exitInfoRef stale 클로저 함정):
 * mount effect(onData/attachCustomKeyEventHandler)의 클로저는 한 번만 만들어지므로,
 * exitInfo prop 을 직접 읽으면 이후 prop 변경이 입력 차단에 반영되지 않는 회귀가 생긴다.
 * 아래 테스트는 "마운트 시점엔 exitInfo 가 없다가 리렌더로 생기는" 순서를 재현해 이 함정을 고정한다.
 *
 * B-3 섹션은 레거시 `isActive` 케이스(위)를 전부 수정 없이 통과시키는 것 자체가 무회귀 증거이고,
 * 그 아래에 `isVisible`/`isFocused`/`forwardRef` 신규 계약을 추가로 고정한다 (ADR-v2-terminal-p2-01).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRef } from 'react'
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
// B-3: windowsPty 옵션이 생성자에 실제로 전달됐는지 검증하기 위한 마지막 생성자 인자 캡처.
let lastTerminalOptions: Record<string, unknown> | undefined

vi.mock('@xterm/xterm', () => {
  class FakeTerminal {
    buffer = { active: { viewportY: 0, baseY: 0, cursorX: 0, cursorY: 0 } }
    unicode = { activeVersion: '6' }
    textarea: undefined = undefined
    private dataHandler: ((data: string) => void) | null = null
    private keyHandler: ((event: FakeKeyEvent) => boolean) | null = null

    constructor(options?: Record<string, unknown>) {
      lastTerminalOptions = options
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
    proposeDimensions(): { cols: number; rows: number } { return { cols: 80, rows: 24 } }
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
// v2.0 B-4: suspendAutoResize 게이트 테스트를 위해 마지막 콜백을 캡처해 수동으로 발화시킨다.
let lastResizeObserverCallback: (() => void) | null = null
class FakeResizeObserver {
  constructor(cb: () => void) { lastResizeObserverCallback = cb }
  observe(): void {}
  disconnect(): void {}
}

import TerminalPane from './TerminalPane'
import type { TerminalPaneHandle } from './TerminalPane'

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
    lastTerminalOptions = undefined
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

  describe('v2.0 B-3 — isVisible/isFocused 분리 (ADR-v2-terminal-p2-01)', () => {
    function makePathedFile(path: string): File {
      const file = new File(['x'], 'shot.png', { type: 'image/png' })
      Object.defineProperty(file, 'path', { value: path })
      return file
    }

    it('focused: false 인 pane 은 document paste 리스너를 등록하지 않는다', () => {
      const addSpy = vi.spyOn(document, 'addEventListener')
      renderWithDs(<TerminalPane sessionId="s1" isVisible isFocused={false} />)
      expect(addSpy.mock.calls.some(([type]) => type === 'paste')).toBe(false)
      addSpy.mockRestore()
    })

    it('focused: true 인 pane 은 document paste 리스너를 등록한다', () => {
      const addSpy = vi.spyOn(document, 'addEventListener')
      renderWithDs(<TerminalPane sessionId="s1" isVisible isFocused />)
      expect(addSpy.mock.calls.some(([type]) => type === 'paste')).toBe(true)
      addSpy.mockRestore()
    })

    it('레거시 isActive={true} 는 isVisible/isFocused 를 생략해도 paste 리스너를 등록한다 (현행 동일)', () => {
      const addSpy = vi.spyOn(document, 'addEventListener')
      renderWithDs(<TerminalPane sessionId="s1" isActive />)
      expect(addSpy.mock.calls.some(([type]) => type === 'paste')).toBe(true)
      addSpy.mockRestore()
    })

    it('분할 시뮬레이션 — visible 2개 중 focused 1개일 때 이미지 붙여넣기 1회 → saveAttachment 1회', async () => {
      renderWithDs(
        <>
          <TerminalPane sessionId="s1" isVisible isFocused />
          <TerminalPane sessionId="s2" isVisible isFocused={false} />
        </>
      )
      const dataTransfer = {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => makePathedFile('/tmp/shot.png') }]
      }
      const pasteEvent = new Event('paste', { bubbles: true }) as unknown as ClipboardEvent
      Object.defineProperty(pasteEvent, 'clipboardData', { value: dataTransfer })
      document.dispatchEvent(pasteEvent)

      await waitFor(() => {
        expect(window.api.terminal.input).toHaveBeenCalledTimes(1)
        expect(window.api.terminal.input).toHaveBeenCalledWith('s1', '/tmp/shot.png ')
      })
    })

    it('visible 전환에서만 terminal.resize 가 발생하고, focused 단독 전환에서는 발생하지 않는다', async () => {
      const { rerender } = renderWithDs(<TerminalPane sessionId="s1" isVisible={false} isFocused={false} />)
      // 마운트 rAF(무조건 1회 fit+resize)가 끝나길 기다린 뒤 카운트를 리셋한다.
      await waitFor(() => expect(window.api.terminal.resize).toHaveBeenCalled())
      vi.mocked(window.api.terminal.resize).mockClear()

      rerender(<TerminalPane sessionId="s1" isVisible={false} isFocused />)
      await new Promise((r) => setTimeout(r, 50))
      expect(window.api.terminal.resize).not.toHaveBeenCalled()

      rerender(<TerminalPane sessionId="s1" isVisible isFocused />)
      await waitFor(() => {
        expect(window.api.terminal.resize).toHaveBeenCalledWith({ id: 's1', cols: 80, rows: 24 })
      })
    })

    it('ref.current.serialize() 는 addon 미로드 상태에서도 null 을 반환한다 (throw 없음)', () => {
      const ref = createRef<TerminalPaneHandle>()
      renderWithDs(<TerminalPane ref={ref} sessionId="s1" isVisible isFocused />)
      expect(ref.current?.serialize()).toBeNull()
    })

    it('ref.current.focus()/fit() 이 예외 없이 동작한다', () => {
      const ref = createRef<TerminalPaneHandle>()
      renderWithDs(<TerminalPane ref={ref} sessionId="s1" isVisible isFocused />)
      expect(() => ref.current?.focus()).not.toThrow()
      expect(() => ref.current?.fit()).not.toThrow()
    })
  })

  describe('v2.0 B-4 — paste 타겟 4중 검증 / DOM 리페어런트 (ADR-v2-terminal-p2-02 §9/§4)', () => {
    function makePathedFile(path: string): File {
      const file = new File(['x'], 'shot.png', { type: 'image/png' })
      Object.defineProperty(file, 'path', { value: path })
      return file
    }
    function dispatchImagePaste(): void {
      const dataTransfer = {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => makePathedFile('/tmp/shot.png') }]
      }
      const pasteEvent = new Event('paste', { bubbles: true }) as unknown as ClipboardEvent
      Object.defineProperty(pasteEvent, 'clipboardData', { value: dataTransfer })
      document.dispatchEvent(pasteEvent)
    }

    it('현재 유효 타겟과 4필드가 일치하면 paste 가 정상 전달된다', async () => {
      const getCurrentPasteTarget = vi.fn().mockReturnValue({ tabId: 't1', leafId: 'l1', sessionId: 's1', generation: 0 })
      renderWithDs(
        <TerminalPane sessionId="s1" isVisible isFocused tabId="t1" leafId="l1" paneGeneration={0}
          getCurrentPasteTarget={getCurrentPasteTarget} />
      )
      dispatchImagePaste()
      await waitFor(() => {
        expect(window.api.terminal.input).toHaveBeenCalledWith('s1', '/tmp/shot.png ')
      })
    })

    it('클립보드 read 도중 타겟이 바뀌면 폐기되고 console.warn 이 찍힌다', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      // 검증 시점에 다른 leafId 를 반환 — 포커스가 다른 pane 으로 옮겨간 상황을 흉내낸다.
      const getCurrentPasteTarget = vi.fn().mockReturnValue({ tabId: 't1', leafId: 'other-leaf', sessionId: 's1', generation: 0 })
      renderWithDs(
        <TerminalPane sessionId="s1" isVisible isFocused tabId="t1" leafId="l1" paneGeneration={0}
          getCurrentPasteTarget={getCurrentPasteTarget} />
      )
      dispatchImagePaste()
      await waitFor(() => {
        expect(warnSpy).toHaveBeenCalledWith('[terminal-paste] 타겟 변경으로 폐기', expect.anything())
      })
      expect(window.api.terminal.input).not.toHaveBeenCalled()
      warnSpy.mockRestore()
    })

    it('tabId/leafId 가 없는 레거시 호스트는 getCurrentPasteTarget 이 있어도 게이팅되지 않는다', async () => {
      const getCurrentPasteTarget = vi.fn().mockReturnValue(null)
      renderWithDs(<TerminalPane sessionId="s1" isVisible isFocused getCurrentPasteTarget={getCurrentPasteTarget} />)
      dispatchImagePaste()
      await waitFor(() => {
        expect(window.api.terminal.input).toHaveBeenCalledWith('s1', '/tmp/shot.png ')
      })
    })

    it('captureScrollState/restoreScrollState 는 예외 없이 왕복한다', () => {
      const ref = createRef<TerminalPaneHandle>()
      renderWithDs(<TerminalPane ref={ref} sessionId="s1" isVisible isFocused />)
      const state = ref.current?.captureScrollState() ?? null
      expect(state).toEqual({ viewportY: 0, wasAtBottom: true })
      expect(() => ref.current?.restoreScrollState(state)).not.toThrow()
      expect(() => ref.current?.restoreScrollState(null)).not.toThrow()
    })

    it('suspendAutoResize 인 동안엔 ResizeObserver 발 PTY resize 가 억제된다 — 해제되면 재개된다', async () => {
      const { rerender } = renderWithDs(<TerminalPane sessionId="s1" isVisible isFocused suspendAutoResize />)
      await waitFor(() => expect(window.api.terminal.resize).toHaveBeenCalled()) // 마운트 rAF 1회는 게이트 무관
      vi.mocked(window.api.terminal.resize).mockClear()

      lastResizeObserverCallback?.()
      await new Promise((r) => setTimeout(r, 60))
      expect(window.api.terminal.resize).not.toHaveBeenCalled()

      rerender(<TerminalPane sessionId="s1" isVisible isFocused suspendAutoResize={false} />)
      lastResizeObserverCallback?.()
      await waitFor(() => expect(window.api.terminal.resize).toHaveBeenCalled())
    })
  })

  describe('v2.0 windows-fix ADR-v2-windows-fix-03 §4 — windowsPty 게이트', () => {
    it('api.system 이 win32/21376+ 이면 Terminal 생성자 옵션에 windowsPty 가 포함된다', () => {
      window.api.system = { platform: 'win32', osRelease: '10.0.22621' }
      renderWithDs(<TerminalPane sessionId="s1" isActive />)
      expect(lastTerminalOptions?.windowsPty).toEqual({ backend: 'conpty', buildNumber: 22621 })
    })

    it('api.system 이 darwin 이면 windowsPty 가 포함되지 않는다 (mock 기본값)', () => {
      renderWithDs(<TerminalPane sessionId="s1" isActive />)
      expect(lastTerminalOptions?.windowsPty).toBeUndefined()
    })

    it('api.system 이 win32 라도 구형 빌드(21376 미만)면 windowsPty 가 포함되지 않는다', () => {
      window.api.system = { platform: 'win32', osRelease: '10.0.19044' }
      renderWithDs(<TerminalPane sessionId="s1" isActive />)
      expect(lastTerminalOptions?.windowsPty).toBeUndefined()
    })
  })
})
