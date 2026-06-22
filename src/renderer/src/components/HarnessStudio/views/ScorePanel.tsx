/**
 * Score 패널 (PRD §7-6).
 *
 * - 6축 레이더 차트 (recharts RadarChart)
 * - 총점 등급 배지
 * - 점수 여정 (축별 상세 테이블)
 * - score 없으면 EmptyView("점수 추정 불가/AI 재생성 안내")
 */

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip
} from 'recharts'
import { BarChart2, AlertTriangle, RefreshCw, Star } from 'lucide-react'
import type { HarnessModel } from '@shared/types/harness'
import Card from '@/components/common/ds/Card'
import Chip from '@/components/common/ds/Chip'
import { EmptyView } from '@/components/common/ds/StateViews'
import { ViewExplainer } from '../shared/ViewExplainer'
import {
  buildRadarData,
  scoreToGrade,
  findWeakestAxis,
  axisLabel
} from './scoreUtils'

export interface ScorePanelProps {
  model: HarnessModel
  sourcePath?: string
}

/** 6축 레이더 차트 */
function ScoreRadar({ model }: { model: HarnessModel }): JSX.Element {
  const score = model.score!
  const radarData = buildRadarData(score.axes)

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={radarData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
        <PolarGrid stroke="var(--bg-border)" />
        <PolarAngleAxis
          dataKey="axis"
          tick={{
            fontSize: 11,
            fill: 'var(--text-secondary)',
            fontFamily: 'inherit'
          }}
        />
        <Radar
          name="하네스 점수"
          dataKey="value"
          stroke="var(--clauday-blue)"
          fill="var(--clauday-blue)"
          fillOpacity={0.25}
          strokeWidth={2}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload as ReturnType<typeof buildRadarData>[0]
            return (
              <div className="ds-card raised text-xs p-2 max-w-[200px]">
                <p className="font-semibold text-[color:var(--text-primary)] mb-1">{d.axis}</p>
                <p className="text-[color:var(--text-secondary)]">
                  {d.raw} / {d.max} ({d.value}%)
                </p>
                {d.note && (
                  <p className="text-[color:var(--text-tertiary)] mt-1">{d.note}</p>
                )}
              </div>
            )
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}

/**
 * Score 패널 본체.
 *
 * score 가 undefined 이면 EmptyView — 절대 빈 레이더로 크래시하지 않는다.
 */
export function ScorePanel({ model, sourcePath }: ScorePanelProps): JSX.Element {
  // score 없음 — EmptyView
  if (!model.score) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <EmptyView
          icon={BarChart2}
          title="점수 추정 불가"
          body={
            <span className="text-center">
              번들에서 6축 점수를 계산할 수 없습니다.<br />
              하네스를 다시 가져와 AI 정규화를 실행하면<br />
              Sonnet 이 점수를 추정합니다.
            </span>
          }
          action={
            <div className="flex items-center gap-1.5 text-xs text-[color:var(--text-tertiary)]">
              <RefreshCw size={11} />
              <span>가져오기 위저드에서 "강제 재정규화" 를 선택하세요</span>
            </div>
          }
        />
      </div>
    )
  }

  const score = model.score
  const gradeResult = scoreToGrade(score)
  const weakestAxis = findWeakestAxis(score.axes)
  const path = sourcePath ?? model.meta.source

  return (
    <div className="flex flex-col">
      <ViewExplainer
        title="점수"
        howto={
          <span>
            이 하네스가 <strong>"고삐를 얼마나 잘 쥐는지"</strong> 6축으로 점수를 매긴 결과입니다.
            강제력·제어흐름·상태·차단게이트·피드백루프·관측가능성 각 축이 높을수록
            자율 에이전트를 더 단단하게 조율합니다. 점수는 <strong>구조 신호(게이트·hook·루프·레벨 등)
            기반으로 결정론적으로 계산</strong>되며(AI 추정 아님), 각 축의 산출 근거는 아래 표에 표시됩니다.
          </span>
        }
        topic="이 점수 6축이 각각 무엇을 의미하는지 설명"
        sourcePath={path}
        icon={BarChart2}
      />
    <div className="flex flex-col gap-5 p-4">
      {/* 헤더 — 총점 등급 */}
      <section>
        <div className="flex items-center gap-3 flex-wrap">
          <BarChart2 size={16} className="text-[color:var(--c-blue-fg)]" />
          <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">
            하네스 종합 점수
          </h2>
          <span className={`ds-chip sq ${gradeResult.tone} text-base font-bold px-3`}>
            {gradeResult.grade} · {gradeResult.percent}%
          </span>
          <Chip tone={gradeResult.tone} square>{gradeResult.label}</Chip>
          <span className="text-sm text-[color:var(--text-secondary)]">
            {score.total}점
          </span>
        </div>
        {weakestAxis && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-[color:var(--c-yellow-fg)]">
            <AlertTriangle size={11} />
            <span>
              가장 약한 축: <strong>{axisLabel(weakestAxis.key)}</strong>
              &nbsp;({weakestAxis.value}/{weakestAxis.max})
            </span>
          </div>
        )}
      </section>

      {/* 레이더 차트 */}
      <section>
        <Card className="p-2">
          <ScoreRadar model={model} />
        </Card>
      </section>

      {/* 점수 여정 — 축별 테이블 */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Star size={14} className="text-[color:var(--c-orange-fg)]" />
          <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
            축별 점수 여정
          </h2>
        </div>
        <Card>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[color:var(--bg-border)]">
                <th className="text-left py-1.5 pr-4 text-[color:var(--text-secondary)] font-medium">축</th>
                <th className="text-left py-1.5 pr-4 text-[color:var(--text-secondary)] font-medium w-28">점수</th>
                <th className="text-left py-1.5 text-[color:var(--text-secondary)] font-medium">근거</th>
              </tr>
            </thead>
            <tbody>
              {score.axes.map((axis) => {
                const norm = axis.max > 0 ? Math.round((axis.value / axis.max) * 100) : 0
                const barWidth = `${norm}%`
                return (
                  <tr key={axis.key} className="border-b border-[color:var(--bg-border)] last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-[color:var(--text-primary)] whitespace-nowrap">
                      {axisLabel(axis.key)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-[color:var(--bg-border)] overflow-hidden min-w-[60px]">
                          <div
                            className="h-full rounded-full bg-[color:var(--clauday-blue)]"
                            style={{ width: barWidth }}
                          />
                        </div>
                        <span className="text-[color:var(--text-secondary)] tabular-nums whitespace-nowrap">
                          {axis.value}/{axis.max}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 text-[color:var(--text-secondary)]">
                      {axis.note ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      </section>

      {/* 점수 근거 산문 */}
      {score.rationale && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
              AI 추정 근거
            </h2>
            <Chip tone="blue" square>AI</Chip>
          </div>
          <Card className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
            {score.rationale}
          </Card>
        </section>
      )}

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

export default ScorePanel
