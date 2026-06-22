/**
 * Artifacts 패널 (PRD §7-5).
 *
 * - 산출물 트리 (location 기반 디렉터리 그룹)
 * - persist 배지 (git/ignore/dooray/unknown 색구분)
 * - 템플릿 스켈레톤 (frontmatter/sections)
 * - producer/consumers 관계
 */

import { useState } from 'react'
import {
  FileText,
  GitCommit,
  EyeOff,
  Send,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Package,
  ArrowRight,
  ArrowLeft
} from 'lucide-react'
import type { HarnessModel, HarnessArtifact } from '@shared/types/harness'
import Card from '@/components/common/ds/Card'
import Chip from '@/components/common/ds/Chip'
import { EmptyView } from '@/components/common/ds/StateViews'
import { ProvenanceBadge } from '../shared/ProvenanceBadge'
import { ViewExplainer } from '../shared/ViewExplainer'
import {
  persistToChipTone,
  persistLabel,
  groupArtifactsByPersist,
  buildArtifactTree,
  findRelationWarnings
} from './artifactsUtils'

export interface ArtifactsPanelProps {
  model: HarnessModel
  sourcePath?: string
}

/** persist 분류별 아이콘 */
function PersistIcon({ persist }: { persist: HarnessArtifact['persist'] }): JSX.Element {
  switch (persist) {
    case 'git':     return <GitCommit size={11} />
    case 'ignore':  return <EyeOff size={11} />
    case 'dooray':  return <Send size={11} />
    case 'unknown': return <HelpCircle size={11} />
  }
}

/** 단일 산출물 카드 */
function ArtifactCard({
  artifact,
  provenance
}: {
  artifact: HarnessArtifact
  provenance: HarnessModel['provenance']
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const tone = persistToChipTone(artifact.persist)
  const producerSource = provenance[`artifacts.${artifact.id}.producer`] ?? 'ai'
  const persistSource = provenance[`artifacts.${artifact.id}.persist`] ?? 'ai'

  const hasExpandable = Boolean(artifact.template || artifact.producer || artifact.consumers.length > 0)

  return (
    <Card className="flex flex-col gap-0 overflow-hidden p-0">
      {/* 헤더 — 전체 행이 펼치기/접기 클릭 타겟 */}
      <div
        className={`flex items-center gap-2 flex-wrap p-3 ${hasExpandable ? 'cursor-pointer select-none hover:bg-[color:var(--bg-surface-hover)] transition-colors' : ''}`}
        role={hasExpandable ? 'button' : undefined}
        tabIndex={hasExpandable ? 0 : undefined}
        aria-expanded={hasExpandable ? expanded : undefined}
        onClick={hasExpandable ? () => setExpanded((v) => !v) : undefined}
        onKeyDown={hasExpandable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v) } } : undefined}
      >
        <FileText size={13} className="text-[color:var(--text-secondary)] flex-none" />
        <span className="text-sm font-semibold text-[color:var(--text-primary)] flex-1 min-w-0 font-mono">
          {artifact.id}
        </span>
        <div className="flex items-center gap-1">
          <span className={`ds-chip sq ${tone} inline-flex items-center gap-1`}>
            <PersistIcon persist={artifact.persist} />
            {persistLabel(artifact.persist)}
          </span>
          <ProvenanceBadge source={persistSource} size="xs" />
        </div>
        {hasExpandable && (
          <span className="flex-none text-[color:var(--text-tertiary)]" aria-hidden>
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        )}
      </div>

      {/* location */}
      {artifact.location && (
        <p className="text-xs font-mono text-[color:var(--text-tertiary)] px-3 pb-2">{artifact.location}</p>
      )}

      {/* 펼쳤을 때 */}
      {expanded && (
        <div className="flex flex-col gap-2 pt-2 pb-3 px-3 border-t border-[color:var(--bg-border)]">
          {/* producer / consumers */}
          <div className="flex flex-wrap items-center gap-3">
            {artifact.producer && (
              <div className="flex items-center gap-1.5">
                <ArrowRight size={10} className="text-[color:var(--c-emerald-fg)]" />
                <span className="text-xs text-[color:var(--text-secondary)]">생산:</span>
                <Chip tone="emerald" square>{artifact.producer}</Chip>
                <ProvenanceBadge source={producerSource} size="xs" />
              </div>
            )}
            {artifact.consumers.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <ArrowLeft size={10} className="text-[color:var(--c-blue-fg)]" />
                <span className="text-xs text-[color:var(--text-secondary)]">소비:</span>
                {artifact.consumers.map((c) => (
                  <Chip key={c} tone="blue" square>{c}</Chip>
                ))}
              </div>
            )}
          </div>

          {/* 템플릿 스켈레톤 */}
          {artifact.template && (
            <div className="flex flex-col gap-2">
              {artifact.template.frontmatter.length > 0 && (
                <div>
                  <p className="ds-field-label mb-1">Frontmatter 키</p>
                  <div className="flex flex-wrap gap-1">
                    {artifact.template.frontmatter.map((key) => (
                      <span key={key} className="ds-chip sq neutral font-mono text-xs">{key}</span>
                    ))}
                  </div>
                </div>
              )}
              {artifact.template.sections.length > 0 && (
                <div>
                  <p className="ds-field-label mb-1">섹션 목록</p>
                  <div className="flex flex-col gap-1">
                    {artifact.template.sections.map((sec, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs text-[color:var(--text-secondary)]"
                      >
                        <span className="text-[color:var(--text-tertiary)] font-mono">##</span>
                        {sec}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

/**
 * Artifacts 패널 본체.
 *
 * 섹션:
 * 0. ViewExplainer 해설 배너
 * 1. persist 분류별 산출물 그룹
 * 2. 산출물 트리 (location 기반)
 * 3. 관계 경고 (소비자 없음 / 생산자 없음)
 */
export function ArtifactsPanel({ model, sourcePath }: ArtifactsPanelProps): JSX.Element {
  const { artifacts } = model

  if (artifacts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <EmptyView
          icon={Package}
          title="산출물 정보 없음"
          body="번들에서 산출물을 감지하지 못했습니다."
        />
      </div>
    )
  }

  const persistGroups = groupArtifactsByPersist(artifacts)
  const treeNodes = buildArtifactTree(artifacts)
  const relationWarnings = findRelationWarnings(artifacts)
  const path = sourcePath ?? model.meta.source

  return (
    <div className="flex flex-col">
      <ViewExplainer
        title="산출물"
        howto={
          <span>
            각 단계가 만들어내는 산출물과 저장 위치를 보여줍니다.{' '}
            <strong>git</strong>=버전 추적 / <strong>ignore</strong>=로컬 임시 / <strong>dooray</strong>=두레이 공유.
            카드를 펼치면 생산자(producer)·소비자(consumer) 에이전트를 확인할 수 있습니다.
          </span>
        }
        topic="이 하네스의 산출물 흐름을 설명"
        sourcePath={path}
        icon={Package}
      />
    <div className="flex flex-col gap-5 p-4">
      {/* 섹션 1 — persist 분류 요약 */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Package size={14} className="text-[color:var(--c-blue-fg)]" />
          <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
            영속화 분류
          </h2>
          <Chip tone="blue" square>{artifacts.length}개</Chip>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {persistGroups.map((group) => {
            const tone = persistToChipTone(group.persist)
            return (
              <Card key={group.persist} className="flex flex-col items-start gap-1.5">
                <span className={`ds-chip sq ${tone} inline-flex items-center gap-1`}>
                  <PersistIcon persist={group.persist} />
                  {persistLabel(group.persist)}
                </span>
                <span className="text-lg font-bold text-[color:var(--text-primary)]">
                  {group.artifacts.length}
                </span>
              </Card>
            )
          })}
        </div>
      </section>

      {/* 섹션 2 — 트리 뷰 */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <FileText size={14} className="text-[color:var(--text-secondary)]" />
          <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
            산출물 목록
          </h2>
        </div>
        {treeNodes.map((node) => (
          <div key={node.dir} className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono text-[color:var(--text-tertiary)]">/</span>
              <span className="text-xs font-semibold text-[color:var(--text-secondary)]">
                {node.dir === 'root' ? '(루트)' : node.dir}
              </span>
              <span className="text-xs text-[color:var(--text-tertiary)]">
                {node.artifacts.length}개
              </span>
            </div>
            <div className="flex flex-col gap-2 pl-3 border-l border-[color:var(--bg-border)]">
              {node.artifacts.map((a) => (
                <ArtifactCard key={a.id} artifact={a} provenance={model.provenance} />
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* 섹션 3 — 관계 경고 */}
      {relationWarnings.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-[color:var(--c-yellow-fg)]" />
            <h2 className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
              관계 경고
            </h2>
            <Chip tone="yellow" square>{relationWarnings.length}개</Chip>
          </div>
          <div className="flex flex-col gap-1.5">
            {relationWarnings.map((w, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-[color:var(--c-yellow-bg)] text-xs text-[color:var(--c-yellow-fg)]"
              >
                <AlertTriangle size={11} className="flex-none" />
                <span className="font-mono">{w.artifactId}</span>
                <span>—</span>
                <span>{w.kind === 'no-producer' ? '생산자 없음' : '소비자 없음'}</span>
              </div>
            ))}
          </div>
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

export default ArtifactsPanel
