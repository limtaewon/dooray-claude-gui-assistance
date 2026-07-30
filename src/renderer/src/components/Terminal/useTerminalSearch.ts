import { useCallback, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { SearchAddon } from '@xterm/addon-search'
import type { Terminal } from '@xterm/xterm'
import {
  DEFAULT_SEARCH_TOGGLES,
  buildSearchOptions,
  clampSearchQuery,
  formatMatchCount,
  isValidRegexQuery,
  safeFind
} from './terminalSearch'
import type { SearchResultState, SearchToggles } from './terminalSearch'

const SEARCH_DEBOUNCE_MS = 120

export interface UseTerminalSearchOptions {
  sessionId: string
  searchAddonRef: MutableRefObject<SearchAddon | null>
  terminalRef: MutableRefObject<Terminal | null>
}

export interface UseTerminalSearchApi {
  open: boolean
  query: string
  toggles: SearchToggles
  countLabel: string
  hasError: boolean
  openSearch: () => void
  closeSearch: () => void
  setQuery: (value: string) => void
  toggleOption: (key: keyof SearchToggles) => void
  findNext: () => void
  findPrev: () => void
  onCompositionStart: () => void
  onCompositionEnd: (value: string) => void
  /** xterm SearchAddon.onDidChangeResults 이벤트를 그대로 전달한다 — addon 생성 직후 mount effect 에서 연결. */
  handleResultsChanged: (result: SearchResultState) => void
}

/**
 * 터미널 검색 상태(열림/쿼리/토글/결과/오류) 를 소유하는 훅.
 * xterm 인스턴스는 소유하지 않고 ref 로만 참조한다 — TerminalPane 의 mount effect 가
 * 실제 Terminal/SearchAddon 을 만들고 이 훅의 handleResultsChanged 를 onDidChangeResults 에 연결한다.
 */
function useTerminalSearch({ sessionId, searchAddonRef, terminalRef }: UseTerminalSearchOptions): UseTerminalSearchApi {
  const [open, setOpen] = useState(false)
  const [query, setQueryRaw] = useState('')
  const [toggles, setToggles] = useState<SearchToggles>(DEFAULT_SEARCH_TOGGLES)
  const [result, setResult] = useState<SearchResultState | null>(null)
  const composingRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const regexInvalid = toggles.regex && query.length > 0 && !isValidRegexQuery(query, true)

  const runFind = useCallback(
    (direction: 'next' | 'prev', q: string, t: SearchToggles) => {
      const addon = searchAddonRef.current
      if (!addon || !q) return
      if (t.regex && !isValidRegexQuery(q, true)) return
      safeFind(addon, direction, q, buildSearchOptions(t), { sessionId })
    },
    [searchAddonRef, sessionId]
  )

  const scheduleFind = useCallback(
    (q: string, t: SearchToggles) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => runFind('next', q, t), SEARCH_DEBOUNCE_MS)
    },
    [runFind]
  )

  const openSearch = useCallback(() => setOpen(true), [])

  const closeSearch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setOpen(false)
    setQueryRaw('')
    setResult(null)
    try {
      searchAddonRef.current?.clearDecorations()
    } catch {
      /* ok */
    }
    terminalRef.current?.focus()
  }, [searchAddonRef, terminalRef])

  const setQuery = useCallback(
    (value: string) => {
      const clamped = clampSearchQuery(value)
      setQueryRaw(clamped)
      if (!composingRef.current) scheduleFind(clamped, toggles)
    },
    [scheduleFind, toggles]
  )

  const toggleOption = useCallback(
    (key: keyof SearchToggles) => {
      setToggles((prev) => {
        const next = { ...prev, [key]: !prev[key] }
        scheduleFind(query, next)
        return next
      })
    },
    [query, scheduleFind]
  )

  const findNext = useCallback(() => runFind('next', query, toggles), [runFind, query, toggles])
  const findPrev = useCallback(() => runFind('prev', query, toggles), [runFind, query, toggles])

  const onCompositionStart = useCallback(() => {
    composingRef.current = true
  }, [])

  const onCompositionEnd = useCallback(
    (value: string) => {
      composingRef.current = false
      setQuery(value)
    },
    [setQuery]
  )

  const handleResultsChanged = useCallback((r: SearchResultState) => setResult(r), [])

  return {
    open,
    query,
    toggles,
    countLabel: regexInvalid ? '오류' : formatMatchCount(result, query),
    hasError: regexInvalid,
    openSearch,
    closeSearch,
    setQuery,
    toggleOption,
    findNext,
    findPrev,
    onCompositionStart,
    onCompositionEnd,
    handleResultsChanged
  }
}

export default useTerminalSearch
