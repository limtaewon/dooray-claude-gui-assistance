import { describe, it, expect, vi, beforeEach } from 'vitest'

// extractText 가 WatcherService 에서 export 되는데, WatcherService 가 electron/electron-store 를
// import 한다. CI 에서 electron 바이너리 install 실패 시 모듈 로드 자체가 깨지므로 mock 필요.
vi.mock('electron-store', async () => {
  const { MemElectronStore } = await import('../../../../test/mocks/electron-store')
  return { default: MemElectronStore }
})
vi.mock('electron', () => ({
  BrowserWindow: class {},
  Notification: class { static isSupported(): boolean { return false } on(): void {} show(): void {} }
}))

import { ContextCollector } from './ContextCollector'

function makeLog(id: string, opts: { text?: string; sender?: string; senderName?: string; sentAt?: string } = {}) {
  return {
    id,
    text: opts.text ?? `msg ${id}`,
    sender: { member: { organizationMemberId: opts.sender || 'm1', name: opts.senderName } },
    sentAt: opts.sentAt || '2026-05-13T10:00:00Z'
  }
}

function makeMessenger(logs: ReturnType<typeof makeLog>[], channels: Array<{ id: string; displayName: string }> = []) {
  return {
    fetchChannelLogs: vi.fn().mockResolvedValue(logs),
    resolveMemberNames: vi.fn().mockResolvedValue(undefined),
    getMemberName: vi.fn().mockImplementation(async (id: string) => `name-${id}`),
    listChannels: vi.fn().mockResolvedValue(channels)
  }
}

describe('ContextCollector.collect', () => {
  it('mentionLogId 기준으로 그 시점부터 과거 windowSize 만큼 슬라이스', async () => {
    const logs = [
      makeLog('5'), // 최신
      makeLog('4'),
      makeLog('3'), // mention
      makeLog('2'),
      makeLog('1')
    ]
    const m = makeMessenger(logs)
    const c = new ContextCollector(m as never)
    const ctx = await c.collect('ch1', '3', 10)
    // mentionIdx=2, slice = logs[2..12] → ['3','2','1']
    // reverse → ['1','2','3']
    expect(ctx.messages.map((x) => x.text)).toEqual(['msg 1', 'msg 2', 'msg 3'])
    expect(ctx.mentionLogId).toBe('3')
  })

  it('windowSize=2 → mention 이후로 2개만', async () => {
    const logs = [makeLog('5'), makeLog('4'), makeLog('3'), makeLog('2'), makeLog('1')]
    const c = new ContextCollector(makeMessenger(logs) as never)
    const ctx = await c.collect('ch1', '3', 2)
    expect(ctx.messages.map((x) => x.text)).toEqual(['msg 2', 'msg 3'])
  })

  it('mentionLogId 가 안 보이면 최신부터', async () => {
    const logs = [makeLog('5'), makeLog('4'), makeLog('3')]
    const c = new ContextCollector(makeMessenger(logs) as never)
    const ctx = await c.collect('ch1', 'absent', 10)
    expect(ctx.messages.map((x) => x.text)).toEqual(['msg 3', 'msg 4', 'msg 5'])
  })

  it('빈 텍스트 메시지는 제외', async () => {
    const logs = [
      makeLog('3', { text: '내용' }),
      makeLog('2', { text: '' }),
      makeLog('1', { text: '   ' })
    ]
    const c = new ContextCollector(makeMessenger(logs) as never)
    const ctx = await c.collect('ch1', '3', 10)
    expect(ctx.messages).toHaveLength(1)
  })

  it('sender.member.name 우선 사용, 없으면 getMemberName 폴백', async () => {
    const logs = [
      makeLog('1', { sender: 'm1', senderName: '본명' }),
      { id: '2', text: 'no name', sender: { member: { organizationMemberId: 'm2' } }, sentAt: '2026-05-13T10:00:00Z' }
    ]
    const m = makeMessenger(logs as never)
    const c = new ContextCollector(m as never)
    const ctx = await c.collect('ch1', '1', 10)
    const byText = Object.fromEntries(ctx.messages.map((x) => [x.text, x.authorName]))
    expect(byText['msg 1']).toBe('본명')
    expect(byText['no name']).toBe('name-m2')
  })

  it('authorId / sentAt 없어도 폴백 처리', async () => {
    const logs = [{ id: '1', text: 'hi', sender: {} }]
    const m = makeMessenger(logs as never)
    const c = new ContextCollector(m as never)
    const ctx = await c.collect('ch1', '1', 5)
    expect(ctx.messages[0].authorName).toBe('알 수 없음')
    expect(typeof ctx.messages[0].sentAt).toBe('string')
  })

  it('channelName override 우선', async () => {
    const c = new ContextCollector(makeMessenger([makeLog('1')]) as never)
    const ctx = await c.collect('ch1', '1', 5, '직접지정')
    expect(ctx.channelName).toBe('직접지정')
  })

  it('listChannels 에서 채널 이름 해석', async () => {
    const c = new ContextCollector(
      makeMessenger([makeLog('1')], [{ id: 'ch1', displayName: '내 채널' }]) as never
    )
    const ctx = await c.collect('ch1', '1', 5)
    expect(ctx.channelName).toBe('내 채널')
  })

  it('listChannels 실패 시 channelId 를 그대로 사용', async () => {
    const m = makeMessenger([makeLog('1')])
    m.listChannels.mockRejectedValueOnce(new Error('fail'))
    const c = new ContextCollector(m as never)
    const ctx = await c.collect('ch1', '1', 5)
    expect(ctx.channelName).toBe('ch1')
  })

  it('listChannels 에 매치 없으면 channelId 폴백', async () => {
    const c = new ContextCollector(
      makeMessenger([makeLog('1')], [{ id: 'other', displayName: '다른' }]) as never
    )
    const ctx = await c.collect('ch1', '1', 5)
    expect(ctx.channelName).toBe('ch1')
  })
})

// ───────────────────────── 글타래 · 첨부 · 인용 · 마스킹 ─────────────────────────

type AnyLog = Record<string, unknown>

function imgLog(id: string, opts: { fileName?: string; mimeType?: string; fileSize?: number; text?: string; fileId?: string } = {}): AnyLog {
  const fileName = opts.fileName ?? `${id}.png`
  return {
    id,
    type: 'FILE',
    text: opts.text ?? fileName,
    sender: { member: { organizationMemberId: 'm1', name: '작성자' } },
    sentAt: '2026-05-13T10:00:00Z',
    file: { id: opts.fileId ?? `f-${id}`, fileName, mimeType: opts.mimeType ?? 'image/png', fileSize: opts.fileSize ?? 1000 }
  }
}

function makeRichMessenger(byChannel: Record<string, (size: number) => AnyLog[]>) {
  return {
    fetchChannelLogs: vi.fn(async (ch: string, size: number) => (byChannel[ch] ? byChannel[ch](size) : [])),
    resolveMemberNames: vi.fn().mockResolvedValue(undefined),
    getMemberName: vi.fn().mockResolvedValue('이름'),
    listChannels: vi.fn().mockResolvedValue([]),
    downloadChannelFile: vi.fn().mockResolvedValue({ mimeType: 'image/png', data: Buffer.from('img') })
  }
}

describe('ContextCollector — 글타래 멘션', () => {
  const rootLog = (): AnyLog => ({
    ...makeLog('root', { text: '원글: 전표 오류 문의', senderName: '요청자' }),
    thread: { channelId: 'thr1', totalCount: '7' }
  })

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('글타래 답글 전체(멘션까지) + 부모 채널의 원글을 threadRoot 로', async () => {
    const m = makeRichMessenger({
      thr1: () => [makeLog('r3'), makeLog('r2'), makeLog('r1')],
      p1: () => [makeLog('x'), rootLog()]
    })
    const c = new ContextCollector(m as never)
    const ctx = await c.collect('thr1', 'r3', 50, undefined, { parentChannelId: 'p1' })
    expect(ctx.inThread).toBe(true)
    expect(ctx.messages.map((x) => x.text)).toEqual(['msg r1', 'msg r2', 'msg r3'])
    expect(ctx.threadRoot?.text).toBe('원글: 전표 오류 문의')
    expect(ctx.threadRoot?.authorName).toBe('요청자')
  })

  it('글타래 안에서는 windowSize 로 자르지 않고 THREAD 크기(200)로 조회', async () => {
    const m = makeRichMessenger({ thr1: () => [makeLog('r2'), makeLog('r1')], p1: () => [rootLog()] })
    await new ContextCollector(m as never).collect('thr1', 'r2', 1, undefined, { parentChannelId: 'p1' })
    expect(m.fetchChannelLogs).toHaveBeenCalledWith('thr1', 200)
  })

  it('원글 탐색은 200 → 1000 순서 (200 에서 못 찾고 꽉 찼을 때만 1000)', async () => {
    const filler = (n: number): AnyLog[] => Array.from({ length: n }, (_, i) => makeLog(`f${i}`))
    const m = makeRichMessenger({
      thr1: () => [makeLog('r1')],
      p1: (size) => (size === 200 ? filler(200) : [...filler(999), rootLog()])
    })
    const ctx = await new ContextCollector(m as never).collect('thr1', 'r1', 50, undefined, { parentChannelId: 'p1' })
    const parentCalls = m.fetchChannelLogs.mock.calls.filter((c) => c[0] === 'p1').map((c) => c[1])
    expect(parentCalls).toEqual([200, 1000])
    expect(ctx.threadRoot?.text).toBe('원글: 전표 오류 문의')
  })

  it('200 에서 찾으면 1000 은 조회하지 않는다', async () => {
    const m = makeRichMessenger({ thr1: () => [makeLog('r1')], p1: () => [rootLog()] })
    await new ContextCollector(m as never).collect('thr1', 'r1', 50, undefined, { parentChannelId: 'p1' })
    expect(m.fetchChannelLogs.mock.calls.filter((c) => c[0] === 'p1').map((c) => c[1])).toEqual([200])
  })

  it('부모 채널 로그가 한도보다 적으면(끝까지 본 것) 1000 으로 넘어가지 않는다', async () => {
    const m = makeRichMessenger({ thr1: () => [makeLog('r1')], p1: () => [makeLog('a'), makeLog('b')] })
    const ctx = await new ContextCollector(m as never).collect('thr1', 'r1', 50, undefined, { parentChannelId: 'p1' })
    expect(m.fetchChannelLogs.mock.calls.filter((c) => c[0] === 'p1')).toHaveLength(1)
    expect(ctx.threadRoot).toBeNull()
  })

  it('같은 글타래 두 번째 호출은 캐시로 부모 조회를 하지 않는다', async () => {
    const m = makeRichMessenger({ thr1: () => [makeLog('r1')], p1: () => [rootLog()] })
    const c = new ContextCollector(m as never)
    await c.collect('thr1', 'r1', 50, undefined, { parentChannelId: 'p1' })
    const second = await c.collect('thr1', 'r1', 50, undefined, { parentChannelId: 'p1' })
    expect(m.fetchChannelLogs.mock.calls.filter((x) => x[0] === 'p1')).toHaveLength(1)
    expect(second.threadRoot?.text).toBe('원글: 전표 오류 문의')
  })

  it('원글을 못 찾으면 threadRoot 는 null (undefined 아님)', async () => {
    const m = makeRichMessenger({ thr1: () => [makeLog('r1')], p1: () => [makeLog('other')] })
    const ctx = await new ContextCollector(m as never).collect('thr1', 'r1', 50, undefined, { parentChannelId: 'p1' })
    expect(ctx.threadRoot).toBeNull()
    expect(ctx.inThread).toBe(true)
  })

  it('부모 채널 조회가 throw 해도 수집은 계속되고 threadRoot null', async () => {
    const m = makeRichMessenger({ thr1: () => [makeLog('r1')] })
    m.fetchChannelLogs.mockImplementation(async (ch: string) => {
      if (ch === 'p1') throw new Error('500')
      return [makeLog('r1')]
    })
    const ctx = await new ContextCollector(m as never).collect('thr1', 'r1', 50, undefined, { parentChannelId: 'p1' })
    expect(ctx.threadRoot).toBeNull()
    expect(ctx.messages).toHaveLength(1)
  })

  it('채널 멘션(parentChannelId 없음)이면 inThread=false, threadRoot undefined', async () => {
    const ctx = await new ContextCollector(makeMessenger([makeLog('1')]) as never).collect('ch1', '1', 5)
    expect(ctx.inThread).toBe(false)
    expect(ctx.threadRoot).toBeUndefined()
  })

  it('원글 작성자도 이름 해석 대상에 포함', async () => {
    const m = makeRichMessenger({
      thr1: () => [makeLog('r1', { sender: 'm-reply' })],
      p1: () => [{ ...rootLog(), sender: { member: { organizationMemberId: 'm-root' } } }]
    })
    await new ContextCollector(m as never).collect('thr1', 'r1', 50, undefined, { parentChannelId: 'p1' })
    const ids = m.resolveMemberNames.mock.calls[0][0] as string[]
    expect(ids.sort()).toEqual(['m-reply', 'm-root'])
  })
})

describe('ContextCollector — thread.totalCount / 인용', () => {
  it('thread.totalCount(문자열/숫자) → threadCount, 0·이상값은 undefined', async () => {
    const logs = [
      { ...makeLog('4'), thread: { channelId: 't', totalCount: '12' } },
      { ...makeLog('3'), thread: { channelId: 't', totalCount: 3 } },
      { ...makeLog('2'), thread: { channelId: 't', totalCount: '0' } },
      { ...makeLog('1'), thread: { channelId: 't', totalCount: 'abc' } }
    ]
    const ctx = await new ContextCollector(makeMessenger(logs as never) as never).collect('ch1', '4', 10)
    const byText = Object.fromEntries(ctx.messages.map((x) => [x.text, x.threadCount]))
    expect(byText['msg 4']).toBe(12)
    expect(byText['msg 3']).toBe(3)
    expect(byText['msg 2']).toBeUndefined()
    expect(byText['msg 1']).toBeUndefined()
  })

  it('originalLog 인용 — 수집 범위 안이면 원문(120자 컷), 밖이면 안내 문구', async () => {
    const long = '가'.repeat(200)
    const logs = [
      { ...makeLog('3'), originalLog: { id: '1' } },
      { ...makeLog('2'), originalLog: { id: 'missing' } },
      makeLog('1', { text: long })
    ]
    const ctx = await new ContextCollector(makeMessenger(logs as never) as never).collect('ch1', '3', 10)
    const q = Object.fromEntries(ctx.messages.map((x) => [x.text === long ? 'orig' : x.text, x.quote]))
    expect(q['msg 3']).toHaveLength(120)
    expect(q['msg 3']!.endsWith('…')).toBe(true)
    expect(q['msg 2']).toBe('(인용 원문이 수집 범위 밖)')
    expect(q['orig']).toBeUndefined()
  })

  it('인용 원문의 줄바꿈·연속 공백은 한 칸으로', async () => {
    const logs = [{ ...makeLog('2'), originalLog: { id: '1' } }, makeLog('1', { text: '첫 줄\n\n  둘째   줄' })]
    const ctx = await new ContextCollector(makeMessenger(logs as never) as never).collect('ch1', '2', 10)
    expect(ctx.messages[1].quote).toBe('첫 줄 둘째 줄')
  })
})

describe('ContextCollector — 첨부', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  const collectWith = async (logs: AnyLog[], opts: { save?: boolean; download?: boolean } = {}) => {
    const m = makeRichMessenger({ ch1: () => logs })
    if (opts.download === false) delete (m as Partial<typeof m>).downloadChannelFile
    const saveAttachment = vi.fn((fileId: string, fileName: string) => `attachments/${fileId}-${fileName}`)
    const ctx = await new ContextCollector(m as never).collect('ch1', String(logs[0].id), 50, undefined, {
      saveAttachment: opts.save === false ? undefined : saveAttachment
    })
    return { ctx, m, saveAttachment }
  }

  it('이미지 FILE 메시지는 downloadChannelFile + saveAttachment 후 localPath', async () => {
    const { ctx, m, saveAttachment } = await collectWith([imgLog('1', { fileName: 'err.png' })])
    expect(m.downloadChannelFile).toHaveBeenCalledWith('ch1', 'f-1')
    expect(saveAttachment).toHaveBeenCalledWith('f-1', 'err.png', Buffer.from('img'))
    expect(ctx.messages[0].attachment).toEqual({
      fileId: 'f-1',
      fileName: 'err.png',
      mimeType: 'image/png',
      localPath: 'attachments/f-1-err.png'
    })
  })

  it('텍스트가 파일명과 같으면 text 를 비운다', async () => {
    const { ctx } = await collectWith([imgLog('1', { fileName: 'err.png', text: 'err.png' })])
    expect(ctx.messages[0].text).toBe('')
  })

  it('텍스트가 파일명과 다르면 text 를 유지', async () => {
    const { ctx } = await collectWith([imgLog('1', { fileName: 'err.png', text: '이 화면 봐주세요' })])
    expect(ctx.messages[0].text).toBe('이 화면 봐주세요')
    expect(ctx.messages[0].attachment?.fileName).toBe('err.png')
  })

  it('이미지가 아니면 다운로드하지 않고 파일명만', async () => {
    const { ctx, m, saveAttachment } = await collectWith([imgLog('1', { fileName: 'a.xlsx', mimeType: 'application/vnd.ms-excel' })])
    expect(m.downloadChannelFile).not.toHaveBeenCalled()
    expect(saveAttachment).not.toHaveBeenCalled()
    expect(ctx.messages[0].attachment?.localPath).toBeUndefined()
    expect(ctx.messages[0].attachment?.fileName).toBe('a.xlsx')
  })

  it('최대 4장까지만 내려받는다 (나머지는 메타만)', async () => {
    const logs = Array.from({ length: 6 }, (_, i) => imgLog(String(6 - i)))
    const { ctx, m } = await collectWith(logs)
    expect(m.downloadChannelFile).toHaveBeenCalledTimes(4)
    expect(ctx.messages.filter((x) => x.attachment?.localPath)).toHaveLength(4)
    expect(ctx.messages).toHaveLength(6)
  })

  it('5MB 초과 이미지는 제외, 정확히 5MB 는 포함', async () => {
    const { ctx, m } = await collectWith([
      imgLog('2', { fileSize: 5 * 1024 * 1024 + 1 }),
      imgLog('1', { fileSize: 5 * 1024 * 1024 })
    ])
    expect(m.downloadChannelFile).toHaveBeenCalledTimes(1)
    expect(m.downloadChannelFile).toHaveBeenCalledWith('ch1', 'f-1')
    expect(ctx.messages.find((x) => x.attachment?.fileId === 'f-2')?.attachment?.localPath).toBeUndefined()
  })

  it('fileSize 를 모르면 다운로드 시도', async () => {
    const log = imgLog('1')
    delete (log.file as Record<string, unknown>).fileSize
    const { m } = await collectWith([log])
    expect(m.downloadChannelFile).toHaveBeenCalledTimes(1)
  })

  it('다운로드 실패 시 localPath 없이 첨부 메타만 남고 수집은 계속', async () => {
    const m = makeRichMessenger({ ch1: () => [imgLog('1')] })
    m.downloadChannelFile.mockRejectedValue(new Error('403'))
    const save = vi.fn()
    const ctx = await new ContextCollector(m as never).collect('ch1', '1', 5, undefined, { saveAttachment: save })
    expect(save).not.toHaveBeenCalled()
    expect(ctx.messages[0].attachment?.fileId).toBe('f-1')
    expect(ctx.messages[0].attachment?.localPath).toBeUndefined()
  })

  it('다운로드 실패도 4장 한도를 소모한다', async () => {
    const logs = Array.from({ length: 5 }, (_, i) => imgLog(String(5 - i)))
    const m = makeRichMessenger({ ch1: () => logs })
    m.downloadChannelFile.mockRejectedValue(new Error('x'))
    await new ContextCollector(m as never).collect('ch1', '5', 50, undefined, { saveAttachment: vi.fn() })
    expect(m.downloadChannelFile).toHaveBeenCalledTimes(4)
  })

  it('saveAttachment 가 없으면 다운로드하지 않는다', async () => {
    const { m, ctx } = await collectWith([imgLog('1')], { save: false })
    expect(m.downloadChannelFile).not.toHaveBeenCalled()
    expect(ctx.messages[0].attachment?.localPath).toBeUndefined()
  })

  it('messenger 에 downloadChannelFile 이 없어도 동작', async () => {
    const { ctx } = await collectWith([imgLog('1')], { download: false })
    expect(ctx.messages[0].attachment?.fileName).toBe('1.png')
  })

  it('fileName 이 없으면 title, 그것도 없으면 file-{id}', async () => {
    const a = { ...imgLog('1'), text: '', file: { id: '9', title: '제목.png', mimeType: 'application/pdf' } }
    const b = { ...imgLog('2'), text: '', file: { id: '8', mimeType: 'application/pdf' } }
    const { ctx } = await collectWith([b, a])
    expect(ctx.messages.map((x) => x.attachment?.fileName)).toEqual(['제목.png', 'file-8'])
  })

  it('원글에 붙은 이미지는 부모 채널 id 로 내려받는다', async () => {
    const root = { ...imgLog('root'), thread: { channelId: 'thr1' } }
    const m = makeRichMessenger({ thr1: () => [makeLog('r1') as AnyLog], p1: () => [root] })
    const ctx = await new ContextCollector(m as never).collect('thr1', 'r1', 50, undefined, {
      parentChannelId: 'p1',
      saveAttachment: (id, name) => `attachments/${id}-${name}`
    })
    expect(m.downloadChannelFile).toHaveBeenCalledWith('p1', 'f-root')
    expect(ctx.threadRoot?.attachment?.localPath).toBe('attachments/f-root-root.png')
  })
})

describe('ContextCollector — 비밀값 마스킹', () => {
  it('본문의 비밀값을 가리고 maskedSecrets 에 합계', async () => {
    const logs = [
      makeLog('3', { text: 'DB 접속 mysql://admin:hunter22@db:3306/x' }),
      makeLog('2', { text: 'password: abc12345 와 ghp_abcdefghijklmnopqrstuvwxyz0123456789' }),
      makeLog('1', { text: '평범한 문장' })
    ]
    const ctx = await new ContextCollector(makeMessenger(logs) as never).collect('ch1', '3', 10)
    expect(ctx.maskedSecrets).toBe(3)
    expect(ctx.messages.map((x) => x.text).join('\n')).not.toMatch(/hunter22|abc12345|ghp_/)
  })

  it('원글의 비밀값도 합계에 포함', async () => {
    const root = { ...makeLog('root', { text: 'token: secretvalue1' }), thread: { channelId: 'thr1' } }
    const m = makeRichMessenger({ thr1: () => [makeLog('r1', { text: 'password=zzzzzz9' }) as AnyLog], p1: () => [root] })
    const ctx = await new ContextCollector(m as never).collect('thr1', 'r1', 50, undefined, { parentChannelId: 'p1' })
    expect(ctx.maskedSecrets).toBe(2)
    expect(ctx.threadRoot?.text).toBe('token: ****')
  })

  it('수천 자 한 줄은 잘려서 들어온다', async () => {
    const ctx = await new ContextCollector(makeMessenger([makeLog('1', { text: 'x'.repeat(5000) })]) as never).collect('ch1', '1', 5)
    expect(ctx.messages[0].text).toContain('…(3000자 생략)')
  })

  it('비밀값이 없으면 0', async () => {
    const ctx = await new ContextCollector(makeMessenger([makeLog('1')]) as never).collect('ch1', '1', 5)
    expect(ctx.maskedSecrets).toBe(0)
  })
})
