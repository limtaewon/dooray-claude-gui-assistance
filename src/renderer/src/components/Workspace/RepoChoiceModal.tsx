import { FolderGit2, Play } from 'lucide-react'
import type { TaskDropCandidate } from '@shared/workspace/taskDropPlan'
import { Modal } from '../common/ds'

interface RepoChoiceModalProps {
  taskSubject: string
  candidates: TaskDropCandidate[]
  onChoose: (candidate: TaskDropCandidate) => void
  onCancel: () => void
}

/**
 * 어느 저장소에서 시작할지 고르는 창.
 *
 * 프로젝트에 저장소가 여럿 매핑돼 있고, 드롭한 터미널이 그중 어디에도 있지 않을 때만 뜬다.
 * 이미 매핑된 폴더에 놓았다면 묻지 않고 그 자리에서 시작한다 — 그 위치 자체가 선택이다.
 */
function RepoChoiceModal({
  taskSubject,
  candidates,
  onChoose,
  onCancel
}: RepoChoiceModalProps): JSX.Element {
  return (
    <Modal open onClose={onCancel} title="어느 저장소에서 시작할까요?">
      <p className="text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-secondary mb-3 line-clamp-2">
        {taskSubject}
      </p>

      <div className="flex flex-col gap-1">
        {candidates.map((candidate) => (
          <button
            key={candidate.repoId}
            type="button"
            onClick={() => onChoose(candidate)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-bg-border hover:border-bg-border-strong hover:bg-bg-surface-hover text-left transition-colors"
          >
            <FolderGit2 size={13} className="text-text-tertiary flex-none" />
            <span className="flex-1 min-w-0">
              <span className="block text-[calc(12px_*_var(--app-font-scale,1))] text-text-primary truncate">
                {candidate.name}
              </span>
              <span className="block font-mono text-[calc(9.5px_*_var(--app-font-scale,1))] text-text-tertiary truncate">
                {/* 워크트리에서 하던 세션이면 실제로 들어갈 폴더를 보여준다 */}
                {candidate.sessionCwd ?? candidate.path}
              </span>
            </span>
            {candidate.sessionId && (
              <span className="ds-chip emerald flex-none">
                <Play size={8} /> 이어가기
              </span>
            )}
          </button>
        ))}
      </div>

      <p className="mt-3 text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary">
        고른 저장소의 브랜치 워크트리에서 시작합니다. 이전 세션이 있으면 그 폴더에서 이어갑니다.
      </p>
    </Modal>
  )
}

export default RepoChoiceModal
