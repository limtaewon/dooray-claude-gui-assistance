/**
 * Doctor 패널 (PRD §12-7).
 *
 * AI 없이 HarnessModel 정적 정합성을 점검하고
 * PASS / WARN / FAIL 결과와 6축 약점 요약을 표시한다.
 *
 * 점검 항목:
 * - 체인 미포함 에이전트 (고아 에이전트)
 * - 체인에 참조되나 정의 없는 에이전트
 * - 소비자 없는 산출물
 * - 생산자 없는 산출물
 * - 게이트-페이즈 불일치
 * - model unknown 에이전트
 * - score 결측
 */

import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Stethoscope,
  BarChart2,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { useState } from 'react'
import type { HarnessModel } from '@shared/types/harness'
import Card from '@/components/common/ds/Card'
import Chip from '@/components/common/ds/Chip'
import { ViewExplainer } from '../shared/ViewExplainer'
import { runDoctorChecks } from './doctorUtils'
import type { CheckResult, CheckSeverity, WeakAxisSummary } from './doctorUtils'

export interface DoctorPanelProps {
  model: HarnessModel
  sourcePath?: string
}

// ─────────────────────────────────────────────
// 심각도 표시 헬퍼
// ─────────────────────────────────────────────

type ChipTone = 'emerald' | 'yellow' | 'red' | 'neutral' | 'blue' | 'orange' | 'violet'

function severityChipTone(severity: CheckSeverity): ChipTone {
  switch (severity) {
    case 'PASS': return 'emerald'
    case 'WARN': return 'yellow'
    case 'FAIL': return 'red'
  }
}

function SeverityIcon({ severity, size = 13 }: { severity: CheckSeverity; size?: number }): JSX.Element {
  switch (severity) {
    case 'PASS':
      return <CheckCircle size={size} className="text-[color:var(--c-emerald-fg)]" />
    case 'WARN':
      return <AlertTriangle size={size} className="text-[color:var(--c-yellow-fg)]" />
    case 'FAIL':
      return <XCircle size={size} className="text-[color:var(--c-red-fg)]" />
  }
}

// ─────────────────────────────────────────────
// 단일 점검 결과 카드
// ─────────────────────────────────────────────

function CheckCard({ check }: { check: CheckResult }): JSX.Element {
  const [expanded, setExpanded] = useState(check.severity !== 'PASS')
  const tone = severityChipTone(check.severity)

  return (
    <Card className="flex flex-col gap-1.5 overflow-hidden p-0">
      {/* 헤더 — check.items 있을 때 전체 행이 클릭 타겟 */}
      <div
        className={`flex items-center gap-2 p-3 ${check.items.length > 0 ? 'cursor-pointer select-none hover:bg-[color:var(--bg-surface-hover)] transition-colors' : ''}`}
        role={check.items.length > 0 ? 'button' : undefined}
        tabIndex={check.items.length > 0 ? 0 : undefined}
        aria-expanded={check.items.length > 0 ? expanded : undefined}
        onClick={check.items.length > 0 ? () => setExpanded((v) => !v) : undefined}
        onKeyDown={check.items.length > 0 ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v) } } : undefined}
      >
        <SeverityIcon severity={check.severity} size={13} />
        <span className="text-sm font-medium text-[color:var(--text-primary)] flex-1">
          {check.title}
        </span>
        <Chip tone={tone} square>{check.severity}</Chip>
        {check.items.length > 0 && (
          <span className="flex-none text-[color:var(--text-tertiary)]" aria-hidden>
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        )}
      </div>

      <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed px-3 pb-2">
        {check.detail}
      </p>

      {expanded && check.items.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1 pb-3 px-3 border-t border-[color:var(--bg-border)]">
          {check.items.map((item) => (
            <span key={item} className="ds-chip sq neutral font-mono text-xs">
              {item}
            </span>
          ))}
        </div>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────
// 6축 약점 요약
// ─────────────────────────────────────────────

function WeakAxesSection({ weakAxes }: { weakAxes: WeakAxisSummary[] }): JSX.Element | null {
  if (weakAxes.length === 0) return null

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 size={14} className="text-[color:var(--c-blue-fg)]" />
        <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
          6축 약점 요약 (낮은 순)
        </h2>
      </div>
      <Card>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[color:var(--bg-border)]">
              <th className="text-left py-1.5 pr-4 text-[color:var(--text-secondary)] font-medium">축</th>
              <th className="text-left py-1.5 pr-4 text-[color:var(--text-secondary)] font-medium w-32">점수</th>
              <th className="text-left py-1.5 text-[color:var(--text-secondary)] font-medium">근거</th>
            </tr>
          </thead>
          <tbody>
            {weakAxes.map((axis) => {
              const isWeak = axis.percent < 40
              return (
                <tr
                  key={axis.key}
                  className="border-b border-[color:var(--bg-border)] last:border-0"
                >
                  <td className="py-2 pr-4 font-medium text-[color:var(--text-primary)] whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {isWeak && <AlertTriangle size={10} className="text-[color:var(--c-yellow-fg)] flex-none" />}
                      {axis.label}
                    </div>
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-[color:var(--bg-border)] overflow-hidden min-w-[48px]">
                        <div
                          className="h-full rounded-full bg-[color:var(--clauday-blue)]"
                          style={{ width: `${axis.percent}%` }}
                        />
                      </div>
                      <span className="text-[color:var(--text-secondary)] tabular-nums whitespace-nowrap">
                        {axis.percent}%
                      </span>
                    </div>
                  </td>
                  <td className="py-2 text-[color:var(--text-tertiary)]">
                    {axis.note ?? '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </section>
  )
}

// ─────────────────────────────────────────────
// Doctor 패널 본체
// ─────────────────────────────────────────────

/**
 * Doctor 패널 본체.
 *
 * 섹션:
 * 0. ViewExplainer 해설 배너
 * 1. 전체 요약 (overallSeverity, FAIL/WARN 카운트)
 * 2. 점검 결과 목록 (FAIL → WARN → PASS 순)
 * 3. 6축 약점 요약 (score 있을 때만)
 */
export function DoctorPanel({ model, sourcePath }: DoctorPanelProps): JSX.Element {
  const report = runDoctorChecks(model)

  // FAIL → WARN → PASS 순 정렬
  const sortedChecks = [...report.checks].sort((a, b) => {
    const order: Record<CheckSeverity, number> = { FAIL: 0, WARN: 1, PASS: 2 }
    return order[a.severity] - order[b.severity]
  })

  const overallTone = severityChipTone(report.overallSeverity)
  const path = sourcePath ?? model.meta.source

  return (
    <div className="flex flex-col">
      <ViewExplainer
        title="진단 / 구조 점검"
        howto={
          <span>
            AI 없이 하네스 구조의 정합성을 자동 점검합니다 (저자 셀프-진단용).
            호출되지 않는 에이전트, 소비자 없는 산출물, model=unknown 등을 검출합니다.{' '}
            <strong className="text-[color:var(--c-red-fg)]">FAIL</strong>=반드시 고쳐야 할 문제,{' '}
            <strong className="text-[color:var(--c-yellow-fg)]">WARN</strong>=개선 권고입니다.
          </span>
        }
        topic="이 점검 결과가 의미하는 것과 고칠 점을 설명"
        sourcePath={path}
        icon={Stethoscope}
      />
    <div className="flex flex-col gap-5 p-4">
      {/* 섹션 1 — 전체 요약 */}
      <section>
        <div className="flex items-center gap-3 flex-wrap p-3 rounded-lg border border-[color:var(--bg-border)] bg-[color:var(--bg-surface)]">
          <Stethoscope size={16} className="text-[color:var(--clauday-blue)] flex-none" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-[color:var(--text-primary)]">
                Doctor 점검 결과
              </span>
              <Chip tone={overallTone} square>{report.overallSeverity}</Chip>
            </div>
            <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
              {report.failCount === 0 && report.warnCount === 0
                ? '모든 점검을 통과했습니다.'
                : [
                    report.failCount > 0 && `${report.failCount}개 FAIL`,
                    report.warnCount > 0 && `${report.warnCount}개 WARN`
                  ].filter(Boolean).join(', ')
              }
            </p>
          </div>
          <div className="flex items-center gap-2">
            {report.failCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-[color:var(--c-red-fg)] font-semibold">
                <XCircle size={12} />{report.failCount}
              </span>
            )}
            {report.warnCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-[color:var(--c-yellow-fg)] font-semibold">
                <AlertTriangle size={12} />{report.warnCount}
              </span>
            )}
            {report.failCount === 0 && report.warnCount === 0 && (
              <span className="flex items-center gap-1 text-xs text-[color:var(--c-emerald-fg)] font-semibold">
                <CheckCircle size={12} />전체 통과
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 섹션 2 — 점검 결과 목록 */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Stethoscope size={14} className="text-[color:var(--text-secondary)]" />
          <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
            점검 항목
          </h2>
          <Chip tone="neutral" square>{report.checks.length}개</Chip>
        </div>
        <div className="flex flex-col gap-2">
          {sortedChecks.map((check) => (
            <CheckCard key={check.key} check={check} />
          ))}
        </div>
      </section>

      {/* 섹션 3 — 6축 약점 요약 */}
      <WeakAxesSection weakAxes={report.weakAxes} />

      {/* degradation 경고 */}
      {model.warnings.length > 0 && (
        <section>
          <div className="flex flex-col gap-1">
            {model.warnings.map((w, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-[color:var(--c-yellow-bg)] text-xs text-[color:var(--c-yellow-fg)]"
              >
                <AlertTriangle size={11} className="flex-none" />
                {w}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
    </div>
  )
}

export default DoctorPanel
