import { describe, it, expect } from 'vitest'
import { buildTaskDropSteps, shellQuote } from './taskDrop'

const TARGET = { cwd: '/work/ios-dooray', repoName: 'ios-dooray' }
const NO_WAIT = { boot: 0, ready: 0, submit: 0 }

describe('shellQuote', () => {
  it('공백 포함 경로를 안전하게 감싼다', () => {
    expect(shellQuote('/Users/me/my repo')).toBe("'/Users/me/my repo'")
  })

  it('작은따옴표를 탈출한다', () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'")
  })
})

describe('buildTaskDropSteps', () => {
  it('세션이 없으면 cd → claude → 프롬프트 → 제출 순으로 만든다', () => {
    const steps = buildTaskDropSteps({ target: TARGET, prompt: '메일 목록 개선', delays: NO_WAIT })

    expect(steps.map((s) => s.data)).toEqual([
      "cd '/work/ios-dooray'\r",
      'claude\r',
      '메일 목록 개선',
      '\r'
    ])
  })

  it('이미 그 폴더에 있으면 cd 를 넣지 않는다 — 사용자가 고른 위치를 덮어쓰지 않는다', () => {
    const steps = buildTaskDropSteps({
      target: TARGET,
      prompt: '작업',
      currentCwd: '/work/ios-dooray',
      delays: NO_WAIT
    })
    expect(steps.map((s) => s.data)).toEqual(['claude\r', '작업', '\r'])
  })

  it('뒤 슬래시 차이는 같은 폴더로 본다', () => {
    const steps = buildTaskDropSteps({
      target: TARGET,
      prompt: '작업',
      currentCwd: '/work/ios-dooray/',
      delays: NO_WAIT
    })
    expect(steps.some((s) => s.data.startsWith('cd '))).toBe(false)
  })

  it('다른 폴더에 있으면 cd 를 넣는다', () => {
    const steps = buildTaskDropSteps({
      target: TARGET,
      prompt: '작업',
      currentCwd: '/work/other',
      delays: NO_WAIT
    })
    expect(steps[0].data).toBe("cd '/work/ios-dooray'\r")
  })

  it('세션이 있으면 --resume 으로 이어가고 프롬프트를 다시 넣지 않는다', () => {
    const steps = buildTaskDropSteps({
      target: { ...TARGET, claudeSessionId: 'sess-abc' },
      prompt: '메일 목록 개선',
      delays: NO_WAIT
    })

    expect(steps.map((s) => s.data)).toEqual([
      "cd '/work/ios-dooray'\r",
      'claude --resume sess-abc\r'
    ])
  })

  it('프롬프트가 null 이면 claude 만 띄우고 지시는 사용자에게 맡긴다', () => {
    const steps = buildTaskDropSteps({ target: TARGET, prompt: null, delays: NO_WAIT })
    expect(steps.map((s) => s.data)).toEqual(["cd '/work/ios-dooray'\r", 'claude\r'])
  })

  it('권한 확인 건너뛰기를 켜면 플래그가 붙는다', () => {
    const steps = buildTaskDropSteps({
      target: TARGET,
      prompt: null,
      skipPermissions: true,
      delays: NO_WAIT
    })
    expect(steps.at(-1)?.data).toBe('claude --dangerously-skip-permissions\r')
  })

  it('resume 에도 권한 플래그가 붙는다', () => {
    const steps = buildTaskDropSteps({
      target: { ...TARGET, claudeSessionId: 's1' },
      prompt: null,
      skipPermissions: true,
      currentCwd: TARGET.cwd,
      delays: NO_WAIT
    })
    expect(steps.map((s) => s.data)).toEqual([
      'claude --dangerously-skip-permissions --resume s1\r'
    ])
  })
})
