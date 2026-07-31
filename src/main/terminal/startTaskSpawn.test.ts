import { describe, it, expect } from 'vitest'
import { buildStartTaskSpawn } from './startTaskSpawn'

describe('buildStartTaskSpawn', () => {
  it('darwin — 현행 리터럴과 정확히 일치 (회귀 잠금)', () => {
    const result = buildStartTaskSpawn({
      prompt: '두레이 태스크를 시작합니다.\n프로젝트: X',
      platform: 'darwin',
      claudeBin: '/Users/nhn/.claude/local/claude'
    })
    expect(result).toEqual({
      command: 'claude',
      args: ['-p', '두레이 태스크를 시작합니다.\n프로젝트: X', '--model', 'sonnet'],
      displayName: 'claude'
    })
  })

  it('linux — darwin 과 동일 경로', () => {
    const result = buildStartTaskSpawn({
      prompt: 'hello',
      platform: 'linux',
      claudeBin: '/usr/local/bin/claude'
    })
    expect(result).toEqual({
      command: 'claude',
      args: ['-p', 'hello', '--model', 'sonnet'],
      displayName: 'claude'
    })
  })

  it('win32 — 커맨드라인 전문이 순서대로 조립된다 (chcp → type → 파이프 → bin → -p → --model)', () => {
    const result = buildStartTaskSpawn({
      prompt: '아무 내용',
      platform: 'win32',
      claudeBin: 'C:\\Users\\me\\.claude\\local\\claude.cmd',
      comspec: 'C:\\Windows\\System32\\cmd.exe',
      promptFilePath: 'C:\\Users\\me\\AppData\\Local\\Temp\\clauday-start-task-abc.txt'
    })
    expect(result.command).toBe('C:\\Windows\\System32\\cmd.exe')
    expect(result.displayName).toBe('claude')
    expect(result.promptFile).toBe('C:\\Users\\me\\AppData\\Local\\Temp\\clauday-start-task-abc.txt')
    expect(typeof result.args).toBe('string')
    const args = result.args as string
    expect(args).toBe(
      '/d /s /c "chcp 65001>nul && type C:\\Users\\me\\AppData\\Local\\Temp\\clauday-start-task-abc.txt | C:\\Users\\me\\.claude\\local\\claude.cmd -p --model sonnet"'
    )
    // 순서 확인
    const chcpIdx = args.indexOf('chcp 65001')
    const typeIdx = args.indexOf('type ')
    const pipeIdx = args.indexOf(' | ')
    const flagIdx = args.indexOf(' -p ')
    const modelIdx = args.indexOf('--model sonnet')
    expect(chcpIdx).toBeGreaterThanOrEqual(0)
    expect(typeIdx).toBeGreaterThan(chcpIdx)
    expect(pipeIdx).toBeGreaterThan(typeIdx)
    expect(flagIdx).toBeGreaterThan(pipeIdx)
    expect(modelIdx).toBeGreaterThan(flagIdx)
    // -p 뒤에 값이 없다 (바로 --model 로 이어짐)
    expect(args).not.toContain('-p 아무 내용')
  })

  it('공백 포함 bin 경로는 인용된다', () => {
    const result = buildStartTaskSpawn({
      prompt: 'x',
      platform: 'win32',
      claudeBin: 'C:\\Program Files\\claude\\claude.cmd',
      comspec: 'C:\\Windows\\System32\\cmd.exe',
      promptFilePath: 'C:\\Temp\\prompt.txt'
    })
    expect(result.args as string).toContain('"C:\\Program Files\\claude\\claude.cmd"')
  })

  it('공백 포함 promptFile 경로는 인용된다', () => {
    const result = buildStartTaskSpawn({
      prompt: 'x',
      platform: 'win32',
      claudeBin: 'C:\\claude.cmd',
      comspec: 'C:\\Windows\\System32\\cmd.exe',
      promptFilePath: 'C:\\Users\\me\\My Documents\\prompt.txt'
    })
    expect(result.args as string).toContain('"C:\\Users\\me\\My Documents\\prompt.txt"')
  })

  it('개행 포함 프롬프트가 win32 커맨드라인에 등장하지 않는다', () => {
    const result = buildStartTaskSpawn({
      prompt: '1번째 줄\n2번째 줄\n3번째 줄',
      platform: 'win32',
      claudeBin: 'C:\\claude.cmd',
      comspec: 'C:\\Windows\\System32\\cmd.exe',
      promptFilePath: 'C:\\Temp\\prompt.txt'
    })
    expect(result.args as string).not.toContain('\n')
    expect(result.args as string).not.toContain('1번째 줄')
  })

  it('COMSPEC 이 cmd 계열이 아니면 cmd.exe 로 폴백', () => {
    const result = buildStartTaskSpawn({
      prompt: 'x',
      platform: 'win32',
      claudeBin: 'C:\\claude.cmd',
      comspec: 'C:\\Windows\\System32\\bash.exe',
      promptFilePath: 'C:\\Temp\\prompt.txt'
    })
    expect(result.command).toBe('cmd.exe')
  })

  it('COMSPEC 미지정 → cmd.exe', () => {
    const result = buildStartTaskSpawn({
      prompt: 'x',
      platform: 'win32',
      claudeBin: 'C:\\claude.cmd',
      promptFilePath: 'C:\\Temp\\prompt.txt'
    })
    expect(result.command).toBe('cmd.exe')
  })

  it('win32 인데 promptFilePath 미지정 → 명확한 에러', () => {
    expect(() =>
      buildStartTaskSpawn({
        prompt: 'x',
        platform: 'win32',
        claudeBin: 'C:\\claude.cmd'
      })
    ).toThrow(/promptFilePath/)
  })
})
