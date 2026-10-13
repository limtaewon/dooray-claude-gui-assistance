import { describe, it, expect } from 'vitest'
import { classifyDanger, splitShellSegments } from './DangerGate'

const bash = (command: string) => classifyDanger('Bash', { command })

describe('splitShellSegments', () => {
  it('&& || ; | 줄바꿈으로 명령을 나눈다', () => {
    expect(splitShellSegments('a && b || c; d | e\nf')).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('앞의 환경변수 대입(여러 개)과 sudo 를 벗긴다', () => {
    expect(splitShellSegments('FOO=1 BAR=2 git push')).toEqual(['git push'])
    expect(splitShellSegments('sudo rm -rf /x')).toEqual(['rm -rf /x'])
    expect(splitShellSegments('  FOO=a sudo rm x ')).toEqual(['rm x'])
  })

  it('괄호·중괄호를 벗긴다 (닫는 쪽 포함)', () => {
    expect(splitShellSegments('{ git push; }')).toEqual(['git push'])
    expect(splitShellSegments('( git push')).toEqual(['git push'])
  })

  it('빈 세그먼트는 버린다', () => {
    expect(splitShellSegments('  ;; && ')).toEqual([])
    expect(splitShellSegments('')).toEqual([])
  })
})

describe('classifyDanger — Bash 위험', () => {
  it.each([
    ['git push', 'git'],
    ['git push origin main', 'git'],
    ['git push --force origin main', 'git'],
    ['git -C /repo push', 'git'],
    ['git reset --hard', 'git'],
    ['git reset --hard HEAD~3', 'git'],
    ['git reset HEAD~1 --hard', 'git'],
    ['gh pr merge 12', 'git'],
    ['gh pr merge --squash', 'git'],
    ['rm -r dir', 'delete'],
    ['rm -rf dir', 'delete'],
    ['rm -fr dir', 'delete'],
    ['rm -Rf dir', 'delete'],
    ['rm --recursive dir', 'delete'],
    ['rm file -r', 'delete'],
    ['rm -v -r dir', 'delete']
  ])('위험: %s → %s', (cmd, category) => {
    expect(bash(cmd)?.category).toBe(category)
  })

  it.each([
    'git status',
    'git diff',
    'git log --oneline',
    'git commit -m "msg"',
    'git pull',
    'git fetch',
    'git stash push',
    'git reset --soft HEAD~1',
    'git reset HEAD file.ts',
    'gh pr view 12',
    'gh pr list',
    'rm file',
    'rm -i file',
    'rm -f file',
    'rm a b c',
    'npm run push',
    'npm run reset --hard',
    'echo git push',
    'echo "git push"',
    "git add . && git commit -m 'git push later'",
    'ls -la',
    'cat package.json',
    'git pushall',
    '',
    '   '
  ])('위험 아님: %s', (cmd) => {
    expect(bash(cmd)).toBeNull()
  })

  it('환경변수 접두 / sudo / 연결 명령 속의 위험도 잡는다', () => {
    expect(bash('FOO=1 git push')?.category).toBe('git')
    expect(bash('FOO=1 BAR=2 git push')?.category).toBe('git')
    expect(bash('sudo rm -rf /x')?.category).toBe('delete')
    expect(bash('sudo git push')?.category).toBe('git')
    expect(bash('cd x && git push')?.category).toBe('git')
    expect(bash('cd x; rm -rf y')?.category).toBe('delete')
    expect(bash('ls | git push')?.category).toBe('git')
    expect(bash('git status\ngit push')?.category).toBe('git')
    expect(bash('npm test || git push')?.category).toBe('git')
    expect(bash('git commit -m "a;b" && git push')?.category).toBe('git')
  })

  it('앞 세그먼트가 안전해도 뒤가 위험하면 위험, 서명은 위험한 세그먼트', () => {
    const m = bash('cd /repo && git status && git push origin main')!
    expect(m.category).toBe('git')
    expect(m.signature).toBe('Bash:git push origin main')
  })

  it('여러 위험이 섞이면 먼저 나온 것의 분류를 쓴다', () => {
    expect(bash('rm -rf a && git push')?.category).toBe('delete')
  })

  it('command 가 없거나 문자열이 아니면 null', () => {
    expect(classifyDanger('Bash', {})).toBeNull()
    expect(classifyDanger('Bash', { command: 5 })).toBeNull()
  })

  it('라벨', () => {
    expect(bash('git push')?.label).toBe('원격 저장소 변경')
    expect(bash('rm -rf x')?.label).toBe('파일·폴더 삭제')
  })

  it('서명은 공백이 정리된 세그먼트 기준 — 환경변수·sudo 접두와 무관', () => {
    expect(bash('git push')?.signature).toBe('Bash:git push')
    expect(bash('FOO=1 git push')?.signature).toBe('Bash:git push')
    expect(bash('sudo git push')?.signature).toBe('Bash:git push')
    expect(bash('  git push  ')?.signature).toBe('Bash:git push')
  })

  it('인자가 다르면 서명이 다르다', () => {
    expect(bash('git push origin a')?.signature).not.toBe(bash('git push origin b')?.signature)
  })

  // 우회: 현재 분해는 래퍼 명령을 해석하지 못해 아래가 모두 통과(null)한다.
  it.each([
    ['/bin/rm -rf x', 'delete'],
    ['\\rm -rf x', 'delete'],
    ['env FOO=1 git push', 'git'],
    ['env -i git push origin main', 'git'],
    ['command git push', 'git'],
    ['nohup git push &', 'git'],
    ['bash -c "git push"', 'git'],
    ["sh -c 'cd x && rm -rf build'", 'delete'],
    ['ls | xargs rm -rf', 'delete'],
    ['find . -exec rm -rf {} +', 'delete'],
    ['find . -name "*.tmp" -delete', 'delete']
  ])('래퍼·우회도 위험으로 본다: %s', (command, category) => {
    expect(classifyDanger('Bash', { command })?.category).toBe(category)
  })

  it.each(['echo "a; git push"', "echo 'rm -rf /' > note.txt", 'find . -name x -print', 'ls 2>&1 | head', 'bash -c "git status"'])(
    '따옴표 안·안전한 명령은 위험이 아니다: %s',
    (command) => {
      expect(classifyDanger('Bash', { command })).toBeNull()
    }
  )

  it('괄호 서브셸 "(git push)" 는 "git push" 와 같은 서명 — 항상 승인이 맞물린다', () => {
    expect(classifyDanger('Bash', { command: '(git push)' })?.signature).toBe(classifyDanger('Bash', { command: 'git push' })?.signature)
  })
})

describe('classifyDanger — MCP', () => {
  it.each([
    'mcp__dooray-mcp__create_task',
    'mcp__dooray-mcp__modify_task',
    'mcp__dooray-mcp__send_message_to_channel',
    'mcp__dooray-mcp__set_task_done',
    'mcp__dooray-mcp__delete_file_from_drive',
    'mcp__dooray-mcp__upload_content_as_file_to_task',
    'mcp__dooray-mcp__move_task',
    'mcp__dooray-mcp__add_project_member',
    'mcp__dooray-mcp__join_channel',
    'mcp__dooray-mcp__leave_channel',
    'mcp__mcp-dooray__create_wiki'
  ])('두레이 쓰기: %s', (tool) => {
    const m = classifyDanger(tool, {})
    expect(m?.category).toBe('dooray')
    expect(m?.label).toBe('두레이 쓰기')
    expect(m?.signature).toBe(tool)
  })

  it.each([
    'mcp__dooray-mcp__get_task',
    'mcp__dooray-mcp__list_projects',
    'mcp__dooray-mcp__search_tasks',
    'mcp__dooray-mcp__get_wiki_page',
    'mcp__dooray-mcp__read_messages'
  ])('두레이 조회는 위험 아님: %s', (tool) => {
    expect(classifyDanger(tool, {})).toBeNull()
  })

  it.each([
    'mcp__drop__drop_publish',
    'mcp__drop__drop_upload',
    'mcp__drop__drop_upload_begin',
    'mcp__drop__drop_upload_finish',
    'mcp__drop__drop_commit_upload',
    'mcp__drop__drop_delete_file',
    'mcp__drop__drop_create_project'
  ])('Drop 게시: %s', (tool) => {
    expect(classifyDanger(tool, {})?.category).toBe('drop')
  })

  it.each(['mcp__drop__drop_list_projects', 'mcp__drop__drop_list_files', 'mcp__drop__drop_cancel_upload'])('Drop 조회/취소는 위험 아님: %s', (tool) => {
    expect(classifyDanger(tool, {})).toBeNull()
  })

  it.each([
    'mcp__mysql-nfi__execute_insert',
    'mcp__mysql-nfi__execute_update',
    'mcp__mysql-nfi__execute_delete',
    'mcp__clickhouse__insert_rows',
    'mcp__postgres__drop_table',
    'mcp__postgres__truncate_table',
    'mcp__postgres__alter_table',
    'mcp__neon__delete_project',
    'mcp__my-db__update_row'
  ])('DB 쓰기: %s', (tool) => {
    const m = classifyDanger(tool, {})
    expect(m?.category).toBe('db')
    expect(m?.label).toBe('DB 쓰기')
  })

  it.each([
    'mcp__mysql-nfi__execute_select',
    'mcp__mysql-nfi__describe_table',
    'mcp__mysql-nfi__list_tables',
    'mcp__clickhouse__run_query',
    'mcp__postgres__list_schemas'
  ])('DB 조회는 위험 아님: %s', (tool) => {
    expect(classifyDanger(tool, {})).toBeNull()
  })

  it('알 수 없는 서버의 쓰기 이름은 위험으로 보지 않는다', () => {
    expect(classifyDanger('mcp__grafana__create_dashboard', {})).toBeNull()
    expect(classifyDanger('mcp__other__create_x', {})).toBeNull()
  })

  it('이름에 db 가 글자로 섞여도 서버가 db 가 아니면 DB 로 보지 않는다 (feedback 등)', () => {
    expect(classifyDanger('mcp__feedback__delete_x', {})).toBeNull()
  })

  it('도구/서버 이름 대소문자는 무시', () => {
    expect(classifyDanger('mcp__Dooray-MCP__CREATE_TASK', {})?.category).toBe('dooray')
  })

  it('MCP 가 아닌 일반 도구는 null', () => {
    for (const t of ['Read', 'Write', 'Edit', 'WebFetch', 'Task']) expect(classifyDanger(t, { file_path: '/a' })).toBeNull()
  })

  it('execute_ddl 같은 execute_* 는 DB 쓰기, execute_select·조회 이름(deleted_count 등)은 아니다', () => {
    expect(classifyDanger('mcp__mysql-nfi__execute_ddl', {})?.category).toBe('db')
    expect(classifyDanger('mcp__mysql-nfi__execute_select', {})).toBeNull()
    expect(classifyDanger('mcp__mysql-nfi__deleted_count', {})).toBeNull()
  })
})
