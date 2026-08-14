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
    <section className="flex min-h-0 flex-1 flex-col rounded-3xl border border-border/60 bg-card/50 p-2.5 sm:p-4" style={{ boxShadow: `inset 0 3px 0 0 ${color}` }}>
      {/* « Sur le terrain », et non le nom de l'équipe : le tableau d'affichage
          juste au-dessus le donne déjà en gros, et cette répétition faisait passer
          l'entête à deux lignes sur un téléphone. Le libellé dit maintenant quelque
          chose que l'écran ne disait nulle part — que ces cinq-là sont en jeu. */}
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
          <h3 className="truncate text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Sur le terrain</h3>
          {bonus && <span className="rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-black uppercase text-white">Bonus</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Chip label="Fautes" value={teamFouls} warn={teamFouls >= 4} />
          {/* Temps-mort, annulation et changement : trois commandes qui vivaient
              entre vingt et vingt-huit pixels de haut, dans un gymnase, au pouce.
              Elles font la hauteur d'un doigt. */}
          <span className="flex items-center overflow-hidden rounded-lg bg-muted">
            <button
              onClick={onTimeout}
              disabled={timeoutsRemaining <= 0}
              title="Prendre un temps-mort"
              className="flex h-11 items-center gap-1 px-3 text-xs font-bold text-muted-foreground transition hover:bg-[var(--c-accent)] hover:text-white disabled:opacity-40"
            >
              TM<span className="nums text-foreground">{timeoutsRemaining}</span>
            </button>
            <button
              onClick={onUndoTimeout}
              disabled={timeoutsUsed <= 0}
              title="Annuler le dernier temps-mort"
              aria-label={`Annuler le dernier temps-mort ${title}`}
              className="h-11 w-11 border-l border-background/60 text-xs text-muted-foreground transition hover:bg-[var(--c-accent)] hover:text-white disabled:opacity-30"
            >
              ↺
            </button>
          </span>
          <button onClick={onSub} title="Changement" aria-label={`Changement ${title}`}
            className="grid h-11 w-11 place-items-center rounded-lg bg-muted text-muted-foreground transition hover:bg-[var(--c-accent)] hover:text-white">
            ⇄
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-2 overflow-y-auto no-scrollbar sm:grid-cols-2">
        {players.map((p) => {
          const st = statsByPlayer.get(p.id) ?? { points: 0, fouls: 0 }
          const out = st.fouls >= 5
          return (
            /* Une seule ligne par joueur : le nom à gauche, les deux raccourcis à
               droite. Empilés sous le nom, ils faisaient des cartes de cent vingt
               pixels — trois joueurs sur cinq tenaient à l'écran d'un téléphone, et
               il fallait faire défiler l'effectif au milieu d'une possession. */
            <div key={p.id} className={`flex items-center gap-1.5 rounded-2xl border border-border/60 bg-background p-2 ${out ? 'opacity-40' : ''}`}>
              <button disabled={out} onClick={() => onPick(p.id, `${p.number} ${p.lastName}`)} className="flex min-w-0 flex-1 items-center gap-2.5 py-1 text-left">
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
              <Quick disabled={out} label="+1" onClick={() => onScore(p.id, 'lf')} />
              <Quick disabled={out} label="F" foul onClick={() => onFoul(p.id)} />
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
      className={`h-11 w-11 shrink-0 rounded-lg text-sm font-black transition active:scale-90 disabled:opacity-40 ${
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
