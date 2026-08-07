/** 파일 탭이 소스 말고 렌더 결과로도 보여줄 수 있는 형식. */
export type FilePreviewKind = 'markdown' | 'html' | null

/**
 * 확장자로 미리보기 가능 여부를 정한다. `null` 이면 소스만 보여주고 토글도 숨긴다 —
 * 누를 수 있는데 아무 일도 안 하는 버튼을 두지 않는다.
 */
export function filePreviewKind(path: string): FilePreviewKind {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'md' || ext === 'markdown' || ext === 'mdx') return 'markdown'
  if (ext === 'html' || ext === 'htm') return 'html'
  return null
}
