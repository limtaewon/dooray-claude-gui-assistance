/**
 * harnessEditPrompt.test.ts — AI 편집제안 프롬프트 빌더 단위 테스트
 *
 * 순수 함수이므로 electron/Node fs 모킹 불요.
 * 계약 검증: 시스템 프롬프트 규칙, 화이트리스트 명시, 파일 내용 포함 여부.
 */

import { describe, it, expect } from 'vitest'
import { buildEditSystemPrompt, buildEditUserPrompt } from './harnessEditPrompt'

describe('buildEditSystemPrompt', () => {
  it('순수 JSON 만 응답 규칙이 포함된다', () => {
    const prompt = buildEditSystemPrompt()
    expect(prompt).toContain('순수 JSON')
  })

  it('proposals 출력 형식이 명시된다', () => {
    const prompt = buildEditSystemPrompt()
    expect(prompt).toContain('"proposals"')
    expect(prompt).toContain('"relPath"')
    expect(prompt).toContain('"newContent"')
    expect(prompt).toContain('"rationale"')
  })

  it('화이트리스트 밖 relPath 생성 금지가 명시된다', () => {
    const prompt = buildEditSystemPrompt()
    expect(prompt).toContain('화이트리스트')
  })

  it('trailing comma 금지가 명시된다', () => {
    const prompt = buildEditSystemPrompt()
    expect(prompt).toContain('trailing comma')
  })

  it('파일 전체 내용 반환 요건이 명시된다 (unified diff 아님)', () => {
    const prompt = buildEditSystemPrompt()
    expect(prompt).toContain('전체 내용')
    // unified diff, 부분 패치 금지 명시
    expect(prompt).toContain('unified diff')
  })

  it('frontmatter 안전 유지 규칙이 포함된다', () => {
    const prompt = buildEditSystemPrompt()
    expect(prompt).toContain('frontmatter')
  })

  it('빈 proposals 도 JSON 형식 유지 규칙이 포함된다', () => {
    const prompt = buildEditSystemPrompt()
    expect(prompt).toContain('빈 배열')
  })

  it('비어있지 않은 문자열 반환', () => {
    const prompt = buildEditSystemPrompt()
    expect(prompt.length).toBeGreaterThan(100)
  })
})

describe('buildEditUserPrompt', () => {
  const command = '보안검토자를 opus 모델로 바꿔줘'
  const targetFiles = [
    { relPath: '_agents/security-reviewer.md', content: '---\nname: security-reviewer\nmodel: sonnet\n---\n# 보안 검토자' },
    { relPath: '_agents/architect.md', content: '---\nname: architect\nmodel: opus\n---\n# 아키텍트' }
  ]

  it('명령이 user prompt 에 포함된다', () => {
    const prompt = buildEditUserPrompt(command, targetFiles)
    expect(prompt).toContain(command)
  })

  it('각 파일의 relPath 가 포함된다', () => {
    const prompt = buildEditUserPrompt(command, targetFiles)
    expect(prompt).toContain('_agents/security-reviewer.md')
    expect(prompt).toContain('_agents/architect.md')
  })

  it('각 파일의 내용(content)이 포함된다', () => {
    const prompt = buildEditUserPrompt(command, targetFiles)
    expect(prompt).toContain('security-reviewer')
    expect(prompt).toContain('아키텍트')
  })

  it('화이트리스트 목록이 명시된다', () => {
    const prompt = buildEditUserPrompt(command, targetFiles)
    expect(prompt).toContain('화이트리스트')
  })

  it('빈 targetFiles 로도 에러 없이 동작한다', () => {
    expect(() => buildEditUserPrompt(command, [])).not.toThrow()
    const prompt = buildEditUserPrompt(command, [])
    expect(prompt).toContain(command)
  })

  it('단일 파일 targetFiles 로 정상 생성', () => {
    const single = [{ relPath: 'SKILL.md', content: '## Role\n개발자' }]
    const prompt = buildEditUserPrompt('역할을 시니어 개발자로 수정', single)
    expect(prompt).toContain('SKILL.md')
    expect(prompt).toContain('개발자')
  })

  it('파일 내용이 코드 펜스로 감싸진다 (구조 명확화)', () => {
    const files = [{ relPath: 'test.md', content: 'content here' }]
    const prompt = buildEditUserPrompt('명령', files)
    // 코드 펜스(```) 로 파일 내용 감싸기 확인
    expect(prompt).toContain('```')
    expect(prompt).toContain('content here')
  })

  it('파일이 여러 개일 때 모두 각자 포함된다', () => {
    const files = [
      { relPath: 'a.md', content: '콘텐츠A' },
      { relPath: 'b.md', content: '콘텐츠B' },
      { relPath: 'c.md', content: '콘텐츠C' }
    ]
    const prompt = buildEditUserPrompt('모두 수정', files)
    expect(prompt).toContain('a.md')
    expect(prompt).toContain('b.md')
    expect(prompt).toContain('c.md')
    expect(prompt).toContain('콘텐츠A')
    expect(prompt).toContain('콘텐츠B')
    expect(prompt).toContain('콘텐츠C')
  })
})
