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

  it('마크다운 헤더가 있으면 본문을 ```md 블록으로 감싼다', async () => {
    const m = makeMessenger()
    const r = new ClaudayResponder(m as never)
    await r.send('ch1', '# 헤더\n본문')
    const arg = m.sendMessage.mock.calls[0][1] as string
    expect(arg.startsWith('[Clauday]\n')).toBe(true)
    expect(arg).toContain('```md')
    expect(arg).toContain('# 헤더')
  })

  it('코드 펜스 영역은 그대로 두고 일반 영역만 ```md 로 감싼다', async () => {
    const m = makeMessenger()
    const r = new ClaudayResponder(m as never)
    await r.send('ch1', '설명입니다.\n```java\ncode\n```\n끝')
    const arg = m.sendMessage.mock.calls[0][1] as string
    expect(arg).toContain('```md')
    expect(arg).toContain('```java')
    expect(arg).toContain('code')
  })

  it('굵게/리스트도 마크다운으로 인식', async () => {
    const m = makeMessenger()
    const r = new ClaudayResponder(m as never)
    await r.send('ch1', '- 항목1\n- 항목2')
    const arg = m.sendMessage.mock.calls[0][1] as string
    expect(arg).toContain('```md')
  })

  it('전송 실패해도 throw 하지 않는다 (로그만)', async () => {
    const m = makeMessenger()
    m.sendMessage.mockRejectedValueOnce(new Error('boom'))
    const r = new ClaudayResponder(m as never)
    await expect(r.send('ch1', 'hi')).resolves.toBeUndefined()
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
