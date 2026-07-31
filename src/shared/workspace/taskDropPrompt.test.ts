import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TASK_DROP_PROMPT,
  foldPrompt,
  renderTaskDropPrompt,
  templateNeedsBody
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

describe('foldPrompt', () => {
  it('개행 주변 공백까지 한 칸으로 접는다', () => {
    expect(foldPrompt('a\n  b\n\nc')).toBe('a b c')
  })
})
