import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useT } from '../../i18n'
import { fmt } from './GameClock'
import { BTN, DANGER, DANGER_FILLED, PICKED, PRIMARY, SECONDARY, SEGMENT, SEGMENT_OFF, SEGMENT_ON, SEGMENTS } from './buttons'
import { parseClock } from './ClockEditDialog'
import { periodLength } from '../../domain/ids'
import { Check, Pencil } from 'lucide-react'
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

/** An entry of the table's, as opposed to the game's frame (clock, periods, five). */
export const isEntry = (e: GameEvent): boolean => LISTED.includes(e.type)

/** Where an entry happened, as the scoreboard says it: `Q2 · 07:32`. */
export const whenOf = (e: GameEvent): string => `${e.period <= 4 ? `Q${e.period}` : `P${e.period - 4}`} · ${fmt(e.gameClock)}`

/** Names an entry back to the table: who, and what. One wording for the history and
 *  for the player dialog's undo, so an action reads the same in both places. */
export function useDescribe(players: Record<string, Player>, teamNames: Record<TeamSide, string>) {
  const translate = useT()
  const name = (id?: string) => {
    const p = id ? players[id] : undefined
    return p ? `${p.number} ${p.lastName}` : translate('common.playerWord')
  }
  return (e: GameEvent): { who: string; what: string } => {
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
}

/** One row of an entry list, already worded. */
export interface EntryItem { id: string; when: string; what: string; who?: string; editable?: boolean }

/**
 * A list of entries to tick, the latest on top. Ticking rather than one row at a time,
 * because a mis-entry rarely comes alone — a basket and its pass, a whole free-throw
 * trip — and taking them back one dialog after the other is how the table falls
 * behind the game.
 */
export function EntryList({ items, selected, onToggle, label, onEdit }: {
  items: EntryItem[]; selected: string[]; onToggle: (id: string) => void; label: string
  /** A pencil at the end of the rows that can be put right — in plain sight, rather
   *  than a button that only appears once a single row is ticked. */
  onEdit?: (id: string) => void
}) {
  const translate = useT()
  return (
    <ul aria-label={label} className="space-y-1">
      {items.map((it) => {
        const on = selected.includes(it.id)
        return (
          <li key={it.id} className={`flex items-center gap-1 rounded-lg transition-colors ${on ? 'bg-[var(--c-card2)]' : 'hover:bg-[var(--c-hover)]'}`}>
            <button role="checkbox" aria-checked={on} onClick={() => onToggle(it.id)}
              className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left">
              <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center rounded transition-colors ${on ? 'text-[var(--c-accent)] ring-2 ring-inset ring-[var(--c-brand)]' : 'ring-1 ring-inset ring-[var(--c-muted)]'}`}>
                {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>
              <span className="nums w-[4.5rem] shrink-0 text-[12px] font-bold text-[var(--c-muted)]">{it.when}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{it.what}</span>
                {it.who && <span className="block truncate text-[12px] text-[var(--c-muted)]">{it.who}</span>}
              </span>
            </button>
            {onEdit && it.editable && (
              <button onClick={() => onEdit(it.id)} aria-label={translate('history.modifyOne', { what: it.what })} title={translate('history.modify')}
                className="mr-1 grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[var(--c-muted)] transition-colors hover:bg-[var(--c-border)] hover:text-[var(--c-text)]">
                <Pencil className="h-4 w-4" strokeWidth={2.2} />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Every entry of the game, the latest on top, and the one place to take entries back.
 *
 * It replaced four ways of undoing — the header's "Undo" (the last event, whatever it
 * was), "Correct" in the player dialog, and the ↺ next to the opposition's score and
 * the timeouts — which each reached a different subset and none reached an entry made
 * three actions ago. Here any entries are ticked and deleted together, and a single
 * player's action can be modified: another player, another action, or both, at its
 * period and game clock.
 */
export function HistoryDialog({ open, events, players, teamNames, roster, period = 1, onClose, onDelete, onModify, onRetime }: {
  open: boolean
  events: GameEvent[]
  players: Record<string, Player>
  teamNames: Record<TeamSide, string>
  /** Who a modified action can be given to. */
  roster: Player[]
  onClose: () => void
  onDelete: (ids: string[]) => void
  /** Absent where an action cannot be re-entered (after the game). */
  onModify?: (event: GameEvent, playerId: string) => void
  /** The game's current period: a timeout can be moved to it or any before. */
  period?: number
  /** A timeout put right: its team, its period, its clock. */
  onRetime?: (event: GameEvent, at: { team: TeamSide; period: number; gameClock: number }) => void
}) {
  const translate = useT()
  const describe = useDescribe(players, teamNames)
  const [selected, setSelected] = useState<string[]>([])
  /** Modifying: the player the action goes to, preselected on the current one. */
  const [who, setWho] = useState<string | null>(null)
  /** Putting a timeout right, rather than deleting and re-taking it — which would
   *  stamp it with the clock of now and not of when it was called. */
  const [retiming, setRetiming] = useState(false)
  /** Deleting asks once: entries gone take points or fouls with them. */
  const [confirming, setConfirming] = useState(false)
  const listed = events.filter(isEntry).reverse()
  const chosen = selected.length === 1 ? listed.find((e) => e.id === selected[0]) ?? null : null
  const editable = (e: GameEvent) => (!!onModify && modifiable(e)) || (!!onRetime && e.type === 'TIMEOUT')
  const items = listed.map((e): EntryItem => ({ id: e.id, when: whenOf(e), ...describe(e), editable: editable(e) }))
  /** Straight to putting one entry right, from its own pencil. */
  const edit = (id: string) => {
    const e = listed.find((x) => x.id === id)
    if (!e) return
    setSelected([id]); setConfirming(false)
    if (e.type === 'TIMEOUT') setRetiming(true); else setWho(playerOf(e) ?? roster[0]?.id ?? null)
  }

  const toggle = (id: string) => { setConfirming(false); setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])) }
  const close = () => { setSelected([]); setWho(null); setRetiming(false); setConfirming(false); onClose() }
  const retimable = !!onRetime && chosen?.type === 'TIMEOUT'
  const canEdit = (onModify && chosen && modifiable(chosen)) || retimable
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="rounded-lg flex max-h-[88vh] flex-col gap-0 border-none bg-[var(--c-card)] p-5 text-[var(--c-text)] sm:max-w-lg">
        <DialogHeader><DialogTitle className="text-lg font-extrabold">{translate((who || retiming) && chosen ? 'history.modifyTitle' : 'history.title')}</DialogTitle></DialogHeader>

        {retiming && chosen?.type === 'TIMEOUT' && onRetime ? (
          <TimeoutEdit event={chosen} teamNames={teamNames} period={period}
            onBack={() => setRetiming(false)} onSave={(at) => { onRetime(chosen, at); close() }} />
        ) : who && chosen && onModify ? (
          <div className="mt-3 overflow-y-auto">
            <p className="text-[13px] font-semibold text-[var(--c-muted)]">{translate('history.whoNow', { what: describe(chosen).what.toLowerCase() })}</p>
            <div role="radiogroup" aria-label={translate('history.whoNowLabel')} className="mt-2 grid grid-cols-2 gap-2">
              {roster.map((p) => (
                <button key={p.id} role="radio" aria-checked={who === p.id} onClick={() => setWho(p.id)}
                  className={`${BTN} truncate ${who === p.id ? PICKED : SECONDARY}`}>
                  {p.number} {p.lastName}
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
              <button onClick={() => setWho(null)} className={`${BTN} ${SECONDARY} px-5`}>{translate('ft.back')}</button>
              <button onClick={() => { onModify(chosen, who); close() }} className={`${BTN} ${PRIMARY}`}>{translate('history.continue')}</button>
            </div>
          </div>
        ) : listed.length === 0 ? (
          <p className="mt-3 py-8 text-center text-sm text-[var(--c-muted)]">{translate('history.empty')}</p>
        ) : (
          <>
            <div className="-mx-2 mt-3 min-h-0 flex-1 overflow-y-auto px-2">
              <EntryList items={items} selected={selected} onToggle={toggle} onEdit={edit} label={translate('history.title')} />
            </div>
            {/* The actions stay under the list, never scrolled away with it. */}
            <div className="mt-3 border-t border-[var(--c-border)] pt-3">
              {selected.length === 0 ? (
                <p className="py-3 text-center text-[13px] font-semibold text-[var(--c-muted)]">{translate('history.tickHint')}</p>
              ) : confirming ? (
                <>
                  <p className="text-[13px] font-semibold">{translate('history.deleteConfirm', { count: selected.length })}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button onClick={() => setConfirming(false)} className={`${BTN} ${SECONDARY}`}>{translate('common.cancel')}</button>
                    <button onClick={() => { onDelete(selected); setSelected([]); setConfirming(false) }} className={`${BTN} ${DANGER_FILLED}`}>{translate('history.deleteYes')}</button>
                  </div>
                </>
              ) : (
                <div className={`grid gap-2 ${canEdit ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {canEdit && (
                    <button onClick={() => edit(chosen!.id)} className={`${BTN} ${SECONDARY}`}>{translate('history.modify')}</button>
                  )}
                  <button onClick={() => setConfirming(true)} className={`${BTN} ${DANGER}`}>{translate('history.delete', { count: selected.length })}</button>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** A timeout's team, period and game clock, each put right in place. */
function TimeoutEdit({ event, teamNames, period, onBack, onSave }: {
  event: GameEvent; teamNames: Record<TeamSide, string>; period: number
  onBack: () => void; onSave: (at: { team: TeamSide; period: number; gameClock: number }) => void
}) {
  const translate = useT()
  const [team, setTeam] = useState<TeamSide>(event.type === 'TIMEOUT' ? event.team : 'A')
  const [at, setAt] = useState(event.period)
  const [clock, setClock] = useState(fmt(event.gameClock))
  const seconds = parseClock(clock)
  const valid = seconds !== null && seconds >= 0 && seconds <= periodLength(at)
  const periods = Array.from({ length: Math.max(period, event.period) }, (_, i) => i + 1)
  return (
    <div className="mt-3 space-y-4 overflow-y-auto">
      <div>
        <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-[var(--c-muted)]">{translate('history.timeoutTeam')}</p>
        <div role="radiogroup" aria-label={translate('history.timeoutTeam')} className={`${SEGMENTS} grid-cols-2`}>
          {(['A', 'B'] as const).map((side) => (
            <button key={side} role="radio" aria-checked={team === side} onClick={() => setTeam(side)}
              className={`${SEGMENT} truncate px-2 ${team === side ? SEGMENT_ON : SEGMENT_OFF}`}>{teamNames[side]}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-[var(--c-muted)]">{translate('history.timeoutPeriod')}</p>
        <div role="radiogroup" aria-label={translate('history.timeoutPeriod')} className={`${SEGMENTS}`} style={{ gridTemplateColumns: `repeat(${periods.length}, minmax(0, 1fr))` }}>
          {periods.map((p) => (
            <button key={p} role="radio" aria-checked={at === p} onClick={() => setAt(p)}
              className={`${SEGMENT} ${at === p ? SEGMENT_ON : SEGMENT_OFF}`}>{p <= 4 ? `Q${p}` : `P${p - 4}`}</button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-wide text-[var(--c-muted)]">{translate('history.timeoutClock')}</span>
        <input value={clock} onChange={(e) => setClock(e.target.value)} inputMode="numeric" placeholder="MM:SS"
          className={`h-12 w-full rounded-lg bg-[var(--c-card2)] px-4 text-center text-2xl font-black tabular-nums outline-none ring-inset ${valid ? 'focus:ring-2 focus:ring-[var(--c-brand)]' : 'ring-2 ring-[var(--c-danger-fill)]'}`} />
      </label>
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <button onClick={onBack} className={`${BTN} ${SECONDARY} px-5`}>{translate('ft.back')}</button>
        <button disabled={!valid} onClick={() => onSave({ team, period: at, gameClock: seconds! })} className={`${BTN} ${PRIMARY}`}>{translate('history.save')}</button>
      </div>
    </div>
  )
}
