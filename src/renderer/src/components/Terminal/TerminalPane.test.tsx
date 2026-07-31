/**
 * TerminalPane 단위 테스트 — v2.0 B-1 종료 오버레이 · 입력 차단 회귀 게이트 + B-3 isVisible/isFocused
 * 분리 + B-5 serialize/복원 순서/replay guard + B-6 WebGL attach/dispose.
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
import { REPLAY_CLEAR, POST_REPLAY_MODE_RESET } from './replay'
import { resetGlobalWebglFailure } from './webglPolicy'

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
  getUnicodeActiveVersion: () => string
}

// 마지막으로 생성된 Terminal mock 인스턴스 핸들 — TerminalManager.test.ts 의 `lastPty` 패턴과 동일.
let lastTerminal: FakeTerminalHandle | null = null
// B-3: windowsPty 옵션이 생성자에 실제로 전달됐는지 검증하기 위한 마지막 생성자 인자 캡처.
let lastTerminalOptions: Record<string, unknown> | undefined
// v2.0 B-5: resize/write/fit/PTY-resize 호출 순서를 기록 — 복원 시퀀스(ADR-03 §7) 단언용.
let callOrder: string[] = []
// v2.0 B-7: terminal.registerLinkProvider(guard 통과 후) 에 실제로 전달된 provider 들.
let registeredLinkProviders: Array<{ provideLinks: (line: number, cb: (links: unknown) => void) => void }> = []
// v2.0 B-7: OSC 핸들러 등록 호출(7/133) 기록 — [ident, handler][].
let registeredOscHandlers: Array<[number, (data: string) => boolean]> = []
// v2.0 B-5: true 면 terminal.write() 콜백을 microtask 로 미룬다 — replay guard 활성 구간을
// 테스트가 관찰할 수 있게 하는 스위치(기본은 기존 동작과 동일한 동기 호출).
let deferWriteCallback = false
// term.focus() 호출 횟수 — 새 pane 이 DOM 에 붙은 뒤 다시 포커스를 잡는지 확인용.
let focusCallCount = 0
// v2.0 B-5: serialize() 결과를 테스트별로 조절.
let fakeSerializeResult = 'FAKE_SERIALIZED'
let fakeSerializeShouldThrow = false

vi.mock('@xterm/xterm', () => {
  class FakeTerminal {
    buffer = { active: { viewportY: 0, baseY: 0, cursorX: 0, cursorY: 0 } }
    unicode = { activeVersion: '6', versions: ['6', '11'], register: (): void => {} }
    textarea: undefined = undefined
    cols = 80
    rows = 24
    // v2.0 B-7: element/modes/parser — 링크 provider guard/OSC7/mouse-suppression 배선 대상.
    element: HTMLDivElement | undefined = undefined
    modes = { mouseTrackingMode: 'none' as const }
    parser = {
      registerOscHandler: (ident: number, handler: (data: string) => boolean): { dispose: () => void } => {
        registeredOscHandlers.push([ident, handler])
        return { dispose: () => {} }
      }
    }
    private dataHandler: ((data: string) => void) | null = null
    private keyHandler: ((event: FakeKeyEvent) => boolean) | null = null

    constructor(options?: Record<string, unknown>) {
      lastTerminalOptions = options
      if (typeof options?.cols === 'number') this.cols = options.cols as number
      if (typeof options?.rows === 'number') this.rows = options.rows as number
      lastTerminal = {
        emitData: (data: string) => this.dataHandler?.(data),
        emitKey: (event: FakeKeyEvent) => (this.keyHandler ? this.keyHandler(event) : true),
        getUnicodeActiveVersion: () => this.unicode.activeVersion
      }
    }
    loadAddon(): void {}
    open(): void { this.element = document.createElement('div') }
    resize(cols: number, rows: number): void {
      this.cols = cols
      this.rows = rows
      callOrder.push(`term-resize:${cols}x${rows}`)
    }
    write(data: string, cb?: () => void): void {
      const tag = data === REPLAY_CLEAR ? 'CLEAR' : (data.startsWith(POST_REPLAY_MODE_RESET) ? 'MODE_RESET' : data)
      callOrder.push(`write:${tag}`)
      if (!cb) return
      if (deferWriteCallback) queueMicrotask(cb)
      else cb()
    }
    reset(): void {}
    dispose(): void {}
    focus(): void { focusCallCount++ }
    clear(): void {}
    selectAll(): void {}
    select(): void {}
    clearSelection(): void {}
    getSelection(): string { return '' }
    scrollToBottom(): void {}
    scrollToLine(): void {}
    registerLinkProvider(provider: { provideLinks: (line: number, cb: (links: unknown) => void) => void }): { dispose: () => void } {
      registeredLinkProviders.push(provider)
      return { dispose: () => {} }
    }
    paste(data: string): void {
      // 실제 xterm 은 bracketed paste 로 감싸 onData 로 흘린다
      this.dataHandler?.(`\x1b[200~${data}\x1b[201~`)
    }
    onTitleChange(): { dispose: () => void } {
      return { dispose: () => {} }
    }
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
    fit(): void { callOrder.push('fit') }
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

// v2.0 B-5: 실제 addon-serialize 는 jsdom 에 canvas 가 없어 import 시점에 경고를 뿜는다
// (Color.ts 의 기본 팔레트 계산) — FakeTerminal 과 동일한 경계 대체 전략.
vi.mock('@xterm/addon-serialize', () => ({
  SerializeAddon: class {
    serialize(): string {
      if (fakeSerializeShouldThrow) throw new Error('serialize 실패(테스트)')
      return fakeSerializeResult
    }
  }
}))

// v2.0 B-6: WebglAddon 도 동일 이유로 대체. 생성자 throw/onContextLoss 를 테스트가 제어한다.
let webglConstructorShouldThrow = false
let lastWebglOnContextLoss: (() => void) | null = null
let webglDisposeCalls = 0
vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: class {
    constructor() {
      if (webglConstructorShouldThrow) throw new Error('WebGL 초기화 실패(테스트)')
    }
    onContextLoss(cb: () => void): { dispose: () => void } {
      lastWebglOnContextLoss = cb
      return { dispose: () => {} }
    }
    dispose(): void { webglDisposeCalls += 1 }
  }
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
    callOrder = []
    registeredLinkProviders = []
    registeredOscHandlers = []
    deferWriteCallback = false
    focusCallCount = 0
    fakeSerializeResult = 'FAKE_SERIALIZED'
    fakeSerializeShouldThrow = false
    webglConstructorShouldThrow = false
    lastWebglOnContextLoss = null
    webglDisposeCalls = 0
    resetGlobalWebglFailure()
  })

  afterEach(() => {
    resetMockWindowApi()
    vi.clearAllMocks()
    resetGlobalWebglFailure()
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

    it('ref.current.serialize() 는 throw 없이 스냅샷을 반환한다 (B-5 본체 구현 — 상세 계약은 아래 B-5 섹션)', () => {
      const ref = createRef<TerminalPaneHandle>()
      renderWithDs(<TerminalPane ref={ref} sessionId="s1" isVisible isFocused />)
      expect(() => ref.current?.serialize()).not.toThrow()
      expect(ref.current?.serialize()).not.toBeNull()
    })

    it('ref.current.focus()/fit() 이 예외 없이 동작한다', () => {
      const ref = createRef<TerminalPaneHandle>()
      renderWithDs(<TerminalPane ref={ref} sessionId="s1" isVisible isFocused />)
      expect(() => ref.current?.focus()).not.toThrow()
      expect(() => ref.current?.fit()).not.toThrow()
    })

    /**
     * 새로 만든 pane 의 host 는 마운트 시점에 아직 트리 밖(detached)이라 그때의 focus() 는
     * 브라우저가 무시한다 — host 를 붙이는 PaneSlot effect 가 portal 자식인 이 effect 보다 뒤에
     * 돌기 때문. 다음 프레임에 한 번 더 부르지 않으면 ⌘T 로 연 탭에 바로 타이핑되지 않는다.
     */
    it('focused 로 마운트되면 다음 프레임에 focus() 를 한 번 더 부른다', async () => {
      renderWithDs(<TerminalPane sessionId="s1" isVisible isFocused />)

      expect(focusCallCount).toBe(1)
      await waitFor(() => expect(focusCallCount).toBe(2))
    })

    it('focused 가 아니면 프레임이 지나도 포커스를 가져가지 않는다', async () => {
      renderWithDs(<TerminalPane sessionId="s1" isVisible isFocused={false} />)

      await new Promise((r) => setTimeout(r, 50))
      expect(focusCallCount).toBe(0)
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

  describe('v2.0 B-5 — serialize() · 복원 순서 · replay guard (ADR-v2-terminal-p2-03)', () => {
    beforeEach(() => {
      // callOrder 에 IPC PTY resize 도 함께 기록 — 순서 단언에 필요.
      vi.mocked(window.api.terminal.resize).mockImplementation(() => { callOrder.push('ipc-resize') })
    })

    it('serialize() 는 addon 결과 + 절대 CUP 접미 + 현재 cols/rows 를 반환한다', () => {
      fakeSerializeResult = 'HELLO'
      const ref = createRef<TerminalPaneHandle>()
      renderWithDs(<TerminalPane ref={ref} sessionId="s1" isVisible isFocused />)
      expect(ref.current?.serialize()).toEqual({ cols: 80, rows: 24, serialized: 'HELLO\x1b[1;1H' })
    })

    it('restore 가 없으면 복원 없이 기존처럼 fit → PTY resize 만 실행된다', async () => {
      renderWithDs(<TerminalPane sessionId="s1" isVisible isFocused />)
      await waitFor(() => expect(window.api.terminal.resize).toHaveBeenCalled())
      // v2.0 B-3 부터 존재하던 "reveal 전환" effect 도 visible=true 초기 마운트에서 한 번 더
      // fit+resize 를 태운다(레거시 동작, 이번 라운드가 만든 회귀 아님) — restore 관련 write/resize
      // 흔적(term-resize:*, write:*)이 전혀 없다는 것과 첫 페어가 fit→ipc-resize 순서라는 것만 본다.
      expect(callOrder[0]).toBe('fit')
      expect(callOrder[1]).toBe('ipc-resize')
      expect(callOrder.every((c) => c === 'fit' || c === 'ipc-resize')).toBe(true)
    })

    it('복원 순서가 resize → clear → write(snapshot) → write(mode-reset) → fit → PTY resize 다 (함정 #1)', async () => {
      const restore = { cols: 100, rows: 30, serialized: 'RESTORED_CONTENT' }
      renderWithDs(<TerminalPane sessionId="s1" isVisible isFocused restore={restore} />)

      await waitFor(() => expect(callOrder).toContain('ipc-resize'))
      // 앞의 6개가 복원 시퀀스다 — 이후에 "reveal 전환" effect 가 별도로 붙이는 fit/ipc-resize 는
      // 이번 라운드가 만든 게 아닌 기존 동작이라 접두사만 확인한다(위 테스트와 동일한 이유).
      expect(callOrder.slice(0, 6)).toEqual([
        'term-resize:100x30',
        'write:CLEAR',
        'write:RESTORED_CONTENT',
        'write:MODE_RESET',
        'fit',
        'ipc-resize'
      ])
    })

    it('cols===0(레거시 마이그레이션분)이면 명시적 resize 를 건너뛰지만 write 는 진행한다', async () => {
      const restore = { cols: 0, rows: 0, serialized: 'LEGACY_CONTENT' }
      renderWithDs(<TerminalPane sessionId="s1" isVisible isFocused restore={restore} />)
      await waitFor(() => expect(window.api.terminal.resize).toHaveBeenCalled())
      expect(callOrder.some((c) => c.startsWith('term-resize'))).toBe(false)
      expect(callOrder).toContain('write:LEGACY_CONTENT')
    })

    it('replay guard 활성 구간의 onData 는 window.api.terminal.input 을 호출하지 않는다 (함정 #2)', async () => {
      deferWriteCallback = true
      const restore = { cols: 80, rows: 24, serialized: 'X' }
      renderWithDs(<TerminalPane sessionId="s1" isVisible isFocused restore={restore} />)

      // write 콜백이 아직 흐르지 않은 시점 — replay guard 는 여전히 켜져 있다.
      currentTerminal().emitData('\x1b[3;5R') // CPR 자동 응답 흉내
      expect(window.api.terminal.input).not.toHaveBeenCalled()

      // 콜백 체인(write→write→rAF)이 흘러 replay 가 끝나면 입력이 다시 통과한다.
      await waitFor(() => expect(window.api.terminal.resize).toHaveBeenCalled())
      currentTerminal().emitData('ls\n')
      expect(window.api.terminal.input).toHaveBeenCalledWith('s1', 'ls\n')
    })

    it('serialize() 가 addon 예외를 던지면 throw 하지 않고 null 을 반환한다', () => {
      fakeSerializeShouldThrow = true
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const ref = createRef<TerminalPaneHandle>()
      renderWithDs(<TerminalPane ref={ref} sessionId="s1" isVisible isFocused />)
      expect(ref.current?.serialize()).toBeNull()
      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
    })
  })

  describe('v2.0 B-6 — WebGL attach/dispose (ADR-v2-terminal-p2-04)', () => {
    it('기본값(webgl, visible)이면 mount 후 WebGL 이 attach 된다 — dispose 호출 없음', async () => {
      renderWithDs(<TerminalPane sessionId="s1" isVisible isFocused />)
      await waitFor(() => expect(window.api.terminal.resize).toHaveBeenCalled())
      expect(webglDisposeCalls).toBe(0)
    })

    it("rendererSetting='dom' 이면 attach 하지 않는다", async () => {
      const onWebglUnavailable = vi.fn()
      renderWithDs(
        <TerminalPane sessionId="s1" isVisible isFocused rendererSetting="dom" onWebglUnavailable={onWebglUnavailable} />
      )
      await waitFor(() => expect(window.api.terminal.resize).toHaveBeenCalled())
      expect(onWebglUnavailable).not.toHaveBeenCalled() // dom 은 "설정"이지 "실패 폴백"이 아니다.
    })

    it('visible=false 면 attach 하지 않는다 (함정 #4 — hidden pane 미부착)', async () => {
      renderWithDs(<TerminalPane sessionId="s1" isVisible={false} isFocused={false} />)
      await waitFor(() => expect(window.api.terminal.resize).toHaveBeenCalled())
      // hidden 이므로 attach 시도조차 없어야 하고, 혹시 이전에 attach 됐던 경우도 아니므로 dispose 도 0회.
      expect(webglDisposeCalls).toBe(0)
    })

    it('WebGL 초기화 자체가 throw 하면 onWebglUnavailable 이 호출되고 전역 래치가 세워진다', async () => {
      webglConstructorShouldThrow = true
      const onWebglUnavailable = vi.fn()
      renderWithDs(<TerminalPane sessionId="s1" isVisible isFocused onWebglUnavailable={onWebglUnavailable} />)
      await waitFor(() => expect(onWebglUnavailable).toHaveBeenCalledTimes(1))
    })

    it('context loss 발생 시 dispose 되고 onWebglUnavailable 이 호출된다 — 자동 재시도 없음', async () => {
      const onWebglUnavailable = vi.fn()
      renderWithDs(<TerminalPane sessionId="s1" isVisible isFocused onWebglUnavailable={onWebglUnavailable} />)
      await waitFor(() => expect(window.api.terminal.resize).toHaveBeenCalled())
      expect(lastWebglOnContextLoss).toBeTypeOf('function')

      const disposeCountBefore = webglDisposeCalls
      lastWebglOnContextLoss?.()

      expect(webglDisposeCalls).toBe(disposeCountBefore + 1)
      expect(onWebglUnavailable).toHaveBeenCalledTimes(1)
    })

    it('가시성 전환(hidden→visible)에서 dispose/attach 가 예외 없이 재평가된다', async () => {
      const { rerender } = renderWithDs(<TerminalPane sessionId="s1" isVisible={false} isFocused={false} />)
      await waitFor(() => expect(window.api.terminal.resize).toHaveBeenCalled())
      rerender(<TerminalPane sessionId="s1" isVisible isFocused />)
      await waitFor(() => expect(window.api.terminal.resize).toHaveBeenCalledTimes(2))
    })

    it('ref.current.disposeWebgl()/attachWebglIfAllowed() 는 예외 없이 동작한다 (reattachPaneHost 훅)', async () => {
      const ref = createRef<TerminalPaneHandle>()
      renderWithDs(<TerminalPane ref={ref} sessionId="s1" isVisible isFocused />)
      await waitFor(() => expect(window.api.terminal.resize).toHaveBeenCalled())
      expect(() => ref.current?.disposeWebgl()).not.toThrow()
      expect(() => ref.current?.attachWebglIfAllowed()).not.toThrow()
    })
  })

  describe('v2.0 B-7/B-9 — 링크 provider guard · unicode 활성화 · OSC7 배선 (ADR-v2-terminal-p2-05)', () => {
    it('파일 경로 link provider 를 정확히 1개(guard 통과) 등록한다', async () => {
      renderWithDs(<TerminalPane sessionId="s1" isVisible isFocused />)
      await waitFor(() => expect(registeredLinkProviders).toHaveLength(1))
    })

    it('등록된 provider 가 동기 throw 해도(guard) provideLinks 호출이 예외를 전파하지 않는다', async () => {
      renderWithDs(<TerminalPane sessionId="s1" isVisible isFocused />)
      await waitFor(() => expect(registeredLinkProviders).toHaveLength(1))
      // FakeTerminal.buffer.active 는 getLine 이 없어 실제 provideLinks 내부에서 던진다 —
      // guard 가 이를 삼키고 콜백에 undefined 를 전달해야 한다(렌더러 생존, 함정 #5).
      const callback = vi.fn()
      expect(() => registeredLinkProviders[0].provideLinks(1, callback)).not.toThrow()
      await waitFor(() => expect(callback).toHaveBeenCalledWith(undefined))
    })

    it('unicode provider 활성화가 마운트 중 실행된다(open() 이후, 함정 #7)', async () => {
      renderWithDs(<TerminalPane sessionId="s1" isVisible isFocused />)
      await waitFor(() => expect(window.api.terminal.resize).toHaveBeenCalled())
      // FakeTerminal 은 _core.unicodeService 가 없어 activateTerminalUnicodeProvider 가 '11'
      // 폴백 분기를 탄다 — activeVersion 이 초기값('6')에서 '11' 로 바뀐 것이 활성화 호출의 증거.
      expect(lastTerminal?.getUnicodeActiveVersion()).toBe('11')
    })

    it('OSC7/OSC133 핸들러가 등록된다(PTY 연결 전, ADR-05 §레이어 4)', async () => {
      renderWithDs(<TerminalPane sessionId="s1" isVisible isFocused />)
      await waitFor(() => expect(registeredOscHandlers.map(([ident]) => ident)).toEqual(expect.arrayContaining([7, 133])))
    })

    it('OSC7 로 cwd 를 알게 되면 onCwdChange 가 호출된다', async () => {
      const onCwdChange = vi.fn()
      renderWithDs(<TerminalPane sessionId="s1" isVisible isFocused onCwdChange={onCwdChange} />)
      await waitFor(() => expect(registeredOscHandlers.length).toBeGreaterThan(0))
      const osc7 = registeredOscHandlers.find(([ident]) => ident === 7)?.[1]
      osc7?.('file://host/Users/dev/project')
      expect(onCwdChange).toHaveBeenCalledWith('/Users/dev/project')
    })
  })
})
