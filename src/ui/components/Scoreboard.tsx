import { useState, type ReactNode } from 'react'
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
 * Un côté du tableau d'affichage, et le seul mouvement authorial du produit : le
 * nombre accuse réception du geste qui l'a changé.
 *
 * Le sens compte. Le score monte parce qu'on a marqué, il descend parce qu'on a
 * annulé — deux causes, deux mouvements, sinon on lit « ça a changé » là où il faut
 * lire « quoi ». Rien au premier rendu : à l'ouverture, le score n'a pas changé, et
 * une chorégraphie de chargement n'a pas sa place sur un écran de saisie.
 *
 * Le `key` sur le nombre est ce qui redéclenche l'animation : React remonte le
 * nœud, le navigateur rejoue le keyframe. C'est aussi ce qui **empêche** le
 * mouvement de se déclencher à tort — cet écran se rerend une fois par seconde
 * (le chrono), et une classe posée à la main clignoterait au tic. Le `key` ne
 * change que quand le score change.
 *
 * L'écart mémorisé suit le motif React de l'ajustement d'état au changement de
 * prop : comparer, corriger, rerendre aussitôt. Pas d'effet, donc pas d'image
 * intermédiaire où le mouvement serait en retard d'un cran sur le nombre.
 */
export function ScoreSide({ align, color, name, score, lead }: {
  align: 'left' | 'right'; color: string; name: string; score: number; lead: boolean
}) {
  const [precedent, setPrecedent] = useState(score)
  const [sens, setSens] = useState<'up' | 'down' | null>(null)
  if (precedent !== score) {
    setPrecedent(score)
    setSens(score > precedent ? 'up' : 'down')
  }

  return (
    <div className={`flex min-w-0 flex-col ${align === 'right' ? 'items-end text-right' : 'items-start text-left'}`}>
      <span className="flex min-w-0 max-w-full items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5" style={{ background: color }} />
        <span className="truncate text-[12px] font-bold text-[var(--c-muted)] sm:text-base">{name}</span>
      </span>
      <span
        key={score}
        className={`nums text-[2.75rem] font-black leading-none tabular-nums sm:text-8xl ${sens ? `score-${sens}` : ''}`}
        style={{ color, opacity: lead ? 1 : 0.85 }}
      >
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
      className={`nums h-11 min-w-11 rounded-lg bg-[var(--c-card2)] px-2.5 text-[13px] font-bold tabular-nums text-[var(--c-muted)] transition hover:bg-[var(--c-brand)] hover:text-[var(--c-on-brand)] active:scale-90 ${ecart ? 'ml-2' : ''}`}>
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
