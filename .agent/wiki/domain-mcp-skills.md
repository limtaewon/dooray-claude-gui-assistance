# Domain — MCP / Skills

> Claude Code 의 MCP 서버와 스킬을 Clauday UI 에서 관리. 핵심 트릭은 *비활성화 = 다른 키로 이동*.

## 핵심 파일

- `src/main/config/McpConfigManager.ts` — `~/.claude.json` 의 `mcpServers` 와 `_claudayDisabledMcp` 사이를 갈라치기.
- `src/main/config/SkillsManager.ts` — `~/.claude/skills/<name>/SKILL.md` CRUD + 다중 import/export.
- `src/main/config/ConfigWatcher.ts` — chokidar 로 `~/.claude/settings.json`, `~/.claude/commands`, `~/.claude/skills` 감시 → renderer 에 `CONFIG_CHANGED` push.
- `src/main/skills/` — Clauday Skills (target 별) + Shared Skills (Dooray 위키 기반 공유소).

## MCP 활성/비활성 트릭

Claude Code 는 `~/.claude.json` 의 `mcpServers` 아래 *모든* MCP 를 무조건 띄움. `disabled: true` 같은 필드는 무시.

→ 진짜 비활성화하려면 **키 자체를 `mcpServers` 밖으로** 옮긴다.

```jsonc
{
  "mcpServers": {
    "active-server": { "command": "...", "args": [...] }
  },
  "_claudayDisabledMcp": {
    "off-server": { "command": "...", "args": [...] }
  }
}
```

- UI 의 `list()` 는 둘을 *병합* 해서 반환 (`enabled: true/false` 필드로 구분)
- 활성화 토글 → `_claudayDisabledMcp` ↔ `mcpServers` 사이 키 이동

## Skills 저장 위치

- 기본: `~/.claude/skills/<name>/SKILL.md`
- 다중 import: 사용자가 폴더 선택 → 그 안의 `.md` 들을 일괄 저장
- 다중 export: 사용자가 폴더 선택 → 지정 스킬들을 그 폴더에 .md 로 내보냄
- Clauday Skills (target 별, 예: `briefing`, `wiki`, `task`, `messenger`) — `src/main/skills/` 가 별도 관리. AI 호출 시 target 매칭으로 system prompt 에 주입.
- Shared Skills — 두레이 *공개 프로젝트* 위키 페이지를 컨테이너로 사용. 업로드/다운로드/삭제.

## ConfigWatcher

- 사용자가 클라우드 동기화/외부 도구로 `~/.claude/...` 를 바꿔도 즉시 UI 반영
- watch 대상: `settings.json`, `commands/`, `skills/`
- debounce 100ms

## 함정

- **Claude Code 가 켜져 있는 동안 mcpServers 키 추가**: 보통 다음 claude 호출에 적용. 즉시 반영은 보장 X. UI 가 "재시작 권장" 토스트 띄움.
- **SKILL.md 파일명 vs 디렉터리명**: claude 는 *디렉터리명* 을 스킬 이름으로 인식. `<name>/SKILL.md` 구조 강제.
- **공유소 (Shared Skills) 권한**: 두레이 공개 프로젝트 위키 접근 권한 = 두레이 토큰의 스코프. 권한 없는 위키 페이지에 업로드 실패 가능 — 사용자에게 명확한 에러.

## 갱신 정책

- `_claudayDisabledMcp` 키 명 변경 / 새 비활성 메커니즘 등장 시 본 문서 갱신
- ConfigWatcher 감시 대상 변경 시 본 문서 갱신
