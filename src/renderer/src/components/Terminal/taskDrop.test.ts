import { describe, it, expect } from 'vitest'
import { buildTaskDropSteps, foldPrompt, shellQuote } from './taskDrop'

const TARGET = { cwd: '/work/ios-dooray', repoName: 'ios-dooray' }
const NO_WAIT = { boot: 0, ready: 0, submit: 0 }

describe('shellQuote', () => {
  it('공백 포함 경로를 안전하게 감싼다', () => {
    expect(shellQuote('/Users/me/my repo')).toBe("'/Users/me/my repo'")
  })

  it('작은따옴표를 탈출한다', () => {
    expect(shellQuote("/tmp/it's")).toBe("'/tmp/it'\\''s'")
  })
})

describe('foldPrompt', () => {
  it('개행을 공백으로 접는다 — TUI 입력창이 개행을 제출로 해석하기 때문', () => {
    expect(foldPrompt('첫 줄\n  둘째 줄\n\n셋째')).toBe('첫 줄 둘째 줄 셋째')
  })
})

describe('buildTaskDropSteps', () => {
  it('세션이 없으면 cd → claude → 프롬프트 → 제출 순으로 만든다', () => {
    const steps = buildTaskDropSteps({ target: TARGET, subject: '메일 목록 개선', taskNumber: 2619, delays: NO_WAIT })

    expect(steps.map((s) => s.data)).toEqual([
      "cd '/work/ios-dooray'\r",
      'claude\r',
      '다음 두레이 업무를 진행합니다: #2619 메일 목록 개선',
      '\r'
    ])
  })

  it('세션이 있으면 --resume 으로 이어가고 프롬프트를 다시 넣지 않는다', () => {
    const steps = buildTaskDropSteps({
      target: { ...TARGET, claudeSessionId: 'sess-abc' },
      subject: '메일 목록 개선',
      delays: NO_WAIT
    })

    expect(steps.map((s) => s.data)).toEqual(["cd '/work/ios-dooray'\r", 'claude --resume sess-abc\r'])
    expect(steps.some((s) => s.data.includes('두레이 업무'))).toBe(false)
  })

  it('태스크 번호가 없으면 제목만 넣는다', () => {
    const steps = buildTaskDropSteps({ target: TARGET, subject: '제목만', delays: NO_WAIT })
    expect(steps[2].data).toBe('다음 두레이 업무를 진행합니다: 제목만')
  })

  it('제목의 개행은 접혀서 한 줄로 전달된다', () => {
    const steps = buildTaskDropSteps({ target: TARGET, subject: '앞\n뒤', delays: NO_WAIT })
    expect(steps[2].data).not.toContain('\n')
  })
})
