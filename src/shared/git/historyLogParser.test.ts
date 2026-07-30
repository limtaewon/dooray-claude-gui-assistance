import { describe, it, expect } from 'vitest'
import {
  compareGitHistoryItemRefsByCategory,
  gitHistoryRefFromFullName,
  parseGitHistoryLog,
  shortGitHash
} from './historyLogParser'

const HASH_A = 'a'.repeat(40)
const HASH_B = 'b'.repeat(40)

/** 실제 `git log --format=... -z` 출력을 흉내낸다 (레코드 NUL 구분, 필드 개행 구분). */
function record(input: {
  hash: string
  author?: string
  email?: string
  at?: number
  parents?: string
  decorations?: string
  body?: string
}): string {
  return [
    input.hash,
    input.author ?? '임태원',
    input.email ?? 'taewon@example.com',
    String(input.at ?? 1_700_000_000),
    String(input.at ?? 1_700_000_000),
    input.parents ?? '',
    input.decorations ?? '',
    input.body ?? 'subject line'
  ].join('\n')
}

describe('parseGitHistoryLog', () => {
  it('레코드를 커밋으로 파싱하고 첫 줄을 subject 로 뽑는다', () => {
    const items = parseGitHistoryLog(
      record({ hash: HASH_A, parents: HASH_B, body: '제목\n\n본문 첫 줄\n본문 둘' })
    )
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: HASH_A,
      parentIds: [HASH_B],
      subject: '제목',
      displayId: HASH_A.slice(0, 7),
      author: '임태원',
      timestamp: 1_700_000_000_000
    })
    expect(items[0].message).toBe('제목\n\n본문 첫 줄\n본문 둘')
  })

  it('빈 커밋 메시지는 안내 문구로 대체한다', () => {
    const items = parseGitHistoryLog(record({ hash: HASH_A, body: '' }))
    expect(items[0].subject).toBe('(커밋 메시지 없음)')
  })

  it('머지 커밋의 부모를 공백으로 나눈다', () => {
    const items = parseGitHistoryLog(record({ hash: HASH_A, parents: `${HASH_B} ${'c'.repeat(40)}` }))
    expect(items[0].parentIds).toHaveLength(2)
  })

  it('NUL 로 구분된 여러 레코드를 순서대로 읽는다', () => {
    const stdout = [record({ hash: HASH_A }), record({ hash: HASH_B })].join('\0')
    expect(parseGitHistoryLog(stdout).map((i) => i.id)).toEqual([HASH_A, HASH_B])
  })

  it('해시가 아닌 잡음 레코드는 건너뛴다', () => {
    expect(parseGitHistoryLog('쓰레기\n줄\0')).toEqual([])
  })
})

describe('parseGitHistoryLog — decoration', () => {
  it('\\x1f 구분자를 쓴다 — git 은 ref 이름에 콤마를 허용해 콤마로 자르면 깨진다', () => {
    const items = parseGitHistoryLog(
      record({
        hash: HASH_A,
        decorations: 'HEAD -> refs/heads/feat,ure\x1frefs/remotes/origin/develop\x1ftag: refs/tags/v1.0'
      })
    )
    expect(items[0].references).toEqual([
      { id: 'refs/heads/feat,ure', name: 'feat,ure', revision: HASH_A, category: 'branches' },
      {
        id: 'refs/remotes/origin/develop',
        name: 'origin/develop',
        revision: HASH_A,
        category: 'remote branches'
      },
      { id: 'refs/tags/v1.0', name: 'v1.0', revision: HASH_A, category: 'tags' }
    ])
  })

  it('맨 HEAD 와 origin/HEAD 심볼릭은 배지에서 뺀다', () => {
    const items = parseGitHistoryLog(
      record({ hash: HASH_A, decorations: 'HEAD\x1frefs/remotes/origin/HEAD' })
    )
    expect(items[0].references).toEqual([])
  })

  it('브랜치 → 원격 → 태그 순으로 정렬한다', () => {
    const order = [
      { id: 'refs/tags/v1', name: 'v1' },
      { id: 'refs/heads/main', name: 'main' },
      { id: 'refs/remotes/origin/main', name: 'origin/main' }
    ].sort(compareGitHistoryItemRefsByCategory)
    expect(order.map((r) => r.id)).toEqual([
      'refs/heads/main',
      'refs/remotes/origin/main',
      'refs/tags/v1'
    ])
  })
})

describe('gitHistoryRefFromFullName / shortGitHash', () => {
  it('full name 접두로 카테고리를 판정한다', () => {
    expect(gitHistoryRefFromFullName('refs/heads/main', 'main', HASH_A).category).toBe('branches')
    expect(gitHistoryRefFromFullName('refs/remotes/origin/main', 'origin/main', HASH_A).category).toBe(
      'remote branches'
    )
    expect(gitHistoryRefFromFullName('refs/tags/v1', 'v1', HASH_A).category).toBe('tags')
  })

  it('full name 이 없으면 fallback 이름으로 commits 카테고리가 된다', () => {
    expect(gitHistoryRefFromFullName(null, 'HEAD~1', HASH_A)).toEqual({
      id: 'HEAD~1',
      name: 'HEAD~1',
      revision: HASH_A,
      category: 'commits'
    })
  })

  it('이름조차 없으면 짧은 해시를 표시명으로 쓴다', () => {
    expect(gitHistoryRefFromFullName(null, '', HASH_A).name).toBe(shortGitHash(HASH_A))
  })
})
