import type { GitFileCompare } from '../../../../shared/types/git'

/** 파일 비교 패널 (좌우 분할) */
function FileComparePanel({ result, onBack }: { result: GitFileCompare; onBack: () => void }): JSX.Element {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 border-b border-bg-border flex items-center gap-2 flex-shrink-0">
        <button onClick={onBack} className="text-[calc(10px_*_var(--app-font-scale,1))] text-clauday-blue hover:underline">← 목록으로</button>
        <span className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary font-mono">{result.file}</span>
      </div>
      <div className="flex-1 flex overflow-hidden">
        {/* 좌측 브랜치 */}
        <div className="flex-1 flex flex-col border-r border-bg-border overflow-hidden">
          <div className="px-3 py-1 bg-bg-surface/50 border-b border-bg-border text-[calc(9px_*_var(--app-font-scale,1))] text-text-tertiary flex-shrink-0">
            {result.leftBranch}
          </div>
          <pre className="flex-1 text-[calc(9px_*_var(--app-font-scale,1))] leading-relaxed font-mono p-2 overflow-auto text-text-secondary">
            {result.leftContent}
          </pre>
        </div>
        {/* 우측 브랜치 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 py-1 bg-bg-surface/50 border-b border-bg-border text-[calc(9px_*_var(--app-font-scale,1))] text-text-tertiary flex-shrink-0">
            {result.rightBranch}
          </div>
          <pre className="flex-1 text-[calc(9px_*_var(--app-font-scale,1))] leading-relaxed font-mono p-2 overflow-auto text-text-secondary">
            {result.rightContent}
          </pre>
        </div>
      </div>
    </div>
  )
}

export default FileComparePanel
