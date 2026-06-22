/**
 * BundleScanner.test.ts — BundleScanner 단위 테스트
 *
 * 픽스처:
 * - reined-fixture: _core/ + _agents/ + developer/SKILL.md + _hooks/gate.sh + _templates/
 * - neon-fixture: _core/ + developer/SKILL.md + _hooks/gate-check.sh + blocks/pipeline.sh (model 없음)
 * - partial-fixture: SKILL.md 단일
 *
 * 검증:
 * - 에이전트 스텁 수집 (id / displayName / model / tools)
 * - gate 스크립트 규칙코드 추출 (R501, NEON-G01 등)
 * - kind 감지
 * - warnings graceful degradation
 * - bundleHash 일관성
 */

import { describe, it, expect } from 'vitest'
import * as path from 'path'
import { BundleScanner, extractRuleCodes, extractRuleDetails, detectBlocking, parseGateScript } from '../BundleScanner'

const FIXTURES_DIR = path.join(__dirname, 'fixtures')
const REINED_FIXTURE = path.join(FIXTURES_DIR, 'reined-fixture')
const NEON_FIXTURE = path.join(FIXTURES_DIR, 'neon-fixture')
const PARTIAL_FIXTURE = path.join(FIXTURES_DIR, 'partial-fixture')

// ─────────────────────────────────────────────
// extractRuleCodes (순수 함수 — 단위 테스트)
// ─────────────────────────────────────────────

describe('extractRuleCodes', () => {
  it('R5xx 형태 reined 스타일 코드를 추출한다', () => {
    const script = `
gate_fail R501 "impl-log.md 없음"
gate_fail R510 "결정 사항 누락"
gate_fail R560 "release-notes 없음"
`
    const codes = extractRuleCodes(script)
    expect(codes).toContain('R501')
    expect(codes).toContain('R510')
    expect(codes).toContain('R560')
  })

  it('NEON-Gxx 형태 neon 스타일 코드를 추출한다', () => {
    const script = `
gate_fail NEON-G01 "brief.md 없음"
gate_fail NEON-G51 "P0 취약점 존재"
`
    const codes = extractRuleCodes(script)
    expect(codes).toContain('NEON-G01')
    expect(codes).toContain('NEON-G51')
  })

  it('NEON-AOP01, NEON-LYR01 도메인 코드를 추출한다', () => {
    const script = `
gate_fail NEON-AOP01 "@Transactional 금지"
gate_fail NEON-LYR01 "Controller→Mapper 직접참조 금지"
`
    const codes = extractRuleCodes(script)
    expect(codes).toContain('NEON-AOP01')
    expect(codes).toContain('NEON-LYR01')
  })

  it('코드가 없으면 빈 배열을 반환한다', () => {
    const codes = extractRuleCodes('echo "hello world"')
    expect(codes).toHaveLength(0)
  })

  it('중복 코드를 제거한다', () => {
    const script = `gate_fail R501 "a"\ngate_fail R501 "b"\n`
    const codes = extractRuleCodes(script)
    const r501Count = codes.filter((c) => c === 'R501').length
    expect(r501Count).toBe(1)
  })
})

describe('detectBlocking', () => {
  it('exit 1 이 있으면 blocking=true', () => {
    expect(detectBlocking('exit 1')).toBe(true)
  })

  it('exit 2 가 있으면 blocking=true', () => {
    expect(detectBlocking('if [ $? -ne 0 ]; then exit 2; fi')).toBe(true)
  })

  it('exit 0 만 있으면 blocking=false', () => {
    expect(detectBlocking('exit 0')).toBe(false)
  })

  it('exit 문 없으면 blocking=false', () => {
    expect(detectBlocking('echo "hello"')).toBe(false)
  })
})

describe('parseGateScript', () => {
  it('reined 스타일 gate.sh 파싱: phase 라벨 + 규칙코드 추출', () => {
    const script = `
case "$PHASE" in
  dev)
    gate_fail R501 "impl-log.md 없음"
    ;;
  qa)
    gate_fail R520 "qa-report.md 없음"
    gate_fail R551 "P0 취약점 존재"
    ;;
  release)
    gate_fail R560 "release-notes.md 없음"
    ;;
esac
exit 1
`
    const gates = parseGateScript(script, '_hooks/gate.sh')
    expect(gates.length).toBeGreaterThanOrEqual(1)
    expect(gates.some((g) => g.phase === 'dev')).toBe(true)
    expect(gates.some((g) => g.phase === 'qa')).toBe(true)
    expect(gates.some((g) => g.phase === 'release')).toBe(true)
    // 모든 게이트가 blocking (exit 1 있음)
    expect(gates.every((g) => g.blocking)).toBe(true)
  })

  it('neon 스타일 gate-check.sh 파싱: NEON-G 코드 추출', () => {
    const script = `
case "$PHASE" in
  analyst)
    gate_fail NEON-G01 "brief.md 없음" ;;
  dev)
    gate_fail NEON-G05 "impl-log.md 없음"
    gate_fail NEON-AOP01 "@Transactional 금지" ;;
esac
exit 2
`
    const gates = parseGateScript(script, '_hooks/gate-check.sh')
    const allCodes = gates.flatMap((g) => g.ruleCodes)
    expect(allCodes).toContain('NEON-G01')
    expect(allCodes).toContain('NEON-G05')
    expect(allCodes).toContain('NEON-AOP01')
    expect(gates.every((g) => g.blocking)).toBe(true)
  })

  it('phase 없는 스크립트는 단일 게이트(phase=*) 로 반환한다', () => {
    const script = `gate_fail R501 "something"\nexit 1\n`
    const gates = parseGateScript(script, 'gate.sh')
    expect(gates).toHaveLength(1)
    expect(gates[0].phase).toBe('*')
    expect(gates[0].ruleCodes).toContain('R501')
  })
})

// ─────────────────────────────────────────────
// BundleScanner.scan — fixture 기반 통합 테스트
// ─────────────────────────────────────────────

describe('BundleScanner.scan — reined-fixture', () => {
  it('kind 가 bundle 이다', async () => {
    const scanner = new BundleScanner()
    const result = await scanner.scan(REINED_FIXTURE)
    expect(result.kind).toBe('bundle')
  })

  it('developer 에이전트 스텁을 수집한다', async () => {
    const scanner = new BundleScanner()
    const result = await scanner.scan(REINED_FIXTURE)
    const dev = result.agentStubs.find((a) => a.id.includes('developer'))
    expect(dev).toBeDefined()
    expect(dev?.model).toBe('sonnet')
    expect(dev?.modelSource).toBe('static')
    expect(dev?.tools).toContain('Read')
    expect(dev?.tools).toContain('Edit')
  })

  it('qa 에이전트 스텁을 수집한다 (model: haiku)', async () => {
    const scanner = new BundleScanner()
    const result = await scanner.scan(REINED_FIXTURE)
    const qa = result.agentStubs.find((a) => a.id.includes('qa'))
    expect(qa).toBeDefined()
    expect(qa?.model).toBe('haiku')
  })

  it('gate.sh 에서 규칙코드를 추출한다', async () => {
    const scanner = new BundleScanner()
    const result = await scanner.scan(REINED_FIXTURE)
    const allCodes = result.gates.flatMap((g) => g.ruleCodes)
    // gate.sh 픽스처에는 R501, R520, R551, R560 이 있다
    expect(allCodes).toContain('R501')
    expect(allCodes).toContain('R560')
  })

  it('게이트는 blocking=true 이다 (exit 1 있음)', async () => {
    const scanner = new BundleScanner()
    const result = await scanner.scan(REINED_FIXTURE)
    expect(result.gates.length).toBeGreaterThan(0)
    expect(result.gates.some((g) => g.blocking)).toBe(true)
  })

  it('_templates/*.md 를 파싱한다', async () => {
    // reined-fixture 에는 _templates 없음 — 없어도 크래시하지 않는다
    const scanner = new BundleScanner()
    const result = await scanner.scan(REINED_FIXTURE)
    expect(result.templates).toBeInstanceOf(Array)
  })

  it('bundleHash 가 hex 64자 문자열이다', async () => {
    const scanner = new BundleScanner()
    const result = await scanner.scan(REINED_FIXTURE)
    expect(result.bundleHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('같은 경로를 두 번 스캔하면 동일한 bundleHash 를 반환한다', async () => {
    const scanner = new BundleScanner()
    const r1 = await scanner.scan(REINED_FIXTURE)
    const r2 = await scanner.scan(REINED_FIXTURE)
    expect(r1.bundleHash).toBe(r2.bundleHash)
  })

  it('fileTree 에 상대경로 목록이 있다', async () => {
    const scanner = new BundleScanner()
    const result = await scanner.scan(REINED_FIXTURE)
    expect(result.fileTree.length).toBeGreaterThan(0)
    // 모두 상대경로여야 함 (절대경로 포함 안 됨)
    for (const p of result.fileTree) {
      expect(path.isAbsolute(p)).toBe(false)
    }
  })
})

describe('BundleScanner.scan — neon-fixture', () => {
  it('kind 가 bundle 이다', async () => {
    const scanner = new BundleScanner()
    const result = await scanner.scan(NEON_FIXTURE)
    expect(result.kind).toBe('bundle')
  })

  it('developer 에이전트 스텁을 수집한다 (model 없음 → unknown, absent)', async () => {
    const scanner = new BundleScanner()
    const result = await scanner.scan(NEON_FIXTURE)
    const dev = result.agentStubs.find((a) => a.id.includes('developer'))
    expect(dev).toBeDefined()
    // neon-fixture developer 는 model: 없음 → unknown + absent
    expect(dev?.model).toBe('unknown')
    expect(dev?.modelSource).toBe('absent')
  })

  it('mcp__ 형태 도구명을 tools 에 포함한다', async () => {
    const scanner = new BundleScanner()
    const result = await scanner.scan(NEON_FIXTURE)
    const dev = result.agentStubs.find((a) => a.id.includes('developer'))
    expect(dev?.tools).toContain('mcp__mysql__query')
    expect(dev?.tools).toContain('mcp__mysql__find_tables')
  })

  it('gate-check.sh 에서 NEON 코드를 추출한다', async () => {
    const scanner = new BundleScanner()
    const result = await scanner.scan(NEON_FIXTURE)
    const allCodes = result.gates.flatMap((g) => g.ruleCodes)
    expect(allCodes).toContain('NEON-G01')
    expect(allCodes).toContain('NEON-G05')
    expect(allCodes).toContain('NEON-AOP01')
    expect(allCodes).toContain('NEON-LYR01')
  })

  it('neon gate 는 exit 2 로 blocking=true 이다', async () => {
    const scanner = new BundleScanner()
    const result = await scanner.scan(NEON_FIXTURE)
    expect(result.gates.some((g) => g.blocking)).toBe(true)
  })
})

describe('BundleScanner.scan — partial-fixture', () => {
  it('kind 가 partial-skill 이다', async () => {
    const scanner = new BundleScanner()
    const result = await scanner.scan(PARTIAL_FIXTURE)
    expect(result.kind).toBe('partial-skill')
  })

  it('partial-skill 경고 메시지가 있다', async () => {
    const scanner = new BundleScanner()
    const result = await scanner.scan(PARTIAL_FIXTURE)
    expect(result.warnings.some((w) => w.includes('partial-skill'))).toBe(true)
  })

  it('에이전트 스텁 1개를 수집한다', async () => {
    const scanner = new BundleScanner()
    const result = await scanner.scan(PARTIAL_FIXTURE)
    expect(result.agentStubs.length).toBeGreaterThanOrEqual(1)
    const reviewer = result.agentStubs.find((a) => a.id.includes('reviewer'))
    expect(reviewer).toBeDefined()
    expect(reviewer?.model).toBe('haiku')
  })
})

describe('BundleScanner.scan — 존재하지 않는 경로', () => {
  it('크래시 없이 warnings 에 기록하고 빈 결과를 반환한다', async () => {
    const scanner = new BundleScanner()
    const result = await scanner.scan('/nonexistent/path/does/not/exist')
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.agentStubs).toEqual([])
    expect(result.gates).toEqual([])
    expect(result.bundleHash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('BundleScanner.toSummary', () => {
  it('RawBundle 을 RawBundleSummary 로 변환한다', async () => {
    const scanner = new BundleScanner()
    const raw = await scanner.scan(REINED_FIXTURE)
    const summary = scanner.toSummary(raw)

    expect(summary.kind).toBe(raw.kind)
    expect(summary.fileTree).toEqual(raw.fileTree)
    expect(summary.agentStubs).toEqual(raw.agentStubs)
    expect(summary.warnings).toEqual(raw.warnings)
  })
})

// ─────────────────────────────────────────────
// reined vs neon — bundleHash 독립성
// ─────────────────────────────────────────────

describe('BundleScanner — reined vs neon 번들 해시 독립성', () => {
  it('서로 다른 번들은 다른 bundleHash 를 가진다', async () => {
    const scanner = new BundleScanner()
    const [reined, neon] = await Promise.all([
      scanner.scan(REINED_FIXTURE),
      scanner.scan(NEON_FIXTURE),
    ])
    expect(reined.bundleHash).not.toBe(neon.bundleHash)
  })
})

// ─────────────────────────────────────────────
// AgentSourceMap — M1 출처 추적 테스트
// ─────────────────────────────────────────────

describe('BundleScanner — agentSourceMap (M1 출처 추적)', () => {
  describe('reined-fixture — _agents/*.md 에서 model 출처 추적', () => {
    it('agentSourceMap 이 비어있지 않다', async () => {
      const scanner = new BundleScanner()
      const result = await scanner.scan(REINED_FIXTURE)
      expect(Object.keys(result.agentSourceMap).length).toBeGreaterThan(0)
    })

    it('developer 에이전트의 nameFile 이 _agents/ 파일이다', async () => {
      const scanner = new BundleScanner()
      const result = await scanner.scan(REINED_FIXTURE)
      const dev = result.agentStubs.find((a) => a.id.includes('developer'))
      expect(dev).toBeDefined()
      const src = result.agentSourceMap[dev!.id]
      expect(src).toBeDefined()
      expect(src.nameFile).toMatch(/^_agents\//)
    })

    it('developer 에이전트의 modelFile 이 존재한다 (_agents/*.md 에 model: sonnet 있음)', async () => {
      const scanner = new BundleScanner()
      const result = await scanner.scan(REINED_FIXTURE)
      const dev = result.agentStubs.find((a) => a.id.includes('developer'))
      expect(dev).toBeDefined()
      const src = result.agentSourceMap[dev!.id]
      expect(src.modelFile).toBeDefined()
      // modelFile 은 nameFile 과 동일 (_agents/*.md 가 model 도 정의함)
      expect(src.modelFile).toBe(src.nameFile)
    })

    it('developer 에이전트의 toolsFile 이 존재한다', async () => {
      const scanner = new BundleScanner()
      const result = await scanner.scan(REINED_FIXTURE)
      const dev = result.agentStubs.find((a) => a.id.includes('developer'))
      expect(dev).toBeDefined()
      const src = result.agentSourceMap[dev!.id]
      expect(src.toolsFile).toBeDefined()
    })

    it('agentSourceMap 키가 agentStubs id 집합과 일치한다', async () => {
      const scanner = new BundleScanner()
      const result = await scanner.scan(REINED_FIXTURE)
      const stubIds = new Set(result.agentStubs.map((a) => a.id))
      const mapIds = new Set(Object.keys(result.agentSourceMap))
      expect(mapIds).toEqual(stubIds)
    })
  })

  describe('neon-fixture — SKILL.md 에 model 키 없음 → modelFile undefined', () => {
    it('developer 에이전트의 nameFile 이 SKILL.md 이다', async () => {
      const scanner = new BundleScanner()
      const result = await scanner.scan(NEON_FIXTURE)
      const dev = result.agentStubs.find((a) => a.id.includes('developer'))
      expect(dev).toBeDefined()
      const src = result.agentSourceMap[dev!.id]
      expect(src).toBeDefined()
      expect(src.nameFile).toMatch(/SKILL\.md$/)
    })

    it('neon developer 에이전트의 modelFile 이 undefined (model 키 부재)', async () => {
      const scanner = new BundleScanner()
      const result = await scanner.scan(NEON_FIXTURE)
      const dev = result.agentStubs.find((a) => a.id.includes('developer'))
      expect(dev).toBeDefined()
      // neon-fixture developer SKILL.md 에는 model: 키가 없다
      expect(dev?.modelSource).toBe('absent')
      const src = result.agentSourceMap[dev!.id]
      expect(src.modelFile).toBeUndefined()
    })

    it('neon developer 에이전트의 toolsFile 이 SKILL.md 이다 (allowed-tools 있음)', async () => {
      const scanner = new BundleScanner()
      const result = await scanner.scan(NEON_FIXTURE)
      const dev = result.agentStubs.find((a) => a.id.includes('developer'))
      expect(dev).toBeDefined()
      const src = result.agentSourceMap[dev!.id]
      expect(src.toolsFile).toBeDefined()
      expect(src.toolsFile).toMatch(/SKILL\.md$/)
    })

    it('agentSourceMap 키가 agentStubs id 집합과 일치한다', async () => {
      const scanner = new BundleScanner()
      const result = await scanner.scan(NEON_FIXTURE)
      const stubIds = new Set(result.agentStubs.map((a) => a.id))
      const mapIds = new Set(Object.keys(result.agentSourceMap))
      expect(mapIds).toEqual(stubIds)
    })
  })

  describe('agentSourceMap 은 기존 agentStubs 값에 영향을 주지 않는다 (회귀 0)', () => {
    it('reined developer model 값이 변경되지 않는다', async () => {
      const scanner = new BundleScanner()
      const result = await scanner.scan(REINED_FIXTURE)
      const dev = result.agentStubs.find((a) => a.id.includes('developer'))
      expect(dev?.model).toBe('sonnet')
      expect(dev?.modelSource).toBe('static')
    })

    it('neon developer model 값이 변경되지 않는다', async () => {
      const scanner = new BundleScanner()
      const result = await scanner.scan(NEON_FIXTURE)
      const dev = result.agentStubs.find((a) => a.id.includes('developer'))
      expect(dev?.model).toBe('unknown')
      expect(dev?.modelSource).toBe('absent')
    })

    it('toSummary 는 agentSourceMap 을 포함하지 않는다 (기존 시그니처 불변)', async () => {
      const scanner = new BundleScanner()
      const raw = await scanner.scan(REINED_FIXTURE)
      const summary = scanner.toSummary(raw)
      // RawBundleSummary 에 agentSourceMap 필드가 없음을 확인
      expect('agentSourceMap' in summary).toBe(false)
    })
  })
})

describe('extractRuleDetails — 규칙 코드별 메시지 추출', () => {
  it('bare 코드 형태(gate_fail R510 "msg")에서 코드+메시지 추출', () => {
    const s = 'gate_fail R510 "\'## 결정 사항\' 섹션 누락"'
    const d = extractRuleDetails(s)
    expect(d).toContainEqual({ code: 'R510', message: "'## 결정 사항' 섹션 누락" })
  })

  it('NEON 코드 형태(NEON-G01 "msg")', () => {
    const d = extractRuleDetails('NEON-G01 "brief.md 없음"')
    expect(d).toContainEqual({ code: 'NEON-G01', message: 'brief.md 없음' })
  })

  it('quoted 코드 형태(block "NEON-PUSH01" "msg")에서 메시지만 추출', () => {
    const d = extractRuleDetails('  block "NEON-PUSH01" "main/master 강제 푸시 금지"')
    const found = d.find((x) => x.code === 'NEON-PUSH01')
    expect(found?.message).toBe('main/master 강제 푸시 금지')
  })

  it('중첩 따옴표($(basename))가 있어도 끝 따옴표까지 메시지 보존', () => {
    const s = 'NEON-G10 "$(basename "$f"): \'## 설계\' 섹션 누락"'
    const found = extractRuleDetails(s).find((x) => x.code === 'NEON-G10')
    expect(found?.message).toContain('섹션 누락')
  })

  it('코드별 첫 메시지만 채택(중복 무시)', () => {
    const s = 'R501 "first"\nR501 "second"'
    const r501 = extractRuleDetails(s).filter((x) => x.code === 'R501')
    expect(r501).toHaveLength(1)
    expect(r501[0].message).toBe('first')
  })
})
