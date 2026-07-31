import { useCallback, useEffect, useMemo, useState } from 'react'
import { FolderPlus, Trash2 } from 'lucide-react'
import type { RepoRegistryEntry, WorkspaceSettings as WorkspaceSettingsShape } from '@shared/types/workspace'
import { DEFAULT_BRANCH_TEMPLATE, buildBranchName } from '@shared/workspace/branchName'
import { Button, Chip, FieldLabel, Input, LoadingView, useToast } from '../common/ds'
import ProjectFilter from '../common/ProjectFilter'
import ProjectRuleCard from './ProjectRuleCard'
import { resolveProjectConfig, withProjectOverride } from '@shared/workspace/projectConfig'
import { renderTaskDropPrompt } from '@shared/workspace/taskDropPrompt'
import type { DoorayProject } from '@shared/types/dooray'
import { SettingsRow, SettingsSegmentedControl, SettingsSwitchRow } from './controls'
import { TASK_DROP_PLACEHOLDERS } from '@shared/workspace/taskDropPrompt'

/** 터미널 우측 두레이 패널이 보여줄 프로젝트 — TaskDrawer 와 같은 키를 쓴다. */
const TASK_PROJECTS_KEY = 'terminalTaskProjects'

/** 브랜치 템플릿 미리보기용 샘플 — 목업(docs/mockups/v2/workspace-settings.html)의 값과 동일. */
const SAMPLE = { projectCode: 'D-TF', taskNumber: 2619, taskId: 'a1b2c39f3a2c' }

/** 설정 → 워크스페이스: 저장소 레지스트리 + 브랜치 템플릿 + 실행/정리 정책. */
function WorkspaceSettings(): JSX.Element {
  const toast = useToast()
  const [repos, setRepos] = useState<RepoRegistryEntry[]>([])
  const [settings, setSettings] = useState<WorkspaceSettingsShape | null>(null)
  const [loading, setLoading] = useState(true)
  const [pinnedProjects, setPinnedProjects] = useState<DoorayProject[]>([])

  /** 작업 패널에 띄우기로 고른 프로젝트만 규칙 카드로 보여준다. */
  const loadProjects = useCallback(async (): Promise<void> => {
    const ids = ((await window.api.settings.get(TASK_PROJECTS_KEY)) as string[] | null) ?? []
    if (ids.length === 0) {
      setPinnedProjects([])
      return
    }
    const all = await window.api.dooray.projects.list().catch(() => [] as DoorayProject[])
    const byId = new Map(all.map((p) => [p.id, p]))
    setPinnedProjects(ids.map((id) => byId.get(id) ?? ({ id, code: id } as DoorayProject)))
  }, [])

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const [r, s] = await Promise.all([window.api.workspace.repos.list(), window.api.workspace.settings.get()])
      setRepos(r)
      setSettings(s)
    } catch (err) {
      toast.error('워크스페이스 설정을 불러오지 못했습니다', err instanceof Error ? err.message : undefined)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
    void loadProjects()
  }, [load, loadProjects])

  const patchSettings = async (next: Partial<WorkspaceSettingsShape>): Promise<void> => {
    try {
      setSettings(await window.api.workspace.settings.set(next))
    } catch (err) {
      toast.error('설정 저장 실패', err instanceof Error ? err.message : undefined)
    }
  }

  const addRepo = async (): Promise<void> => {
    const picked = await window.api.dialog.selectFolder()
    if (!picked) return
    try {
      const root = await window.api.git.repoRoot(picked)
      const entry = await window.api.workspace.repos.add({ path: root || picked })
      setRepos((prev) => (prev.some((r) => r.id === entry.id) ? prev : [...prev, entry]))
      toast.success('저장소 추가됨', entry.name)
    } catch (err) {
      toast.error('저장소를 추가하지 못했습니다', err instanceof Error ? err.message : 'git 저장소가 맞는지 확인하세요')
    }
  }

  const updateRepo = async (id: string, next: Partial<RepoRegistryEntry>): Promise<void> => {
    const updated = await window.api.workspace.repos.update(id, next).catch(() => null)
    if (updated) setRepos((prev) => prev.map((r) => (r.id === id ? updated : r)))
  }

  const removeRepo = async (repo: RepoRegistryEntry): Promise<void> => {
    if (!window.confirm(`저장소 "${repo.name}" 을 목록에서 제거할까요?\n디스크의 폴더는 삭제되지 않습니다.`)) return
    await window.api.workspace.repos.remove(repo.id)
    setRepos((prev) => prev.filter((r) => r.id !== repo.id))
  }

  const preview = useMemo(() => {
    if (!settings) return ''
    return buildBranchName({
      template: settings.branchTemplate || DEFAULT_BRANCH_TEMPLATE,
      projectCode: SAMPLE.projectCode,
      taskNumber: SAMPLE.taskNumber,
      taskId: SAMPLE.taskId
    })
  }, [settings])

  const previewFallback = useMemo(() => {
    if (!settings) return ''
    return buildBranchName({
      template: settings.branchTemplate || DEFAULT_BRANCH_TEMPLATE,
      projectCode: SAMPLE.projectCode,
      taskId: SAMPLE.taskId
    })
  }, [settings])

  if (loading || !settings) return <LoadingView label="워크스페이스 설정을 불러오는 중" />

  return (
    <div className="flex flex-col gap-5">
      <section className="ds-card">
        <h3 className="text-[calc(13px_*_var(--app-font-scale,1))] font-semibold text-text-primary mb-1">
          업무 드롭
        </h3>
        <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary mb-1">
          업무 카드를 터미널에 끌어다 놓았을 때의 동작입니다.
        </p>

        <SettingsRow
          label="시작 폴더"
          description={
            settings.taskDropStartIn === 'mapped'
              ? '프로젝트에 매핑된 저장소로 이동한 뒤 시작합니다.'
              : '지금 터미널이 있는 폴더에서 그대로 시작합니다 — 폴더 이동은 직접 하세요. 업무 하나가 여러 저장소에 걸치는 경우에 맞는 기본값입니다.'
          }
          searchKeywords={['drop', 'cd', '폴더', '드래그']}
          control={
            <SettingsSegmentedControl
              value={settings.taskDropStartIn}
              onChange={(v) => void patchSettings({ taskDropStartIn: v })}
              ariaLabel="업무 드롭 시작 폴더"
              options={[
                { value: 'current' as const, label: '현재 터미널' },
                { value: 'mapped' as const, label: '매핑된 저장소' }
              ]}
            />
          }
        />

        <SettingsSwitchRow
          label="이전 세션 이어가기"
          description="그 폴더에서 이 업무로 쓰던 claude 세션이 있으면 --resume 으로 이어갑니다."
          searchKeywords={['resume', '세션']}
          checked={settings.taskDropResume}
          onChange={() => void patchSettings({ taskDropResume: !settings.taskDropResume })}
        />

        <SettingsSwitchRow
          label="권한 확인 건너뛰기"
          description="--dangerously-skip-permissions 로 실행합니다. claude 가 파일 수정·명령 실행을 묻지 않고 바로 합니다."
          searchKeywords={['permission', '권한', 'dangerously']}
          checked={settings.taskDropSkipPermissions}
          onChange={() => void patchSettings({ taskDropSkipPermissions: !settings.taskDropSkipPermissions })}
        />
      </section>

      <section className="ds-card">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="min-w-0">
            <h3 className="text-[calc(13px_*_var(--app-font-scale,1))] font-semibold text-text-primary">
              프로젝트별 규칙
            </h3>
            <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5">
              작업 패널 &lsquo;업무&rsquo; 탭에 띄울 두레이 프로젝트를 고르고, 프로젝트마다 저장소·브랜치 규칙·첫 지시 문구를
              따로 정합니다. 비워두면 아래 기본값을 씁니다.
            </p>
          </div>
          <div className="flex-none">
            <ProjectFilter settingsKey={TASK_PROJECTS_KEY} onChanged={() => void loadProjects()} />
          </div>
        </div>

        {pinnedProjects.length === 0 ? (
          <p className="mt-3 text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-secondary">
            아직 고른 프로젝트가 없습니다. 오른쪽 위 버튼으로 프로젝트를 고르세요.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {pinnedProjects.map((project) => (
              <ProjectRuleCard
                key={project.id}
                project={project}
                repos={repos}
                config={resolveProjectConfig(settings, project.id)}
                onChange={(patch) =>
                  void patchSettings({
                    projectOverrides: withProjectOverride(settings.projectOverrides, project.id, patch)
                  })
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="ds-card">
        <h3 className="text-[calc(13px_*_var(--app-font-scale,1))] font-semibold text-text-primary mb-1">저장소</h3>
        <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary mb-3">
          여기 등록한 폴더를 위 프로젝트 규칙에서 고를 수 있습니다. 등록만으로는 아무 일도 일어나지 않습니다 —
          업무 드롭은 기본적으로 <strong>지금 터미널이 있는 폴더</strong>에서 시작합니다.
        </p>

        <div className="flex flex-col gap-2">
          {repos.length === 0 && (
            <p className="text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-secondary">
              등록된 저장소가 없습니다. 폴더를 추가하면 워크스페이스를 시작할 수 있습니다.
            </p>
          )}
          {repos.map((repo) => (
            <div key={repo.id} className="ds-card flat flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[calc(12.5px_*_var(--app-font-scale,1))] font-medium text-text-primary">
                    {repo.name}
                  </span>
                  <span className="font-mono text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary truncate">
                    {repo.path}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <Input
                    size="sm"
                    defaultValue={repo.defaultBaseBranch ?? ''}
                    placeholder="기본 base (예: origin/develop)"
                    className="font-mono w-56"
                    aria-label={`${repo.name} 기본 base 브랜치`}
                    onBlur={(e) => void updateRepo(repo.id, { defaultBaseBranch: e.target.value.trim() || undefined })}
                  />
                  <Input
                    size="sm"
                    defaultValue={repo.branchPrefix ?? ''}
                    placeholder="프리픽스 (선택)"
                    className="font-mono w-40"
                    aria-label={`${repo.name} 브랜치 프리픽스`}
                    onBlur={(e) => void updateRepo(repo.id, { branchPrefix: e.target.value.trim() || undefined })}
                  />
                </div>
              </div>
              <Button variant="danger" size="sm" onClick={() => void removeRepo(repo)} aria-label={`${repo.name} 제거`}>
                <Trash2 size={13} />
              </Button>
            </div>
          ))}
        </div>

        <Button variant="secondary" size="sm" className="mt-3" onClick={() => void addRepo()}>
          <FolderPlus size={13} /> 폴더 추가
        </Button>
      </section>

      <section className="ds-card">
        <h3 className="text-[calc(13px_*_var(--app-font-scale,1))] font-semibold text-text-primary mb-1">
          기본값
        </h3>
        <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary mb-3">
          프로젝트에서 따로 정하지 않았을 때 쓰는 값입니다.
        </p>
        <FieldLabel>브랜치 이름 템플릿</FieldLabel>
        <Input
          value={settings.branchTemplate}
          onChange={(e) => setSettings({ ...settings, branchTemplate: e.target.value })}
          onBlur={(e) => void patchSettings({ branchTemplate: e.target.value.trim() || DEFAULT_BRANCH_TEMPLATE })}
          className="font-mono"
          aria-label="브랜치 이름 템플릿"
        />
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">사용 가능 토큰</span>
          {['{projectCode}', '{taskNumber}', '{taskId6}', '{prefix}'].map((t) => (
            <Chip key={t} tone="neutral">
              <span className="font-mono">{t}</span>
            </Chip>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-1 text-[calc(11px_*_var(--app-font-scale,1))]">
          <div>
            <span className="text-text-tertiary mr-2">미리보기</span>
            <code className="text-text-primary font-medium">{preview}</code>
          </div>
          <div>
            <span className="text-text-tertiary mr-2">taskNumber 없음</span>
            <code className="text-text-secondary">{previewFallback}</code>
          </div>
        </div>
        <p className="mt-1.5 text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">
          taskNumber 가 없으면 taskId 뒤 6자리로 대체됩니다. 같은 이름이 이미 있으면 <code>-2</code>, <code>-3</code> 이
          붙습니다.
        </p>

        <div className="mt-4">
          <FieldLabel>첫 지시 문구</FieldLabel>
          <textarea
            defaultValue={settings.taskDropPromptTemplate}
            onBlur={(e) => void patchSettings({ taskDropPromptTemplate: e.target.value })}
            rows={2}
            placeholder="비우면 지시를 보내지 않고 claude 만 띄웁니다"
            aria-label="기본 첫 지시 문구"
            className="ds-input resize-none text-[calc(11.5px_*_var(--app-font-scale,1))]"
          />
          <div className="flex flex-wrap gap-1 mt-1.5">
            {TASK_DROP_PLACEHOLDERS.map((t) => (
              <span key={t.token} title={t.label} className="ds-chip neutral font-mono">
                {t.token}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary truncate">
            보낼 메시지{' '}
            <code className="text-text-secondary">
              {renderTaskDropPrompt(settings.taskDropPromptTemplate, {
                title: 'AI 유의어 사전 - 신규 메뉴 개발',
                number: 6793,
                projectCode: 'NEON'
              }) ?? '(보내지 않음)'}
            </code>
          </p>
        </div>
      </section>

      <section className="ds-card">
        <h3 className="text-[calc(13px_*_var(--app-font-scale,1))] font-semibold text-text-primary mb-2">
          작업 시작 기본값
        </h3>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-[calc(12px_*_var(--app-font-scale,1))] text-text-secondary">
            <input
              type="checkbox"
              className="accent-[var(--text-secondary)]"
              checked={settings.autoApproveDefault}
              onChange={(e) => void patchSettings({ autoApproveDefault: e.target.checked })}
            />
            권한 자동 승인 (<span className="font-mono">--dangerously-skip-permissions</span>)
          </label>
          <label className="flex items-center gap-2 text-[calc(12px_*_var(--app-font-scale,1))] text-text-secondary">
            <input
              type="checkbox"
              className="accent-[var(--text-secondary)]"
              checked={settings.transitionDoorayDefault}
              onChange={(e) => void patchSettings({ transitionDoorayDefault: e.target.checked })}
            />
            두레이 상태를 &lsquo;진행중&rsquo; 으로 변경
          </label>
          <label className="flex items-center gap-2 text-[calc(12px_*_var(--app-font-scale,1))] text-text-secondary">
            <input
              type="checkbox"
              className="accent-[var(--text-secondary)]"
              checked={settings.commentBranchDefault}
              onChange={(e) => void patchSettings({ commentBranchDefault: e.target.checked })}
            />
            브랜치명 댓글 남기기
          </label>
          <div className="flex items-center gap-2 mt-1">
            <FieldLabel className="mb-0 whitespace-nowrap">동시 실행 상한</FieldLabel>
            <Input
              type="number"
              size="sm"
              min={1}
              max={8}
              value={settings.maxConcurrentRuns}
              onChange={(e) => void patchSettings({ maxConcurrentRuns: Number(e.target.value) || 1 })}
              className="w-20 flex-none"
              aria-label="동시 실행 상한"
            />
            <span className="text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary whitespace-nowrap">초과분은 순차 대기</span>
          </div>
        </div>
      </section>
    </div>
  )
}

export default WorkspaceSettings
