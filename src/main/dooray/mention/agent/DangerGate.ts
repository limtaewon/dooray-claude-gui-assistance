/**
 * 두레이 승인을 받을 "위험 동작" 판정 (기획 §5.1, 2026-10-13 사용자 결정 D11).
 * 기본은 권한 확인 없이 실행하고, 여기 걸리는 것만 PreToolUse 에서 멈춰 두레이 답장을 기다린다.
 * 대상: git push·강제 리셋·PR 머지 / rm -r / DB 쓰기·Drop 게시 / 두레이 쓰기.
 */

export type DangerCategory = 'git' | 'delete' | 'db' | 'drop' | 'dooray'

export interface DangerMatch {
  category: DangerCategory
  /** 카드 제목에 쓰는 사람 말 */
  label: string
  /**
   * "항상 승인" 의 기억 단위 — 같은 서명이면 다시 묻지 않는다.
   * Bash 는 명령 단위(git push 를 허용해도 rm -rf 는 다시 묻는다), MCP 쓰기는 서버·분류 단위(여러 단계가 한 작업이라)
   */
  signature: string
}

const LABELS: Record<DangerCategory, string> = {
  git: '원격 저장소 변경',
  delete: '파일·폴더 삭제',
  db: 'DB 쓰기',
  drop: 'Drop 게시',
  dooray: '두레이 쓰기'
}

/** 도구 호출이 위험 목록에 걸리면 판정을, 아니면 null. */
export function classifyDanger(toolName: string, input: Record<string, unknown>): DangerMatch | null {
  if (toolName === 'Bash') {
    const command = typeof input.command === 'string' ? input.command : ''
    const hit = classifyShell(command, 0)
    return hit ? { category: hit.category, label: LABELS[hit.category], signature: `Bash:${hit.segment}` } : null
  }
  const mcp = /^mcp__(.+?)__(.+)$/.exec(toolName)
  if (!mcp) return null
  const server = mcp[1].toLowerCase()
  const op = mcp[2].toLowerCase()
  const category = classifyMcp(server, op, input)
  if (!category) return null
  // 삭제 계열은 따로 기억한다 — 게시·작성을 "항상 승인" 해도 삭제는 다시 묻는다
  const destructive = /(^|_)(delete|remove|drop|truncate)(_|$)/.test(op.replace(/^drop_/, ''))
  return { category, label: LABELS[category], signature: destructive ? `mcp:${server}:${category}:${op}` : `mcp:${server}:${category}` }
}

function classifyShell(command: string, depth: number): { category: DangerCategory; segment: string } | null {
  // $(…) · `…` 명령 치환 안의 명령도 실행된다 — 꺼내서 함께 본다
  if (depth < 3) {
    for (const m of command.matchAll(/\$\(([^()]*)\)|`([^`]*)`/g)) {
      const hit = classifyShell(m[1] ?? m[2] ?? '', depth + 1)
      if (hit) return hit
    }
  }
  for (const segment of splitShellSegments(command)) {
    // bash -c "…" / sh -c '…' 는 안쪽 명령으로 다시 판정한다
    const inner = /^(?:ba|z|k|da)?sh\s+(?:-\w+\s+)*-\w*c\s+(["'])([\s\S]*)\1\s*$/.exec(segment) ?? /^eval\s+(["'])([\s\S]*)\1\s*$/.exec(segment)
    if (inner && depth < 3) {
      const hit = classifyShell(inner[2], depth + 1)
      if (hit) return hit
      continue
    }
    const category = classifyShellSegment(segment)
    if (category) return { category, segment }
  }
  return null
}

/**
 * `a && b; c | d` → 각 명령. 따옴표 안의 구분자는 무시한다.
 * 앞의 괄호·환경변수 대입·래퍼(sudo·env·command·exec·nohup·time)·`\` 별칭 우회·실행 파일 경로는 벗긴다.
 */
export function splitShellSegments(command: string): string[] {
  const parts: string[] = []
  let cur = ''
  let quote: '"' | "'" | null = null
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (quote) {
      if (ch === quote) quote = null
      else if (ch === '\\' && quote === '"' && i + 1 < command.length) { cur += ch + command[++i]; continue }
      cur += ch
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue }
    if (ch === '\\' && i + 1 < command.length && command[i + 1] !== '\n') { cur += ch + command[++i]; continue }
    const two = command.slice(i, i + 2)
    if (two === '&&' || two === '||') { parts.push(cur); cur = ''; i++; continue }
    // `2>&1` · `&>` 같은 리다이렉트의 & 는 구분자가 아니다
    const redirect = ch === '&' && (command[i - 1] === '>' || command[i - 1] === '<' || command[i + 1] === '>')
    if (ch === ';' || ch === '|' || ch === '\n' || (ch === '&' && !redirect)) { parts.push(cur); cur = ''; continue }
    cur += ch
  }
  parts.push(cur)
  return parts.map(normalizeSegment).filter(Boolean)
}

const WRAPPERS = /^(?:sudo(?:\s+-[uUgCh]\s+\S+|\s+-\S+)*|env(?:\s+-\S+)*|command|exec|nohup|time|timeout(?:\s+-\S+)*\s+\S+|nice(?:\s+-n\s*\S+)?)\s+/

function normalizeSegment(raw: string): string {
  let s = raw.trim().replace(/^[({]+\s*/, '').replace(/\s*[)}]+$/, '').trim()
  for (let guard = 0; guard < 6; guard++) {
    const before = s
    s = s.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+)+/, '').replace(WRAPPERS, '').trim()
    if (s === before) break
  }
  // \rm (별칭 우회) · /bin/rm (경로) → rm
  return s.replace(/^\\/, '').replace(/^(?:\S*\/)([^\s/]+)/, '$1')
}

const RECURSIVE_FLAG = /(?:^|\s)(?:-[A-Za-z]*[rR][A-Za-z]*|--recursive)(?=\s|$)/

function isRecursiveRm(seg: string): boolean {
  return /^rm\s/.test(seg) && RECURSIVE_FLAG.test(seg)
}

function classifyShellSegment(seg: string): DangerCategory | null {
  if (/^git\s+(?:-C\s+\S+\s+)?push\b/.test(seg)) return 'git'
  if (/^git\s+(?:-C\s+\S+\s+)?reset\s+.*--hard\b/.test(seg)) return 'git'
  if (/^gh\s+pr\s+merge\b/.test(seg)) return 'git'
  if (isRecursiveRm(seg)) return 'delete'
  // xargs rm -rf · find … -delete · find … -exec rm -r {} +
  const xargs = /^xargs(?:\s+-\S+(?:\s+\d+)?)*\s+(.+)$/.exec(seg)
  if (xargs) return classifyShellSegment(normalizeSegment(xargs[1]))
  if (/^find\s/.test(seg)) {
    if (/\s-delete(?=\s|$)/.test(seg)) return 'delete'
    const exec = /\s-exec(?:dir)?\s+(.+?)(?:\s+(?:\;|';'|\+))?\s*$/.exec(seg)
    if (exec && isRecursiveRm(normalizeSegment(exec[1]))) return 'delete'
  }
  return null
}

const DOORAY_WRITE_OP = /^(create|modify|update|delete|send|set|upload|move|add|join|leave)_/
// execute_select·execute_query 같은 조회 실행만 빼고 execute_* 는 쓰기로 본다(execute_ddl 등)
const DB_WRITE_OP = /^(?:execute_(?!select|query)\w+|(?:insert|update|delete|drop|truncate|alter)(?:_|$))/
// 실제로 공개·삭제가 일어나는 단계만 — 프로젝트 생성(restricted)·업로드 예약(begin)은 아직 아무것도 공개하지 않는다
const DROP_WRITE_OP = /^drop_(publish|upload|upload_finish|commit_upload|delete_file)$/

const SQL_WRITE = /^\s*(?:with\b[\s\S]*?\)\s*)?(insert|update|delete|replace|merge|drop|truncate|alter|create|rename|grant|revoke)\b/i

function classifyMcp(server: string, op: string, input: Record<string, unknown> = {}): DangerCategory | null {
  if (server.includes('dooray')) return DOORAY_WRITE_OP.test(op) ? 'dooray' : null
  if (server === 'drop' || server.startsWith('drop')) return DROP_WRITE_OP.test(op) ? 'drop' : null
  if (/mysql|clickhouse|postgres|neon|(^|[-_])db([-_]|$)/.test(server)) {
    if (DB_WRITE_OP.test(op)) return 'db'
    // run_sql·run_query 처럼 임의 SQL 을 받는 도구는 본문을 본다
    const sql = ['query', 'sql', 'statement'].map((k) => input[k]).find((v): v is string => typeof v === 'string')
    return sql && sql.split(';').some((stmt) => SQL_WRITE.test(stmt)) ? 'db' : null
  }
  return null
}
