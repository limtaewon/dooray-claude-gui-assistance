import { DollarSign, Cpu, ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface ModelCost {
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
}

interface CostSummaryProps {
  totalCost: number
  totalInput: number
  totalOutput: number
  byModel: ModelCost[]
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function CostSummary({ totalCost, totalInput, totalOutput, byModel }: CostSummaryProps): JSX.Element {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-bg-surface border border-bg-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={14} className="text-clover-orange" />
            <span className="text-xs text-text-secondary">총 비용</span>
          </div>
          <p className="text-xl font-semibold text-text-primary">${totalCost.toFixed(2)}</p>
        </div>
        <div className="bg-bg-surface border border-bg-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <ArrowUpRight size={14} className="text-clover-blue" />
            <span className="text-xs text-text-secondary">입력 토큰</span>
          </div>
          <p className="text-xl font-semibold text-text-primary">{formatTokens(totalInput)}</p>
        </div>
        <div className="bg-bg-surface border border-bg-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <ArrowDownRight size={14} className="text-clover-orange" />
            <span className="text-xs text-text-secondary">출력 토큰</span>
          </div>
          <p className="text-xl font-semibold text-text-primary">{formatTokens(totalOutput)}</p>
        </div>
      </div>

      <div className="bg-bg-surface border border-bg-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-3">모델별 사용량</h3>
        <div className="space-y-2">
          {byModel.map((m) => (
            <div key={m.model} className="flex items-center justify-between py-2 border-b border-bg-border last:border-0">
              <div className="flex items-center gap-2">
                <Cpu size={14} className="text-text-secondary" />
                <span className="text-xs font-mono text-text-primary">{m.model}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-text-secondary">
                <span>{formatTokens(m.inputTokens)} 입력</span>
                <span>{formatTokens(m.outputTokens)} 출력</span>
                <span className="text-clover-orange font-medium">${m.costUsd.toFixed(4)}</span>
              </div>
            </div>
          ))}
          {byModel.length === 0 && (
            <p className="text-xs text-text-secondary text-center py-4">사용 데이터 없음</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default CostSummary
