import { useEffect, useMemo, useState } from 'react'
import { FolderGit2, Play } from 'lucide-react'
import type { DoorayTask } from '@shared/types/dooray'
import type { RepoRegistryEntry, StartTaskParams, WorkspaceSettings } from '@shared/types/workspace'
import { buildBranchName } from '@shared/workspace/branchName'
import { isSafeGitRef } from '@shared/workspace/gitRef'
import { Button, Chip, FieldLabel, Input, Modal, Textarea } from '../common/ds'

export interface StartWorkOptions extends Omit<StartTaskParams, 'projectId' | 'taskId'> {}

interface StartWorkModalProps {
  open: boolean
  task: DoorayTask
  repos: RepoRegistryEntry[]
  settings: WorkspaceSettings
  /** 프로젝트에 매핑된 저장소 id — 없으면 첫 저장소 */
  mappedRepoId?: string
  /** 태스크 본문 요약 — 프롬프트 기본값 조립에 쓴다 */
  defaultPrompt?: string
  /** 호출부가 이미 계산한 브랜치 미리보기 (없으면 모달이 자체 계산) */
  branchPreviewHint?: string
  busy?: boolean
  onClose: () => void
  onStart: (options: StartWorkOptions) => void
}

/** 토글 스위치 — 워크스페이스 모달 전용(디자인 시스템에 스위치가 없어 로컬 정의). */
function Toggle({
  checked,
  onChange,
  tone = 'blue'
}: {
  checked: boolean
  onChange: (v: boolean) => void
  tone?: 'blue' | 'orange'
}): JSX.Element {
  const on = tone === 'orange' ? 'bg-c-orange-solid' : 'bg-c-blue-solid'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors flex-none ${checked ? on : 'bg-bg-border'}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`}
      />
    </button>
  )
}

/** 두레이 태스크로 워크스페이스를 시작하기 전 옵션을 받는 모달. 원클릭 시작의 예외 경로다. */
function StartWorkModal({
  open,
  task,
  repos,
  settings,
  mappedRepoId,
  defaultPrompt,
  branchPreviewHint,
  busy = false,
  onClose,
  onStart
}: StartWorkModalProps): JSX.Element {
  const initialRepoId = mappedRepoId ?? settings.lastStart?.repoId ?? repos[0]?.id ?? ''
  const [repoId, setRepoId] = useState(initialRepoId)
  const [rememberRepo, setRememberRepo] = useState(false)
  const [baseBranch, setBaseBranch] = useState('')
  const [fetchBefore, setFetchBefore] = useState(settings.lastStart?.fetchBeforeCreate ?? true)
  const [branchName, setBranchName] = useState('')
  const [branchTouched, setBranchTouched] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [autoApprove, setAutoApprove] = useState(settings.autoApproveDefault)
  const [transitionDooray, setTransitionDooray] = useState(settings.transitionDoorayDefault)
  const [commentBranch, setCommentBranch] = useState(settings.commentBranchDefault)

  const repo = useMemo(() => repos.find((r) => r.id === repoId), [repos, repoId])

  const suggestedBranch = useMemo(
    () =>
      branchPreviewHint ??
      buildBranchName({
        template: settings.branchTemplate,
        projectCode: task.projectCode,
        taskNumber: task.number,
        taskId: task.id,
        subject: task.subject,
        prefix: repo?.branchPrefix
      }),
    [branchPreviewHint, settings.branchTemplate, task.projectCode, task.number, task.id, task.subject, repo?.branchPrefix]
  )

  // 모달을 새로 열 때마다 태스크 기준으로 초기화 — 이전 태스크 입력이 남지 않게
  useEffect(() => {
    if (!open) return
    setRepoId(initialRepoId)
    setRememberRepo(false)
    setBaseBranch('')
    setFetchBefore(settings.lastStart?.fetchBeforeCreate ?? true)
    setBranchTouched(false)
    setPrompt(defaultPrompt ?? '')
    setAutoApprove(settings.autoApproveDefault)
    setTransitionDooray(settings.transitionDoorayDefault)
    setCommentBranch(settings.commentBranchDefault)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task.id])

  const effectiveBranch = branchTouched ? branchName : suggestedBranch
  const branchValid = isSafeGitRef(effectiveBranch)
  const effectiveBase = baseBranch.trim() || repo?.defaultBaseBranch || settings.defaultBaseBranch || ''

  const submit = (): void => {
    if (!repoId || !branchValid) return
    onStart({
      repoId,
      baseBranch: effectiveBase || undefined,
      branchName: effectiveBranch,
      prompt: prompt.trim() ? prompt : undefined,
      autoApprove,
      transitionDooray,
      commentBranch: transitionDooray && commentBranch,
      fetchBeforeCreate: fetchBefore,
      rememberRepoForProject: rememberRepo
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={560}
      icon={<FolderGit2 size={16} className="text-brand-dooray" />}
      title={
        <span className="flex items-center gap-2">
          {task.number !== undefined && <span className="text-brand-dooray font-mono">#{task.number}</span>}
          <span className="truncate">{task.subject}</span>
          {task.projectCode && <Chip tone="neutral">{task.projectCode}</Chip>}
        </span>
      }
      footer={
        <>
          <span className="mr-auto text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary">
            워크트리 1개가 생성됩니다
            {repo && <span className="font-mono"> · {repo.name}</span>}
          </span>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" onClick={submit} disabled={!repoId || !branchValid || busy}>
            <Play size={13} /> {busy ? '시작 중…' : '워크스페이스 시작'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div>
          <FieldLabel>저장소</FieldLabel>
          <div className="flex items-center gap-2">
            <select
              value={repoId}
              onChange={(e) => setRepoId(e.target.value)}
              className="ds-input flex-1 font-mono"
              aria-label="저장소"
            >
              {repos.length === 0 && <option value="">등록된 저장소 없음 — 설정에서 추가</option>}
              {repos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.path})
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary whitespace-nowrap">
              <input type="checkbox" checked={rememberRepo} onChange={(e) => setRememberRepo(e.target.checked)} />이
              프로젝트에 기억
            </label>
          </div>
        </div>

        <div>
          <FieldLabel>Base 브랜치</FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              placeholder={repo?.defaultBaseBranch || settings.defaultBaseBranch || '(저장소 HEAD)'}
              className="flex-1 font-mono"
              aria-label="base 브랜치"
            />
            <label className="flex items-center gap-1.5 text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary whitespace-nowrap">
              <input type="checkbox" checked={fetchBefore} onChange={(e) => setFetchBefore(e.target.checked)} />
              생성 전에 fetch
            </label>
          </div>
        </div>

        <div>
          <FieldLabel>브랜치 이름</FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              value={effectiveBranch}
              onChange={(e) => {
                setBranchTouched(true)
                setBranchName(e.target.value)
              }}
              className="flex-1 font-mono"
              aria-label="브랜치 이름"
            />
            {branchValid ? (
              <Chip tone="emerald">✓ 사용 가능</Chip>
            ) : (
              <Chip tone="red">사용할 수 없는 이름</Chip>
            )}
          </div>
          <p className="mt-1 text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary">
            템플릿 <span className="font-mono">{settings.branchTemplate}</span> — 수정 가능
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <FieldLabel>
              에이전트 프롬프트{' '}
              <span className="font-normal normal-case tracking-normal text-text-tertiary">
                (비워두면 터미널에서 직접 지시)
              </span>
            </FieldLabel>
            {prompt && (
              <Button variant="ghost" size="xs" onClick={() => setPrompt('')}>
                비우기
              </Button>
            )}
          </div>
          <Textarea rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} aria-label="에이전트 프롬프트" />
          {!prompt.trim() && (
            <p className="mt-1 text-[calc(11px_*_var(--app-font-scale,1))] text-brand-dooray">
              워크트리 생성 후 claude 만 실행됩니다 — 첫 지시는 터미널에서 직접 입력하세요
            </p>
          )}
        </div>

        <div className="ds-card flex items-start gap-3">
          <div className="flex-1">
            <div className="text-[calc(12px_*_var(--app-font-scale,1))] font-medium text-text-primary">
              권한 자동 승인 <span className="font-mono text-text-tertiary">--dangerously-skip-permissions</span>
            </div>
            <div className="mt-0.5 text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary">
              끄면 터미널에서 직접 승인하며 진행 상황에 개입합니다
            </div>
          </div>
          <Toggle checked={autoApprove} onChange={setAutoApprove} tone="orange" />
        </div>

        <div className="ds-card flex items-start gap-3">
          <div className="flex-1">
            <div className="text-[calc(12px_*_var(--app-font-scale,1))] font-medium text-text-primary">
              두레이 상태를 &lsquo;진행중&rsquo; 으로 변경
            </div>
            <label className="mt-1 flex items-center gap-1.5 text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary">
              <input
                type="checkbox"
                checked={commentBranch}
                disabled={!transitionDooray}
                onChange={(e) => setCommentBranch(e.target.checked)}
              />
              브랜치명 댓글 남기기
            </label>
          </div>
          <Toggle checked={transitionDooray} onChange={setTransitionDooray} />
        </div>
      </div>
    </Modal>
  )
}

export default StartWorkModal
