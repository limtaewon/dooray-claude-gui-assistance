/**
 * `~/.claude/projects` 실측 채집표 (mac, 2026-07-30, claude 2.1.220).
 * 출처: feature/windows-compat/v2-utils/adr.md §2. 손으로 재계산하지 말고 표를 그대로 옮긴 것 —
 * 테스트가 구현을 복제하지 않고 실측을 검증하도록 하는 것이 이 트랙의 요점.
 */
export interface ClaudeProjectDirFixture {
  cwd: string
  dir: string
  /** 이 케이스가 증명하는 것 (adr.md 원문) */
  note: string
}

export const MEASURED_CLAUDE_PROJECT_DIRS: ClaudeProjectDirFixture[] = [
  { cwd: '/', dir: '-', note: '루트' },
  { cwd: '/Users/nhn', dir: '-Users-nhn', note: '기본형' },
  { cwd: '/Users/nhn/Downloads', dir: '-Users-nhn-Downloads', note: '기본형' },
  {
    cwd: '/Users/nhn/Desktop/발표',
    dir: '-Users-nhn-Desktop---',
    note: '한글 1자 = 대시 1개 → NFC 확정 (NFD 면 대시 6개)'
  },
  { cwd: '/Users/nhn/.claude', dir: '-Users-nhn--claude', note: '. 도 대시 → /→- 규칙 반증' },
  { cwd: '/Users/nhn/Desktop/2NEON', dir: '-Users-nhn-Desktop-2NEON', note: '숫자·대문자 보존 (소문자화 없음)' },
  { cwd: '/Users/nhn/Desktop/2NEON/backend', dir: '-Users-nhn-Desktop-2NEON-backend', note: '중첩' },
  {
    cwd: '/Users/nhn/Desktop/2NEON/backend/src/main',
    dir: '-Users-nhn-Desktop-2NEON-backend-src-main',
    note: '깊은 중첩'
  },
  {
    cwd: '/Users/nhn/Desktop/dooray-mcp',
    dir: '-Users-nhn-Desktop-dooray-mcp',
    note: '경로 내 대시는 대시로 남음 → 역치환 불가 증명'
  },
  { cwd: '/Users/nhn/Desktop/mcp-clickhouse', dir: '-Users-nhn-Desktop-mcp-clickhouse', note: '동일' },
  { cwd: '/Users/nhn/Desktop/hi-five', dir: '-Users-nhn-Desktop-hi-five', note: '동일' },
  { cwd: '/Users/nhn/mcp-servers', dir: '-Users-nhn-mcp-servers', note: '동일' }
]

/**
 * 실측 아닌 경계 케이스 (plan.md §1-3). win32/UNC/이모지는 소스 근거(adr.md §3)로 유추한 값이고
 * claude 실행으로 검증되지 않았음을 각 케이스 note 에 명시한다.
 */
export interface BoundaryFixture {
  cwd: string
  dir: string
  note: string
}

export const BOUNDARY_CLAUDE_PROJECT_DIRS: BoundaryFixture[] = [
  { cwd: '', dir: '', note: '빈 문자열' },
  { cwd: 'C:\\Users\\me\\proj', dir: 'C--Users-me-proj', note: 'win32 — 미검증, 소스 규칙 적용값' },
  { cwd: '\\\\server\\share\\p', dir: '--server-share-p', note: 'win32 UNC — 미검증' },
  { cwd: '/Users/me/My Docs', dir: '-Users-me-My-Docs', note: '공백 포함 — 미검증' },
  {
    cwd: '/Users/me/\uD83D\uDE00',
    dir: '-Users-me---',
    note: '이모지(비BMP, surrogate pair 2 UTF-16 코드유닛 = 대시 2개 예상) — 미검증'
  }
]
