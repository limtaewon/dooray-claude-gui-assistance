# 도메인: MCP & Skills 관리

MCP(Model Context Protocol)와 Claude Code Skills의 활성/비활성 토글은 "갈라치기" 메커니즘으로 작동합니다.

## 핵심 개념: 갈라치기 (Split-on-Disable)

Claude Code는 `~/.claude/mcp.json` 및 `~/.claude/skills/` 디렉토리를 직접 읽습니다. 활성/비활성을 GUI에서 토글할 때:

```
활성 상태:
  ~/.claude/mcp.json
  {
    "mcpServers": {
      "my-server": { ... }
    }
  }

비활성 상태:
  ~/.claude/mcp.json
  {
    "_claudayDisabledMcp": {
      "my-server": { ... }
    }
  }

→ Claude Code가 보는 mcpServers는 비어있음
```

**규칙**:
- 활성: `mcpServers` 키에 존재
- 비활성: `_claudayDisabledMcp` 키로 이동 (hidden)

## 진입점

| 파일 | 역할 |
|-----|------|
| `src/main/config/McpConfigManager.ts` | `~/.claude/mcp.json` 관리 |
| `src/main/config/SkillsManager.ts` | `~/.claude/skills/` 감시 |
| `src/main/config/ConfigWatcher.ts` | chokidar로 파일 변경 감시 |

## McpConfigManager

```typescript
export class McpConfigManager {
  private configPath = join(homedir(), '.claude', 'mcp.json')
  
  private getConfig(): MissingConfig {
    if (!existsSync(this.configPath)) {
      return { mcpServers: {} }
    }
    return JSON.parse(readFileSync(this.configPath, 'utf-8'))
  }

  async list(): Promise<Record<string, McpServerConfig>> {
    return this.getConfig().mcpServers || {}
  }

  async add(name: string, config: McpServerConfig): Promise<void> {
    const current = this.getConfig()
    current.mcpServers = current.mcpServers || {}
    current.mcpServers[name] = config
    this.writeConfig(current)
  }

  async setActive(name: string, active: boolean): Promise<void> {
    const current = this.getConfig()
    const disabled = (current._claudayDisabledMcp = current._claudayDisabledMcp || {})
    const servers = (current.mcpServers = current.mcpServers || {})
    
    if (active) {
      // 비활성 → 활성
      if (disabled[name]) {
        servers[name] = disabled[name]
        delete disabled[name]
      }
    } else {
      // 활성 → 비활성
      if (servers[name]) {
        disabled[name] = servers[name]
        delete servers[name]
      }
    }
    
    this.writeConfig(current)
  }

  private writeConfig(config: any): void {
    mkdirSync(dirname(this.configPath), { recursive: true })
    writeFileSync(this.configPath, JSON.stringify(config, null, 2))
  }
}
```

## SkillsManager

Skills는 마크다운 파일 모음입니다.

```typescript
export class SkillsManager {
  private skillsDir = join(homedir(), '.claude', 'skills')
  
  async list(): Promise<Skill[]> {
    if (!existsSync(this.skillsDir)) {
      return []
    }
    
    const files = await glob(join(this.skillsDir, '**/*.md'))
    return files.map(file => {
      const filename = relative(this.skillsDir, file)
      const content = readFileSync(file, 'utf-8')
      const name = basename(file, '.md')
      
      return {
        filename,
        name,
        description: this.extractDescription(content)
      }
    })
  }

  async save(req: SkillSaveRequest): Promise<void> {
    const path = join(this.skillsDir, req.filename)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, req.content)
  }

  async delete(filename: string): Promise<void> {
    const path = join(this.skillsDir, filename)
    if (existsSync(path)) {
      unlinkSync(path)
    }
  }

  private extractDescription(content: string): string {
    // 첫 줄 또는 H1 제목 추출
    const match = content.match(/^#\s+(.+)/) || content.match(/^(.+)/)
    return match?.[1] ?? '(설명 없음)'
  }
}
```

## ConfigWatcher

파일 시스템 변경을 감시하고 Renderer에 전파합니다.

```typescript
export class ConfigWatcher {
  private watcher: chokidar.FSWatcher | null = null
  private mainWindow: BrowserWindow | null = null

  start(): void {
    const paths = [
      join(homedir(), '.claude', 'mcp.json'),
      join(homedir(), '.claude', 'skills'),
      join(homedir(), '.claude', 'projects')
    ]

    this.watcher = chokidar.watch(paths, {
      persistent: true,
      ignoreInitial: true
    })

    this.watcher.on('change', (path) => {
      console.log('[ConfigWatcher] 변경됨:', path)
      
      // Renderer에 알림
      this.mainWindow?.webContents.send(IPC_CHANNELS.CONFIG_CHANGED, {
        event: 'change',
        path
      })
    })
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }
}
```

## IPC 핸들러

```typescript
// MCP
ipcMain.handle(IPC_CHANNELS.MCP_LIST, async () => {
  return mcpConfigManager.list()
})

ipcMain.handle(IPC_CHANNELS.MCP_ADD, async (_, { name, config }) => {
  await mcpConfigManager.add(name, config)
  configWatcher.triggerReload()  // Renderer 갱신
})

ipcMain.handle(IPC_CHANNELS.MCP_UPDATE, async (_, { name, config }) => {
  await mcpConfigManager.update(name, config)
  configWatcher.triggerReload()
})

ipcMain.handle(IPC_CHANNELS.MCP_DELETE, async (_, name) => {
  await mcpConfigManager.delete(name)
  configWatcher.triggerReload()
})

// Skills
ipcMain.handle(IPC_CHANNELS.SKILLS_LIST, async () => {
  return skillsManager.list()
})

ipcMain.handle(IPC_CHANNELS.SKILLS_SAVE, async (_, req) => {
  await skillsManager.save(req)
  configWatcher.triggerReload()
})

ipcMain.handle(IPC_CHANNELS.SKILLS_DELETE, async (_, filename) => {
  await skillsManager.delete(filename)
  configWatcher.triggerReload()
})

ipcMain.handle(IPC_CHANNELS.SKILLS_IMPORT, async () => {
  // 사용자 파일 선택 → import
  const { filePaths } = await dialog.showOpenDialog({
    filters: [{ name: 'Markdown', extensions: ['md'] }],
    properties: ['openFile', 'multiSelections']
  })
  
  for (const file of filePaths) {
    const content = readFileSync(file, 'utf-8')
    const filename = basename(file)
    await skillsManager.save({ filename, content })
  }
  
  configWatcher.triggerReload()
  return { imported: filePaths.length }
})
```

## Renderer: MCP & Skills UI

### MCP 관리

```typescript
// McpPanel.tsx
export function McpPanel() {
  const [servers, setServers] = useState<Record<string, McpServerConfig>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadServers()
    
    // 파일 변경 감지
    const unsub = window.api.onConfigChanged(({ path }) => {
      if (path.includes('mcp.json')) {
        loadServers()
      }
    })
    return unsub
  }, [])

  const loadServers = async () => {
    const list = await window.api.mcp.list()
    setServers(list)
  }

  const toggleActive = async (name: string) => {
    // 비활성 → 활성 (또는 그 반대)
    // UI에서는 전부 활성으로 보임
    // 실제로는 갈라치기로 ~/_claudayDisabledMcp 이동
  }

  const handleDelete = async (names: string[]) => {
    for (const name of names) {
      await window.api.mcp.delete(name)
    }
  }

  return (
    <div>
      <h2>MCP 서버</h2>
      <button onClick={addNew}>+ 추가</button>
      
      {Object.entries(servers).map(([name, config]) => (
        <ServerCard
          key={name}
          name={name}
          config={config}
          selected={selected.has(name)}
          onSelect={() => {/* toggle */ }}
          onEdit={() => editServer(name)}
          onDelete={() => handleDelete([name])}
        />
      ))}
    </div>
  )
}
```

### Skills 관리

```typescript
// SkillsPanel.tsx
export function SkillsPanel() {
  const [skills, setSkills] = useState<Skill[]>([])

  useEffect(() => {
    loadSkills()
    
    const unsub = window.api.onConfigChanged(() => {
      loadSkills()
    })
    return unsub
  }, [])

  const loadSkills = async () => {
    const list = await window.api.skills.list()
    setSkills(list)
  }

  const handleNew = async () => {
    const name = prompt('스킬 이름')
    if (!name) return
    
    const content = `# ${name}\n\n설명을 입력하세요.`
    await window.api.skills.save({
      filename: `${name}.md`,
      content
    })
  }

  return (
    <div>
      <h2>스킬</h2>
      <button onClick={handleNew}>+ 새로 만들기</button>
      
      {skills.map(skill => (
        <SkillCard
          key={skill.filename}
          skill={skill}
          onEdit={() => editSkill(skill.filename)}
          onDelete={() => window.api.skills.delete(skill.filename)}
        />
      ))}
    </div>
  )
}
```

## 위키 저장소 (공유)

MCP와 Skills를 두레이 위키에 공유할 수 있습니다.

```typescript
// WikiStorageService (src/main/dooray/WikiStorageService.ts)
export class WikiStorageService {
  /**
   * MCP/스킬을 위키에 업로드.
   * 컨테이너 자동 생성: 위키 root 하위에 "Clauday MCPs" / "Clauday Skills"
   */
  async upload(req: {
    wikiId: string
    kind: 'mcps' | 'skills'
    name: string
    content: string
  }): Promise<{ pageId: string }> {
    // 1) 컨테이너 페이지 확보
    const containerId = await this.ensureContainer(req.wikiId, req.kind)
    
    // 2) 페이지 생성/수정
    const pageId = await wikiService.createOrUpdate({
      wikiId: req.wikiId,
      parentPageId: containerId,
      title: req.name,
      content: req.content
    })
    
    return { pageId }
  }
}

// Renderer에서
const result = await window.api.dooray.wiki.storageUpload({
  wikiId: 'wiki-123',
  kind: 'mcps',
  name: 'My MCP Server',
  content: JSON.stringify(mcpConfig, null, 2)
})
```

## 다중 import/export

여러 파일을 한 번에 처리합니다.

```typescript
// 다중 import
const { imported } = await window.api.skills.importFromFiles()
// 사용자가 여러 .md 파일 선택 → 전부 저장

// 다중 export
const { exported, folder } = await window.api.skills.exportToFolder(['skill1.md', 'skill2.md'])
// 선택된 스킬들을 폴더로 내보내기
```

## 제약사항

1. **활성/비활성 토글**: 실제로는 CLI 재시작 필요 (현재는 UI만 갱신)
2. **충돌 처리**: 같은 이름의 MCP/스킬이 있을 때 물어봄
3. **권한**: 위키 공유 시 본인 작성 페이지만 삭제 가능

## 참고

- [Claude MCP 공식 가이드](https://modelcontextprotocol.io/)
- [Claude Code Skills](https://docs.anthropic.com/claude/reference/claude-code)
