import { describe, it, expect } from 'vitest'
import { canonicalBinding, parseBinding } from './binding'
import { KEYBINDINGS, effectiveBindings, findConflicts, findDefinition } from './registry'

describe('KEYBINDINGS 레지스트리', () => {
  it('id 가 중복되지 않는다', () => {
    const ids = KEYBINDINGS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('모든 기본 바인딩이 파싱 가능하다', () => {
    for (const def of KEYBINDINGS) {
      for (const binding of [...def.darwin, ...def.other]) {
        expect(parseBinding(binding), `${def.id}: ${binding}`).not.toBeNull()
      }
    }
  })

  it('모든 기본 바인딩이 이미 정규형이다 — 저장/비교 시 흔들리지 않게', () => {
    for (const def of KEYBINDINGS) {
      for (const binding of [...def.darwin, ...def.other]) {
        expect(canonicalBinding(binding), `${def.id}: ${binding}`).toBe(binding)
      }
    }
  })

  it('편집 가능한 항목은 최소 한 플랫폼에 기본값이 있다', () => {
    for (const def of KEYBINDINGS.filter((d) => !d.fixed)) {
      expect(def.darwin.length + def.other.length, def.id).toBeGreaterThan(0)
    }
  })
})

describe('effectiveBindings', () => {
  it('오버라이드가 없으면 플랫폼 기본값', () => {
    expect(effectiveBindings('terminal.splitRight', 'darwin')).toEqual(['Mod+D'])
    expect(effectiveBindings('terminal.splitRight', 'other')).toEqual(['Mod+Alt+D'])
  })

  it('오버라이드가 기본값을 대체한다', () => {
    expect(effectiveBindings('terminal.splitRight', 'darwin', { 'terminal.splitRight': ['Mod+Shift+E'] })).toEqual([
      'Mod+Shift+E'
    ])
  })

  it('빈 배열 오버라이드는 비활성 — 기본값으로 되돌아가지 않는다', () => {
    expect(effectiveBindings('terminal.newTab', 'darwin', { 'terminal.newTab': [] })).toEqual([])
  })

  it('모르는 id 는 빈 배열', () => {
    expect(effectiveBindings('nope.nope', 'darwin')).toEqual([])
  })
})

describe('findConflicts', () => {
  it('오버라이드가 없으면 기본값끼리의 중복은 보고하지 않는다 — 설정 화면 노이즈 방지', () => {
    expect(findConflicts('darwin')).toEqual([])
  })

  it('사용자가 만든 충돌을 스코프 단위로 잡는다', () => {
    const conflicts = findConflicts('darwin', { 'terminal.newTab': ['Mod+D'] })
    const hit = conflicts.find((c) => c.binding === 'Mod+D')
    expect(hit?.actionIds).toEqual(expect.arrayContaining(['terminal.newTab', 'terminal.splitRight']))
  })

  it('스코프가 다르면 충돌이 아니다', () => {
    const conflicts = findConflicts('darwin', { 'global.feedback': ['Mod+T'] })
    expect(conflicts.find((c) => c.binding === 'Mod+T')).toBeUndefined()
  })

  it('사용자가 안 건드린 액션끼리의 중복은 조용히 넘어간다', () => {
    const conflicts = findConflicts('darwin', { 'global.feedback': ['Mod+Shift+K'] })
    expect(conflicts.every((c) => c.actionIds.includes('global.feedback'))).toBe(true)
  })
})

describe('findDefinition', () => {
  it('정의를 찾거나 undefined', () => {
    expect(findDefinition('terminal.newTab')?.title).toBe('새 터미널 탭')
    expect(findDefinition('nope')).toBeUndefined()
  })
})
