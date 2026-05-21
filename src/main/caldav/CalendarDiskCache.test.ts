import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron-store', async () => {
  const { MemElectronStore } = await import('../../../test/mocks/electron-store')
  return { default: MemElectronStore }
})

import { CalendarDiskCache } from './CalendarDiskCache'

beforeEach(() => {
  CalendarDiskCache.clearAll()
})

describe('CalendarDiskCache — events', () => {
  it('setEvents / getEvents', () => {
    CalendarDiskCache.setEvents('2026-05|2026-06', { ts: 1000, data: [] })
    expect(CalendarDiskCache.getEvents('2026-05|2026-06')).toEqual({ ts: 1000, data: [] })
  })

  it('없는 키는 undefined', () => {
    expect(CalendarDiskCache.getEvents('nope')).toBeUndefined()
  })

  it('invalidateAllEvents', () => {
    CalendarDiskCache.setEvents('k', { ts: 1, data: [] })
    CalendarDiskCache.invalidateAllEvents()
    expect(CalendarDiskCache.getEvents('k')).toBeUndefined()
  })
})

describe('CalendarDiskCache — ctags', () => {
  it('setCTag / getCTag', () => {
    CalendarDiskCache.setCTag('https://cal/a', 'ctag-1')
    const ce = CalendarDiskCache.getCTag('https://cal/a')!
    expect(ce.ctag).toBe('ctag-1')
    expect(typeof ce.checkedAt).toBe('number')
  })

  it('clearCTags', () => {
    CalendarDiskCache.setCTag('u', 'c')
    CalendarDiskCache.clearCTags()
    expect(CalendarDiskCache.getCTag('u')).toBeUndefined()
  })

  it('clearAll — events + ctags 모두', () => {
    CalendarDiskCache.setEvents('k', { ts: 1, data: [] })
    CalendarDiskCache.setCTag('u', 'c')
    CalendarDiskCache.clearAll()
    expect(CalendarDiskCache.getEvents('k')).toBeUndefined()
    expect(CalendarDiskCache.getCTag('u')).toBeUndefined()
  })
})
