import type { Player, TeamSide } from '../../domain/types'
import { C } from '../olive/kit'

const TEAM_A = 'var(--team-a)'
const TEAM_B = 'var(--team-b)'

/**
 * Porte d'entrée avant tout démarrage de chrono : chaque équipe doit désigner
 * son cinq de départ (STARTING_FIVE) avant que le match live ne s'affiche.
 */
export function StartingFiveGate({
  rosterA, rosterB, requiredA, requiredB, selected, onToggle, onStart, canStart, onExit, solo = false,
}: {
  rosterA: Player[]; rosterB: Player[]
  requiredA: number; requiredB: number
  selected: { A: string[]; B: string[] }
  onToggle: (side: TeamSide, playerId: string) => void
  onStart: () => void
  canStart: boolean
  onExit?: () => void
  /** Mode « une seule équipe » : une seule colonne, pas de panneau visiteurs.
   *  Drapeau explicite — un effectif adverse vide ne suffit pas à le déduire. */
  solo?: boolean
}) {
  return (
    <div>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
        <div className="mb-8 text-center">
          {onExit && (
            <button onClick={onExit} className="float-left text-sm font-semibold text-muted-foreground hover:text-foreground">
              ← Quitter
            </button>
          )}
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Cinq de départ</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {solo ? 'Désignez vos titulaires pour démarrer.' : 'Désignez les titulaires de chaque équipe pour démarrer.'}
          </p>
        </div>

        <div className={`grid gap-5 ${solo ? 'mx-auto max-w-md' : 'sm:grid-cols-2'}`}>
          <StartingFivePanel title={solo ? 'MON ÉQUIPE' : 'LOCAUX'} color={TEAM_A} players={rosterA} required={requiredA}
            chosen={selected.A} onToggle={(id) => onToggle('A', id)} />
          {!solo && (
            <StartingFivePanel title="VISITEURS" color={TEAM_B} players={rosterB} required={requiredB}
              chosen={selected.B} onToggle={(id) => onToggle('B', id)} />
          )}
        </div>

        <div className="sticky bottom-4 mt-8 flex justify-center">
          <button
            disabled={!canStart}
            onClick={onStart}
            className="rounded-2xl bg-primary px-8 py-4 text-base font-bold text-primary-foreground shadow-xl shadow-primary/25 transition enabled:hover:brightness-110 enabled:active:scale-95 disabled:opacity-40"
          >
            ▶ Démarrer le match
          </button>
        </div>
      </div>
    </div>
  )
}

function StartingFivePanel({ title, color, players, required, chosen, onToggle }: {
  title: string; color: string; players: Player[]; required: number; chosen: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-4" style={{ boxShadow: `inset 0 3px 0 0 ${color}` }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: color }} />
          <h3 className="text-lg font-extrabold tracking-tight">{title}</h3>
        </div>
        <span className="nums rounded-full bg-muted px-2.5 py-1 text-sm font-bold text-muted-foreground">
          {chosen.length}/{required}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[...players].sort((a, b) => a.number - b.number).map((p) => {
          const isChosen = chosen.includes(p.id)
          const disabled = !isChosen && chosen.length >= required
          return (
            <button
              key={p.id}
              disabled={disabled}
              onClick={() => onToggle(p.id)}
              className="flex items-center gap-2.5 rounded-2xl border border-border/60 bg-background p-2.5 text-left transition hover:bg-muted active:scale-[0.98] disabled:opacity-35"
              style={isChosen ? { boxShadow: `inset 0 0 0 2px ${color}`, borderColor: 'transparent' } : undefined}
            >
              <span
                className="nums grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#202024] text-sm font-extrabold text-white"
                style={{ boxShadow: `inset 0 0 0 2px ${color}` }}
              >
                {p.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold">{p.lastName}</span>
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-black"
                style={isChosen ? { background: color, color: '#0d0d0f' } : { border: `1.5px solid ${C.border}`, color: 'transparent' }}>
                ✓
              </span>
            </button>
          )
        })}
        {players.length === 0 && (
          <p className="col-span-2 py-4 text-center text-sm text-muted-foreground">Aucun joueur dans cette équipe.</p>
        )}
      </div>
    </div>
  )
}
