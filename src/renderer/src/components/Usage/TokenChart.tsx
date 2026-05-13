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
import { useTheme } from '../../hooks/useTheme'

interface ChartDataPoint {
  date: string
  inputTokens: number
  outputTokens: number
  cacheTokens: number
}

interface TokenChartProps {
  data: ChartDataPoint[]
}

// v2 --chart-* 토큰과 동일한 값. recharts SVG props가 CSS 변수를 일관 지원하지 않아 hex 유지.
const CHART_PALETTE = {
  dark: {
    grid: '#2D3148', tick: '#94A3B8',
    tooltipBg: '#1C1F2E', tooltipBorder: '#2D3148', tooltipText: '#F1F5F9',
    s1: '#60A5FA', s2: '#FB923C', s3: '#4ADE80'
  },
  light: {
    grid: '#E2E8F0', tick: '#64748B',
    tooltipBg: '#FFFFFF', tooltipBorder: '#DCE3ED', tooltipText: '#0F172A',
    s1: '#2563EB', s2: '#EA580C', s3: '#16A34A'
  }
}

function TokenChart({ data }: TokenChartProps): JSX.Element {
  const { theme } = useTheme()
  const c = theme === 'dark' ? CHART_PALETTE.dark : CHART_PALETTE.light
  return (
    <div className="bg-bg-surface border border-bg-border rounded-lg p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-4">Daily Token Usage</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
          <XAxis dataKey="date" tick={{ fill: c.tick, fontSize: 11 }} />
          <YAxis tick={{ fill: c.tick, fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: c.tooltipBg,
              border: `1px solid ${c.tooltipBorder}`,
              borderRadius: 8,
              color: c.tooltipText,
              fontSize: 12
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: c.tick }} />
          <Bar dataKey="inputTokens" name="Input" fill={c.s1} radius={[2, 2, 0, 0]} />
          <Bar dataKey="outputTokens" name="Output" fill={c.s2} radius={[2, 2, 0, 0]} />
          <Bar dataKey="cacheTokens" name="Cache Read" fill={c.s3} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default TokenChart
