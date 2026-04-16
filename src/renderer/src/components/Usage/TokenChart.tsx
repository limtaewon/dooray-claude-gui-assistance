import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'

interface ChartDataPoint {
  date: string
  inputTokens: number
  outputTokens: number
  cacheTokens: number
}

interface TokenChartProps {
  data: ChartDataPoint[]
}

function TokenChart({ data }: TokenChartProps): JSX.Element {
  return (
    <div className="bg-bg-surface border border-bg-border rounded-lg p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-4">Daily Token Usage</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2D3148" />
          <XAxis dataKey="date" tick={{ fill: '#94A3B8', fontSize: 11 }} />
          <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1C1F2E',
              border: '1px solid #2D3148',
              borderRadius: 8,
              color: '#F1F5F9',
              fontSize: 12
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94A3B8' }} />
          <Bar dataKey="inputTokens" name="Input" fill="#2563EB" radius={[2, 2, 0, 0]} />
          <Bar dataKey="outputTokens" name="Output" fill="#F97316" radius={[2, 2, 0, 0]} />
          <Bar dataKey="cacheTokens" name="Cache Read" fill="#22C55E" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default TokenChart
