import { Clover } from 'lucide-react'
import GlobalAIIndicator from '../common/GlobalAIIndicator'

function TitleBar(): JSX.Element {
  return (
    <header className="drag-region h-10 bg-bg-surface border-b border-bg-border flex items-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-clover-orange/5 via-transparent to-clover-blue/5" />
      <div className="flex items-center gap-2 no-drag ml-20 relative z-10">
        <Clover size={18} className="text-clover-orange" />
        <span className="text-sm font-semibold text-text-primary">Clauday</span>
        <span className="text-xs text-text-secondary">Claude Code GUI</span>
      </div>
      {/* 전역 AI 작업 인디케이터 — 어떤 탭에서든 AI가 돌고 있으면 여기 표시 */}
      <div className="flex-1 flex justify-center no-drag relative z-10">
        <GlobalAIIndicator />
      </div>
    </header>
  )
}

export default TitleBar
