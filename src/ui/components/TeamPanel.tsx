import type { Player, ScoreKind } from '../../domain/types'

type Stat = { points: number; fouls: number }

/** Colonne d'équipe : entête (fautes/bonus/TM), cartes joueurs avec raccourcis
 * lancer franc et faute ; tap sur le nom = dialogue avec la carte de tir. */
export function TeamPanel({
  title, color, players, statsByPlayer, teamFouls, bonus, timeoutsRemaining, timeoutsUsed,
  onPick, onScore, onFoul, onSub, onTimeout, onUndoTimeout,
}: {
  title: string
  color: string
  players: Player[]
  statsByPlayer: Map<string, Stat>
  teamFouls: number
  bonus: boolean
  timeoutsRemaining: number
  timeoutsUsed: number
  onPick: (playerId: string, name: string) => void
  onScore: (playerId: string, kind: ScoreKind) => void
  onFoul: (playerId: string) => void
  onSub: () => void
  onTimeout: () => void
  onUndoTimeout: () => void
}) {
  return (
    <section className="flex min-h-0 flex-col rounded-3xl border border-border/60 bg-card/50 p-2.5 sm:p-4" style={{ boxShadow: `inset 0 3px 0 0 ${color}` }}>
      <header className="mb-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-2 pt-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
          <h3 className="truncate text-base font-extrabold tracking-tight sm:text-lg">{title}</h3>
          {bonus && <span className="rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-black uppercase text-white">Bonus</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Chip label="Fautes" value={teamFouls} warn={teamFouls >= 4} />
          <span className="flex items-center overflow-hidden rounded-lg bg-muted">
            <button
              onClick={onTimeout}
              disabled={timeoutsRemaining <= 0}
              title="Prendre un temps-mort"
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-muted-foreground transition hover:bg-[var(--c-accent)] hover:text-white disabled:opacity-40"
            >
              TM<span className="nums text-foreground">{timeoutsRemaining}</span>
            </button>
            <button
              onClick={onUndoTimeout}
              disabled={timeoutsUsed <= 0}
              title="Annuler le dernier temps-mort"
              aria-label={`Annuler le dernier temps-mort ${title}`}
              className="border-l border-background/60 px-1.5 py-1 text-[11px] text-muted-foreground transition hover:bg-[var(--c-accent)] hover:text-white disabled:opacity-30"
            >
              ↺
            </button>
          </span>
          <button onClick={onSub} title="Changement" aria-label={`Changement ${title}`}
            className="grid h-7 w-7 place-items-center rounded-lg bg-muted text-muted-foreground transition hover:bg-[var(--c-accent)] hover:text-white">
            ⇄
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-2 overflow-y-auto no-scrollbar sm:grid-cols-2">
        {players.map((p) => {
          const st = statsByPlayer.get(p.id) ?? { points: 0, fouls: 0 }
          const out = st.fouls >= 5
          return (
            <div key={p.id} className={`rounded-2xl border border-border/60 bg-background p-2.5 ${out ? 'opacity-40' : ''}`}>
              <button disabled={out} onClick={() => onPick(p.id, `${p.number} ${p.lastName}`)} className="flex w-full items-center gap-2.5 text-left">
                <span className="nums grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--c-card2)] text-base font-extrabold text-[var(--c-text)]" style={{ boxShadow: `inset 0 0 0 2px ${color}` }}>
                  {p.number}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold leading-tight">{p.lastName}</span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className="nums whitespace-nowrap text-xs font-black" style={{ color }}>{st.points} pts</span>
                    <span className="flex items-center gap-0.5">
                      {[0, 1, 2, 3, 4].map((i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < st.fouls ? 'bg-red-500' : 'bg-muted-foreground/25'}`} />)}
                    </span>
                  </span>
                </span>
              </button>
              <div className="mt-2 grid grid-cols-2 gap-1">
                <Quick disabled={out} label="+1" onClick={() => onScore(p.id, 'lf')} />
                <Quick disabled={out} label="F" foul onClick={() => onFoul(p.id)} />
              </div>
            </div>
          )
        })}
        {players.length === 0 && <p className="col-span-full py-6 text-center text-sm text-muted-foreground">Aucun joueur sur le terrain.</p>}
      </div>
    </section>
  )
}

function Quick({ label, onClick, foul, disabled }: { label: string; onClick: () => void; foul?: boolean; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`rounded-lg py-2 text-sm font-black transition active:scale-90 disabled:opacity-40 ${
        foul ? 'bg-[var(--c-danger-bg)] text-[var(--c-danger)] hover:bg-red-600 hover:text-white' : 'bg-[var(--c-card2)] text-[var(--c-text)] hover:bg-[var(--c-accent)] hover:text-white'
      }`}
    >
      {label}
    </button>
  )
}

function Chip({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <span className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold ${warn ? 'bg-amber-500/15 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
      {label}<span className="nums text-foreground">{value}</span>
    </span>
  )
}
