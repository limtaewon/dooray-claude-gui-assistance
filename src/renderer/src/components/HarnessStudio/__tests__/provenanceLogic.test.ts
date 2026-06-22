import { describe, it, expect } from 'vitest'
import { SOURCE_CONFIG } from '../shared/ProvenanceBadge'
import { countProvenance } from '../import/NormalizeStep'
import type { FieldSource } from '@shared/types/harness'

describe('ProvenanceBadge — SOURCE_CONFIG 매핑', () => {
  const sources: FieldSource[] = ['static', 'ai', 'inferred', 'absent']

  it('모든 FieldSource 에 대한 설정이 있음', () => {
    for (const src of sources) {
      expect(SOURCE_CONFIG[src]).toBeDefined()
    }
  })

  it('각 source 에 short, label, tone, icon 이 정의됨', () => {
    for (const src of sources) {
      const cfg = SOURCE_CONFIG[src]
      expect(cfg.short.length).toBeGreaterThan(0)
      expect(cfg.label.length).toBeGreaterThan(0)
      expect(cfg.tone).toBeTruthy()
      expect(cfg.icon).toBeTruthy()
    }
  })

  it('static 은 emerald 톤', () => {
    expect(SOURCE_CONFIG.static.tone).toBe('emerald')
  })

  it('ai 는 blue 톤', () => {
    expect(SOURCE_CONFIG.ai.tone).toBe('blue')
  })

  it('inferred 는 yellow 톤', () => {
    expect(SOURCE_CONFIG.inferred.tone).toBe('yellow')
  })

  it('absent 는 neutral 톤', () => {
    expect(SOURCE_CONFIG.absent.tone).toBe('neutral')
  })
})

describe('countProvenance — provenance 맵 집계', () => {
  it('빈 맵은 모두 0', () => {
    const result = countProvenance({})
    expect(result).toEqual({ static: 0, ai: 0, inferred: 0, absent: 0 })
  })

  it('각 source 카운트', () => {
    const provenance: Record<string, string> = {
      'meta.name': 'static',
      'meta.author': 'ai',
      'agents[0].role': 'ai',
      'agents[0].model': 'inferred',
      'meta.tagline': 'absent'
    }
    const result = countProvenance(provenance)
    expect(result.static).toBe(1)
    expect(result.ai).toBe(2)
    expect(result.inferred).toBe(1)
    expect(result.absent).toBe(1)
  })

  it('알 수 없는 source 는 카운트에서 제외', () => {
    const provenance = { 'field.x': 'unknown-source', 'field.y': 'static' }
    const result = countProvenance(provenance)
    expect(result.static).toBe(1)
    expect(result.ai).toBe(0)
  })

  it('전부 ai 인 경우', () => {
    const provenance = {
      'a': 'ai', 'b': 'ai', 'c': 'ai'
    }
    const result = countProvenance(provenance)
    expect(result.ai).toBe(3)
    expect(result.static).toBe(0)
  })
})
