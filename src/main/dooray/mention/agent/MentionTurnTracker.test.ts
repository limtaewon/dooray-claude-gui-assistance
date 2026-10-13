import { describe, it, expect } from 'vitest'
import { MentionTurnTracker } from './MentionTurnTracker'

const turn = (logId = 'log1') => ({ logId, replyChannelId: 'c1', inThread: false, startedAt: 1000, progressLogId: null })

describe('MentionTurnTracker', () => {
  it('begin 직후 has=true, confirmed=false', () => {
    const t = new MentionTurnTracker()
    expect(t.has('c1')).toBe(false)
    t.begin('c1', turn())
    expect(t.has('c1')).toBe(true)
    const d = t.onStop('c1')
    expect(d.kind).toBe('mention')
    if (d.kind === 'mention') expect(d.turn.confirmed).toBe(false)
  })

  it('프롬프트에 `${logId}.md` 가 있으면 멘션 턴으로 확정', () => {
    const t = new MentionTurnTracker()
    t.begin('c1', turn('abc123'))
    expect(t.onPromptSubmit('c1', 'tasks/abc123.md 파일의 채팅을 배경으로...')).toBe('mention')
    const d = t.onStop('c1')
    expect(d.kind).toBe('mention')
    if (d.kind === 'mention') {
      expect(d.turn.confirmed).toBe(true)
      expect(d.turn.logId).toBe('abc123')
    }
  })

  it('onStop 은 대기 턴을 꺼낸다 — has 는 false, 두 번째 Stop 은 백그라운드 후속(followUp)', () => {
    const t = new MentionTurnTracker()
    t.begin('c1', turn())
    t.onPromptSubmit('c1', 'tasks/log1.md')
    const first = t.onStop('c1')
    expect(first).toMatchObject({ kind: 'mention', followUp: false })
    expect(t.has('c1')).toBe(false)
    expect(t.onStop('c1')).toMatchObject({ kind: 'mention', followUp: true })
  })

  it('다른 프롬프트(사람이 직접 입력)는 manual — Stop 도 회신하지 않고 대기 턴은 유지', () => {
    const t = new MentionTurnTracker()
    t.begin('c1', turn('log1'))
    expect(t.onPromptSubmit('c1', '그냥 내가 친 말')).toBe('manual')
    expect(t.onStop('c1')).toEqual({ kind: 'manual' })
    // 사람이 친 턴이 끝났어도 멘션 턴은 아직 대기 중
    expect(t.has('c1')).toBe(true)
  })

  it('대기 턴이 없을 때의 프롬프트도 manual, Stop 도 manual', () => {
    const t = new MentionTurnTracker()
    expect(t.onPromptSubmit('c1', 'tasks/log1.md')).toBe('manual')
    expect(t.onStop('c1')).toEqual({ kind: 'manual' })
  })

  it('manual 플래그는 Stop 한 번에 소비된다', () => {
    const t = new MentionTurnTracker()
    t.begin('c1', turn('log1'))
    t.onPromptSubmit('c1', '직접 입력')
    t.onStop('c1')
    // 이어서 멘션 한줄이 들어오면 다시 mention
    expect(t.onPromptSubmit('c1', 'tasks/log1.md')).toBe('mention')
    expect(t.onStop('c1').kind).toBe('mention')
  })

  it('begin 은 이전 manual 표시를 지운다', () => {
    const t = new MentionTurnTracker()
    t.onPromptSubmit('c1', '직접')
    t.begin('c1', turn())
    expect(t.onStop('c1').kind).toBe('mention')
  })

  it('UserPromptSubmit hook 이 없는 구 설정이면 대기 턴을 그대로 회신 대상으로 본다', () => {
    const t = new MentionTurnTracker()
    t.begin('c1', turn())
    const d = t.onStop('c1')
    expect(d.kind).toBe('mention')
  })

  it('채널별로 독립', () => {
    const t = new MentionTurnTracker()
    t.begin('c1', turn('a'))
    t.begin('c2', { ...turn('b'), replyChannelId: 'c2' })
    expect(t.onPromptSubmit('c2', 'tasks/a.md')).toBe('manual')
    expect(t.onPromptSubmit('c1', 'tasks/a.md')).toBe('mention')
  })

  it('setProgressLogId 는 대기 턴에 진행 logId 를 채운다', () => {
    const t = new MentionTurnTracker()
    t.begin('c1', turn())
    t.setProgressLogId('c1', 'prog-9')
    const d = t.onStop('c1')
    if (d.kind === 'mention') expect(d.turn.progressLogId).toBe('prog-9')
    else throw new Error('mention 이어야 함')
  })

  it('setProgressLogId — 턴이 없으면 무시 (예외 없음)', () => {
    const t = new MentionTurnTracker()
    expect(() => t.setProgressLogId('nope', 'x')).not.toThrow()
    expect(t.has('nope')).toBe(false)
  })
})

describe('MentionTurnTracker — current / cancel', () => {
  it('current 는 진행 중인 멘션 턴을 돌려준다', () => {
    const t = new MentionTurnTracker()
    expect(t.current('c1')).toBeNull()
    t.begin('c1', turn('L9'))
    expect(t.current('c1')).toMatchObject({ logId: 'L9', replyChannelId: 'c1', confirmed: false })
  })

  it('멘션으로 확정된 뒤에도 current 는 유지, Stop 이후에도 끝난 턴(last)이 남는다', () => {
    const t = new MentionTurnTracker()
    t.begin('c1', turn('L9'))
    t.onPromptSubmit('c1', 'tasks/L9.md')
    expect(t.current('c1')?.confirmed).toBe(true)
    t.onStop('c1')
    expect(t.current('c1')).toMatchObject({ logId: 'L9', confirmed: true })
  })

  it('사람이 직접 친 턴(manual)이면 대기 턴이 있어도 null', () => {
    const t = new MentionTurnTracker()
    t.begin('c1', turn('L9'))
    t.onPromptSubmit('c1', '직접 입력')
    expect(t.current('c1')).toBeNull()
    // 이어서 멘션 한 줄이 들어오면 다시 보인다
    t.onPromptSubmit('c1', 'tasks/L9.md')
    expect(t.current('c1')).not.toBeNull()
  })

  it('current 는 읽기 전용 — 호출해도 턴이 소비되지 않는다', () => {
    const t = new MentionTurnTracker()
    t.begin('c1', turn())
    t.current('c1')
    t.current('c1')
    expect(t.has('c1')).toBe(true)
    expect(t.onStop('c1').kind).toBe('mention')
  })

  it('cancel 은 대기 턴을 버린다 — 이후 Stop 은 manual (last 가 없으니)', () => {
    const t = new MentionTurnTracker()
    t.begin('c1', turn())
    t.cancel('c1')
    expect(t.has('c1')).toBe(false)
    expect(t.current('c1')).toBeNull()
    expect(t.onStop('c1')).toEqual({ kind: 'manual' })
  })

  it('cancel 은 다른 채널에 영향 없고, 없는 채널도 안전', () => {
    const t = new MentionTurnTracker()
    t.begin('c1', turn())
    t.begin('c2', { ...turn('L2'), replyChannelId: 'c2' })
    t.cancel('c1')
    t.cancel('none')
    expect(t.has('c2')).toBe(true)
  })
})

describe('MentionTurnTracker — 백그라운드로 이어진 작업 (last / followUp)', () => {
  const stopOf = (t: MentionTurnTracker) => t.onStop('c1')

  it('멘션 턴이 끝난 뒤 Stop 이 또 오면 followUp=true, progressLogId 는 null 로 비운다', () => {
    const t = new MentionTurnTracker()
    t.begin('c1', { ...turn('L1'), progressLogId: 'P1', organizationId: 'org1', inThread: true })
    t.onPromptSubmit('c1', 'tasks/L1.md')
    const first = stopOf(t)
    expect(first).toMatchObject({ kind: 'mention', followUp: false, turn: { progressLogId: 'P1' } })
    const follow = stopOf(t)
    expect(follow.kind).toBe('mention')
    if (follow.kind === 'mention') {
      expect(follow.followUp).toBe(true)
      expect(follow.turn).toMatchObject({ logId: 'L1', replyChannelId: 'c1', organizationId: 'org1', inThread: true, progressLogId: null })
    }
  })

  it('후속 Stop 은 여러 번 와도 계속 followUp (사람이 개입하기 전까지 소유 유지)', () => {
    const t = new MentionTurnTracker()
    t.begin('c1', turn())
    stopOf(t)
    for (let i = 0; i < 3; i++) expect(stopOf(t)).toMatchObject({ kind: 'mention', followUp: true })
  })

  it('후속 Stop 이 원본 last 의 progressLogId 를 훼손하지 않는다 (복사본)', () => {
    const t = new MentionTurnTracker()
    t.begin('c1', { ...turn(), progressLogId: 'P1' })
    stopOf(t)
    stopOf(t)
    expect(t.current('c1')?.progressLogId).toBe('P1')
  })

  it('사람이 TUI 에 직접 치면(manual) last 가 지워지고 이후 Stop 은 manual', () => {
    const t = new MentionTurnTracker()
    t.begin('c1', turn('L1'))
    t.onPromptSubmit('c1', 'tasks/L1.md')
    stopOf(t)
    expect(t.onPromptSubmit('c1', '내가 직접 친 말')).toBe('manual')
    expect(t.current('c1')).toBeNull()
    expect(stopOf(t)).toEqual({ kind: 'manual' })
  })

  it('manual 은 Stop 으로 풀리지 않고 다음 begin 까지 유지된다', () => {
    const t = new MentionTurnTracker()
    t.onPromptSubmit('c1', '직접')
    expect(stopOf(t)).toEqual({ kind: 'manual' })
    expect(stopOf(t)).toEqual({ kind: 'manual' })
    expect(t.current('c1')).toBeNull()
    t.begin('c1', turn('L2'))
    expect(stopOf(t)).toMatchObject({ kind: 'mention', followUp: false })
  })

  it('새 begin 은 이전 last 를 지운다', () => {
    const t = new MentionTurnTracker()
    t.begin('c1', turn('OLD'))
    stopOf(t)
    t.begin('c1', turn('NEW'))
    expect(t.current('c1')?.logId).toBe('NEW')
    // 새 턴이 끝나기 전 Stop 이 오면 followUp 이 아니라 새 대기 턴
    expect(stopOf(t)).toMatchObject({ kind: 'mention', followUp: false, turn: { logId: 'NEW' } })
  })

  it('current 는 pending 이 있으면 그것을, 없으면 last 를', () => {
    const t = new MentionTurnTracker()
    t.begin('c1', turn('A'))
    expect(t.current('c1')?.logId).toBe('A')
    stopOf(t)
    expect(t.has('c1')).toBe(false)
    expect(t.current('c1')?.logId).toBe('A')
  })

  it('last 가 있는 채널의 manual 프롬프트가 다른 채널의 last 를 지우지 않는다', () => {
    const t = new MentionTurnTracker()
    t.begin('c1', turn('A'))
    t.begin('c2', { ...turn('B'), replyChannelId: 'c2' })
    t.onStop('c1')
    t.onStop('c2')
    t.onPromptSubmit('c1', '직접')
    expect(t.current('c2')?.logId).toBe('B')
  })

  it('멘션 확정 프롬프트(tasks/{logId}.md)는 last 만 있을 땐 멘션으로 판정되지 않는다 (대기 턴이 없음)', () => {
    const t = new MentionTurnTracker()
    t.begin('c1', turn('L1'))
    stopOf(t)
    // pending 이 없으므로 이후 들어온 프롬프트는 manual 로 간주되어 last 소유가 풀린다
    expect(t.onPromptSubmit('c1', 'tasks/L1.md')).toBe('manual')
    expect(stopOf(t)).toEqual({ kind: 'manual' })
  })

  it('cancel 은 last 에는 영향이 없다', () => {
    const t = new MentionTurnTracker()
    t.begin('c1', turn('L1'))
    stopOf(t)
    t.cancel('c1')
    expect(stopOf(t)).toMatchObject({ followUp: true })
  })
})

