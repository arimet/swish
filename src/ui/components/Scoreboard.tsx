import type { ReactNode } from 'react'
import type { Period } from '../../domain/types'

/** Frise des périodes façon « date strip » : Q1→Q4 puis prolongations, courante en surbrillance. */
export function PeriodStrip({ current }: { current: Period }) {
  const otCount = Math.max(0, current - 4)
  const chips: { period: Period; label: string }[] = [
    ...[1, 2, 3, 4].map((p) => ({ period: p as Period, label: `Q${p}` })),
    ...Array.from({ length: otCount }, (_, i) => ({ period: (5 + i) as Period, label: `P${i + 1}` })),
  ]
  return (
    <div className="flex items-center gap-1.5">
      {chips.map(({ period, label }) => {
        const isCurrent = period === current
        const isPast = period < current
        return (
          <span key={period}
            className={`nums rounded-lg px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${
              isCurrent ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                : isPast ? 'bg-white/10 text-white/75' : 'bg-white/[0.06] text-white/55'}`}>
            {label}
          </span>
        )
      })}
    </div>
  )
}

export function ScoreSide({ align, color, name, score, lead }: {
  align: 'left' | 'right'; color: string; name: string; score: number; lead: boolean
}) {
  return (
    <div className={`flex min-w-0 flex-col ${align === 'right' ? 'items-end text-right' : 'items-start text-left'}`}>
      <span className="flex min-w-0 max-w-full items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5" style={{ background: color }} />
        <span className="truncate text-[11px] font-bold text-white/85 sm:text-base">{name}</span>
      </span>
      <span className="nums text-[2.75rem] font-black leading-none tabular-nums sm:text-8xl" style={{ color, opacity: lead ? 1 : 0.85 }}>
        {score}
      </span>
    </div>
  )
}

/**
 * Une correction de chrono. Ces boutons faisaient 25 pixels de haut et se
 * touchaient à quatre pixels près : à la table de marque, le pouce qui visait
 * « −1s » enlevait dix secondes au match. Ils font maintenant la hauteur d'un
 * doigt (44 px, le minimum tenable au tactile), et le pas de dix est séparé du
 * pas de un par un écart qu'on sent.
 */
export function ClockAdjust({ children, onClick, ecart }: { children: ReactNode; onClick: () => void; ecart?: boolean }) {
  return (
    <button onClick={onClick}
      className={`nums h-11 min-w-11 rounded-lg bg-white/10 px-2.5 text-[13px] font-bold tabular-nums text-white/80 transition hover:bg-white/20 active:scale-90 ${ecart ? 'ml-2' : ''}`}>
      {children}
    </button>
  )
}

export function SbButton({ children, onClick, title, danger }: { children: ReactNode; onClick: () => void; title?: string; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title}
      className={`h-11 shrink-0 rounded-full px-4 text-xs font-bold transition active:scale-95 ${
        danger ? 'bg-red-500/20 text-red-300 hover:bg-red-500 hover:text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}>
      {children}
    </button>
  )
}
