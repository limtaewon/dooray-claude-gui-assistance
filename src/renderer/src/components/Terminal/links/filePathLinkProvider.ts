/**
 * 파일 경로 link provider 조립 — ADR-v2-terminal-p2-05 §레이어 2~5 를 하나의 `ILinkProvider` 로
 * 엮는다(경로 후보 추출 → soft/hard wrap 재구성 → 배치 존재 검증 → fingerprint 재검증 →
 * 최장 비중첩 선택). 개별 레이어는 각자 파일에서 이식됐고, 이 파일 자체는 Clauday 고유의
 * 조립 로직이라 이식 대상이 아니다.
 */

import type { ILink, ILinkProvider, Terminal } from '@xterm/xterm'
import type { TerminalResolvePathRequest, TerminalResolvedPath } from '@shared/types/terminal'
import { detectLocalPathLinks, mergeRanges } from './terminalPathRegex'
import type { FileLinkCandidate } from './terminalPathRegex'
import { detectBareFilenameLinks } from './bareFileLink'
import {
  buildCandidateLogicalLines,
  rangeForLogicalLineSpan
} from './wrappedLinkRanges'
import type { WrappedLogicalLine } from './wrappedLinkRanges'
import { resolveFileLinkCandidates, preferLongestNonOverlappingLinks } from './resolveLinks'
import type { CachedPathResolution } from './pathExistsCache'
import { isLinkActivationEvent } from './linkActivation'

export interface FilePathLinkTooltip {
  show: (text: string, event: MouseEvent) => void
  hide: () => void
}

export interface FilePathLinkProviderDeps {
  sessionId: string
  /** OSC7 로 알아낸 최신 cwd — 없으면 main 이 pid probe/spawn cwd 로 판단한다. */
  getCwdHint: () => string | undefined
  cache: Map<string, CachedPathResolution>
  resolvePath: (req: TerminalResolvePathRequest) => Promise<TerminalResolvedPath[]>
  /**
   * resolved 절대 경로를 연다 — `~` 확장은 이미 main 이 끝낸 상태다.
   * `preferExternal`(⌥ 조합)이면 앱 안에서 열 수 있어도 OS 기본 앱으로 넘긴다.
   * `line` 은 `파일.ts:120` 형태였을 때만 채워진다 — 앱 안에서 열 때 그 줄로 간다.
   */
  openPath: (absolutePath: string, opts: { preferExternal: boolean; line: number | null }) => void
  tooltip: FilePathLinkTooltip
}

/** 구분자 경로(local path) + bare filename 두 패스를 합친다 — 이미 점유된 범위는 재사용하지 않는다. */
function extractFileLinkCandidates(lineText: string, includeSpacedPrefixCandidates: boolean): FileLinkCandidate[] {
  const localLinks = detectLocalPathLinks(lineText, includeSpacedPrefixCandidates)
  const claimed = mergeRanges(localLinks.map(({ startIndex, endIndex }): [number, number] => [startIndex, endIndex]))
  const bareLinks = detectBareFilenameLinks(lineText, claimed)
  return [...localLinks, ...bareLinks]
}

interface CandidateWithLine {
  candidate: FileLinkCandidate
  logicalLine: WrappedLogicalLine
}

function formatTooltipText(absolutePath: string, line: number | null, column: number | null): string {
  if (line === null) return absolutePath
  return column === null ? `${absolutePath}:${line}` : `${absolutePath}:${line}:${column}`
}

/**
 * 파일 경로 link provider — `installLinkProviderGuard` 가 patch 한 `terminal.registerLinkProvider`
 * 로 등록해야 동기 throw 로부터 보호된다(레이어 0). URL 은 이 provider 의 범위 밖이다(레이어 1,
 * `@xterm/addon-web-links` 가 따로 처리).
 */
export function createFilePathLinkProvider(terminal: Terminal, deps: FilePathLinkProviderDeps): ILinkProvider {
  return {
    provideLinks(bufferLineNumber, callback) {
      const buffer = terminal.buffer.active
      const logicalLines = buildCandidateLogicalLines(buffer, bufferLineNumber)
      if (logicalLines.length === 0 || logicalLines.every((line) => !line.text)) {
        callback(undefined)
        return
      }

      const perLineCandidates: CandidateWithLine[] = logicalLines.flatMap((logicalLine) =>
        extractFileLinkCandidates(logicalLine.text, true).map((candidate) => ({ candidate, logicalLine }))
      )
      if (perLineCandidates.length === 0) {
        callback(undefined)
        return
      }

      const cwdHint = deps.getCwdHint()
      resolveFileLinkCandidates({
        candidates: perLineCandidates.map(({ candidate }) => candidate.pathText),
        sessionId: deps.sessionId,
        cwdHint,
        cache: deps.cache,
        resolvePath: deps.resolvePath
      })
        .then((resolvedByPathText) => {
          // 존재 검증이 끝난 시점에 라인이 바뀌었으면(스크롤/새 출력) 전부 폐기한다(stale link 방지,
          // ADR-05 §레이어 5) — fingerprint 재계산이 원본과 하나라도 일치하지 않으면 그 후보를 버린다.
          const freshFingerprints = new Set(buildCandidateLogicalLines(buffer, bufferLineNumber).map((line) => line.fingerprint))

          const links = perLineCandidates
            .filter(({ logicalLine }) => freshFingerprints.has(logicalLine.fingerprint))
            .map(({ candidate, logicalLine }) => {
              const resolution = resolvedByPathText.get(candidate.pathText)
              if (!resolution || resolution.kind === null) return null
              const range = rangeForLogicalLineSpan(logicalLine, candidate.startIndex, candidate.endIndex)
              if (!range) return null
              const absolutePath = resolution.resolved
              const tooltipText = formatTooltipText(absolutePath, candidate.line, candidate.column)
              const link: ILink = {
                range,
                text: candidate.displayText,
                activate: (event) => {
                  if (!isLinkActivationEvent(event)) return
                  terminal.clearSelection() // Cmd+클릭 3버그 모듈 ③ — 드래그 선택 폭주 방지
                  deps.openPath(absolutePath, {
                    preferExternal: Boolean(event?.altKey),
                    line: candidate.line ?? null
                  })
                },
                hover: (event) => deps.tooltip.show(tooltipText, event),
                leave: () => deps.tooltip.hide()
              }
              return { range, text: candidate.displayText, link }
            })
            .filter((v): v is { range: ILink['range']; text: string; link: ILink } => v !== null)

          const selected = preferLongestNonOverlappingLinks(links).map((v) => v.link)
          callback(selected.length > 0 ? selected : undefined)
        })
        .catch((e) => {
          console.warn('[terminal-link] provideLinks 처리 실패', e)
          callback(undefined)
        })
    }
  }
}
