/*
 * Portions adapted from Orca (https://github.com/stablyai/orca)
 * Original: src/renderer/src/components/terminal-pane/parse-osc7.ts (v1.4.162)
 * Copyright (c) 2026 Lovecast Inc. — MIT License
 * See THIRD-PARTY-NOTICES.md
 *
 * 변경: Orca 원본은 `uncHost` 옵션으로 자사 SSH/원격 런타임의 launch UNC 서버를 식별해 UNC 경로로
 * 변환한다. Clauday 는 원격 런타임 개념이 없어 그 옵션과 분기를 제거했다. Windows 드라이브 경로
 * (`file:///C:/...` → `C:/...`) 처리는 원본과 동일하게 유지했다.
 */

// OSC 7 — "현재 작업 디렉터리 보고". 셸(bash/zsh 의 PROMPT_COMMAND/precmd 훅)이 프롬프트마다
//   \x1b]7;file://<host>/<percent-encoded-path>\x07   (또는 ST 종료)
// 를 내보낸다. xterm 파서가 선행 `\x1b]7;` 와 종료 BEL/ST 를 이미 벗겨주므로, 여기 `data` 는
// `file://...` URI 본문만 들어온다.

const OSC7_URI = /^file:\/\/([^/]*)(\/.*)$/

/**
 * OSC 7 payload 를 파싱해 디코딩된 경로를 반환한다. 인식할 수 없는 payload 면 null.
 * 반환값은 현재 플랫폼에서 `node-pty`/`child_process.spawn` 의 `cwd` 옵션이 받아들이는 형태다.
 */
export function parseOsc7(data: string): string | null {
  const match = OSC7_URI.exec(data)
  if (!match) return null

  let path: string
  try {
    path = decodeURIComponent(match[2])
  } catch {
    return null
  }
  if (!path) return null

  // Windows 는 file:///C:/Users/... 형태라 경로가 `/C:/Users/...` 로 들어온다 — spawn 의 cwd
  // 옵션은 이 형태를 받지 않으므로 드라이브 문자 앞의 슬래시를 제거해 `C:/Users/...` 로 만든다.
  if (/^\/[A-Za-z]:/.test(path)) return path.slice(1)
  return path
}
