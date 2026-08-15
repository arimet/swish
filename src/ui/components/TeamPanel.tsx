import type { Player, ScoreKind } from '../../domain/types'
import { C } from '../olive/kit'
import { useT } from '../../i18n'
import { RotateCcw } from 'lucide-react'

type Stat = { points: number; fouls: number }

/** A team column: header (fouls/bonus/timeouts), player cards with free-throw and
 * foul shortcuts; a tap on the name opens the dialog with the shot chart. */
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
  // `bg-card` at full opacity, not `bg-card/50`: a fifty per cent veil brings the
  // card halfway to its background, which cancelled precisely the lightness gap
  // between the two planes. In the dark theme, the screen became a single charcoal.
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-3xl border border-border bg-card p-2.5 sm:p-4" style={{ boxShadow: `inset 0 3px 0 0 ${color}` }}>
      {/* "On court", and not the team's name: the scoreboard just above already gives
          it in large type, and the repetition pushed the header onto two lines on a
          phone. The label now says something the screen said nowhere — that these five
          are in the game. */}
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
          <h3 className="truncate text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{translate('panel.onCourt')}</h3>
          {/* `bonus-in`: the pill arrives on mount, once. On the period's fifth team
              foul (`TEAM_FOUL_BONUS`), the opposition shoots free throws — that is not
              a counter ticking up, it is the game's rule changing, and the pill used to
              appear with nothing to signal it. */}
          {bonus && <span className="bonus-in rounded-md bg-[var(--c-danger-fill)] px-1.5 py-0.5 text-[12px] font-black uppercase text-[var(--c-on-danger)]">{translate('panel.bonus')}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Chip label={translate('panel.fouls')} value={teamFouls} warn={teamFouls >= 4} />
          {/* Timeout, undo and substitution: three controls that lived between twenty
              and twenty-eight pixels tall, in a gym, under a thumb. They are now a
              finger tall. */}
          <span className="flex items-center overflow-hidden rounded-lg bg-muted">
            <button
              onClick={onTimeout}
              disabled={timeoutsRemaining <= 0}
              title={translate('panel.timeout')}
              className="flex h-11 items-center gap-1 px-3 text-xs font-bold text-muted-foreground transition hover:bg-[var(--c-brand)] hover:text-[var(--c-on-brand)] disabled:opacity-40"
            >
              TM<span className="nums text-foreground">{timeoutsRemaining}</span>
            </button>
            <button
              onClick={onUndoTimeout}
              disabled={timeoutsUsed <= 0}
              title={translate('panel.undoTimeoutTitle')}
              aria-label={translate('panel.undoTimeout', { team: title })}
              className="h-11 w-11 border-l border-background/60 text-xs text-muted-foreground transition hover:bg-[var(--c-brand)] hover:text-[var(--c-on-brand)] disabled:opacity-30"
            >
              <RotateCcw className="mx-auto h-4 w-4" strokeWidth={2.5} />
            </button>
          </span>
          <button onClick={onSub} title={translate('panel.substitution')} aria-label={translate('panel.substitutionFor', { team: title })}
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
            /* One row per player: the name on the left, the two shortcuts on the
               right. Stacked under the name, they made cards a hundred and twenty
               pixels tall — three players out of five fitted on a phone screen, and you
               had to scroll the roster in the middle of a possession. */
            <div key={p.id} className={`flex items-center gap-1.5 rounded-2xl border border-border/60 bg-background p-2 ${out ? 'opacity-40' : ''}`}>
              <button disabled={out} onClick={() => onPick(p.id, `${p.number} ${p.lastName}`)} className="flex min-w-0 flex-1 items-center gap-2.5 py-1 text-left">
                <span className="nums grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--c-card2)] text-base font-extrabold text-[var(--c-text)]" style={{ boxShadow: `inset 0 0 0 2px ${color}` }}>
                  {p.number}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold leading-tight">{p.lastName}</span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    {/* The accent, not `color` — that is, the ink and not the fill.
                        `color` is the brand, a flat lemon: it holds the number's ring
                        and the panel's inset line, but writes at 1.77:1 on a light row.
                        The dark theme did not show it, lemon being legible everywhere
                        there; it was the light-theme pass that found it. */}
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
        {players.length === 0 && <p className="col-span-full py-6 text-center text-sm text-muted-foreground">{translate('panel.nobody')}</p>}
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
