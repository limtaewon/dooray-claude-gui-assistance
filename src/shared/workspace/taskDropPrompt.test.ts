import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TASK_DROP_PROMPT,
  foldPrompt,
  formatImagePaths,
  renderTaskDropPrompt,
  templateNeedsBody,
  templateNeedsImages
} from './taskDropPrompt'

const VARS = {
  title: 'AI 유의어 사전 - 신규 메뉴 개발',
  number: 6793,
  projectCode: 'NEON',
  url: 'https://nhnent.dooray.com/project/posts/1',
  body: '표제어 중복 방지는 애플리케이션이 담당한다'
}

describe('renderTaskDropPrompt', () => {
  it('기본 템플릿은 프로젝트/번호 + 제목을 낸다', () => {
    expect(renderTaskDropPrompt(DEFAULT_TASK_DROP_PROMPT, VARS)).toBe(
      '다음 두레이 업무를 진행합니다: NEON/6793 AI 유의어 사전 - 신규 메뉴 개발'
    )
  })

  it('치환자를 각각 채운다', () => {
    expect(renderTaskDropPrompt('{project} {number} {title} {url}', VARS)).toBe(
      'NEON 6793 AI 유의어 사전 - 신규 메뉴 개발 https://nhnent.dooray.com/project/posts/1'
    )
  })

  it('본문 치환자도 채운다', () => {
    expect(renderTaskDropPrompt('{title}\n\n{body}', VARS)).toBe(
      'AI 유의어 사전 - 신규 메뉴 개발 표제어 중복 방지는 애플리케이션이 담당한다'
    )
  })

  it('같은 치환자를 여러 번 써도 전부 바뀐다', () => {
    expect(renderTaskDropPrompt('{number}/{number}', VARS)).toBe('6793/6793')
  })

  it('빈 템플릿은 null — 지시를 보내지 않고 claude 만 띄운다', () => {
    expect(renderTaskDropPrompt('', VARS)).toBeNull()
    expect(renderTaskDropPrompt('   ', VARS)).toBeNull()
  })

  it('치환자만 있고 값이 전부 비면 null', () => {
    expect(renderTaskDropPrompt('{body}', { title: '' })).toBeNull()
  })

  it('값 없는 치환자가 남긴 이중 공백을 정리한다', () => {
    expect(renderTaskDropPrompt('시작: {ref} {title}', { title: '제목' })).toBe('시작: 제목')
  })

  it('여러 줄 템플릿을 한 줄로 접는다 — TUI 입력창은 개행을 제출로 읽는다', () => {
    expect(renderTaskDropPrompt('첫 줄\n둘째 줄', { title: 'x' })).toBe('첫 줄 둘째 줄')
  })

  it('프로젝트 코드가 없으면 ref 는 #번호', () => {
    expect(renderTaskDropPrompt('{ref}', { title: 'x', number: 42 })).toBe('#42')
  })

  it('번호가 없으면 ref 는 프로젝트 코드', () => {
    expect(renderTaskDropPrompt('{ref}', { title: 'x', projectCode: 'NEON' })).toBe('NEON')
  })
})

describe('templateNeedsBody', () => {
  it('본문 치환자를 쓸 때만 true — 본문 조회는 비용이 있어 필요할 때만 한다', () => {
    expect(templateNeedsBody('{title} {body}')).toBe(true)
    expect(templateNeedsBody(DEFAULT_TASK_DROP_PROMPT)).toBe(false)
  })
})

describe('첨부 이미지 치환자', () => {
  /**
   * 기본 템플릿은 건드리지 않는다. 저장된 설정이 기본값을 덮으므로 기본 문자열을 바꿔봐야
   * 신규 설치에만 닿고, 켜지는 순간 드롭마다 본문·댓글 조회가 붙어 시작이 느려진다.
   */
  it('기본 템플릿은 이미지를 쓰지 않는다 — 원하는 사람만 치환자를 넣는다', () => {
    expect(templateNeedsImages(DEFAULT_TASK_DROP_PROMPT)).toBe(false)
    expect(templateNeedsImages('{title} {images}')).toBe(true)
  })

  it('이미지가 있으면 claude 가 읽을 로컬 경로를 따옴표로 감싸 붙인다', () => {
    const rendered = renderTaskDropPrompt('{title} {images}', {
      title: '제목',
      imagePaths: ['/tmp/task-images/p1-t1/재현화면-42.png']
    })
    expect(rendered).toBe(
      '제목 첨부 이미지(로컬 경로, 반드시 읽어볼 것): "/tmp/task-images/p1-t1/재현화면-42.png"'
    )
  })

  it('여러 장이면 경로를 모두 넘긴다', () => {
    expect(formatImagePaths(['/a/1.png', '/a/2.png'])).toContain('"/a/1.png" "/a/2.png"')
  })

  it('빈 목록은 빈 문자열 — 안내 문구만 덩그러니 남으면 안 된다', () => {
    expect(formatImagePaths([])).toBe('')
  })

  /** 8장 상한에 걸려 잘렸는데 전부인 척하면 claude 가 "이게 다" 라고 가정한다. */
  it('상한에 걸려 잘렸으면 몇 장이 더 있는지 밝힌다', () => {
    expect(formatImagePaths(['/a/1.png'], 4)).toContain('이미지가 4장 더 있습니다')
  })

  it('안 잘렸으면 군더더기를 붙이지 않는다', () => {
    expect(formatImagePaths(['/a/1.png'], 0)).not.toContain('더 있습니다')
  })

  it('잘린 장수는 렌더된 지시에도 실린다', () => {
    const rendered = renderTaskDropPrompt('{images}', {
      title: 'x',
      imagePaths: ['/a/1.png'],
      omittedImages: 3
    })
    expect(rendered).toContain('이미지가 3장 더 있습니다')
  })
})

describe('foldPrompt', () => {
  it('개행 주변 공백까지 한 칸으로 접는다', () => {
    expect(foldPrompt('a\n  b\n\nc')).toBe('a b c')
  })
})
