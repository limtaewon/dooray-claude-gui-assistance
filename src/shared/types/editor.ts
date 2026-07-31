/** 폴더를 프로젝트로 열 수 있는 외부 에디터 하나. */
export interface DetectedEditor {
  id: EditorId
  /** 화면에 그대로 쓰는 이름 (예: IntelliJ IDEA) */
  name: string
  /** 실제로 찾아낸 실행 대상 — 앱 번들 경로 또는 실행 파일 경로 */
  target: string
  /** app: macOS `open -a`, exec: 실행 파일 직접 spawn */
  kind: 'app' | 'exec'
}

export type EditorId = 'intellij' | 'webstorm' | 'pycharm' | 'vscode' | 'cursor'

export interface OpenInEditorRequest {
  editorId: EditorId
  /** 열 폴더의 절대 경로 */
  path: string
}
