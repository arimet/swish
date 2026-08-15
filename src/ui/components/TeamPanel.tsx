import type { Player, ScoreKind } from '../../domain/types'
import { C } from '../olive/kit'
import { useT } from '../../i18n'
import { RotateCcw } from 'lucide-react'

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
  const translate = useT()
  // `bg-card` à pleine opacité, et non `bg-card/50` : un voile à cinquante pour cent
  // rapproche la carte de son fond de moitié, ce qui annulait précisément l'écart de
  // clarté entre les deux plans. En thème sombre, l'écran devenait un seul charbon.
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-3xl border border-border bg-card p-2.5 sm:p-4" style={{ boxShadow: `inset 0 3px 0 0 ${color}` }}>
      {/* « Sur le terrain », et non le nom de l'équipe : le tableau d'affichage
          juste au-dessus le donne déjà en gros, et cette répétition faisait passer
          l'entête à deux lignes sur un téléphone. Le libellé dit maintenant quelque
          chose que l'écran ne disait nulle part — que ces cinq-là sont en jeu. */}
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
          <h3 className="truncate text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{translate('panneau.surLeTerrain')}</h3>
          {/* `bonus-in` : la pastille arrive au montage, une seule fois. Au
              cinquième faute d'équipe de la période (`TEAM_FOUL_BONUS`),
              l'adversaire tire des lancers francs — ce n'est pas un compteur qui
              avance, c'est la règle du match qui change, et la pastille
              apparaissait sans que rien ne le signale. */}
          {bonus && <span className="bonus-in rounded-md bg-[var(--c-danger-fill)] px-1.5 py-0.5 text-[12px] font-black uppercase text-[var(--c-on-danger)]">{translate('panneau.bonus')}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Chip label={translate('panneau.fautes')} value={teamFouls} warn={teamFouls >= 4} />
          {/* Temps-mort, annulation et changement : trois commandes qui vivaient
              entre vingt et vingt-huit pixels de haut, dans un gymnase, au pouce.
              Elles font la hauteur d'un doigt. */}
          <span className="flex items-center overflow-hidden rounded-lg bg-muted">
            <button
              onClick={onTimeout}
              disabled={timeoutsRemaining <= 0}
              title={translate('panneau.tempsMort')}
              className="flex h-11 items-center gap-1 px-3 text-xs font-bold text-muted-foreground transition hover:bg-[var(--c-brand)] hover:text-[var(--c-on-brand)] disabled:opacity-40"
            >
              TM<span className="nums text-foreground">{timeoutsRemaining}</span>
            </button>
            <button
              onClick={onUndoTimeout}
              disabled={timeoutsUsed <= 0}
              title={translate('panneau.annulerTMTitre')}
              aria-label={translate('panneau.annulerTM', { team: title })}
              className="h-11 w-11 border-l border-background/60 text-xs text-muted-foreground transition hover:bg-[var(--c-brand)] hover:text-[var(--c-on-brand)] disabled:opacity-30"
            >
              <RotateCcw className="mx-auto h-4 w-4" strokeWidth={2.5} />
            </button>
          </span>
          <button onClick={onSub} title={translate('panneau.changement')} aria-label={translate('panneau.changementEquipe', { team: title })}
            className="grid h-11 w-11 place-items-center rounded-lg bg-muted text-muted-foreground transition hover:bg-[var(--c-brand)] hover:text-[var(--c-on-brand)]">
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
                    {/* L'accent, et non `color` — c'est-à-dire l'encre et non le
                        remplissage. `color` vaut la marque, un citron d'aplat : il
                        tient l'anneau du numéro et le filet du panneau, mais écrit à
                        1,77:1 sur une ligne claire. Le thème sombre ne le montrait
                        pas, le citron y étant lisible partout ; c'est la passe en
                        thème clair qui l'a trouvé. */}
                    <span className="nums whitespace-nowrap text-xs font-black" style={{ color: C.accent }}>{st.points} pts</span>
                    <span className="flex items-center gap-0.5">
                      {[0, 1, 2, 3, 4].map((i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < st.fouls ? 'bg-[var(--c-danger-fill)]' : 'bg-muted-foreground/25'}`} />)}
                    </span>
                  </span>
                </span>
              </button>
              <Quick disabled={out} label="+1" onClick={() => onScore(p.id, 'lf')} />
              <Quick disabled={out} label="F" foul onClick={() => onFoul(p.id)} />
            </div>
          )
        })}
        {players.length === 0 && <p className="col-span-full py-6 text-center text-sm text-muted-foreground">{translate('panneau.personne')}</p>}
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
        foul ? 'bg-[var(--c-danger-bg)] text-[var(--c-danger)] hover:bg-[var(--c-danger-fill)] hover:text-[var(--c-on-danger)]' : 'bg-[var(--c-card2)] text-[var(--c-text)] hover:bg-[var(--c-brand)] hover:text-[var(--c-on-brand)]'
      }`}
    >
      {label}
    </button>
  )
}

function Chip({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <span className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-bold ${warn ? 'bg-[var(--c-amber-bg)] text-[var(--c-amber)]' : 'bg-muted text-muted-foreground'}`}>
      {label}<span className="nums text-foreground">{value}</span>
    </span>
  )
}
