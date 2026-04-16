import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { McpConfigManager } from './config/McpConfigManager'
import { SkillsManager } from './config/SkillsManager'
import { ConfigWatcher } from './config/ConfigWatcher'
import { UsageParser } from './usage/UsageParser'
import { DoorayClient } from './dooray/DoorayClient'
import { TaskService } from './dooray/TaskService'
import { WikiService } from './dooray/WikiService'
import { CalendarService } from './dooray/CalendarService'
import { AIService } from './ai/AIService'
import Store from 'electron-store'
import { TerminalManager } from './terminal/TerminalManager'
import { SkillStore } from './skills/SkillStore'
import { GitService } from './git/GitService'
import { IPC_CHANNELS } from '../shared/types/ipc'
import type { McpServerConfig } from '../shared/types/mcp'
import type { SkillSaveRequest } from '../shared/types/skills'
import type { UsageQueryParams } from '../shared/types/usage'
import type { DoorayTaskUpdateParams, DoorayWikiUpdateParams, DoorayCalendarQueryParams, DoorayTask } from '../shared/types/dooray'
import type { AIChatRequest } from '../shared/types/ai'
import type { TerminalCreateOptions, TerminalResizeOptions } from '../shared/types/terminal'
import type { GitWorktreeCreateParams, GitWorktreeRemoveParams } from '../shared/types/git'

// Managers
const mcpConfigManager = new McpConfigManager()
const skillsManager = new SkillsManager()
const configWatcher = new ConfigWatcher()
const usageParser = new UsageParser()
const doorayClient = new DoorayClient()
const taskService = new TaskService(doorayClient)
const wikiService = new WikiService(doorayClient)
const calendarService = new CalendarService(doorayClient)
const aiService = new AIService()
const store = new Store({ name: 'clauday-data' })
const terminalManager = new TerminalManager()
const skillStore = new SkillStore()
const gitService = new GitService()

// AI에 Dooray 컨텍스트를 제공하기 위한 캐시
let cachedTasks: DoorayTask[] = []

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'Clauday',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#111827',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  configWatcher.setMainWindow(mainWindow)
  terminalManager.setMainWindow(mainWindow)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function registerIpcHandlers(): void {
  // MCP
  ipcMain.handle(IPC_CHANNELS.MCP_LIST, () => mcpConfigManager.list())
  ipcMain.handle(
    IPC_CHANNELS.MCP_ADD,
    (_, { name, config }: { name: string; config: McpServerConfig }) =>
      mcpConfigManager.add(name, config)
  )
  ipcMain.handle(
    IPC_CHANNELS.MCP_UPDATE,
    (_, { name, config }: { name: string; config: McpServerConfig }) =>
      mcpConfigManager.update(name, config)
  )
  ipcMain.handle(IPC_CHANNELS.MCP_DELETE, (_, name: string) => mcpConfigManager.delete(name))

  // Skills
  ipcMain.handle(IPC_CHANNELS.SKILLS_LIST, () => skillsManager.list())
  ipcMain.handle(IPC_CHANNELS.SKILLS_READ, (_, filename: string) => skillsManager.read(filename))
  ipcMain.handle(IPC_CHANNELS.SKILLS_SAVE, (_, req: SkillSaveRequest) => skillsManager.save(req))
  ipcMain.handle(IPC_CHANNELS.SKILLS_DELETE, (_, filename: string) =>
    skillsManager.delete(filename)
  )

  // Usage (5분 캐시)
  const usageCache: Record<string, { data: unknown; timestamp: number }> = {}
  ipcMain.handle(IPC_CHANNELS.USAGE_QUERY, async (_, params: UsageQueryParams) => {
    const key = params.period
    const cached = usageCache[key]
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) return cached.data
    const data = await usageParser.query(params)
    usageCache[key] = { data, timestamp: Date.now() }
    return data
  })

  // Dooray
  ipcMain.handle(IPC_CHANNELS.DOORAY_TOKEN_SET, (_, token: string) =>
    doorayClient.setToken(token)
  )
  ipcMain.handle(IPC_CHANNELS.DOORAY_TOKEN_GET, () => doorayClient.getToken())
  ipcMain.handle(IPC_CHANNELS.DOORAY_TOKEN_DELETE, () => doorayClient.deleteToken())
  ipcMain.handle(IPC_CHANNELS.DOORAY_TOKEN_VALIDATE, () => doorayClient.validateToken())
  ipcMain.handle(IPC_CHANNELS.DOORAY_PROJECTS_LIST, () =>
    taskService.listMyProjects()
  )
  ipcMain.handle(IPC_CHANNELS.DOORAY_TASKS_LIST, (_, projectIds?: string[]) =>
    taskService.listMyTasks(projectIds)
  )
  ipcMain.handle(IPC_CHANNELS.DOORAY_TASKS_CC, (_, projectIds?: string[]) =>
    taskService.listMyCcTasks(projectIds)
  )
  ipcMain.handle(IPC_CHANNELS.DOORAY_TASKS_UPDATE, (_, params: DoorayTaskUpdateParams) =>
    taskService.updateTaskStatus(params)
  )
  ipcMain.handle(IPC_CHANNELS.DOORAY_WIKI_LIST, (_, projectId: string) =>
    wikiService.list(projectId)
  )
  ipcMain.handle(IPC_CHANNELS.DOORAY_WIKI_CHILDREN, (_, { wikiId, parentPageId }: { wikiId: string; parentPageId: string }) =>
    wikiService.list(wikiId, parentPageId)
  )
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_WIKI_GET,
    (_, { projectId, pageId }: { projectId: string; pageId: string }) =>
      wikiService.get(projectId, pageId)
  )
  ipcMain.handle(IPC_CHANNELS.DOORAY_WIKI_UPDATE, (_, params: DoorayWikiUpdateParams) =>
    wikiService.update(params)
  )
  ipcMain.handle(IPC_CHANNELS.DOORAY_CALENDAR_LIST, () => calendarService.listCalendars())
  ipcMain.handle(IPC_CHANNELS.DOORAY_CALENDAR_EVENTS, (_, params: DoorayCalendarQueryParams) =>
    calendarService.getEvents(params)
  )

  // Terminal
  ipcMain.handle(IPC_CHANNELS.TERMINAL_CREATE, (_, opts?: TerminalCreateOptions) =>
    terminalManager.create(opts)
  )
  ipcMain.on(IPC_CHANNELS.TERMINAL_INPUT, (_, { id, data }: { id: string; data: string }) =>
    terminalManager.input(id, data)
  )
  ipcMain.on(IPC_CHANNELS.TERMINAL_RESIZE, (_, opts: TerminalResizeOptions) =>
    terminalManager.resize(opts)
  )
  ipcMain.handle(IPC_CHANNELS.TERMINAL_KILL, (_, id: string) =>
    terminalManager.kill(id)
  )
  ipcMain.handle(IPC_CHANNELS.TERMINAL_LIST, () => terminalManager.listSessions())
  ipcMain.handle(IPC_CHANNELS.TERMINAL_SAVE_OUTPUT, (_, id: string) => terminalManager.getOutput(id))
  ipcMain.handle(IPC_CHANNELS.TERMINAL_RESTORE, () => {
    return store.get('terminalSessions', []) as Array<{ meta: { id: string; name: string; cwd: string }; output: string }>
  })

  // Claude Code Task Bridge - 태스크 컨텍스트로 Claude Code 세션 시작
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_START_TASK,
    (_, { subject, body, projectCode }: { subject: string; body?: string; projectCode?: string }) => {
      const prompt = [
        `두레이 태스크를 시작합니다.`,
        `프로젝트: ${projectCode || '알 수 없음'}`,
        `태스크: ${subject}`,
        body ? `\n설명:\n${body.substring(0, 2000)}` : '',
        `\n이 태스크를 분석하고 필요한 작업을 진행해주세요.`
      ].filter(Boolean).join('\n')

      const session = terminalManager.create({
        command: 'claude',
        args: ['-p', prompt, '--model', 'sonnet'],
        cwd: process.env.HOME || '/'
      })
      return session
    }
  )

  // Dooray Task Detail
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_TASK_DETAIL,
    (_, { projectId, taskId }: { projectId: string; taskId: string }) =>
      taskService.getTaskDetail(projectId, taskId)
  )

  // Task comments
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_TASK_COMMENTS,
    (_, { projectId, taskId }: { projectId: string; taskId: string }) =>
      taskService.getTaskComments(projectId, taskId)
  )

  // AI
  ipcMain.handle(IPC_CHANNELS.AI_AVAILABLE, () => aiService.isAvailable())
  ipcMain.handle(IPC_CHANNELS.AI_CHAT, async (_, req: AIChatRequest) => {
    const context = req.includeContext ? { tasks: cachedTasks } : undefined
    const chatSkills = skillStore.forTarget('chat')
    const skillContext = chatSkills.map((s) => s.content).join('\n\n---\n\n')
    const messageWithSkills = skillContext
      ? `${req.message}\n\n---\n[적용된 AI 스킬 규칙]\n${skillContext}`
      : req.message
    return aiService.chat(messageWithSkills, context)
  })
  ipcMain.handle(IPC_CHANNELS.AI_CHAT_RESET, () => {
    aiService.resetConversation()
    return true
  })
  ipcMain.handle(IPC_CHANNELS.AI_BRIEFING, async () => {
    try {
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const endOfWeek = new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000)

      // 병렬로 모든 데이터 수집
      const [tasks, ccTasks, dueTodayTasks, events] = await Promise.all([
        taskService.listMyTasks(),
        taskService.listMyCcTasks(),
        taskService.listDueTodayTasks(),
        calendarService.getEvents({ from: startOfDay.toISOString(), to: endOfWeek.toISOString() })
      ])
      cachedTasks = tasks

      // 브리핑 스킬 로드 (파일시스템)
      const briefingSkills = skillStore.forTarget('briefing')
      return aiService.generateBriefing(tasks, events, briefingSkills.map((s) => ({ name: s.name, content: s.content })), ccTasks, dueTodayTasks)
    } catch (err) {
      return {
        greeting: '브리핑을 생성할 수 없습니다.',
        urgent: [], focus: [], mentioned: [], stale: [], todayEvents: [],
        recommendations: [err instanceof Error ? err.message : '오류가 발생했습니다.']
      }
    }
  })
  ipcMain.handle(
    IPC_CHANNELS.AI_SUMMARIZE_TASK,
    async (_, { task, body }: { task: DoorayTask; body?: string }) =>
      aiService.summarizeTask(task, body)
  )
  ipcMain.handle(IPC_CHANNELS.AI_GENERATE_REPORT, async (_, { type }: { type: 'daily' | 'weekly' }) => {
    try {
      const tasks = cachedTasks.length > 0 ? cachedTasks : await taskService.listMyTasks()
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const endOfWeek = new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000)
      const events = await calendarService.getEvents({
        from: startOfDay.toISOString(),
        to: endOfWeek.toISOString()
      })
      return aiService.generateReport(type, tasks, events)
    } catch (err) {
      return { title: '오류', content: err instanceof Error ? err.message : '보고서 생성 실패', generatedAt: new Date().toISOString() }
    }
  })
  ipcMain.handle(
    IPC_CHANNELS.AI_GENERATE_WIKI,
    async (_, { taskSubject, taskBody, projectCode }: { taskSubject: string; taskBody?: string; projectCode?: string }) =>
      aiService.generateWikiDraft(taskSubject, taskBody, projectCode)
  )
  ipcMain.handle(
    IPC_CHANNELS.AI_GENERATE_MEETING_NOTE,
    async (_, { eventSubject, eventDescription, attendees }: { eventSubject: string; eventDescription?: string; attendees?: string[] }) =>
      aiService.generateMeetingNote(eventSubject, eventDescription, attendees)
  )

  // Settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_, key: string) => store.get(key))
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_, { key, value }: { key: string; value: unknown }) => {
    store.set(key, value)
  })
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_PROJECTS, () =>
    store.get('pinnedProjects', []) as string[]
  )
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_PROJECTS, (_, projectIds: string[]) => {
    store.set('pinnedProjects', projectIds)
  })

  // Clover Skills (파일시스템 기반 - ~/Library/Application Support/clover/skills/)
  ipcMain.handle(IPC_CHANNELS.CLOVER_SKILLS_LIST, () => skillStore.list())
  ipcMain.handle(IPC_CHANNELS.CLOVER_SKILLS_GET, (_, id: string) => skillStore.get(id))
  ipcMain.handle(IPC_CHANNELS.CLOVER_SKILLS_SAVE, (_, skill: Record<string, unknown>) =>
    skillStore.save(skill as import('../shared/types/skill').CloverSkill)
  )
  ipcMain.handle(IPC_CHANNELS.CLOVER_SKILLS_DELETE, (_, id: string) => skillStore.delete(id))
  ipcMain.handle(IPC_CHANNELS.CLOVER_SKILLS_FOR_TARGET, (_, target: string) => skillStore.forTarget(target))

  // Chat Store
  ipcMain.handle(IPC_CHANNELS.CHAT_SAVE, (_, { id, messages }: { id: string; messages: unknown[] }) => {
    const sessions = (store.get('chatSessions', {}) as Record<string, unknown>)
    sessions[id] = { messages, updatedAt: new Date().toISOString() }
    store.set('chatSessions', sessions)
  })
  ipcMain.handle(IPC_CHANNELS.CHAT_LIST, () => {
    const sessions = (store.get('chatSessions', {}) as Record<string, { messages: unknown[]; updatedAt: string }>)
    return Object.entries(sessions).map(([id, s]) => ({
      id, messageCount: s.messages.length, updatedAt: s.updatedAt,
      preview: (s.messages[s.messages.length - 1] as { content?: string })?.content?.substring(0, 50) || ''
    })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  })
  ipcMain.handle(IPC_CHANNELS.CHAT_LOAD, (_, id: string) => {
    const sessions = (store.get('chatSessions', {}) as Record<string, { messages: unknown[] }>)
    return sessions[id]?.messages || []
  })
  ipcMain.handle(IPC_CHANNELS.CHAT_DELETE, (_, id: string) => {
    const sessions = (store.get('chatSessions', {}) as Record<string, unknown>)
    delete sessions[id]
    store.set('chatSessions', sessions)
  })

  // Briefing Store
  ipcMain.handle(IPC_CHANNELS.BRIEFING_SAVE, (_, briefing: unknown) => {
    const list = (store.get('briefings', []) as unknown[])
    list.unshift({ ...briefing as Record<string, unknown>, savedAt: new Date().toISOString() })
    // 최대 30개 유지
    store.set('briefings', list.slice(0, 30))
  })
  ipcMain.handle(IPC_CHANNELS.BRIEFING_LIST, () => store.get('briefings', []))
  ipcMain.handle(IPC_CHANNELS.BRIEFING_DELETE, (_, index: number) => {
    const list = (store.get('briefings', []) as unknown[])
    list.splice(index, 1)
    store.set('briefings', list)
  })

  // AI Wiki
  ipcMain.handle(IPC_CHANNELS.AI_WIKI_PROOFREAD, async (_, { title, content }: { title: string; content: string }) =>
    aiService.wikiProofread(title, content)
  )
  ipcMain.handle(IPC_CHANNELS.AI_WIKI_IMPROVE, async (_, { title, content }: { title: string; content: string }) =>
    aiService.wikiImprove(title, content)
  )

  // AI Skill Generator
  ipcMain.handle(
    IPC_CHANNELS.AI_GENERATE_SKILL,
    async (_, { request, target }: { request: string; target: string }) =>
      aiService.generateSkill(request, target)
  )

  // Wiki domains
  ipcMain.handle(IPC_CHANNELS.DOORAY_WIKI_DOMAINS, () => wikiService.listDomains())

  // Claude Sessions
  ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSIONS_LIST, async () => {
    const { readdirSync, readFileSync, statSync } = require('fs')
    const { join } = require('path')
    const { homedir } = require('os')
    const base = join(homedir(), '.claude', 'projects')
    const sessions: Array<{ id: string; project: string; firstMsg: string; timestamp: string; lines: number }> = []

    try {
      for (const projDir of readdirSync(base)) {
        const projPath = join(base, projDir)
        try {
          const files = readdirSync(projPath).filter((f: string) => f.endsWith('.jsonl') && !f.includes('subagent'))
          for (const file of files) {
            const fp = join(projPath, file)
            try {
              const content = readFileSync(fp, 'utf-8')
              const lines = content.split('\n').filter((l: string) => l.trim())
              const sid = file.replace('.jsonl', '')
              const project = projDir.replace(/-/g, '/').replace(/^\/Users\/nhn\//, '~/').replace(/^\//, '')
              let firstMsg = '', timestamp = ''
              for (const line of lines.slice(0, 50)) {
                try {
                  const d = JSON.parse(line)
                  if (d.type === 'user' && !firstMsg) {
                    const msg = d.message || {}
                    let c = msg.content || ''
                    if (Array.isArray(c)) c = c.map((x: Record<string, string>) => x.text || '').join(' ')
                    firstMsg = String(c).replace(/<[^>]+>/g, '').replace(/\n/g, ' ').substring(0, 100).trim()
                    timestamp = d.timestamp || ''
                  }
                } catch {}
                if (firstMsg) break
              }
              if (firstMsg && !firstMsg.startsWith('Caveat:')) {
                sessions.push({ id: sid, project, firstMsg, timestamp, lines: lines.length })
              }
            } catch {}
          }
        } catch {}
      }
    } catch {}

    return sessions.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  })

  ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSIONS_DETAIL, async (_, sessionId: string) => {
    const { readdirSync, readFileSync } = require('fs')
    const { join } = require('path')
    const { homedir } = require('os')
    const base = join(homedir(), '.claude', 'projects')
    const messages: Array<{ role: string; content: string; timestamp: string }> = []

    for (const projDir of readdirSync(base)) {
      const fp = join(base, projDir, `${sessionId}.jsonl`)
      try {
        const content = readFileSync(fp, 'utf-8')
        for (const line of content.split('\n').filter((l: string) => l.trim())) {
          try {
            const d = JSON.parse(line)
            if (d.type === 'user' || d.type === 'assistant') {
              const msg = d.message || {}
              let c = msg.content || ''
              if (Array.isArray(c)) c = c.map((x: Record<string, string>) => x.text || '').join(' ')
              messages.push({ role: d.type, content: String(c).substring(0, 2000), timestamp: d.timestamp || '' })
            }
          } catch {}
        }
        break
      } catch {}
    }

    return messages
  })

  // Claude Insights (한국어 리포트)
  ipcMain.handle(IPC_CHANNELS.CLAUDE_INSIGHTS, async () => {
    const { readFileSync, existsSync, readdirSync } = require('fs')
    const { join } = require('path')
    const { homedir } = require('os')

    // facets에서 주요 파일만 읽기 (전체는 너무 큼)
    const facetsDir = join(homedir(), '.claude', 'usage-data', 'facets')
    let data = ''

    if (existsSync(facetsDir)) {
      const files = readdirSync(facetsDir).filter((f: string) => f.endsWith('.json'))
      // 최근 10개 세션만
      const recent = files.slice(0, 10)
      for (const file of recent) {
        try {
          const content = readFileSync(join(facetsDir, file), 'utf-8')
          const parsed = JSON.parse(content)
          // 핵심 정보만 추출
          data += JSON.stringify({
            id: parsed.sessionId?.substring(0, 8),
            project: parsed.projectPath,
            duration: parsed.durationMs,
            model: parsed.modelUsage,
            tools: parsed.toolUsageCounts,
            outcome: parsed.outcome,
            title: parsed.title || parsed.firstUserMessage?.substring(0, 80)
          }) + '\n'
        } catch {}
      }
    }

    if (!data) {
      const reportPath = join(homedir(), '.claude', 'usage-data', 'report.html')
      if (existsSync(reportPath)) {
        // HTML에서 텍스트만 추출 (태그 제거)
        const html = readFileSync(reportPath, 'utf-8')
        data = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 8000)
      }
    }

    if (!data) return '인사이트 데이터가 없습니다. 먼저 터미널에서 `/insights`를 실행해주세요.'

    try {
      const result = await aiService.chat(
        `다음은 Claude Code 최근 세션 데이터입니다. 한국어 인사이트 리포트를 작성해주세요.

포함:
1. **전체 요약** — 세션 수, 주요 통계
2. **주요 작업** — 어떤 작업을 했는지
3. **모델 사용 패턴** — 어떤 모델을 얼마나 썼는지
4. **비용 분석** — 어디에 비용이 많이 쓰였는지
5. **개선 추천** — 비용 절약, 효율 향상 팁

마크다운으로 보기 좋게.

${data}`
      )
      return result.content
    } catch (err) {
      return `인사이트 생성 오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`
    }
  })

  // Claude CLI Info (한국어 번역 포함)
  ipcMain.handle(IPC_CHANNELS.CLAUDE_CLI_INFO, async () => {
    const { execFile } = require('child_process')
    const run = (args: string[]): Promise<string> => new Promise((resolve) => {
      execFile('claude', args, { timeout: 5000, env: process.env }, (err: Error | null, stdout: string, stderr: string) => {
        resolve(stdout || stderr || (err?.message ?? ''))
      })
    })
    const [version, mainHelp, mcpHelp, authHelp, agentsHelp, pluginHelp] = await Promise.all([
      run(['--version']),
      run(['--help']),
      run(['mcp', '--help']),
      run(['auth', '--help']),
      run(['agents', '--help']),
      run(['plugin', '--help'])
    ])

    // AI 한국어 번역
    const translate = async (text: string, section: string): Promise<string> => {
      try {
        const result = await aiService.chat(
          `다음 Claude Code CLI "${section}" 도움말을 한국어로 번역해. 명령어/옵션명/코드는 원문 유지. 마크다운 테이블로 정리해서 보기 좋게.\n\n${text}`
        )
        return result.content
      } catch { return text }
    }

    const [mainKo, mcpKo, authKo, agentsKo, pluginKo] = await Promise.all([
      translate(mainHelp, '기본 사용법'),
      translate(mcpHelp, 'MCP 서버'),
      translate(authHelp, '인증'),
      translate(agentsHelp, '에이전트'),
      translate(pluginHelp, '플러그인')
    ])

    return {
      version: version.trim(),
      mainHelp: mainKo, mcpHelp: mcpKo, authHelp: authKo, agentsHelp: agentsKo, pluginHelp: pluginKo
    }
  })

  // Git Worktree (에러 시 메시지 정규화)
  const gitHandle = <T,>(channel: string, handler: (...args: unknown[]) => Promise<T>): void => {
    ipcMain.handle(channel, async (_, ...args: unknown[]) => {
      try {
        return await handler(...args)
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : String(err))
      }
    })
  }

  gitHandle(IPC_CHANNELS.GIT_IS_REPO, (path) =>
    gitService.isGitRepo(path as string)
  )
  gitHandle(IPC_CHANNELS.GIT_REPO_ROOT, (path) =>
    gitService.getRepoRoot(path as string)
  )
  gitHandle(IPC_CHANNELS.GIT_BRANCHES, (repoPath) =>
    gitService.listBranches(repoPath as string)
  )
  gitHandle(IPC_CHANNELS.GIT_WORKTREES, (repoPath) =>
    gitService.listWorktrees(repoPath as string)
  )
  gitHandle(IPC_CHANNELS.GIT_WORKTREE_CREATE, (params) =>
    gitService.createWorktree(params as GitWorktreeCreateParams)
  )
  gitHandle(IPC_CHANNELS.GIT_WORKTREE_REMOVE, (params) =>
    gitService.removeWorktree(params as GitWorktreeRemoveParams)
  )
  gitHandle(IPC_CHANNELS.GIT_WORKTREE_STATUS, (worktreePath) =>
    gitService.getWorktreeStatus(worktreePath as string)
  )
  gitHandle(IPC_CHANNELS.GIT_DIFF, (worktreePath) =>
    gitService.getDiff(worktreePath as string)
  )
  gitHandle(IPC_CHANNELS.GIT_COMPARE_BRANCHES, (args) => {
    const { repoPath, branch1, branch2 } = args as { repoPath: string; branch1: string; branch2: string }
    return gitService.compareBranches(repoPath, branch1, branch2)
  })
  gitHandle(IPC_CHANNELS.GIT_COMPARE_FILE, (args) => {
    const { repoPath, filePath, branch1, branch2 } = args as { repoPath: string; filePath: string; branch1: string; branch2: string }
    return gitService.compareFile(repoPath, filePath, branch1, branch2)
  })
  gitHandle(IPC_CHANNELS.GIT_PRUNE, (repoPath) =>
    gitService.pruneWorktrees(repoPath as string)
  )

  // Dialog
  ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_FOLDER, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '터미널 작업 폴더 선택'
    })
    return result.canceled ? null : result.filePaths[0]
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  configWatcher.start()
  createWindow()

  // 터미널 세션 30초마다 자동 저장
  setInterval(() => {
    try {
      const sessions = terminalManager.exportSessions()
      if (sessions.length > 0) store.set('terminalSessions', sessions)
    } catch {}
  }, 30000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 터미널 세션 저장 (앱 종료 전)
app.on('before-quit', () => {
  try {
    const sessions = terminalManager.exportSessions()
    store.set('terminalSessions', sessions)
  } catch {}
})

app.on('window-all-closed', () => {
  configWatcher.stop()
  terminalManager.dispose()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
