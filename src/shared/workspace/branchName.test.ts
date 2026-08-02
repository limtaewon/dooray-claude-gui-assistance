import { describe, it, expect } from 'vitest'
import { buildBranchName, resolveBranchNameConflict, DEFAULT_BRANCH_TEMPLATE, type BranchNameInput } from './branchName'
import { isSafeGitRef } from './gitRef'

function input(overrides: Partial<BranchNameInput> & { taskId: string }): BranchNameInput {
  return { template: DEFAULT_BRANCH_TEMPLATE, ...overrides }
}

describe('buildBranchName — 토큰 치환', () => {
  it('{projectCode} 치환', () => {
    expect(buildBranchName(input({ template: '{projectCode}', projectCode: 'D-TF', taskId: 'abcdef123456' }))).toBe('D-TF')
  })

  it('{taskNumber} 치환', () => {
    expect(buildBranchName(input({ template: '{taskNumber}', taskNumber: 2619, taskId: 'abcdef123456' }))).toBe('2619')
  })

  it('{taskId6} 치환 — taskId 뒤 6자리', () => {
    expect(buildBranchName(input({ template: '{taskId6}', taskId: 'abcdef123456' }))).toBe('123456')
  })

  it('{subject} 치환', () => {
    expect(buildBranchName(input({ template: '{subject}', subject: 'hello-world', taskId: 'abcdef123456' }))).toBe(
      'hello-world'
    )
  })

  it('{prefix} 치환', () => {
    expect(buildBranchName(input({ template: '{prefix}/{taskId6}', prefix: 'D-TF', taskId: 'abcdef123456' }))).toBe(
      'D-TF/123456'
    )
  })

  it('미지 토큰은 빈 문자열로 치환된다(세그먼트 내 선행 -는 sanitize 로 정리됨)', () => {
    // 'feature/{unknown}-{taskId6}' → 'feature/-123456' → 세그먼트 2 앞의 '-' 제거 → 'feature/123456'
    expect(buildBranchName(input({ template: 'feature/{unknown}-{taskId6}', taskId: 'abcdef123456' }))).toBe(
      'feature/123456'
    )
  })
})

describe('buildBranchName — taskNumber fallback (AC4-②)', () => {
  it('taskNumber 없으면 taskId6 로 자동 대체', () => {
    expect(
      buildBranchName(input({ projectCode: 'D-TF', taskNumber: undefined, taskId: 'abcdef382391' }))
    ).toBe('feature/D-TF-382391')
  })
})

describe('buildBranchName — projectCode 빈 값', () => {
  it("projectCode 가 비면 'task' 로 대체", () => {
    expect(buildBranchName(input({ projectCode: '', taskNumber: 2619, taskId: 'abcdef123456' }))).toBe(
      'feature/task-2619'
    )
  })
})

describe('buildBranchName — 한글/특수문자 subject sanitize (AC4-④)', () => {
  it("'[iOS] 메일 목록 디자인 개선' → 빈 세그먼트/연속 '-' 없음", () => {
    const result = buildBranchName(
      input({ template: '{subject}', subject: '[iOS] 메일 목록 디자인 개선', taskId: 'abcdef000001' })
    )
    expect(result).not.toMatch(/--/)
    expect(result).not.toMatch(/^-|-$/)
    expect(result).not.toBe('')
    expect(isSafeGitRef(result)).toBe(true)
  })

  /**
   * 한글은 git ref 로 쓸 수 있다. 예전에는 영숫자만 남겨서 사용자가 템플릿에 적은 이름이
   * 조용히 사라졌다 (`feature/MIS-경영정보서비스/…` → `feature/MIS/…`).
   */
  it('한글 subject 는 그대로 살아남는다 — 공백만 `-` 로 접는다', () => {
    const result = buildBranchName(
      input({ template: 'feature/{subject}', subject: '메일 목록 디자인 개선', taskId: 'abcdef000002' })
    )
    expect(result).toBe('feature/메일-목록-디자인-개선')
    expect(isSafeGitRef(result)).toBe(true)
  })

  it('템플릿에 적은 한글 조각도 유지된다', () => {
    const result = buildBranchName(
      input({ template: 'feature/MIS-경영정보서비스/1705-qa-{taskNumber}', taskNumber: 6793, taskId: 'abcdef000004' })
    )
    expect(result).toBe('feature/MIS-경영정보서비스/1705-qa-6793')
    expect(isSafeGitRef(result)).toBe(true)
  })

  it('쓸 수 있는 문자가 하나도 안 남으면 task-{taskId6} 로 폴백', () => {
    const result = buildBranchName(input({ template: '{subject}', subject: '~^:?*', taskId: 'abcdef000003' }))
    expect(result).toBe('task-000003')
  })
})

describe('resolveBranchNameConflict — off-by-one 고정 (AC4-③)', () => {
  it('충돌 없으면 base 그대로', () => {
    expect(resolveBranchNameConflict('feature/a', [])).toBe('feature/a')
  })

  it('1개 충돌 시 -2', () => {
    expect(resolveBranchNameConflict('feature/a', ['feature/a'])).toBe('feature/a-2')
  })

  it('-2 도 있으면 -3', () => {
    expect(resolveBranchNameConflict('feature/a', ['feature/a', 'feature/a-2'])).toBe('feature/a-3')
  })
})

describe('buildBranchName — 계약 테스트: 생성 20종 전부 isSafeGitRef 통과 (AC4-⑤)', () => {
  const cases: BranchNameInput[] = [
    input({ projectCode: 'D-TF', taskNumber: 2619, taskId: '000000002619' }),
    input({ projectCode: '', taskNumber: 2619, taskId: '000000002619' }),
    input({ projectCode: 'D-TF', taskNumber: undefined, taskId: '000000382391' }),
    input({ template: '{subject}', subject: '[iOS] 메일 목록 디자인 개선', taskId: '000000000001' }),
    input({ template: '{subject}', subject: '이모지 포함 🎉🚀 제목', taskId: '000000000002' }),
    input({ template: '{subject}', subject: '   공백만   ', taskId: '000000000003' }),
    input({ template: '{subject}', subject: '..danger..', taskId: '000000000004' }),
    input({ template: '{subject}', subject: '-leading-dash', taskId: '000000000005' }),
    input({ template: '{subject}', subject: 'a'.repeat(300), taskId: '000000000006' }),
    input({ template: '{subject}', subject: '', taskId: '000000000007' }),
    input({ template: '{subject}', subject: 'a/b/c/d/e/f/g', taskId: '000000000008' }),
    input({ template: '{subject}', subject: 'semi;colon|pipe&amp$dollar`tick', taskId: '000000000009' }),
    input({ template: '{subject}', subject: 'tilde~caret^colon:question?star*bracket[', taskId: '000000000010' }),
    input({ template: '{subject}', subject: 'trailing.dot.', taskId: '000000000011' }),
    input({ template: '{subject}', subject: 'trailing.lock.lock', taskId: '000000000012' }),
    input({ template: '{subject}', subject: 'at@{brace', taskId: '000000000013' }),
    input({ template: '{subject}', subject: '@', taskId: '000000000014' }),
    input({ template: '{prefix}/{subject}', prefix: 'D-TF', subject: '한글 제목', taskId: '000000000015' }),
    input({ template: 'feature/{projectCode}-{taskNumber}-{subject}', projectCode: 'D-TF', taskNumber: 42, subject: '보고서 개선', taskId: '000000000016' }),
    input({ template: '{unknown1}/{unknown2}', taskId: '000000000017' }),
    input({ template: '{subject}', subject: 'CRLF\r\ninjected', taskId: '000000000018' }),
    input({ template: '{subject}', subject: '슬래시//연속', taskId: '000000000019' }),
    input({ projectCode: 'D-TF', taskNumber: 1, taskId: '' })
  ]

  it.each(cases.map((c, i) => [i, c] as const))('케이스 %i', (_i, c) => {
    const result = buildBranchName(c)
    expect(isSafeGitRef(result)).toBe(true)
  })
})
