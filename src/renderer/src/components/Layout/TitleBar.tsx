import { Clover } from 'lucide-react'

function TitleBar(): JSX.Element {
  return (
    <header className="drag-region h-10 bg-bg-surface border-b border-bg-border flex items-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-clover-orange/5 via-transparent to-clover-blue/5" />
      <div className="flex items-center gap-2 no-drag ml-20 relative z-10">
        <Clover size={18} className="text-clover-orange" />
        <span className="text-sm font-semibold text-text-primary">Clauday</span>
        <span className="text-xs text-text-secondary">Claude Code GUI</span>
      </div>
    </header>
  )
}

export default TitleBar
