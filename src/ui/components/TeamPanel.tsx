import type { Player, ScoreKind } from '../../domain/types'
import type { PlayerStat } from '../../domain/boxscore'
import { C } from '../olive/kit'
import { useT } from '../../i18n'
import { ArrowLeftRight } from 'lucide-react'
import { BTN_SM, DANGER, PRIMARY, SECONDARY } from './buttons'


/** A team column: header (fouls/bonus/timeouts), player cards with free-throw and
 * foul shortcuts; a tap on the name opens the dialog with the shot chart. */
export function TeamPanel({
  title, color, players, statsByPlayer, teamFouls, bonus, timeoutsRemaining,
  onPick, onScore, onFoul, onSub, onTimeout,
}: {
  title: string
  color: string
  players: Player[]
  statsByPlayer: Map<string, PlayerStat>
  teamFouls: number
  bonus: boolean
  timeoutsRemaining: number
  onPick: (playerId: string, name: string) => void
  onScore: (playerId: string, kind: ScoreKind) => void
  onFoul: (playerId: string) => void
  onSub: () => void
  onTimeout: () => void
}) {
  const translate = useT()
  // `bg-card` at full opacity, not `bg-card/50`: a fifty per cent veil brings the
  // card halfway to its background, which cancelled precisely the lightness gap
  // between the two planes. In the dark theme, the screen became a single charcoal.
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-card p-2.5 sm:p-4" style={{ boxShadow: `inset 0 3px 0 0 ${color}` }}>
      {/* "On court", and not the team's name: the scoreboard just above already gives
          it in large type, and the repetition pushed the header onto two lines on a
          phone. The label now says something the screen said nowhere — that these five
          are in the game. */}
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
          <h3 className="truncate text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{translate('panel.onCourt')}</h3>
          {/* `bonus-in`: the pill arrives on mount, once. On the period's fifth team
              foul (`TEAM_FOUL_BONUS`) the opposition shoots free throws — that is not a
              counter ticking up, it is the game's rule changing, and it deserves more
              than a pill appearing in silence. */}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <FoulCounter fouls={teamFouls} bonus={bonus} team={title} />
          {/* Timeout and substitution: controls a finger tall, in a gym, under a thumb.
              A timeout taken by mistake is deleted from the history, like any entry. */}
          <button
            onClick={onTimeout}
            disabled={timeoutsRemaining <= 0}
            title={translate('panel.timeout')}
            className={`${BTN_SM} ${SECONDARY} gap-1`}
          >
            TM<span className="nums text-foreground">{timeoutsRemaining}</span>
          </button>
          {/* Named and outlined in the brand colour: a grey "⇄" with no word was the one
              control the table kept looking for, on the gesture made a dozen times a
              quarter. */}
          <button onClick={onSub} title={translate('panel.substitution')} aria-label={translate('panel.substitutionFor', { team: title })}
            className={`${BTN_SM} ${PRIMARY} gap-1.5`}>
            <ArrowLeftRight className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            {translate('panel.substitution')}
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-2 overflow-y-auto no-scrollbar sm:grid-cols-2">
        {players.map((p) => {
          const st = statsByPlayer.get(p.id)
          const points = st?.points ?? 0, fouls = st?.fouls ?? 0
          const rebounds = (st?.offRebounds ?? 0) + (st?.defRebounds ?? 0), assists = st?.assists ?? 0
          const out = fouls >= 5
          return (
            /* One row per player: the name on the left, the two shortcuts on the
               right. Stacked under the name, they made cards a hundred and twenty
               pixels tall — three players out of five fitted on a phone screen, and you
               had to scroll the roster in the middle of a possession. */
            <div key={p.id} className={`flex items-center gap-1.5 rounded-lg border border-border/60 bg-background p-2 ${out ? 'opacity-40' : ''}`}>
              <button disabled={out} onClick={() => onPick(p.id, `${p.number} ${p.lastName}`)} className="flex min-w-0 flex-1 items-center gap-2.5 py-1 text-left">
                <span className="nums grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[var(--c-card2)] text-base font-extrabold text-[var(--c-text)]" style={{ boxShadow: `inset 0 0 0 2px ${color}` }}>
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
                    <span className="nums whitespace-nowrap text-xs font-black" style={{ color: C.accent }}>{points} pts</span>
                    <span className="flex items-center gap-0.5">
                      {[0, 1, 2, 3, 4].map((i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < fouls ? 'bg-[var(--c-danger-fill)]' : 'bg-muted-foreground/25'}`} />)}
                    </span>
                    {/* The rest of the line, only once there is something to say: a
                        "0 rb · 0 pd" on ten cards is noise at the one glance the table
                        has between two possessions. */}
                    {(rebounds > 0 || assists > 0) && (
                      <span className="nums truncate text-[11px] font-semibold text-muted-foreground">
                        {[rebounds > 0 && translate('panel.rebounds', { n: rebounds }), assists > 0 && translate('panel.assists', { n: assists })].filter(Boolean).join(' · ')}
                      </span>
                    )}
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
      className={`${BTN_SM} w-11 px-0 text-sm font-bold ${foul ? DANGER : SECONDARY}`}
    >
      {label}
    </button>
  )
}

/**
 * A team's fouls this period, beside the timeout and substitution buttons and shaped
 * like them — same height, same corners — but outlined rather than filled, because it
 * is read, not pressed. Amber on the fourth, red with "Bonus" from the fifth
 * (`TEAM_FOUL_BONUS`): from there the other side shoots free throws, which is the
 * game's rule changing rather than a counter ticking up — hence `bonus-in`, once.
 */
export function FoulCounter({ fouls, bonus, team }: { fouls: number; bonus: boolean; team: string }) {
  const translate = useT()
  const tone = bonus
    ? 'bonus-in text-[var(--c-danger)] ring-2 ring-[var(--c-danger-fill)]'
    : fouls >= 4 ? 'text-[var(--c-amber)] ring-2 ring-[var(--c-amber-bd)]' : 'text-[var(--c-muted)] ring-1 ring-[var(--c-border)]'
  return (
    <span role="status" aria-label={translate('panel.foulsOf', { team, n: fouls })}
      className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ring-inset ${tone}`}>
      {bonus ? <b className="font-black uppercase">{translate('panel.bonus')}</b> : translate('panel.fouls')}
      <span className="nums text-sm font-black text-[var(--c-text)]">{fouls}</span>
    </span>
  )
}
