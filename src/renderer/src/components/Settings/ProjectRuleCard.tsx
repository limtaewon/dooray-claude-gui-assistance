import { useMemo } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import type { DoorayProject } from '@shared/types/dooray'
import type { ProjectOverride, RepoRegistryEntry } from '@shared/types/workspace'
import { buildBranchName } from '@shared/workspace/branchName'
import {
  DEFAULT_TASK_DROP_PROMPT,
  TASK_DROP_PLACEHOLDERS,
  renderTaskDropPrompt
} from '@shared/workspace/taskDropPrompt'
import type { ResolvedProjectConfig } from '@shared/workspace/projectConfig'
import { Input } from '../common/ds'

/** 미리보기용 샘플 업무 — 실제 값이 어떻게 나오는지 눈으로 확인시킨다. */
const SAMPLE = { taskNumber: 6793, taskId: 'a1b2c39f3a2c', title: 'AI 유의어 사전 - 신규 메뉴 개발' }

interface ProjectRuleCardProps {
  project: DoorayProject
  repos: RepoRegistryEntry[]
  config: ResolvedProjectConfig
  onChange: (patch: ProjectOverride) => void
}

/**
 * 두레이 프로젝트 하나의 규칙 카드 — 저장소·브랜치 이름·첫 지시 문구.
 *
 * 전역 값 하나로 맞출 수 없어서 프로젝트마다 둔다. 비워두면 전역 기본을 따르고,
 * 그 사실을 각 항목에 표시해 "여긴 안 정했다" 를 눈으로 알 수 있게 한다.
 */
function ProjectRuleCard({ project, repos, config, onChange }: ProjectRuleCardProps): JSX.Element {
  const branchPreview = useMemo(
    () =>
      buildBranchName({
        template: config.branchTemplate,
        projectCode: project.code || project.id,
        taskNumber: SAMPLE.taskNumber,
        taskId: SAMPLE.taskId
      }),
    [config.branchTemplate, project.code, project.id]
  )

  const promptPreview = useMemo(
    () =>
      renderTaskDropPrompt(config.promptTemplate, {
        title: SAMPLE.title,
        number: SAMPLE.taskNumber,
        projectCode: project.code
      }),
    [config.promptTemplate, project.code]
  )

  const toggleRepo = (repoId: string): void => {
    const next = config.repoIds.includes(repoId)
      ? config.repoIds.filter((id) => id !== repoId)
      : [...config.repoIds, repoId]
    onChange({ repoIds: next })
  }

  return (
    <div className="ds-card flat flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[calc(12.5px_*_var(--app-font-scale,1))] font-semibold text-text-primary">
          {project.code || project.id}
        </span>
        {project.description && (
          <span className="text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary truncate">
            {project.description}
          </span>
        )}
      </div>

      <Field label="저장소" hint="이 프로젝트 업무가 오갈 폴더들. 여러 개를 고를 수 있습니다.">
        {repos.length === 0 ? (
          <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary">
            아래 &lsquo;저장소&rsquo; 에서 폴더를 먼저 등록하세요.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {repos.map((repo) => {
              const on = config.repoIds.includes(repo.id)
              return (
                <button
                  key={repo.id}
                  type="button"
                  onClick={() => toggleRepo(repo.id)}
                  aria-pressed={on}
                  title={repo.path}
                  className={`ds-chip ${on ? 'selected' : 'neutral'} cursor-pointer`}
                >
                  {on && <Check size={9} className="flex-none" />}
                  {repo.name}
                </button>
              )
            })}
          </div>
        )}
      </Field>

      <Field
        label="브랜치 이름"
        fromGlobal={config.source.branchTemplate === 'global'}
        onReset={() => onChange({ branchTemplate: '' })}
      >
        <Input
          size="sm"
          defaultValue={config.source.branchTemplate === 'project' ? config.branchTemplate : ''}
          placeholder={config.branchTemplate}
          className="font-mono"
          aria-label={`${project.code || project.id} 브랜치 이름 템플릿`}
          onBlur={(e) => onChange({ branchTemplate: e.target.value })}
        />
        <Preview label="예시" value={branchPreview} />
      </Field>

      <Field
        label="첫 지시 문구"
        hint="업무를 터미널에 놓았을 때 claude 에 자동으로 보낼 메시지입니다."
        fromGlobal={config.source.promptTemplate === 'global'}
        onReset={() => onChange({ promptTemplate: undefined })}
      >
        <textarea
          defaultValue={config.source.promptTemplate === 'project' ? config.promptTemplate : ''}
          placeholder={config.promptTemplate || '(비어 있음 — 지시를 보내지 않습니다)'}
          rows={2}
          aria-label={`${project.code || project.id} 첫 지시 문구`}
          className="ds-input resize-none text-[calc(11.5px_*_var(--app-font-scale,1))]"
          onBlur={(e) => onChange({ promptTemplate: e.target.value })}
        />
        <div className="flex flex-wrap gap-1">
          {TASK_DROP_PLACEHOLDERS.map((p) => (
            <span key={p.token} title={p.label} className="ds-chip neutral font-mono">
              {p.token}
            </span>
          ))}
        </div>
        <Preview label="보낼 메시지" value={promptPreview ?? '(보내지 않음)'} />
      </Field>
    </div>
  )
}

function Field({
  label,
  hint,
  fromGlobal,
  onReset,
  children
}: {
  label: string
  hint?: string
  /** 전역 기본을 쓰는 중이면 표시하고, 프로젝트 값이 있으면 되돌리기를 제공한다 */
  fromGlobal?: boolean
  onReset?: () => void
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[calc(11px_*_var(--app-font-scale,1))] font-medium text-text-secondary">
          {label}
        </span>
        {fromGlobal !== undefined &&
          (fromGlobal ? (
            <span className="text-[calc(9.5px_*_var(--app-font-scale,1))] text-text-tertiary">
              기본값 사용 중
            </span>
          ) : (
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-0.5 text-[calc(9.5px_*_var(--app-font-scale,1))] text-text-tertiary hover:text-text-primary"
              title="기본값으로 되돌리기"
            >
              <RotateCcw size={9} /> 기본값으로
            </button>
          ))}
      </div>
      {hint && (
        <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">{hint}</p>
      )}
      {children}
    </div>
  )
}

/** 설정값이 실제로 어떻게 나오는지 한 줄로 — 템플릿은 눈으로 확인해야 이해된다. */
function Preview({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary truncate">
      {label} <code className="text-text-secondary">{value}</code>
    </p>
  )
}

export { DEFAULT_TASK_DROP_PROMPT }
export default ProjectRuleCard
