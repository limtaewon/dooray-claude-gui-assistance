/**
 * Skills & Blocks 패널 (PRD §7-3).
 *
 * 에이전트별 SKILL 해부:
 * - 역할 카드 (역할 / 위험 / 쓰기 권한 / phaseClass)
 * - 도구 화이트리스트 (카테고리 분류)
 * - 합리화 방어 테이블 (riskNote 있는 에이전트)
 * - blocks 재사용 매핑
 *
 * model.agents 가 비어있거나 관련 데이터가 없으면 섹션별 EmptyView 로 안내한다.
 */

import { useState } from 'react'
import {
  Shield,
  Wrench,
  AlertTriangle,
  Boxes,
  ChevronDown,
  ChevronRight,
  User,
  FileText,
  Terminal,
  Globe
} from 'lucide-react'
import type { HarnessModel, HarnessAgent } from '@shared/types/harness'
import Card from '@/components/common/ds/Card'
import Chip from '@/components/common/ds/Chip'
import { EmptyView } from '@/components/common/ds/StateViews'
import { ProvenanceBadge } from '../shared/ProvenanceBadge'
import { ViewExplainer } from '../shared/ViewExplainer'
import {
  buildRationalizationRows,
  buildBlockUsageMap,
  categorizeTools,
  modelToChipTone,
  phaseClassLabel
} from './skillsUtils'
import type { CategorizedTool } from './skillsUtils'

export interface SkillsBlocksPanelProps {
  model: HarnessModel
  sourcePath?: string
}

/** 도구 카테고리 아이콘 매핑 */
function ToolCategoryIcon({ category }: { category: CategorizedTool['category'] }): JSX.Element {
  switch (category) {
    case 'mcp':  return <Globe size={10} className="text-[color:var(--c-violet-fg)]" />
    case 'bash': return <Terminal size={10} className="text-[color:var(--c-orange-fg)]" />
    case 'file': return <FileText size={10} className="text-[color:var(--c-blue-fg)]" />
    default:     return <Wrench size={10} className="text-[color:var(--text-tertiary)]" />
  }
}

/** 단일 에이전트 역할 카드 */
function AgentRoleCard({ agent, provenance }: { agent: HarnessAgent; provenance: HarnessModel['provenance'] }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const categorized = categorizeTools(agent.tools)
  const modelTone = modelToChipTone(agent.model)

  const roleSource = provenance[`agents.${agent.id}.role`] ?? 'ai'
  const writesSource = provenance[`agents.${agent.id}.writes`] ?? 'ai'

  return (
    <Card className="flex flex-col gap-2 overflow-hidden p-0">
      {/* 헤더 — 전체 행이 펼치기/접기 클릭 타겟 */}
      <div
        className="flex items-center gap-2 p-3 cursor-pointer select-none hover:bg-[color:var(--bg-surface-hover)] transition-colors"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v) } }}
      >
        <User size={13} className="text-[color:var(--text-secondary)] flex-none" />
        <span className="text-sm font-semibold text-[color:var(--text-primary)] flex-1 min-w-0 truncate">
          {agent.displayName || agent.id}
        </span>
        <Chip tone={modelTone} square>{agent.model}</Chip>
        {agent.phaseClass && (
          <Chip tone="neutral" square>{phaseClassLabel(agent.phaseClass)}</Chip>
        )}
        <span className="flex-none text-[color:var(--text-tertiary)]" aria-hidden>
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </div>

      {/* 역할 설명 */}
      {agent.role && (
        <div className="flex items-start gap-1.5 px-3">
          <span className="text-xs text-[color:var(--text-secondary)] flex-1">{agent.role}</span>
          <ProvenanceBadge source={roleSource} size="xs" />
        </div>
      )}

      {/* 위험 노트 */}
      {agent.riskNote && (
        <div className="flex items-center gap-1.5 px-3 mx-3 py-1.5 rounded-md bg-[color:var(--c-yellow-bg)]">
          <AlertTriangle size={11} className="text-[color:var(--c-yellow-fg)] flex-none" />
          <span className="text-xs text-[color:var(--c-yellow-fg)]">{agent.riskNote}</span>
        </div>
      )}

      {/* 펼쳤을 때 — 도구 + writes */}
      {expanded && (
        <div className="flex flex-col gap-2 mt-1 pt-2 border-t border-[color:var(--bg-border)] px-3 pb-3">
          {/* 도구 화이트리스트 */}
          {categorized.length > 0 ? (
            <div>
              <p className="ds-field-label mb-1.5">도구 화이트리스트</p>
              <div className="flex flex-wrap gap-1">
                {categorized.map((t) => (
                  <span
                    key={t.name}
                    className="inline-flex items-center gap-1 ds-chip sq neutral"
                    title={t.name}
                  >
                    <ToolCategoryIcon category={t.category} />
                    <span className="max-w-[160px] truncate">{t.name}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-[color:var(--text-tertiary)]">도구 화이트리스트 없음</p>
          )}

          {/* 쓰기 권한 */}
          {agent.writes.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <p className="ds-field-label">쓰기 권한</p>
                <ProvenanceBadge source={writesSource} size="xs" />
              </div>
              <div className="flex flex-wrap gap-1">
                {agent.writes.map((w) => (
                  <span key={w} className="ds-chip sq neutral font-mono text-xs">{w}</span>
                ))}
              </div>
            </div>
          )}

          {/* 에스컬레이션 조건 */}
          {agent.escalation && (
            <div>
              <p className="ds-field-label mb-1">에스컬레이션 조건</p>
              <p className="text-xs text-[color:var(--text-secondary)]">{agent.escalation}</p>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

/**
 * Skills & Blocks 패널 본체.
 *
 * 섹션:
 * 0. ViewExplainer 해설 배너
 * 1. 에이전트 역할 카드 목록
 * 2. 합리화 방어 테이블 (riskNote 있는 에이전트)
 * 3. Blocks 재사용 매핑
 */
export function SkillsBlocksPanel({ model, sourcePath }: SkillsBlocksPanelProps): JSX.Element {
  const rationalizationRows = buildRationalizationRows(model.agents)
  const blockUsageMap = buildBlockUsageMap(model.agents)

  if (model.agents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <EmptyView
          icon={Shield}
          title="에이전트 정보 없음"
          body="번들에서 에이전트를 감지하지 못했습니다. 정규화를 다시 시도하거나 번들 구조를 확인하세요."
        />
      </div>
    )
  }

  const path = sourcePath ?? model.meta.source

  return (
    <div className="flex flex-col">
      <ViewExplainer
        title="스킬 / 블록"
        howto={
          <span>
            각 에이전트의 역할·사용 도구·주된 위험(빠지기 쉬운 함정)을 보여줍니다.{' '}
            <strong className="text-[color:var(--c-yellow-fg)]">노란 경고</strong>는 해당 역할의 위험 노트입니다.
            카드를 펼치면 도구 화이트리스트와 쓰기 권한을 확인할 수 있습니다.
          </span>
        }
        topic="이 하네스의 에이전트 구성과 각 역할을 설명"
        sourcePath={path}
        icon={Shield}
      />
    <div className="flex flex-col gap-5 p-4">
      {/* 섹션 1 — 역할 카드 */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <User size={14} className="text-[color:var(--c-blue-fg)]" />
          <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
            에이전트 역할 카드
          </h2>
          <Chip tone="blue" square>{model.agents.length}개</Chip>
        </div>
        <div className="flex flex-col gap-2">
          {model.agents.map((agent) => (
            <AgentRoleCard
              key={agent.id}
              agent={agent}
              provenance={model.provenance}
            />
          ))}
        </div>
      </section>

      {/* 섹션 2 — 합리화 방어 테이블 */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Shield size={14} className="text-[color:var(--c-red-fg)]" />
          <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
            합리화 방어
          </h2>
          {rationalizationRows.length > 0 && (
            <Chip tone="red" square>{rationalizationRows.length}개</Chip>
          )}
        </div>
        {rationalizationRows.length === 0 ? (
          <EmptyView
            icon={Shield}
            title="합리화 방어 테이블 없음"
            body="에이전트에 riskNote 가 정의되지 않았습니다."
          />
        ) : (
          <Card>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[color:var(--bg-border)]">
                  <th className="text-left py-1.5 pr-4 text-[color:var(--text-secondary)] font-medium w-1/3">
                    에이전트
                  </th>
                  <th className="text-left py-1.5 text-[color:var(--text-secondary)] font-medium">
                    주된 위험 / 합리화 패턴
                  </th>
                </tr>
              </thead>
              <tbody>
                {rationalizationRows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-[color:var(--bg-border)] last:border-0"
                  >
                    <td className="py-2 pr-4 text-[color:var(--text-primary)] font-medium font-mono">
                      {row.agentId}
                    </td>
                    <td className="py-2 text-[color:var(--text-secondary)]">{row.pattern}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {/* 섹션 3 — Blocks 재사용 매핑 */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Boxes size={14} className="text-[color:var(--c-violet-fg)]" />
          <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
            Blocks 재사용 매핑
          </h2>
          {blockUsageMap.length > 0 && (
            <Chip tone="violet" square>{blockUsageMap.length}개</Chip>
          )}
        </div>
        {blockUsageMap.length === 0 ? (
          <EmptyView
            icon={Boxes}
            title="재사용 블록 없음"
            body="번들에서 blocks/ 재사용 패턴이 감지되지 않았습니다."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {blockUsageMap.map((entry) => (
              <Card key={entry.blockPath} className="flex flex-col gap-1.5">
                <span className="text-xs font-mono text-[color:var(--text-primary)]">
                  {entry.blockPath}
                </span>
                <div className="flex flex-wrap gap-1">
                  {entry.usedBy.map((agent) => (
                    <Chip key={agent} tone="neutral" square>{agent}</Chip>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* degradation 경고 */}
      {model.warnings.length > 0 && (
        <section className="mt-1">
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

export default SkillsBlocksPanel
