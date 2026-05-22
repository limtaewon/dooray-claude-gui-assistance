import { app, clipboard } from 'electron'
import { release, hostname, platform, arch } from 'os'
import { readRecentCliLogs, getCliLogPath, getClaudeVersion, type CliLogEntry } from '../utils/cliLogger'
import type { TaskService } from '../dooray/TaskService'

/** Clauday 커뮤니티 프로젝트 — community/CommunityView.tsx 의 ID 와 일치. */
const CLAUDAY_COMMUNITY_PROJECT_ID = '4312559241344624232'

export interface ErrorReportPayload {
  /** 사용자 제목 (수정 가능). 기본값은 호출처에서 만들어 줌 — "AI 브리핑 실패 5/21" 등. */
  subject?: string
  /** 사용자 자유 입력 (현상/재현 절차). */
  userNote: string
  /** 진단 정보 마크다운 본문 (collect 결과를 사용자가 편집한 결과). */
  diagnosticsBody: string
}

export interface CollectedDiagnostics {
  /** 가공된 마크다운 — 모달에서 보여주고 사용자가 편집할 수 있는 본문. */
  body: string
  /** 원천 로그 항목 — UI 가 필요하면 직접 가공 가능. */
  recentLogs: CliLogEntry[]
  /** 진단 로그 파일 절대경로 — "더 자세히 보기" 안내용. */
  logPath: string
  /** 자동 채워주는 기본 제목. */
  defaultSubject: string
}

export class ErrorReportService {
  constructor(private taskService: TaskService) {}

  /** 진단 정보 수집: 최근 CLI 로그 + 시스템 정보 묶음. */
  collect(): CollectedDiagnostics {
    const recentLogs = readRecentCliLogs(5)
    const latest = recentLogs[recentLogs.length - 1]
    const lines: string[] = []

    const claudeVersion = getClaudeVersion()
    lines.push('## 시스템 정보')
    lines.push('')
    lines.push(`- Clauday: v${app.getVersion()}`)
    lines.push(`- OS: ${platform()} ${release()} (${arch()})`)
    lines.push(`- Node: ${process.versions.node}`)
    lines.push(`- Electron: ${process.versions.electron}`)
    lines.push(`- Claude CLI: ${claudeVersion || '(미감지)'}`)
    lines.push(`- Host: ${hostname()}`)
    lines.push('')

    if (recentLogs.length === 0) {
      lines.push('## Claude CLI 로그')
      lines.push('')
      lines.push('_최근 호출 기록이 없습니다._')
    } else {
      lines.push(`## Claude CLI 호출 로그 (최근 ${recentLogs.length}건)`)
      lines.push('')
      for (let i = 0; i < recentLogs.length; i++) {
        const e = recentLogs[i]
        lines.push(`### ${i + 1}. [${e.feature || 'unknown'}] ${e.at}`)
        lines.push('')
        lines.push(`- exit code: \`${e.exitCode}\` · duration: ${e.durationMs}ms`)
        lines.push(`- prompt 길이: ${e.promptLength} chars`)
        if (e.errorMessage) lines.push(`- 에러: ${e.errorMessage}`)
        lines.push('')
        lines.push('**argv**')
        lines.push('```')
        lines.push(e.argvSummary)
        lines.push('```')
        if (e.promptHead) {
          lines.push('**prompt 앞부분**')
          lines.push('```')
          lines.push(e.promptHead)
          lines.push('```')
        }
        if (e.stdoutHead) {
          lines.push(`**stdout (${e.stdoutLength} chars 중 앞부분)**`)
          lines.push('```')
          lines.push(e.stdoutHead)
          lines.push('```')
        }
        if (e.stderrHead) {
          lines.push(`**stderr (${e.stderrLength} chars 중 앞부분)**`)
          lines.push('```')
          lines.push(e.stderrHead)
          lines.push('```')
        }
        lines.push('')
      }
    }

    const defaultSubject = latest?.feature
      ? `[오류 리포트] ${latest.feature} 실패 — ${new Date().toLocaleDateString('ko-KR')}`
      : `[오류 리포트] AI 호출 실패 — ${new Date().toLocaleDateString('ko-KR')}`

    return {
      body: lines.join('\n'),
      recentLogs,
      logPath: getCliLogPath(),
      defaultSubject
    }
  }

  /**
   * 커뮤니티 프로젝트에 task 로 게시. 본인 계정으로 작성.
   * @deprecated v1.6.0 이후 Feedback 으로 통합. 호출 시점에 console.warn
   */
  async submitCommunity(payload: ErrorReportPayload): Promise<{ id: string; url: string }> {
    console.warn('[ErrorReport] submitCommunity 는 deprecated. 다음 사이클에 제거 예정.')
    const subject = payload.subject?.trim() || '[오류 리포트] AI 호출 실패'
    const body = [
      payload.userNote.trim() ? `## 사용자 코멘트\n\n${payload.userNote.trim()}\n` : '',
      payload.diagnosticsBody
    ].filter(Boolean).join('\n')

    const created = await this.taskService.createTask({
      projectId: CLAUDAY_COMMUNITY_PROJECT_ID,
      subject,
      body
    })
    return {
      id: created.id,
      url: `https://nhnent.dooray.com/task/${CLAUDAY_COMMUNITY_PROJECT_ID}/${created.id}`
    }
  }

  /** 클립보드 복사 폴백. */
  copyToClipboard(payload: ErrorReportPayload): void {
    const text = [
      payload.subject || '[오류 리포트]',
      '',
      payload.userNote.trim() ? `## 사용자 코멘트\n${payload.userNote.trim()}\n` : '',
      payload.diagnosticsBody
    ].filter(Boolean).join('\n')
    clipboard.writeText(text)
  }
}
