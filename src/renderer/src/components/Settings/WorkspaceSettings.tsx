import { useCallback, useEffect, useState } from 'react'
import { FolderPlus, Trash2 } from 'lucide-react'
import type { RepoRegistryEntry, WorkspaceSettings as WorkspaceSettingsShape } from '@shared/types/workspace'
import { Button, Input, LoadingView, useToast } from '../common/ds'
import ProjectFilter from '../common/ProjectFilter'
import ProjectRuleCard from './ProjectRuleCard'
import { resolveProjectConfig, withProjectOverride } from '@shared/workspace/projectConfig'
import type { DoorayProject } from '@shared/types/dooray'
import { SettingsRow, SettingsSwitchRow } from './controls'

/** 터미널 우측 두레이 패널이 보여줄 프로젝트 — TaskDrawer 와 같은 키를 쓴다. */
const TASK_PROJECTS_KEY = 'terminalTaskProjects'

/** 브랜치 템플릿 미리보기용 샘플 — 목업(docs/mockups/v2/workspace-settings.html)의 값과 동일. */

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

  if (loading || !settings) return <LoadingView label="워크스페이스 설정을 불러오는 중" />

  return (
    <div className="flex flex-col gap-5">
      <section className="ds-card">
        <h3 className="text-[calc(13px_*_var(--app-font-scale,1))] font-semibold text-text-primary mb-1">
          업무 드롭
        </h3>
        <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary mb-1">
          업무 카드를 터미널에 끌어다 놓았을 때의 동작입니다. <strong>시작 폴더</strong>는 규칙으로 정해집니다 —
          지금 터미널이 그 프로젝트의 저장소 안이면 거기서 바로, 아니면 매핑된 저장소가 하나면 그리로 이동하고,
          여럿이면 어디서 할지 물어봅니다.
        </p>

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
              작업 패널 &lsquo;업무&rsquo; 탭에 띄울 두레이 프로젝트를 고르고, 프로젝트마다 저장소·브랜치 이름·첫 지시 문구를
              정합니다. 비워두면 앱 기본값(<code className="font-mono">feature/&#123;projectCode&#125;-&#123;taskNumber&#125;</code>)을 씁니다.
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
                    style={{ width: 220 }}
                    className="font-mono flex-none"
                    aria-label={`${repo.name} 기본 base 브랜치`}
                    onBlur={(e) => void updateRepo(repo.id, { defaultBaseBranch: e.target.value.trim() || undefined })}
                  />
                  <Input
                    size="sm"
                    defaultValue={repo.branchPrefix ?? ''}
                    placeholder="프리픽스 (선택)"
                    style={{ width: 150 }}
                    className="font-mono flex-none"
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
          <div className="flex items-center gap-3 mt-2 pt-2 border-t border-bg-border">
            <div className="flex-1 min-w-0">
              <div className="text-[calc(12px_*_var(--app-font-scale,1))] text-text-primary">
                동시 실행 상한
              </div>
              <p className="text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5">
                한 번에 돌릴 작업 수입니다. 초과분은 순차 대기합니다.
              </p>
            </div>
            {/* ds-input 은 width:100% 라 Tailwind 폭 클래스가 밀린다 — 고정 폭은 인라인으로 준다. */}
            <Input
              type="number"
              size="sm"
              min={1}
              max={8}
              value={settings.maxConcurrentRuns}
              onChange={(e) => void patchSettings({ maxConcurrentRuns: Number(e.target.value) || 1 })}
              style={{ width: 64 }}
              className="flex-none text-center"
              aria-label="동시 실행 상한"
            />
          </div>
        </div>
      </section>
    </div>
  )
}

export default WorkspaceSettings
