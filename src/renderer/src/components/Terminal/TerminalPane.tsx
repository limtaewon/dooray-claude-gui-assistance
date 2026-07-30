import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import type { ForwardedRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { SerializeAddon } from '@xterm/addon-serialize'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Image as ImageIcon, ExternalLink } from 'lucide-react'
import { shouldFollowOutput } from './scrollFollow'
import useTerminalSearch from './useTerminalSearch'
import TerminalSearchBar from './TerminalSearchBar'
import Button from '../common/ds/Button'
import { resolvePaneActivation } from './paneActivation'
import { beginPaste, isPasteTargetValid } from './pasteTargetState'
import type { PasteToken } from './pasteTargetState'
import { serializeWithAbsoluteCursor } from './serializeAbsoluteCursor'
import { createReplayGuard, REPLAY_CLEAR, POST_REPLAY_MODE_RESET } from './replay'
import { shouldAttachWebgl, getGlobalWebglFailure, setGlobalWebglFailure } from './webglPolicy'
import { activateTerminalUnicodeProvider } from './terminalUnicodeProvider'
import { installLinkProviderGuard } from './links/terminalLinkProviderGuard'
import { createFilePathLinkProvider } from './links/filePathLinkProvider'
import { createLinkTooltip } from './links/linkTooltip'
import { installTerminalLinkifierClickPriming } from './links/linkClickPriming'
import { installTerminalLinkPtyMouseSuppression } from './links/ptyMouseSuppression'
import { isLinkActivationEvent } from './links/linkActivation'
import { parseOsc7 } from './links/parseOsc7'
import type { CachedPathResolution } from './links/pathExistsCache'
import { windowsPtyOptions } from '@shared/utils/windowsPty'
import { trimSerializedToBytes } from '@shared/utils/textBytes'
import type { TerminalPaneSnapshot } from '@shared/types/terminal'
import '@xterm/xterm/css/xterm.css'

/** v2.0 B-5: serialize() 스냅샷의 leaf 당 UTF-8 바이트 캡 (ADR-v2-terminal-p2-03 §9). */
const PANE_SNAPSHOT_MAX_BYTES = 512 * 1024
/** v2.0 B-5: SerializeAddon 옵션 — TUI 잔해(alt buffer)는 스냅샷에서 배제한다. */
const SERIALIZE_OPTIONS = { scrollback: 2000, excludeAltBuffer: true }

interface TerminalPaneProps {
  sessionId: string
  /**
   * @deprecated isVisible/isFocused 를 쓰세요. 레거시 3호스트(TerminalView/MentionAgentView/
   * BranchWorkspace) 호환용 폴백이며 `resolvePaneActivation` 이 해석한다 (ADR-v2-terminal-p2-01).
   */
  isActive?: boolean
  /** 컨테이너 가시성 — reveal 시 fit + PTY resize, B-6 WebGL attach 게이트. */
  isVisible?: boolean
  /** 포커스 — term.focus() + document paste 리스너(앱 전체 최대 1개) + 포커스 링. */
  isFocused?: boolean
  /** pointerdown/textarea focus 시 호스트에 포커스 이동을 요청한다. pane 은 자기 포커스를 스스로 정하지 않는다. */
  onFocusRequest?: () => void
  /** true 인 호스트(SplitLayout, B-4)만 포커스 링/dim 을 그린다 — 레거시 단일 pane 호스트는 표시하지 않는다. */
  showFocusRing?: boolean
  /** v2.0 B-5: 마운트 시 복원할 스냅샷 — 있으면 ADR-03 §7 의 14단계 순서로 replay 한다. 레거시
   *  `initialOutput` 문자열 복원 경로는 이 prop 으로 완전히 대체됐다(마운트 시 1회만 읽는다). */
  restore?: TerminalPaneSnapshot
  /** v2.0 B-1: PTY 종료 정보 — 있으면 종료 오버레이를 그리고 입력을 차단한다 (ADR-02). */
  exitInfo?: { exitCode: number; signal: number | null } | null
  /** v2.0 B-1: 종료 오버레이의 "닫기" 버튼. 없으면 버튼을 숨긴다. */
  onRequestClose?: () => void
  /** v2.0 B-4: 이 pane 이 속한 탭 id — paste 타겟 4중 검증(tabId+leafId+sessionId+generation)에 쓰인다.
   *  SplitLayout 호스트만 넘긴다 — 레거시 3호스트는 생략하며, 이 경우 paste 검증은 통과로 취급한다. */
  tabId?: string
  /** v2.0 B-4: 이 pane 자신의 leafId. tabId 와 함께 넘겨야 paste 검증이 활성화된다. */
  leafId?: string
  /** v2.0 B-4: 세션 재바인딩 카운터 — B-4 에서는 항상 0, B-5 복원 재바인딩에서 증가한다. */
  paneGeneration?: number
  /** v2.0 B-4: "지금" 유효한 paste 타겟(호스트의 활성 탭+포커스 leaf)을 반환한다 — 호스트가 진실을 쥔다. */
  getCurrentPasteTarget?: () => PasteToken | null
  /** v2.0 B-4: 경계 드래그 중에는 true — ResizeObserver 발 fit/PTY resize 를 억제한다(함정 #9). */
  suspendAutoResize?: boolean
  /** v2.0 B-6: 사용자 설정 렌더러 — 미지정 시 기본값 'webgl' (ADR-v2-terminal-p2-04 §4). */
  rendererSetting?: 'webgl' | 'dom'
  /** v2.0 B-6: WebGL 초기화 실패 또는 context loss 로 DOM 렌더러 폴백이 발생하면 1회 호출된다. */
  onWebglUnavailable?: () => void
  /** v2.0 B-7: OSC7 로 새 cwd 를 알게 될 때마다 호출된다(링크 cwd 우선순위 1순위) — 호스트가
   *  `PaneRuntime.cwd` 를 갱신해 스냅샷 저장에도 반영할 수 있게 한다 (ADR-v2-terminal-p2-05 §레이어 4). */
  onCwdChange?: (cwd: string) => void
}

/** DOM 리페어런트(reattachPaneHost) 전후로 주고받는 xterm 뷰포트 스크롤 위치. */
export interface PaneScrollState {
  viewportY: number
  wasAtBottom: boolean
}

export interface TerminalPaneHandle {
  /** v2.0 B-5: SerializeAddon + 절대 커서 접미 + 512KB 캡. cwd 는 호스트가 안다 — 여기서는 채우지
   *  않는다(TerminalView.collectSnapshot 이 PaneRuntime.cwd 와 병합). 실패 시 null(throw 금지). */
  serialize(): TerminalPaneSnapshot | null
  focus(): void
  /** 컨테이너 크기에 맞춰 refit + PTY resize 1회. */
  fit(): void
  /** v2.0 B-4: DOM 리페어런트 직전 스크롤 위치 캡처 — 버퍼 API 기반이라 reparent 자체엔 영향받지 않는다. */
  captureScrollState(): PaneScrollState | null
  /** v2.0 B-4: 리페어런트 후 스크롤 위치 복원. */
  restoreScrollState(state: PaneScrollState | null): void
  /** v2.0 B-6: WebGL 컨텍스트를 명시적으로 반납한다(addon dispose → loseContext → canvas 0×0). */
  disposeWebgl(): void
  /** v2.0 B-6: 게이트 통과 시에만 attach, 아니면 dispose — reattachPaneHost/가시성 전환이 호출한다. */
  attachWebglIfAllowed(): void
}

function TerminalPaneInner(
  {
    sessionId,
    isActive,
    isVisible,
    isFocused,
    onFocusRequest,
    showFocusRing,
    restore,
    exitInfo,
    onRequestClose,
    tabId,
    leafId,
    paneGeneration,
    getCurrentPasteTarget,
    suspendAutoResize,
    rendererSetting,
    onWebglUnavailable,
    onCwdChange
  }: TerminalPaneProps,
  ref: ForwardedRef<TerminalPaneHandle>
): JSX.Element {
  const { visible, focused } = resolvePaneActivation({ isVisible, isFocused, isActive })
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const serializeAddonRef = useRef<SerializeAddon | null>(null)
  const search = useTerminalSearch({ sessionId, searchAddonRef, terminalRef })
  // B-3: mount effect(1회 생성) 클로저 밖에서 최신 visible/onFocusRequest 를 참조하기 위한 ref.
  const visibleRef = useRef(visible)
  useEffect(() => { visibleRef.current = visible }, [visible])
  const onFocusRequestRef = useRef(onFocusRequest)
  useEffect(() => { onFocusRequestRef.current = onFocusRequest }, [onFocusRequest])
  // TerminalPaneHandle.fit() 이 호출할 refit 함수 — mount effect 안에서 fitAddon 이 만들어질 때 배선된다.
  const fitFnRef = useRef<(() => void) | null>(null)

  // v2.0 B-6: WebGL 게이트 평가 함수 — mount effect 안에서 배선되고, visible/rendererSetting 전환
  // effect 들이 이 ref 를 통해 호출한다(fitFnRef 와 동일 패턴, ADR-04 §1).
  const evaluateWebglRef = useRef<(() => void) | null>(null)
  // TerminalPaneHandle.disposeWebgl() 이 호출할 실제 dispose 함수 — reattachPaneHost 리페어런트용.
  const disposeWebglFnRef = useRef<(() => void) | null>(null)
  // 같은 가시성 구간에서 겪은 context loss 횟수 — reveal/wake 경계에서만 0 으로 리셋(ADR-04 §3).
  const paneLossCountRef = useRef(0)
  // DOM 리페어런트/복원 replay 진행 중 표시 — 이 구간 동안 WebGL 게이트를 보류한다.
  const deferredRef = useRef(Boolean(restore?.serialized))
  const rendererSettingRef = useRef<'webgl' | 'dom'>(rendererSetting ?? 'webgl')
  useEffect(() => { rendererSettingRef.current = rendererSetting ?? 'webgl' }, [rendererSetting])
  const onWebglUnavailableRef = useRef(onWebglUnavailable)
  useEffect(() => { onWebglUnavailableRef.current = onWebglUnavailable }, [onWebglUnavailable])
  useEffect(() => { evaluateWebglRef.current?.() }, [rendererSetting])

  // v2.0 B-7: OSC7 로 알아낸 cwd 를 호스트에 올려보낸다 — mount effect(1회 생성) 클로저가 최신
  // 콜백을 참조하도록 ref 로 동기화한다(onFocusRequestRef 와 동일 패턴).
  const onCwdChangeRef = useRef(onCwdChange)
  useEffect(() => { onCwdChangeRef.current = onCwdChange }, [onCwdChange])

  // v2.0 B-4: 경계 드래그 중엔 ResizeObserver 발 fit/PTY resize 를 억제한다 — 드롭 시 1회만
  // 보내야 TUI 가 프레임마다 재그리기하지 않는다(함정 #9, ADR-02 §6).
  const suspendAutoResizeRef = useRef(suspendAutoResize)
  useEffect(() => { suspendAutoResizeRef.current = suspendAutoResize }, [suspendAutoResize])

  // v2.0 B-4: paste 타겟 4중 재검증(ADR-02 §9) — tabId/leafId 가 없는 레거시 호스트에서는
  // 토큰이 null 이 되어 검증을 건너뛴다(현행 동작 그대로).
  const getCurrentPasteTargetRef = useRef(getCurrentPasteTarget)
  useEffect(() => { getCurrentPasteTargetRef.current = getCurrentPasteTarget }, [getCurrentPasteTarget])
  const capturePasteToken = useCallback((): PasteToken | null => {
    if (tabId === undefined || leafId === undefined) return null
    return beginPaste({ tabId, leafId, sessionId, generation: paneGeneration ?? 0 })
  }, [tabId, leafId, sessionId, paneGeneration])
  const validatePasteToken = useCallback((token: PasteToken | null): boolean => {
    if (!token) return true // 레거시 호스트 — 게이팅하지 않는다.
    const current = getCurrentPasteTargetRef.current?.() ?? null
    const ok = isPasteTargetValid(token, current)
    if (!ok) console.warn('[terminal-paste] 타겟 변경으로 폐기', { token, current })
    return ok
  }, [])
  // mount effect(키 핸들러)는 한 번만 만들어지는 클로저다 — capturePasteToken/validatePasteToken 이
  // 최신 상태를 유지하도록 ref 로 감싼다 (onFocusRequestRef 와 동일 패턴).
  const capturePasteTokenRef = useRef(capturePasteToken)
  useEffect(() => { capturePasteTokenRef.current = capturePasteToken }, [capturePasteToken])
  const validatePasteTokenRef = useRef(validatePasteToken)
  useEffect(() => { validatePasteTokenRef.current = validatePasteToken }, [validatePasteToken])

  // mount effect(onData/attachCustomKeyEventHandler) 클로저는 한 번만 만들어지므로 prop 을 직접
  // 읽으면 stale 해진다 — ref 로 최신 값을 동기화해서 입력 차단 판정에 쓴다 (ADR-02 §결정 4).
  const exitInfoRef = useRef<{ exitCode: number; signal: number | null } | null>(exitInfo ?? null)
  useEffect(() => {
    exitInfoRef.current = exitInfo ?? null
  }, [exitInfo])

  // #2 PTY 출력에서 잡힌 이미지 path 들 — 최근 N개. 클릭 시 OS open.
  const [recentImages, setRecentImages] = useState<Array<{ path: string; seenAt: number }>>([])
  const [imageSidebarOpen, setImageSidebarOpen] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return

    // v2.0 windows-fix ADR-v2-windows-fix-03 §4: 신형 ConPTY(빌드 21376+)에서만 reflow-off
    // 휴리스틱을 켠다. preload 의 정적 노출값(api.system)을 쓰고, 없으면 navigator.platform
    // 기반으로 최소 폴백한다 — 두 경우 다 osRelease 가 없으면 windowsPtyOptions 가 undefined 를
    // 돌려주므로 현행 동작(옵션 미지정)이 그대로 유지된다.
    const platformFallback = navigator.platform.toUpperCase().includes('WIN') ? 'win32' : navigator.platform
    const windowsPty = windowsPtyOptions(
      window.api?.system?.platform ?? platformFallback,
      window.api?.system?.osRelease
    )

    // v2.0 B-5 복원 순서 1단계(ADR-v2-terminal-p2-03 §7): 스냅샷 치수가 있으면 처음부터 그 크기로
    // 연다 — resize 를 기다리지 않아도 8단계의 명시적 resize 와 함께 이중으로 보장된다. cols/rows
    // 가 0(레거시 마이그레이션분, main 이 모르는 값)이면 옵션 자체를 넣지 않는다.
    const hasRestoreSnapshot = Boolean(restore?.serialized)
    const restoreDims = restore && restore.cols > 0 && restore.rows > 0
      ? { cols: restore.cols, rows: restore.rows }
      : null

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
      // CJK(한·중·일) 폰트 fallback. JetBrains Mono 에 한글 글리프가 없어 시스템 폰트로 떨어지면
      // 셀 폭이 어긋나 "테 스 트" 처럼 보이는 이슈 → 모노스페이스 한글 폰트를 우선 명시.
      fontFamily: 'JetBrains Mono, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans Mono CJK KR", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 10000,
      allowProposedApi: true,
      // v2.0 B-2: 이 값이 없으면 xterm 이 overview ruler(우측 매치 마커 스트립) 자체를 렌더하지 않는다.
      overviewRulerWidth: 14,
      ...(restoreDims ? restoreDims : {}),
      ...(windowsPty ? { windowsPty } : {})
    })

    // 2) registerLinkProvider guard monkey-patch — 반드시 loadAddon 보다 먼저다. 순서가 틀리면
    // web-links 등 addon 내부 provider 는 patch 되지 않은 원본을 잡아간다(ADR-05 §레이어 0, 함정 #5).
    installLinkProviderGuard(terminal)

    // 3) addon 로드 — fit/search/serialize 는 항상 로드, unicode11 은 환경에 따라 unsupported 일 수 있다.
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    const searchAddon = new SearchAddon()
    terminal.loadAddon(searchAddon)
    const serializeAddon = new SerializeAddon()
    terminal.loadAddon(serializeAddon)
    // East Asian Wide(한글/중국어/일본어) 셀 폭 계산에 필요한 기반 provider — 활성화(activeVersion
    // 전환)는 4)open() 뒤 5)단계에서 한다(함정 #7, ADR-03 §7). 여기서는 addon 만 불러온다.
    try {
      terminal.loadAddon(new Unicode11Addon())
    } catch { /* ok — 환경에 따라 unsupported */ }
    // 4) DOM attach
    try {
      terminal.open(containerRef.current)
    } catch {}
    // 5) unicode provider 활성화 — 모든 write 보다 먼저 해야 한다(함정 #7, ADR-03 §7 5단계). Unicode11
    // 위에 ZWJ 이모지 폭 보정을 얹는다 — terminalUnicodeProvider.ts, B-9.
    try {
      activateTerminalUnicodeProvider(terminal)
    } catch { /* ok — 환경에 따라 unsupported */ }

    // B-3: onFocusRequest → 호스트가 focusedLeafId 를 갱신 (pane 은 자기 포커스를 스스로 정하지 않는다).
    // pointerdown 캡처(컨테이너, JSX)뿐 아니라 xterm textarea 자체의 focus 도 알려야
    // 마우스로 클릭한 뒤 xterm 이 textarea.focus() 를 호출하는 경로도 놓치지 않는다.
    const paneTextarea = terminal.textarea
    const handleTextareaFocus = (): void => { onFocusRequestRef.current?.() }
    paneTextarea?.addEventListener('focus', handleTextareaFocus)

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    searchAddonRef.current = searchAddon
    serializeAddonRef.current = serializeAddon
    // 검색 결과 카운트를 useTerminalSearch 훅으로 전달 — decoration 이 켜져 있을 때만 발화한다.
    const searchResultsDisposable = searchAddon.onDidChangeResults((e) => search.handleResultsChanged(e))

    // v2.0 B-5: replay guard — 7)/12) 단계에서 on/off. 아래 onData 가 이 값을 읽어 replay 중 xterm 의
    // 자동 쿼리 응답(DA1/CPR 등)이 PTY 로 새는 것을 막는다(함정 #2).
    const replayGuard = createReplayGuard()

    // v2.0 B-6: WebGL 런타임 — attach/dispose 는 실제 DOM 조작을 담당하고, evaluateWebgl 이 게이트를
    // 재평가해 둘 중 하나를 호출한다(ADR-04 §1/§2). 초기 평가는 mount fit 완료 이후(finishMount) 다.
    let webglAddon: WebglAddon | null = null
    const disposeWebglNow = (): void => {
      if (!webglAddon) return
      const addon = webglAddon
      webglAddon = null
      try { addon.dispose() } catch { /* ok */ }
      // Windows/ANGLE 은 addon.dispose() 만으로 드라이버 컨텍스트를 반납하지 않는다(#6874) —
      // loseContext 를 명시 호출하고 캔버스를 0×0 으로 만들어 예산을 확실히 돌려준다.
      const canvases = containerRef.current?.querySelectorAll('canvas') ?? []
      canvases.forEach((canvas) => {
        try {
          const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null
          gl?.getExtension('WEBGL_lose_context')?.loseContext()
        } catch { /* ok */ }
        canvas.width = 0
        canvas.height = 0
      })
    }
    const attachWebglNow = (): void => {
      if (webglAddon) return
      try {
        const addon = new WebglAddon()
        addon.onContextLoss(() => {
          console.warn('[TerminalPane] WebGL context loss — DOM 렌더러로 폴백')
          disposeWebglNow()
          paneLossCountRef.current += 1
          onWebglUnavailableRef.current?.()
        })
        terminal.loadAddon(addon)
        webglAddon = addon
      } catch (e) {
        // 초기화 자체가 throw — 모듈 전역 래치를 세워 앱 수명 동안 재시도하지 않는다(ADR-04 §3).
        console.warn('[TerminalPane] WebGL 초기화 실패 — DOM 렌더러로 폴백', e)
        setGlobalWebglFailure()
        onWebglUnavailableRef.current?.()
      }
    }
    const evaluateWebgl = (): void => {
      const allowed = shouldAttachWebgl({
        setting: rendererSettingRef.current,
        isVisible: visibleRef.current,
        globalFailureLatch: getGlobalWebglFailure(),
        paneLossCount: paneLossCountRef.current,
        deferred: deferredRef.current
      })
      if (allowed) attachWebglNow()
      else disposeWebglNow()
    }
    evaluateWebglRef.current = evaluateWebgl
    disposeWebglFnRef.current = disposeWebglNow

    // v2.0 B-7: OSC7(cwd 보고) 을 PTY 연결(onOutput 구독) 전에 등록한다 — replay 가 첫 OSC7 을
    // 놓치지 않게 하기 위해서다(ADR-05 §레이어 4). 링크 cwd 우선순위 1순위. rc 주입은 하지 않는다
    // (사용자 셸이 이미 OSC7 을 쏘는 설정이면 그대로 수신만 한다).
    let paneCwd: string | undefined
    try {
      terminal.parser.registerOscHandler(7, (data) => {
        const cwd = parseOsc7(data)
        if (cwd) {
          paneCwd = cwd
          onCwdChangeRef.current?.(cwd)
        }
        return true
      })
      // OSC133(프롬프트 마킹) — 활용은 백로그, 여기서는 화면 오염 방지만(미처리 시퀀스가 화면에
      // 그대로 찍히는 것을 막는다).
      terminal.parser.registerOscHandler(133, () => true)
    } catch { /* ok — allowProposedApi 미지원 환경 폴백 */ }

    // v2.0 B-5: replay 중 도착한 라이브 출력은 큐에 적재했다가 replay 종료 후 flush 한다(6/14단계).
    // PTY 는 이미 살아 있어 셸 프롬프트를 뱉으므로, 그대로 write 하면 복원 내용과 뒤섞인다.
    let restoring = hasRestoreSnapshot
    const outputQueue: string[] = []

    // #2 PTY 출력에서 이미지 path 감지. 절대경로 (~/ 또는 / 또는 C:\) + 이미지 확장자.
    // ANSI escape 시퀀스가 섞여 있을 수 있어 정규식이 그 사이에서 잘 매칭되도록 lookbehind 회피.
    const IMAGE_PATH_RE = /((?:~|\/|\b[A-Za-z]:[\\/])[^\s"'`<>(){}[\]]*?\.(?:png|jpe?g|gif|webp|bmp|svg))/gi
    const seenPaths = new Set<string>()
    const sniffImages = (data: string): void => {
      IMAGE_PATH_RE.lastIndex = 0
      let m: RegExpExecArray | null
      const newOnes: string[] = []
      while ((m = IMAGE_PATH_RE.exec(data)) !== null) {
        const p = m[1]
        if (seenPaths.has(p)) continue
        seenPaths.add(p)
        newOnes.push(p)
      }
      if (newOnes.length > 0) {
        const now = Date.now()
        setRecentImages((prev) => {
          const merged = [...newOnes.map((path) => ({ path, seenAt: now })), ...prev]
          return merged.slice(0, 20)
        })
      }
    }
    // auto-follow: 사용자가 바닥에 있을 때만 새 출력을 따라 내려간다. 위로 올려 읽는 중이면 유지.
    // wasAtBottom 은 반드시 write() 이전에 스냅샷한다 — write 후엔 baseY 가 늘어 판단이 망가진다.
    const writeLiveOutput = (data: string): void => {
      const buf = terminal.buffer.active
      const wasAtBottom = shouldFollowOutput(buf.viewportY, buf.baseY)
      terminal.write(data, () => { if (wasAtBottom) terminal.scrollToBottom() })
      sniffImages(data)
    }

    // 6) onOutput 구독 시작 — replay 중 도착분은 큐잉.
    const cleanup = window.api.terminal.onOutput(({ id, data }) => {
      if (id !== sessionId) return
      if (restoring) { outputQueue.push(data); return }
      writeLiveOutput(data)
    })

    // #6 터미널 링크 — Cmd/Ctrl + 클릭으로 OS 핸들러 호출 (ADR-v2-terminal-p2-05).
    //   레이어 1) URL — @xterm/addon-web-links 전용(자체 provider 는 URL 패턴을 다루지 않는다).
    //   레이어 2~5) 파일 경로 — filePathLinkProvider.ts 가 조립(정규식/wrap 재구성/존재 검증/캐시).
    // 두 provider 모두 위 2)단계에서 patch 된 registerLinkProvider 를 통하므로 동기 throw 로부터
    // 보호된다(레이어 0). CJK wide-char 셀 폭 보정은 xterm 이 실제로 배치한 셀을 읽는 wrappedLinkRanges
    // 의 셀 매핑으로 대체됐다 — 기존 isWideCodePoint/stringIndexToCell 하드코딩 표는 삭제.
    try {
      const webLinksAddon = new WebLinksAddon((event, uri) => {
        if (!isLinkActivationEvent(event)) return
        window.api.shell.openPath(uri).catch((err) => console.warn('[term-link] URL open 실패', err))
      })
      terminal.loadAddon(webLinksAddon)

      const linkTooltip = createLinkTooltip(terminal.element ?? containerRef.current!)
      const pathLinkCache = new Map<string, CachedPathResolution>()
      const filePathLinkProvider = createFilePathLinkProvider(terminal, {
        sessionId,
        getCwdHint: () => paneCwd,
        cache: pathLinkCache,
        resolvePath: (req) => window.api.terminal.resolvePath(req),
        openPath: (absolutePath) => {
          window.api.shell.openPath(absolutePath).catch((err) => console.warn('[term-link] open 실패', err))
        },
        tooltip: linkTooltip
      })
      terminal.registerLinkProvider(filePathLinkProvider)
    } catch (e) {
      console.warn('[TerminalPane] linkProvider 등록 실패:', e)
    }

    // Cmd+클릭 3버그 모듈 — ①정지 커서 밑 새 링크 첫 클릭 씹힘 ②마우스 aware TUI(vim 등) 이중 열림.
    // ③drag 선택 폭주 방지(clearSelection)는 filePathLinkProvider 의 activate 안에서 처리한다.
    const linkClickPrimingDisposable = installTerminalLinkifierClickPriming(terminal)
    const ptyMouseSuppressionDisposable = installTerminalLinkPtyMouseSuppression(
      terminal,
      () => terminal.modes.mouseTrackingMode !== 'none'
    )

    // 텍스트 편집기 스타일 키바인딩 (cross-platform).
    // xterm 은 키를 그대로 PTY 로 보내는데, Cmd/Option/Win 같은 modifier 는 별도 매핑이 없으면 무시된다.
    // bash/zsh readline · Claude Code TUI · vim 등 어디서든 자연스럽게 편집되도록 변환.
    //  - macOS:  Cmd ←/→/⌫/⌦  ·  Option ←/→/⌫/⌦
    //  - Win/Linux:  Home/End/Ctrl+Backspace/Ctrl+Delete/Ctrl+←→ — 이미 PTY 가 받지만 Ctrl+Backspace
    //    같은 일부는 기본적으로 \x7f 만 보내므로 word-delete 로 보강.
    const isMac = navigator.platform.toUpperCase().includes('MAC')
    // v2.0 B-1: 세션이 종료된 pane 은 제어문자 송신도 막는다 (입력 차단 경로 ①) — ADR-02.
    const send = (s: string): void => {
      if (exitInfoRef.current) return
      try { window.api.terminal.input(sessionId, s) } catch { /* ok */ }
    }
    terminal.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      // IME(한글/일본어/중국어) 조합 중에는 어떤 단축키도 가로채지 않는다.
      // Why: 합성 중인 글자(예: "세")가 아직 commit 되지 않은 상태에서 Shift+Enter
      // 같은 커스텀 시퀀스를 PTY 로 먼저 보내면, xterm IME overlay 와 PTY 커서 위치가
      // 어긋나 합성 박스가 본문과 분리되어 떠 보이는 desync 가 발생.
      if (e.isComposing || e.keyCode === 229) return true
      const meta = e.metaKey
      const alt = e.altKey
      const shift = e.shiftKey
      const ctrl = e.ctrlKey
      const k = e.key

      // 검색바 — Cmd+F (mac) / Ctrl+F (Win/Linux)
      if ((meta || ctrl) && !alt && (k === 'f' || k === 'F')) {
        e.preventDefault()
        search.openSearch()
        return false
      }

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
              // 클립보드 → PTY 로 paste. 이미지면 디스크 저장 후 path 입력, 텍스트면 기존 동작.
              // v2.0 B-4: await 전 토큰 발급 → await 후 검증 — 도중에 포커스/탭이 바뀌면 폐기(ADR-02 §9).
              e.preventDefault()
              const pasteToken = capturePasteTokenRef.current()
              ;(async () => {
                try {
                  if (navigator.clipboard.read) {
                    const items = await navigator.clipboard.read()
                    for (const it of items) {
                      const imgType = it.types.find((t) => t.startsWith('image/'))
                      if (imgType) {
                        const blob = await it.getType(imgType)
                        const ext = imgType.split('/')[1] || 'png'
                        const file = new File([blob], `clipboard-${Date.now()}.${ext}`, { type: imgType })
                        if (!validatePasteTokenRef.current(pasteToken)) return
                        await sendFileAsPath(file)
                        return
                      }
                    }
                  }
                  const text = await navigator.clipboard.readText()
                  if (text && validatePasteTokenRef.current(pasteToken)) send(text)
                } catch {
                  // read() 거부 시 텍스트만 fallback
                  navigator.clipboard.readText()
                    .then((t) => { if (t && validatePasteTokenRef.current(pasteToken)) send(t) })
                    .catch(() => { /* ok */ })
                }
              })()
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

        // Ctrl+Shift+C — 선택 영역 복사 (Windows 터미널 표준).
        // 일반 Ctrl+C 는 PTY 에 SIGINT (\x03) 가 가야 해서 hijack 금지 — shift 필수.
        if (ctrl && shift && !alt && (k === 'c' || k === 'C')) {
          e.preventDefault()
          const sel = terminal.getSelection()
          if (sel) navigator.clipboard.writeText(sel).catch(() => { /* ok */ })
          return false
        }
        // Ctrl+Shift+V — 클립보드 → PTY paste (텍스트/이미지). v2.0 B-4: paste 타겟 4중 재검증.
        if (ctrl && shift && !alt && (k === 'v' || k === 'V')) {
          e.preventDefault()
          const pasteToken = capturePasteTokenRef.current()
          ;(async () => {
            try {
              if (navigator.clipboard.read) {
                const items = await navigator.clipboard.read()
                for (const it of items) {
                  const imgType = it.types.find((t) => t.startsWith('image/'))
                  if (imgType) {
                    const blob = await it.getType(imgType)
                    const ext = imgType.split('/')[1] || 'png'
                    const file = new File([blob], `clipboard-${Date.now()}.${ext}`, { type: imgType })
                    if (!validatePasteTokenRef.current(pasteToken)) return
                    await sendFileAsPath(file)
                    return
                  }
                }
              }
              const text = await navigator.clipboard.readText()
              if (text && validatePasteTokenRef.current(pasteToken)) send(text)
            } catch {
              navigator.clipboard.readText()
                .then((t) => { if (t && validatePasteTokenRef.current(pasteToken)) send(t) })
                .catch(() => { /* ok */ })
            }
          })()
          return false
        }
        // Ctrl+Insert — 복사 (Windows 레거시 표준)
        if (ctrl && !alt && !shift && k === 'Insert') {
          e.preventDefault()
          const sel = terminal.getSelection()
          if (sel) navigator.clipboard.writeText(sel).catch(() => { /* ok */ })
          return false
        }
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
      // v2.0 B-5: replay 중 xterm 의 자동 쿼리 응답(DA1/CPR 등)이 PTY 로 새는 것을 막는다(함정 #2).
      if (replayGuard.active) return
      // v2.0 B-1: 입력 차단 경로 ② — 타이핑/붙여넣기로 xterm 이 만든 data 는 여기로 모인다.
      if (exitInfoRef.current) return
      window.api.terminal.input(sessionId, data)
    })

    // fit() 전후로 스크롤 위치를 보존한다.
    // Why: fitAddon.fit() 은 내부적으로 terminal.resize(cols, rows) 를 호출하는데,
    // xterm 의 resize() 는 viewportY 를 재계산하면서 스크롤 위치를 bottom 으로 강제하지 않는다.
    // 실제로는 buffer 재배치 결과에 따라 뷰포트가 예기치 않게 top 쪽으로 튀는 케이스가 있다.
    // 사용자가 이미 bottom 에 있었다면 fit 후에도 bottom 을 유지해야 한다.
    // (스크롤을 직접 올려서 과거 출력을 보던 중이라면 그 위치를 유지한다.)
    const safeResize = (fa: FitAddon): void => {
      try {
        const term = terminalRef.current
        // fit() 호출 직전에 "사용자가 bottom 에 있었는가" 확인
        // viewportY === 0 이고 baseY > 0 이면 스크롤을 올린 상태. viewportY === baseY 이면 bottom.
        const wasAtBottom = term
          ? term.buffer.active.viewportY >= term.buffer.active.baseY
          : true
        fa.fit()
        const dims = fa.proposeDimensions()
        // cols/rows가 양수일 때만 전송 (컨테이너 크기가 0이면 node-pty가 에러)
        if (dims && dims.cols > 0 && dims.rows > 0) {
          window.api.terminal.resize({ id: sessionId, cols: dims.cols, rows: dims.rows })
        }
        // fit() 이 viewport 를 흔들었을 때 bottom 을 복원.
        if (wasAtBottom && term) term.scrollToBottom()
      } catch {}
    }
    // TerminalPaneHandle.fit() 배선 — B-5 가 복원 순서(§7 13단계)에서, B-4 가 리페어런트에서 호출한다.
    fitFnRef.current = () => safeResize(fitAddon)

    // v2.0 B-5: 마운트 fit/복원 완료 처리 — 13)fit→PTY resize, 14)큐 flush. 비복원 마운트에서도
    // 동일 경로를 태워 fit 타이밍을 하나로 통일한다.
    const finishMount = (): void => {
      deferredRef.current = false
      safeResize(fitAddon)
      restoring = false
      if (outputQueue.length > 0) {
        for (const chunk of outputQueue.splice(0)) writeLiveOutput(chunk)
      }
      evaluateWebgl()
    }

    // 언마운트 이후(테스트 간 격리, 빠른 탭 전환 등) 지연 예약된 rAF 가 stale 클로저로 fit/PTY
    // resize 를 쏘지 않도록 핸들을 들고 있다가 cleanup 에서 취소한다.
    let mountRafId: number | null = null
    if (hasRestoreSnapshot && restore) {
      // 7) replay guard on — 아래 write 들이 끝날 때까지 onData 를 통한 PTY 송신을 막는다.
      replayGuard.on()
      // 8) resize — fit 보다 먼저(함정 #1). cols===0(레거시 마이그레이션분)이면 스킵.
      if (restore.cols > 0 && restore.rows > 0) {
        try { terminal.resize(restore.cols, restore.rows) } catch { /* ok */ }
      }
      // 9) 클리어
      terminal.write(REPLAY_CLEAR)
      // 10) 스냅샷 write — 파싱 완료를 콜백으로 대기
      terminal.write(restore.serialized, () => {
        // 11) 모드 리셋 + PROMPT_EOL_MARK(zsh `%`) 방지
        terminal.write(POST_REPLAY_MODE_RESET + '\r\n', () => {
          // 12) replay guard off
          replayGuard.off()
          mountRafId = requestAnimationFrame(() => { mountRafId = null; finishMount() })
        })
      })
    } else {
      // 1)~4) 는 이미 위에서 끝났다 — 비복원 마운트는 레이아웃 완료를 한 프레임 기다린 뒤 fit.
      // Why: open() 직후엔 xterm 이 기본 80x24 grid 로 동작하므로, 컨테이너 레이아웃이
      // 자리잡기 전에 fit() 하면 잘못된 크기로 계산된다.
      mountRafId = requestAnimationFrame(() => { mountRafId = null; finishMount() })
    }

    // ResizeObserver 를 디바운스해서 연속된 레이아웃 변경(이미지 사이드바 토글 등)에
    // fit() 이 여러 번 중복 호출되지 않도록 한다.
    // Why: 이미지 사이드바 show/hide 때 padding 변경 → containerRef 크기 변경 → ResizeObserver
    // 가 수십 ms 안에 여러 번 발화할 수 있다. 매 발화마다 fit() 을 하면 그때마다 viewport 가
    // 흔들리고 scrollToBottom 보정도 경쟁 상태에 빠진다. 디바운스로 마지막 한 번만 처리.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const debouncedSafeResize = (): void => {
      if (resizeTimer !== null) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => { resizeTimer = null; safeResize(fitAddon) }, 40)
    }

    const resizeObserver = new ResizeObserver(() => {
      // v2.0 B-3: 숨김 컨테이너의 0×0 fit 이 PTY 를 1×1 로 만드는 사고 방지 (ADR-01 §5).
      if (!visibleRef.current) return
      // v2.0 B-4: 경계 드래그 중엔 억제 — 드롭 시 SplitLayout 이 명시적으로 fit() 을 1회 호출한다.
      if (suspendAutoResizeRef.current) return
      debouncedSafeResize()
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      cleanup()
      searchResultsDisposable.dispose()
      linkClickPrimingDisposable.dispose()
      ptyMouseSuppressionDisposable.dispose()
      resizeObserver.disconnect()
      if (resizeTimer !== null) clearTimeout(resizeTimer)
      if (mountRafId !== null) cancelAnimationFrame(mountRafId)
      paneTextarea?.removeEventListener('focus', handleTextareaFocus)
      disposeWebglNow()
      terminal.dispose()
    }
  }, [sessionId])

  // v2.0 B-6: 가시성 전환마다 WebGL 게이트를 재평가한다 — reveal(→true) 시 이 가시성 구간의
  // context loss 카운트를 리셋한다(ADR-04 §3, "같은 가시성 구간에서는 재시도하지 않는다"의 경계).
  useEffect(() => {
    if (visible) paneLossCountRef.current = 0
    evaluateWebglRef.current?.()
  }, [visible])

  // v2.0 B-3: fit + PTY resize 는 visible 전환에서만 (ADR-01 §2/§5) — focus() 는 아래 별도 effect.
  // v2.0 B-5: rAF 핸들을 취소 가능하게 들고 있는다 — 언마운트/재마운트가 빠르게 이어지는
  // 테스트·복원 경로에서 stale 클로저가 disposed 된 fitAddon 을 건드리지 않도록 한다.
  useEffect(() => {
    if (!visible || !fitAddonRef.current) return
    let innerRafId: number | null = null
    const outerRafId = requestAnimationFrame(() => {
      innerRafId = requestAnimationFrame(() => {
        innerRafId = null
        const fa = fitAddonRef.current
        const term = terminalRef.current
        if (!fa) return
        try {
          // reveal 후 fit 해도 bottom 을 유지한다.
          // Why: visible=true 로 바뀌면서 컨테이너가 나타나고 fitAddon 이 새 크기로
          // resize() 를 호출하는데, 이때도 viewport 가 top 으로 튈 수 있다.
          const wasAtBottom = term
            ? term.buffer.active.viewportY >= term.buffer.active.baseY
            : true
          fa.fit()
          const dims = fa.proposeDimensions()
          if (dims && dims.cols > 0 && dims.rows > 0) {
            window.api.terminal.resize({ id: sessionId, cols: dims.cols, rows: dims.rows })
          }
          if (wasAtBottom && term) term.scrollToBottom()
        } catch {}
      })
    })
    return () => {
      cancelAnimationFrame(outerRafId)
      if (innerRafId !== null) cancelAnimationFrame(innerRafId)
    }
  }, [visible, sessionId])

  // v2.0 B-3: term.focus() 는 focused 전환에서만 — split 에서 "보이지만 포커스는 아닌 pane" 의
  // 포커스를 fit 타이밍에 뺏지 않기 위해 가시성 effect 와 분리했다 (ADR-01 §2/§5).
  useEffect(() => {
    if (focused) terminalRef.current?.focus()
  }, [focused])

  // v2.0 B-6: 윈도우 wake(document.visibilitychange → visible) 도 reveal 과 같은 리셋 경계다
  // (ADR-04 §3) — 이 pane 이 지금 보이는 상태일 때만 반응한다.
  useEffect(() => {
    const onDocVisibility = (): void => {
      if (document.visibilityState !== 'visible') return
      if (!visibleRef.current) return
      paneLossCountRef.current = 0
      evaluateWebglRef.current?.()
    }
    document.addEventListener('visibilitychange', onDocVisibility)
    return () => document.removeEventListener('visibilitychange', onDocVisibility)
  }, [])

  // 이미지/파일 → PTY 에 path 입력. drag-drop / clipboard paste 공용 (#2 후속 / 사용자 요청).
  // Claude Code TUI 가 이미지 path 를 알아채면 read 도구로 자동 첨부.
  // v2.0 B-1: 입력 차단 경로 ③ — 파일 드롭·이미지 paste 모두 이 함수를 거친다.
  const sendFileAsPath = useCallback(async (file: File): Promise<void> => {
    if (exitInfoRef.current) return
    try {
      const fileWithPath = file as File & { path?: string }
      let path = typeof fileWithPath.path === 'string' && fileWithPath.path ? fileWithPath.path : ''
      if (!path) {
        const buf = await file.arrayBuffer()
        path = await window.api.claude.saveAttachment(file.name || `clipboard-${Date.now()}.png`, buf)
      }
      // 공백/특수문자 포함 path 는 single-quote 로 감싸 PTY 가 그대로 받게.
      const quoted = /[\s"'`$]/.test(path) ? `'${path.replace(/'/g, "'\\''")}'` : path
      window.api.terminal.input(sessionId, quoted + ' ')
    } catch (e) {
      console.warn('[TerminalPane] sendFileAsPath 실패:', e)
    }
  }, [sessionId])

  // 클립보드 paste — 이미지 데이터 만 가로채고 그 외는 xterm 의 기본 paste (텍스트) 에 위임.
  // v2.0 B-3: document 레벨 리스너라 focused 인 pane 에서만 등록한다 — 앱 전체 최대 1개
  // (ADR-01 §2). split 이 들어와도 이 게이트 덕분에 이미지 붙여넣기 1회가 N개 PTY 로 새지 않는다.
  useEffect(() => {
    if (!focused) return
    // v2.0 B-4: document 리스너 등록 시점에 토큰을 발급 — await 이후 검증한다(ADR-02 §9).
    const pasteToken = capturePasteToken()
    const onPaste = (ev: Event): void => {
      const e = ev as ClipboardEvent
      const items = e.clipboardData?.items
      if (!items) return
      const imageItems = Array.from(items).filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
      if (imageItems.length === 0) return
      e.preventDefault()
      void Promise.all(imageItems.map(async (it) => {
        const f = it.getAsFile()
        if (f && validatePasteToken(pasteToken)) await sendFileAsPath(f)
      }))
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [focused, sendFileAsPath, capturePasteToken, validatePasteToken])

  // forwardRef handle — B-4 는 호스트가 focus()/fit() 을 명령형으로 부를 때, B-5 는 serialize()
  // 로 스냅샷을 당길 때, B-6 은 리페어런트 전후 WebGL dispose/attach 를 명령형으로 부를 때 쓴다.
  useImperativeHandle(ref, () => ({
    serialize: () => {
      const term = terminalRef.current
      const addon = serializeAddonRef.current
      if (!term || !addon) return null
      try {
        const raw = serializeWithAbsoluteCursor(term, addon, SERIALIZE_OPTIONS)
        return {
          cols: term.cols,
          rows: term.rows,
          serialized: trimSerializedToBytes(raw, PANE_SNAPSHOT_MAX_BYTES)
        }
      } catch (e) {
        console.warn('[TerminalPane] serialize 실패', e)
        return null
      }
    },
    focus: () => { terminalRef.current?.focus() },
    fit: () => { fitFnRef.current?.() },
    captureScrollState: () => {
      const term = terminalRef.current
      if (!term) return null
      const buf = term.buffer.active
      return { viewportY: buf.viewportY, wasAtBottom: buf.viewportY >= buf.baseY }
    },
    restoreScrollState: (state) => {
      const term = terminalRef.current
      if (!term || !state) return
      try {
        if (state.wasAtBottom) term.scrollToBottom()
        else term.scrollToLine(state.viewportY)
      } catch { /* ok */ }
    },
    disposeWebgl: () => {
      deferredRef.current = true
      disposeWebglFnRef.current?.()
    },
    attachWebglIfAllowed: () => {
      deferredRef.current = false
      evaluateWebglRef.current?.()
    }
  }), [])

  return (
    <div
      className={`absolute inset-0 ${visible ? 'z-10' : 'z-0 pointer-events-none invisible'} ${
        showFocusRing && focused ? 'border-[1.5px] border-clauday-blue rounded-sm' : ''
      }`}
      onPointerDownCapture={() => onFocusRequest?.()}
      onDragOver={(e) => {
        // v2.0 B-1: 파일 드롭도 입력 차단 대상 (경로 ③, sendFileAsPath 로 귀결).
        if (exitInfoRef.current) return
        if (!e.dataTransfer?.types?.includes('Files')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={async (e) => {
        if (exitInfoRef.current) return
        const files = Array.from(e.dataTransfer?.files || [])
        if (files.length === 0) return
        e.preventDefault()
        for (const f of files) await sendFileAsPath(f)
      }}
    >
      {/* terminal 컨테이너 — 사이드 패널 열린 만큼 right padding 줘서 안 가리게. showFocusRing
          호스트(SplitLayout, B-4)에서만 비포커스 pane 출력을 dim 한다 (목업 .pane.dimmed .tout). */}
      <div ref={containerRef}
        className={`absolute inset-0 ${showFocusRing && !focused ? 'opacity-70' : ''}`}
        style={{ padding: '4px 8px', paddingRight: imageSidebarOpen ? 'calc(8px + 220px)' : 8 }} />

      {/* #2 이미지 사이드 패널 토글 — 우측 가장자리 작은 탭 */}
      <button
        onClick={() => setImageSidebarOpen((o) => !o)}
        className="absolute z-20 flex items-center gap-1 px-2 py-1 rounded-l-md shadow-md text-[calc(11px_*_var(--app-font-scale,1))] font-medium"
        style={{
          top: 10,
          right: imageSidebarOpen ? 220 : 0,
          background: 'var(--bg-surface-raised)',
          border: '1px solid var(--bg-border)',
          color: 'var(--text-secondary)'
        }}
        title={imageSidebarOpen ? '이미지 패널 닫기' : `최근 이미지 ${recentImages.length}건 보기`}
      >
        <ImageIcon size={11} />
        {recentImages.length > 0 && <span className="ml-0.5">{recentImages.length}</span>}
      </button>

      {/* #2 이미지 사이드 패널 — 우측에서 펼쳐짐. 썸네일은 후속 사이클 (main 측 base64 IPC 필요).
          현재는 파일명 + 클릭 시 OS open. */}
      {imageSidebarOpen && (
        <div
          className="absolute z-10 top-0 bottom-0 flex flex-col"
          style={{
            right: 0,
            width: 220,
            background: 'var(--bg-surface)',
            borderLeft: '1px solid var(--bg-border)'
          }}
        >
          <div className="px-3 py-2 border-b border-bg-border flex items-center gap-1.5">
            <ImageIcon size={12} className="text-clauday-blue" />
            <span className="text-[calc(11px_*_var(--app-font-scale,1))] font-semibold text-text-primary">최근 이미지</span>
            <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">{recentImages.length}</span>
            <div className="flex-1" />
            {recentImages.length > 0 && (
              <button onClick={() => setRecentImages([])}
                className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary hover:text-text-primary">
                지우기
              </button>
            )}
          </div>
          {recentImages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center px-3 text-center">
              <span className="text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary leading-relaxed">
                터미널 출력에 이미지 경로가 보이면 여기 모입니다.
                <br /><span className="text-[calc(10px_*_var(--app-font-scale,1))] opacity-70">예: ~/screenshots/foo.png</span>
              </span>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto py-1">
              {recentImages.map((img, i) => (
                <ImageRow key={`${img.path}-${i}`} path={img.path} />
              ))}
            </div>
          )}
        </div>
      )}
      {search.open && (
        <TerminalSearchBar
          query={search.query}
          toggles={search.toggles}
          countLabel={search.countLabel}
          hasError={search.hasError}
          onQueryChange={search.setQuery}
          onCompositionStart={search.onCompositionStart}
          onCompositionEnd={search.onCompositionEnd}
          onToggle={search.toggleOption}
          onNext={search.findNext}
          onPrev={search.findPrev}
          onClose={search.closeSearch}
        />
      )}

      {/* v2.0 B-1: 종료 오버레이 — 자동으로 사라지지 않는다. pointer-events-none 으로 감싸서
          스크롤/드래그-선택은 아래 터미널로 통과시키고, 배지/버튼만 클릭 가능하게 한다 (ADR-02). */}
      {exitInfo && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg bg-[var(--bg-surface-raised)] border border-[var(--bg-border)]">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                exitInfo.exitCode === 0 ? 'bg-[var(--c-emerald-solid)]' : 'bg-[var(--c-red-solid)]'
              }`}
            />
            <span className="text-[calc(12px_*_var(--app-font-scale,1))] text-text-primary">
              세션이 종료되었습니다 <span className="text-text-tertiary">(exit {exitInfo.exitCode})</span>
            </span>
          </div>
          {onRequestClose && (
            <Button variant="secondary" size="sm" className="pointer-events-auto" onClick={onRequestClose}>
              닫기
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * #2 사이드 패널 한 행 — 비동기로 dataURL 받아 썸네일 표시.
 * 파일이 크거나 읽기 실패면 아이콘만. 클릭 시 OS open.
 */
function ImageRow({ path }: { path: string }): JSX.Element {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    window.api.shell.readImageDataUrl(path)
      .then((r) => {
        if (cancelled) return
        if (r.ok && r.dataUrl) setDataUrl(r.dataUrl)
        else setFailed(true)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [path])
  const filename = path.split('/').pop() || path
  return (
    <button
      onClick={() => window.api.shell.openPath(path).catch(() => {})}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-bg-surface-hover group"
      title={path}
    >
      <div className="w-9 h-9 rounded-sm flex items-center justify-center bg-bg-primary border border-bg-border flex-shrink-0 overflow-hidden">
        {dataUrl ? (
          <img src={dataUrl} alt={filename} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon size={13} className={failed ? 'text-text-tertiary' : 'text-clauday-blue'} />
        )}
      </div>
      <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-primary truncate flex-1">{filename}</span>
      <ExternalLink size={9} className="text-text-tertiary opacity-0 group-hover:opacity-100 flex-shrink-0" />
    </button>
  )
}

// forwardRef 로 감싸면 devtools 컴포넌트 이름이 사라지므로 displayName 을 명시한다.
const TerminalPane = forwardRef(TerminalPaneInner)
TerminalPane.displayName = 'TerminalPane'

export default TerminalPane
