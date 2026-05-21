import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const tmpDir = mkdtempSync(join(tmpdir(), 'clauday-err-report-test-'))

const writeTextSpy = vi.fn()

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpDir,
    getVersion: () => '1.5.3-test'
  },
  clipboard: { writeText: (s: string) => writeTextSpy(s) }
}))

import { ErrorReportService } from './ErrorReportService'
import { getCliLogPath, startCliCall } from '../utils/cliLogger'

beforeEach(() => {
  const p = getCliLogPath()
  if (existsSync(p)) rmSync(p)
  writeTextSpy.mockClear()
})

function makeService(createTask = vi.fn(async () => ({ id: 'task-1' }))): {
  service: ErrorReportService
  createTask: ReturnType<typeof vi.fn>
} {
  const svc = new ErrorReportService({ createTask } as never)
  return { service: svc, createTask }
}

describe('ErrorReportService.collect', () => {
  it('진단 정보가 없을 때도 시스템 정보는 포함', () => {
    const { service } = makeService()
    const r = service.collect()
    expect(r.body).toContain('## 시스템 정보')
    expect(r.body).toContain('Clauday: v1.5.3-test')
    expect(r.body).toContain('최근 호출 기록이 없습니다')
    expect(r.defaultSubject).toContain('AI 호출 실패')
  })

  it('최근 CLI 로그 있으면 본문에 포함, 기본 제목에 feature 명 포함', () => {
    const ctx = startCliCall({ feature: 'briefing', bin: '/usr/local/bin/claude', argv: ['-p', '--model', 'opus'], prompt: '브리핑 prompt' })
    ctx.appendStderr('Warning: 뭔가 비치명적')
    ctx.complete({ exitCode: 0, errorMessage: 'benign stderr — 빈 결과로 통과' })

    const { service } = makeService()
    const r = service.collect()
    expect(r.body).toContain('Claude CLI 호출 로그')
    expect(r.body).toContain('[briefing]')
    expect(r.body).toContain('benign stderr')
    expect(r.recentLogs).toHaveLength(1)
    expect(r.defaultSubject).toContain('briefing 실패')
  })
})

describe('ErrorReportService.submitCommunity', () => {
  it('두레이 커뮤니티에 task 로 등록', async () => {
    const { service, createTask } = makeService()
    const r = await service.submitCommunity({
      subject: '[오류] 브리핑 실패',
      userNote: '브리핑 새로고침 눌렀더니 에러',
      diagnosticsBody: '## 시스템 정보\n- Clauday: v1.5.3'
    })
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({
      projectId: '4312559241344624232',
      subject: '[오류] 브리핑 실패'
    }))
    const arg = createTask.mock.calls[0][0]
    expect(arg.body).toContain('사용자 코멘트')
    expect(arg.body).toContain('브리핑 새로고침')
    expect(arg.body).toContain('Clauday: v1.5.3')
    expect(r.id).toBe('task-1')
    expect(r.url).toContain('/task/4312559241344624232/task-1')
  })

  it('subject 가 비면 기본값 사용', async () => {
    const { service, createTask } = makeService()
    await service.submitCommunity({ subject: '   ', userNote: '', diagnosticsBody: '본문' })
    expect(createTask.mock.calls[0][0].subject).toBe('[오류 리포트] AI 호출 실패')
  })
})

describe('ErrorReportService.copyToClipboard', () => {
  it('electron clipboard 에 write', () => {
    const { service } = makeService()
    service.copyToClipboard({ subject: '[오류]', userNote: '재현', diagnosticsBody: '본문' })
    expect(writeTextSpy).toHaveBeenCalledTimes(1)
    const text = writeTextSpy.mock.calls[0][0] as string
    expect(text).toContain('[오류]')
    expect(text).toContain('재현')
    expect(text).toContain('본문')
  })
})
