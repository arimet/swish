import { useState, type ReactNode } from 'react'
import type { Period } from '../../domain/types'

/** A period strip in the "date strip" manner: Q1→Q4 then overtimes, the current one
 *  highlighted. */
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
            className={`nums rounded-lg px-2.5 py-1 text-[12px] font-black uppercase tracking-wide ${
              isCurrent ? 'bg-[var(--c-brand)] text-[var(--c-on-brand)]'
                : isPast ? 'bg-[var(--c-card2)] text-[var(--c-muted)]' : 'bg-[var(--c-hover)] text-[var(--c-faint)]'}`}>
            {label}
          </span>
        )
      })}
    </div>
  )
}

/**
 * One side of the scoreboard, and the product's only authored motion: the number
 * acknowledges the gesture that changed it.
 *
 * The direction matters. The score goes up because someone scored, down because
 * someone undid — two causes, two motions, otherwise you read "it changed" where you
 * need to read "what". Nothing on the first render: at opening, the score has not
 * changed, and a loading choreography has no place on an entry screen.
 *
 * The `key` on the number is what re-triggers the animation: React remounts the
 * node, the browser replays the keyframe. It is also what **stops** the motion from
 * firing wrongly — this screen re-renders once a second (the clock), and a class set
 * by hand would flash on every tick. The `key` only changes when the score changes.
 *
 * The remembered previous value follows React's adjust-state-on-prop-change pattern:
 * compare, correct, re-render at once. No effect, hence no intermediate frame where
 * the motion would lag the number by one step.
 */
export function ScoreSide({ align, color, name, score, lead }: {
  align: 'left' | 'right'; color: string; name: string; score: number; lead: boolean
}) {
  const [previous, setPrevious] = useState(score)
  const [direction, setDirection] = useState<'up' | 'down' | null>(null)
  if (previous !== score) {
    setPrevious(score)
    setDirection(score > previous ? 'up' : 'down')
  }

  return (
    <div className={`flex min-w-0 flex-col ${align === 'right' ? 'items-end text-right' : 'items-start text-left'}`}>
      <span className="flex min-w-0 max-w-full items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5" style={{ background: color }} />
        <span className="truncate text-[12px] font-bold text-[var(--c-muted)] sm:text-base">{name}</span>
      </span>
      <span
        key={score}
        className={`nums text-[2.75rem] font-black leading-none tabular-nums sm:text-8xl ${direction ? `score-${direction}` : ''}`}
        style={{ color, opacity: lead ? 1 : 0.85 }}
      >
        {score}
      </span>
    </div>
  )
}

/**
 * A clock correction. These buttons were 25 pixels tall and sat four pixels apart:
 * at the scorer's table, a thumb aiming at "−1s" took ten seconds off the game. They
 * are now a finger tall (44px, the minimum that holds up under touch), and the step
 * of ten is separated from the step of one by a gap you can feel.
 */
export function ClockAdjust({ children, onClick, gap }: { children: ReactNode; onClick: () => void; gap?: boolean }) {
  return (
    <button onClick={onClick}
      className={`nums h-11 min-w-11 rounded-lg bg-[var(--c-card2)] px-2.5 text-[13px] font-bold tabular-nums text-[var(--c-muted)] transition hover:bg-[var(--c-brand)] hover:text-[var(--c-on-brand)] active:scale-90 ${gap ? 'ml-2' : ''}`}>
      {children}
    </button>
  )
}

export function SbButton({ children, onClick, title, danger }: { children: ReactNode; onClick: () => void; title?: string; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title}
      className={`h-11 shrink-0 rounded-full px-4 text-xs font-bold transition active:scale-95 ${
        danger ? 'bg-[var(--c-danger-bg)] text-[var(--c-danger)] hover:bg-[var(--c-danger-fill)] hover:text-[var(--c-on-danger)]'
          : 'bg-[var(--c-card2)] text-[var(--c-text)] hover:bg-[var(--c-brand)] hover:text-[var(--c-on-brand)]'}`}>
      {children}
    </button>
  )
}
