import { CheckCircle2, Eye } from 'lucide-react'
import type { GitDiffResult } from '../../../../shared/types/git'

export interface DiffPanelProps {
  result: GitDiffResult
  /** 표시 라벨용 — 현재 렌더에는 미사용(호출처 계약 유지, ADR-v2-workspace-p0-04) */
  branch: string
  /** 상동 — 현재 렌더에는 미사용(호출처 계약 유지, ADR-v2-workspace-p0-04) */
  repoPath: string
  onFileCompare?: (filePath: string) => void
}

/** Diff 패널 (변경사항 상세) */
function DiffPanel({ result, onFileCompare }: DiffPanelProps): JSX.Element {
  const statusIcon = (s: string): string => {
    switch (s) {
      case 'M': return '수정'
      case 'A': return '추가'
      case 'D': return '삭제'
      case '?': return '미추적'
      default: return s
    }
  }

  const statusColor = (s: string): string => {
    switch (s) {
      case 'M': return 'text-clauday-orange bg-clauday-orange/10'
      case 'A': return 'text-emerald-400 bg-emerald-400/10'
      case 'D': return 'text-red-400 bg-red-400/10'
      default: return 'text-text-tertiary bg-bg-surface'
    }
  }

  if (result.files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
        <CheckCircle2 size={24} className="text-emerald-400 mb-2" />
        <span className="text-xs">변경사항 없음</span>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-1.5">
      <div className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mb-2">
        {result.files.length}개 파일 변경 · {result.summary}
      </div>
      {result.files.map((f) => (
        <div key={f.file} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-bg-surface/50 group">
          <span className={`text-[calc(8px_*_var(--app-font-scale,1))] px-1 py-0.5 rounded font-medium ${statusColor(f.status)}`}>
            {statusIcon(f.status)}
          </span>
          <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-primary truncate flex-1 font-mono">{f.file}</span>
          {onFileCompare && (
            <button
              onClick={() => onFileCompare(f.file)}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-bg-surface-hover text-text-tertiary transition-all"
              title="파일 비교"
            >
              <Eye size={11} />
            </button>
          )}
        </div>
      ))}

      {/* Patch 미리보기 */}
      {result.patch && (
        <div className="mt-3">
          <div className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary mb-1">Diff 미리보기</div>
          <pre className="text-[calc(9px_*_var(--app-font-scale,1))] leading-relaxed font-mono bg-bg-primary rounded-lg p-3 overflow-x-auto max-h-[400px] overflow-y-auto border border-bg-border">
            {result.patch.split('\n').map((line, i) => (
              <div
                key={i}
                className={
                  line.startsWith('+') && !line.startsWith('+++') ? 'text-emerald-400 bg-emerald-400/5' :
                  line.startsWith('-') && !line.startsWith('---') ? 'text-red-400 bg-red-400/5' :
                  line.startsWith('@@') ? 'text-clauday-blue' :
                  'text-text-tertiary'
                }
              >
                {line}
              </div>
            ))}
          </pre>
        </div>
      )}
    </div>
  )
}

export default DiffPanel
