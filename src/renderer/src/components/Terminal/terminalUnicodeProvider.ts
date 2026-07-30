/*
 * Portions adapted from Orca (https://github.com/stablyai/orca)
 * Original: src/shared/terminal-unicode-provider.ts (v1.4.162)
 * Copyright (c) 2026 Lovecast Inc. — MIT License
 * See THIRD-PARTY-NOTICES.md
 *
 * 변경: 버전 문자열 상수(`orca-11-zwj` → `clauday-11-zwj`)만 브랜딩에 맞춰 바꿨다. 폭 보정 로직
 * (`OrcaUnicodeProvider` → `ClaudayUnicodeProvider`)은 원본과 동일하다.
 */

import type { IUnicodeHandling, IUnicodeVersionProvider } from '@xterm/xterm'

type XtermTerminalWithUnicodeCore = {
  unicode: IUnicodeHandling
  _core?: {
    unicodeService?: {
      _providers?: Record<string, IUnicodeVersionProvider>
    }
  }
}

const CLAUDAY_UNICODE_VERSION = 'clauday-11-zwj'
const UNICODE11_VERSION = '11'
const ZERO_WIDTH_JOINER = 0x200d

function extractWidth(properties: number): 0 | 1 | 2 {
  return ((properties >> 1) & 3) as 0 | 1 | 2
}

function extractCharKind(properties: number): number {
  return properties >> 3
}

function createProperties(charKind: number, width: 0 | 1 | 2, shouldJoin: boolean): number {
  return ((charKind & 0xffffff) << 3) | ((width & 3) << 1) | (shouldJoin ? 1 : 0)
}

/** Unicode11 위에 ZWJ(Zero-Width Joiner) 이모지 폭 보정을 얹는 provider (함정 #7). */
class ClaudayUnicodeProvider implements IUnicodeVersionProvider {
  public readonly version = CLAUDAY_UNICODE_VERSION

  public constructor(private readonly baseProvider: IUnicodeVersionProvider) {}

  public wcwidth(codepoint: number): 0 | 1 | 2 {
    return this.baseProvider.wcwidth(codepoint)
  }

  public charProperties(codepoint: number, preceding: number): number {
    const precedingWidth = extractWidth(preceding)
    const precedingKind = extractCharKind(preceding)

    if (codepoint === ZERO_WIDTH_JOINER && precedingWidth > 0) {
      return createProperties(ZERO_WIDTH_JOINER, precedingWidth, true)
    }
    if (precedingKind === ZERO_WIDTH_JOINER && precedingWidth > 0 && this.wcwidth(codepoint) > 0) {
      // CLI 는 ZWJ 이모지(예: 👨‍👩‍👧‍👦)를 눈에 보이는 글리프 1개로 그리고 셀 1쌍만 차지한다고
      // 가정한다 — Unicode11 을 그대로 쓰면 ZWJ 로 이어붙인 각 이모지마다 폭을 따로 전진시켜 깨진다.
      return createProperties(codepoint, precedingWidth, true)
    }
    return this.baseProvider.charProperties(codepoint, preceding)
  }
}

/**
 * ZWJ 폭 보정 provider 를 활성화한다. **`terminal.open()` 직후, 모든 write(복원 replay 포함) 전에
 * 호출해야 한다** — 늦으면 xterm 이 write 시점의 폭 테이블로 셀을 이미 배치해버려 wide 문자가
 * `?` 로 깨진다(ADR-v2-terminal-p2-03 §7 5단계, Orca #4877 오진 사례).
 *
 * `Unicode11Addon` 이 이미 `loadAddon` 되어 있어야 한다(이 함수는 addon 을 불러오지 않고, 이미
 * 등록된 '11' provider 를 찾아 감싸기만 한다) — provider 를 못 찾으면 '11' 로만 폴백한다.
 */
export function activateTerminalUnicodeProvider(terminal: XtermTerminalWithUnicodeCore): void {
  const { unicode } = terminal
  if (unicode.activeVersion === CLAUDAY_UNICODE_VERSION) return

  const baseProvider = terminal._core?.unicodeService?._providers?.[UNICODE11_VERSION]
  if (!baseProvider) {
    unicode.activeVersion = UNICODE11_VERSION
    return
  }
  if (!unicode.versions.includes(CLAUDAY_UNICODE_VERSION)) {
    unicode.register(new ClaudayUnicodeProvider(baseProvider))
  }
  unicode.activeVersion = CLAUDAY_UNICODE_VERSION
}
