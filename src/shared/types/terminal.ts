export interface TerminalSession {
  id: string
  name: string
  pid: number
  cwd: string
  createdAt: number
}

export interface TerminalCreateOptions {
  cwd?: string
  command?: string
  /** node-pty 에 그대로 전달된다. 문자열 형태는 win32 verbatim 커맨드라인 전용 — 다른 곳에서 쓰지 않는다 (ADR-v2-windows-fix-04 §2). */
  args?: string[] | string
  /** 탭 표시 이름 — 지정하지 않으면 `command`(또는 'Terminal')를 그대로 쓴다. 스폰 커맨드와 표시 이름을 분리하고 싶을 때 사용(ADR-v2-windows-fix-04 §3). */
  name?: string
}

export interface TerminalResizeOptions {
  id: string
  cols: number
  rows: number
}

/** PTY 종료 통지 payload. signal 은 IPC 구조적 클론에서 undefined 가 소실되므로 null 로 정규화. */
export interface TerminalExitPayload {
  id: string
  exitCode: number
  signal: number | null
}

/**
 * PTY 출력 push payload. `seq` 는 세션별 1부터 증가하는 청크 번호 —
 * 렌더러가 attach 로 따라잡은 지점과 라이브 수신분을 구분해 중복 write 를 막는 데 쓴다.
 */
export interface TerminalOutputPayload {
  id: string
  data: string
  seq: number
}

/**
 * pane 이 세션에 붙을 때 받아가는 따라잡기 결과 — `data` 는 지금까지 쌓인 출력 전체,
 * `seq` 는 그 마지막 청크 번호다. 이보다 큰 seq 의 라이브 수신분만 뒤이어 쓰면 된다.
 * 모르는 세션이면 `{ data: '', seq: 0 }`.
 */
export interface TerminalAttachResult {
  data: string
  seq: number
}

// v2.0 B-4: split 레이아웃 이진 트리 (ADR-v2-terminal-p2-02 §1). leaf 는 leafId 만 갖는다 — sessionId 는
// 재시작마다 새로 발급되므로 트리에 넣지 않는다. 런타임 바인딩/영속 값은 각각 렌더러 상태와
// TerminalTabSnapshot.panes 에 둔다.

/** split 방향 — row: 좌우 분할, column: 상하 분할 */
export type SplitDirection = 'row' | 'column'

/** 분할 트리의 말단 노드. leafId 는 발급 후 교체하지 않는다(스냅샷 키 겸 React key). */
export interface SplitLeaf {
  type: 'leaf'
  leafId: string
}

/** 분할 트리의 분기 노드. ratio 는 first 비율 — 0.5 는 저장 시 생략된다. */
export interface SplitBranch {
  type: 'split'
  direction: SplitDirection
  first: SplitNode
  second: SplitNode
  ratio?: number
}

export type SplitNode = SplitLeaf | SplitBranch

// v2.0 B-5: 영속화 v2 스냅샷 스키마 (ADR-v2-terminal-p2-03 §1). electron-store 키는 `terminalWorkspaceV2`.

/** pane(leaf) 1개의 복원 스냅샷 — SerializeAddon 결과 + 절대 커서 접미, UTF-8 512KB 캡. */
export interface TerminalPaneSnapshot {
  cwd?: string
  cols: number
  rows: number
  serialized: string
}

/** 탭 1개의 스냅샷 — 분할 트리 + 포커스 leaf + leaf 별 pane 스냅샷. */
export interface TerminalTabSnapshot {
  tabId: string
  name: string
  tree: SplitNode
  focusedLeafId: string
  panes: Record<string, TerminalPaneSnapshot>
}

/** 터미널 워크스페이스 전체 스냅샷 — electron-store 의 `terminalWorkspaceV2` 값. */
export interface TerminalWorkspaceSnapshotV2 {
  version: 2
  savedAt: number
  activeTabId: string | null
  tabs: TerminalTabSnapshot[]
}

/** TERMINAL_SAVE_STATE 응답. skipped 는 shouldPersistSnapshot 게이트가 빈 스냅샷 덮어쓰기를 막았을 때만 true. */
export interface TerminalSaveStateResult {
  ok: boolean
  bytes: number
  skipped?: boolean
}

// v2.0 B-7: 링크 경로 존재 검증 배치 (M-B, TERMINAL_RESOLVE_PATH).

/** 경로 후보 배치 존재 검증 요청. cwdHint 가 없으면 main 이 sessionId 로 cwd 를 probe 한다. */
export interface TerminalResolvePathRequest {
  sessionId?: string
  cwdHint?: string
  candidates: string[]
}

/** 후보 1개의 검증 결과 — 요청과 같은 순서로 배열 반환. kind 가 null 이면 미존재(링크 비활성화). */
export interface TerminalResolvedPath {
  candidate: string
  resolved: string
  kind: 'file' | 'directory' | null
}
