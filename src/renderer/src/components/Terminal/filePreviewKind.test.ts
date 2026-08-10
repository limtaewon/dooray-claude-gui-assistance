import { describe, it, expect } from 'vitest'
import { filePreviewKind } from './filePreviewKind'

describe('filePreviewKind', () => {
  it('마크다운 계열은 markdown', () => {
    expect(filePreviewKind('/a/README.md')).toBe('markdown')
    expect(filePreviewKind('/a/doc.markdown')).toBe('markdown')
    expect(filePreviewKind('/a/page.mdx')).toBe('markdown')
  })

  it('HTML 계열은 html', () => {
    expect(filePreviewKind('/a/spec.html')).toBe('html')
    expect(filePreviewKind('/a/index.htm')).toBe('html')
  })

  it('대문자 확장자도 같게 본다', () => {
    expect(filePreviewKind('/a/README.MD')).toBe('markdown')
    expect(filePreviewKind('/a/INDEX.HTML')).toBe('html')
  })

  it('한글 파일명도 확장자만 본다', () => {
    expect(filePreviewKind('/문서/보고서 최종.md')).toBe('markdown')
  })

  // 렌더할 게 없으면 토글 자체를 숨긴다 — 눌러도 아무 일 없는 버튼을 두지 않는다.
  it('렌더할 수 없는 형식은 null', () => {
    expect(filePreviewKind('/a/index.ts')).toBeNull()
    expect(filePreviewKind('/a/config.json')).toBeNull()
    expect(filePreviewKind('/a/Makefile')).toBeNull()
    expect(filePreviewKind('/a/.gitignore')).toBeNull()
  })
})
