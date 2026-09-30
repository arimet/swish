import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useT } from '../../i18n'
import { fmt } from './GameClock'
import type { FoulType, GameEvent, Player, ScoreKind, StatKind, TeamSide } from '../../domain/types'

/** What the history lists: what the table enters. The clock, the periods and the
 *  starting five are the game's frame, not entries — deleting one would unhinge
 *  everything after it. */
const LISTED: GameEvent['type'][] = ['SCORE', 'MISS', 'FOUL', 'STAT', 'TIMEOUT', 'SUBSTITUTION']

const SCORE_LABEL: Record<ScoreKind, string> = { '2int': 'action.twoInside', '2ext': 'action.twoOutside', '3': 'action.three', lf: 'history.ftMade' }
const STAT_LABEL: Record<StatKind, string> = { assist: 'history.assist', block: 'action.block', reb_off: 'action.offRebound', reb_def: 'action.defRebound' }
const FOUL_LABEL: Record<FoulType, string> = {
  personal: 'action.foul',
  offensive: 'action.foulOffensive',
  defensive: 'action.foulDefensive',
  technical: 'action.foulTechnical',
  unsportsmanlike: 'action.foulUnsportsmanlike',
  disqualifying: 'action.foulDisqualifying',
}

/** A foul not charged to a player: the coach's, the bench's, or the team's (an and-one). */
const TARGET_LABEL = { coach: 'history.coachFoul', bench: 'history.benchFoul', team: 'history.teamFoul' } as const

/** A player action can be modified: it has a player of ours to reopen the dialog on. */
export const modifiable = (e: GameEvent): boolean =>
  e.type === 'SCORE' || e.type === 'MISS' || e.type === 'STAT'
    ? e.team === 'A' && !!e.playerId
    : e.type === 'FOUL' && e.team === 'A' && e.target.kind === 'player'

/** The player an action is about, if any. */
export const playerOf = (e: GameEvent): string | undefined =>
  e.type === 'SCORE' || e.type === 'MISS' || e.type === 'STAT' ? e.playerId
    : e.type === 'FOUL' && e.target.kind === 'player' ? e.target.playerId
      : undefined

/**
 * Every entry of the game, the latest on top, and the one place to take one back.
 *
 * It replaced four ways of undoing — the header's "Undo" (the last event, whatever it
 * was), "Correct" in the player dialog, and the ↺ next to the opposition's score and
 * the timeouts — which each reached a different subset and none reached an entry made
 * three actions ago. Here any entry is deleted, and a player's action can be modified:
 * another player, another action, or both, at its period and game clock.
 */
export function HistoryDialog({ open, events, players, teamNames, roster, onClose, onDelete, onModify }: {
  open: boolean
  events: GameEvent[]
  players: Record<string, Player>
  teamNames: Record<TeamSide, string>
  /** Who a modified action can be given to. */
  roster: Player[]
  onClose: () => void
  onDelete: (id: string) => void
  /** Absent where an action cannot be re-entered (after the game). */
  onModify?: (event: GameEvent, playerId: string) => void
}) {
  const translate = useT()
  const [selected, setSelected] = useState<string | null>(null)
  /** Modifying: the player the action goes to, preselected on the current one. */
  const [who, setWho] = useState<string | null>(null)
  /** Deleting asks once, on the row itself: an entry gone takes points or a foul with it. */
  const [confirming, setConfirming] = useState(false)
  const listed = events.filter((e) => LISTED.includes(e.type)).reverse()
  const chosen = listed.find((e) => e.id === selected) ?? null

  const close = () => { setSelected(null); setWho(null); setConfirming(false); onClose() }
  const name = (id?: string) => {
    const p = id ? players[id] : undefined
    return p ? `${p.number} ${p.lastName}` : translate('common.playerWord')
  }
  const describe = (e: GameEvent): { who: string; what: string } => {
    switch (e.type) {
      case 'SCORE': return e.playerId
        ? { who: name(e.playerId), what: translate(SCORE_LABEL[e.kind]) }
        : { who: teamNames[e.team], what: translate('history.teamBasket', { n: e.kind === 'lf' ? 1 : e.kind === '3' ? 3 : 2 }) }
      case 'MISS': return { who: name(e.playerId), what: translate(e.kind === 'lf' ? 'history.ftMissed' : 'history.missed') }
      case 'FOUL': return {
        who: e.target.kind === 'player' ? name(e.target.playerId) : teamNames[e.team],
        what: e.target.kind === 'player' ? translate(FOUL_LABEL[e.foulType]) : translate(TARGET_LABEL[e.target.kind]),
      }
      case 'STAT': return { who: name(e.playerId), what: translate(STAT_LABEL[e.stat]) }
      case 'TIMEOUT': return { who: teamNames[e.team], what: translate('history.timeout') }
      case 'SUBSTITUTION': return { who: teamNames[e.team], what: translate('history.substitution', { in: name(e.playerInId), out: name(e.playerOutId) }) }
      default: return { who: '', what: e.type }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg max-h-[88vh] gap-0 overflow-y-auto border-none bg-[var(--c-card)] p-5 text-[var(--c-text)]">
        <DialogHeader><DialogTitle className="text-lg font-extrabold">{translate(who && chosen ? 'history.modifyTitle' : 'history.title')}</DialogTitle></DialogHeader>

        {who && chosen && onModify ? (
          <div className="mt-3">
            <p className="text-[13px] font-semibold text-[var(--c-muted)]">{translate('history.whoNow', { what: describe(chosen).what.toLowerCase() })}</p>
            <div role="radiogroup" aria-label={translate('history.whoNowLabel')} className="mt-2 grid grid-cols-2 gap-2">
              {roster.map((p) => (
                <button key={p.id} role="radio" aria-checked={who === p.id} onClick={() => setWho(p.id)}
                  className={`truncate rounded-xl border px-3 py-2.5 text-sm font-bold transition ${who === p.id ? 'border-transparent bg-[var(--c-brand)] text-[var(--c-on-brand)]' : 'border-[var(--c-border)] bg-[var(--c-card2)] hover:bg-[var(--c-panel)]'}`}>
                  {p.number} {p.lastName}
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
              <button onClick={() => setWho(null)} className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-card2)] px-5 py-3 text-sm font-bold">{translate('ft.back')}</button>
              <button onClick={() => { onModify(chosen, who); close() }} className="rounded-2xl bg-[var(--c-brand)] py-3 text-sm font-black text-[var(--c-on-brand)]">{translate('history.continue')}</button>
            </div>
          </div>
        ) : listed.length === 0 ? (
          <p className="mt-3 py-8 text-center text-sm text-[var(--c-muted)]">{translate('history.empty')}</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {listed.map((e) => {
              const d = describe(e)
              const on = e.id === selected
              return (
                <li key={e.id} className="rounded-xl" style={{ background: on ? 'var(--c-panel)' : 'var(--c-card2)' }}>
                  <button onClick={() => { setSelected(on ? null : e.id); setConfirming(false) }} aria-expanded={on}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                    <span className="nums w-16 shrink-0 text-[12px] font-bold text-[var(--c-muted)]">{e.period <= 4 ? `Q${e.period}` : `P${e.period - 4}`} · {fmt(e.gameClock)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{d.what}</span>
                      <span className="block truncate text-[12px] text-[var(--c-muted)]">{d.who}</span>
                    </span>
                  </button>
                  {on && confirming && (
                    <div className="px-3 pb-3">
                      <p className="text-[13px] font-semibold">{translate('history.deleteConfirm')}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button onClick={() => setConfirming(false)}
                          className="rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] py-2.5 text-sm font-bold">{translate('common.cancel')}</button>
                        <button onClick={() => { onDelete(e.id); setSelected(null); setConfirming(false) }}
                          className="rounded-xl bg-[var(--c-danger-fill)] py-2.5 text-sm font-black text-[var(--c-on-danger)]">{translate('history.deleteYes')}</button>
                      </div>
                    </div>
                  )}
                  {on && !confirming && (
                    <div className={`grid gap-2 px-3 pb-3 ${onModify && modifiable(e) ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      <button onClick={() => setConfirming(true)}
                        className="rounded-xl bg-[var(--c-danger-bg)] py-2.5 text-sm font-bold text-[var(--c-danger)] transition hover:bg-[var(--c-danger-fill)] hover:text-[var(--c-on-danger)]">
                        {translate('history.delete')}
                      </button>
                      {onModify && modifiable(e) && (
                        <button onClick={() => setWho(playerOf(e) ?? roster[0]?.id ?? null)}
                          className="rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] py-2.5 text-sm font-bold transition hover:border-[var(--c-accent)]">
                          {translate('history.modify')}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
