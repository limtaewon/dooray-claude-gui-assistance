import type { ISearchOptions, SearchAddon } from '@xterm/addon-search'

/** 쿼리 길이 상한 — 정규식 파국적 백트래킹·과도한 decoration 생성을 방지한다 (ADR-03). */
export const MAX_SEARCH_QUERY_LENGTH = 2048

/** 상한을 넘는 쿼리를 안전하게 절단한다. */
export function clampSearchQuery(query: string): string {
  return query.length > MAX_SEARCH_QUERY_LENGTH ? query.slice(0, MAX_SEARCH_QUERY_LENGTH) : query
}

export interface SearchToggles {
  caseSensitive: boolean
  regex: boolean
  wholeWord: boolean
}

export const DEFAULT_SEARCH_TOGGLES: SearchToggles = {
  caseSensitive: false,
  regex: false,
  wholeWord: false
}

// xterm SearchAddon 의 decoration 은 canvas 위에 직접 칠해지는 색이라 CSS 커스텀 프로퍼티(var(--x))를
// 해석하지 못한다 — TerminalPane 의 xterm 테마 블록(하드코딩 hex)과 같은 이유로 여기도 리터럴 hex 를 쓴다.
// 값은 design-system.css 의 clauday-orange 계열과 맞춰뒀다.
const MATCH_BACKGROUND = '#FDBA74'
const MATCH_BORDER = '#EA580C'
const MATCH_OVERVIEW_RULER = '#EA580C'
const ACTIVE_MATCH_BACKGROUND = '#EA580C'
const ACTIVE_MATCH_BORDER = '#FED7AA'
const ACTIVE_MATCH_OVERVIEW_RULER = '#FDBA74'

/**
 * 검색 옵션 객체를 만든다. 반드시 호출마다 새 객체를 반환한다 —
 * 이전 객체를 변이하면 토글을 바꿔도 재검색에 반영되지 않는 회귀가 생긴다 (ADR-03).
 */
export function buildSearchOptions(toggles: SearchToggles): ISearchOptions {
  return {
    caseSensitive: toggles.caseSensitive,
    regex: toggles.regex,
    wholeWord: toggles.wholeWord,
    decorations: {
      matchBackground: MATCH_BACKGROUND,
      matchBorder: MATCH_BORDER,
      matchOverviewRuler: MATCH_OVERVIEW_RULER,
      activeMatchBackground: ACTIVE_MATCH_BACKGROUND,
      activeMatchBorder: ACTIVE_MATCH_BORDER,
      activeMatchColorOverviewRuler: ACTIVE_MATCH_OVERVIEW_RULER
    }
  }
}

export interface SearchResultState {
  resultIndex: number
  resultCount: number
}

/**
 * 매치 카운트 표시 문자열.
 * 쿼리 없음 → `''`, 결과 없음(아직 검색 전) → `''`, 매치 0건 → `'0/0'`,
 * 활성 매치 없음(resultIndex < 0) → `'-/N'`, 그 외 `'현재/전체'`. 전체는 1000건 이상이면 `>999`.
 */
export function formatMatchCount(result: SearchResultState | null, query: string): string {
  if (!query || !result) return ''
  const { resultIndex, resultCount } = result
  if (resultCount === 0) return '0/0'
  const total = resultCount > 999 ? '>999' : String(resultCount)
  const current = resultIndex < 0 ? '-' : String(resultIndex + 1)
  return `${current}/${total}`
}

/** 정규식 토글이 켜져 있을 때 쿼리가 유효한 정규식인지 사전 검증 (즉시 UI 피드백용). */
export function isValidRegexQuery(query: string, regexOn: boolean): boolean {
  if (!regexOn) return true
  try {
    // eslint-disable-next-line no-new
    new RegExp(query)
    return true
  } catch {
    return false
  }
}

export interface SafeFindContext {
  sessionId: string
}

export interface SafeFindResult {
  ok: boolean
  found: boolean
}

const warnedSessionIds = new Set<string>()

/** 테스트 전용 — 세션별 1회 warn 상태를 초기화한다. */
export function resetSafeFindWarnings(): void {
  warnedSessionIds.clear()
}

/**
 * findNext/findPrevious 를 try/catch 로 감싼다.
 * SearchAddon 의 decoration 계산은 조건에 따라 동기 throw 할 수 있다(Orca 노트 §5,
 * §9 함정 #5 provideLinks 동기 throw 와 같은 계열) — 실패해도 터미널을 죽이지 않고
 * clearDecorations() 로 정리한 뒤 세션당 1회만 console.warn 을 남긴다.
 */
export function safeFind(
  addon: Pick<SearchAddon, 'findNext' | 'findPrevious' | 'clearDecorations'>,
  direction: 'next' | 'prev',
  query: string,
  options: ISearchOptions,
  ctx: SafeFindContext
): SafeFindResult {
  try {
    const found = direction === 'next' ? addon.findNext(query, options) : addon.findPrevious(query, options)
    return { ok: true, found }
  } catch (error) {
    try {
      addon.clearDecorations()
    } catch {
      /* ok */
    }
    if (!warnedSessionIds.has(ctx.sessionId)) {
      warnedSessionIds.add(ctx.sessionId)
      console.warn('[terminal-search] find 실패', {
        sessionId: ctx.sessionId,
        message: error instanceof Error ? error.message : String(error)
      })
    }
    return { ok: false, found: false }
  }
}
