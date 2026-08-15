import type { ProgressionPoint } from '../domain/progression'
import { useT } from '../i18n'

const clock = (s: number) => `${Math.floor(s / 60)}'`

export function ProgressionChart({ points, width = 720, height = 300, colorA = 'currentColor', colorB = 'currentColor' }: {
  points: ProgressionPoint[]; width?: number; height?: number; colorA?: string; colorB?: string
}) {
  const trad = useT()
  const padL = 42, padR = 16, padT = 14, padB = 30
  const maxT = Math.max(1, ...points.map((p) => p.t))
  const maxY = Math.max(4, ...points.map((p) => Math.max(p.a, p.b)))
  const x = (t: number) => padL + (t / maxT) * (width - padL - padR)
  const y = (v: number) => height - padB - (v / maxY) * (height - padT - padB)
  const line = (sel: (p: ProgressionPoint) => number) =>
    points.map((p) => `${x(p.t).toFixed(1)},${y(sel(p)).toFixed(1)}`).join(' ')

  // Graduations Y (score) : ~4 paliers arrondis.
  const step = niceStep(maxY / 4)
  const yTicks: number[] = []
  for (let v = 0; v <= maxY + 0.5; v += step) yTicks.push(Math.round(v))
  // Graduations X (temps écoulé) : 4 intervalles.
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxT * f))

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={trad('resume.progressionAria')}>
      {/* Grille + échelle Y */}
      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity={0.12} strokeWidth={1} />
          <text x={padL - 8} y={y(v)} textAnchor="end" dominantBaseline="central" fontSize={11} fill="currentColor" fillOpacity={0.55}>{v}</text>
        </g>
      ))}
      {/* Axes */}
      <line x1={padL} x2={padL} y1={padT} y2={height - padB} stroke="currentColor" strokeOpacity={0.3} strokeWidth={1} />
      <line x1={padL} x2={width - padR} y1={height - padB} y2={height - padB} stroke="currentColor" strokeOpacity={0.3} strokeWidth={1} />
      {/* Échelle X */}
      {xTicks.map((t, i) => (
        <text key={`x${i}`} x={x(t)} y={height - padB + 16} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'} fontSize={11} fill="currentColor" fillOpacity={0.55}>{clock(t)}</text>
      ))}
      {/* Courbes */}
      <polyline points={line((p) => p.a)} fill="none" stroke={colorA} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={line((p) => p.b)} fill="none" stroke={colorB} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="6 4" />
    </svg>
  )
}

/** Arrondit un pas d'échelle à 1/2/5/10… pour des graduations lisibles. */
function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))))
  const n = raw / p
  const nice = n <= 1.5 ? 1 : n <= 3 ? 2 : n <= 7 ? 5 : 10
  return Math.max(1, nice * p)
}
