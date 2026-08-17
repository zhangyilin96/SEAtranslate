import type { Metric } from '../types'

const SIZE = 320
const CENTER = SIZE / 2
const RADIUS = 105

function point(index: number, count: number, radius: number) {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / count
  return [CENTER + Math.cos(angle) * radius, CENTER + Math.sin(angle) * radius]
}

function polygonPoints(count: number, radius: number) {
  return Array.from({ length: count }, (_, index) => point(index, count, radius).join(',')).join(' ')
}

export function RadarChart({ metrics }: { metrics: Metric[] }) {
  const chartMetrics = metrics.filter((metric) => metric.score !== null)
  const dataPoints = chartMetrics
    .map((metric, index) => point(index, chartMetrics.length, RADIUS * (metric.score! / 100)).join(','))
    .join(' ')

  return (
    <div className="radar-wrap" aria-label="五维 Player DNA 雷达图">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img">
        {[0.25, 0.5, 0.75, 1].map((level) => (
          <polygon key={level} points={polygonPoints(chartMetrics.length, RADIUS * level)} className="radar-grid" />
        ))}
        {chartMetrics.map((_, index) => {
          const [x, y] = point(index, chartMetrics.length, RADIUS)
          return <line key={index} x1={CENTER} y1={CENTER} x2={x} y2={y} className="radar-axis" />
        })}
        <polygon points={dataPoints} className="radar-data" />
        {chartMetrics.map((metric, index) => {
          const [x, y] = point(index, chartMetrics.length, RADIUS * 1.28)
          return (
            <text key={metric.key} x={x} y={y} className="radar-label" textAnchor="middle" dominantBaseline="middle">
              {metric.label}
            </text>
          )
        })}
      </svg>
      <div className="radar-center">
        <span>DNA</span>
        <strong>{Math.round(chartMetrics.reduce((sum, metric) => sum + metric.score!, 0) / chartMetrics.length)}</strong>
      </div>
    </div>
  )
}
