import { describe, it, expect, vi } from 'vitest'
import { ClaudayResponder, extractOrgId } from './ClaudayResponder'

function makeMessenger() {
  return {
    sendMessage: vi.fn().mockResolvedValue(undefined)
  } as unknown as import('../MessengerService').MessengerService & { sendMessage: ReturnType<typeof vi.fn> }
}

describe('ClaudayResponder.send', () => {
  it('짧은 평문은 [Clauday] prefix 한 줄로 전송', async () => {
    const m = makeMessenger()
    const r = new ClaudayResponder(m as never)
    await r.send('ch1', '안녕하세요')
    expect(m.sendMessage).toHaveBeenCalledWith('ch1', '[Clauday] 안녕하세요', undefined)
  })

  it('이미 [Clauday] prefix 가 있으면 중복하지 않는다', async () => {
    const m = makeMessenger()
    const r = new ClaudayResponder(m as never)
    await r.send('ch1', '[Clauday] 응답입니다')
    expect(m.sendMessage).toHaveBeenCalledWith('ch1', '[Clauday] 응답입니다', undefined)
  })

  it('organizationId 가 있으면 함께 전달', async () => {
    const m = makeMessenger()
    const r = new ClaudayResponder(m as never)
    await r.send('ch1', 'hi', 'org1')
    expect(m.sendMessage).toHaveBeenCalledWith('ch1', '[Clauday] hi', 'org1')
  })

  it('마크다운은 ```md 로 감싸지 않고 두레이에서 읽히는 평문으로 바꾼다', async () => {
    const m = makeMessenger()
    const r = new ClaudayResponder(m as never)
    await r.send('ch1', '# 헤더\n- 항목1\n- **굵게** 항목2')
    const arg = m.sendMessage.mock.calls[0][1] as string
    expect(arg).toBe('[Clauday]\n▍헤더\n• 항목1\n• 굵게 항목2')
    expect(arg).not.toContain('```md')
  })

  it('언어를 적은 코드 펜스는 그대로 둔다', async () => {
    const m = makeMessenger()
    const r = new ClaudayResponder(m as never)
    await r.send('ch1', '설명입니다.\n```java\ncode\n```\n끝')
    expect(m.sendMessage.mock.calls[0][1]).toBe('[Clauday]\n설명입니다.\n```java\ncode\n```\n끝')
  })

  it('보낸 메시지의 logId 를 돌려준다 — 진행 메시지를 나중에 고쳐 쓰기 위해', async () => {
    const m = makeMessenger()
    m.sendMessage.mockResolvedValueOnce('log-7')
    const r = new ClaudayResponder(m as never)
    await expect(r.send('ch1', 'hi')).resolves.toBe('log-7')
  })

  it('전송 실패해도 throw 하지 않고 null (warn 로그)', async () => {
    const m = makeMessenger()
    m.sendMessage.mockRejectedValueOnce(new Error('boom'))
    const r = new ClaudayResponder(m as never)
    await expect(r.send('ch1', 'hi')).resolves.toBeNull()
  })
})

describe('extractOrgId', () => {
  it('raw.references.channelMap[channelId].orgId 추출', () => {
    const orgId = extractOrgId({
      channelId: 'c1',
      raw: { references: { channelMap: { c1: { orgId: 'org-42' } } } } as never
    })
    expect(orgId).toBe('org-42')
  })

  it('channelId 누락 시 undefined', () => {
    expect(extractOrgId({ raw: {} as never })).toBeUndefined()
  })

  it('raw 누락 시 undefined', () => {
    expect(extractOrgId({ channelId: 'c1' })).toBeUndefined()
  })

  it('channelMap 에 해당 채널 없으면 undefined', () => {
    expect(extractOrgId({ channelId: 'c1', raw: { references: { channelMap: {} } } as never })).toBeUndefined()
  })
})
