import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  QuestionWatcher,
  answerToRequest,
  detectQuestion,
  parseQuestionReactions,
  parseQuestionReply,
  questionHint,
  type AgentQuestion,
  type QuestionOrigin
} from './QuestionWatcher'

// 2026-10-14 실사용 회신 (휴가 상신 확인) — 선택지 뒤에 "참고로" 문단이 이어진다
const LEAVE_ANSWER = [
  '아직 상신하지 않았습니다. 아래 내용으로 올려도 될지 확인해 주세요.',
  '',
  '**휴가신청서 (연차)**',
  '2026-10-16(금) 15:00 ~ 18:30',
  '',
  '아래 중 하나로 답 주세요.',
  '1) 상신: 바로 결재선으로 올립니다.',
  '2) 임시저장: 결재함에 저장만 해 둡니다.',
  '사유를 넣으려면 같이 적어 주세요.',
  '',
  '참고로 어제 Drop 아카이브 업로드는 대기 상태로 남아 있습니다.'
].join('\n')

const CHOICE: AgentQuestion = { kind: 'choice', options: ['상신: 바로 결재선으로 올립니다.', '임시저장: 결재함에 저장만 해 둡니다.'] }

describe('detectQuestion', () => {
  it('고르라는 말이 붙은 번호 목록은 선택지 — 뒤에 다른 문단이 있어도', () => {
    expect(detectQuestion(LEAVE_ANSWER)).toEqual(CHOICE)
  })

  it('"1." 형식과 굵은 번호도 선택지로 읽는다', () => {
    const q = detectQuestion('어느 쪽으로 할까요?\n**1.** `main` 에 머지\n**2.** 브랜치만 푸시')
    expect(q).toEqual({ kind: 'choice', options: ['main 에 머지', '브랜치만 푸시'] })
  })

  it('선택지 사이에 빈 줄·설명 줄이 있어도 읽는다 (dooray-reply 스킬의 목록 형식)', () => {
    const q = detectQuestion('아래 중 하나로 답 주세요.\n\n1) 상신\n바로 결재선으로 올립니다.\n\n2) 임시저장\n결재함에 저장만 해 둡니다.')
    expect(q).toEqual({ kind: 'choice', options: ['상신', '임시저장'] })
  })

  it('고르라는 말이 없는 번호 목록(작업 단계)은 선택지가 아니다', () => {
    expect(detectQuestion('처리했습니다.\n1) 파일 수정\n2) 테스트 통과\n3) 커밋')).toBeNull()
  })

  it('진행해도 되는지 묻는 답은 confirm', () => {
    expect(detectQuestion('아래 내용으로 올려도 될지 확인해 주세요.\n제목: 휴가')).toEqual({ kind: 'confirm' })
    expect(detectQuestion('이대로 PR 을 머지할까요?')).toEqual({ kind: 'confirm' })
  })

  it('그 밖의 질문은 open, 묻지 않으면 null', () => {
    expect(detectQuestion('어느 저장소를 말씀하시는 건가요?')).toEqual({ kind: 'open' })
    expect(detectQuestion('완료했습니다. 테스트 12개 통과.')).toBeNull()
  })
})

describe('questionHint', () => {
  it('선택지 수만큼 숫자 반응을 보인다', () => {
    expect(questionHint(CHOICE)).toContain('1️⃣ 2️⃣ 반응')
    expect(questionHint(CHOICE)).not.toContain('3️⃣')
    expect(questionHint({ kind: 'confirm' })).toContain('✅ 진행 · ❌ 취소')
    expect(questionHint({ kind: 'open' })).toContain('@clauday 없이')
  })
})

describe('parseQuestionReactions', () => {
  const me = 'm1'
  it('내가 누른 숫자 반응 → 선택지 번호 (흔한 이름 표기 모두)', () => {
    expect(parseQuestionReactions([{ value: 'two', memberIds: [me] }], me, CHOICE)).toEqual({ kind: 'option', index: 2 })
    expect(parseQuestionReactions([{ value: 'keycap_1', memberIds: [me] }], me, CHOICE)).toEqual({ kind: 'option', index: 1 })
  })

  it('남이 누른 반응·선택지 밖 번호는 무시한다', () => {
    expect(parseQuestionReactions([{ value: 'one', memberIds: ['other'] }], me, CHOICE)).toBeNull()
    expect(parseQuestionReactions([{ value: 'three', memberIds: [me] }], me, CHOICE)).toBeNull()
  })

  it('❌ 는 어떤 질문이든 취소이고 숫자보다 이긴다', () => {
    expect(parseQuestionReactions([{ value: 'one', memberIds: [me] }, { value: 'x', memberIds: [me] }], me, CHOICE)).toEqual({ kind: 'no' })
  })

  it('confirm 은 ✅ 로 진행, open 은 반응을 받지 않는다', () => {
    expect(parseQuestionReactions([{ value: 'white_check_mark', memberIds: [me] }], me, { kind: 'confirm' })).toEqual({ kind: 'yes' })
    expect(parseQuestionReactions([{ value: 'white_check_mark', memberIds: [me] }], me, { kind: 'open' })).toBeNull()
  })
})

describe('parseQuestionReply', () => {
  it('번호 답장 — "1", "2번", "1)" / 번호 뒤 덧붙인 말은 함께 넘긴다', () => {
    expect(parseQuestionReply('1', CHOICE, false)).toEqual({ kind: 'option', index: 1 })
    expect(parseQuestionReply('2번', CHOICE, false)).toEqual({ kind: 'option', index: 2 })
    expect(parseQuestionReply('1)', CHOICE, false)).toEqual({ kind: 'option', index: 1 })
    expect(parseQuestionReply('1, 사유는 병원', CHOICE, false)).toEqual({
      kind: 'text',
      text: '1) 상신: 바로 결재선으로 올립니다. — 이걸로 진행해 주세요. 사유는 병원'
    })
  })

  it('"10시에 해" 처럼 숫자로 시작하는 문장은 번호 답이 아니다', () => {
    expect(parseQuestionReply('10시에 해', CHOICE, false)).toBeNull()
  })

  it('예/아니오 단답', () => {
    expect(parseQuestionReply('네', { kind: 'confirm' }, false)).toEqual({ kind: 'yes' })
    expect(parseQuestionReply('취소', CHOICE, false)).toEqual({ kind: 'no' })
  })

  it('문장 답은 질문 직후(freeText)에만 받고 Clauday 자신의 메시지는 받지 않는다', () => {
    expect(parseQuestionReply('dooray-claude 저장소요', { kind: 'open' }, true)).toEqual({ kind: 'text', text: 'dooray-claude 저장소요' })
    expect(parseQuestionReply('dooray-claude 저장소요', { kind: 'open' }, false)).toBeNull()
    expect(parseQuestionReply('[Clauday] ⏳ 작업을 시작합니다', { kind: 'open' }, true)).toBeNull()
  })
})

describe('answerToRequest', () => {
  it('선택지 번호는 선택지 문장으로 풀어 넘긴다', () => {
    expect(answerToRequest({ kind: 'option', index: 2 }, CHOICE)).toBe('2) 임시저장: 결재함에 저장만 해 둡니다. — 이걸로 진행해 주세요.')
    expect(answerToRequest({ kind: 'no' }, CHOICE)).toContain('멈춰')
  })
})

describe('QuestionWatcher', () => {
  const origin: QuestionOrigin = {
    channelId: 'ch',
    replyChannelId: 'ch',
    questionLogId: 'q1',
    questionText: `[Clauday] ✅ 0:30\n본문\n\n${questionHint(CHOICE)}`,
    question: CHOICE,
    inThread: false
  }
  let now = 0
  let reactions: unknown[] = []
  const make = () => {
    const onAnswer = vi.fn()
    const messenger = {
      fetchChannelLogs: vi.fn(async () => [{ id: 'q1', reactions }]),
      updateMessage: vi.fn(async () => {})
    }
    const w = new QuestionWatcher({ messenger, getMyMemberId: async () => 'me', onAnswer, now: () => now })
    return { w, onAnswer, messenger }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    now = 0
    reactions = []
  })
  afterEach(() => vi.useRealTimers())

  it('숫자 반응을 읽으면 답을 넘기고 안내 줄을 고른 값으로 바꾼다', async () => {
    const { w, onAnswer, messenger } = make()
    w.watch(origin)
    reactions = [{ value: 'one', memberIds: ['me'] }]
    await vi.advanceTimersByTimeAsync(3_000)
    expect(onAnswer).toHaveBeenCalledWith({ origin, logId: 'q1', request: '1) 상신: 바로 결재선으로 올립니다. — 이걸로 진행해 주세요.' })
    expect(messenger.updateMessage).toHaveBeenCalledWith('ch', 'q1', '[Clauday] ✅ 0:30\n본문\n\n↳ 1️⃣ 선택됨')
    expect(w.isWatching('ch')).toBe(false)
  })

  it('답장으로 받으면 반응 확인을 멈춘다', async () => {
    const { w, onAnswer, messenger } = make()
    w.watch(origin)
    expect(w.onReply('ch', '2', 'r1')).toBe(true)
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ logId: 'r1' }))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(messenger.fetchChannelLogs).not.toHaveBeenCalled()
  })

  it('읽히지 않는 답장은 흘려보낸다 (10분 지난 문장)', () => {
    const { w, onAnswer } = make()
    w.watch(origin)
    now = 11 * 60 * 1000
    expect(w.onReply('ch', '오늘 점심 뭐 먹지', 'r1')).toBe(false)
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('clear 뒤에는 반응도 답장도 받지 않는다 (새 멘션이 온 경우)', async () => {
    const { w, onAnswer } = make()
    w.watch(origin)
    w.clear('ch')
    reactions = [{ value: 'one', memberIds: ['me'] }]
    await vi.advanceTimersByTimeAsync(10_000)
    expect(w.onReply('ch', '1', 'r1')).toBe(false)
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('2시간이 지나면 기다리지 않는다', async () => {
    const { w } = make()
    w.watch(origin)
    now = 2 * 60 * 60 * 1000
    await vi.advanceTimersByTimeAsync(3_000)
    expect(w.isWatching('ch')).toBe(false)
  })

  it('open 질문은 반응을 확인하지 않는다', async () => {
    const { w, messenger } = make()
    w.watch({ ...origin, question: { kind: 'open' } })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(messenger.fetchChannelLogs).not.toHaveBeenCalled()
  })
})
